# États financiers — systèmes de présentation

**Source : Acte uniforme OHADA relatif au droit comptable révisé, Art. 11 à 13.**

## ⚠️ Écart avec le cahier des charges
Le cahier des charges (§3.3) mentionne **trois** systèmes : minimal, allégé, normal.
Le texte OHADA **révisé** n'en connaît plus que **deux** : le **Système Normal** et le
**Système Minimal de Trésorerie (SMT)**. Le « système allégé » a été **supprimé** lors de la
révision. → **On suit le texte officiel : 2 systèmes.** (À confirmer avec l'expert-comptable, mais
ne pas coder un système allégé qui n'existe plus.)

## Système Normal (par défaut — Art. 11)
> « Toute entité est, sauf exception liée à sa taille, soumise au Système normal. »

Comporte : **Bilan**, **Compte de résultat**, **Tableau des flux de trésorerie**, **Notes annexes**.
→ MVP : générer **Bilan + Compte de résultat**. Flux de trésorerie et notes annexes = post-MVP.

## Système Minimal de Trésorerie — SMT (Art. 13)
> « Les petites entités sont assujetties, sauf option, au SMT. »

**Seuils d'éligibilité — CA annuel HT inférieur à :**
| Type d'activité | Seuil SMT |
|---|---:|
| Négoce (commerce) | **60 000 000 FCFA** |
| Artisanales et assimilées | **40 000 000 FCFA** |
| Services | **30 000 000 FCFA** |

Au-dessus de ces seuils → **Système Normal**. Le SMT repose sur une **comptabilité de trésorerie
simplifiée** (recettes/dépenses) avec établissement d'un Bilan et d'un Compte de résultat simplifiés.
Une petite entité peut **opter** pour le Système Normal.

## Détermination automatique (règle produit)
```
determinerSystemeOHADA({ caAnnuelHT, typeActivite, optionNormal }):
  si optionNormal → 'normal'
  seuil = { negoce: 60_000_000, artisanal: 40_000_000, service: 30_000_000 }[typeActivite]
  retourner caAnnuelHT < seuil ? 'smt' : 'normal'
```

## Règle de non-rétroactivité (cahier des charges §3.3)
Un changement de système déclenché par le franchissement d'un seuil de CA doit :
1. **notifier l'utilisateur**, et
2. **ne jamais s'appliquer rétroactivement** sur l'exercice en cours **sans confirmation explicite**.

Le forçage manuel par un expert-comptable reste possible.

## Cohérence régime fiscal ↔ système comptable
Ce sont deux axes **distincts** (fiscal : IGS/Réel ; comptable : SMT/Normal) mais corrélés par le CA.
Une TPE au négoce avec CA 40M : IGS (fiscal, < 50M) **et** SMT (comptable, < 60M).
Une PME services CA 45M : Réel (fiscal, ≥ 30M libéral/services selon nature) **et** Normal
(comptable, ≥ 30M services). Ne pas confondre les seuils.

## À extraire ensuite (post-scaffolding, pour la génération)
- Modèle exact du **Bilan Système Normal** (Guide SYSCOHADA, chap. 3) : postes/rubriques.
- Modèle exact du **Compte de résultat** (chap. 4) : soldes intermédiaires de gestion.
- Modèle **Bilan/CR du SMT** (chap. 2 SMT).
- Table de correspondance **Postes ↔ Comptes** du Système Normal (chap. 7).
