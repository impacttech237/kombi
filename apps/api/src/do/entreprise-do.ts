/**
 * EntrepriseDO — un Durable Object par entreprise, avec son PROPRE SQLite embarqué.
 * Réalise « 1 base par entreprise » (D13). Isolation physique + écritures sérialisées par entreprise.
 * Accédé via env.ENTREPRISE.get(idFromName(entrepriseId)).
 */

import { DurableObject } from 'cloudflare:workers';
import {
  CODES_MODULE,
  MODULES,
  modulesActifsPourSecteur,
  type Secteur,
} from '@kombi/shared';
import { PLAN_COMPTABLE_DEFAUT, genererRecette, cmpApresEntree } from '@kombi/comptable';
import { statementsSchema } from './schema.js';

const uid = () => crypto.randomUUID();

export interface LigneVenteEntree {
  designation: string;
  quantite: number;
  prixUnitaire: number;
  tauxTva?: number;
  produitId?: string | null;
}
export interface VenteEntree {
  lignes: LigneVenteEntree[];
  modePaiement: string;
  tiersId?: string | null;
  caissierId?: string | null;
  clientUuid?: string | null;
}

export class EntrepriseDO extends DurableObject {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.sql = ctx.storage.sql;
    // Crée le schéma dès l'instanciation (idempotent : IF NOT EXISTS).
    ctx.blockConcurrencyWhile(async () => {
      for (const stmt of statementsSchema()) this.sql.exec(stmt);
    });
  }

  /** Initialise l'entreprise : modules du secteur, plan comptable OHADA, exercice. Idempotent. */
  async initialiser(entrepriseId: string, secteur: Secteur, annee: number): Promise<void> {
    const deja = await this.ctx.storage.get<boolean>('initialise');
    if (deja) return;

    const actifs = new Set(modulesActifsPourSecteur(secteur));
    for (const code of CODES_MODULE) {
      const actif = MODULES[code].coeur || actifs.has(code) ? 1 : 0;
      this.sql.exec('INSERT OR IGNORE INTO module (code, actif) VALUES (?, ?)', code, actif);
    }
    for (const c of PLAN_COMPTABLE_DEFAUT) {
      this.sql.exec(
        'INSERT OR IGNORE INTO compte_comptable (id, numero, libelle, classe, type) VALUES (?, ?, ?, ?, ?)',
        uid(), c.numero, c.libelle, c.classe, c.type,
      );
    }
    this.sql.exec(
      'INSERT OR IGNORE INTO exercice (id, annee, date_debut, date_fin) VALUES (?, ?, ?, ?)',
      uid(), annee, `${annee}-01-01`, `${annee}-12-31`,
    );

    await this.ctx.storage.put('entrepriseId', entrepriseId);
    await this.ctx.storage.put('secteur', secteur);
    await this.ctx.storage.put('initialise', true);
  }

  async modules(): Promise<{ code: string; actif: number }[]> {
    return this.sql.exec('SELECT code, actif FROM module ORDER BY code').toArray() as never;
  }

  async moduleActif(code: string): Promise<boolean> {
    const row = this.sql.exec('SELECT actif FROM module WHERE code = ?', code).toArray()[0] as
      | { actif: number }
      | undefined;
    return row?.actif === 1;
  }

  // ── Tiers (exemple d'accès aux données de l'entreprise) ──
  async creerTiers(t: { type: string; nom: string; niu?: string; telephone?: string }): Promise<string> {
    const id = uid();
    this.sql.exec(
      'INSERT INTO tiers (id, type, nom, niu, telephone) VALUES (?, ?, ?, ?, ?)',
      id, t.type, t.nom, t.niu ?? null, t.telephone ?? null,
    );
    return id;
  }

  async listerTiers(): Promise<Record<string, unknown>[]> {
    return this.sql.exec('SELECT * FROM tiers ORDER BY nom').toArray() as never;
  }

  private compteId(numero: string): string {
    const row = this.sql.exec('SELECT id FROM compte_comptable WHERE numero = ?', numero).toArray()[0] as
      | { id: string }
      | undefined;
    if (!row) throw new Error(`Compte ${numero} absent du plan comptable`);
    return row.id;
  }

  private exerciceOuvert(): string {
    const row = this.sql
      .exec("SELECT id FROM exercice WHERE statut = 'ouvert' ORDER BY annee DESC LIMIT 1")
      .toArray()[0] as { id: string } | undefined;
    if (!row) throw new Error('Aucun exercice ouvert');
    return row.id;
  }

  /**
   * Enregistre une vente : crée la vente + ses lignes ET génère automatiquement l'écriture
   * comptable en partie double (débit trésorerie / crédit produit [+ TVA]). Idempotent (clientUuid).
   */
  async enregistrerVente(v: VenteEntree): Promise<{ venteId: string; totalTtc: number; deja: boolean }> {
    if (v.clientUuid) {
      const ex = this.sql
        .exec('SELECT id, total_ttc FROM vente WHERE client_uuid = ?', v.clientUuid)
        .toArray()[0] as { id: string; total_ttc: number } | undefined;
      if (ex) return { venteId: ex.id, totalTtc: ex.total_ttc, deja: true };
    }
    if (!v.lignes.length) throw new Error('Vente sans ligne');

    let totalHt = 0;
    let totalTva = 0;
    let totalCmv = 0; // coût des marchandises vendues (inventaire permanent)
    // Calcule le CMP à sortir pour chaque ligne référençant un produit.
    const calc = v.lignes.map((l) => {
      const ht = Math.round(l.quantite * l.prixUnitaire);
      totalHt += ht;
      totalTva += Math.round(ht * (l.tauxTva ?? 0));
      let coutUnit = 0;
      if (l.produitId) {
        const p = this.sql
          .exec('SELECT stock_actuel, cout_moyen_pondere FROM produit WHERE id = ?', l.produitId)
          .toArray()[0] as { stock_actuel: number; cout_moyen_pondere: number } | undefined;
        if (p) {
          coutUnit = p.cout_moyen_pondere;
          totalCmv += Math.min(l.quantite, p.stock_actuel) * p.cout_moyen_pondere; // non-bloquant
        }
      }
      return { ...l, ht, coutUnit };
    });
    const totalTtc = totalHt + totalTva;
    const exerciceId = this.exerciceOuvert();
    const secteur = (await this.ctx.storage.get<string>('secteur')) ?? 'commerce';
    const compteProduit = secteur === 'service' ? '706' : '701';

    // Écriture partie double : produit de la vente (réutilise le moteur comptable)…
    const ecr = genererRecette({
      montantHT: totalHt, tva: totalTva, modePaiement: v.modePaiement as never,
      compteProduit, libelle: 'Vente caisse',
    });
    const ecritureId = uid();
    this.sql.exec(
      `INSERT INTO ecriture (id, exercice_id, date_operation, libelle, mode_paiement, source, statut)
       VALUES (?, ?, date('now'), 'Vente caisse', ?, 'vente', 'brouillon')`,
      ecritureId, exerciceId, v.modePaiement,
    );
    const insLigne = (numero: string, sens: string, m: number) =>
      this.sql.exec(
        'INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?, ?, ?, ?, ?)',
        uid(), ecritureId, this.compteId(numero), sens, m,
      );
    for (const ligne of ecr.lignes) insLigne(ligne.compteNumero, ligne.sens, ligne.montant);
    // …et coût des marchandises vendues (6031 débit / 311 crédit) si vente sur stock.
    if (totalCmv > 0) {
      insLigne('6031', 'debit', totalCmv);
      insLigne('311', 'credit', totalCmv);
    }
    // Validation : le trigger d'équilibre vérifie débit = crédit.
    this.sql.exec("UPDATE ecriture SET statut = 'validee' WHERE id = ?", ecritureId);

    const venteId = uid();
    this.sql.exec(
      `INSERT INTO vente (id, exercice_id, tiers_id, mode_paiement, total_ht, total_tva, total_ttc,
                          statut, ecriture_id, caissier_id, client_uuid)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'payee', ?, ?, ?)`,
      venteId, exerciceId, v.tiersId ?? null, v.modePaiement, totalHt, totalTva, totalTtc,
      ecritureId, v.caissierId ?? null, v.clientUuid ?? null,
    );
    let ordre = 0;
    for (const l of calc) {
      this.sql.exec(
        `INSERT INTO ligne_vente (id, vente_id, produit_id, designation, quantite, prix_unitaire, taux_tva, montant_ht, cout_unitaire, ordre)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        uid(), venteId, l.produitId ?? null, l.designation, l.quantite, l.prixUnitaire,
        l.tauxTva ?? 0, l.ht, l.coutUnit, ordre++,
      );
      // Sortie de stock (décrémente + mouvement) pour les lignes produit.
      if (l.produitId) {
        this.sql.exec(
          'UPDATE produit SET stock_actuel = MAX(0, stock_actuel - ?) WHERE id = ?',
          l.quantite, l.produitId,
        );
        this.sql.exec(
          `INSERT INTO mouvement_stock (id, produit_id, type, quantite, cout_unitaire, motif, vente_id)
           VALUES (?, ?, 'sortie', ?, ?, 'Vente', ?)`,
          uid(), l.produitId, l.quantite, l.coutUnit, venteId,
        );
      }
    }
    return { venteId, totalTtc, deja: false };
  }

  /** Statistiques d'accueil : ventes du jour + nombre. */
  async statsJour(): Promise<{ nbVentes: number; totalJour: number }> {
    const row = this.sql
      .exec(
        `SELECT COUNT(*) AS n, COALESCE(SUM(total_ttc), 0) AS total
           FROM vente WHERE statut = 'payee' AND date(date) = date('now')`,
      )
      .toArray()[0] as { n: number; total: number };
    return { nbVentes: row.n, totalJour: row.total };
  }

  // ══════════════ Stock (module optionnel) ══════════════
  async creerProduit(p: {
    nom: string; sku?: string | null; prixVente: number; seuilAlerte?: number; unite?: string;
  }): Promise<string> {
    const id = uid();
    this.sql.exec(
      `INSERT INTO produit (id, nom, sku, unite, prix_vente, seuil_alerte) VALUES (?, ?, ?, ?, ?, ?)`,
      id, p.nom, p.sku ?? null, p.unite ?? 'unité', Math.max(0, Math.floor(p.prixVente)),
      Math.max(0, Math.floor(p.seuilAlerte ?? 0)),
    );
    return id;
  }

  async listerProduits(): Promise<Record<string, unknown>[]> {
    return this.sql
      .exec(
        `SELECT id, nom, sku, unite, prix_vente, cout_moyen_pondere, stock_actuel, seuil_alerte,
                (stock_actuel <= seuil_alerte) AS en_alerte
           FROM produit WHERE actif = 1 ORDER BY nom`,
      )
      .toArray() as never;
  }

  /**
   * Approvisionnement (achat) : entrée en stock au coût d'achat, recalcul du CMP (inventaire
   * permanent), mouvement de stock, et écriture comptable (601/trésorerie + 311/6031).
   */
  async entrerStock(a: {
    produitId: string; quantite: number; coutUnitaire: number; modePaiement: string;
    tiersId?: string | null;
  }): Promise<{ nouveauStock: number; nouveauCmp: number }> {
    const prod = this.sql
      .exec('SELECT stock_actuel, cout_moyen_pondere FROM produit WHERE id = ?', a.produitId)
      .toArray()[0] as { stock_actuel: number; cout_moyen_pondere: number } | undefined;
    if (!prod) throw new Error('Produit introuvable');

    const etat = cmpApresEntree(
      { quantite: prod.stock_actuel, cmp: prod.cout_moyen_pondere },
      a.quantite, Math.floor(a.coutUnitaire),
    );
    const montant = a.quantite * Math.floor(a.coutUnitaire);

    this.sql.exec(
      'UPDATE produit SET stock_actuel = ?, cout_moyen_pondere = ? WHERE id = ?',
      etat.quantite, etat.cmp, a.produitId,
    );
    this.sql.exec(
      `INSERT INTO mouvement_stock (id, produit_id, type, quantite, cout_unitaire, motif)
       VALUES (?, ?, 'entree', ?, ?, 'Approvisionnement')`,
      uid(), a.produitId, a.quantite, Math.floor(a.coutUnitaire),
    );

    // Écriture : achat (601) réglé par trésorerie + entrée en stock (311/6031).
    const exerciceId = this.exerciceOuvert();
    const ecritureId = uid();
    const tresorerie = genererRecette({
      montantHT: 0, modePaiement: a.modePaiement as never, compteProduit: '701', libelle: 'x',
    }).lignes[0]!.compteNumero; // récupère le compte de trésorerie du mode
    this.sql.exec(
      `INSERT INTO ecriture (id, exercice_id, date_operation, libelle, mode_paiement, source, statut)
       VALUES (?, ?, date('now'), 'Approvisionnement', ?, 'achat', 'brouillon')`,
      ecritureId, exerciceId, a.modePaiement,
    );
    const l = (numero: string, sens: string, m: number) =>
      this.sql.exec(
        'INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?, ?, ?, ?, ?)',
        uid(), ecritureId, this.compteId(numero), sens, m,
      );
    l('601', 'debit', montant);
    l(tresorerie, 'credit', montant);
    l('311', 'debit', montant);
    l('6031', 'credit', montant);
    this.sql.exec("UPDATE ecriture SET statut = 'validee' WHERE id = ?", ecritureId);

    return { nouveauStock: etat.quantite, nouveauCmp: etat.cmp };
  }

  /** Chiffre d'affaires cumulé de l'exercice (crédits classe 7, écritures validées) — pour l'IGS. */
  async caCumule(): Promise<number> {
    const row = this.sql
      .exec(
        `SELECT COALESCE(SUM(l.montant), 0) AS ca
           FROM ligne_ecriture l
           JOIN compte_comptable c ON c.id = l.compte_id
           JOIN ecriture e ON e.id = l.ecriture_id
          WHERE c.classe = 7 AND l.sens = 'credit' AND e.statut = 'validee'`,
      )
      .toArray()[0] as { ca: number };
    return row.ca;
  }
}
