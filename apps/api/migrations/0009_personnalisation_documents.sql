-- Identité visuelle appliquée aux factures et devis PDF.
ALTER TABLE entreprise ADD COLUMN en_tete_facture TEXT;
ALTER TABLE entreprise ADD COLUMN couleur_facture TEXT DEFAULT '#10784F';
