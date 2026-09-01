-- Control plane (D1 global unique) : identité, registre des entreprises, appartenances.
-- Les DONNÉES de chaque entreprise vivent dans son Durable Object (EntrepriseDO), pas ici. Voir D13.

PRAGMA foreign_keys = ON;

CREATE TABLE utilisateur (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nom         TEXT NOT NULL,
  telephone   TEXT,
  auth_id     TEXT UNIQUE,                 -- lien vers better-auth user.id
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Registre des entreprises (métadonnées + profil de configuration). Données métier => DO.
CREATE TABLE entreprise (
  id              TEXT PRIMARY KEY,
  raison_sociale  TEXT NOT NULL,
  niu             TEXT,
  forme_juridique TEXT,
  secteur         TEXT NOT NULL DEFAULT 'commerce' CHECK (secteur IN ('commerce','service','mixte')),
  nature_activite TEXT NOT NULL CHECK (nature_activite IN ('negoce','artisanal','service','liberale')),
  regime_fiscal   TEXT NOT NULL DEFAULT 'igs' CHECK (regime_fiscal IN ('igs','reel_simplifie','reel_normal')),
  systeme_ohada   TEXT NOT NULL DEFAULT 'smt' CHECK (systeme_ohada IN ('smt','normal')),
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
CREATE INDEX idx_membre_utilisateur ON membre_entreprise(utilisateur_id);
