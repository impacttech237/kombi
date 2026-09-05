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
  CATEGORIES_DEPENSE,
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

/** Valeur SQLite : les colonnes ne portent jamais que ces types (pas de BLOB dans ce schéma). */
export type ValeurSql = string | number | boolean | null;
/** Instantané complet d'un DO (voir `exporterDonnees`/`importerDonnees` — sauvegarde/restauration). */
export interface SauvegardeTable {
  nom: string;
  lignes: Record<string, ValeurSql>[];
}
export interface SauvegardeDump {
  version: number;
  exporteLe: string;
  schemaVersion: number;
  etat: { entrepriseId: string | null; secteur: string | null; initialise: boolean | null };
  tables: SauvegardeTable[];
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
  /** Date à laquelle le client doit régler (uniquement pertinent si `aCredit`). */
  dateEcheance?: string | null;
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

  // ── Sauvegarde / restauration (chaque entreprise n'a QU'UNE instance DO, sans réplique native
  // Cloudflare — voir docs/AUDIT_2026-09-03.md point 1). Snapshot logique complet : toutes les
  // tables SQL + l'état clé/valeur (secteur, schema_version…) posé hors des tables via
  // ctx.storage. Restauration destinée à un DO NEUF (vide), jamais à écraser une entreprise
  // vivante — voir importerDonnees().

  private nomsTables(): string[] {
    return (this.sql
      .exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'")
      .toArray() as { name: string }[])
      .map((r) => r.name);
  }

  /** Exporte un instantané complet : toutes les tables + l'état clé/valeur du DO. */
  async exporterDonnees(): Promise<SauvegardeDump> {
    const tables: SauvegardeTable[] = this.nomsTables().map((nom) => ({
      nom,
      lignes: this.sql.exec(`SELECT * FROM ${nom}`).toArray() as Record<string, ValeurSql>[],
    }));
    return {
      version: 1,
      exporteLe: new Date().toISOString(),
      schemaVersion: (await this.ctx.storage.get<number>('schema_version')) ?? 0,
      etat: {
        entrepriseId: (await this.ctx.storage.get<string>('entrepriseId')) ?? null,
        secteur: (await this.ctx.storage.get<string>('secteur')) ?? null,
        initialise: (await this.ctx.storage.get<boolean>('initialise')) ?? null,
      },
      tables,
    };
  }

  /**
   * Restaure un instantané dans CE DO — refuse si une seule table métier cible contient déjà des
   * données (garde-fou : jamais utilisé pour écraser une entreprise vivante, seulement pour
   * recréer une entreprise dont le DO d'origine a été perdu). Exceptions : `compte_comptable`
   * (migration v9, comptes Mobile Money) et `module` (migration v3, module « depenses » actif par
   * défaut) sont pré-semées par des migrations de schéma dès la construction d'un DO, même neuf —
   * `INSERT OR IGNORE` y absorbe ce chevauchement sans le traiter comme une preuve de données
   * vivantes. Les triggers d'immuabilité n'interfèrent pas : on insère uniquement, jamais de
   * DELETE/UPDATE sur une table déjà remplie.
   */
  private static readonly TABLES_PRE_SEMEES = new Set(['compte_comptable', 'module']);

  async importerDonnees(dump: SauvegardeDump): Promise<{ tablesRestaurees: number; lignesRestaurees: number }> {
    // `await` avant toute vérification synchrone (même motif que dans enregistrerVente/
    // emettreFacture) — un throw synchrone sans await préalable dans une méthode DO appelée par
    // RPC perturbe le suivi du stockage isolé de l'environnement de test (voir la doc Cloudflare
    // sur les « known issues » de vitest-pool-workers, « isolated storage »).
    await this.ctx.storage.get('schema_version');
    const nomsValides = new Set(this.nomsTables());
    for (const { nom } of dump.tables) {
      if (!nomsValides.has(nom)) throw new Error(`Table inconnue dans ce schéma : ${nom}`);
      if (EntrepriseDO.TABLES_PRE_SEMEES.has(nom)) continue;
      const dejaPresent = this.sql.exec(`SELECT 1 FROM ${nom} LIMIT 1`).toArray()[0];
      if (dejaPresent) throw new Error(`Restauration refusée : la table « ${nom} » n'est pas vide`);
    }

    let lignesRestaurees = 0;
    this.ctx.storage.transactionSync(() => {
      // `sqlite_master` ne garantit pas un ordre stable entre tables (les migrations v5/v6 ont
      // recréé `vente`/`achat_fournisseur` sous un nom temporaire avant de les renommer, ce qui
      // les déplace en fin d'ordre naturel) — `defer_foreign_keys` reporte la vérification des FK
      // à la fin de la transaction plutôt que d'exiger un ordre d'insertion topologique exact.
      this.sql.exec('PRAGMA defer_foreign_keys = ON');
      // `ecriture` validée bloque l'insertion de ses `ligne_ecriture` (trg_ligne_verrou, comme en
      // usage normal) : on insère donc les écritures déjà validées en statut 'brouillon', on
      // insère les lignes (qui recalculent les totaux via trg_ligne_ins), puis on re-valide —
      // exactement le même parcours brouillon→lignes→validée que le reste de l'application.
      const aRevalider: string[] = [];
      for (const { nom, lignes } of dump.tables) {
        for (const ligne of lignes) {
          const valeurs: Record<string, ValeurSql> = nom === 'ecriture' && ligne.statut === 'validee'
            ? (() => { aRevalider.push(ligne.id as string); return { ...ligne, statut: 'brouillon' }; })()
            : ligne;
          const colonnes = Object.keys(valeurs);
          if (!colonnes.length) continue;
          const placeholders = colonnes.map(() => '?').join(', ');
          this.sql.exec(
            `INSERT OR IGNORE INTO ${nom} (${colonnes.join(', ')}) VALUES (${placeholders})`,
            ...colonnes.map((col) => valeurs[col]),
          );
          lignesRestaurees++;
        }
      }
      for (const id of aRevalider) this.sql.exec("UPDATE ecriture SET statut = 'validee' WHERE id = ?", id);
    });

    await this.ctx.storage.put('schema_version', dump.schemaVersion);
    if (dump.etat.entrepriseId) await this.ctx.storage.put('entrepriseId', dump.etat.entrepriseId);
    if (dump.etat.secteur) await this.ctx.storage.put('secteur', dump.etat.secteur);
    if (dump.etat.initialise) await this.ctx.storage.put('initialise', dump.etat.initialise);

    return { tablesRestaurees: dump.tables.length, lignesRestaurees };
  }

  async moduleActif(code: string): Promise<boolean> {
    const row = this.sql.exec('SELECT actif FROM module WHERE code = ?', code).toArray()[0] as
      | { actif: number }
      | undefined;
    return row?.actif === 1;
  }

  // ── Tiers (exemple d'accès aux données de l'entreprise) ──
  async creerTiers(t: {
    type: string; nom: string; niu?: string; telephone?: string; email?: string; adresse?: string;
    clientUuid?: string | null;
  }): Promise<string> {
    if (t.clientUuid) {
      const ex = this.sql.exec('SELECT id FROM tiers WHERE client_uuid = ?', t.clientUuid).toArray()[0] as { id: string } | undefined;
      if (ex) return ex.id;
    }
    const id = uid();
    this.sql.exec(
      'INSERT INTO tiers (id, type, nom, niu, telephone, email, adresse, client_uuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id, t.type, t.nom, t.niu ?? null, t.telephone ?? null, t.email ?? null, t.adresse ?? null, t.clientUuid ?? null,
    );
    return id;
  }

  async listerTiers(): Promise<Record<string, unknown>[]> {
    return this.sql.exec('SELECT * FROM tiers ORDER BY nom').toArray() as never;
  }

  /** Fiche tiers : coordonnées, solde (dû par lui / à lui) et historique des opérations liées. */
  async getTiersDetail(tiersId: string): Promise<Record<string, unknown> | null> {
    const t = this.sql.exec('SELECT * FROM tiers WHERE id = ?', tiersId).toArray()[0] as Record<string, unknown> | undefined;
    if (!t) return null;

    const ventes = this.sql.exec(
      `SELECT id, date, total_ttc, statut FROM vente WHERE tiers_id = ? ORDER BY date DESC LIMIT 20`, tiersId,
    ).toArray();
    const factures = this.sql.exec(
      `SELECT id, numero, type, total_ttc, statut, date_emission FROM facture WHERE tiers_id = ? ORDER BY created_at DESC LIMIT 20`,
      tiersId,
    ).toArray();
    const achats = this.sql.exec(
      `SELECT id, date, total_ttc, statut, piece_cle FROM achat_fournisseur WHERE tiers_id = ? ORDER BY date DESC LIMIT 20`, tiersId,
    ).toArray();

    const soldeVentesCredit = this.sql.exec(
      `SELECT COALESCE(SUM(total_ttc - COALESCE((SELECT SUM(montant) FROM paiement_vente WHERE vente_id = v.id), 0)), 0) AS solde
         FROM vente v WHERE v.tiers_id = ? AND v.statut IN ('a_credit', 'payee_partiellement')`,
      tiersId,
    ).toArray()[0] as { solde: number };
    const soldeFacturesDues = this.sql.exec(
      `SELECT COALESCE(SUM(total_ttc - COALESCE((SELECT SUM(montant) FROM paiement_facture WHERE facture_id = f.id), 0)), 0) AS solde
         FROM facture f WHERE f.tiers_id = ? AND f.type = 'facture' AND f.statut IN ('envoyee', 'payee_partiellement', 'en_retard')
           AND NOT EXISTS (SELECT 1 FROM facture av WHERE av.avoir_de_id = f.id)`,
      tiersId,
    ).toArray()[0] as { solde: number };
    const soldeDettes = this.sql.exec(
      `SELECT COALESCE(SUM(total_ttc - COALESCE((SELECT SUM(montant) FROM paiement_achat WHERE achat_id = a.id), 0)), 0) AS solde
         FROM achat_fournisseur a WHERE a.tiers_id = ? AND a.statut IN ('a_credit', 'payee_partiellement')`,
      tiersId,
    ).toArray()[0] as { solde: number };

    return {
      ...t, ventes, factures, achats,
      soldeDu: soldeVentesCredit.solde + soldeFacturesDues.solde, // ce que ce client nous doit
      soldeAPayer: soldeDettes.solde, // ce qu'on doit à ce fournisseur
    };
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

  /**
   * Refuse toute nouvelle opération datée dans un mois civil clôturé (D18, fiabilité des
   * données). Appelée avant écriture dans les 3 points d'entrée qui acceptent une date libre
   * (vente, achat/entrée de stock, dépense) — pas sur les paiements d'une créance/dette déjà
   * existante, qui postent toujours à la date du jour, jamais dans le passé.
   */
  private verifierMoisNonCloture(dateOp: string): void {
    const anneeMois = dateOp.slice(0, 7);
    const cloture = this.sql.exec('SELECT 1 FROM cloture_mensuelle WHERE annee_mois = ?', anneeMois).toArray()[0];
    if (cloture) throw new Error(`Le mois ${anneeMois} est clôturé — aucune nouvelle opération n'y est autorisée`);
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
    // Lecture async D'ABORD, avant toute vérification synchrone : aucun `await` ne doit séparer
    // la vérification d'idempotence (client_uuid) de la transaction, sinon deux requêtes
    // concurrentes avec le même client_uuid peuvent toutes deux franchir la vérification avant
    // qu'aucune n'ait écrit (fenêtre de course). Une fois l'await passé, tout le reste s'exécute
    // en un seul bloc synchrone ininterruptible.
    const secteur = (await this.ctx.storage.get<string>('secteur')) ?? 'commerce';

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
    // Date d'opération réelle (défaut : aujourd'hui, heure locale) — calculée avant la transaction
    // (comme entrerStock/creerDepense) pour échouer avant d'ouvrir toute ressource transactionnelle.
    const dateOp = v.dateOperation ?? this.dateCourante();
    this.verifierMoisNonCloture(dateOp);

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
                            statut, ecriture_id, caissier_id, client_uuid, date_echeance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        venteId, exerciceId, dateOp, v.tiersId ?? null, v.aCredit ? null : v.modePaiement, totalHt, totalTva, totalTtc,
        v.aCredit ? 'a_credit' : 'payee', ecritureId, v.caissierId ?? null, v.clientUuid ?? null,
        v.aCredit ? (v.dateEcheance ?? null) : null,
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
    acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' }, clientUuid?: string | null,
  ): Promise<{ statut: string; regle: number }> {
    if (clientUuid) {
      const ex = this.sql.exec('SELECT statut FROM vente WHERE id = ? AND EXISTS (SELECT 1 FROM paiement_vente WHERE client_uuid = ?)', venteId, clientUuid)
        .toArray()[0] as { statut: string } | undefined;
      if (ex) {
        const regleRow = this.sql.exec('SELECT COALESCE(SUM(montant),0) AS p FROM paiement_vente WHERE vente_id = ?', venteId).toArray()[0] as { p: number };
        return { statut: ex.statut, regle: regleRow.p };
      }
    }
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
        "INSERT INTO paiement_vente (id, vente_id, date, montant, mode_paiement, ecriture_id, client_uuid) VALUES (?, ?, date('now'), ?, ?, ?, ?)",
        uid(), venteId, montant, modePaiement, ecritureId, clientUuid ?? null,
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
    const rows = this.sql.exec(
      `SELECT v.id, v.date, v.total_ttc, v.statut, v.date_echeance, v.piece_cle, t.nom AS tiers_nom,
              COALESCE((SELECT SUM(montant) FROM paiement_vente WHERE vente_id = v.id), 0) AS regle
         FROM vente v LEFT JOIN tiers t ON t.id = v.tiers_id
        WHERE v.statut IN ('a_credit', 'payee_partiellement')
        ORDER BY v.date ASC`,
    ).toArray() as (Record<string, unknown> & { date_echeance: string | null })[];
    const aujourdhui = this.dateCourante();
    return rows.map((r) => ({ ...r, enRetard: r.date_echeance !== null && r.date_echeance < aujourdhui }));
  }

  async venteExiste(venteId: string): Promise<boolean> {
    return !!this.sql.exec('SELECT 1 FROM vente WHERE id = ?', venteId).toArray()[0];
  }

  /** Attache (ou retire, si `pieceCle` est null) la clé R2 de la pièce justificative d'une vente. */
  async attacherPieceVente(venteId: string, pieceCle: string | null): Promise<void> {
    const existe = this.sql.exec('SELECT 1 FROM vente WHERE id = ?', venteId).toArray()[0];
    if (!existe) throw new Error('Vente introuvable');
    this.sql.exec('UPDATE vente SET piece_cle = ? WHERE id = ?', pieceCle, venteId);
  }

  /** Clé R2 de la pièce justificative d'une vente, si elle existe. */
  async getPieceVente(venteId: string): Promise<string | null> {
    const row = this.sql.exec('SELECT piece_cle FROM vente WHERE id = ?', venteId).toArray()[0] as
      | { piece_cle: string | null }
      | undefined;
    return row?.piece_cle ?? null;
  }

  /**
   * Toutes les pièces justificatives jointes (dépenses + achats fournisseurs + ventes à crédit),
   * pour l'écran centralisé « Pièces justificatives ». Contrairement à listerDettesFournisseurs/
   * listerVentesACredit (filtrées sur le solde restant dû), inclut aussi les achats/ventes déjà
   * soldés — une pièce jointe avant paiement ne doit pas devenir introuvable une fois réglée.
   */
  async listerPiecesJustificatives(): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      `SELECT 'depense' AS type, d.id, d.date, d.libelle, d.montant, d.piece_cle, t.nom AS tiers_nom
         FROM depense d LEFT JOIN tiers t ON t.id = d.tiers_id
        WHERE d.piece_cle IS NOT NULL
       UNION ALL
       SELECT 'achat' AS type, a.id, a.date,
              ('Achat fournisseur' || CASE WHEN t.nom IS NOT NULL THEN ' — ' || t.nom ELSE '' END) AS libelle,
              a.total_ttc AS montant, a.piece_cle, t.nom AS tiers_nom
         FROM achat_fournisseur a LEFT JOIN tiers t ON t.id = a.tiers_id
        WHERE a.piece_cle IS NOT NULL
       UNION ALL
       SELECT 'vente' AS type, v.id, v.date,
              ('Vente à crédit' || CASE WHEN t.nom IS NOT NULL THEN ' — ' || t.nom ELSE '' END) AS libelle,
              v.total_ttc AS montant, v.piece_cle, t.nom AS tiers_nom
         FROM vente v LEFT JOIN tiers t ON t.id = v.tiers_id
        WHERE v.piece_cle IS NOT NULL
       ORDER BY date DESC`,
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
    dateOperation?: string | null; clientUuid?: string | null; dateEcheance?: string | null;
  }, acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' }): Promise<{ nouveauStock: number; nouveauCmp: number; achatId: string | null }> {
    if (a.clientUuid) {
      const ex = this.sql.exec('SELECT id FROM mouvement_stock WHERE client_uuid = ?', a.clientUuid).toArray()[0];
      if (ex) {
        const prodEx = this.sql.exec('SELECT stock_actuel, cout_moyen_pondere FROM produit WHERE id = ?', a.produitId)
          .toArray()[0] as { stock_actuel: number; cout_moyen_pondere: number };
        // Rejeu offline (déjà appliqué) : le client a déjà reçu l'achatId lors du premier succès.
        return { nouveauStock: prodEx.stock_actuel, nouveauCmp: prodEx.cout_moyen_pondere, achatId: null };
      }
    }
    const prod = this.sql
      .exec('SELECT stock_actuel, cout_moyen_pondere FROM produit WHERE id = ?', a.produitId)
      .toArray()[0] as { stock_actuel: number; cout_moyen_pondere: number } | undefined;
    if (!prod) throw new Error('Produit introuvable');
    if (a.aCredit && !a.tiersId) throw new Error('Un fournisseur est requis pour un achat à crédit');
    if (!a.aCredit && !a.modePaiement) throw new Error('Mode de paiement requis');
    this.verifierTvaAutorisee(a.regimeFiscal, [a.tauxTva]);

    // Date d'opération réelle (défaut : aujourd'hui, heure locale) → sélectionne le bon exercice.
    const dateOp = a.dateOperation ?? this.dateCourante();
    this.verifierMoisNonCloture(dateOp);
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
        `INSERT INTO mouvement_stock (id, produit_id, type, quantite, cout_unitaire, motif, client_uuid)
         VALUES (?, ?, 'entree', ?, ?, 'Approvisionnement', ?)`,
        uid(), a.produitId, a.quantite, Math.floor(a.coutUnitaire), a.clientUuid ?? null,
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

      // Trace un `achat_fournisseur` (dette si à crédit, sinon déjà réglé) dès qu'un fournisseur
      // est renseigné — même au comptant — pour permettre d'y attacher le scan de la facture
      // fournisseur (voir services/pieces.ts) ; sans fournisseur, rien à tracer (comportement
      // historique inchangé pour un simple achat au comptant sans tiers connu).
      let achatId: string | null = null;
      if (a.tiersId) {
        achatId = uid();
        this.sql.exec(
          `INSERT INTO achat_fournisseur (id, exercice_id, tiers_id, date, total_ht, total_tva, total_ttc, statut, ecriture_id, date_echeance)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          achatId, exerciceId, a.tiersId, dateOp, montantHt, montantTva, montantRegle,
          a.aCredit ? 'a_credit' : 'regle', ecritureId, a.dateEcheance ?? null,
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
      return { nouveauStock: etat.quantite, nouveauCmp: etat.cmp, achatId };
    });
  }

  /**
   * Ajustement d'inventaire (casse, vol, écart constaté) : corrige le stock physique sans passer
   * par une vente ou un achat. Valorisé au CMP courant (le CMP lui-même n'est pas recalculé — un
   * écart n'est pas une nouvelle entrée à un coût différent). Écriture symétrique de l'inventaire
   * permanent (`docs/reference/08-stock-inventaire-permanent.md`) : perte (delta < 0) = débit 6031
   * / crédit 311, comme une sortie sans vente ; surplus (delta > 0) = débit 311 / crédit 6031,
   * comme une entrée sans achat. Validé ONECCA (docs/reference/09-validations-onecca.md §2) :
   * 6031 est la base correcte pour tout ajustement ; router les cas anormaux/significatifs (vol
   * notamment) vers 658 en plus serait une amélioration future, pas un correctif requis ici.
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
    acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' }, clientUuid?: string | null,
  ): Promise<{ statut: string; regle: number }> {
    if (clientUuid) {
      const ex = this.sql.exec('SELECT statut FROM achat_fournisseur WHERE id = ? AND EXISTS (SELECT 1 FROM paiement_achat WHERE client_uuid = ?)', achatId, clientUuid)
        .toArray()[0] as { statut: string } | undefined;
      if (ex) {
        const regleRow = this.sql.exec('SELECT COALESCE(SUM(montant),0) AS p FROM paiement_achat WHERE achat_id = ?', achatId).toArray()[0] as { p: number };
        return { statut: ex.statut, regle: regleRow.p };
      }
    }
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
        "INSERT INTO paiement_achat (id, achat_id, date, montant, mode_paiement, ecriture_id, client_uuid) VALUES (?, ?, date('now'), ?, ?, ?, ?)",
        uid(), achatId, montant, modePaiement, ecritureId, clientUuid ?? null,
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
    const rows = this.sql.exec(
      `SELECT a.id, a.date, a.total_ttc, a.statut, a.date_echeance, a.piece_cle, t.nom AS tiers_nom,
              COALESCE((SELECT SUM(montant) FROM paiement_achat WHERE achat_id = a.id), 0) AS regle
         FROM achat_fournisseur a LEFT JOIN tiers t ON t.id = a.tiers_id
        WHERE a.statut IN ('a_credit', 'payee_partiellement')
        ORDER BY a.date ASC`,
    ).toArray() as (Record<string, unknown> & { date_echeance: string | null })[];
    const aujourdhui = this.dateCourante();
    return rows.map((r) => ({ ...r, enRetard: r.date_echeance !== null && r.date_echeance < aujourdhui }));
  }

  async achatExiste(achatId: string): Promise<boolean> {
    return !!this.sql.exec('SELECT 1 FROM achat_fournisseur WHERE id = ?', achatId).toArray()[0];
  }

  /** Attache (ou retire, si `pieceCle` est null) la clé R2 de la pièce justificative d'un achat fournisseur. */
  async attacherPieceAchat(achatId: string, pieceCle: string | null): Promise<void> {
    const existe = this.sql.exec('SELECT 1 FROM achat_fournisseur WHERE id = ?', achatId).toArray()[0];
    if (!existe) throw new Error('Achat introuvable');
    this.sql.exec('UPDATE achat_fournisseur SET piece_cle = ? WHERE id = ?', pieceCle, achatId);
  }

  /** Clé R2 de la pièce justificative d'un achat fournisseur, si elle existe. */
  async getPieceAchat(achatId: string): Promise<string | null> {
    const row = this.sql.exec('SELECT piece_cle FROM achat_fournisseur WHERE id = ?', achatId).toArray()[0] as
      | { piece_cle: string | null }
      | undefined;
    return row?.piece_cle ?? null;
  }

  // ══════════════ Facturation & devis ══════════════
  async creerFacture(f: {
    type: 'facture' | 'devis'; tiersId: string; dateEcheance?: string | null;
    lignes: { designation: string; quantite: number; prixUnitaire: number; tauxTva?: number }[];
    regimeFiscal?: string | null; clientUuid?: string | null;
  }): Promise<string> {
    if (f.clientUuid) {
      const ex = this.sql.exec('SELECT id FROM facture WHERE client_uuid = ?', f.clientUuid).toArray()[0] as { id: string } | undefined;
      if (ex) return ex.id;
    }
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
      `INSERT INTO facture (id, exercice_id, type, tiers_id, date_echeance, statut, total_ht, total_tva, total_ttc, client_uuid)
       VALUES (?, ?, ?, ?, ?, 'brouillon', ?, ?, ?, ?)`,
      id, exerciceId, f.type, f.tiersId, f.dateEcheance ?? null, totalHt, totalTva, totalHt + totalTva, f.clientUuid ?? null,
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
    // Idempotent : un rejeu (retry réseau, double-clic) retourne la facture déjà créée au lieu
    // d'échouer, exactement comme le dédoublonnage par client_uuid ailleurs dans ce fichier.
    const dejaConverti = this.sql.exec('SELECT id FROM facture WHERE devis_id = ?', devisId).toArray()[0] as { id: string } | undefined;
    if (dejaConverti) return dejaConverti.id;

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
    // Lecture async D'ABORD (voir commentaire équivalent dans enregistrerVente) : aucun `await`
    // ne doit séparer la vérification d'idempotence (statut brouillon) de la transaction.
    const secteur = (await this.ctx.storage.get<string>('secteur')) ?? 'commerce';

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
    // Lecture async D'ABORD (voir commentaire équivalent dans enregistrerVente) : aucun `await`
    // ne doit séparer la vérification « avoir déjà existant » de la transaction.
    const secteur = (await this.ctx.storage.get<string>('secteur')) ?? 'commerce';

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
    acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' }, clientUuid?: string | null,
  ): Promise<{ statut: string; regle: number }> {
    if (clientUuid) {
      const ex = this.sql.exec('SELECT statut FROM facture WHERE id = ? AND EXISTS (SELECT 1 FROM paiement_facture WHERE client_uuid = ?)', factureId, clientUuid)
        .toArray()[0] as { statut: string } | undefined;
      if (ex) {
        const regleRow = this.sql.exec('SELECT COALESCE(SUM(montant),0) AS p FROM paiement_facture WHERE facture_id = ?', factureId).toArray()[0] as { p: number };
        return { statut: ex.statut, regle: regleRow.p };
      }
    }
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
        "INSERT INTO paiement_facture (id, facture_id, date, montant, mode_paiement, ecriture_id, client_uuid) VALUES (?, ?, date('now'), ?, ?, ?, ?)",
        uid(), factureId, montant, modePaiement, ecritureId, clientUuid ?? null,
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

  /**
   * Liste complète des factures/devis. `regle` et `enRetard` sont dérivés à la volée comme dans
   * `listerFacturesImpayees()` (aucun statut `en_retard` n'est jamais persisté en base — voir son
   * commentaire) : sans eux, un client de cet appel ne peut pas savoir combien reste réellement dû
   * ni distinguer une facture en retard d'une facture simplement en attente.
   */
  async listerFactures(): Promise<Record<string, unknown>[]> {
    const rows = this.sql.exec(
      `SELECT f.id, f.type, f.numero, f.statut, f.total_ttc, f.date_emission, f.date_echeance, f.avoir_de_id,
              t.nom AS tiers_nom, t.telephone AS tiers_telephone,
              EXISTS (SELECT 1 FROM facture av WHERE av.avoir_de_id = f.id) AS a_un_avoir,
              EXISTS (SELECT 1 FROM facture cv WHERE cv.devis_id = f.id) AS a_ete_converti,
              COALESCE((SELECT SUM(montant) FROM paiement_facture WHERE facture_id = f.id), 0) AS regle
         FROM facture f LEFT JOIN tiers t ON t.id = f.tiers_id
        ORDER BY f.created_at DESC`,
    ).toArray() as (Record<string, unknown> & { statut: string; total_ttc: number; date_echeance: string | null; regle: number })[];
    const aujourdhui = this.dateCourante();
    return rows.map((r) => ({
      ...r, montantDu: r.total_ttc - r.regle,
      enRetard: (r.statut === 'envoyee' || r.statut === 'payee_partiellement')
        && r.date_echeance !== null && r.date_echeance < aujourdhui,
    }));
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

  /**
   * Notifications actives (cloche in-app — spec §13, Phase MVP+ ; WhatsApp/SMS reste V1) :
   * factures en retard/à échéance proche, stock en rupture/bas, échéance de déclaration IGS.
   * Calculées à la volée à chaque appel (pas de table `notification` persistée pour l'instant —
   * rien ne justifie encore le coût d'un état à synchroniser pour de la simple lecture dérivée).
   */
  async notificationsActives(
    regimeFiscal?: string | null,
  ): Promise<{ type: string; gravite: 'attention' | 'critique'; libelle: string }[]> {
    const notifications: { type: string; gravite: 'attention' | 'critique'; libelle: string }[] = [];
    const aujourdhui = this.dateCourante();

    const impayees = await this.listerFacturesImpayees() as
      { numero: string | null; montantDu: number; enRetard: boolean; date_echeance: string | null }[];
    for (const f of impayees) {
      const numero = f.numero ?? 'facture';
      if (f.enRetard) {
        notifications.push({ type: 'facture', gravite: 'critique', libelle: `${numero} en retard — ${f.montantDu} FCFA dus` });
      } else if (f.date_echeance) {
        const jours = Math.ceil((Date.parse(f.date_echeance) - Date.parse(aujourdhui)) / 86_400_000);
        if (jours >= 0 && jours <= 5) {
          notifications.push({ type: 'facture', gravite: 'attention', libelle: `${numero} échue dans ${jours} j — ${f.montantDu} FCFA` });
        }
      }
    }

    const produits = await this.listerProduits() as { nom: string; en_rupture: number; en_alerte: number }[];
    for (const p of produits) {
      if (p.en_rupture) notifications.push({ type: 'stock', gravite: 'critique', libelle: `${p.nom} en rupture de stock` });
      else if (p.en_alerte) notifications.push({ type: 'stock', gravite: 'attention', libelle: `${p.nom} en stock bas` });
    }

    // Déclaration IGS : 15 avril (docs/reference/02-igs.md), régime IGS uniquement.
    if (regimeFiscal === 'igs') {
      const annee = Number(aujourdhui.slice(0, 4));
      let echeance = `${annee}-04-15`;
      if (aujourdhui > echeance) echeance = `${annee + 1}-04-15`;
      const jours = Math.ceil((Date.parse(echeance) - Date.parse(aujourdhui)) / 86_400_000);
      if (jours <= 30) {
        notifications.push({
          type: 'fiscal', gravite: jours <= 10 ? 'critique' : 'attention',
          libelle: `Déclaration IGS due le 15 avril — dans ${jours} j`,
        });
      }
    }

    return notifications;
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
    montant?: number | null; datePrevue?: string | null; clientUuid?: string | null;
    description?: string | null; priorite?: string; dateDebut?: string | null; dateRendezVous?: string | null;
    datePaiement?: string | null; lieu?: string | null; responsableId?: string | null;
    responsableNom?: string | null; acompte?: number; remboursement?: number;
    coutBudget?: number; reference?: string | null;
  }): Promise<string> {
    if (cmd.clientUuid) {
      const ex = this.sql.exec('SELECT id FROM commande WHERE client_uuid = ?', cmd.clientUuid).toArray()[0] as { id: string } | undefined;
      if (ex) return ex.id;
    }
    const id = uid();
    this.sql.exec(
      `INSERT INTO commande (id, type, tiers_id, libelle, montant, date_prevue, client_uuid,
        description, priorite, date_debut, date_rendez_vous, date_paiement, lieu,
        responsable_id, responsable_nom, acompte, remboursement, cout_budget, reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, cmd.type ?? 'commande', cmd.tiersId ?? null, cmd.libelle,
      cmd.montant ?? null, cmd.datePrevue ?? null, cmd.clientUuid ?? null,
      cmd.description ?? null, cmd.priorite ?? 'normale', cmd.dateDebut ?? null,
      cmd.dateRendezVous ?? null, cmd.datePaiement ?? null, cmd.lieu ?? null,
      cmd.responsableId ?? null, cmd.responsableNom ?? null, cmd.acompte ?? 0, cmd.remboursement ?? 0,
      cmd.coutBudget ?? 0, cmd.reference ?? `OPE-${new Date().getFullYear()}-${id.slice(0,6).toUpperCase()}`,
    );
    this.historiserOperation(id, 'creation', 'Opération créée');
    return id;
  }

  async listerCommandes(): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      `SELECT c.*, t.nom AS tiers_nom, t.telephone AS tiers_telephone,
              (SELECT COUNT(*) FROM tache_operation x WHERE x.commande_id=c.id) AS nb_taches,
              (SELECT COUNT(*) FROM tache_operation x WHERE x.commande_id=c.id AND x.statut='terminee') AS nb_taches_terminees,
              (SELECT COUNT(*) FROM tache_operation x WHERE x.commande_id=c.id AND x.statut='bloquee') AS nb_taches_bloquees,
              COALESCE((SELECT SUM(x.montant) FROM cout_operation x WHERE x.commande_id=c.id),0) AS cout_reel,
              COALESCE((SELECT SUM(x.montant) FROM echeance_operation x WHERE x.commande_id=c.id AND x.type='encaissement' AND x.statut='payee'),0) AS encaissements_echeancier,
              COALESCE((SELECT SUM(x.montant) FROM echeance_operation x WHERE x.commande_id=c.id AND x.type='remboursement' AND x.statut='payee'),0) AS remboursements_echeancier
         FROM commande c LEFT JOIN tiers t ON t.id = c.tiers_id
        ORDER BY c.created_at DESC`,
    ).toArray() as never;
  }

  async changerStatutCommande(id: string, statut: string): Promise<void> {
    const ok = ['en_attente', 'en_cours', 'controle', 'prete', 'livree', 'bloquee', 'annulee'];
    if (!ok.includes(statut)) throw new Error('Statut invalide');
    this.sql.exec("UPDATE commande SET statut = ?, updated_at = datetime('now') WHERE id = ?", statut, id);
    this.historiserOperation(id, 'statut', statut);
  }

  async modifierCommande(id: string, cmd: Record<string, unknown>): Promise<void> {
    const permis: Record<string,string> = { libelle:'libelle',description:'description',priorite:'priorite',dateDebut:'date_debut',datePrevue:'date_prevue',dateRendezVous:'date_rendez_vous',datePaiement:'date_paiement',lieu:'lieu',responsableId:'responsable_id',responsableNom:'responsable_nom',montant:'montant',acompte:'acompte',remboursement:'remboursement',coutBudget:'cout_budget',motifBlocage:'motif_blocage',valideeClientLe:'validee_client_le',preuveLivraison:'preuve_livraison' };
    if (!this.sql.exec('SELECT 1 FROM commande WHERE id=?',id).toArray()[0]) throw new Error('Opération introuvable');
    const entrees=Object.entries(cmd).filter(([k])=>permis[k]);
    if (!entrees.length) return;
    this.sql.exec(`UPDATE commande SET ${entrees.map(([k])=>`${permis[k]}=?`).join(',')}, updated_at=datetime('now') WHERE id=?`,...entrees.map(([,v])=>v ?? null),id);
    this.historiserOperation(id,'modification',entrees.map(([k])=>k).join(', '));
  }

  async dupliquerCommande(id: string): Promise<string> {
    const c=this.sql.exec('SELECT * FROM commande WHERE id=?',id).toArray()[0] as Record<string,unknown>|undefined;
    if(!c) throw new Error('Opération introuvable');
    const nouveau=await this.creerCommande({type:c.type as 'commande'|'mission',tiersId:c.tiers_id as string|null,libelle:`Copie — ${c.libelle}`,montant:c.montant as number|null,description:c.description as string|null,priorite:c.priorite as string,lieu:c.lieu as string|null,responsableId:c.responsable_id as string|null,responsableNom:c.responsable_nom as string|null,coutBudget:c.cout_budget as number});
    const ts=this.sql.exec('SELECT * FROM tache_operation WHERE commande_id=? ORDER BY ordre',id).toArray() as Record<string,unknown>[];const correspondance=new Map<string,string>();
    for(const t of ts){const nid=await this.creerTacheOperation(nouveau,{titre:t.titre as string,description:t.description as string|null,priorite:t.priorite as string,responsableId:t.responsable_id as string|null,responsableNom:t.responsable_nom as string|null,dateEcheance:t.date_echeance as string|null,dependDeId:correspondance.get(t.depend_de_id as string)});correspondance.set(t.id as string,nid)}
    return nouveau;
  }

  async archiverCommande(id:string, archivee:boolean):Promise<void>{this.sql.exec("UPDATE commande SET archivee=?,updated_at=datetime('now') WHERE id=?",archivee?1:0,id);this.historiserOperation(id,archivee?'archivage':'restauration',null)}

  async creerTacheOperation(commandeId: string, t: {
    titre: string; description?: string | null; priorite?: string; responsableId?: string | null;
    responsableNom?: string | null; dateEcheance?: string | null; dependDeId?: string | null;
    parentId?:string|null; dureeMinutes?:number; recurrence?:string|null; assignes?:{id:string;nom:string}[];
  }): Promise<string> {
    if (!this.sql.exec('SELECT 1 FROM commande WHERE id=?', commandeId).toArray()[0]) throw new Error('Opération introuvable');
    const id = uid();
    const ordre = (this.sql.exec('SELECT COALESCE(MAX(ordre),-1)+1 AS n FROM tache_operation WHERE commande_id=?', commandeId).toArray()[0] as { n: number }).n;
    this.sql.exec(
      `INSERT INTO tache_operation (id, commande_id, titre, description, priorite, responsable_id, responsable_nom, date_echeance, ordre, depend_de_id,parent_id,duree_minutes,recurrence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?)`,
      id, commandeId, t.titre, t.description ?? null, t.priorite ?? 'normale', t.responsableId ?? null,
      t.responsableNom ?? null, t.dateEcheance ?? null, ordre, t.dependDeId ?? null,t.parentId??null,t.dureeMinutes??0,t.recurrence??null,
    );
    for(const a of t.assignes??[])this.sql.exec('INSERT OR IGNORE INTO assignation_tache(tache_id,utilisateur_id,nom) VALUES(?,?,?)',id,a.id,a.nom);
    this.recalculerProgressionOperation(commandeId);
    return id;
  }

  async listerTachesOperations(): Promise<Record<string, unknown>[]> {
    return this.sql.exec("SELECT t.*,(SELECT GROUP_CONCAT(a.nom,' · ') FROM assignation_tache a WHERE a.tache_id=t.id) AS assignes_noms FROM tache_operation t ORDER BY date_echeance IS NULL,date_echeance,ordre").toArray() as never;
  }

  async changerStatutTache(id: string, statut: string): Promise<void> {
    if (!['a_faire', 'en_cours', 'bloquee', 'terminee'].includes(statut)) throw new Error('Statut de tâche invalide');
    const row = this.sql.exec('SELECT commande_id FROM tache_operation WHERE id=?', id).toArray()[0] as { commande_id: string } | undefined;
    if (!row) throw new Error('Tâche introuvable');
    if (statut === 'en_cours' || statut === 'terminee') {
      const dependance = this.sql.exec(
        `SELECT d.statut FROM tache_operation t JOIN tache_operation d ON d.id=t.depend_de_id WHERE t.id=?`, id,
      ).toArray()[0] as { statut: string } | undefined;
      if (dependance && dependance.statut !== 'terminee') throw new Error('La tâche précédente doit être terminée');
    }
    this.sql.exec("UPDATE tache_operation SET statut=?, updated_at=datetime('now') WHERE id=?", statut, id);
    this.recalculerProgressionOperation(row.commande_id);
    if(statut==='terminee'){
      const t=this.sql.exec('SELECT * FROM tache_operation WHERE id=?',id).toArray()[0] as Record<string,unknown>;
      if(t.recurrence&&t.date_echeance){const d=new Date(`${t.date_echeance}T12:00:00`);if(t.recurrence==='quotidienne')d.setDate(d.getDate()+1);if(t.recurrence==='hebdomadaire')d.setDate(d.getDate()+7);if(t.recurrence==='mensuelle')d.setMonth(d.getMonth()+1);await this.creerTacheOperation(row.commande_id,{titre:t.titre as string,description:t.description as string|null,priorite:t.priorite as string,responsableId:t.responsable_id as string|null,responsableNom:t.responsable_nom as string|null,dateEcheance:d.toISOString().slice(0,10),dureeMinutes:t.duree_minutes as number,recurrence:t.recurrence as string});}
    }
  }

  async modifierTacheOperation(id:string,d:Record<string,unknown>):Promise<void>{const map:Record<string,string>={titre:'titre',description:'description',priorite:'priorite',dateEcheance:'date_echeance',dureeMinutes:'duree_minutes',recurrence:'recurrence',responsableId:'responsable_id',responsableNom:'responsable_nom',dependDeId:'depend_de_id',parentId:'parent_id'};const es=Object.entries(d).filter(([k])=>map[k]);if(es.length)this.sql.exec(`UPDATE tache_operation SET ${es.map(([k])=>`${map[k]}=?`).join(',')},updated_at=datetime('now') WHERE id=?`,...es.map(([,v])=>v??null),id)}
  async supprimerTacheOperation(id:string):Promise<void>{const r=this.sql.exec('SELECT commande_id FROM tache_operation WHERE id=?',id).toArray()[0] as {commande_id:string}|undefined;if(!r)return;this.sql.exec('UPDATE tache_operation SET depend_de_id=NULL,parent_id=NULL WHERE depend_de_id=? OR parent_id=?',id,id);this.sql.exec('DELETE FROM tache_operation WHERE id=?',id);this.recalculerProgressionOperation(r.commande_id)}

  async ajouterCommentaireOperation(commandeId: string, message: string, auteurId?: string, auteurNom?: string): Promise<string> {
    if (!this.sql.exec('SELECT 1 FROM commande WHERE id=?', commandeId).toArray()[0]) throw new Error('Opération introuvable');
    const id = uid();
    this.sql.exec('INSERT INTO commentaire_operation (id,commande_id,auteur_id,auteur_nom,message) VALUES (?,?,?,?,?)', id, commandeId, auteurId ?? null, auteurNom ?? null, message);
    return id;
  }
  async listerCommentairesOperations(): Promise<Record<string, unknown>[]> {
    return this.sql.exec('SELECT id,commande_id,auteur_id,auteur_nom,message,created_at AS cree_le FROM commentaire_operation ORDER BY created_at').toArray() as never;
  }
  private historiserOperation(commandeId:string,action:string,detail?:string|null,auteurNom?:string|null):void{this.sql.exec('INSERT INTO historique_operation(id,commande_id,action,detail,auteur_nom) VALUES(?,?,?,?,?)',uid(),commandeId,action,detail??null,auteurNom??null)}
  async listerHistoriqueOperations():Promise<Record<string,unknown>[]>{return this.sql.exec('SELECT * FROM historique_operation ORDER BY created_at DESC').toArray() as never}
  async ajouterCoutOperation(commandeId:string,c:{categorie:string;libelle:string;montant:number;date:string;fournisseurNom?:string|null;depenseId?:string|null}):Promise<string>{if(!this.sql.exec('SELECT 1 FROM commande WHERE id=?',commandeId).toArray()[0])throw new Error('Opération introuvable');const id=uid();this.sql.exec('INSERT INTO cout_operation(id,commande_id,categorie,libelle,montant,date,fournisseur_nom,depense_id) VALUES(?,?,?,?,?,?,?,?)',id,commandeId,c.categorie,c.libelle,c.montant,c.date,c.fournisseurNom??null,c.depenseId??null);if(c.depenseId)this.sql.exec('UPDATE depense SET commande_id=? WHERE id=?',commandeId,c.depenseId);this.historiserOperation(commandeId,'cout',`${c.libelle} : ${c.montant}`);return id}
  async listerCoutsOperations():Promise<Record<string,unknown>[]>{return this.sql.exec('SELECT * FROM cout_operation ORDER BY date DESC').toArray() as never}
  async supprimerCoutOperation(id:string):Promise<void>{const r=this.sql.exec('SELECT commande_id FROM cout_operation WHERE id=?',id).toArray()[0] as {commande_id:string}|undefined;if(r){this.sql.exec('DELETE FROM cout_operation WHERE id=?',id);this.historiserOperation(r.commande_id,'suppression_cout',id)}}
  async ajouterEcheanceOperation(commandeId:string,e:{type:string;libelle:string;montant:number;datePrevue:string}):Promise<string>{if(!this.sql.exec('SELECT 1 FROM commande WHERE id=?',commandeId).toArray()[0])throw new Error('Opération introuvable');const id=uid();this.sql.exec('INSERT INTO echeance_operation(id,commande_id,type,libelle,montant,date_prevue) VALUES(?,?,?,?,?,?)',id,commandeId,e.type,e.libelle,e.montant,e.datePrevue);this.historiserOperation(commandeId,'echeance',`${e.libelle} : ${e.montant}`);return id}
  async listerEcheancesOperations():Promise<Record<string,unknown>[]>{return this.sql.exec('SELECT * FROM echeance_operation ORDER BY date_prevue').toArray() as never}
  async payerEcheanceOperation(id:string,modePaiement:string,datePaiement?:string|null):Promise<void>{const e=this.sql.exec('SELECT commande_id,type,montant FROM echeance_operation WHERE id=?',id).toArray()[0] as {commande_id:string;type:string;montant:number}|undefined;if(!e)throw new Error('Échéance introuvable');this.sql.exec("UPDATE echeance_operation SET statut='payee',mode_paiement=?,date_paiement=? WHERE id=?",modePaiement,datePaiement??new Date().toISOString().slice(0,10),id);if(e.type==='encaissement')this.sql.exec('UPDATE commande SET acompte=acompte+? WHERE id=?',e.montant,e.commande_id);else this.sql.exec('UPDATE commande SET remboursement=remboursement+? WHERE id=?',e.montant,e.commande_id);this.historiserOperation(e.commande_id,'paiement',`${e.type} : ${e.montant}`)}
  async ajouterPieceOperation(commandeId:string,cle:string,nom:string,typeMime:string,categorie:string):Promise<string>{const id=uid();this.sql.exec('INSERT INTO piece_operation(id,commande_id,cle,nom,type_mime,categorie) VALUES(?,?,?,?,?,?)',id,commandeId,cle,nom,typeMime,categorie);return id}
  async listerPiecesOperations():Promise<Record<string,unknown>[]>{return this.sql.exec('SELECT * FROM piece_operation ORDER BY created_at DESC').toArray() as never}
  async getPieceOperation(id:string):Promise<string|null>{return (this.sql.exec('SELECT cle FROM piece_operation WHERE id=?',id).toArray()[0] as {cle:string}|undefined)?.cle??null}
  async supprimerPieceOperation(id:string):Promise<string|null>{const cle=await this.getPieceOperation(id);this.sql.exec('DELETE FROM piece_operation WHERE id=?',id);return cle}
  async ajouterDisponibiliteEquipe(d:{utilisateurId:string;nom:string;type:string;debut:string;fin:string;motif?:string|null}):Promise<string>{const id=uid();this.sql.exec('INSERT INTO disponibilite_equipe(id,utilisateur_id,nom,type,debut,fin,motif) VALUES(?,?,?,?,?,?,?)',id,d.utilisateurId,d.nom,d.type,d.debut,d.fin,d.motif??null);return id}
  async listerDisponibilitesEquipe():Promise<Record<string,unknown>[]>{return this.sql.exec('SELECT * FROM disponibilite_equipe ORDER BY debut').toArray() as never}
  async supprimerDisponibiliteEquipe(id:string):Promise<void>{this.sql.exec('DELETE FROM disponibilite_equipe WHERE id=?',id)}
  async ajouterFraisEquipe(d:{utilisateurId:string;nom:string;type:string;libelle:string;montant:number;modePaiement:string;date:string;depenseId?:string|null}):Promise<string>{const id=uid();this.sql.exec('INSERT INTO frais_equipe(id,utilisateur_id,nom,type,libelle,montant,mode_paiement,date,depense_id) VALUES(?,?,?,?,?,?,?,?,?)',id,d.utilisateurId,d.nom,d.type,d.libelle,d.montant,d.modePaiement,d.date,d.depenseId??null);return id}
  async listerFraisEquipe():Promise<Record<string,unknown>[]>{return this.sql.exec('SELECT * FROM frais_equipe ORDER BY date DESC').toArray() as never}
  async commandeExiste(id: string): Promise<boolean> { return !!this.sql.exec('SELECT 1 FROM commande WHERE id=?', id).toArray()[0]; }
  async attacherPieceCommande(id: string, cle: string | null): Promise<void> { this.sql.exec('UPDATE commande SET piece_cle=? WHERE id=?', cle, id); }
  async getPieceCommande(id: string): Promise<string | null> { return (this.sql.exec('SELECT piece_cle FROM commande WHERE id=?', id).toArray()[0] as { piece_cle: string | null } | undefined)?.piece_cle ?? null; }

  async creerFactureDepuisCommande(id: string, clientUuid?: string | null): Promise<string> {
    const c = this.sql.exec('SELECT tiers_id,libelle,montant,facture_id FROM commande WHERE id=?', id).toArray()[0] as { tiers_id:string|null;libelle:string;montant:number|null;facture_id:string|null } | undefined;
    if (!c) throw new Error('Opération introuvable');
    if (c.facture_id) return c.facture_id;
    if (!c.tiers_id) throw new Error('Un client est requis pour créer la facture');
    if (!c.montant || c.montant <= 0) throw new Error('Un montant est requis pour créer la facture');
    const factureId = await this.creerFacture({ type:'facture', tiersId:c.tiers_id, lignes:[{designation:c.libelle,quantite:1,prixUnitaire:c.montant}], clientUuid });
    this.sql.exec('UPDATE commande SET facture_id=? WHERE id=?', factureId, id);
    return factureId;
  }

  private recalculerProgressionOperation(commandeId: string): void {
    const r = this.sql.exec(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN statut='terminee' THEN 1 ELSE 0 END) AS faites
         FROM tache_operation WHERE commande_id=?`, commandeId,
    ).toArray()[0] as { total: number; faites: number | null };
    const progression = r.total ? Math.round(((r.faites ?? 0) / r.total) * 100) : 0;
    this.sql.exec("UPDATE commande SET progression=?, updated_at=datetime('now') WHERE id=?", progression, commandeId);
  }

  /** Nombre de commandes actives (non livrées, non annulées) — pour le tableau de bord. */
  async commandesActives(): Promise<number> {
    const r = this.sql.exec(
      "SELECT COUNT(*) AS n FROM commande WHERE statut NOT IN ('livree','annulee')",
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
    tauxTva?: number; regimeFiscal?: string | null; dateOperation?: string | null; agence?: string | null;
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
    this.verifierMoisNonCloture(dateOp);
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
                              tiers_id, recurrente, ecriture_id, client_uuid, date, agence, cree_par)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        depenseId, exerciceId, d.categorie, d.compteNumero, d.libelle, montant, d.modePaiement,
        d.tiersId ?? null, d.recurrente ? 1 : 0, ecritureId, d.clientUuid ?? null, dateOp,
        d.agence ?? null, acteur.utilisateurId,
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
              d.recurrente, d.date, t.nom AS tiers_nom, d.piece_cle, d.agence, d.cree_par, d.ecriture_id
         FROM depense d LEFT JOIN tiers t ON t.id = d.tiers_id
        ORDER BY d.created_at DESC`,
    ).toArray() as never;
  }

  /**
   * Analyse des dépenses sur une période [debut, fin) — défaut : mois civil courant. Répond aux
   * questions qu'un simple total + liste ne montre pas (audit reporting 2026-09-04) : où va
   * l'argent, qu'est-ce qui augmente, qui coûte le plus, qu'est-ce qui manque de justificatif.
   */
  async analyseDepenses(periode?: { debut: string; fin: string }, moisEvolution = 6, filtreAgence?: string): Promise<{
    periode: { debut: string; fin: string };
    total: number;
    parCategorie: { categorie: string; libelle: string; total: number }[];
    evolutionMensuelle: { moisLabel: string; total: number }[];
    budget: { plafondDepenses: number | null; ecart: number | null } | null;
    postesEnHausse: { categorie: string; libelle: string; moisCourant: number; moisPrecedent: number; deltaMontant: number }[];
    recurrentes: Record<string, unknown>[];
    topFournisseurs: { tiersId: string | null; nom: string; total: number; nb: number }[];
    inhabituelles: { categorie: string; libelle: string; total: number; moyenneHistorique: number }[];
    sansJustificatif: Record<string, unknown>[];
    parAgence: { agence: string; total: number }[];
  }> {
    const aujourdhui = this.dateCourante();
    const [debut, fin] = periode ? [periode.debut, periode.fin] : this.bornesMois(aujourdhui);
    // Filtre agence (audit reporting 2026-09-04, retour testeur) : optionnel, ne s'applique qu'à
    // cette analyse (les dimensions CA/marge/produits/clients du rapport global n'ont pas de
    // notion d'agence — voir `rapport()`). `agenceParam` vaut toujours un tableau (vide ou à un
    // élément) pour pouvoir le spread dans chaque appel sans dupliquer la logique conditionnelle.
    const clauseAgence = filtreAgence ? 'AND agence = ?' : '';
    const clauseAgenceD = filtreAgence ? 'AND d.agence = ?' : '';
    const agenceParam = filtreAgence ? [filtreAgence] : [];

    const total = (this.sql.exec(
      `SELECT COALESCE(SUM(montant), 0) AS total FROM depense WHERE date >= ? AND date < ? ${clauseAgence}`,
      debut, fin, ...agenceParam,
    ).toArray()[0] as { total: number }).total;

    const parCategorieRaw = this.sql.exec(
      `SELECT categorie, COALESCE(SUM(montant), 0) AS total FROM depense
        WHERE date >= ? AND date < ? ${clauseAgence} GROUP BY categorie ORDER BY total DESC`,
      debut, fin, ...agenceParam,
    ).toArray() as { categorie: string; total: number }[];
    const parCategorie = parCategorieRaw.map((c) => ({ ...c, libelle: this.labelCategorieDepense(c.categorie) }));

    // Évolution sur les `moisEvolution` derniers mois civils (mois de `fin` exclu, glissant vers le
    // passé) — 6 par défaut (Dépenses/cockpit), 12 pour un rapport annuel (voir `rapport()`, sinon
    // « évolution des dépenses » d'une année ne montrerait que ses 6 derniers mois, tronquée).
    const evolutionMensuelle: { moisLabel: string; total: number }[] = [];
    for (let i = moisEvolution; i >= 1; i--) {
      const debutM = this.debutMoisPrecedent(fin, i);
      const finM = this.debutMoisPrecedent(fin, i - 1);
      const t = (this.sql.exec(
        `SELECT COALESCE(SUM(montant), 0) AS total FROM depense WHERE date >= ? AND date < ? ${clauseAgence}`,
        debutM, finM, ...agenceParam,
      ).toArray()[0] as { total: number }).total;
      evolutionMensuelle.push({ moisLabel: debutM.slice(0, 7), total: t });
    }

    const budgetRow = this.sql.exec(
      'SELECT plafond_depenses FROM budget_mensuel WHERE annee_mois = ?', debut.slice(0, 7),
    ).toArray()[0] as { plafond_depenses: number | null } | undefined;
    const budget = budgetRow
      ? { plafondDepenses: budgetRow.plafond_depenses, ecart: budgetRow.plafond_depenses != null ? total - budgetRow.plafond_depenses : null }
      : null;

    // Postes en hausse : période courante vs période équivalente précédente (même durée, juste avant).
    const dureeMs = Date.parse(fin) - Date.parse(debut);
    const debutPrecedent = new Date(Date.parse(debut) - dureeMs).toISOString().slice(0, 10);
    const parCategoriePeriode = (d: string, f: string) =>
      this.sql.exec(
        `SELECT categorie, COALESCE(SUM(montant), 0) AS total FROM depense WHERE date >= ? AND date < ? ${clauseAgence} GROUP BY categorie`,
        d, f, ...agenceParam,
      ).toArray() as { categorie: string; total: number }[];
    const catPrecedente = parCategoriePeriode(debutPrecedent, debut);
    const precedentParCat = new Map(catPrecedente.map((c) => [c.categorie, c.total]));
    const postesEnHausse = parCategorieRaw
      .map((c) => {
        const mP = precedentParCat.get(c.categorie) ?? 0;
        return { categorie: c.categorie, libelle: this.labelCategorieDepense(c.categorie), moisCourant: c.total, moisPrecedent: mP, deltaMontant: c.total - mP };
      })
      .filter((c) => c.deltaMontant > 0)
      .sort((a, b) => b.deltaMontant - a.deltaMontant)
      .slice(0, 5);

    const recurrentes = this.sql.exec(
      `SELECT d.id, d.categorie, d.libelle, d.montant, d.date, t.nom AS tiers_nom
         FROM depense d LEFT JOIN tiers t ON t.id = d.tiers_id
        WHERE d.recurrente = 1 AND d.date >= ? AND d.date < ? ${clauseAgenceD} ORDER BY d.montant DESC`,
      debut, fin, ...agenceParam,
    ).toArray() as never;

    const topFournisseurs = this.sql.exec(
      `SELECT d.tiers_id AS tiersId, COALESCE(t.nom, 'Sans fournisseur') AS nom,
              COALESCE(SUM(d.montant), 0) AS total, COUNT(*) AS nb
         FROM depense d LEFT JOIN tiers t ON t.id = d.tiers_id
        WHERE d.date >= ? AND d.date < ? AND d.tiers_id IS NOT NULL ${clauseAgenceD}
        GROUP BY d.tiers_id ORDER BY total DESC LIMIT 5`,
      debut, fin, ...agenceParam,
    ).toArray() as { tiersId: string | null; nom: string; total: number; nb: number }[];

    // Dépenses inhabituelles : même seuil que alertesPilotage (catégorie ≥1.5× sa moyenne des 3
    // mois précédant `debut`, ou nouvelle catégorie ≥20 000 FCFA) — logique partagée volontairement
    // dupliquée ici en lecture pure (pas d'extraction commune pour rester simple, même fenêtre de calcul).
    const debut3mois = this.debutMoisPrecedent(debut, 3);
    const historique3mois = parCategoriePeriode(debut3mois, debut);
    const moyenneParCat = new Map(historique3mois.map((h) => [h.categorie, h.total / 3]));
    const inhabituelles = parCategorieRaw
      .map((c) => ({ categorie: c.categorie, libelle: this.labelCategorieDepense(c.categorie), total: c.total, moyenneHistorique: Math.round(moyenneParCat.get(c.categorie) ?? 0) }))
      .filter((c) => (c.moyenneHistorique >= 5000 && c.total >= c.moyenneHistorique * 1.5 && c.total - c.moyenneHistorique >= 10_000)
        || (c.moyenneHistorique === 0 && c.total >= 20_000));

    const sansJustificatif = this.sql.exec(
      `SELECT d.id, d.categorie, d.libelle, d.montant, d.date, t.nom AS tiers_nom
         FROM depense d LEFT JOIN tiers t ON t.id = d.tiers_id
        WHERE d.piece_cle IS NULL AND d.date >= ? AND d.date < ? ${clauseAgenceD} ORDER BY d.montant DESC`,
      debut, fin, ...agenceParam,
    ).toArray() as never;

    const parAgence = this.sql.exec(
      `SELECT COALESCE(agence, 'Sans agence') AS agence, COALESCE(SUM(montant), 0) AS total
         FROM depense WHERE date >= ? AND date < ? GROUP BY COALESCE(agence, 'Sans agence') ORDER BY total DESC`,
      debut, fin,
    ).toArray() as { agence: string; total: number }[];

    return { periode: { debut, fin }, total, parCategorie, evolutionMensuelle, budget, postesEnHausse, recurrentes, topFournisseurs, inhabituelles, sansJustificatif, parAgence };
  }

  /**
   * Détail des dépenses d'UNE catégorie sur une période (audit reporting 2026-09-04, retour
   * testeur : « l'analyse identifie une catégorie en hausse mais je ne peux pas cliquer dessus
   * pour voir les transactions »). Mêmes colonnes que `listerDepenses()` (contexte complet :
   * justificatif, agence, créateur, écriture liée), filtrées à une catégorie + période + agence
   * en option.
   */
  async depensesParCategorie(
    categorie: string, periode?: { debut: string; fin: string }, filtreAgence?: string,
  ): Promise<Record<string, unknown>[]> {
    const [debut, fin] = periode ? [periode.debut, periode.fin] : this.bornesMois(this.dateCourante());
    const clauseAgence = filtreAgence ? 'AND d.agence = ?' : '';
    const agenceParam = filtreAgence ? [filtreAgence] : [];
    return this.sql.exec(
      `SELECT d.id, d.categorie, d.compte_numero, d.libelle, d.montant, d.mode_paiement,
              d.recurrente, d.date, t.nom AS tiers_nom, d.piece_cle, d.agence, d.cree_par, d.ecriture_id
         FROM depense d LEFT JOIN tiers t ON t.id = d.tiers_id
        WHERE d.categorie = ? AND d.date >= ? AND d.date < ? ${clauseAgence}
        ORDER BY d.montant DESC`,
      categorie, debut, fin, ...agenceParam,
    ).toArray() as never;
  }

  async depenseExiste(depenseId: string): Promise<boolean> {
    return !!this.sql.exec('SELECT 1 FROM depense WHERE id = ?', depenseId).toArray()[0];
  }

  /** Attache (ou retire, si `pieceCle` est null) la clé R2 de la pièce justificative d'une dépense. */
  async attacherPieceDepense(depenseId: string, pieceCle: string | null): Promise<void> {
    const existe = this.sql.exec('SELECT 1 FROM depense WHERE id = ?', depenseId).toArray()[0];
    if (!existe) throw new Error('Dépense introuvable');
    this.sql.exec('UPDATE depense SET piece_cle = ? WHERE id = ?', pieceCle, depenseId);
  }

  /** Clé R2 de la pièce justificative d'une dépense, si elle existe. */
  async getPieceDepense(depenseId: string): Promise<string | null> {
    const row = this.sql.exec('SELECT piece_cle FROM depense WHERE id = ?', depenseId).toArray()[0] as
      | { piece_cle: string | null }
      | undefined;
    return row?.piece_cle ?? null;
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
    return this.caCumuleExercice(this.exerciceOuvert());
  }

  /**
   * CA net d'un exercice précis par année (pas forcément l'exercice courant) — utilisé pour la
   * bascule IGS↔Réel, qui se décide sur le CA de l'exercice CLOS précédent, pas sur le CA en
   * cours d'accumulation de l'exercice courant. Retourne 0 si l'exercice n'existe pas encore
   * (aucune opération n'y a jamais été enregistrée).
   */
  async caCumuleAnnee(annee: number): Promise<number> {
    const ex = this.sql.exec('SELECT id FROM exercice WHERE annee = ?', annee).toArray()[0] as { id: string } | undefined;
    if (!ex) return 0;
    return this.caCumuleExercice(ex.id);
  }

  private caCumuleExercice(exerciceId: string): number {
    // Net (crédits − débits) : un avoir débite le compte de produit pour contre-passer une vente
    // sans la supprimer (immuabilité) — le CA doit refléter ce net, pas le seul brut crédité.
    const row = this.sql
      .exec(
        `SELECT COALESCE(SUM(CASE WHEN l.sens = 'credit' THEN l.montant ELSE -l.montant END), 0) AS ca
           FROM ligne_ecriture l
           JOIN compte_comptable c ON c.id = l.compte_id
           JOIN ecriture e ON e.id = l.ecriture_id
          WHERE c.classe = 7 AND e.statut = 'validee' AND e.exercice_id = ?`,
        exerciceId,
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

  // ══════════════ Cockpit dirigeant (voir docs/PLAN-cockpit-dirigeant.md) ══════════════
  // Uniquement des faits calculés à partir de données déjà saisies — aucune prédiction, aucune
  // nouvelle saisie utilisateur requise (voir DECISIONS.md D18 sur ce choix).

  /** [début, fin) du mois civil contenant `date` (ex. '2026-09-04' → ['2026-09-01','2026-10-01']). */
  private bornesMois(date: string): [string, string] {
    const annee = Number(date.slice(0, 4));
    const mois = Number(date.slice(5, 7));
    const debut = `${date.slice(0, 7)}-01`;
    const moisSuivant = mois === 12 ? 1 : mois + 1;
    const anneeSuivante = mois === 12 ? annee + 1 : annee;
    const fin = `${anneeSuivante}-${String(moisSuivant).padStart(2, '0')}-01`;
    return [debut, fin];
  }

  /** Premier jour du n-ième mois avant celui de `date`. */
  private debutMoisPrecedent(date: string, n: number): string {
    let annee = Number(date.slice(0, 4));
    let mois = Number(date.slice(5, 7)) - n;
    while (mois <= 0) { mois += 12; annee -= 1; }
    return `${annee}-${String(mois).padStart(2, '0')}-01`;
  }

  private labelCategorieDepense(code: string): string {
    return CATEGORIES_DEPENSE.find((c) => c.code === code)?.label ?? code;
  }

  /** CA HT, coût, marge, dépenses et résultat approximatif sur une fenêtre [début, fin). */
  private statsPeriode(debut: string, fin: string): { ca: number; cogs: number; marge: number; depenses: number; resultat: number } {
    const ca = (this.sql.exec(
      `SELECT COALESCE(SUM(CASE WHEN l.sens = 'credit' THEN l.montant ELSE -l.montant END), 0) AS ca
         FROM ligne_ecriture l
         JOIN compte_comptable c ON c.id = l.compte_id
         JOIN ecriture e ON e.id = l.ecriture_id
        WHERE c.classe = 7 AND e.statut = 'validee' AND e.date_operation >= ? AND e.date_operation < ?`,
      debut, fin,
    ).toArray()[0] as { ca: number }).ca;
    const cogs = (this.sql.exec(
      `SELECT COALESCE(SUM(lv.quantite * lv.cout_unitaire), 0) AS cogs
         FROM ligne_vente lv JOIN vente v ON v.id = lv.vente_id
        WHERE v.statut != 'annulee' AND v.date >= ? AND v.date < ?`,
      debut, fin,
    ).toArray()[0] as { cogs: number }).cogs;
    const depenses = (this.sql.exec(
      `SELECT COALESCE(SUM(montant), 0) AS total FROM depense WHERE date >= ? AND date < ?`,
      debut, fin,
    ).toArray()[0] as { total: number }).total;
    const marge = ca - cogs;
    return { ca, cogs, marge, depenses, resultat: marge - depenses };
  }

  /**
   * Comparaison du mois civil courant au mois précédent (CA, marge, dépenses, résultat
   * approximatif) — PAS le compte de résultat officiel (`etatsFinanciers`, cumulé sur l'exercice
   * et basé sur toutes les classes 6/7) : ici on ne regarde que `depense` comme charge autre que
   * le coût des marchandises vendues, pour un instantané rapide, pas une clôture comptable.
   */
  async comparaisonMensuelle(): Promise<{
    moisCourant: { ca: number; cogs: number; marge: number; depenses: number; resultat: number };
    moisPrecedent: { ca: number; cogs: number; marge: number; depenses: number; resultat: number };
    variationCaPct: number | null;
    variationMargePct: number | null;
    variationDepensesPct: number | null;
    topVariationsDepenses: { categorie: string; libelle: string; moisCourant: number; moisPrecedent: number; deltaMontant: number }[];
  }> {
    const aujourdhui = this.dateCourante();
    const [debutCourant, finCourant] = this.bornesMois(aujourdhui);
    const debutPrecedent = this.debutMoisPrecedent(aujourdhui, 1);

    const moisCourant = this.statsPeriode(debutCourant, finCourant);
    const moisPrecedent = this.statsPeriode(debutPrecedent, debutCourant);

    const depensesParCategorie = (debut: string, fin: string) =>
      this.sql.exec(
        `SELECT categorie, COALESCE(SUM(montant), 0) AS total FROM depense WHERE date >= ? AND date < ? GROUP BY categorie`,
        debut, fin,
      ).toArray() as { categorie: string; total: number }[];

    const catCourant = depensesParCategorie(debutCourant, finCourant);
    const catPrecedent = depensesParCategorie(debutPrecedent, debutCourant);
    const courantParCat = new Map(catCourant.map((c) => [c.categorie, c.total]));
    const precedentParCat = new Map(catPrecedent.map((c) => [c.categorie, c.total]));
    const toutesCategories = new Set([...courantParCat.keys(), ...precedentParCat.keys()]);
    const topVariationsDepenses = [...toutesCategories]
      .map((categorie) => {
        const mC = courantParCat.get(categorie) ?? 0;
        const mP = precedentParCat.get(categorie) ?? 0;
        return { categorie, libelle: this.labelCategorieDepense(categorie), moisCourant: mC, moisPrecedent: mP, deltaMontant: mC - mP };
      })
      .sort((a, b) => Math.abs(b.deltaMontant) - Math.abs(a.deltaMontant))
      .slice(0, 3);

    const pct = (actuel: number, precedent: number) =>
      precedent === 0 ? null : Math.round(((actuel - precedent) / precedent) * 1000) / 10;

    return {
      moisCourant, moisPrecedent,
      variationCaPct: pct(moisCourant.ca, moisPrecedent.ca),
      variationMargePct: pct(moisCourant.marge, moisPrecedent.marge),
      variationDepensesPct: pct(moisCourant.depenses, moisPrecedent.depenses),
      topVariationsDepenses,
    };
  }

  /**
   * Marge par produit (CA HT, coût, marge, % marge), triée par marge décroissante. Sans `periode`,
   * porte sur l'exercice ouvert (comportement historique, dont dépend le cockpit) ; avec `periode`
   * (rapports mensuels/trimestriels/annuels/comparaisons), filtre par date de vente à la place.
   */
  async margeParProduit(periode?: { debut: string; fin: string }): Promise<Record<string, unknown>[]> {
    const clauseDate = periode ? 'v.date >= ? AND v.date < ?' : 'v.exercice_id = ?';
    const params = periode ? [periode.debut, periode.fin] : [this.exerciceOuvert()];
    const rows = this.sql.exec(
      `SELECT lv.designation, SUM(lv.quantite) AS quantite, SUM(lv.montant_ht) AS ca_ht,
              SUM(lv.quantite * lv.cout_unitaire) AS cogs
         FROM ligne_vente lv JOIN vente v ON v.id = lv.vente_id
        WHERE v.statut != 'annulee' AND ${clauseDate}
        GROUP BY lv.designation
        ORDER BY (SUM(lv.montant_ht) - SUM(lv.quantite * lv.cout_unitaire)) DESC`,
      ...params,
    ).toArray() as { designation: string; quantite: number; ca_ht: number; cogs: number }[];
    return rows.map((r) => {
      const marge = r.ca_ht - r.cogs;
      return { ...r, marge, margePct: r.ca_ht > 0 ? Math.round((marge / r.ca_ht) * 1000) / 10 : null };
    });
  }

  /**
   * Marge par client (CA HT, coût, marge, % marge) sur l'exercice ouvert, triée par marge
   * décroissante — répond à « quels clients me rapportent vraiment », distinct du volume vendu.
   * Les ventes sans client identifié (comptant, client de passage) sont regroupées à part.
   */
  async margeParClient(periode?: { debut: string; fin: string }): Promise<Record<string, unknown>[]> {
    const clauseDate = periode ? 'v.date >= ? AND v.date < ?' : 'v.exercice_id = ?';
    const params = periode ? [periode.debut, periode.fin] : [this.exerciceOuvert()];
    const rows = this.sql.exec(
      `SELECT v.tiers_id, COALESCE(t.nom, 'Vente au comptant / client de passage') AS nom,
              COUNT(DISTINCT v.id) AS nb_ventes, SUM(lv.montant_ht) AS ca_ht,
              SUM(lv.quantite * lv.cout_unitaire) AS cogs
         FROM ligne_vente lv JOIN vente v ON v.id = lv.vente_id LEFT JOIN tiers t ON t.id = v.tiers_id
        WHERE v.statut != 'annulee' AND ${clauseDate}
        GROUP BY COALESCE(v.tiers_id, 'sans_client')
        ORDER BY (SUM(lv.montant_ht) - SUM(lv.quantite * lv.cout_unitaire)) DESC`,
      ...params,
    ).toArray() as { tiers_id: string | null; nom: string; nb_ventes: number; ca_ht: number; cogs: number }[];
    return rows.map((r) => {
      const marge = r.ca_ht - r.cogs;
      return { ...r, marge, margePct: r.ca_ht > 0 ? Math.round((marge / r.ca_ht) * 1000) / 10 : null };
    });
  }

  /**
   * Délai moyen de paiement (en jours) des créances soldées cette année — factures et ventes à
   * crédit dont le dernier règlement est intervenu après l'émission. Ne compte que les créances
   * effectivement soldées (pas les encore ouvertes, dont le délai final n'est pas encore connu).
   */
  async delaiMoyenPaiement(periode?: { debut: string; fin: string }): Promise<{ jours: number | null; echantillon: number }> {
    const facturesReglees = this.sql.exec(
      `SELECT f.date_emission AS emission, MAX(p.date) AS dernier_paiement
         FROM facture f JOIN paiement_facture p ON p.facture_id = f.id
        WHERE f.type = 'facture' AND f.statut = 'payee' AND f.date_emission IS NOT NULL
        GROUP BY f.id`,
    ).toArray() as { emission: string; dernier_paiement: string }[];
    const ventesReglees = this.sql.exec(
      `SELECT v.date AS emission, MAX(p.date) AS dernier_paiement
         FROM vente v JOIN paiement_vente p ON p.vente_id = v.id
        WHERE v.statut = 'payee'
        GROUP BY v.id`,
    ).toArray() as { emission: string; dernier_paiement: string }[];

    const dansLaPeriode = (r: { dernier_paiement: string }) =>
      !periode || (r.dernier_paiement >= periode.debut && r.dernier_paiement < periode.fin);
    const delais = [...facturesReglees, ...ventesReglees]
      .filter(dansLaPeriode)
      .map((r) => (Date.parse(r.dernier_paiement) - Date.parse(r.emission)) / 86_400_000)
      .filter((j) => Number.isFinite(j) && j >= 0);
    if (delais.length === 0) return { jours: null, echantillon: 0 };
    const moyenne = delais.reduce((s, j) => s + j, 0) / delais.length;
    return { jours: Math.round(moyenne * 10) / 10, echantillon: delais.length };
  }

  /**
   * Alertes de pilotage — consolide les retards déjà calculés ailleurs (créances, dettes) et
   * détecte deux situations nouvelles à partir de données existantes : une catégorie de dépense
   * anormalement haute ce mois (vs moyenne des 3 mois précédents) et une vente conclue sous son
   * coût de revient. Jamais bloquant — la survente reste volontairement autorisée (D18) ; ceci ne
   * fait que signaler après coup.
   */
  async alertesPilotage(): Promise<{ type: string; gravite: 'attention' | 'critique'; libelle: string }[]> {
    const alertes: { type: string; gravite: 'attention' | 'critique'; libelle: string }[] = [];
    const aujourdhui = this.dateCourante();

    const impayees = await this.listerFacturesImpayees() as
      { numero: string | null; montantDu: number; enRetard: boolean }[];
    for (const f of impayees) {
      if (f.enRetard) alertes.push({ type: 'creance', gravite: 'critique', libelle: `${f.numero ?? 'Facture'} en retard — ${f.montantDu} FCFA dus` });
    }

    const ventesCredit = await this.listerVentesACredit() as
      { tiers_nom: string | null; total_ttc: number; regle: number; enRetard: boolean }[];
    for (const v of ventesCredit) {
      if (v.enRetard) alertes.push({ type: 'creance', gravite: 'critique', libelle: `${v.tiers_nom ?? 'Client'} doit ${v.total_ttc - v.regle} FCFA, en retard` });
    }

    const dettes = await this.listerDettesFournisseurs() as
      { tiers_nom: string | null; total_ttc: number; regle: number; enRetard: boolean }[];
    for (const d of dettes) {
      if (d.enRetard) alertes.push({ type: 'dette', gravite: 'attention', libelle: `${d.tiers_nom ?? 'Fournisseur'} à régler — ${d.total_ttc - d.regle} FCFA en retard` });
    }

    // Dépenses anormales : mois courant vs moyenne des 3 mois précédents, par catégorie.
    const [debutCourant, finCourant] = this.bornesMois(aujourdhui);
    const debut3mois = this.debutMoisPrecedent(aujourdhui, 3);
    const courant = this.sql.exec(
      `SELECT categorie, COALESCE(SUM(montant), 0) AS total FROM depense WHERE date >= ? AND date < ? GROUP BY categorie`,
      debutCourant, finCourant,
    ).toArray() as { categorie: string; total: number }[];
    const historique = this.sql.exec(
      `SELECT categorie, COALESCE(SUM(montant), 0) AS total FROM depense WHERE date >= ? AND date < ? GROUP BY categorie`,
      debut3mois, debutCourant,
    ).toArray() as { categorie: string; total: number }[];
    const moyenneParCat = new Map(historique.map((h) => [h.categorie, h.total / 3]));
    for (const c of courant) {
      const moyenne = moyenneParCat.get(c.categorie) ?? 0;
      const libelleCat = this.labelCategorieDepense(c.categorie);
      if (moyenne >= 5000 && c.total >= moyenne * 1.5 && c.total - moyenne >= 10_000) {
        alertes.push({
          type: 'depense', gravite: 'attention',
          libelle: `Dépenses « ${libelleCat} » à ${c.total} FCFA ce mois, contre ${Math.round(moyenne)} FCFA en moyenne les 3 mois précédents`,
        });
      } else if (moyenne === 0 && c.total >= 20_000) {
        alertes.push({
          type: 'depense', gravite: 'attention',
          libelle: `Nouvelle dépense « ${libelleCat} » : ${c.total} FCFA ce mois (rien les 3 mois précédents)`,
        });
      }
    }

    // Ventes conclues sous le coût de revient, ce mois-ci.
    const ventesAPerte = this.sql.exec(
      `SELECT lv.designation, COUNT(*) AS n, SUM((lv.cout_unitaire - lv.prix_unitaire) * lv.quantite) AS perte
         FROM ligne_vente lv JOIN vente v ON v.id = lv.vente_id
        WHERE v.statut != 'annulee' AND lv.cout_unitaire > 0 AND lv.prix_unitaire < lv.cout_unitaire
          AND v.date >= ? AND v.date < ?
        GROUP BY lv.designation ORDER BY perte DESC LIMIT 5`,
      debutCourant, finCourant,
    ).toArray() as { designation: string; n: number; perte: number }[];
    for (const v of ventesAPerte) {
      alertes.push({
        type: 'marge', gravite: 'attention',
        libelle: `${v.designation} vendu sous son coût ${v.n} fois ce mois — perte estimée ${v.perte} FCFA`,
      });
    }

    return alertes;
  }

  /** Agrège tout le cockpit dirigeant en un seul appel réseau (Dashboard). */
  async cockpit(): Promise<{
    tresorerie: { especes: number; mtnMomo: number; orangeMoney: number; banque: number };
    margeCumulee: number;
    comparaisonMensuelle: Awaited<ReturnType<EntrepriseDO['comparaisonMensuelle']>>;
    alertes: { type: string; gravite: 'attention' | 'critique'; libelle: string }[];
    topProduits: Record<string, unknown>[];
    delaiMoyenPaiement: { jours: number | null; echantillon: number };
  }> {
    const [tresorerie, margeCumulee, comparaison, alertes, produits, delaiMoyenPaiement] = await Promise.all([
      this.soldesTresorerie(),
      this.margeCumulee(),
      this.comparaisonMensuelle(),
      this.alertesPilotage(),
      this.margeParProduit(),
      this.delaiMoyenPaiement(),
    ]);
    return {
      tresorerie, margeCumulee, comparaisonMensuelle: comparaison, alertes,
      topProduits: produits.slice(0, 3), delaiMoyenPaiement,
    };
  }

  // ══════════════ Budgets & prévisions (audit reporting 2026-09-04) ══════════════

  /** Définit (ou met à jour) l'objectif du mois : CA cible, plafond de dépenses, marge cible. */
  async definirBudget(
    anneeMois: string,
    d: { caCible?: number | null; plafondDepenses?: number | null; margeCiblePct?: number | null },
    acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' },
  ): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(anneeMois)) throw new Error('Format de mois invalide (attendu AAAA-MM)');
    this.sql.exec(
      `INSERT INTO budget_mensuel (annee_mois, ca_cible, plafond_depenses, marge_cible_pct, cree_par, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(annee_mois) DO UPDATE SET
         ca_cible = excluded.ca_cible, plafond_depenses = excluded.plafond_depenses,
         marge_cible_pct = excluded.marge_cible_pct, cree_par = excluded.cree_par, updated_at = datetime('now')`,
      anneeMois, d.caCible ?? null, d.plafondDepenses ?? null, d.margeCiblePct ?? null, acteur.utilisateurId,
    );
    this.journaliser({ acteur, action: 'budget.definir', entite: 'budget_mensuel', entiteId: anneeMois, apres: d });
  }

  async getBudget(anneeMois: string): Promise<Record<string, unknown> | null> {
    return (this.sql.exec('SELECT * FROM budget_mensuel WHERE annee_mois = ?', anneeMois).toArray()[0] as Record<string, unknown> | undefined) ?? null;
  }

  async listerBudgets(): Promise<Record<string, unknown>[]> {
    return this.sql.exec('SELECT * FROM budget_mensuel ORDER BY annee_mois DESC').toArray() as never;
  }

  /** Moyenne mensuelle des dépenses récurrentes sur les 3 derniers mois — proxy des charges fixes. */
  private chargesFixesMensuellesMoyennes(): number {
    const aujourdhui = this.dateCourante();
    const debut3mois = this.debutMoisPrecedent(aujourdhui, 3);
    const total = (this.sql.exec(
      `SELECT COALESCE(SUM(montant), 0) AS total FROM depense WHERE recurrente = 1 AND date >= ? AND date < ?`,
      debut3mois, aujourdhui,
    ).toArray()[0] as { total: number }).total;
    return Math.round(total / 3);
  }

  /**
   * Prévision de trésorerie à `horizonJours` (30/60/90) : solde actuel + créances attendues à
   * échéance dans l'horizon − dettes attendues à échéance dans l'horizon − dépenses récurrentes
   * projetées sur l'horizon (moyenne des 3 derniers mois). Approximation volontairement simple —
   * pas de modèle statistique, juste ce qui est déjà connu (échéances) + une tendance récente.
   */
  async previsionTresorerie(horizonJours: 30 | 60 | 90): Promise<{
    soldeActuel: number; entreesAttendues: number; sortiesAttendues: number; soldeProjete: number; horizonJours: number;
  }> {
    const soldes = await this.soldesTresorerie();
    const soldeActuel = soldes.especes + soldes.mtnMomo + soldes.orangeMoney + soldes.banque;
    const aujourdhui = this.dateCourante();
    const limite = new Date(Date.parse(aujourdhui) + horizonJours * 86_400_000).toISOString().slice(0, 10);

    const ventesCredit = await this.listerVentesACredit() as { date_echeance: string | null; total_ttc: number; regle: number }[];
    const facturesImpayees = await this.listerFacturesImpayees() as { date_echeance: string | null; total_ttc: number; regle: number }[];
    const entreesAttendues = [...ventesCredit, ...facturesImpayees]
      .filter((c) => c.date_echeance !== null && c.date_echeance >= aujourdhui && c.date_echeance <= limite)
      .reduce((s, c) => s + (c.total_ttc - c.regle), 0);

    const dettes = await this.listerDettesFournisseurs() as { date_echeance: string | null; total_ttc: number; regle: number }[];
    const sortiesDettes = dettes
      .filter((d) => d.date_echeance !== null && d.date_echeance >= aujourdhui && d.date_echeance <= limite)
      .reduce((s, d) => s + (d.total_ttc - d.regle), 0);

    const sortiesRecurrentes = Math.round(this.chargesFixesMensuellesMoyennes() * (horizonJours / 30));
    const sortiesAttendues = sortiesDettes + sortiesRecurrentes;

    return { soldeActuel, entreesAttendues, sortiesAttendues, soldeProjete: soldeActuel + entreesAttendues - sortiesAttendues, horizonJours };
  }

  /**
   * Seuil de rentabilité (point mort) : charges fixes mensuelles ÷ taux de marge sur coûts
   * variables. `margeSurCoutsVariablesPct` vient de la marge cumulée sur l'exercice (CA/coût déjà
   * calculés ailleurs pour la rentabilité produit) — proxy, pas une comptabilité analytique complète.
   */
  async seuilRentabilite(): Promise<{ margeSurCoutsVariablesPct: number | null; chargesFixesMensuelles: number; seuilCaMensuel: number | null }> {
    const produits = await this.margeParProduit() as { ca_ht: number; marge: number }[];
    const caTotal = produits.reduce((s, p) => s + p.ca_ht, 0);
    const margeTotal = produits.reduce((s, p) => s + p.marge, 0);
    const margeSurCoutsVariablesPct = caTotal > 0 ? Math.round((margeTotal / caTotal) * 1000) / 10 : null;
    const chargesFixesMensuelles = this.chargesFixesMensuellesMoyennes();
    const seuilCaMensuel = margeSurCoutsVariablesPct && margeSurCoutsVariablesPct > 0
      ? Math.round(chargesFixesMensuelles / (margeSurCoutsVariablesPct / 100))
      : null;
    return { margeSurCoutsVariablesPct, chargesFixesMensuelles, seuilCaMensuel };
  }

  /**
   * Simulation à la volée (aucun état persisté) : impact d'une baisse de ventes ou d'un
   * recrutement/investissement sur la marge du mois courant. Sert à répondre vite à « et si… »
   * sans construire un vrai modèle prévisionnel — hypothèse simple : le taux de marge reste
   * constant quand le CA varie.
   */
  async simulerScenario(
    type: 'baisse_ventes' | 'recrutement_investissement', params: { pct?: number; coutMensuel?: number },
  ): Promise<Record<string, number | null>> {
    const comp = await this.comparaisonMensuelle();
    const { ca, marge } = comp.moisCourant;
    if (type === 'baisse_ventes') {
      const pct = params.pct ?? 0;
      const tauxMarge = ca > 0 ? marge / ca : 0;
      const caProjete = Math.round(ca * (1 - pct / 100));
      const margeProjetee = Math.round(caProjete * tauxMarge);
      return { caActuel: ca, caProjete, margeActuelle: marge, margeProjetee, impactMarge: margeProjetee - marge };
    }
    const coutMensuel = params.coutMensuel ?? 0;
    const margeProjetee = marge - coutMensuel;
    return { margeActuelle: marge, coutMensuel, margeProjetee, impactMarge: margeProjetee - marge };
  }

  // ══════════════ Rapports & Analyses (audit reporting 2026-09-04) ══════════════

  /**
   * Rapport agrégé sur une période (mensuel/trimestriel/annuel/comparaison — le découpage exact
   * de `periode` est calculé côté route/frontend, ce point ne fait que restituer les données pour
   * l'intervalle donné). Réutilise `statsPeriode` (déjà utilisé par `comparaisonMensuelle`),
   * `analyseDepenses`, `margeParProduit`/`margeParClient` (généralisées à une période, voir plus
   * haut) — rien n'est recalculé en double.
   */
  async rapport(params: {
    type: 'mensuel' | 'trimestriel' | 'annuel' | 'comparaison' | 'personnalise';
    periode: { debut: string; fin: string };
    periodeComparaison?: { debut: string; fin: string };
    agence?: string;
  }): Promise<{
    type: string;
    periode: { debut: string; fin: string };
    stats: { ca: number; cogs: number; marge: number; depenses: number; resultat: number };
    depenses: Awaited<ReturnType<EntrepriseDO['analyseDepenses']>>;
    produits: Record<string, unknown>[];
    clients: Record<string, unknown>[];
    tresorerie: { especes: number; mtnMomo: number; orangeMoney: number; banque: number };
    delaiMoyenPaiement: { jours: number | null; echantillon: number };
    comparaison: {
      periode: { debut: string; fin: string };
      stats: { ca: number; cogs: number; marge: number; depenses: number; resultat: number };
      variationCaPct: number | null; variationMargePct: number | null; variationDepensesPct: number | null;
    } | null;
  }> {
    const [depenses, produits, clients, tresorerie, delaiMoyenPaiement] = await Promise.all([
      this.analyseDepenses(params.periode, params.type === 'annuel' ? 12 : 6, params.agence),
      this.margeParProduit(params.periode),
      this.margeParClient(params.periode),
      this.soldesTresorerie(),
      this.delaiMoyenPaiement(params.periode),
    ]);
    const stats = this.statsPeriode(params.periode.debut, params.periode.fin);

    let comparaison = null;
    if (params.periodeComparaison) {
      const statsPrec = this.statsPeriode(params.periodeComparaison.debut, params.periodeComparaison.fin);
      const pct = (actuel: number, precedent: number) => (precedent === 0 ? null : Math.round(((actuel - precedent) / precedent) * 1000) / 10);
      comparaison = {
        periode: params.periodeComparaison, stats: statsPrec,
        variationCaPct: pct(stats.ca, statsPrec.ca),
        variationMargePct: pct(stats.marge, statsPrec.marge),
        variationDepensesPct: pct(stats.depenses, statsPrec.depenses),
      };
    }

    return { type: params.type, periode: params.periode, stats, depenses, produits, clients, tresorerie, delaiMoyenPaiement, comparaison };
  }

  // ══════════════ À décider (audit reporting 2026-09-04) ══════════════

  /**
   * Synthèse quotidienne priorisée : au lieu d'obliger le dirigeant à consulter chaque module,
   * construit une liste de problèmes candidats à partir de signaux déjà calculés ailleurs
   * (créances/dettes en retard, dépense anormale, vente à perte, dépassement de budget,
   * trésorerie prévisionnelle négative), chacun avec un impact financier chiffré, et retourne les
   * 3 plus importants. Contrairement à `alertesPilotage` (liste plate, texte uniquement), chaque
   * problème porte une cause, une urgence et une action suggérée avec sa cible de navigation.
   */
  async problemesPrioritaires(): Promise<{
    probleme: string; impactFinancier: number; cause: string; urgence: 'faible' | 'moyenne' | 'haute';
    actionSuggeree: string; actionCible: { page: string };
  }[]> {
    const candidats: { probleme: string; impactFinancier: number; cause: string; urgence: 'faible' | 'moyenne' | 'haute'; actionSuggeree: string; actionCible: { page: string } }[] = [];
    const aujourdhui = this.dateCourante();

    const impayees = await this.listerFacturesImpayees() as { numero: string | null; montantDu: number; enRetard: boolean }[];
    for (const f of impayees) {
      if (f.enRetard && f.montantDu > 0) {
        candidats.push({
          probleme: `${f.numero ?? 'Facture'} impayée`, impactFinancier: f.montantDu,
          cause: 'Échéance de paiement dépassée', urgence: 'haute',
          actionSuggeree: 'Relancer le client', actionCible: { page: 'creances' },
        });
      }
    }
    const ventesCredit = await this.listerVentesACredit() as { tiers_nom: string | null; total_ttc: number; regle: number; enRetard: boolean }[];
    for (const v of ventesCredit) {
      const du = v.total_ttc - v.regle;
      if (v.enRetard && du > 0) {
        candidats.push({
          probleme: `${v.tiers_nom ?? 'Client'} doit ${du} FCFA`, impactFinancier: du,
          cause: 'Vente à crédit en retard de paiement', urgence: 'haute',
          actionSuggeree: 'Relancer le client', actionCible: { page: 'creances' },
        });
      }
    }
    const dettes = await this.listerDettesFournisseurs() as { tiers_nom: string | null; total_ttc: number; regle: number; enRetard: boolean }[];
    for (const d of dettes) {
      const du = d.total_ttc - d.regle;
      if (d.enRetard && du > 0) {
        candidats.push({
          probleme: `${d.tiers_nom ?? 'Fournisseur'} à régler`, impactFinancier: du,
          cause: 'Dette fournisseur en retard de règlement', urgence: 'moyenne',
          actionSuggeree: 'Planifier le règlement', actionCible: { page: 'dettes' },
        });
      }
    }

    // Dépense anormale du mois — même seuil qu'alertesPilotage/analyseDepenses.inhabituelles.
    const [debutCourant, finCourant] = this.bornesMois(aujourdhui);
    const debut3mois = this.debutMoisPrecedent(aujourdhui, 3);
    const courant = this.sql.exec(
      `SELECT categorie, COALESCE(SUM(montant), 0) AS total FROM depense WHERE date >= ? AND date < ? GROUP BY categorie`,
      debutCourant, finCourant,
    ).toArray() as { categorie: string; total: number }[];
    const historique = this.sql.exec(
      `SELECT categorie, COALESCE(SUM(montant), 0) AS total FROM depense WHERE date >= ? AND date < ? GROUP BY categorie`,
      debut3mois, debutCourant,
    ).toArray() as { categorie: string; total: number }[];
    const moyenneParCat = new Map(historique.map((h) => [h.categorie, h.total / 3]));
    for (const c of courant) {
      const moyenne = moyenneParCat.get(c.categorie) ?? 0;
      const libelleCat = this.labelCategorieDepense(c.categorie);
      const anormale = (moyenne >= 5000 && c.total >= moyenne * 1.5 && c.total - moyenne >= 10_000) || (moyenne === 0 && c.total >= 20_000);
      if (anormale) {
        candidats.push({
          probleme: `Dépenses « ${libelleCat} » en hausse`, impactFinancier: Math.round(c.total - moyenne),
          cause: `${c.total} FCFA ce mois contre ${Math.round(moyenne)} FCFA en moyenne les 3 mois précédents`,
          urgence: 'moyenne', actionSuggeree: 'Vérifier le poste', actionCible: { page: 'depenses' },
        });
      }
    }

    // Ventes conclues sous le coût de revient, ce mois-ci.
    const ventesAPerte = this.sql.exec(
      `SELECT lv.designation, COUNT(*) AS n, SUM((lv.cout_unitaire - lv.prix_unitaire) * lv.quantite) AS perte
         FROM ligne_vente lv JOIN vente v ON v.id = lv.vente_id
        WHERE v.statut != 'annulee' AND lv.cout_unitaire > 0 AND lv.prix_unitaire < lv.cout_unitaire
          AND v.date >= ? AND v.date < ?
        GROUP BY lv.designation ORDER BY perte DESC LIMIT 3`,
      debutCourant, finCourant,
    ).toArray() as { designation: string; n: number; perte: number }[];
    for (const v of ventesAPerte) {
      if (v.perte > 0) {
        candidats.push({
          probleme: `${v.designation} vendu sous son coût`, impactFinancier: v.perte,
          cause: `Vendu ${v.n} fois en dessous du prix de revient ce mois`, urgence: 'moyenne',
          actionSuggeree: 'Revoir le prix de vente', actionCible: { page: 'rentabilite' },
        });
      }
    }

    // Dépassement du plafond de dépenses du mois (Budgets).
    const budgetRow = this.sql.exec(
      'SELECT plafond_depenses FROM budget_mensuel WHERE annee_mois = ?', debutCourant.slice(0, 7),
    ).toArray()[0] as { plafond_depenses: number | null } | undefined;
    if (budgetRow?.plafond_depenses != null) {
      const totalDepenses = courant.reduce((s, c) => s + c.total, 0);
      const ecart = totalDepenses - budgetRow.plafond_depenses;
      if (ecart > 0) {
        candidats.push({
          probleme: 'Plafond de dépenses dépassé', impactFinancier: ecart,
          cause: `${totalDepenses} FCFA dépensés ce mois pour un plafond de ${budgetRow.plafond_depenses} FCFA`,
          urgence: 'haute', actionSuggeree: 'Revoir le budget du mois', actionCible: { page: 'compta-budgets' },
        });
      }
    }

    // Trésorerie prévisionnelle négative à 30 jours — la cause doit refléter précisément CE QUI
    // rend le solde négatif (audit 2026-09-04, retour testeur) : une trésorerie déjà négative
    // sans aucun mouvement prévu n'a pas la même cause qu'une trésorerie qui va se dégrader.
    const prevision = await this.previsionTresorerie(30);
    if (prevision.soldeProjete < 0) {
      const dejaNegative = prevision.soldeActuel < 0;
      const aucunMouvementPrevu = prevision.entreesAttendues === 0 && prevision.sortiesAttendues === 0;
      const cause = dejaNegative && aucunMouvementPrevu
        ? `Trésorerie déjà négative (${prevision.soldeActuel} FCFA), aucun encaissement ni décaissement prévu dans les 30 prochains jours pour la résorber`
        : dejaNegative
          ? `Trésorerie déjà négative (${prevision.soldeActuel} FCFA) ; encaissements attendus ${prevision.entreesAttendues} FCFA, décaissements attendus ${prevision.sortiesAttendues} FCFA`
          : `Décaissements attendus (${prevision.sortiesAttendues} FCFA) supérieurs aux encaissements attendus (${prevision.entreesAttendues} FCFA)`;
      candidats.push({
        probleme: 'Trésorerie prévisionnelle négative à 30 jours', impactFinancier: -prevision.soldeProjete,
        cause, urgence: 'haute',
        actionSuggeree: 'Anticiper les encaissements ou reporter des dépenses', actionCible: { page: 'compta-budgets' },
      });
    }

    return candidats.sort((a, b) => b.impactFinancier - a.impactFinancier).slice(0, 3);
  }

  // ══════════════ Fiabilité des données (D18 : rapprochement, clôture) ══════════════

  /**
   * Rapprochement de trésorerie : compare le solde déclaré (compté physiquement, lu sur un
   * relevé Mobile Money/bancaire) au solde que Kombi calcule à cet instant pour ce compte, et
   * garde l'écart trouvé. Saisie manuelle — aucun import bancaire (D18, hors scope).
   */
  async enregistrerPointage(
    compte: 'especes' | 'mtnMomo' | 'orangeMoney' | 'banque', soldeDeclare: number,
    acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' },
  ): Promise<{ id: string; soldeCalcule: number; ecart: number }> {
    const soldes = await this.soldesTresorerie();
    const soldeCalcule = soldes[compte];
    const ecart = Math.round(soldeDeclare) - soldeCalcule;
    const id = uid();
    this.sql.exec(
      `INSERT INTO pointage_tresorerie (id, compte, solde_declare, solde_calcule, ecart, acteur_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id, compte, Math.round(soldeDeclare), soldeCalcule, ecart, acteur.utilisateurId,
    );
    this.journaliser({
      acteur, action: 'tresorerie.pointer', entite: 'pointage_tresorerie', entiteId: id,
      apres: { compte, soldeDeclare: Math.round(soldeDeclare), soldeCalcule, ecart },
    });
    return { id, soldeCalcule, ecart };
  }

  /** Historique des pointages de trésorerie, du plus récent au plus ancien. */
  async listerPointages(limite = 20): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      'SELECT id, compte, date, solde_declare, solde_calcule, ecart FROM pointage_tresorerie ORDER BY date DESC LIMIT ?',
      limite,
    ).toArray() as never;
  }

  /**
   * Clôture un mois civil ('YYYY-MM') : plus aucune vente/achat/dépense ne pourra y être daté
   * (voir `verifierMoisNonCloture`, appelée avant écriture). Ne verrouille QUE ce mois — pas une
   * clôture d'exercice complète (à-nouveaux etc., voir DECISIONS.md D17, encore à construire).
   */
  async cloturerMois(anneeMois: string, acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' }): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(anneeMois)) throw new Error('Format de mois invalide (attendu AAAA-MM)');
    this.sql.exec(
      'INSERT OR IGNORE INTO cloture_mensuelle (annee_mois, cloture_par) VALUES (?, ?)',
      anneeMois, acteur.utilisateurId,
    );
    this.journaliser({ acteur, action: 'mois.cloturer', entite: 'cloture_mensuelle', entiteId: anneeMois, apres: { anneeMois } });
  }

  /** Rouvre un mois précédemment clôturé (erreur de manipulation, correction à faire). */
  async rouvrirMois(anneeMois: string, acteur: Acteur = { utilisateurId: 'systeme', role: 'systeme' }): Promise<void> {
    this.sql.exec('DELETE FROM cloture_mensuelle WHERE annee_mois = ?', anneeMois);
    this.journaliser({ acteur, action: 'mois.rouvrir', entite: 'cloture_mensuelle', entiteId: anneeMois, apres: { anneeMois } });
  }

  /** Liste des mois clôturés, du plus récent au plus ancien. */
  async listerClotures(): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      'SELECT annee_mois, cloture_le, cloture_par FROM cloture_mensuelle ORDER BY annee_mois DESC',
    ).toArray() as never;
  }

  /**
   * Trésorerie du jour : mouvement net (débit − crédit) de chaque compte de trésorerie pour les
   * écritures datées aujourd'hui — capture toute opération qui la mouvemente (vente comptant,
   * dépense, encaissement de créance, règlement de dette), quelle que soit sa source, puisqu'elles
   * postent toutes sur ces mêmes comptes (`COMPTE_TRESORERIE_PAR_MODE`).
   */
  async tresorerieDuJour(): Promise<{ especes: number; mtnMomo: number; orangeMoney: number; banque: number }> {
    const aujourdhui = this.dateCourante();
    const net = (numero: string) => {
      const row = this.sql.exec(
        `SELECT COALESCE(SUM(CASE WHEN l.sens = 'debit' THEN l.montant ELSE -l.montant END), 0) AS net
           FROM ligne_ecriture l JOIN compte_comptable c ON c.id = l.compte_id JOIN ecriture e ON e.id = l.ecriture_id
          WHERE c.numero = ? AND e.statut = 'validee' AND date(e.date_operation) = ?`,
        numero, aujourdhui,
      ).toArray()[0] as { net: number };
      return row.net;
    };
    return { especes: net('571'), mtnMomo: net('5522'), orangeMoney: net('5521'), banque: net('521') };
  }

  /**
   * Soldes réels de trésorerie par mode (espèces, MTN MoMo, Orange Money, banque) : cumul
   * débit − crédit depuis l'ouverture de l'exercice, PAS seulement les mouvements du jour
   * (contrairement à `tresorerieDuJour`). C'est le montant réellement disponible aujourd'hui.
   */
  async soldesTresorerie(): Promise<{ especes: number; mtnMomo: number; orangeMoney: number; banque: number }> {
    const exerciceId = this.exerciceOuvert();
    const solde = (numero: string) => {
      const row = this.sql.exec(
        `SELECT COALESCE(SUM(CASE WHEN l.sens = 'debit' THEN l.montant ELSE -l.montant END), 0) AS solde
           FROM ligne_ecriture l JOIN compte_comptable c ON c.id = l.compte_id JOIN ecriture e ON e.id = l.ecriture_id
          WHERE c.numero = ? AND e.statut = 'validee' AND e.exercice_id = ?`,
        numero, exerciceId,
      ).toArray()[0] as { solde: number };
      return row.solde;
    };
    return { especes: solde('571'), mtnMomo: solde('5522'), orangeMoney: solde('5521'), banque: solde('521') };
  }

  /** Journal général : liste des écritures validées, la plus récente en premier. */
  async listerEcritures(): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      `SELECT id, exercice_id, date_operation, libelle, source, statut, total_debit, total_credit
         FROM ecriture WHERE statut = 'validee' ORDER BY created_at DESC`,
    ).toArray() as never;
  }

  /** Mouvements effectivement passés sur les quatre comptes de trésorerie. */
  async listerMouvementsTresorerie(limite = 100): Promise<Record<string, unknown>[]> {
    return this.sql.exec(
      `SELECT e.id, e.date_operation AS date, e.libelle, e.source, c.numero AS compte_numero,
              SUM(CASE WHEN l.sens = 'debit' THEN l.montant ELSE -l.montant END) AS montant_net
         FROM ecriture e
         JOIN ligne_ecriture l ON l.ecriture_id = e.id
         JOIN compte_comptable c ON c.id = l.compte_id
        WHERE e.statut = 'validee' AND c.numero IN ('571', '5521', '5522', '521')
        GROUP BY e.id, e.date_operation, e.libelle, e.source, c.numero
       HAVING montant_net <> 0
        ORDER BY e.date_operation DESC, e.created_at DESC
        LIMIT ?`,
      limite,
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
