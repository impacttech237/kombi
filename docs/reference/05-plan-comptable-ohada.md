# Plan comptable OHADA (SYSCOHADA révisé) — sous-ensemble MVP

**Source : Acte uniforme OHADA relatif au droit comptable + Guide d'application SYSCOHADA.**
Les numéros de comptes ci-dessous sont **vérifiés dans le texte officiel**.

## Les 8 classes (structure impérative)
| Classe | Intitulé | Nature |
|:---:|---|---|
| 1 | Comptes de ressources durables | Passif (capitaux, emprunts) |
| 2 | Comptes de l'actif immobilisé | Actif |
| 3 | Comptes de stocks | Actif |
| 4 | Comptes de tiers | Actif/Passif (créances/dettes) |
| 5 | Comptes de trésorerie | Actif/Passif |
| 6 | Comptes de charges des activités ordinaires | Charge |
| 7 | Comptes de produits des activités ordinaires | Produit |
| 8 | Comptes des autres charges et autres produits | Charge/Produit |

Les comptes sont identifiés par un numéro et un intitulé ; codification décimale
(1er chiffre = classe). La terminaison 9 = comptes soustractifs (dépréciations, provisions).
Solde de gestion : classe 7 et soldes créditeurs de 8 → au crédit ; classe 6 et soldes
débiteurs de 8 → au débit (Guide SYSCOHADA).

## Comptes utilisés par le moteur MVP (vérifiés)
### Classe 4 — Tiers
| Compte | Intitulé |
|---|---|
| 401 / 4011 | Fournisseurs, dettes en compte |
| 411 / 4111 | Clients |
| 443 | État, TVA facturée — 4431 sur ventes, 4432 sur prestations de services |
| 445 | État, TVA récupérable — 4452 sur achats, 4453 sur transport |

### Classe 5 — Trésorerie
| Compte | Intitulé |
|---|---|
| 521 / 5211 | Banques locales (monnaie nationale) |
| 531 | Chèques postaux |
| 571 / 5711 | Caisse siège social (espèces) |
| 585 | Virements de fonds (compte de transit) |

### Classe 6 — Charges (dépenses)
| Compte | Intitulé |
|---|---|
| 601 | Achats de marchandises |
| 602 | Achats de matières premières et fournitures liées |
| 604 | Achats stockés de matières et fournitures |
| 605 | Autres achats |
| 622 | Locations et charges locatives |
| 627 | Publicité, publications, relations publiques |

### Classe 7 — Produits (recettes)
| Compte | Intitulé |
|---|---|
| 701 | Ventes de marchandises |
| 702 | Ventes de produits finis |
| 707 | Produits accessoires |

## ⚠️ Mobile Money — décision de modélisation (à valider ONECCA)
Le plan SYSCOHADA **ne prévoit pas de compte dédié au mobile money**. Choix retenu :
sous-comptes de trésorerie dédiés (ex. **551 / 552 — Mobile Money MTN MoMo**,
**553 — Orange Money**) traités comme des comptes de type « banque/caisse électronique »,
avec le **585 (virements de fonds)** comme compte de transit lors des transferts
espèces↔mobile↔banque. À confirmer avec l'expert-comptable.

## Génération d'écritures — exemples (partie double)
Interface simple → écriture double automatique (le mode de paiement détermine le compte de trésorerie) :

| Saisie utilisateur | Débit | Crédit |
|---|---|---|
| Recette 10 000 espèces (vente marchandise, IGS) | 571 Caisse 10 000 | 701 Ventes 10 000 |
| Recette 10 000 par MTN MoMo | 552 MoMo 10 000 | 701 Ventes 10 000 |
| Dépense 5 000 virement (achat marchandise) | 601 Achats 5 000 | 521 Banque 5 000 |
| Vente 11 925 TTC (Réel, TVA 19,25%) | 411 Client 11 925 | 701 Ventes 10 000 + 4431 TVA 1 925 |

## Mapping catégorie utilisateur → compte
`packages/comptable` tient une table `categorie → compte OHADA` (ex. « Ventes » → 701,
« Loyer » → 622, « Fournitures » → 605). La catégorie est le langage utilisateur ; le compte
est l'implémentation comptable cachée. Table de correspondance à figer et valider ONECCA.
