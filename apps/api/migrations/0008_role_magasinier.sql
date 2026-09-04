-- Rôle « magasinier » (stock uniquement) — granularité de rôles discutée avec le DG
-- (voir docs/DECISIONS.md D18) : un rôle dédié à la gestion du stock, sans accès caisse/finance.
-- Même pattern de recréation que 0004 (SQLite ne sait pas altérer un CHECK in-place).

PRAGMA foreign_keys = ON;

ALTER TABLE membre_entreprise RENAME TO membre_entreprise_v2;

CREATE TABLE membre_entreprise (
  id             TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  entreprise_id  TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('admin','gerant','caissier','comptable','employe','magasinier')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (utilisateur_id, entreprise_id)
);
INSERT INTO membre_entreprise (id, utilisateur_id, entreprise_id, role, created_at)
  SELECT id, utilisateur_id, entreprise_id, role, created_at FROM membre_entreprise_v2;
DROP TABLE membre_entreprise_v2;

CREATE INDEX idx_membre_entreprise ON membre_entreprise(entreprise_id);
CREATE INDEX idx_membre_utilisateur ON membre_entreprise(utilisateur_id);
