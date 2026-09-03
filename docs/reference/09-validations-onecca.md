# Validations ONECCA — réponses aux 8 points ouverts

**Source : validation transmise par le porteur du projet le 2026-09-03, sur la base du
SYSCOHADA révisé, du CGI camerounais et des pratiques DGI/ONECCA.** Ce fichier clôt les 8 points
listés en Annexe A de `docs/Spécifications_technique.md` et dans la section « Décisions ouvertes »
de `docs/DECISIONS.md`. Comme pour toute règle de ce dossier (règle d'or, `00-index.md`), une
mise à jour future doit citer sa propre source si elle modifie l'un de ces points.

## 1. Sous-comptes Mobile Money (551–554) et rôle du 585

Le compte **55 — Instruments de monnaie électronique** se subdivise ainsi (SYSCOHADA) :
- **551** Carte carburant
- **552** Téléphone portable (Orange Money, MTN MoMo…) — **un sous-compte par opérateur**
  (ex. `5521` Orange Money, `5522` MTN MoMo)
- **553** Carte péage
- **554** Porte-monnaie électronique

**Correction appliquée au code** : le plan comptable par défaut modélisait à tort MTN MoMo sur
`552` et Orange Money sur `553` — deux comptes racine différents, alors que **les deux opérateurs
téléphoniques partagent le même compte racine 552**, distingués par sous-compte. Corrigé en
`5521`/`5522` (voir `packages/comptable/src/plan-comptable.ts`).

Le **585 — Virements de fonds** est un compte de **transit uniquement** (chargement non encore
crédité, retrait non encore débité, virement inter-comptes en attente) — il doit revenir à zéro
dès que l'opération est confirmée côté opérateur/banque. Pas encore mouvementé par le moteur
actuel (aucune fonctionnalité de virement interne construite — Phase P1, voir
`Spécifications_technique.md` Partie II §1). Solde du 55 toujours débiteur ou nul.

## 2. Écarts de rapprochement et d'inventaire

- **Écarts de rapprochement** (banque/Mobile Money) non justifiés ou non significatifs → **658**
  (charges diverses) ou **758** (produits divers) selon le sens.
- **Écarts d'inventaire de stock** :
  - Manquants anormaux (vol, casse) → **603x** (variation de stocks) **+ éventuellement 658** si
    le montant est significatif et mérite d'être isolé comme charge exceptionnelle.
  - Différences justifiées (à la marge, non anormales) → transitent par **47** (compte
    transitoire) avant affectation définitive.
- **Impact sur `ajusterStock()`** (`entreprise-do.ts`) : le choix déjà fait (6031 pour toute
  perte/surplus, quel que soit le motif) reste la base correcte pour un MVP — la nuance 658 pour
  les cas « anormaux et significatifs » (vol notamment) est une amélioration future possible
  (ex. router le motif "Vol" vers 658 plutôt que 6031), pas un correctif urgent. Le principe
  47 (transitoire) ne s'applique pas ici : Kombi n'a pas de temporisation entre constat et
  affectation, l'ajustement est déjà définitif à la saisie.

## 3. RRR, escomptes, frais Mobile Money

| Opération | Compte |
|---|---|
| RRR obtenus (sur achats) | **609** |
| RRR accordés (sur ventes) | **709** |
| Escompte accordé (financier) | **673** |
| Escompte obtenu (financier) | **773** |
| Frais Mobile Money (commission opérateur) | **6312** (frais sur instruments de monnaie électronique) |

RRR = diminue le coût d'achat / le chiffre d'affaires. Escompte = charge/produit financier
distinct. Aucune de ces opérations n'est encore construite dans Kombi (pas d'écran RRR/escompte,
frais MoMo non isolés des commissions génériques) — comptes réservés pour une implémentation
future, référencés ici pour ne pas être réinventés au moment venu.

## 4. Regroupement 8xx à la clôture (SMT vs Normal) et écriture d'à-nouveau

- **Système Normal** : les comptes de charges (classe 6) et produits (classe 7) sont regroupés
  dans la **classe 8** (comptes de résultat) avant détermination du résultat net.
- **SMT** : pas de classe 8 complète — le résultat se détermine directement à partir des flux de
  trésorerie et des variations de stocks/créances/dettes.
- **Écriture d'à-nouveau (reprise)** : débit des comptes de bilan à solde débiteur + crédit des
  comptes à solde créditeur, **par le compte 890 — Bilan d'ouverture**. Les comptes de gestion
  (classes 6 et 7) ne sont **jamais** repris (ils repartent à zéro).
- Aucun impact code immédiat : la clôture d'exercice n'est pas construite (`docs/parcours.md`,
  🟡 « Clôture d'exercice + à-nouveaux »). Cette règle sert de référence directe pour cette
  future implémentation.

## 5. CAC sur l'IGS ; périodicité et forme de la liquidation TVA

- **CAC (Centimes Additionnels Communaux)** : **10 %** de l'impôt principal, **y compris sur
  l'IGS**. **Déjà implémenté correctement** dans `packages/fiscal/src/igs.ts`
  (`TAUX_CAC = 0.1`, appliqué après l'abattement CGA éventuel : `cac = apresCGA × 10 %`,
  `igsAnnuel = apresCGA + cac`) — confirmé conforme, aucun correctif nécessaire.
- **Liquidation TVA** (régime réel uniquement — l'IGS est exonéré de TVA sauf cas particuliers) :
  **mensuelle**, déclaration électronique via le portail DGI + paiement avant le **15 du mois
  suivant**. Pas encore construite (`docs/parcours.md`, 🟠 « Liquidation TVA déclarative » —
  Phase P2 dans la spec).

## 6. Minimum de perception IS ; réintégrations/déductions ; secteurs toujours au Réel

- **Minimum de perception** : **2 %** du chiffre d'affaires HT de l'exercice **précédent**
  (majoré du CAC → **2,2 %** effectif), dû même en cas de déficit. **Déjà implémenté
  correctement** dans `packages/fiscal/src/is.ts` (`TAUX_MINIMUM_PERCEPTION = 0.02`, majoré de
  `TAUX_CAC` — la fonction n'est pas encore appelée depuis l'API, IS complet reste Phase V1).
  Le paramètre `baseReference` de `calculerIS()` doit être alimenté avec le **CA HT de
  l'exercice précédent** (confirmé par cette validation — à câbler ainsi le jour de
  l'implémentation).
- **Réintégrations/déductions** : application stricte des articles du CGI (charges non
  déductibles : amendes, dépenses somptuaires…). Pas encore construit — aucune action code.
- **Secteurs toujours au régime du Réel** (quel que soit le CA) : pétrole, mines, gaz,
  crédit/banques, microfinance, assurance, téléphonie mobile, et certaines professions libérales
  au-delà d'un seuil spécifique. **Déjà implémenté correctement** dans
  `packages/fiscal/src/regime.ts` (`SECTEURS_TOUJOURS_REEL`) — la liste couvre déjà pétrolier,
  minier, gazier, credit, microfinance, assurance, telephonie (+ notaire, transport_interurbain,
  jeux, déjà présents par prudence) ; confirmé conforme, aucun correctif nécessaire.

## 7. Structure FEC / DSF ; mentions minimales reçu vs facture

- **FEC** : format texte normalisé (séparateur `|`), structure imposée par la DGI (logique proche
  du FEC français adaptée SYSCOHADA). Obligatoire en cas de contrôle. Pas encore construit
  (Phase P3, `Spécifications_technique.md` §8).
- **DSF** (Déclaration Statistique et Fiscale) : Normal, Allégé ou SMT selon le régime, dépôt
  électronique avant le **15 mars**. Pas encore construite (Phase V1).
- **Reçu de caisse** (mentions minimales) : nom/raison sociale **et NIU du vendeur**, date,
  montant TTC, nature de l'opération, signature/cachet. **Corrigé** (2026-09-03) : `niu` ajouté à
  `EntrepriseResume` et affiché dans le reçu imprimé et WhatsApp de `Caisse.tsx`. Voir
  `docs/parcours.md` § Facturation & devis.
- **Facture normalisée** : en plus du reçu → NIU du client (si assujetti), détail HT/TVA/TTC,
  taux de TVA, numéro unique séquentiel, mentions légales DGI. Déjà conforme côté
  `facture-pdf.ts` (numéro gap-less, NIU émetteur+client, HT/TVA/TTC) — confirmé, aucun correctif.

## 8. CMP vs PEPS pour les entités au SMT

**CMP (Coût Moyen Pondéré) est la méthode par défaut attendue** par l'ONECCA et la DGI pour les
entités au SMT (plus simple, adaptée à une comptabilité de trésorerie) ; le PEPS reste autorisé
s'il est appliqué de façon permanente et justifiée, mais n'est pas le choix par défaut. **Déjà le
choix retenu** par Kombi depuis l'origine (`docs/reference/08-stock-inventaire-permanent.md`,
décision D7) — confirmé conforme, aucun correctif nécessaire.
