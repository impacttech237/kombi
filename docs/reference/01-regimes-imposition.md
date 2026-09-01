# Régimes d'imposition — détermination automatique

**Source : CGI 2026, Art. 93 ter à 93 quinquies** (Section I : Régimes d'imposition).
Le régime est déterminé **en fonction du chiffre d'affaires annuel HT réalisé**.

## Les régimes (Art. 93 ter)
1. Régime de l'**Impôt Général Synthétique (IGS)**
2. Régime du **Réel**
3. Régime des organismes à but non lucratif — *hors périmètre PME*
4. Régime des contribuables non professionnels — *hors périmètre*

## Seuils (Art. 93 quater)

**Relèvent de l'IGS** les contribuables (activité commerciale, industrielle, artisanale,
agropastorale ou non commerciale) dont le CA annuel HT est **inférieur à** :
- **50 000 000 FCFA** — activités commerciales, industrielles, artisanales, agropastorales
- **30 000 000 FCFA** — professions libérales

**Relèvent du Réel (Art. 93 quater (2)) :**
- À raison du CA : entreprises individuelles et personnes morales avec CA HT **≥ 50 000 000 FCFA**
  (≥ 30 000 000 FCFA pour les professions libérales).
- **Sans considération du CA** (toujours au Réel, quel que soit le CA) : secteurs pétrolier,
  minier, gazier, crédit, microfinance, assurance, téléphonie mobile ; titulaires de charges
  notariales ; transporteurs interurbains (Art. 93 septies) ; certains exploitants de jeux
  (Art. 93 octies) ; nouveaux contribuables sur agrément/programme d'investissement.

## ⚠️ Règle de maintien — 2 ans (Art. 93 quinquies)
> « Les entreprises dont le chiffre d'affaires passe **en dessous** des limites … sont
> **maintenues dans leur régime initial pendant une période de deux ans**. »

**Conséquence produit :** une baisse de CA ne fait PAS redescendre automatiquement du Réel
vers l'IGS. La bascule à la baisse n'intervient qu'après 2 exercices consécutifs sous le seuil.
La bascule **à la hausse** (franchissement de 50M) fait passer au Réel.

## Détermination du système comptable OHADA
Distinct du régime fiscal. Basé aussi sur le CA (cf. `06-etats-financiers.md`, à extraire du
Guide SYSCOHADA). Rappel cahier des charges §3.3 : minimal (CA < 30M commerce / 20M services),
allégé, normal — **changement jamais rétroactif sur l'exercice en cours sans confirmation**.

## Règles d'implémentation (`packages/fiscal`)
```
determinerRegime({ caAnnuelHT, natureActivite, secteurSpecial, regimePrecedent, ansSousSeuil }):
  seuil = natureActivite === 'liberale' ? 30_000_000 : 50_000_000
  si secteurSpecial ∈ {petrolier, minier, gazier, credit, microfinance, assurance,
                        telephonie, notaire, transport_interurbain, jeux...} → 'reel'
  si caAnnuelHT >= seuil → 'reel'
  si regimePrecedent === 'reel' et ansSousSeuil < 2 → 'reel'   // maintien 2 ans
  sinon → 'igs'
```
- `ansSousSeuil` = nombre d'exercices consécutifs clôturés sous le seuil.
- Le forçage manuel par un expert-comptable reste possible (cf. cahier des charges §3.3).

## À valider ONECCA
- Traitement exact du décompte des « 2 ans » (exercices civils vs glissants).
- Liste complète des secteurs « toujours au Réel » à confirmer avec l'expert.
