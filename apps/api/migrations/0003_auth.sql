-- Tables better-auth (v1.7.2) — schéma dérivé de getAuthTables (email + mot de passe).
-- Colonnes en camelCase : better-auth les attend telles quelles. Dates en TEXT ISO, booléens en INTEGER.
-- Le profil métier vit dans `utilisateur` (0001), lié par utilisateur.auth_id = user.id.

PRAGMA foreign_keys = ON;

CREATE TABLE user (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image         TEXT,
  createdAt     TEXT NOT NULL,
  updatedAt     TEXT NOT NULL
);

CREATE TABLE session (
  id        TEXT PRIMARY KEY,
  expiresAt TEXT NOT NULL,
  token     TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX idx_session_userid ON session(userId);

CREATE TABLE account (
  id                    TEXT PRIMARY KEY,
  issuer                TEXT,
  accountId             TEXT NOT NULL,
  providerId            TEXT NOT NULL,
  userId                TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken           TEXT,
  refreshToken          TEXT,
  idToken               TEXT,
  accessTokenExpiresAt  TEXT,
  refreshTokenExpiresAt TEXT,
  scope                 TEXT,
  password              TEXT,
  createdAt             TEXT NOT NULL,
  updatedAt             TEXT NOT NULL
);
CREATE INDEX idx_account_userid ON account(userId);

CREATE TABLE verification (
  id         TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value      TEXT NOT NULL,
  expiresAt  TEXT NOT NULL,
  createdAt  TEXT NOT NULL,
  updatedAt  TEXT NOT NULL
);
