/**
 * Schéma SQLite d'UNE entreprise, embarqué dans son Durable Object (EntrepriseDO).
 * Isolation physique : plus de colonne entreprise_id (le DO EST la frontière de tenant).
 * Statements séparés par « --## » (les triggers contiennent des ';' internes).
 */
export const TENANT_SCHEMA = `
CREATE TABLE IF NOT EXISTS exercice (
  id TEXT PRIMARY KEY, annee INTEGER NOT NULL, date_debut TEXT NOT NULL, date_fin TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert','cloture')),
  UNIQUE (annee)
)
--##
CREATE TABLE IF NOT EXISTS module (
  code TEXT PRIMARY KEY CHECK (code IN
    ('ventes','tiers','facturation','commandes','comptabilite','fiscalite','stock','achats')),
  actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0,1)),
  config_json TEXT NOT NULL DEFAULT '{}'
)
--##
CREATE TABLE IF NOT EXISTS compte_comptable (
  id TEXT PRIMARY KEY, numero TEXT NOT NULL UNIQUE, libelle TEXT NOT NULL,
  classe INTEGER NOT NULL CHECK (classe BETWEEN 1 AND 8),
  type TEXT NOT NULL CHECK (type IN ('actif','passif','charge','produit'))
)
--##
CREATE TABLE IF NOT EXISTS tiers (
  id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('client','fournisseur','les_deux')),
  nom TEXT NOT NULL, niu TEXT, telephone TEXT, email TEXT, adresse TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
CREATE TABLE IF NOT EXISTS ecriture (
  id TEXT PRIMARY KEY, exercice_id TEXT NOT NULL REFERENCES exercice(id),
  date_operation TEXT NOT NULL, libelle TEXT NOT NULL, reference TEXT,
  tiers_id TEXT REFERENCES tiers(id), facture_id TEXT, vente_id TEXT,
  mode_paiement TEXT CHECK (mode_paiement IN ('especes','mtn_momo','orange_money','virement','cheque','autre')),
  source TEXT NOT NULL DEFAULT 'manuelle' CHECK (source IN ('manuelle','facture','import_bancaire','vente','achat')),
  statut TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','validee')),
  total_debit INTEGER NOT NULL DEFAULT 0, total_credit INTEGER NOT NULL DEFAULT 0,
  client_uuid TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
CREATE TABLE IF NOT EXISTS ligne_ecriture (
  id TEXT PRIMARY KEY, ecriture_id TEXT NOT NULL REFERENCES ecriture(id) ON DELETE CASCADE,
  compte_id TEXT NOT NULL REFERENCES compte_comptable(id),
  sens TEXT NOT NULL CHECK (sens IN ('debit','credit')), montant INTEGER NOT NULL CHECK (montant > 0)
)
--##
CREATE INDEX IF NOT EXISTS idx_ligne_ecriture ON ligne_ecriture(ecriture_id)
--##
CREATE TABLE IF NOT EXISTS facture (
  id TEXT PRIMARY KEY, exercice_id TEXT NOT NULL REFERENCES exercice(id),
  type TEXT NOT NULL CHECK (type IN ('devis','facture')), numero TEXT, numero_seq INTEGER,
  tiers_id TEXT NOT NULL REFERENCES tiers(id), date_emission TEXT, date_echeance TEXT,
  statut TEXT NOT NULL DEFAULT 'brouillon'
    CHECK (statut IN ('brouillon','envoyee','payee_partiellement','payee','en_retard','annulee')),
  total_ht INTEGER NOT NULL DEFAULT 0, total_tva INTEGER NOT NULL DEFAULT 0, total_ttc INTEGER NOT NULL DEFAULT 0,
  avoir_de_id TEXT REFERENCES facture(id), client_uuid TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (exercice_id, type, numero_seq)
)
--##
CREATE TABLE IF NOT EXISTS ligne_facture (
  id TEXT PRIMARY KEY, facture_id TEXT NOT NULL REFERENCES facture(id) ON DELETE CASCADE,
  designation TEXT NOT NULL, quantite INTEGER NOT NULL DEFAULT 1 CHECK (quantite > 0),
  prix_unitaire INTEGER NOT NULL CHECK (prix_unitaire >= 0), taux_tva REAL NOT NULL DEFAULT 0,
  montant_ht INTEGER NOT NULL, ordre INTEGER NOT NULL DEFAULT 0
)
--##
CREATE TABLE IF NOT EXISTS paiement_facture (
  id TEXT PRIMARY KEY, facture_id TEXT NOT NULL REFERENCES facture(id) ON DELETE CASCADE,
  date TEXT NOT NULL, montant INTEGER NOT NULL CHECK (montant > 0),
  mode_paiement TEXT NOT NULL CHECK (mode_paiement IN ('especes','mtn_momo','orange_money','virement','cheque','autre')),
  ecriture_id TEXT REFERENCES ecriture(id)
)
--##
CREATE TABLE IF NOT EXISTS sequence_numerotation (
  exercice_id TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('devis','facture')),
  dernier_numero INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (exercice_id, type)
)
--##
CREATE TABLE IF NOT EXISTS calcul_igs (
  id TEXT PRIMARY KEY, exercice_id TEXT NOT NULL REFERENCES exercice(id), ca_cumule INTEGER NOT NULL,
  classe INTEGER, tarif_base INTEGER, apres_cga INTEGER, cac INTEGER, igs_annuel INTEGER,
  calcule_le TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
CREATE TABLE IF NOT EXISTS produit (
  id TEXT PRIMARY KEY, nom TEXT NOT NULL, sku TEXT UNIQUE, unite TEXT NOT NULL DEFAULT 'unité',
  prix_vente INTEGER NOT NULL DEFAULT 0 CHECK (prix_vente >= 0),
  cout_moyen_pondere INTEGER NOT NULL DEFAULT 0 CHECK (cout_moyen_pondere >= 0),
  stock_actuel INTEGER NOT NULL DEFAULT 0, seuil_alerte INTEGER NOT NULL DEFAULT 0,
  actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0,1)), created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
CREATE TABLE IF NOT EXISTS mouvement_stock (
  id TEXT PRIMARY KEY, produit_id TEXT NOT NULL REFERENCES produit(id),
  type TEXT NOT NULL CHECK (type IN ('entree','sortie','ajustement')),
  quantite INTEGER NOT NULL CHECK (quantite > 0), cout_unitaire INTEGER NOT NULL DEFAULT 0,
  motif TEXT, vente_id TEXT, achat_id TEXT, date TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
CREATE TABLE IF NOT EXISTS vente (
  id TEXT PRIMARY KEY, exercice_id TEXT NOT NULL REFERENCES exercice(id),
  date TEXT NOT NULL DEFAULT (datetime('now')), tiers_id TEXT REFERENCES tiers(id),
  mode_paiement TEXT NOT NULL CHECK (mode_paiement IN ('especes','mtn_momo','orange_money','virement','cheque','autre')),
  total_ht INTEGER NOT NULL DEFAULT 0, total_tva INTEGER NOT NULL DEFAULT 0, total_ttc INTEGER NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'payee' CHECK (statut IN ('payee','annulee')),
  facture_id TEXT REFERENCES facture(id), ecriture_id TEXT REFERENCES ecriture(id),
  caissier_id TEXT, client_uuid TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
CREATE TABLE IF NOT EXISTS ligne_vente (
  id TEXT PRIMARY KEY, vente_id TEXT NOT NULL REFERENCES vente(id) ON DELETE CASCADE,
  produit_id TEXT REFERENCES produit(id), designation TEXT NOT NULL,
  quantite INTEGER NOT NULL DEFAULT 1 CHECK (quantite > 0), prix_unitaire INTEGER NOT NULL CHECK (prix_unitaire >= 0),
  taux_tva REAL NOT NULL DEFAULT 0, montant_ht INTEGER NOT NULL, cout_unitaire INTEGER NOT NULL DEFAULT 0,
  ordre INTEGER NOT NULL DEFAULT 0
)
--##
CREATE TABLE IF NOT EXISTS achat_fournisseur (
  id TEXT PRIMARY KEY, exercice_id TEXT NOT NULL REFERENCES exercice(id),
  tiers_id TEXT NOT NULL REFERENCES tiers(id), date TEXT NOT NULL DEFAULT (datetime('now')),
  total_ht INTEGER NOT NULL DEFAULT 0, total_tva INTEGER NOT NULL DEFAULT 0, total_ttc INTEGER NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'recu' CHECK (statut IN ('recu','annule')),
  ecriture_id TEXT REFERENCES ecriture(id), client_uuid TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
CREATE TABLE IF NOT EXISTS ligne_achat (
  id TEXT PRIMARY KEY, achat_id TEXT NOT NULL REFERENCES achat_fournisseur(id) ON DELETE CASCADE,
  produit_id TEXT NOT NULL REFERENCES produit(id), quantite INTEGER NOT NULL CHECK (quantite > 0),
  cout_unitaire INTEGER NOT NULL CHECK (cout_unitaire >= 0), montant_ht INTEGER NOT NULL
)
--##
CREATE TABLE IF NOT EXISTS commande (
  id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT 'commande' CHECK (type IN ('commande','mission')),
  tiers_id TEXT REFERENCES tiers(id), libelle TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','en_cours','livree','annulee')),
  montant INTEGER, date_prevue TEXT, vente_id TEXT REFERENCES vente(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
CREATE TRIGGER IF NOT EXISTS trg_ligne_ins AFTER INSERT ON ligne_ecriture BEGIN
  UPDATE ecriture SET
    total_debit  = total_debit  + CASE WHEN NEW.sens='debit'  THEN NEW.montant ELSE 0 END,
    total_credit = total_credit + CASE WHEN NEW.sens='credit' THEN NEW.montant ELSE 0 END,
    updated_at = datetime('now')
  WHERE id = NEW.ecriture_id;
END
--##
CREATE TRIGGER IF NOT EXISTS trg_ligne_del AFTER DELETE ON ligne_ecriture BEGIN
  UPDATE ecriture SET
    total_debit  = total_debit  - CASE WHEN OLD.sens='debit'  THEN OLD.montant ELSE 0 END,
    total_credit = total_credit - CASE WHEN OLD.sens='credit' THEN OLD.montant ELSE 0 END,
    updated_at = datetime('now')
  WHERE id = OLD.ecriture_id;
END
--##
CREATE TRIGGER IF NOT EXISTS trg_ecriture_equilibre BEFORE UPDATE OF statut ON ecriture
WHEN NEW.statut = 'validee' AND (NEW.total_debit <> NEW.total_credit OR NEW.total_debit = 0)
BEGIN
  SELECT RAISE(ABORT, 'Ecriture desequilibree : debit != credit');
END
--##
CREATE TRIGGER IF NOT EXISTS trg_ligne_verrou BEFORE INSERT ON ligne_ecriture
WHEN (SELECT statut FROM ecriture WHERE id = NEW.ecriture_id) = 'validee'
BEGIN
  SELECT RAISE(ABORT, 'Ecriture validee : ajout de ligne interdit');
END
`;

/**
 * v2 — Immuabilité comptable : une écriture validée (et ses lignes) ne peut plus jamais
 * être modifiée ni supprimée (principe comptable de non-altération, SYSCOHADA/DGI).
 */
const MIGRATION_V2_IMMUABILITE = `
CREATE TRIGGER IF NOT EXISTS trg_ecriture_immuable_update BEFORE UPDATE ON ecriture
WHEN OLD.statut = 'validee'
BEGIN
  SELECT RAISE(ABORT, 'Ecriture validee : modification interdite (immuabilite)');
END
--##
CREATE TRIGGER IF NOT EXISTS trg_ecriture_immuable_delete BEFORE DELETE ON ecriture
WHEN OLD.statut = 'validee'
BEGIN
  SELECT RAISE(ABORT, 'Ecriture validee : suppression interdite (immuabilite)');
END
--##
CREATE TRIGGER IF NOT EXISTS trg_ligne_immuable_update BEFORE UPDATE ON ligne_ecriture
WHEN (SELECT statut FROM ecriture WHERE id = OLD.ecriture_id) = 'validee'
BEGIN
  SELECT RAISE(ABORT, 'Ecriture validee : modification de ligne interdite (immuabilite)');
END
--##
CREATE TRIGGER IF NOT EXISTS trg_ligne_immuable_delete BEFORE DELETE ON ligne_ecriture
WHEN (SELECT statut FROM ecriture WHERE id = OLD.ecriture_id) = 'validee'
BEGIN
  SELECT RAISE(ABORT, 'Ecriture validee : suppression de ligne interdite (immuabilite)');
END
`;

function statementsDe(sql: string): string[] {
  return sql.split('--##').map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * v3 — Écran Dépenses (charges 60-67 : loyer, eau, élec, transport, salaires…).
 * La table `module` a un CHECK sur ses codes valides ; SQLite ne sait pas altérer un CHECK
 * in-place, on recrée donc la table (copie → drop → renomme), pattern standard SQLite.
 */
const MIGRATION_V3_DEPENSES = `
ALTER TABLE module RENAME TO module_v2
--##
CREATE TABLE module (
  code TEXT PRIMARY KEY CHECK (code IN
    ('ventes','tiers','facturation','commandes','comptabilite','fiscalite','stock','achats','depenses')),
  actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0,1)),
  config_json TEXT NOT NULL DEFAULT '{}'
)
--##
INSERT INTO module (code, actif, config_json) SELECT code, actif, config_json FROM module_v2
--##
DROP TABLE module_v2
--##
INSERT OR IGNORE INTO module (code, actif) VALUES ('depenses', 1)
--##
CREATE TABLE IF NOT EXISTS depense (
  id TEXT PRIMARY KEY, exercice_id TEXT NOT NULL REFERENCES exercice(id),
  categorie TEXT NOT NULL, compte_numero TEXT NOT NULL, libelle TEXT NOT NULL,
  montant INTEGER NOT NULL CHECK (montant > 0),
  mode_paiement TEXT NOT NULL CHECK (mode_paiement IN ('especes','mtn_momo','orange_money','virement','cheque','autre')),
  tiers_id TEXT REFERENCES tiers(id), recurrente INTEGER NOT NULL DEFAULT 0 CHECK (recurrente IN (0,1)),
  date TEXT NOT NULL DEFAULT (datetime('now')), ecriture_id TEXT REFERENCES ecriture(id),
  client_uuid TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`;

/** Découpe le schéma en statements exécutables individuellement. */
export function statementsSchema(): string[] {
  return TENANT_SCHEMA.split('--##')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Migrations versionnées du schéma d'un Durable Object d'entreprise.
 * Chaque base SQLite embarquée porte sa propre `schema_version` (dans ctx.storage).
 * Au démarrage, le DO applique dans l'ordre toutes les migrations de version supérieure.
 *
 * RÈGLES :
 * - Ne JAMAIS modifier ni réordonner une migration déjà publiée (les bases existantes l'ont appliquée).
 * - Toujours AJOUTER une nouvelle entrée `{ v: N+1, statements: [...] }` en fin de tableau.
 * - Les statements doivent être idempotents quand c'est possible (IF NOT EXISTS, INSERT OR IGNORE).
 * - SQLite ne supporte pas DROP COLUMN simplement : pour retirer/renommer, recréer + copier.
 */
export interface MigrationDO {
  readonly v: number;
  readonly statements: readonly string[];
}

export const MIGRATIONS_DO: readonly MigrationDO[] = [
  // v1 — schéma initial (idempotent : IF NOT EXISTS). Rétro-compatible avec les DO déjà créés.
  { v: 1, statements: statementsSchema() },
  // v2 — immuabilité des écritures validées (triggers UPDATE/DELETE bloquants).
  { v: 2, statements: statementsDe(MIGRATION_V2_IMMUABILITE) },
  // v3 — écran Dépenses (module + table depense).
  { v: 3, statements: statementsDe(MIGRATION_V3_DEPENSES) },
  // v4… : ajouter ici les ALTER TABLE / CREATE TABLE des prochaines fonctionnalités.
];

/** Version cible du schéma (la plus haute des migrations). */
export const VERSION_SCHEMA = MIGRATIONS_DO[MIGRATIONS_DO.length - 1]!.v;
