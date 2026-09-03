-- Personnalisation des factures/devis : note de bas de page libre (coordonnées bancaires,
-- remerciement, conditions...) affichée sur le PDF généré (voir apps/api/src/pdf/facture-pdf.ts).
-- Rien n'existait pour ça jusqu'ici — la facture était 100% figée.
ALTER TABLE entreprise ADD COLUMN note_facture TEXT;
