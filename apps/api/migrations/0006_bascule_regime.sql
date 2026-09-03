-- Bascule automatique IGS↔Réel (audit produit/fiscal 2026-09-03) : `determinerRegime()`
-- (packages/fiscal/src/regime.ts) implémente correctement la règle de maintien 2 ans
-- (CGI Art. 93 quinquies), mais rien ne persistait `regimePrecedent`/`ansSousSeuil` pour
-- l'appeler avec — la route les recalculait from-scratch sur le seul CA de l'exercice en
-- cours à chaque appel. Colonnes ajoutées pour porter cet état d'un exercice à l'autre.

ALTER TABLE entreprise ADD COLUMN ans_sous_seuil INTEGER NOT NULL DEFAULT 0;
-- Année (exercice = année civile, D10) pour laquelle regime_fiscal/ans_sous_seuil ont été
-- calculés pour la dernière fois — évite de ré-évaluer la bascule à chaque appel API dans la
-- même année (la règle ne s'applique qu'au changement d'exercice, pas en continu).
ALTER TABLE entreprise ADD COLUMN regime_annee_maj INTEGER;
