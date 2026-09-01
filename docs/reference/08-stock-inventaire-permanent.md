# Stock — inventaire permanent au coût moyen pondéré (CMP)

**Source : Acte uniforme OHADA droit comptable ; Guide d'application SYSCOHADA, chap. 29
« Inventaire permanent en comptabilité financière ».** Méthode retenue (décision fondateur).

## Méthode de valorisation : CMP après chaque entrée
Le Guide SYSCOHADA prévoit la valorisation soit en **PEPS** (Premier Entré Premier Sorti), soit au
**Coût Moyen Pondéré (CMP)**. Retenu : **CMP recalculé après chaque entrée**
> « La méthode se prête parfaitement à une gestion continue en inventaire permanent. » (Guide §1.1.4.1)

```
CMP après entrée = (valeur_stock_avant + valeur_entree) / (qte_avant + qte_entree)
```
Toute sortie (vente) est valorisée à ce CMP courant. C'est le **coût des marchandises vendues (CMV)**.

## Comptes utilisés (vérifiés)
| Compte | Intitulé |
|---|---|
| 31 / 311 | Marchandises |
| 601 | Achats de marchandises |
| 603 / 6031 | Variations des stocks de biens achetés — marchandises |
| 401 | Fournisseurs |
| 411 / 571… | Clients / Trésorerie |
| 701 | Ventes de marchandises |

## Écritures générées automatiquement (inventaire permanent)
### Achat de marchandises (entrée en stock au coût d'achat)
| Débit | Crédit |
|---|---|
| 601 Achats (montant HT) | 401 Fournisseur (TTC) |
| 4452 TVA récupérable (si Réel) | |
| **31 Marchandises** (coût d'achat) | **6031 Variation des stocks** (coût d'achat) |

### Vente de marchandises (sortie de stock au CMP)
| Débit | Crédit |
|---|---|
| 571/411 (TTC) | 701 Ventes (HT) |
| | 4431 TVA facturée (si Réel) |
| **6031 Variation des stocks** (CMV au CMP) | **31 Marchandises** (CMV au CMP) |

Ainsi le compte **31** reflète en permanence la valeur réelle du stock, et **6031** enregistre la
variation nette (impact sur le résultat). Le stock physique (quantités, alertes de seuil) est suivi
en temps réel côté module Stock ; ces écritures en sont le reflet comptable.

## Module optionnel
Ces écritures ne sont générées que si le module **stock** est actif pour l'entreprise
(profils Commerce et Mixte). Pour un service pur (module stock OFF), aucune notion de 31/6031 :
la vente ne génère que produit + trésorerie (+ TVA le cas échéant).

## À valider ONECCA
- Choix CMP vs PEPS pour les entités SMT (petites entités) — confirmer l'acceptabilité de
  l'inventaire permanent pour une TPE, ou repli intermittent en fin d'exercice.
- Traitement des écarts d'inventaire (compte 6031 vs 603x / ajustements).
