# Ventes, reçus et factures — deux notions distinctes

**Source : CGI 2026, Art. 150 (obligations des redevables TVA).**

## Décision de modélisation : `vente` ≠ `facture`
Le CGI Art. 150 impose aux **assujettis à la TVA (régime du Réel)** de délivrer des **factures**
mentionnant obligatoirement :
- le **NIU du fournisseur ET du client** ;
- la date, le nom / la raison sociale, l'adresse complète ;
- (et transitant par le système de facturation électronique de l'administration).

**Conséquences :**
1. Une **facture normalisée exige le NIU du client** → impossible pour un client de passage anonyme
   en caisse. On ne peut donc PAS transformer chaque ticket de caisse en facture normalisée.
2. L'obligation de facture pèse sur les **assujettis TVA (Réel)**. Une TPE à l'**IGS** n'est pas
   assujettie TVA et n'a pas la même contrainte de facture normalisée.

→ On modélise **deux entités** :
- **`vente`** : l'opération commerciale réelle (caisse), **toujours** enregistrée. Produit un
  **reçu** simple par défaut. C'est elle qui alimente la comptabilité, le CA cumulé et l'IGS.
- **`facture`** : document légal **numéroté séquentiellement** (voir 2026), émis **à la demande**
  (client qui la réclame, opération Réel/TVA). Porte les mentions obligatoires + NIU client.

Une `vente` peut référencer la `facture` générée (`vente.facture_id`), mais toutes les ventes ne
deviennent pas des factures.

## Numérotation séquentielle (facture uniquement)
La numérotation strictement séquentielle et non modifiable (anticipation facturation électronique
2026) s'applique aux **factures**, pas aux reçus de caisse. Format retenu (décision fondateur) :
`{NOM_ENTREPRISE}-FAC-{ANNEE}-{SEQ}` (ex. `IMPACT-FAC-2026-0001`), gap-less par exercice.
Correction par **avoir**, jamais par suppression.

## À valider ONECCA / juriste fiscal
- Seuil / obligation exacte de délivrance de reçu en caisse pour les non-assujettis TVA.
- Mentions minimales d'un reçu de caisse (vs facture normalisée).
