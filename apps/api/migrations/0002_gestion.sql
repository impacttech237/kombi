-- Modules de gestion (cœur du produit) + configuration modulaire par entreprise.
-- La comptabilité découle automatiquement de ces opérations (couche invisible).

PRAGMA foreign_keys = ON;

-- ═══════════════════ Configuration modulaire ═══════════════════
-- État d'activation des modules par entreprise. config_json = réglages fins du module (JSON validé Zod).
CREATE TABLE module_entreprise (
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  code_module   TEXT NOT NULL CHECK (code_module IN
                  ('ventes','tiers','facturation','commandes','comptabilite','fiscalite','stock','achats')),
  actif         INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0,1)),
  config_json   TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (entreprise_id, code_module)
);

-- ═══════════════════ Stock (module optionnel) ═══════════════════
CREATE TABLE produit (
  id                TEXT PRIMARY KEY,
  entreprise_id     TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  nom               TEXT NOT NULL,
  sku               TEXT,
  unite             TEXT NOT NULL DEFAULT 'unité',
  prix_vente        INTEGER NOT NULL DEFAULT 0 CHECK (prix_vente >= 0),
  -- CMP courant (coût moyen pondéré) recalculé après chaque entrée. Voir docs/reference/08.
  cout_moyen_pondere INTEGER NOT NULL DEFAULT 0 CHECK (cout_moyen_pondere >= 0),
  stock_actuel      INTEGER NOT NULL DEFAULT 0,   -- quantité en unités
  seuil_alerte      INTEGER NOT NULL DEFAULT 0,
  actif             INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0,1)),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entreprise_id, sku)
);
CREATE INDEX idx_produit_entreprise ON produit(entreprise_id);

CREATE TABLE mouvement_stock (
  id            TEXT PRIMARY KEY,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  produit_id    TEXT NOT NULL REFERENCES produit(id),
  type          TEXT NOT NULL CHECK (type IN ('entree','sortie','ajustement')),
  quantite      INTEGER NOT NULL CHECK (quantite > 0),
  cout_unitaire INTEGER NOT NULL DEFAULT 0,       -- coût d'entrée ou CMP à la sortie
  motif         TEXT,
  vente_id      TEXT,                             -- FK logique (sortie sur vente)
  achat_id      TEXT,                             -- FK logique (entrée sur achat)
  date          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_mouvement_produit ON mouvement_stock(produit_id, date);

-- ═══════════════════ Ventes & caisse (cœur) ═══════════════════
CREATE TABLE vente (
  id            TEXT PRIMARY KEY,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  exercice_id   TEXT NOT NULL REFERENCES exercice(id),
  date          TEXT NOT NULL DEFAULT (datetime('now')),
  tiers_id      TEXT REFERENCES tiers(id),        -- NULL = client de passage
  mode_paiement TEXT NOT NULL CHECK (mode_paiement IN
                  ('especes','mtn_momo','orange_money','virement','cheque','autre')),
  total_ht      INTEGER NOT NULL DEFAULT 0,
  total_tva     INTEGER NOT NULL DEFAULT 0,
  total_ttc     INTEGER NOT NULL DEFAULT 0,
  statut        TEXT NOT NULL DEFAULT 'payee' CHECK (statut IN ('payee','annulee')),
  facture_id    TEXT REFERENCES facture(id),      -- facture émise à la demande (peut rester NULL)
  ecriture_id   TEXT REFERENCES ecriture(id),     -- écriture comptable générée
  caissier_id   TEXT REFERENCES utilisateur(id),
  client_uuid   TEXT,                             -- idempotence offline
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entreprise_id, client_uuid)
);
CREATE INDEX idx_vente_entreprise ON vente(entreprise_id, exercice_id, date);

CREATE TABLE ligne_vente (
  id            TEXT PRIMARY KEY,
  vente_id      TEXT NOT NULL REFERENCES vente(id) ON DELETE CASCADE,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  produit_id    TEXT REFERENCES produit(id),      -- NULL = ligne libre / prestation de service
  designation   TEXT NOT NULL,
  quantite      INTEGER NOT NULL DEFAULT 1 CHECK (quantite > 0),
  prix_unitaire INTEGER NOT NULL CHECK (prix_unitaire >= 0),
  taux_tva      REAL NOT NULL DEFAULT 0,          -- 0 (IGS/exonéré) ou 0.1925
  montant_ht    INTEGER NOT NULL,
  cout_unitaire INTEGER NOT NULL DEFAULT 0,       -- CMP au moment de la vente (pour le CMV)
  ordre         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_ligne_vente ON ligne_vente(vente_id);

-- ═══════════════════ Achats fournisseurs (module optionnel, dépend de stock) ═══════════════════
CREATE TABLE achat_fournisseur (
  id            TEXT PRIMARY KEY,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  exercice_id   TEXT NOT NULL REFERENCES exercice(id),
  tiers_id      TEXT NOT NULL REFERENCES tiers(id),
  date          TEXT NOT NULL DEFAULT (datetime('now')),
  total_ht      INTEGER NOT NULL DEFAULT 0,
  total_tva     INTEGER NOT NULL DEFAULT 0,
  total_ttc     INTEGER NOT NULL DEFAULT 0,
  statut        TEXT NOT NULL DEFAULT 'recu' CHECK (statut IN ('recu','annule')),
  ecriture_id   TEXT REFERENCES ecriture(id),
  client_uuid   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entreprise_id, client_uuid)
);
CREATE INDEX idx_achat_entreprise ON achat_fournisseur(entreprise_id, exercice_id);

CREATE TABLE ligne_achat (
  id            TEXT PRIMARY KEY,
  achat_id      TEXT NOT NULL REFERENCES achat_fournisseur(id) ON DELETE CASCADE,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  produit_id    TEXT NOT NULL REFERENCES produit(id),
  quantite      INTEGER NOT NULL CHECK (quantite > 0),
  cout_unitaire INTEGER NOT NULL CHECK (cout_unitaire >= 0),
  montant_ht    INTEGER NOT NULL
);
CREATE INDEX idx_ligne_achat ON ligne_achat(achat_id);

-- ═══════════════════ Commandes / missions (cœur, libellé adaptatif) ═══════════════════
CREATE TABLE commande (
  id            TEXT PRIMARY KEY,
  entreprise_id TEXT NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'commande' CHECK (type IN ('commande','mission')),
  tiers_id      TEXT REFERENCES tiers(id),
  libelle       TEXT NOT NULL,
  statut        TEXT NOT NULL DEFAULT 'en_attente'
                  CHECK (statut IN ('en_attente','en_cours','livree','annulee')),
  montant       INTEGER,
  date_prevue   TEXT,
  vente_id      TEXT REFERENCES vente(id),        -- convertie en vente à la livraison
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_commande_entreprise ON commande(entreprise_id, statut);
