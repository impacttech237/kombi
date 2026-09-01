# Impôt Général Synthétique (IGS)

**Source : CGI 2026, Art. C 40 à C 43.** Vérifié conforme au cahier des charges §4.1.
> Fonctionnalité **gratuite phare** du produit — le barème doit être codé **exactement**.

## Assiette (Art. C 40 (1))
L'IGS est **assis sur le chiffre d'affaires annuel hors taxes** et liquidé selon le barème
ci-dessous.

## Barème officiel (Art. C 40 (1)) — 10 classes
| Classe | Fourchette CA annuel HT (FCFA) | IGS annuel (FCFA) |
|:---:|---|---:|
| 1 | < 500 000 | 20 000 |
| 2 | 500 000 – < 1 000 000 | 30 000 |
| 3 | 1 000 000 – < 1 500 000 | 40 000 |
| 4 | 1 500 000 – < 2 000 000 | 50 000 |
| 5 | 2 000 000 – < 2 500 000 | 60 000 |
| 6 | 2 500 000 – < 5 000 000 | 150 000 |
| 7 | 5 000 000 – < 10 000 000 | 300 000 |
| 8 | 10 000 000 – < 20 000 000 | 500 000 |
| 9 | 20 000 000 – < 30 000 000 | 1 000 000 |
| 10 | 30 000 000 – < 50 000 000 | 2 000 000 |

Bornes **inclusives en bas, exclusives en haut** (« égal ou supérieur à X et inférieur à Y »).
Au-delà de 50 000 000 → sortie de l'IGS, passage au **Réel** (cf. `01-regimes-imposition.md`).

## Abattement CGA — réduction de moitié (Art. C 40 (2))
> « Pour les assujettis … **soumis à l'obligation de tenue d'une comptabilité**, les tarifs de
> l'IGS … sont **réduits de moitié** en cas d'adhésion à un Centre de Gestion Agréé (CGA). »

- La réduction s'applique **sur le tarif** (le montant du barème), pas sur le CA.
- Condition : adhésion CGA **ET** tenue d'une comptabilité. Statut CGA déclaré dans le profil
  entreprise.

## Centimes Additionnels Communaux (CAC) — +10 %
Majoration de **10 % au titre des CAC**, appliquée sur le montant de l'IMPÔT
(CGI 2026, disposition générale CAC ; cahier des charges §4.1). Appliquée **après** l'éventuelle
réduction CGA.

## Ordre de calcul (à respecter)
```
tarif      = barème(caAnnuelHT)              // montant de la classe
apresCGA   = adherentCGA ? tarif / 2 : tarif
igsDu      = apresCGA * 1.10                 // + 10 % CAC
```

## Périodicité et déclaration (Art. C 41 – C 42)
- **Déclaration annuelle** au plus tard le **15 avril** au Centre des Impôts ; impôt acquitté
  en un seul versement concomitant, OU
- **Option paiement trimestriel** : acquitté dans les **15 jours** suivant la fin de chaque
  trimestre (IGS annuel / 4).
- IGS dû **par établissement** en cas de plusieurs activités distinctes du même contribuable
  (Art. C 42 (1)).
- Déclaration récapitulative annuelle → régularisations éventuelles (Art. C 41 (4)).

## Alerte de franchissement de seuil (cahier des charges §4.1)
Alerter automatiquement lorsque le **CA cumulé de l'exercice, projeté linéairement** sur les
mois écoulés, approche/dépasse un seuil qui changerait la classe IGS ou ferait sortir vers le
Réel. Projection = `ca_cumule / mois_ecoules * 12`.

## Jeux de tests obligatoires (`packages/fiscal`)
- Chaque borne de classe (valeurs limites : 499 999 / 500 000 / 999 999 / 1 000 000 …).
- Cas CGA (tarif / 2) et non-CGA, avec et sans CAC.
- CA = 50 000 000 exactement → **hors IGS** (Réel).
- Projection de franchissement (mi-exercice).

## À valider ONECCA
- Base exacte d'application du CAC sur l'IGS (confirmer 10 % sur l'impôt).
- Articulation CGA + comptabilité obligatoire pour les toutes petites entreprises IGS.
