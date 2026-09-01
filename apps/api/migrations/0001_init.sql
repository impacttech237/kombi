-- Schéma initial — MVP SaaS comptable CEMAC (Cloudflare D1 / SQLite).
-- Conventions : id = TEXT (uuid applicatif), montants = INTEGER (FCFA entiers),
-- booléens = INTEGER 0/1, dates = TEXT ISO-8601. Enums = TEXT + CHECK.
-- Isolation multi-entreprises : chaque table métier porte entreprise_id (filtré côté Worker).

PRAGMA foreign_keys = ON;

-- ═══════════════════ Identité & multi-tenant ═══════════════════
CREATE TABLE utilisateur (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nom         TEXT NOT NULL,
  telephone   TEXT,
  auth_id     TEXT UNIQUE,                 -- lien vers le fournisseur d'auth (better-auth)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE entreprise (
  id              TEXT PRIMARY KEY,
  raison_sociale  TEXT NOT NULL,
  niu             TEXT,                     -- obligatoire pour émettre des factures
  forme_juridique TEXT,
  -- secteur = profil de configuration modulaire (pilote les modules activés). Voir shared/modules.ts.
  secteur         TEXT NOT NULL DEFAULT 'commerce' CHECK (secteur IN ('commerce','service','mixte')),
  nature_activite TEXT NOT NULL CHECK (nature_activite IN ('negoce','artisanal','service','liberale')),
  regime_fiscal   TEXT NOT NULL DEFAULT 'igs'
                    CHECK (regime_fiscal IN ('igs','reel_simplifie','reel_normal')),
  systeme_ohada   TEXT NOT NULL DEFAULT 'smt'
                    CHECK (systeme_ohada IN ('smt','normal')),
  adherent_cga    INTEGER NOT NULL DEFAULT 0 CHECK (adherent_cga IN (0,1)),
  assujetti_tva   INTEGER NOT NULL DEFAULT 0 CHECK (assujetti_tva IN (0,1)),
  devise          TEXT NOT NULL DEFAULT 'XAF',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE membre_entreprise (
  id             TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  entreprise_id  TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('admin','gerant','caissier')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (utilisateur_id, entreprise_id)
);
CREATE INDEX idx_membre_entreprise ON membre_entreprise(entreprise_id);

CREATE TABLE exercice (
  id            TEXT PRIMARY KEY,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  annee         INTEGER NOT NULL,
  date_debut    TEXT NOT NULL,
  date_fin      TEXT NOT NULL,
  statut        TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert','cloture')),
  UNIQUE (entreprise_id, annee)
);

-- ═══════════════════ Comptabilité ═══════════════════
CREATE TABLE compte_comptable (
  id            TEXT PRIMARY KEY,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  numero        TEXT NOT NULL,             -- ex '571', '701', '4111'
  libelle       TEXT NOT NULL,
  classe        INTEGER NOT NULL CHECK (classe BETWEEN 1 AND 8),
  type          TEXT NOT NULL CHECK (type IN ('actif','passif','charge','produit')),
  UNIQUE (entreprise_id, numero)
);
CREATE INDEX idx_compte_entreprise ON compte_comptable(entreprise_id);

CREATE TABLE tiers (
  id            TEXT PRIMARY KEY,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('client','fournisseur','les_deux')),
  nom           TEXT NOT NULL,
  niu           TEXT,
  telephone     TEXT,
  email         TEXT,
  adresse       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tiers_entreprise ON tiers(entreprise_id);

-- En-tête d'écriture (la pièce). total_debit/total_credit maintenus par triggers.
CREATE TABLE ecriture (
  id            TEXT PRIMARY KEY,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  exercice_id   TEXT NOT NULL REFERENCES exercice(id),
  date_operation TEXT NOT NULL,
  libelle       TEXT NOT NULL,
  reference     TEXT,
  tiers_id      TEXT REFERENCES tiers(id),
  facture_id    TEXT,                       -- FK ajoutée après création de facture (ci-dessous)
  mode_paiement TEXT CHECK (mode_paiement IN
                    ('especes','mtn_momo','orange_money','virement','cheque','autre')),
  source        TEXT NOT NULL DEFAULT 'manuelle'
                    CHECK (source IN ('manuelle','facture','import_bancaire')),
  statut        TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','validee')),
  total_debit   INTEGER NOT NULL DEFAULT 0,
  total_credit  INTEGER NOT NULL DEFAULT 0,
  client_uuid   TEXT,                       -- id généré hors-ligne, idempotence de synchro
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entreprise_id, client_uuid)
);
CREATE INDEX idx_ecriture_entreprise ON ecriture(entreprise_id, exercice_id);

CREATE TABLE ligne_ecriture (
  id            TEXT PRIMARY KEY,
  ecriture_id   TEXT NOT NULL REFERENCES ecriture(id) ON DELETE CASCADE,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  compte_id     TEXT NOT NULL REFERENCES compte_comptable(id),
  sens          TEXT NOT NULL CHECK (sens IN ('debit','credit')),
  montant       INTEGER NOT NULL CHECK (montant > 0)
);
CREATE INDEX idx_ligne_ecriture ON ligne_ecriture(ecriture_id);
CREATE INDEX idx_ligne_compte ON ligne_ecriture(compte_id);

-- ═══════════════════ Facturation ═══════════════════
CREATE TABLE facture (
  id             TEXT PRIMARY KEY,
  entreprise_id  TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  exercice_id    TEXT NOT NULL REFERENCES exercice(id),
  type           TEXT NOT NULL CHECK (type IN ('devis','facture')),
  numero         TEXT,                      -- NULL tant que brouillon ; ex 'IMPACT-FAC-2026-0001'
  numero_seq     INTEGER,                   -- entier ordonnant, gap-less par exercice
  tiers_id       TEXT NOT NULL REFERENCES tiers(id),
  date_emission  TEXT,
  date_echeance  TEXT,
  statut         TEXT NOT NULL DEFAULT 'brouillon'
                   CHECK (statut IN ('brouillon','envoyee','payee_partiellement',
                                     'payee','en_retard','annulee')),
  total_ht       INTEGER NOT NULL DEFAULT 0,
  total_tva      INTEGER NOT NULL DEFAULT 0,
  total_ttc      INTEGER NOT NULL DEFAULT 0,
  avoir_de_id    TEXT REFERENCES facture(id),  -- si cette facture est un avoir corrigeant une autre
  client_uuid    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entreprise_id, exercice_id, type, numero_seq),
  UNIQUE (entreprise_id, client_uuid)
);
CREATE INDEX idx_facture_entreprise ON facture(entreprise_id, exercice_id);

CREATE TABLE ligne_facture (
  id            TEXT PRIMARY KEY,
  facture_id    TEXT NOT NULL REFERENCES facture(id) ON DELETE CASCADE,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  designation   TEXT NOT NULL,
  quantite      INTEGER NOT NULL DEFAULT 1 CHECK (quantite > 0),
  prix_unitaire INTEGER NOT NULL CHECK (prix_unitaire >= 0),
  taux_tva      REAL NOT NULL DEFAULT 0,    -- 0 (IGS/exonéré) ou 0.1925
  montant_ht    INTEGER NOT NULL,
  ordre         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_ligne_facture ON ligne_facture(facture_id);

CREATE TABLE paiement_facture (
  id            TEXT PRIMARY KEY,
  facture_id    TEXT NOT NULL REFERENCES facture(id) ON DELETE CASCADE,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  montant       INTEGER NOT NULL CHECK (montant > 0),
  mode_paiement TEXT NOT NULL CHECK (mode_paiement IN
                    ('especes','mtn_momo','orange_money','virement','cheque','autre')),
  ecriture_id   TEXT REFERENCES ecriture(id)
);
CREATE INDEX idx_paiement_facture ON paiement_facture(facture_id);

-- Compteur gap-less par (entreprise, exercice, type). Incrémenté en transaction côté Worker.
CREATE TABLE sequence_numerotation (
  entreprise_id  TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  exercice_id    TEXT NOT NULL REFERENCES exercice(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('devis','facture')),
  dernier_numero INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entreprise_id, exercice_id, type)
);

-- ═══════════════════ Fiscalité (trace d'audit) ═══════════════════
CREATE TABLE calcul_igs (
  id             TEXT PRIMARY KEY,
  entreprise_id  TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  exercice_id    TEXT NOT NULL REFERENCES exercice(id),
  ca_cumule      INTEGER NOT NULL,
  classe         INTEGER,
  tarif_base     INTEGER,
  apres_cga      INTEGER,
  cac            INTEGER,
  igs_annuel     INTEGER,
  calcule_le     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ═══════════════════ Import bancaire ═══════════════════
CREATE TABLE import_bancaire (
  id            TEXT PRIMARY KEY,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  source        TEXT NOT NULL CHECK (source IN ('banque','mtn_momo','orange_money')),
  nom_fichier   TEXT NOT NULL,
  importe_le    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE ligne_releve (
  id            TEXT PRIMARY KEY,
  import_id     TEXT NOT NULL REFERENCES import_bancaire(id) ON DELETE CASCADE,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  libelle       TEXT NOT NULL,
  montant       INTEGER NOT NULL,
  sens          TEXT NOT NULL CHECK (sens IN ('debit','credit')),
  reference     TEXT,
  statut        TEXT NOT NULL DEFAULT 'non_rapproche'
                  CHECK (statut IN ('non_rapproche','rapproche','ignore')),
  ecriture_id   TEXT REFERENCES ecriture(id)
);
CREATE INDEX idx_ligne_releve ON ligne_releve(import_id, statut);

-- FK différée facture <- ecriture (déclarée ici car facture créée après ecriture dans le fichier).
-- SQLite ne supporte pas ALTER pour ajouter une FK ; la cohérence facture_id est tenue côté app.

-- ═══════════════════ Triggers d'intégrité comptable ═══════════════════
-- Maintiennent total_debit / total_credit de l'écriture à chaque mouvement de ligne.
CREATE TRIGGER trg_ligne_ins AFTER INSERT ON ligne_ecriture BEGIN
  UPDATE ecriture SET
    total_debit  = total_debit  + CASE WHEN NEW.sens='debit'  THEN NEW.montant ELSE 0 END,
    total_credit = total_credit + CASE WHEN NEW.sens='credit' THEN NEW.montant ELSE 0 END,
    updated_at   = datetime('now')
  WHERE id = NEW.ecriture_id;
END;

CREATE TRIGGER trg_ligne_del AFTER DELETE ON ligne_ecriture BEGIN
  UPDATE ecriture SET
    total_debit  = total_debit  - CASE WHEN OLD.sens='debit'  THEN OLD.montant ELSE 0 END,
    total_credit = total_credit - CASE WHEN OLD.sens='credit' THEN OLD.montant ELSE 0 END,
    updated_at   = datetime('now')
  WHERE id = OLD.ecriture_id;
END;

-- Interdit de valider une écriture déséquilibrée (débit ≠ crédit) ou vide.
CREATE TRIGGER trg_ecriture_equilibre
BEFORE UPDATE OF statut ON ecriture
WHEN NEW.statut = 'validee'
  AND (NEW.total_debit <> NEW.total_credit OR NEW.total_debit = 0)
BEGIN
  SELECT RAISE(ABORT, 'Ecriture desequilibree : debit != credit');
END;

-- Interdit de modifier les lignes d'une écriture déjà validée (immutabilité de la pièce).
CREATE TRIGGER trg_ligne_ins_verrou
BEFORE INSERT ON ligne_ecriture
WHEN (SELECT statut FROM ecriture WHERE id = NEW.ecriture_id) = 'validee'
BEGIN
  SELECT RAISE(ABORT, 'Ecriture validee : ajout de ligne interdit');
END;
