# Taxe sur la Valeur Ajoutée (TVA)

**Source : CGI 2026, Art. 142 (taux) et Art. 149 (perception).**

## Qui est concerné (décision produit)
- Les entreprises au **Réel** sont assujetties à la TVA → le MVP gère la TVA sur facture.
- Les entreprises à l'**IGS** ne facturent **pas** de TVA → aucun champ TVA pour elles.
- Règle produit : l'affichage/collecte TVA sur facture dépend du `regime_fiscal` de l'entreprise
  (et de l'assujettissement TVA). Une facture IGS = HT uniquement (TTC = HT).

## Taux (Art. 142)
| Taux | Valeur | Effectif avec CAC 10 % |
|---|---|---|
| Taux général | **17,5 %** | **19,25 %** |
| Taux réduit | 10 % | — |
| Taux zéro | 0 % (exportations de produits taxables) | 0 % |

Le **taux effectif de TVA au Cameroun est 19,25 %** = 17,5 % + 10 % de CAC
(confirmé dans le CGI : « 19,25 % pour la TVA »). C'est ce taux qui figure sur les factures.

```
tva = montantHT * 0.1925     // taux général effectif
ttc = montantHT + tva
```

## Exonérations
- Biens de première nécessité : **Annexe I du Titre II** du CGI (liste tarifaire) — exonérés.
- Exportations : taux zéro (Art. 142 (5)).
- *Pour le MVP : gérer taux général 19,25 %, taux 0 (export) et « exonéré ». La liste détaillée
  des biens exonérés sera intégrée progressivement.*

## Retenue à la source (Art. 149 (2))
Pour les fournisseurs de l'État, des CTD, des EPA, des sociétés à capital public et de certains
OBNL/entreprises listés : la TVA est **retenue à la source** au règlement de la facture.
- Concerne les factures initiales **et** les factures d'avoir.
- Donne lieu à une attestation de retenue générée par le système fiscal.
- *Impact produit (post-MVP) : marquer une facture « TVA retenue à la source » selon le type de
  client. À intégrer avec la facturation électronique.*

## À valider ONECCA
- Confirmer 19,25 % comme taux à faire figurer par défaut sur les factures Réel.
- Modalités déclaratives TVA (périodicité mensuelle) — hors calcul MVP mais à cadrer pour la DSF.
