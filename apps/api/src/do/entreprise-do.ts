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
import { MIGRATIONS_DO } from './schema.js';

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
  /** Date de l'opération (ISO 'YYYY-MM-DD'). Défaut : aujourd'hui (heure locale Douala). */
  dateOperation?: string | null;
}

export class EntrepriseDO extends DurableObject {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.sql = ctx.storage.sql;
    // Applique les migrations de schéma versionnées avant toute requête (idempotent).
    ctx.blockConcurrencyWhile(async () => {
      await this.migrer();
    });
  }

  /** Applique les migrations de schéma manquantes selon la version stockée dans ce DO. */
  private async migrer(): Promise<void> {
    const courant = (await this.ctx.storage.get<number>('schema_version')) ?? 0;
    for (const m of MIGRATIONS_DO) {
      if (m.v > courant) {
        for (const stmt of m.statements) this.sql.exec(stmt);
        await this.ctx.storage.put('schema_version', m.v);
      }
    }
  }

  // ── Exercices : année/date locale (Africa/Douala = UTC+1) + création automatique ──
  private anneeCourante(): number {
    return new Date(Date.now() + 3_600_000).getUTCFullYear();
  }
  private dateCourante(): string {
    return new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  }
  /** Retourne l'exercice de l'année donnée, le créant s'il n'existe pas encore (auto N+1). */
  private exercicePourAnnee(annee: number): string {
    const lire = () =>
      this.sql.exec('SELECT id FROM exercice WHERE annee = ?', annee).toArray()[0] as
        | { id: string }
        | undefined;
    let row = lire();
    if (!row) {
      this.sql.exec(
        'INSERT OR IGNORE INTO exercice (id, annee, date_debut, date_fin) VALUES (?, ?, ?, ?)',
        uid(), annee, `${annee}-01-01`, `${annee}-12-31`,
      );
      row = lire();
    }
    return row!.id;
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

  /** Exercice de l'année courante (créé automatiquement si absent) — corrige la casse au 1er janvier. */
  private exerciceOuvert(): string {
    return this.exercicePourAnnee(this.anneeCourante());
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
    // Date d'opération réelle (défaut : aujourd'hui, heure locale) → sélectionne le bon exercice.
    const dateOp = v.dateOperation ?? this.dateCourante();
    const exerciceId = this.exercicePourAnnee(Number(dateOp.slice(0, 4)));
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
       VALUES (?, ?, ?, 'Vente caisse', ?, 'vente', 'brouillon')`,
      ecritureId, exerciceId, dateOp, v.modePaiement,
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
      `INSERT INTO vente (id, exercice_id, date, tiers_id, mode_paiement, total_ht, total_tva, total_ttc,
                          statut, ecriture_id, caissier_id, client_uuid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'payee', ?, ?, ?)`,
      venteId, exerciceId, dateOp, v.tiersId ?? null, v.modePaiement, totalHt, totalTva, totalTtc,
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
           FROM vente WHERE statut = 'payee' AND date(date) = ?`,
        this.dateCourante(),
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

  // ══════════════ Facturation & devis ══════════════
  async creerFacture(f: {
    type: 'facture' | 'devis'; tiersId: string; dateEcheance?: string | null;
    lignes: { designation: string; quantite: number; prixUnitaire: number; tauxTva?: number }[];
  }): Promise<string> {
    if (!f.lignes.length) throw new Error('Facture sans ligne');
    const exerciceId = this.exerciceOuvert();
    let totalHt = 0, totalTva = 0;
    for (const l of f.lignes) {
      const ht = Math.round(l.quantite * l.prixUnitaire);
      totalHt += ht;
      totalTva += Math.round(ht * (l.tauxTva ?? 0));
    }
    const id = uid();
    this.sql.exec(
      `INSERT INTO facture (id, exercice_id, type, tiers_id, date_echeance, statut, total_ht, total_tva, total_ttc)
       VALUES (?, ?, ?, ?, ?, 'brouillon', ?, ?, ?)`,
      id, exerciceId, f.type, f.tiersId, f.dateEcheance ?? null, totalHt, totalTva, totalHt + totalTva,
    );
    let ordre = 0;
    for (const l of f.lignes) {
      this.sql.exec(
        `INSERT INTO ligne_facture (id, facture_id, designation, quantite, prix_unitaire, taux_tva, montant_ht, ordre)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        uid(), id, l.designation, l.quantite, l.prixUnitaire, l.tauxTva ?? 0,
        Math.round(l.quantite * l.prixUnitaire), ordre++,
      );
    }
    return id;
  }

  /** Émet la facture : numéro séquentiel gap-less + (si facture) créance client 411/701. */
  async emettreFacture(factureId: string, prefixe: string): Promise<{ numero: string }> {
    const f = this.sql
      .exec('SELECT type, exercice_id, statut, numero, total_ht, total_tva, total_ttc FROM facture WHERE id = ?', factureId)
      .toArray()[0] as
      | { type: string; exercice_id: string; statut: string; numero: string | null; total_ht: number; total_tva: number; total_ttc: number }
      | undefined;
    if (!f) throw new Error('Facture introuvable');
    if (f.statut !== 'brouillon' && f.numero) return { numero: f.numero };

    // Séquence gap-less (sérialisée par le DO — pas de verrou global).
    const seq = this.sql
      .exec('SELECT dernier_numero FROM sequence_numerotation WHERE exercice_id = ? AND type = ?', f.exercice_id, f.type)
      .toArray()[0] as { dernier_numero: number } | undefined;
    const n = (seq?.dernier_numero ?? 0) + 1;
    this.sql.exec(
      `INSERT INTO sequence_numerotation (exercice_id, type, dernier_numero) VALUES (?, ?, ?)
       ON CONFLICT(exercice_id, type) DO UPDATE SET dernier_numero = ?`,
      f.exercice_id, f.type, n, n,
    );
    const annee = (this.sql.exec('SELECT annee FROM exercice WHERE id = ?', f.exercice_id).toArray()[0] as { annee: number }).annee;
    const numero = `${prefixe}-${f.type === 'facture' ? 'FAC' : 'DEV'}-${annee}-${String(n).padStart(4, '0')}`;
    this.sql.exec(
      "UPDATE facture SET numero = ?, numero_seq = ?, statut = 'envoyee', date_emission = date('now') WHERE id = ?",
      numero, n, factureId,
    );

    // Comptabilisation d'une facture (créance client) — pas pour un devis.
    if (f.type === 'facture' && f.total_ttc > 0) {
      const secteur = (await this.ctx.storage.get<string>('secteur')) ?? 'commerce';
      const compteProduit = secteur === 'service' ? '706' : '701';
      const ecritureId = uid();
      this.sql.exec(
        `INSERT INTO ecriture (id, exercice_id, date_operation, libelle, source, statut, facture_id)
         VALUES (?, ?, date('now'), ?, 'facture', 'brouillon', ?)`,
        ecritureId, f.exercice_id, `Facture ${numero}`, factureId,
      );
      const l = (numero: string, sens: string, m: number) =>
        this.sql.exec('INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?, ?, ?, ?, ?)',
          uid(), ecritureId, this.compteId(numero), sens, m);
      l('411', 'debit', f.total_ttc);
      l(compteProduit, 'credit', f.total_ht);
      if (f.total_tva > 0) l('4431', 'credit', f.total_tva);
      this.sql.exec("UPDATE ecriture SET statut = 'validee' WHERE id = ?", ecritureId);
    }
    return { numero };
  }

  /** Encaisse (total ou partiel) une facture : trésorerie / créance client 411, met à jour le statut. */
  async payerFacture(factureId: string, montant: number, modePaiement: string): Promise<{ statut: string; regle: number }> {
    const f = this.sql.exec('SELECT total_ttc, exercice_id FROM facture WHERE id = ?', factureId)
      .toArray()[0] as { total_ttc: number; exercice_id: string } | undefined;
    if (!f) throw new Error('Facture introuvable');
    const dejaRow = this.sql.exec('SELECT COALESCE(SUM(montant),0) AS p FROM paiement_facture WHERE facture_id = ?', factureId)
      .toArray()[0] as { p: number };
    const regle = dejaRow.p + montant;

    const ecritureId = uid();
    this.sql.exec(
      `INSERT INTO ecriture (id, exercice_id, date_operation, libelle, mode_paiement, source, statut, facture_id)
       VALUES (?, ?, date('now'), 'Encaissement facture', ?, 'facture', 'brouillon', ?)`,
      ecritureId, f.exercice_id, modePaiement, factureId,
    );
    const tresorerie = genererRecette({ montantHT: 0, modePaiement: modePaiement as never, compteProduit: '701', libelle: 'x' }).lignes[0]!.compteNumero;
    this.sql.exec('INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?,?,?,?,?)', uid(), ecritureId, this.compteId(tresorerie), 'debit', montant);
    this.sql.exec('INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?,?,?,?,?)', uid(), ecritureId, this.compteId('411'), 'credit', montant);
    this.sql.exec("UPDATE ecriture SET statut = 'validee' WHERE id = ?", ecritureId);

    this.sql.exec(
      "INSERT INTO paiement_facture (id, facture_id, date, montant, mode_paiement, ecriture_id) VALUES (?, ?, date('now'), ?, ?, ?)",
      uid(), factureId, montant, modePaiement, ecritureId,
    );
    const statut = regle >= f.total_ttc ? 'payee' : 'payee_partiellement';
    this.sql.exec('UPDATE facture SET statut = ? WHERE id = ?', statut, factureId);
    return { statut, regle };
  }

  async listerFactures(): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      `SELECT f.id, f.type, f.numero, f.statut, f.total_ttc, f.date_emission, f.date_echeance, t.nom AS tiers_nom
         FROM facture f LEFT JOIN tiers t ON t.id = f.tiers_id
        ORDER BY f.created_at DESC`,
    ).toArray() as never;
  }

  async getFacture(factureId: string): Promise<Record<string, unknown> | null> {
    const f = this.sql.exec(
      `SELECT f.*, t.nom AS tiers_nom, t.niu AS tiers_niu, t.adresse AS tiers_adresse, t.telephone AS tiers_telephone
         FROM facture f LEFT JOIN tiers t ON t.id = f.tiers_id WHERE f.id = ?`, factureId,
    ).toArray()[0] as Record<string, unknown> | undefined;
    if (!f) return null;
    const lignes = this.sql.exec('SELECT designation, quantite, prix_unitaire, taux_tva, montant_ht FROM ligne_facture WHERE facture_id = ? ORDER BY ordre', factureId).toArray();
    return { ...f, lignes };
  }

  // ══════════════ Commandes / missions ══════════════
  async creerCommande(cmd: {
    type?: 'commande' | 'mission'; tiersId?: string | null; libelle: string;
    montant?: number | null; datePrevue?: string | null;
  }): Promise<string> {
    const id = uid();
    this.sql.exec(
      `INSERT INTO commande (id, type, tiers_id, libelle, montant, date_prevue)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id, cmd.type ?? 'commande', cmd.tiersId ?? null, cmd.libelle,
      cmd.montant ?? null, cmd.datePrevue ?? null,
    );
    return id;
  }

  async listerCommandes(): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      `SELECT c.id, c.type, c.libelle, c.statut, c.montant, c.date_prevue, t.nom AS tiers_nom
         FROM commande c LEFT JOIN tiers t ON t.id = c.tiers_id
        ORDER BY c.created_at DESC`,
    ).toArray() as never;
  }

  async changerStatutCommande(id: string, statut: string): Promise<void> {
    const ok = ['en_attente', 'en_cours', 'livree', 'annulee'];
    if (!ok.includes(statut)) throw new Error('Statut invalide');
    this.sql.exec("UPDATE commande SET statut = ?, updated_at = datetime('now') WHERE id = ?", statut, id);
  }

  /** Nombre de commandes actives (non livrées, non annulées) — pour le tableau de bord. */
  async commandesActives(): Promise<number> {
    const r = this.sql.exec(
      "SELECT COUNT(*) AS n FROM commande WHERE statut IN ('en_attente','en_cours')",
    ).toArray()[0] as { n: number };
    return r.n;
  }

  // ══════════════ États financiers (bilan + compte de résultat) ══════════════
  /**
   * Calcule le compte de résultat et le bilan à partir du grand livre (écritures validées).
   * Convention : solde = débit − crédit (positif = débiteur).
   */
  async etatsFinanciers(): Promise<{
    resultat: { produits: number; charges: number; resultat: number; detailProduits: unknown[]; detailCharges: unknown[] };
    bilan: { actif: unknown[]; passif: unknown[]; totalActif: number; totalPassif: number; equilibre: boolean };
  }> {
    const exerciceId = this.exerciceOuvert();
    const rows = this.sql.exec(
      `SELECT c.numero, c.libelle, c.classe,
              COALESCE(SUM(CASE WHEN e.statut='validee' AND e.exercice_id=? AND l.sens='debit'  THEN l.montant END),0) AS debit,
              COALESCE(SUM(CASE WHEN e.statut='validee' AND e.exercice_id=? AND l.sens='credit' THEN l.montant END),0) AS credit
         FROM compte_comptable c
         LEFT JOIN ligne_ecriture l ON l.compte_id = c.id
         LEFT JOIN ecriture e ON e.id = l.ecriture_id
        GROUP BY c.id
       HAVING debit <> 0 OR credit <> 0
        ORDER BY c.numero`,
      exerciceId, exerciceId,
    ).toArray() as { numero: string; libelle: string; classe: number; debit: number; credit: number }[];

    let produits = 0, charges = 0;
    const detailProduits: unknown[] = [], detailCharges: unknown[] = [];
    const actif: { numero: string; libelle: string; montant: number }[] = [];
    const passif: { numero: string; libelle: string; montant: number }[] = [];

    for (const r of rows) {
      const solde = r.debit - r.credit; // + = débiteur
      const ligne = (montant: number) => ({ numero: r.numero, libelle: r.libelle, montant });
      if (r.classe === 6) { if (solde !== 0) { charges += solde; detailCharges.push(ligne(solde)); } }
      else if (r.classe === 7) { const m = -solde; if (m !== 0) { produits += m; detailProduits.push(ligne(m)); } }
      else if (r.classe === 8) {
        if (solde > 0) { charges += solde; detailCharges.push(ligne(solde)); }
        else if (solde < 0) { produits += -solde; detailProduits.push(ligne(-solde)); }
      } else if (r.classe === 1) { if (solde !== 0) passif.push(ligne(-solde)); }
      else if (r.classe === 2 || r.classe === 3) { if (solde !== 0) actif.push(ligne(solde)); }
      else { // classes 4 et 5 : selon le sens du solde
        if (solde > 0) actif.push(ligne(solde));
        else if (solde < 0) passif.push(ligne(-solde));
      }
    }

    const resultat = produits - charges;
    passif.push({ numero: '13', libelle: "Résultat de l'exercice", montant: resultat });
    const totalActif = actif.reduce((s, l) => s + l.montant, 0);
    const totalPassif = passif.reduce((s, l) => s + l.montant, 0);

    return {
      resultat: { produits, charges, resultat, detailProduits, detailCharges },
      bilan: { actif, passif, totalActif, totalPassif, equilibre: totalActif === totalPassif },
    };
  }

  /** Chiffre d'affaires cumulé de l'exercice (crédits classe 7, écritures validées) — pour l'IGS. */
  async caCumule(): Promise<number> {
    const row = this.sql
      .exec(
        `SELECT COALESCE(SUM(l.montant), 0) AS ca
           FROM ligne_ecriture l
           JOIN compte_comptable c ON c.id = l.compte_id
           JOIN ecriture e ON e.id = l.ecriture_id
          WHERE c.classe = 7 AND l.sens = 'credit' AND e.statut = 'validee' AND e.exercice_id = ?`,
        this.exerciceOuvert(),
      )
      .toArray()[0] as { ca: number };
    return row.ca;
  }
}
