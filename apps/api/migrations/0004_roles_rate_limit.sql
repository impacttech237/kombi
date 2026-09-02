-- P0 #5 : rôles étendus (comptable, employé) + rate-limiting des routes sensibles.
-- SQLite ne sait pas altérer un CHECK in-place → recréation de la table (pattern déjà
-- utilisé côté DO, voir apps/api/src/do/schema.ts).

PRAGMA foreign_keys = ON;

ALTER TABLE membre_entreprise RENAME TO membre_entreprise_v1;

CREATE TABLE membre_entreprise (
  id             TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
  entreprise_id  TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('admin','gerant','caissier','comptable','employe')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (utilisateur_id, entreprise_id)
);
INSERT INTO membre_entreprise (id, utilisateur_id, entreprise_id, role, created_at)
  SELECT id, utilisateur_id, entreprise_id, role, created_at FROM membre_entreprise_v1;
DROP TABLE membre_entreprise_v1;

CREATE INDEX idx_membre_entreprise ON membre_entreprise(entreprise_id);
CREATE INDEX idx_membre_utilisateur ON membre_entreprise(utilisateur_id);

-- Rate limiting fenêtre fixe (simple, sans binding externe) pour les routes d'authentification.
CREATE TABLE rate_limit (
  cle           TEXT PRIMARY KEY,
  compteur      INTEGER NOT NULL DEFAULT 1,
  fenetre_debut TEXT NOT NULL
);
