-- Abonnements & plans (Gratuit / Essentiel / Pro) — control plane D1.
-- Voir docs/Spécifications_technique.md §7. MVP : pas de paiement automatisé (validation staff
-- manuelle plus tard, Phase P2) — toute entreprise démarre en essai gratuit.

PRAGMA foreign_keys = ON;

CREATE TABLE plan (
  code           TEXT PRIMARY KEY CHECK (code IN ('gratuit', 'essentiel', 'pro')),
  nom            TEXT NOT NULL,
  prix_mensuel   INTEGER NOT NULL,
  features_json  TEXT NOT NULL,
  actif          INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1))
);

CREATE TABLE abonnement (
  id                 TEXT PRIMARY KEY,
  entreprise_id      TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  plan_code          TEXT NOT NULL REFERENCES plan(code),
  statut             TEXT NOT NULL DEFAULT 'essai' CHECK (statut IN ('essai', 'actif', 'suspendu', 'expire', 'annule')),
  debut              TEXT NOT NULL DEFAULT (datetime('now')),
  fin_periode        TEXT,
  essai_fin          TEXT,
  renouvellement_auto INTEGER NOT NULL DEFAULT 1 CHECK (renouvellement_auto IN (0, 1)),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entreprise_id)
);
CREATE INDEX idx_abonnement_entreprise ON abonnement(entreprise_id);

-- Matrice indicative (spec §7) : Gratuit = 1 utilisateur, caisse+compta, quota 50 factures/mois ;
-- Essentiel = multi-utilisateurs, factures illimitées, dépenses ; Pro = rapprochement,
-- récurrent/relances, multi-boutiques, projets, IA.
INSERT INTO plan (code, nom, prix_mensuel, features_json) VALUES
  ('gratuit', 'Gratuit', 0, '{"maxUtilisateurs":1,"quotaFacturesMois":50,"modules":["ventes","tiers","facturation","commandes","comptabilite","fiscalite","depenses"]}'),
  ('essentiel', 'Essentiel', 15000, '{"maxUtilisateurs":null,"quotaFacturesMois":null,"modules":["ventes","tiers","facturation","commandes","comptabilite","fiscalite","depenses","stock","achats"]}'),
  ('pro', 'Pro', 35000, '{"maxUtilisateurs":null,"quotaFacturesMois":null,"modules":["ventes","tiers","facturation","commandes","comptabilite","fiscalite","depenses","stock","achats"],"rapprochement":true,"recurrent":true,"multiBoutiques":true}');
