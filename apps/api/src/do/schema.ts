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

/**
 * v4 — Journal d'audit immuable (append-only, chaîné par hash) : trace qui a fait quoi, quand,
 * sur quelle entité. `hash = sha256(hash_precedent + payload)` — toute altération d'une ligne
 * passée casse la chaîne pour toutes les lignes suivantes (détectable par `verifierChaineAudit`).
 * Écrit dans la MÊME transaction que l'opération métier qu'elle journalise.
 */
const MIGRATION_V4_AUDIT_LOG = `
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, ts TEXT NOT NULL DEFAULT (datetime('now')),
  utilisateur_id TEXT NOT NULL, role TEXT NOT NULL,
  action TEXT NOT NULL, entite TEXT, entite_id TEXT,
  avant_json TEXT, apres_json TEXT,
  hash_precedent TEXT, hash TEXT NOT NULL
)
--##
CREATE TRIGGER IF NOT EXISTS trg_audit_immuable_update BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log immuable : modification interdite');
END
--##
CREATE TRIGGER IF NOT EXISTS trg_audit_immuable_delete BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log immuable : suppression interdite');
END
`;

/**
 * v5 — Corrections caisse (§I-9.1) : vente à crédit (411, comme une facture), remboursement
 * échelonné. La table `vente` a un CHECK de statut trop étroit et `mode_paiement` NOT NULL
 * (impossible pour une vente à crédit, pas encore réglée) → recréation (pattern habituel).
 */
const MIGRATION_V5_CAISSE = `
CREATE TABLE vente_v5 (
  id TEXT PRIMARY KEY, exercice_id TEXT NOT NULL REFERENCES exercice(id),
  date TEXT NOT NULL DEFAULT (datetime('now')), tiers_id TEXT REFERENCES tiers(id),
  mode_paiement TEXT CHECK (mode_paiement IN ('especes','mtn_momo','orange_money','virement','cheque','autre')),
  total_ht INTEGER NOT NULL DEFAULT 0, total_tva INTEGER NOT NULL DEFAULT 0, total_ttc INTEGER NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'payee' CHECK (statut IN ('payee','a_credit','payee_partiellement','annulee')),
  facture_id TEXT REFERENCES facture(id), ecriture_id TEXT REFERENCES ecriture(id),
  caissier_id TEXT, client_uuid TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
INSERT INTO vente_v5 (id, exercice_id, date, tiers_id, mode_paiement, total_ht, total_tva, total_ttc,
                      statut, facture_id, ecriture_id, caissier_id, client_uuid, created_at)
  SELECT id, exercice_id, date, tiers_id, mode_paiement, total_ht, total_tva, total_ttc,
         statut, facture_id, ecriture_id, caissier_id, client_uuid, created_at FROM vente
--##
DROP TABLE vente
--##
ALTER TABLE vente_v5 RENAME TO vente
--##
CREATE TABLE IF NOT EXISTS paiement_vente (
  id TEXT PRIMARY KEY, vente_id TEXT NOT NULL REFERENCES vente(id) ON DELETE CASCADE,
  date TEXT NOT NULL DEFAULT (datetime('now')), montant INTEGER NOT NULL CHECK (montant > 0),
  mode_paiement TEXT NOT NULL CHECK (mode_paiement IN ('especes','mtn_momo','orange_money','virement','cheque','autre')),
  ecriture_id TEXT REFERENCES ecriture(id)
)
`;

/**
 * v6 — Dettes fournisseurs (401) : achat à crédit + remboursement échelonné, symétrique de la
 * vente à crédit (v5). `achat_fournisseur` existait déjà (v1) mais n'était jamais peuplée
 * (l'approvisionnement réglait toujours comptant) et son statut ne portait pas la notion de dette.
 */
const MIGRATION_V6_DETTES = `
CREATE TABLE achat_fournisseur_v6 (
  id TEXT PRIMARY KEY, exercice_id TEXT NOT NULL REFERENCES exercice(id),
  tiers_id TEXT NOT NULL REFERENCES tiers(id), date TEXT NOT NULL DEFAULT (datetime('now')),
  total_ht INTEGER NOT NULL DEFAULT 0, total_tva INTEGER NOT NULL DEFAULT 0, total_ttc INTEGER NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'regle' CHECK (statut IN ('regle','a_credit','payee_partiellement','annule')),
  ecriture_id TEXT REFERENCES ecriture(id), client_uuid TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
INSERT INTO achat_fournisseur_v6 (id, exercice_id, tiers_id, date, total_ht, total_tva, total_ttc,
                                  statut, ecriture_id, client_uuid, created_at)
  SELECT id, exercice_id, tiers_id, date, total_ht, total_tva, total_ttc,
         CASE statut WHEN 'annule' THEN 'annule' ELSE 'regle' END, ecriture_id, client_uuid, created_at
    FROM achat_fournisseur
--##
DROP TABLE achat_fournisseur
--##
ALTER TABLE achat_fournisseur_v6 RENAME TO achat_fournisseur
--##
CREATE TABLE IF NOT EXISTS paiement_achat (
  id TEXT PRIMARY KEY, achat_id TEXT NOT NULL REFERENCES achat_fournisseur(id) ON DELETE CASCADE,
  date TEXT NOT NULL DEFAULT (datetime('now')), montant INTEGER NOT NULL CHECK (montant > 0),
  mode_paiement TEXT NOT NULL CHECK (mode_paiement IN ('especes','mtn_momo','orange_money','virement','cheque','autre')),
  ecriture_id TEXT REFERENCES ecriture(id)
)
`;

/**
 * v7 — Conversion devis → facture : trace la facture issue d'un devis (`facture.devis_id`),
 * pour éviter une double conversion et afficher le lien dans l'UI. Simple ADD COLUMN (nullable,
 * pas de FK réécrite par SQLite) — aucun besoin du contournement RENAME décrit ci-dessus.
 */
const MIGRATION_V7_DEVIS = `
ALTER TABLE facture ADD COLUMN devis_id TEXT REFERENCES facture(id)
`;

/**
 * v8 — Idempotence offline pour les encaissements (spec §5.2 : dépense, encaissement, tiers,
 * produit hors-ligne, Phase P1). `client_uuid` existait déjà sur tiers/vente/facture/
 * achat_fournisseur/depense (créations) mais pas sur les paiements — un encaissement rejoué par
 * la file offline aurait créé un doublon. Index unique partiel (NULL autorisé pour les paiements
 * historiques et les appels internes sans clientUuid).
 */
const MIGRATION_V8_IDEMPOTENCE_PAIEMENTS = `
ALTER TABLE paiement_vente ADD COLUMN client_uuid TEXT
--##
ALTER TABLE paiement_facture ADD COLUMN client_uuid TEXT
--##
ALTER TABLE paiement_achat ADD COLUMN client_uuid TEXT
--##
ALTER TABLE tiers ADD COLUMN client_uuid TEXT
--##
ALTER TABLE mouvement_stock ADD COLUMN client_uuid TEXT
--##
CREATE UNIQUE INDEX idx_paiement_vente_client_uuid ON paiement_vente(client_uuid) WHERE client_uuid IS NOT NULL
--##
CREATE UNIQUE INDEX idx_paiement_facture_client_uuid ON paiement_facture(client_uuid) WHERE client_uuid IS NOT NULL
--##
CREATE UNIQUE INDEX idx_paiement_achat_client_uuid ON paiement_achat(client_uuid) WHERE client_uuid IS NOT NULL
--##
CREATE UNIQUE INDEX idx_tiers_client_uuid ON tiers(client_uuid) WHERE client_uuid IS NOT NULL
--##
CREATE UNIQUE INDEX idx_mouvement_stock_client_uuid ON mouvement_stock(client_uuid) WHERE client_uuid IS NOT NULL
`;

/**
 * v9 — Correction des comptes Mobile Money (validation ONECCA, voir docs/reference/09-
 * validations-onecca.md §1) : MTN MoMo et Orange Money partagent le compte racine 552
 * (Téléphone portable), sous-compte par opérateur — PAS deux comptes racine distincts comme
 * précédemment modélisé (l'ancien '553' est en réalité « carte péage », sans rapport). Les
 * comptes 552/553 mal nommés restent en base pour les entreprises déjà créées (une écriture
 * validée est immuable, on ne réécrit jamais son compte) ; seuls les NOUVEAUX encaissements
 * postent désormais sur 5521/5522 (voir `COMPTE_TRESORERIE_PAR_MODE`).
 */
const MIGRATION_V9_COMPTES_MOMO = `
INSERT OR IGNORE INTO compte_comptable (id, numero, libelle, classe, type)
VALUES (lower(hex(randomblob(16))), '5521', 'Mobile Money — Orange Money', 5, 'actif')
--##
INSERT OR IGNORE INTO compte_comptable (id, numero, libelle, classe, type)
VALUES (lower(hex(randomblob(16))), '5522', 'Mobile Money — MTN MoMo', 5, 'actif')
`;

/**
 * v10 — Idempotence offline pour les commandes/missions (même motif que v8 pour les paiements) :
 * `commande` n'avait pas de `client_uuid`, donc une création rejouée par la file offline
 * créerait un doublon dès que les commandes rejoindraient la synchro (audit sécurité 2026-09-03).
 */
const MIGRATION_V10_IDEMPOTENCE_COMMANDE = `
ALTER TABLE commande ADD COLUMN client_uuid TEXT
--##
CREATE UNIQUE INDEX idx_commande_client_uuid ON commande(client_uuid) WHERE client_uuid IS NOT NULL
`;

/**
 * v11 — Pièce justificative (photo/scan de reçu) attachée à une dépense. Le fichier lui-même
 * vit dans R2 (bucket DOCS, hors DO — voir routes/depenses.ts) ; seule la clé de l'objet R2 est
 * stockée ici, pour retrouver/afficher la pièce depuis la fiche dépense.
 */
const MIGRATION_V11_PIECE_DEPENSE = `
ALTER TABLE depense ADD COLUMN piece_cle TEXT
`;

/**
 * v12 — Date d'échéance sur une créance (vente à crédit) ou une dette (achat à crédit) : jusqu'ici
 * seule `facture.date_echeance` existait — une vente/achat à crédit enregistré directement depuis
 * la Caisse/le Stock (sans passer par une facture) n'avait aucun moyen d'indiquer quand le client
 * doit payer ou quand le fournisseur doit être payé, ni de calcul de retard.
 */
const MIGRATION_V12_ECHEANCE_CREDIT = `
ALTER TABLE vente ADD COLUMN date_echeance TEXT
--##
ALTER TABLE achat_fournisseur ADD COLUMN date_echeance TEXT
`;

/**
 * v13 — Pièce justificative (scan de la facture fournisseur) attachée à un achat fournisseur —
 * même mécanique que v11 pour les dépenses (voir routes/achats.ts, services/pieces.ts).
 */
const MIGRATION_V13_PIECE_ACHAT = `
ALTER TABLE achat_fournisseur ADD COLUMN piece_cle TEXT
`;

/**
 * v14 — Pièce justificative attachée à une vente à crédit (bon de livraison signé, commande du
 * client...) — symétrique de v13 pour les dettes fournisseurs (voir routes/ventes.ts).
 */
const MIGRATION_V14_PIECE_VENTE = `
ALTER TABLE vente ADD COLUMN piece_cle TEXT
`;

/**
 * v15 — Rapprochement de trésorerie (D18, point « garantir la fiabilité des données ») : un
 * pointage compare le solde déclaré (compté physiquement en caisse, lu sur le relevé Mobile
 * Money/banque) au solde calculé par Kombi à cet instant, et garde l'écart trouvé. Saisie
 * manuelle volontairement — aucun import bancaire (hors scope, voir PLAN-cockpit-dirigeant.md).
 */
const MIGRATION_V15_POINTAGE_TRESORERIE = `
CREATE TABLE IF NOT EXISTS pointage_tresorerie (
  id TEXT PRIMARY KEY,
  compte TEXT NOT NULL CHECK (compte IN ('especes','mtnMomo','orangeMoney','banque')),
  date TEXT NOT NULL DEFAULT (datetime('now')),
  solde_declare INTEGER NOT NULL, solde_calcule INTEGER NOT NULL, ecart INTEGER NOT NULL,
  acteur_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`;

/**
 * v16 — Clôture mensuelle (D18, même point) : verrouille un mois civil pour empêcher toute
 * nouvelle opération (vente, achat, dépense) datée dedans, une fois que le dirigeant/comptable
 * l'a validé. Ne couvre pas encore la clôture d'EXERCICE complète (à-nouveaux, verrouillage —
 * limite déjà actée dans DECISIONS.md D17), seulement le verrouillage mois par mois.
 */
const MIGRATION_V16_CLOTURE_MENSUELLE = `
CREATE TABLE IF NOT EXISTS cloture_mensuelle (
  annee_mois TEXT PRIMARY KEY,
  cloture_le TEXT NOT NULL DEFAULT (datetime('now')),
  cloture_par TEXT
)
`;

/**
 * v17 — Contexte dépense (audit reporting 2026-09-04) : « agence » (tag texte libre, pas un
 * module « projet » à part entière — hors scope) et « créé par » (membre à l'origine de la
 * dépense, pour la reconstituer sans dépendre de audit_log). `depense` est référencée par rien
 * (aucune FK d'une autre table vers elle) donc le RENAME direct est sûr (pas le pattern
 * recreate-avec-nom-temporaire des tables référencées, voir note plus bas) ; on suit quand même
 * le pattern recreate car `ecriture_id`/`piece_cle` etc. doivent être recopiés à l'identique.
 */
const MIGRATION_V17_DEPENSE_CONTEXTE = `
CREATE TABLE depense_v17 (
  id TEXT PRIMARY KEY, exercice_id TEXT NOT NULL REFERENCES exercice(id),
  categorie TEXT NOT NULL, compte_numero TEXT NOT NULL, libelle TEXT NOT NULL,
  montant INTEGER NOT NULL CHECK (montant > 0),
  mode_paiement TEXT NOT NULL CHECK (mode_paiement IN ('especes','mtn_momo','orange_money','virement','cheque','autre')),
  tiers_id TEXT REFERENCES tiers(id), recurrente INTEGER NOT NULL DEFAULT 0 CHECK (recurrente IN (0,1)),
  date TEXT NOT NULL DEFAULT (datetime('now')), ecriture_id TEXT REFERENCES ecriture(id),
  client_uuid TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  piece_cle TEXT, agence TEXT, cree_par TEXT
)
--##
INSERT INTO depense_v17 (id, exercice_id, categorie, compte_numero, libelle, montant, mode_paiement,
                         tiers_id, recurrente, date, ecriture_id, client_uuid, created_at, piece_cle)
  SELECT id, exercice_id, categorie, compte_numero, libelle, montant, mode_paiement,
         tiers_id, recurrente, date, ecriture_id, client_uuid, created_at, piece_cle FROM depense
--##
DROP TABLE depense
--##
ALTER TABLE depense_v17 RENAME TO depense
`;

/**
 * v18 — Budgets mensuels (audit reporting 2026-09-04, feature « Prévisions et budgets ») : un
 * objectif par mois civil (CA cible, plafond de dépenses, marge cible). Les prévisions de
 * trésorerie et simulations (baisse de ventes, impact recrutement/investissement, seuil de
 * rentabilité) sont des calculs à la volée à partir de ce budget + des données existantes —
 * aucun état supplémentaire à persister pour elles.
 */
const MIGRATION_V18_BUDGET_MENSUEL = `
CREATE TABLE IF NOT EXISTS budget_mensuel (
  annee_mois TEXT PRIMARY KEY,
  ca_cible INTEGER, plafond_depenses INTEGER, marge_cible_pct REAL,
  cree_par TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`;

/** v19 — Centre de pilotage opérationnel : dossier, responsabilités, échéances et tâches. */
const MIGRATION_V19_OPERATIONS = `
CREATE TABLE commande_v19 (
  id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT 'commande' CHECK (type IN ('commande','mission')),
  tiers_id TEXT REFERENCES tiers(id), libelle TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente','en_cours','controle','prete','livree','bloquee','annulee')),
  montant INTEGER, date_prevue TEXT, vente_id TEXT REFERENCES vente(id), client_uuid TEXT,
  description TEXT, priorite TEXT NOT NULL DEFAULT 'normale', date_debut TEXT,
  date_rendez_vous TEXT, date_paiement TEXT, lieu TEXT, responsable_id TEXT, responsable_nom TEXT,
  acompte INTEGER NOT NULL DEFAULT 0, remboursement INTEGER NOT NULL DEFAULT 0,
  progression INTEGER NOT NULL DEFAULT 0, motif_blocage TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
INSERT INTO commande_v19 (id,type,tiers_id,libelle,statut,montant,date_prevue,vente_id,client_uuid,created_at,updated_at)
 SELECT id,type,tiers_id,libelle,statut,montant,date_prevue,vente_id,client_uuid,created_at,updated_at FROM commande
--##
DROP TABLE commande
--##
ALTER TABLE commande_v19 RENAME TO commande
--##
CREATE UNIQUE INDEX idx_commande_client_uuid ON commande(client_uuid) WHERE client_uuid IS NOT NULL
--##
CREATE TABLE IF NOT EXISTS tache_operation (
  id TEXT PRIMARY KEY, commande_id TEXT NOT NULL REFERENCES commande(id) ON DELETE CASCADE,
  titre TEXT NOT NULL, description TEXT, statut TEXT NOT NULL DEFAULT 'a_faire'
    CHECK (statut IN ('a_faire','en_cours','bloquee','terminee')),
  priorite TEXT NOT NULL DEFAULT 'normale' CHECK (priorite IN ('basse','normale','haute','urgente')),
  responsable_id TEXT, responsable_nom TEXT, date_echeance TEXT, ordre INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
CREATE INDEX IF NOT EXISTS idx_tache_operation_commande ON tache_operation(commande_id)
`;

/** v20 — collaboration terrain, dépendances, preuve et facture liée. */
const MIGRATION_V20_OPERATION_COLLABORATION = `
ALTER TABLE commande ADD COLUMN piece_cle TEXT
--##
ALTER TABLE commande ADD COLUMN facture_id TEXT
--##
ALTER TABLE tache_operation ADD COLUMN depend_de_id TEXT REFERENCES tache_operation(id)
--##
CREATE TABLE IF NOT EXISTS commentaire_operation (
  id TEXT PRIMARY KEY, commande_id TEXT NOT NULL REFERENCES commande(id) ON DELETE CASCADE,
  auteur_id TEXT, auteur_nom TEXT, message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
CREATE INDEX IF NOT EXISTS idx_commentaire_operation ON commentaire_operation(commande_id, created_at)
`;

/** v21 — cycle économique complet d'une opération et traçabilité. */
const MIGRATION_V21_OPERATION_PILOTAGE = `
ALTER TABLE commande ADD COLUMN reference TEXT
--##
ALTER TABLE commande ADD COLUMN cout_budget INTEGER NOT NULL DEFAULT 0
--##
ALTER TABLE commande ADD COLUMN archivee INTEGER NOT NULL DEFAULT 0
--##
ALTER TABLE commande ADD COLUMN validee_client_le TEXT
--##
ALTER TABLE commande ADD COLUMN preuve_livraison TEXT
--##
ALTER TABLE tache_operation ADD COLUMN parent_id TEXT REFERENCES tache_operation(id)
--##
ALTER TABLE tache_operation ADD COLUMN duree_minutes INTEGER NOT NULL DEFAULT 0
--##
ALTER TABLE tache_operation ADD COLUMN recurrence TEXT
--##
CREATE TABLE IF NOT EXISTS cout_operation (
  id TEXT PRIMARY KEY, commande_id TEXT NOT NULL REFERENCES commande(id) ON DELETE CASCADE,
  categorie TEXT NOT NULL, libelle TEXT NOT NULL, montant INTEGER NOT NULL CHECK(montant > 0),
  date TEXT NOT NULL, fournisseur_nom TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
CREATE INDEX IF NOT EXISTS idx_cout_operation_commande ON cout_operation(commande_id,date)
--##
CREATE TABLE IF NOT EXISTS echeance_operation (
  id TEXT PRIMARY KEY, commande_id TEXT NOT NULL REFERENCES commande(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('encaissement','remboursement')),
  libelle TEXT NOT NULL, montant INTEGER NOT NULL CHECK(montant > 0), date_prevue TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'a_venir' CHECK(statut IN ('a_venir','payee','annulee')),
  date_paiement TEXT, mode_paiement TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
CREATE INDEX IF NOT EXISTS idx_echeance_operation_commande ON echeance_operation(commande_id,date_prevue)
--##
CREATE TABLE IF NOT EXISTS historique_operation (
  id TEXT PRIMARY KEY, commande_id TEXT NOT NULL REFERENCES commande(id) ON DELETE CASCADE,
  action TEXT NOT NULL, detail TEXT, auteur_nom TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
CREATE INDEX IF NOT EXISTS idx_historique_operation_commande ON historique_operation(commande_id,created_at)
`;

/** v22 — équipe étendue et dossier documentaire multiple. */
const MIGRATION_V22_OPERATION_TERRAIN = `
CREATE TABLE IF NOT EXISTS assignation_tache (
  tache_id TEXT NOT NULL REFERENCES tache_operation(id) ON DELETE CASCADE,
  utilisateur_id TEXT NOT NULL, nom TEXT NOT NULL,
  PRIMARY KEY(tache_id,utilisateur_id)
)
--##
CREATE TABLE IF NOT EXISTS piece_operation (
  id TEXT PRIMARY KEY, commande_id TEXT NOT NULL REFERENCES commande(id) ON DELETE CASCADE,
  cle TEXT NOT NULL, nom TEXT NOT NULL, type_mime TEXT NOT NULL, categorie TEXT NOT NULL DEFAULT 'autre',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
--##
CREATE INDEX IF NOT EXISTS idx_piece_operation_commande ON piece_operation(commande_id,created_at)
--##
CREATE TABLE IF NOT EXISTS disponibilite_equipe (
  id TEXT PRIMARY KEY, utilisateur_id TEXT NOT NULL, nom TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('absence','indisponible','disponible')),
  debut TEXT NOT NULL, fin TEXT NOT NULL, motif TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`;
const MIGRATION_V23_OPERATION_COMPTABILITE = `
ALTER TABLE cout_operation ADD COLUMN depense_id TEXT
--##
ALTER TABLE depense ADD COLUMN commande_id TEXT
`;
const MIGRATION_V24_EQUIPE_FRAIS = `
CREATE TABLE IF NOT EXISTS frais_equipe (
  id TEXT PRIMARY KEY, utilisateur_id TEXT NOT NULL, nom TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('avance','note_frais')),
  libelle TEXT NOT NULL, montant INTEGER NOT NULL CHECK(montant>0), mode_paiement TEXT NOT NULL,
  date TEXT NOT NULL, statut TEXT NOT NULL DEFAULT 'valide' CHECK(statut IN ('brouillon','valide','rembourse')),
  depense_id TEXT, created_at TEXT NOT NULL DEFAULT(datetime('now'))
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
 * - Recréer une table RÉFÉRENCÉE par une FK d'une autre table (ex. `vente` ← `ligne_vente.vente_id`) :
 *   ne JAMAIS renommer la table existante vers un nom temporaire (`ALTER TABLE x RENAME TO x_vN`) —
 *   SQLite réécrit alors silencieusement les FK des AUTRES tables vers ce nom temporaire, qui
 *   n'existe plus une fois DROP → "no such table" au premier INSERT dans la table dépendante.
 *   (`PRAGMA legacy_alter_table` n'a pas d'effet observable dans le SQLite embarqué des DO.)
 *   Faire l'inverse : créer la nouvelle table sous un nom temporaire (`x_vN`), copier les
 *   données, DROP l'ancienne `x`, puis RENAME `x_vN` → `x`. Aucune autre table n'a jamais
 *   référencé `x_vN`, donc rien n'est réécrit ; les FK existantes (qui disent toujours `x`)
 *   se remettent à pointer correctement dès que `x` réapparaît avec le nouveau schéma.
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
  // v4 — journal d'audit immuable (append-only, chaîné par hash).
  { v: 4, statements: statementsDe(MIGRATION_V4_AUDIT_LOG) },
  // v5 — corrections caisse : vente à crédit (411) + remboursement échelonné.
  { v: 5, statements: statementsDe(MIGRATION_V5_CAISSE) },
  // v6 — dettes fournisseurs (401) : achat à crédit + remboursement échelonné.
  { v: 6, statements: statementsDe(MIGRATION_V6_DETTES) },
  // v7 — conversion devis → facture (facture.devis_id).
  { v: 7, statements: statementsDe(MIGRATION_V7_DEVIS) },
  // v8 — idempotence offline des encaissements (client_uuid sur paiement_vente/facture/achat).
  { v: 8, statements: statementsDe(MIGRATION_V8_IDEMPOTENCE_PAIEMENTS) },
  // v9 — comptes Mobile Money corrigés (5521/5522 au lieu de 552/553, validation ONECCA).
  { v: 9, statements: statementsDe(MIGRATION_V9_COMPTES_MOMO) },
  // v10 — idempotence offline des commandes/missions (client_uuid).
  { v: 10, statements: statementsDe(MIGRATION_V10_IDEMPOTENCE_COMMANDE) },
  // v11 — pièce justificative (photo/scan) attachée à une dépense.
  { v: 11, statements: statementsDe(MIGRATION_V11_PIECE_DEPENSE) },
  // v12 — date d'échéance sur une créance/dette née d'une vente/achat à crédit (hors facture).
  { v: 12, statements: statementsDe(MIGRATION_V12_ECHEANCE_CREDIT) },
  // v13 — pièce justificative (scan facture fournisseur) attachée à un achat fournisseur.
  { v: 13, statements: statementsDe(MIGRATION_V13_PIECE_ACHAT) },
  // v14 — pièce justificative attachée à une vente à crédit.
  { v: 14, statements: statementsDe(MIGRATION_V14_PIECE_VENTE) },
  // v15 — rapprochement de trésorerie (pointage : solde déclaré vs calculé, écart gardé).
  { v: 15, statements: statementsDe(MIGRATION_V15_POINTAGE_TRESORERIE) },
  // v16 — clôture mensuelle verrouillable (empêche une nouvelle opération dans un mois clos).
  { v: 16, statements: statementsDe(MIGRATION_V16_CLOTURE_MENSUELLE) },
  // v17 — contexte dépense : agence (tag libre) + créé par (membre).
  { v: 17, statements: statementsDe(MIGRATION_V17_DEPENSE_CONTEXTE) },
  // v18 — budgets mensuels (CA cible, plafond dépenses, marge cible).
  { v: 18, statements: statementsDe(MIGRATION_V18_BUDGET_MENSUEL) },
  // v19 — centre de pilotage opérationnel (commandes/projets/missions + tâches).
  { v: 19, statements: statementsDe(MIGRATION_V19_OPERATIONS) },
  { v: 20, statements: statementsDe(MIGRATION_V20_OPERATION_COLLABORATION) },
  { v: 21, statements: statementsDe(MIGRATION_V21_OPERATION_PILOTAGE) },
  { v: 22, statements: statementsDe(MIGRATION_V22_OPERATION_TERRAIN) },
  { v: 23, statements: statementsDe(MIGRATION_V23_OPERATION_COMPTABILITE) },
  { v: 24, statements: statementsDe(MIGRATION_V24_EQUIPE_FRAIS) },
  // v25… : ajouter ici les ALTER TABLE / CREATE TABLE des prochaines fonctionnalités.
];

/** Version cible du schéma (la plus haute des migrations). */
export const VERSION_SCHEMA = MIGRATIONS_DO[MIGRATIONS_DO.length - 1]!.v;
