/**
 * EntrepriseDO — un Durable Object par entreprise, avec son PROPRE SQLite embarqué.
 * Réalise « 1 base par entreprise » (D13). Isolation physique + écritures sérialisées par entreprise.
 * Accédé via env.ENTREPRISE.get(idFromName(entrepriseId)).
 */

import { DurableObject } from 'cloudflare:workers';
import { createHash } from 'node:crypto';
import {
  CODES_MODULE,
  MODULES,
  modulesActifsPourSecteur,
  type Secteur,
} from '@kombi/shared';
import { PLAN_COMPTABLE_DEFAUT, genererRecette, genererDepense, cmpApresEntree } from '@kombi/comptable';
import { MIGRATIONS_DO } from './schema.js';

const uid = () => crypto.randomUUID();

/** Auteur d'une opération auditée (posé par les middlewares auth/tenant côté Worker). */
export interface Acteur {
  utilisateurId: string;
  role: string;
}

export interface LigneVenteEntree {
  designation: string;
  quantite: number;
  prixUnitaire: number;
  tauxTva?: number;
  produitId?: string | null;
}
export interface VenteEntree {
  lignes: LigneVenteEntree[];
  /** Requis sauf si `aCredit` (rien n'est encaissé tout de suite). */
  modePaiement?: string | null;
  /** Vente à crédit : débit 411 (créance client) au lieu de la trésorerie. Requiert `tiersId`. */
  aCredit?: boolean;
  tiersId?: string | null;
  caissierId?: string | null;
  clientUuid?: string | null;
  /** Date de l'opération (ISO 'YYYY-MM-DD'). Défaut : aujourd'hui (heure locale Douala). */
  dateOperation?: string | null;
  /** Régime fiscal courant de l'entreprise (lu en D1 par la route) — la TVA est interdite à l'IGS. */
  regimeFiscal?: string | null;
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

  // ── Journal d'audit immuable (append-only, chaîné par hash — voir schema.ts v4) ──
  private dernierHashAudit(): string {
    const row = this.sql.exec('SELECT hash FROM audit_log ORDER BY rowid DESC LIMIT 1').toArray()[0] as
      | { hash: string }
      | undefined;
    return row?.hash ?? '0'.repeat(64); // hash « genèse » quand la chaîne est vide
  }

  /**
   * Journalise une action métier. À appeler DANS la même transaction (transactionSync) que
   * l'opération qu'elle trace, pour que la ligne d'audit et l'opération réussissent ou échouent
   * ensemble. `hash = sha256(hash_precedent + payload)` : toute altération rétroactive d'une
   * ligne casserait la chaîne pour toutes les lignes suivantes (voir verifierChaineAudit).
   */
  private journaliser(e: {
    acteur: Acteur; action: string; entite?: string; entiteId?: string;
    avant?: unknown; apres?: unknown;
  }): void {
    const hashPrecedent = this.dernierHashAudit();
    const avantJson = e.avant !== undefined ? JSON.stringify(e.avant) : null;
    const apresJson = e.apres !== undefined ? JSON.stringify(e.apres) : null;
    const payload = [
      e.acteur.utilisateurId, e.acteur.role, e.action, e.entite ?? '', e.entiteId ?? '',
      avantJson ?? '', apresJson ?? '',
    ].join('|');
    const hash = createHash('sha256').update(hashPrecedent + payload).digest('hex');

    this.sql.exec(
      `INSERT INTO audit_log (id, utilisateur_id, role, action, entite, entite_id, avant_json, apres_json, hash_precedent, hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      uid(), e.acteur.utilisateurId, e.acteur.role, e.action, e.entite ?? null, e.entiteId ?? null,
      avantJson, apresJson, hashPrecedent, hash,
    );
  }

  /** Liste le journal d'audit, le plus récent en premier (consultation). */
  async listerAuditLog(): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      `SELECT id, ts, utilisateur_id, role, action, entite, entite_id, avant_json, apres_json
         FROM audit_log ORDER BY rowid DESC`,
    ).toArray() as never;
  }

  /** Recalcule la chaîne de hash et signale la première rupture (preuve d'intégrité). */
  async verifierChaineAudit(): Promise<{ valide: boolean; casseeA: string | null; nbLignes: number }> {
    const lignes = this.sql.exec(
      `SELECT id, utilisateur_id, role, action, entite, entite_id, avant_json, apres_json, hash_precedent, hash
         FROM audit_log ORDER BY rowid ASC`,
    ).toArray() as {
      id: string; utilisateur_id: string; role: string; action: string; entite: string | null;
      entite_id: string | null; avant_json: string | null; apres_json: string | null;
      hash_precedent: string; hash: string;
    }[];

    let attendu = '0'.repeat(64);
    for (const l of lignes) {
      const payload = [
        l.utilisateur_id, l.role, l.action, l.entite ?? '', l.entite_id ?? '',
        l.avant_json ?? '', l.apres_json ?? '',
      ].join('|');
      const hash = createHash('sha256').update(attendu + payload).digest('hex');
      if (l.hash_precedent !== attendu || l.hash !== hash) {
        return { valide: false, casseeA: l.id, nbLignes: lignes.length };
      }
      attendu = hash;
    }
    return { valide: true, casseeA: null, nbLignes: lignes.length };
  }

  /** Vérifie que le journal d'audit est bien immuable (triggers SQL). Utilisé par les tests. */
  async _verifierImmuabiliteAudit(auditId: string): Promise<{ updateBloque: boolean; deleteBloque: boolean }> {
    let updateBloque = false;
    try {
      this.sql.exec("UPDATE audit_log SET action = 'falsifie' WHERE id = ?", auditId);
    } catch {
      updateBloque = true;
    }
    let deleteBloque = false;
    try {
      this.sql.exec('DELETE FROM audit_log WHERE id = ?', auditId);
    } catch {
      deleteBloque = true;
    }
    return { updateBloque, deleteBloque };
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

  /** TVA interdite au régime IGS (CGI Art. 142 — l'IGS est un régime forfaitaire sans TVA). */
  private verifierTvaAutorisee(regimeFiscal: string | null | undefined, taux: readonly (number | undefined)[]): void {
    if (regimeFiscal === 'igs' && taux.some((t) => (t ?? 0) > 0)) {
      throw new Error('La TVA est interdite au régime IGS (CGI Art. 142)');
    }
  }

  /** Compte de TVA collectée : 4431 (vente de biens) ou 4432 (prestations de services). */
  private compteTvaCollectee(secteur: string): string {
    return secteur === 'service' ? '4432' : '4431';
  }

  /** Exercice de l'année courante (créé automatiquement si absent) — corrige la casse au 1er janvier. */
  private exerciceOuvert(): string {
    return this.exercicePourAnnee(this.anneeCourante());
  }

  /**
   * Enregistre une vente : crée la vente + ses lignes ET génère automatiquement l'écriture
   * comptable en partie double (débit trésorerie / crédit produit [+ TVA]). Idempotent (clientUuid).
   */
  async enregistrerVente(
    v: VenteEntree, acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' },
  ): Promise<{ venteId: string; totalTtc: number; deja: boolean; enSurvente: boolean }> {
    if (v.clientUuid) {
      const ex = this.sql
        .exec('SELECT id, total_ttc FROM vente WHERE client_uuid = ?', v.clientUuid)
        .toArray()[0] as { id: string; total_ttc: number } | undefined;
      if (ex) return { venteId: ex.id, totalTtc: ex.total_ttc, deja: true, enSurvente: false };
    }
    if (!v.lignes.length) throw new Error('Vente sans ligne');
    if (v.aCredit && !v.tiersId) throw new Error('Un client est requis pour une vente à crédit');
    if (!v.aCredit && !v.modePaiement) throw new Error('Mode de paiement requis');
    this.verifierTvaAutorisee(v.regimeFiscal, v.lignes.map((l) => l.tauxTva));
    // Lecture async AVANT la transaction (transactionSync exige un callback 100% synchrone).
    const secteur = (await this.ctx.storage.get<string>('secteur')) ?? 'commerce';

    // Toutes les écritures multi-tables (écriture + vente + lignes + mouvements de stock)
    // sont atomiques : en cas d'erreur, tout est annulé (aucune écriture partielle).
    return this.ctx.storage.transactionSync(() => {
      let totalHt = 0;
      let totalTva = 0;
      let totalCmv = 0; // coût des marchandises vendues (inventaire permanent)
      let enSurvente = false;
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
            // Non bloquant (spec §4 : « bloquer ou tracer la sur-vente ») — le terrain ne doit
            // jamais être bloqué en caisse. Mais on trace : le CMV est valorisé sur la quantité
            // RÉELLEMENT vendue (jamais tronquée au stock affiché), sinon le coût et donc la marge
            // seraient silencieusement sous-évalués pour la partie vendue au-delà du stock connu.
            if (l.quantite > p.stock_actuel) enSurvente = true;
            totalCmv += l.quantite * p.cout_moyen_pondere;
          }
        }
        return { ...l, ht, coutUnit };
      });
      const totalTtc = totalHt + totalTva;
      // Date d'opération réelle (défaut : aujourd'hui, heure locale) → sélectionne le bon exercice.
      const dateOp = v.dateOperation ?? this.dateCourante();
      const exerciceId = this.exercicePourAnnee(Number(dateOp.slice(0, 4)));
      const compteProduit = secteur === 'service' ? '706' : '701';

      // Écriture partie double : produit de la vente. Au comptant (réutilise le moteur comptable) —
      // débit trésorerie / crédit produit. À crédit — débit créance client (411) / crédit produit,
      // exactement comme une facture émise (voir emettreFacture).
      const compteTva = this.compteTvaCollectee(secteur);
      const ecr = v.aCredit
        ? {
            lignes: [
              { compteNumero: '411', sens: 'debit' as const, montant: totalTtc },
              { compteNumero: compteProduit, sens: 'credit' as const, montant: totalHt },
              ...(totalTva > 0 ? [{ compteNumero: compteTva, sens: 'credit' as const, montant: totalTva }] : []),
            ],
          }
        : genererRecette({
            montantHT: totalHt, tva: totalTva, modePaiement: v.modePaiement as never,
            compteProduit, compteTvaCollectee: compteTva, libelle: 'Vente caisse',
          });
      const ecritureId = uid();
      this.sql.exec(
        `INSERT INTO ecriture (id, exercice_id, date_operation, libelle, mode_paiement, source, statut)
         VALUES (?, ?, ?, 'Vente caisse', ?, 'vente', 'brouillon')`,
        ecritureId, exerciceId, dateOp, v.aCredit ? null : v.modePaiement,
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        venteId, exerciceId, dateOp, v.tiersId ?? null, v.aCredit ? null : v.modePaiement, totalHt, totalTva, totalTtc,
        v.aCredit ? 'a_credit' : 'payee', ecritureId, v.caissierId ?? null, v.clientUuid ?? null,
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
      this.journaliser({
        acteur, action: v.aCredit ? 'vente.credit' : 'vente.enregistrer', entite: 'vente', entiteId: venteId,
        apres: {
          totalTtc, modePaiement: v.aCredit ? null : v.modePaiement, aCredit: !!v.aCredit,
          nbLignes: calc.length, enSurvente,
        },
      });
      return { venteId, totalTtc, deja: false, enSurvente };
    });
  }

  /** Encaisse (total ou partiel) une vente à crédit : trésorerie / créance client 411. */
  async payerVente(
    venteId: string, montant: number, modePaiement: string,
    acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' },
  ): Promise<{ statut: string; regle: number }> {
    const vente = this.sql.exec('SELECT total_ttc, exercice_id, statut FROM vente WHERE id = ?', venteId)
      .toArray()[0] as { total_ttc: number; exercice_id: string; statut: string } | undefined;
    if (!vente) throw new Error('Vente introuvable');
    if (vente.statut !== 'a_credit' && vente.statut !== 'payee_partiellement') {
      throw new Error('Cette vente n\'attend pas de règlement');
    }

    return this.ctx.storage.transactionSync(() => {
      const dejaRow = this.sql.exec('SELECT COALESCE(SUM(montant),0) AS p FROM paiement_vente WHERE vente_id = ?', venteId)
        .toArray()[0] as { p: number };
      const regle = dejaRow.p + montant;

      const ecritureId = uid();
      this.sql.exec(
        `INSERT INTO ecriture (id, exercice_id, date_operation, libelle, mode_paiement, source, statut, vente_id)
         VALUES (?, ?, date('now'), 'Encaissement vente à crédit', ?, 'vente', 'brouillon', ?)`,
        ecritureId, vente.exercice_id, modePaiement, venteId,
      );
      const tresorerie = genererRecette({ montantHT: 0, modePaiement: modePaiement as never, compteProduit: '701', libelle: 'x' }).lignes[0]!.compteNumero;
      this.sql.exec('INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?,?,?,?,?)', uid(), ecritureId, this.compteId(tresorerie), 'debit', montant);
      this.sql.exec('INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?,?,?,?,?)', uid(), ecritureId, this.compteId('411'), 'credit', montant);
      this.sql.exec("UPDATE ecriture SET statut = 'validee' WHERE id = ?", ecritureId);

      this.sql.exec(
        "INSERT INTO paiement_vente (id, vente_id, date, montant, mode_paiement, ecriture_id) VALUES (?, ?, date('now'), ?, ?, ?)",
        uid(), venteId, montant, modePaiement, ecritureId,
      );
      const statut = regle >= vente.total_ttc ? 'payee' : 'payee_partiellement';
      this.sql.exec('UPDATE vente SET statut = ? WHERE id = ?', statut, venteId);
      this.journaliser({
        acteur, action: 'vente.payer', entite: 'vente', entiteId: venteId,
        apres: { montant, modePaiement, statut, regle },
      });
      return { statut, regle };
    });
  }

  /** Ventes à crédit non soldées (« on me doit ») — pour l'écran créances. */
  async listerVentesACredit(): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      `SELECT v.id, v.date, v.total_ttc, v.statut, t.nom AS tiers_nom,
              COALESCE((SELECT SUM(montant) FROM paiement_vente WHERE vente_id = v.id), 0) AS regle
         FROM vente v LEFT JOIN tiers t ON t.id = v.tiers_id
        WHERE v.statut IN ('a_credit', 'payee_partiellement')
        ORDER BY v.date ASC`,
    ).toArray() as never;
  }

  /** Historique des ventes récentes (écran caisse — pour retrouver une vente à annuler). */
  async listerVentesRecentes(limite = 50): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      `SELECT v.id, v.date, v.total_ttc, v.statut, v.mode_paiement, v.facture_id, t.nom AS tiers_nom
         FROM vente v LEFT JOIN tiers t ON t.id = v.tiers_id
        ORDER BY v.created_at DESC LIMIT ?`,
      limite,
    ).toArray() as never;
  }

  /**
   * Annule une vente déjà enregistrée (erreur de caisse, retour client) SANS supprimer l'écriture
   * (immuabilité) — contre-passation intégrale de toutes les lignes de l'écriture d'origine
   * (produit, TVA, créance/trésorerie, CMV/stock), symétrique de `creerAvoir()`. Remet la
   * marchandise en stock au coût auquel elle en était sortie. Impossible si une facture a déjà été
   * émise pour cette vente (il faut d'abord annuler la facture via un avoir).
   */
  async annulerVente(
    venteId: string, acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' },
  ): Promise<{ statut: string }> {
    const v = this.sql.exec(
      'SELECT statut, exercice_id, ecriture_id, facture_id FROM vente WHERE id = ?', venteId,
    ).toArray()[0] as { statut: string; exercice_id: string; ecriture_id: string | null; facture_id: string | null } | undefined;
    if (!v) throw new Error('Vente introuvable');
    if (v.statut === 'annulee') throw new Error('Cette vente est déjà annulée');
    if (v.facture_id) throw new Error('Une facture a été émise pour cette vente : annulez-la (avoir) d\'abord');
    if (!v.ecriture_id) throw new Error('Aucune écriture associée à cette vente');

    const lignesOrigine = this.sql.exec(
      `SELECT le.compte_id, le.sens, le.montant FROM ligne_ecriture le WHERE le.ecriture_id = ?`,
      v.ecriture_id,
    ).toArray() as { compte_id: string; sens: string; montant: number }[];
    if (!lignesOrigine.length) throw new Error('Écriture d\'origine sans ligne');

    const lignesVente = this.sql.exec(
      'SELECT produit_id, quantite, cout_unitaire FROM ligne_vente WHERE vente_id = ?', venteId,
    ).toArray() as { produit_id: string | null; quantite: number; cout_unitaire: number }[];

    return this.ctx.storage.transactionSync(() => {
      const ecritureId = uid();
      this.sql.exec(
        `INSERT INTO ecriture (id, exercice_id, date_operation, libelle, source, statut)
         VALUES (?, ?, date('now'), 'Annulation vente', 'vente', 'brouillon')`,
        ecritureId, v.exercice_id,
      );
      for (const l of lignesOrigine) {
        this.sql.exec(
          'INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?, ?, ?, ?, ?)',
          uid(), ecritureId, l.compte_id, l.sens === 'debit' ? 'credit' : 'debit', l.montant,
        );
      }
      this.sql.exec("UPDATE ecriture SET statut = 'validee' WHERE id = ?", ecritureId);

      // Remise en stock au coût de sortie d'origine (recalcule le CMP comme une entrée normale).
      for (const l of lignesVente) {
        if (!l.produit_id) continue;
        const prod = this.sql.exec(
          'SELECT stock_actuel, cout_moyen_pondere FROM produit WHERE id = ?', l.produit_id,
        ).toArray()[0] as { stock_actuel: number; cout_moyen_pondere: number } | undefined;
        if (!prod) continue;
        const etat = cmpApresEntree(
          { quantite: prod.stock_actuel, cmp: prod.cout_moyen_pondere }, l.quantite, l.cout_unitaire,
        );
        this.sql.exec(
          'UPDATE produit SET stock_actuel = ?, cout_moyen_pondere = ? WHERE id = ?',
          etat.quantite, etat.cmp, l.produit_id,
        );
        this.sql.exec(
          `INSERT INTO mouvement_stock (id, produit_id, type, quantite, cout_unitaire, motif, vente_id)
           VALUES (?, ?, 'entree', ?, ?, 'Annulation vente', ?)`,
          uid(), l.produit_id, l.quantite, l.cout_unitaire, venteId,
        );
      }

      this.sql.exec("UPDATE vente SET statut = 'annulee' WHERE id = ?", venteId);
      this.journaliser({
        acteur, action: 'vente.annuler', entite: 'vente', entiteId: venteId,
        avant: { statut: v.statut }, apres: { statut: 'annulee' },
      });
      return { statut: 'annulee' };
    });
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

  /**
   * Tendance des 7 derniers jours (ventes payées, comptant + soldé à crédit ce jour-là) — pour un
   * vrai graphe de tableau de bord, plus une donnée décorative statique.
   */
  async tendance7Jours(): Promise<{ jour: string; total: number }[]> {
    const auj = new Date(Date.parse(this.dateCourante()) || Date.now());
    const jours: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(auj);
      d.setUTCDate(d.getUTCDate() - i);
      jours.push(d.toISOString().slice(0, 10));
    }
    const rows = this.sql.exec(
      `SELECT date(date) AS jour, COALESCE(SUM(total_ttc), 0) AS total
         FROM vente WHERE statut = 'payee' AND date(date) >= ?
        GROUP BY date(date)`,
      jours[0],
    ).toArray() as { jour: string; total: number }[];
    const parJour = new Map(rows.map((r) => [r.jour, r.total]));
    return jours.map((j) => ({ jour: j, total: parJour.get(j) ?? 0 }));
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
                (stock_actuel <= seuil_alerte) AS en_alerte, (stock_actuel <= 0) AS en_rupture
           FROM produit WHERE actif = 1 ORDER BY nom`,
      )
      .toArray() as never;
  }

  /**
   * Approvisionnement (achat) : entrée en stock au coût d'achat, recalcul du CMP (inventaire
   * permanent), mouvement de stock, et écriture comptable (601/trésorerie + 311/6031).
   * À crédit (`aCredit`) : crédite la dette fournisseur (401) au lieu de la trésorerie — exactement
   * symétrique de la vente à crédit — et enregistre un `achat_fournisseur` pour le suivi des dettes.
   */
  async entrerStock(a: {
    produitId: string; quantite: number; coutUnitaire: number; modePaiement?: string | null;
    aCredit?: boolean; tiersId?: string | null; tauxTva?: number; regimeFiscal?: string | null;
    dateOperation?: string | null;
  }, acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' }): Promise<{ nouveauStock: number; nouveauCmp: number }> {
    const prod = this.sql
      .exec('SELECT stock_actuel, cout_moyen_pondere FROM produit WHERE id = ?', a.produitId)
      .toArray()[0] as { stock_actuel: number; cout_moyen_pondere: number } | undefined;
    if (!prod) throw new Error('Produit introuvable');
    if (a.aCredit && !a.tiersId) throw new Error('Un fournisseur est requis pour un achat à crédit');
    if (!a.aCredit && !a.modePaiement) throw new Error('Mode de paiement requis');
    this.verifierTvaAutorisee(a.regimeFiscal, [a.tauxTva]);

    // Date d'opération réelle (défaut : aujourd'hui, heure locale) → sélectionne le bon exercice.
    const dateOp = a.dateOperation ?? this.dateCourante();
    const exerciceId = this.exercicePourAnnee(Number(dateOp.slice(0, 4)));

    return this.ctx.storage.transactionSync(() => {
      const etat = cmpApresEntree(
        { quantite: prod.stock_actuel, cmp: prod.cout_moyen_pondere },
        a.quantite, Math.floor(a.coutUnitaire),
      );
      // Le stock est valorisé HT (la TVA récupérable n'est pas un coût — 4452 la neutralise).
      const montantHt = a.quantite * Math.floor(a.coutUnitaire);
      const montantTva = Math.round(montantHt * (a.tauxTva ?? 0));
      const montantRegle = montantHt + montantTva;

      this.sql.exec(
        'UPDATE produit SET stock_actuel = ?, cout_moyen_pondere = ? WHERE id = ?',
        etat.quantite, etat.cmp, a.produitId,
      );
      this.sql.exec(
        `INSERT INTO mouvement_stock (id, produit_id, type, quantite, cout_unitaire, motif)
         VALUES (?, ?, 'entree', ?, ?, 'Approvisionnement')`,
        uid(), a.produitId, a.quantite, Math.floor(a.coutUnitaire),
      );

      // Écriture : achat (601) [+ TVA récupérable 4452] réglé par trésorerie, ou par dette
      // fournisseur (401) si à crédit, + entrée en stock (311/6031, valorisée HT).
      const ecritureId = uid();
      const compteContrepartie = a.aCredit
        ? '401'
        : genererRecette({
            montantHT: 0, modePaiement: a.modePaiement as never, compteProduit: '701', libelle: 'x',
          }).lignes[0]!.compteNumero; // récupère le compte de trésorerie du mode
      this.sql.exec(
        `INSERT INTO ecriture (id, exercice_id, date_operation, libelle, mode_paiement, source, statut)
         VALUES (?, ?, ?, 'Approvisionnement', ?, 'achat', 'brouillon')`,
        ecritureId, exerciceId, dateOp, a.aCredit ? null : a.modePaiement,
      );
      const l = (numero: string, sens: string, m: number) =>
        this.sql.exec(
          'INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?, ?, ?, ?, ?)',
          uid(), ecritureId, this.compteId(numero), sens, m,
        );
      l('601', 'debit', montantHt);
      if (montantTva > 0) l('4452', 'debit', montantTva);
      l(compteContrepartie, 'credit', montantRegle);
      l('311', 'debit', montantHt);
      l('6031', 'credit', montantHt);
      this.sql.exec("UPDATE ecriture SET statut = 'validee' WHERE id = ?", ecritureId);

      // Achat à crédit : trace la dette fournisseur (montant dû, suivi dans « ce que je dois »).
      let achatId: string | null = null;
      if (a.aCredit) {
        achatId = uid();
        this.sql.exec(
          `INSERT INTO achat_fournisseur (id, exercice_id, tiers_id, date, total_ht, total_tva, total_ttc, statut, ecriture_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'a_credit', ?)`,
          achatId, exerciceId, a.tiersId, dateOp, montantHt, montantTva, montantRegle, ecritureId,
        );
        this.sql.exec(
          `INSERT INTO ligne_achat (id, achat_id, produit_id, quantite, cout_unitaire, montant_ht)
           VALUES (?, ?, ?, ?, ?, ?)`,
          uid(), achatId, a.produitId, a.quantite, Math.floor(a.coutUnitaire), montantHt,
        );
      }

      this.journaliser({
        acteur, action: a.aCredit ? 'achat.credit' : 'stock.entree', entite: 'produit', entiteId: a.produitId,
        avant: { stock: prod.stock_actuel, cmp: prod.cout_moyen_pondere },
        apres: { stock: etat.quantite, cmp: etat.cmp, quantiteEntree: a.quantite, aCredit: !!a.aCredit, achatId },
      });
      return { nouveauStock: etat.quantite, nouveauCmp: etat.cmp };
    });
  }

  /**
   * Ajustement d'inventaire (casse, vol, écart constaté) : corrige le stock physique sans passer
   * par une vente ou un achat. Valorisé au CMP courant (le CMP lui-même n'est pas recalculé — un
   * écart n'est pas une nouvelle entrée à un coût différent). Écriture symétrique de l'inventaire
   * permanent (`docs/reference/08-stock-inventaire-permanent.md`) : perte (delta < 0) = débit 6031
   * / crédit 311, comme une sortie sans vente ; surplus (delta > 0) = débit 311 / crédit 6031,
   * comme une entrée sans achat. Le compte précis pour ce cas (6031 vs 658) reste « à valider
   * ONECCA » selon la doc de référence — 6031 retenu par cohérence avec le mécanisme déjà en place.
   */
  async ajusterStock(
    a: { produitId: string; delta: number; motif: string },
    acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' },
  ): Promise<{ nouveauStock: number }> {
    if (!Number.isInteger(a.delta) || a.delta === 0) throw new Error('Écart d\'ajustement invalide');
    const prod = this.sql
      .exec('SELECT stock_actuel, cout_moyen_pondere FROM produit WHERE id = ?', a.produitId)
      .toArray()[0] as { stock_actuel: number; cout_moyen_pondere: number } | undefined;
    if (!prod) throw new Error('Produit introuvable');
    const nouveauStock = Math.max(0, prod.stock_actuel + a.delta);
    const quantiteReelle = nouveauStock - prod.stock_actuel; // clampée à 0, peut différer du delta demandé
    if (quantiteReelle === 0) throw new Error('Le stock est déjà à 0 : rien à retirer');
    const montant = Math.abs(quantiteReelle) * prod.cout_moyen_pondere;

    return this.ctx.storage.transactionSync(() => {
      this.sql.exec('UPDATE produit SET stock_actuel = ? WHERE id = ?', nouveauStock, a.produitId);
      this.sql.exec(
        `INSERT INTO mouvement_stock (id, produit_id, type, quantite, cout_unitaire, motif)
         VALUES (?, ?, 'ajustement', ?, ?, ?)`,
        uid(), a.produitId, Math.abs(quantiteReelle), prod.cout_moyen_pondere, a.motif,
      );
      if (montant > 0) {
        const exerciceId = this.exerciceOuvert();
        const ecritureId = uid();
        this.sql.exec(
          `INSERT INTO ecriture (id, exercice_id, date_operation, libelle, source, statut)
           VALUES (?, ?, date('now'), ?, 'manuelle', 'brouillon')`,
          ecritureId, exerciceId, `Ajustement stock : ${a.motif}`,
        );
        const l = (numero: string, sens: string, m: number) =>
          this.sql.exec('INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?, ?, ?, ?, ?)',
            uid(), ecritureId, this.compteId(numero), sens, m);
        if (quantiteReelle < 0) { l('6031', 'debit', montant); l('311', 'credit', montant); }
        else { l('311', 'debit', montant); l('6031', 'credit', montant); }
        this.sql.exec("UPDATE ecriture SET statut = 'validee' WHERE id = ?", ecritureId);
      }
      this.journaliser({
        acteur, action: 'stock.ajuster', entite: 'produit', entiteId: a.produitId,
        avant: { stock: prod.stock_actuel }, apres: { stock: nouveauStock, delta: quantiteReelle, motif: a.motif },
      });
      return { nouveauStock };
    });
  }

  /** Encaisse (total ou partiel) une dette fournisseur : dette 401 débitée / trésorerie créditée. */
  async payerAchat(
    achatId: string, montant: number, modePaiement: string,
    acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' },
  ): Promise<{ statut: string; regle: number }> {
    const achat = this.sql.exec('SELECT total_ttc, exercice_id, statut FROM achat_fournisseur WHERE id = ?', achatId)
      .toArray()[0] as { total_ttc: number; exercice_id: string; statut: string } | undefined;
    if (!achat) throw new Error('Achat introuvable');
    if (achat.statut !== 'a_credit' && achat.statut !== 'payee_partiellement') {
      throw new Error('Cet achat n\'attend pas de règlement');
    }

    return this.ctx.storage.transactionSync(() => {
      const dejaRow = this.sql.exec('SELECT COALESCE(SUM(montant),0) AS p FROM paiement_achat WHERE achat_id = ?', achatId)
        .toArray()[0] as { p: number };
      const regle = dejaRow.p + montant;

      const ecritureId = uid();
      this.sql.exec(
        `INSERT INTO ecriture (id, exercice_id, date_operation, libelle, mode_paiement, source, statut)
         VALUES (?, ?, date('now'), 'Règlement fournisseur', ?, 'achat', 'brouillon')`,
        ecritureId, achat.exercice_id, modePaiement,
      );
      const tresorerie = genererRecette({ montantHT: 0, modePaiement: modePaiement as never, compteProduit: '701', libelle: 'x' }).lignes[0]!.compteNumero;
      this.sql.exec('INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?,?,?,?,?)', uid(), ecritureId, this.compteId('401'), 'debit', montant);
      this.sql.exec('INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?,?,?,?,?)', uid(), ecritureId, this.compteId(tresorerie), 'credit', montant);
      this.sql.exec("UPDATE ecriture SET statut = 'validee' WHERE id = ?", ecritureId);

      this.sql.exec(
        "INSERT INTO paiement_achat (id, achat_id, date, montant, mode_paiement, ecriture_id) VALUES (?, ?, date('now'), ?, ?, ?)",
        uid(), achatId, montant, modePaiement, ecritureId,
      );
      const statut = regle >= achat.total_ttc ? 'regle' : 'payee_partiellement';
      this.sql.exec('UPDATE achat_fournisseur SET statut = ? WHERE id = ?', statut, achatId);
      this.journaliser({
        acteur, action: 'achat.payer', entite: 'achat_fournisseur', entiteId: achatId,
        apres: { montant, modePaiement, statut, regle },
      });
      return { statut, regle };
    });
  }

  /** Dettes fournisseurs non soldées (« ce que je dois »). */
  async listerDettesFournisseurs(): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      `SELECT a.id, a.date, a.total_ttc, a.statut, t.nom AS tiers_nom,
              COALESCE((SELECT SUM(montant) FROM paiement_achat WHERE achat_id = a.id), 0) AS regle
         FROM achat_fournisseur a LEFT JOIN tiers t ON t.id = a.tiers_id
        WHERE a.statut IN ('a_credit', 'payee_partiellement')
        ORDER BY a.date ASC`,
    ).toArray() as never;
  }

  // ══════════════ Facturation & devis ══════════════
  async creerFacture(f: {
    type: 'facture' | 'devis'; tiersId: string; dateEcheance?: string | null;
    lignes: { designation: string; quantite: number; prixUnitaire: number; tauxTva?: number }[];
    regimeFiscal?: string | null;
  }): Promise<string> {
    if (!f.lignes.length) throw new Error('Facture sans ligne');
    this.verifierTvaAutorisee(f.regimeFiscal, f.lignes.map((l) => l.tauxTva));
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

  /**
   * Convertit un devis en facture : crée une NOUVELLE facture (brouillon, sa propre numérotation
   * FAC-xxx à l'émission) à partir des lignes du devis, liée via `facture.devis_id`. Le devis
   * d'origine n'est ni modifié ni supprimé (il garde son éventuel numéro DEV-xxx) — un devis
   * n'est jamais comptabilisé, contrairement à la facture qui en résulte. Un seul devis ne peut
   * être converti qu'une fois.
   */
  async convertirDevisEnFacture(devisId: string): Promise<string> {
    const devis = this.sql.exec(
      'SELECT type, exercice_id, tiers_id, date_echeance FROM facture WHERE id = ?', devisId,
    ).toArray()[0] as { type: string; exercice_id: string; tiers_id: string; date_echeance: string | null } | undefined;
    if (!devis) throw new Error('Devis introuvable');
    if (devis.type !== 'devis') throw new Error('Seul un devis peut être converti en facture');
    const dejaConverti = this.sql.exec('SELECT 1 FROM facture WHERE devis_id = ?', devisId).toArray()[0];
    if (dejaConverti) throw new Error('Ce devis a déjà été converti en facture');

    const lignes = this.sql.exec(
      'SELECT designation, quantite, prix_unitaire, taux_tva FROM ligne_facture WHERE facture_id = ? ORDER BY ordre',
      devisId,
    ).toArray() as { designation: string; quantite: number; prix_unitaire: number; taux_tva: number }[];
    if (!lignes.length) throw new Error('Devis sans ligne');

    let totalHt = 0, totalTva = 0;
    for (const l of lignes) {
      const ht = Math.round(l.quantite * l.prix_unitaire);
      totalHt += ht;
      totalTva += Math.round(ht * l.taux_tva);
    }
    const id = uid();
    this.sql.exec(
      `INSERT INTO facture (id, exercice_id, type, tiers_id, date_echeance, statut, total_ht, total_tva, total_ttc, devis_id)
       VALUES (?, ?, 'facture', ?, ?, 'brouillon', ?, ?, ?, ?)`,
      id, devis.exercice_id, devis.tiers_id, devis.date_echeance, totalHt, totalTva, totalHt + totalTva, devisId,
    );
    let ordre = 0;
    for (const l of lignes) {
      this.sql.exec(
        `INSERT INTO ligne_facture (id, facture_id, designation, quantite, prix_unitaire, taux_tva, montant_ht, ordre)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        uid(), id, l.designation, l.quantite, l.prix_unitaire, l.taux_tva,
        Math.round(l.quantite * l.prix_unitaire), ordre++,
      );
    }
    return id;
  }

  /** Émet la facture : numéro séquentiel gap-less + (si facture) créance client 411/701. */
  async emettreFacture(
    factureId: string, prefixe: string, acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' },
    assujettiTva = false,
  ): Promise<{ numero: string }> {
    const f = this.sql
      .exec('SELECT type, exercice_id, statut, numero, total_ht, total_tva, total_ttc, tiers_id FROM facture WHERE id = ?', factureId)
      .toArray()[0] as
      | { type: string; exercice_id: string; statut: string; numero: string | null; total_ht: number; total_tva: number; total_ttc: number; tiers_id: string }
      | undefined;
    if (!f) throw new Error('Facture introuvable');
    if (f.statut !== 'brouillon' && f.numero) return { numero: f.numero };
    // CGI Art. 150 : une facture normalisée exige le NIU du client, pour les assujettis TVA (Réel).
    if (f.type === 'facture' && assujettiTva) {
      const tiers = this.sql.exec('SELECT niu FROM tiers WHERE id = ?', f.tiers_id).toArray()[0] as { niu: string | null } | undefined;
      if (!tiers?.niu?.trim()) throw new Error('Le NIU du client est requis pour émettre une facture (Art. 150 CGI)');
    }
    // Lecture async AVANT la transaction (transactionSync exige un callback 100% synchrone).
    const secteur = (await this.ctx.storage.get<string>('secteur')) ?? 'commerce';

    return this.ctx.storage.transactionSync(() => {
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
        const compteProduit = secteur === 'service' ? '706' : '701';
        const ecritureId = uid();
        this.sql.exec(
          `INSERT INTO ecriture (id, exercice_id, date_operation, libelle, source, statut, facture_id)
           VALUES (?, ?, date('now'), ?, 'facture', 'brouillon', ?)`,
          ecritureId, f.exercice_id, `Facture ${numero}`, factureId,
        );
        const l = (numero2: string, sens: string, m: number) =>
          this.sql.exec('INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?, ?, ?, ?, ?)',
            uid(), ecritureId, this.compteId(numero2), sens, m);
        l('411', 'debit', f.total_ttc);
        l(compteProduit, 'credit', f.total_ht);
        if (f.total_tva > 0) l(this.compteTvaCollectee(secteur), 'credit', f.total_tva);
        this.sql.exec("UPDATE ecriture SET statut = 'validee' WHERE id = ?", ecritureId);
      }
      this.journaliser({
        acteur, action: 'facture.emettre', entite: 'facture', entiteId: factureId,
        apres: { numero, type: f.type, totalTtc: f.total_ttc },
      });
      return { numero };
    });
  }

  /**
   * Avoir : corrige une facture émise SANS la supprimer (immuabilité) — contre-passation complète
   * (débit produit / crédit créance client, l'inverse exact de l'émission). Un seul avoir par
   * facture. Partage la numérotation des factures (`sequence_numerotation` ne connaît que
   * 'devis'/'facture') avec un préfixe "AVO" pour le distinguer visuellement.
   */
  async creerAvoir(
    factureId: string, prefixe: string, acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' },
  ): Promise<{ avoirId: string; numero: string }> {
    const f = this.sql.exec(
      'SELECT type, exercice_id, tiers_id, total_ht, total_tva, total_ttc, statut FROM facture WHERE id = ?', factureId,
    ).toArray()[0] as {
      type: string; exercice_id: string; tiers_id: string; total_ht: number; total_tva: number;
      total_ttc: number; statut: string;
    } | undefined;
    if (!f) throw new Error('Facture introuvable');
    if (f.type !== 'facture') throw new Error('Seule une facture (pas un devis) peut faire l\'objet d\'un avoir');
    if (f.statut === 'brouillon') throw new Error('Cette facture n\'a pas encore été émise');
    const dejaAvoir = this.sql.exec('SELECT 1 FROM facture WHERE avoir_de_id = ?', factureId).toArray()[0];
    if (dejaAvoir) throw new Error('Un avoir existe déjà pour cette facture');
    const secteur = (await this.ctx.storage.get<string>('secteur')) ?? 'commerce';

    return this.ctx.storage.transactionSync(() => {
      const seq = this.sql
        .exec("SELECT dernier_numero FROM sequence_numerotation WHERE exercice_id = ? AND type = 'facture'", f.exercice_id)
        .toArray()[0] as { dernier_numero: number } | undefined;
      const n = (seq?.dernier_numero ?? 0) + 1;
      this.sql.exec(
        `INSERT INTO sequence_numerotation (exercice_id, type, dernier_numero) VALUES (?, 'facture', ?)
         ON CONFLICT(exercice_id, type) DO UPDATE SET dernier_numero = ?`,
        f.exercice_id, n, n,
      );
      const annee = (this.sql.exec('SELECT annee FROM exercice WHERE id = ?', f.exercice_id).toArray()[0] as { annee: number }).annee;
      const numero = `${prefixe}-AVO-${annee}-${String(n).padStart(4, '0')}`;

      // Contre-passation : l'inverse exact de l'écriture d'émission (débit produit / crédit 411).
      const compteProduit = secteur === 'service' ? '706' : '701';
      const ecritureId = uid();
      this.sql.exec(
        `INSERT INTO ecriture (id, exercice_id, date_operation, libelle, source, statut, facture_id)
         VALUES (?, ?, date('now'), ?, 'facture', 'brouillon', ?)`,
        ecritureId, f.exercice_id, `Avoir ${numero}`, factureId,
      );
      const l = (numero2: string, sens: string, m: number) =>
        this.sql.exec('INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?, ?, ?, ?, ?)',
          uid(), ecritureId, this.compteId(numero2), sens, m);
      l(compteProduit, 'debit', f.total_ht);
      if (f.total_tva > 0) l(this.compteTvaCollectee(secteur), 'debit', f.total_tva);
      l('411', 'credit', f.total_ttc);
      this.sql.exec("UPDATE ecriture SET statut = 'validee' WHERE id = ?", ecritureId);

      const avoirId = uid();
      this.sql.exec(
        `INSERT INTO facture (id, exercice_id, type, numero, numero_seq, tiers_id, date_emission, statut,
                              total_ht, total_tva, total_ttc, avoir_de_id)
         VALUES (?, ?, 'facture', ?, ?, ?, date('now'), 'payee', ?, ?, ?, ?)`,
        avoirId, f.exercice_id, numero, n, f.tiers_id, f.total_ht, f.total_tva, f.total_ttc, factureId,
      );
      this.journaliser({
        acteur, action: 'facture.avoir', entite: 'facture', entiteId: avoirId,
        avant: { factureId }, apres: { numero, totalTtc: f.total_ttc },
      });
      return { avoirId, numero };
    });
  }

  /** Encaisse (total ou partiel) une facture : trésorerie / créance client 411, met à jour le statut. */
  async payerFacture(
    factureId: string, montant: number, modePaiement: string,
    acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' },
  ): Promise<{ statut: string; regle: number }> {
    const f = this.sql.exec('SELECT total_ttc, exercice_id FROM facture WHERE id = ?', factureId)
      .toArray()[0] as { total_ttc: number; exercice_id: string } | undefined;
    if (!f) throw new Error('Facture introuvable');

    return this.ctx.storage.transactionSync(() => {
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
      this.journaliser({
        acteur, action: 'facture.payer', entite: 'facture', entiteId: factureId,
        apres: { montant, modePaiement, statut, regle },
      });
      return { statut, regle };
    });
  }

  /**
   * Émet une facture DOCUMENT pour une vente déjà réglée (comptant) — sans recréer d'écriture,
   * pour éviter le double comptage du CA (la vente a déjà crédité 701/706). Le client demande
   * parfois une facture formelle pour une vente déjà payée en caisse : ce n'est pas un second
   * événement économique, juste un document numéroté qui réutilise l'écriture de la vente.
   */
  async creerFactureDepuisVente(
    venteId: string, prefixe: string, acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' },
  ): Promise<{ factureId: string; numero: string }> {
    const v = this.sql.exec(
      'SELECT exercice_id, tiers_id, mode_paiement, total_ht, total_tva, total_ttc, statut, ecriture_id, facture_id FROM vente WHERE id = ?',
      venteId,
    ).toArray()[0] as {
      exercice_id: string; tiers_id: string | null; total_ht: number; total_tva: number; total_ttc: number;
      statut: string; ecriture_id: string; facture_id: string | null;
    } | undefined;
    if (!v) throw new Error('Vente introuvable');
    if (v.statut !== 'payee') throw new Error('Seule une vente déjà réglée peut être facturée sans double comptage');
    if (v.facture_id) throw new Error('Cette vente a déjà une facture');
    if (!v.tiers_id) throw new Error('Un client est requis pour facturer cette vente');

    return this.ctx.storage.transactionSync(() => {
      const exerciceId = v.exercice_id;
      const seq = this.sql
        .exec("SELECT dernier_numero FROM sequence_numerotation WHERE exercice_id = ? AND type = 'facture'", exerciceId)
        .toArray()[0] as { dernier_numero: number } | undefined;
      const n = (seq?.dernier_numero ?? 0) + 1;
      this.sql.exec(
        `INSERT INTO sequence_numerotation (exercice_id, type, dernier_numero) VALUES (?, 'facture', ?)
         ON CONFLICT(exercice_id, type) DO UPDATE SET dernier_numero = ?`,
        exerciceId, n, n,
      );
      const annee = (this.sql.exec('SELECT annee FROM exercice WHERE id = ?', exerciceId).toArray()[0] as { annee: number }).annee;
      const numero = `${prefixe}-FAC-${annee}-${String(n).padStart(4, '0')}`;

      const factureId = uid();
      this.sql.exec(
        `INSERT INTO facture (id, exercice_id, type, numero, numero_seq, tiers_id, date_emission, statut,
                              total_ht, total_tva, total_ttc)
         VALUES (?, ?, 'facture', ?, ?, ?, date('now'), 'payee', ?, ?, ?)`,
        factureId, exerciceId, numero, n, v.tiers_id, v.total_ht, v.total_tva, v.total_ttc,
      );
      // Relie la vente à sa facture-document (aucune écriture créée — l'écriture de la vente,
      // déjà validée donc immuable, reste la SEULE trace comptable de ce chiffre d'affaires).
      this.sql.exec('UPDATE vente SET facture_id = ? WHERE id = ?', factureId, venteId);
      this.journaliser({
        acteur, action: 'facture.depuis_vente', entite: 'facture', entiteId: factureId,
        avant: { venteId }, apres: { numero, totalTtc: v.total_ttc },
      });
      return { factureId, numero };
    });
  }

  /** Nombre de factures émises depuis le début du mois civil courant — pour le quota du plan Gratuit. */
  async compterFacturesMoisCourant(): Promise<number> {
    const debutMois = `${this.dateCourante().slice(0, 7)}-01`;
    const row = this.sql.exec(
      "SELECT COUNT(*) AS n FROM facture WHERE type = 'facture' AND date_emission >= ?",
      debutMois,
    ).toArray()[0] as { n: number };
    return row.n;
  }

  async listerFactures(): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      `SELECT f.id, f.type, f.numero, f.statut, f.total_ttc, f.date_emission, f.date_echeance, f.avoir_de_id,
              t.nom AS tiers_nom, EXISTS (SELECT 1 FROM facture av WHERE av.avoir_de_id = f.id) AS a_un_avoir,
              EXISTS (SELECT 1 FROM facture cv WHERE cv.devis_id = f.id) AS a_ete_converti
         FROM facture f LEFT JOIN tiers t ON t.id = f.tiers_id
        ORDER BY f.created_at DESC`,
    ).toArray() as never;
  }

  /**
   * Factures émises non soldées (« on me doit »), avec montant dû et retard calculés à la volée
   * (pas de statut `en_retard` persisté ni de tâche planifiée — dérivé de `date_echeance`).
   */
  async listerFacturesImpayees(): Promise<Record<string, unknown>[]> {
    const rows = this.sql.exec(
      `SELECT f.id, f.numero, f.total_ttc, f.date_emission, f.date_echeance, t.nom AS tiers_nom,
              COALESCE((SELECT SUM(montant) FROM paiement_facture WHERE facture_id = f.id), 0) AS regle
         FROM facture f LEFT JOIN tiers t ON t.id = f.tiers_id
        WHERE f.type = 'facture' AND f.statut IN ('envoyee', 'payee_partiellement', 'en_retard')
          AND NOT EXISTS (SELECT 1 FROM facture av WHERE av.avoir_de_id = f.id)
        ORDER BY f.date_echeance ASC`,
    ).toArray() as { id: string; numero: string; total_ttc: number; date_emission: string | null; date_echeance: string | null; tiers_nom: string | null; regle: number }[];
    const aujourdhui = this.dateCourante();
    return rows.map((r) => ({
      ...r, montantDu: r.total_ttc - r.regle,
      enRetard: r.date_echeance !== null && r.date_echeance < aujourdhui,
    }));
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

  // ══════════════ Dépenses (charges courantes : loyer, eau, élec, transport, salaires…) ══════════════
  /**
   * Enregistre une dépense réglée : génère l'écriture comptable en partie double
   * (débit charge / crédit trésorerie) via le moteur comptable. Atomique + idempotente.
   */
  async creerDepense(d: {
    categorie: string; compteNumero: string; libelle: string; montant: number;
    modePaiement: string; tiersId?: string | null; recurrente?: boolean; clientUuid?: string | null;
    tauxTva?: number; regimeFiscal?: string | null; dateOperation?: string | null;
  }, acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' }): Promise<{ depenseId: string; deja: boolean }> {
    if (d.clientUuid) {
      const ex = this.sql
        .exec('SELECT id FROM depense WHERE client_uuid = ?', d.clientUuid)
        .toArray()[0] as { id: string } | undefined;
      if (ex) return { depenseId: ex.id, deja: true };
    }
    const montant = Math.floor(d.montant);
    if (montant <= 0) throw new Error('Montant de dépense invalide');
    this.verifierTvaAutorisee(d.regimeFiscal, [d.tauxTva]);
    // Date d'opération réelle (défaut : aujourd'hui, heure locale) → sélectionne le bon exercice.
    const dateOp = d.dateOperation ?? this.dateCourante();
    const exerciceId = this.exercicePourAnnee(Number(dateOp.slice(0, 4)));

    return this.ctx.storage.transactionSync(() => {
      // `montant` = HT (le compte de charge est toujours débité hors-taxe) ; la TVA récupérable
      // (4452), si applicable, s'ajoute au montant réellement décaissé (voir genererDepense).
      const ecr = genererDepense({
        montantHT: montant, tvaRecuperable: Math.round(montant * (d.tauxTva ?? 0)),
        modePaiement: d.modePaiement as never, compteCharge: d.compteNumero, libelle: d.libelle,
      });
      const ecritureId = uid();
      this.sql.exec(
        `INSERT INTO ecriture (id, exercice_id, date_operation, libelle, mode_paiement, tiers_id, source, statut)
         VALUES (?, ?, ?, ?, ?, ?, 'manuelle', 'brouillon')`,
        ecritureId, exerciceId, dateOp, d.libelle, d.modePaiement, d.tiersId ?? null,
      );
      for (const l of ecr.lignes) {
        this.sql.exec(
          'INSERT INTO ligne_ecriture (id, ecriture_id, compte_id, sens, montant) VALUES (?, ?, ?, ?, ?)',
          uid(), ecritureId, this.compteId(l.compteNumero), l.sens, l.montant,
        );
      }
      this.sql.exec("UPDATE ecriture SET statut = 'validee' WHERE id = ?", ecritureId);

      const depenseId = uid();
      this.sql.exec(
        `INSERT INTO depense (id, exercice_id, categorie, compte_numero, libelle, montant, mode_paiement,
                              tiers_id, recurrente, ecriture_id, client_uuid, date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        depenseId, exerciceId, d.categorie, d.compteNumero, d.libelle, montant, d.modePaiement,
        d.tiersId ?? null, d.recurrente ? 1 : 0, ecritureId, d.clientUuid ?? null, dateOp,
      );
      this.journaliser({
        acteur, action: 'depense.creer', entite: 'depense', entiteId: depenseId,
        apres: { categorie: d.categorie, montant, modePaiement: d.modePaiement },
      });
      return { depenseId, deja: false };
    });
  }

  async listerDepenses(): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      `SELECT d.id, d.categorie, d.compte_numero, d.libelle, d.montant, d.mode_paiement,
              d.recurrente, d.date, t.nom AS tiers_nom
         FROM depense d LEFT JOIN tiers t ON t.id = d.tiers_id
        ORDER BY d.created_at DESC`,
    ).toArray() as never;
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
    // Net (crédits − débits) : un avoir débite le compte de produit pour contre-passer une vente
    // sans la supprimer (immuabilité) — le CA doit refléter ce net, pas le seul brut crédité.
    const row = this.sql
      .exec(
        `SELECT COALESCE(SUM(CASE WHEN l.sens = 'credit' THEN l.montant ELSE -l.montant END), 0) AS ca
           FROM ligne_ecriture l
           JOIN compte_comptable c ON c.id = l.compte_id
           JOIN ecriture e ON e.id = l.ecriture_id
          WHERE c.classe = 7 AND e.statut = 'validee' AND e.exercice_id = ?`,
        this.exerciceOuvert(),
      )
      .toArray()[0] as { ca: number };
    return row.ca;
  }

  /**
   * Marge brute cumulée (CA net − coût des marchandises effectivement vendues) — donnée sensible,
   * réservée. Le coût est calculé ligne à ligne (`ligne_vente.cout_unitaire`, capturé au CMP du
   * jour de la vente), PAS via le solde du compte 6031 : ce dernier mesure la variation de stock
   * de la période entière (achats compris) et serait négatif tant que des articles achetés
   * restent invendus — inadapté à une marge par période.
   */
  async margeCumulee(): Promise<number> {
    const ca = await this.caCumule();
    const row = this.sql
      .exec(
        `SELECT COALESCE(SUM(lv.quantite * lv.cout_unitaire), 0) AS cogs
           FROM ligne_vente lv JOIN vente v ON v.id = lv.vente_id
          WHERE v.statut != 'annulee' AND v.exercice_id = ?`,
        this.exerciceOuvert(),
      )
      .toArray()[0] as { cogs: number };
    return ca - row.cogs;
  }

  /** Meilleures ventes de l'exercice (par chiffre d'affaires HT), ventes annulées exclues. */
  async meilleuresVentes(limite = 5): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      `SELECT lv.designation, SUM(lv.quantite) AS quantite, SUM(lv.montant_ht) AS montant_ht
         FROM ligne_vente lv JOIN vente v ON v.id = lv.vente_id
        WHERE v.statut != 'annulee' AND v.exercice_id = ?
        GROUP BY lv.designation ORDER BY montant_ht DESC LIMIT ?`,
      this.exerciceOuvert(), limite,
    ).toArray() as never;
  }

  /** Total des dépenses du jour (heure locale) — pour le tableau de bord. */
  async depensesDuJour(): Promise<number> {
    const row = this.sql
      .exec("SELECT COALESCE(SUM(montant), 0) AS total FROM depense WHERE date(date) = ?", this.dateCourante())
      .toArray()[0] as { total: number };
    return row.total;
  }

  /** Journal général : liste des écritures validées, la plus récente en premier. */
  async listerEcritures(): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      `SELECT id, exercice_id, date_operation, libelle, source, statut, total_debit, total_credit
         FROM ecriture WHERE statut = 'validee' ORDER BY created_at DESC`,
    ).toArray() as never;
  }

  /**
   * Vérifie qu'une écriture validée est bien immuable (triggers SQL) : toute tentative de
   * modification ou suppression directe doit être rejetée par SQLite. Utilisé par les tests.
   */
  async _verifierImmuabiliteEcriture(ecritureId: string): Promise<{ updateBloque: boolean; deleteBloque: boolean }> {
    let updateBloque = false;
    try {
      this.sql.exec("UPDATE ecriture SET libelle = 'Falsification' WHERE id = ?", ecritureId);
    } catch {
      updateBloque = true;
    }
    let deleteBloque = false;
    try {
      this.sql.exec('DELETE FROM ecriture WHERE id = ?', ecritureId);
    } catch {
      deleteBloque = true;
    }
    return { updateBloque, deleteBloque };
  }
}
