# Kombi — Revue fonctionnelle complète & prompts de correction UI/UX

> Ce document sert à une seule chose : te donner, à toi qui continues l'interface dans Figma
> Make, (1) une description complète et exacte de ce que Kombi doit faire — écran par écran,
> règle par règle — et (2) des prompts prêts à coller dans le chat Figma Make pour corriger ce
> qui ne va pas et créer ce qui manque, à partir de l'audit du prototype v15.
>
> Écrit en croisant quatre points de vue à chaque décision : **chef de développement** (est-ce
> cohérent avec le moteur déjà codé ?), **dirigeant d'entreprise** (est-ce que ça sert vraiment le
> commerçant qui utilise l'app tous les jours ?), **expert-comptable** (est-ce juste au regard du
> SYSCOHADA et du CGI camerounais ?), **directeur UX/UI** (est-ce agréable, rapide, sans friction
> au doigt ?).

## Comment utiliser ce document

1. **Partie 1** décrit Kombi tel qu'il doit fonctionner — lis-la une fois en entier avant de
   toucher à quoi que ce soit dans Figma Make. C'est la référence à laquelle chaque prompt de la
   Partie 4 fait implicitement appel.
2. **Partie 2** résume le système de design déjà posé dans le prototype v15 (à conserver).
3. **Partie 3** est un tableau récapitulatif des écarts (issu de l'audit du 2026-09-02).
4. **Partie 4** contient les prompts. Colle-les **un par un**, dans l'ordre suggéré, en laissant
   Figma Make finir chaque écran avant de passer au suivant. Chaque prompt est autonome (il
   redonne le contexte nécessaire) mais suppose que les écrans précédents du prototype existent
   déjà — l'IA doit réutiliser les composants et couleurs déjà en place, pas repartir de zéro.

---

# Partie 1 — Ce que Kombi doit faire

## 1.1 Vision produit

Kombi est un outil de **gestion d'entreprise** pour les TPE/PME de la zone CEMAC (Cameroun en
premier). La comptabilité et la fiscalité ne sont **jamais** l'entrée principale : le commerçant
vend, achète, encaisse, dépense — et la comptabilité SYSCOHADA correcte, la TVA, l'IGS
s'écrivent **automatiquement en arrière-plan**, sans qu'il ait à connaître un seul numéro de
compte. C'est la promesse centrale, celle qui doit transparaître dans chaque écran : « tu gères
ton commerce, on s'occupe des chiffres ».

Deux publics sur un même produit :
- Le **commerçant/gérant** qui veut vendre vite, savoir ce qu'il a en caisse, qui lui doit de
  l'argent, et être tranquille avec les impôts.
- Le **comptable** (le sien, ou celui du centre de gestion) qui doit pouvoir, en lecture, sortir
  un bilan, un compte de résultat, une balance conformes — sans ressaisir quoi que ce soit.

### Contraintes non négociables

- **Mobile-first, au doigt, en terrain.** Gros boutons, 2-3 taps pour une vente, jamais de
  jargon comptable visible par défaut.
- **Jamais bloquer la vente.** Une rupture de stock, un doute sur un prix : on trace, on
  n'empêche pas d'encaisser. Le seul blocage acceptable est réglementaire (ex. TVA interdite en
  IGS) ou une donnée obligatoire manquante (ex. NIU client sur une facture au régime réel).
- **Offline-caisse.** Le module Ventes fonctionne sans réseau (file locale, synchro à la
  reconnexion, idempotente).
- **Toute écriture comptable validée est immuable.** On ne modifie ni ne supprime jamais une
  écriture passée — on la corrige par une écriture inverse (avoir, contre-passation
  d'annulation). C'est un principe SYSCOHADA, pas un détail technique : chaque écran de
  correction doit le refléter (bouton « Avoir », jamais « Modifier » sur une facture émise).
- **Le régime fiscal conditionne l'app entière.** Une entreprise est soit à l'**IGS** (impôt
  forfaitaire par tranche de chiffre d'affaires, pas de TVA, la majorité des petits commerces),
  soit au **Réel** (TVA 19,25 %, IS, obligations de facturation normalisée). Tout écran qui parle
  d'argent doit savoir dans lequel des deux il se trouve et changer de contenu en conséquence —
  ce n'est **jamais** une case à cocher optionnelle, c'est la première question que pose le
  moteur avant tout calcul.
- **Isolation totale entre entreprises.** Chaque entreprise a sa propre base de données (pas de
  fuite de données possible entre deux commerces qui utilisent l'app).

## 1.2 Rôles & permissions

| Rôle | Résumé | Peut |
|---|---|---|
| **admin** | Accès total | Tout, y compris paramètres entreprise et gestion des membres |
| **gérant** | Gestion quotidienne | Ventes, stock, achats, factures, tiers, commandes, dépenses, lecture compta — pas la gestion des membres |
| **caissier** | Ventes/caisse uniquement | Créer une vente, lire les tiers/commandes/factures — **jamais** annuler une vente, jamais voir la marge, jamais accéder au stock ou à la compta |
| **comptable** | Lecture financière seule | Lit tout (ventes, stock, achats, factures, tiers, commandes, dépenses, compta, journal d'audit) — n'opère rien |
| **employé** | Opérationnel hors caisse/finance | Tiers et commandes en lecture/gestion, factures en lecture — jamais d'argent |

Deux conséquences UI directes, déjà appliquées côté backend, à respecter dans chaque écran :
- Un **caissier ne voit jamais** : la marge, le coût d'achat/CMP, le bouton d'annulation de
  vente, l'écran Stock, l'écran Comptabilité.
- Un **comptable ne voit jamais de bouton d'action** (créer, encaisser, annuler) — uniquement des
  listes et des chiffres.

## 1.3 Secteurs & modules

Une entreprise choisit un secteur à l'inscription, qui active un jeu de modules par défaut :

| Secteur | Modules optionnels activés | Vocabulaire |
|---|---|---|
| **Commerce** | Stock, Achats fournisseurs | « commande », « produit » |
| **Service** | Aucun (pas de stock) | « mission », « prestation » |
| **Mixte** | Stock, Achats fournisseurs | « commande », « produit » |

Modules cœur (toujours actifs, jamais désactivables) : Ventes/caisse, Tiers, Facturation,
Commandes/missions, Comptabilité, Fiscalité, Dépenses.

**Implication UI** : le libellé de l'onglet « Commandes » doit devenir « Missions » pour un
secteur service — c'est un vocabulaire piloté par une variable, pas deux écrans différents à
maintenir. Idem pour « produit » → « prestation » partout où le mot apparaît (fiche article,
libellés de formulaire, etc.). Un secteur service ne doit **jamais** voir apparaître l'onglet
Stock ni aucune notion de CMP/quantité en rayon.

## 1.4 Modules — description complète

### A. Authentification & onboarding
- Inscription/connexion email + mot de passe.
- À la première connexion sans entreprise : écran de création — raison sociale, secteur
  (commerce/service/mixte), nature d'activité (négoce/artisanal/service/libérale — détermine le
  seuil IGS), NIU (optionnel à la création), adhésion à un Centre de Gestion Agréé (CGA, divise
  l'IGS par deux si coché).
- Une entreprise démarre automatiquement en **plan Gratuit, essai 30 jours**.
- Un exercice comptable de l'année en cours est créé automatiquement.

### B. Tableau de bord
Objectif : répondre en un coup d'œil à « où j'en suis aujourd'hui » et remonter ce qui a besoin
d'attention. Contenu actuel (à enrichir, voir Partie 4) :
- Chiffre d'affaires cumulé de l'exercice, marge brute (réservée à `compta:read`), IGS estimé ou
  mention régime réel, ventes du jour, nombre de commandes en cours, dépenses (exercice + jour),
  alertes stock, créances (« on me doit »), dettes (« ce que je dois »), trésorerie du jour par
  mode de paiement, tendance des ventes sur 7 jours (vrai graphe, pas une décoration), meilleures
  ventes (top 5 par CA), cloche de notifications (factures en retard/à échéance proche, stock
  bas/rupture, échéance de déclaration IGS).
- Chaque carte respecte les permissions : un caissier ne voit ni marge, ni trésorerie détaillée,
  ni compta.

### C. Caisse / Ventes
Le cœur du produit, celui qui doit être le plus rapide.
- **Sélection d'articles** : recherche + grille de produits (secteur commerce) ou liste libre
  (secteur service, pas de catalogue obligatoire) ; quantité éditable par ligne ; remise ligne
  (%) et remise globale (%).
- **Client** : optionnel au comptant, **obligatoire si vente à crédit**. Peut être créé à la
  volée depuis la caisse (nom + téléphone suffisent).
- **Mode de règlement** : comptant (espèces / MTN MoMo / Orange Money / virement / chèque) ou
  **à crédit** (débite la créance client 411 au lieu de la trésorerie, exactement comme une
  facture émise). Au comptant : montant reçu saisi, rendu-monnaie calculé et affiché.
- **TVA** : appliquée automatiquement au taux unique 19,25 % si l'entreprise est assujettie ET
  au régime réel — **jamais** en IGS (interdiction réglementaire stricte, CGI Art. 142). Le
  taux n'est jamais une saisie libre, seulement 0 ou 19,25 %.
- **Sortie de stock** : pour les lignes reliées à un produit, décrémente le stock au CMP courant
  et génère l'écriture de coût des marchandises vendues. La vente n'est **jamais bloquée** par un
  stock insuffisant : elle passe quand même, le coût réel est comptabilisé sur la quantité
  vraiment vendue (pas tronqué au stock affiché), et un signal non bloquant («&nbsp;au-delà du
  stock affiché&nbsp;») s'affiche sur la ligne concernée.
- **Validation** : génère l'écriture comptable partie double automatiquement (trésorerie ou
  créance / produit / TVA / coût des marchandises), un reçu immédiat (aperçu, impression, partage
  WhatsApp — avec le contenu réel, pas juste un lien), et fonctionne hors-ligne (file de mutation
  locale, rejouée à la reconnexion, jamais de doublon même rejouée plusieurs fois).
- **Historique des ventes** : écran séparé listant les ventes récentes, avec statut (payée / à
  crédit / partiellement réglée / annulée). Une vente ne peut être annulée que par un rôle
  gérant/admin (jamais le caissier), et seulement si aucune facture n'a été émise à partir
  d'elle. L'annulation contre-passe intégralement l'écriture (jamais de suppression) et remet la
  marchandise en stock au coût de sortie d'origine.

### D. Stock
Secteur commerce/mixte uniquement.
- **Fiche produit** : nom, unité (sac, carton, bidon…), prix de vente, seuil d'alerte, stock
  actuel, **coût moyen pondéré (CMP)** recalculé après chaque entrée, marge (prix vente − CMP).
  Coût et marge sont réservés aux rôles ayant `stock:read` — **jamais** le caissier.
- **Deux niveaux d'alerte distincts** : « stock bas » (≤ seuil, encore du stock) et « rupture »
  (= 0). Ce ne sont pas la même urgence, l'UI doit les distinguer visuellement.
- **Approvisionnement** : entrée de stock au comptant ou à crédit (dette fournisseur 401,
  symétrique de la vente à crédit) ; TVA récupérable si applicable ; le CMP se recalcule
  automatiquement à chaque entrée.
- **Ajustement d'inventaire** (casse, vol, écart constaté) : corrige le stock physique sans
  passer par une vente ni un achat, avec un motif obligatoire. Génère l'écriture comptable
  correspondante (perte ou surplus), valorisée au CMP courant.
- **Valeur totale du stock** (somme CMP × quantité sur tout le catalogue) : indicateur utile à
  afficher en tête d'écran.

### E. Facturation & devis
- Deux types d'un même objet : **devis** (jamais comptabilisé) et **facture** (comptabilisée à
  l'émission : débit créance client 411, crédit produit 701/706, crédit TVA collectée si
  applicable). Un devis peut être **converti en facture** — cela crée une NOUVELLE facture liée
  au devis d'origine (jamais de mutation du devis lui-même), avec sa propre numérotation.
- **Numérotation gap-less** par exercice, strictement séquentielle, jamais modifiable a
  posteriori : `NOM_ENTREPRISE-FAC-2026-0001` (ou `-DEV-` pour un devis).
- **Contrôle Art. 150 CGI** : une facture (pas un devis) ne peut être émise sans le NIU du
  client, **mais seulement pour les entreprises assujetties TVA au régime réel** — une TPE à
  l'IGS reste libre de facturer un client anonyme.
- **Encaissement** : partiel ou total, avec le vrai mode de paiement choisi (pas une valeur
  forcée). Le statut suit une machine à états stricte : brouillon → envoyée → (partiellement
  payée →) payée, ou en_retard, ou annulée. « Payée » est un état terminal — toute correction
  passe ensuite par un **avoir**, jamais par une modification directe.
- **Avoir** : contre-passation intégrale d'une facture déjà émise (débit produit, crédit créance
  client — l'inverse exact), sans jamais toucher à la facture d'origine. Un seul avoir par
  facture. Numérotation dédiée (préfixe AVO), partage la séquence des factures.
- **Vente ↔ facture, pas de double comptage** : quand une vente déjà réglée en caisse doit
  devenir une facture-document (le client la réclame après coup), on génère une facture qui
  **réutilise l'écriture déjà passée** de la vente — jamais une deuxième écriture de chiffre
  d'affaires pour la même opération.
- **Statut « en retard »** : calculé à la volée (échéance dépassée), pas une tâche planifiée.
- **PDF conforme DGI** (émetteur + NIU, client + NIU, numéro séquentiel, HT/TVA/TTC) et partage
  WhatsApp avec le **fichier PDF réellement joint** (pas seulement un lien texte que le
  destinataire ne pourrait pas ouvrir puisqu'il faudrait être connecté à l'app).

### F. Tiers (clients & fournisseurs)
- Fiche : nom, type (client / fournisseur / les deux), téléphone, NIU, email, adresse.
- **Solde calculé, pas stocké** : « nous doit » = ventes à crédit non soldées + factures émises
  non payées (hors celles couvertes par un avoir) ; « on lui doit » = achats à crédit non
  soldés. Les deux sens peuvent coexister sur un même tiers marqué « les deux ».
- **Historique** : les 20 dernières opérations liées (ventes, achats, factures), visibles
  directement sur la fiche.
- Recherche/filtre par nom sur la liste globale.

### G. Créances & dettes
Deux vues symétriques d'un même mécanisme de crédit :
- **« On me doit »** : ventes à crédit non soldées + factures impayées, encaissement partiel ou
  total inline (montant + mode réel), badge « en retard » calculé sur l'échéance.
- **« Ce que je dois »** : achats fournisseurs à crédit non soldés, règlement partiel ou total
  inline.
- Chaque paiement génère sa propre écriture (débit/crédit trésorerie ↔ créance ou dette) et son
  propre enregistrement de paiement (traçabilité de qui a payé quoi et quand, pas d'écrasement).

### H. Dépenses
- Catégories prédéfinies mappées à un compte de charge SYSCOHADA (loyer, eau, électricité,
  téléphone, fournitures, transport, assurance, publicité, frais bancaires, salaires, charges
  sociales, impôts & taxes, autre).
- TVA récupérable si applicable (mêmes règles que le stock : jamais en IGS).
- Marqueur « récurrente » (loyer mensuel, etc.) — informatif pour l'instant, sans génération
  automatique.
- Génère l'écriture (débit charge + TVA récupérable, crédit trésorerie) à l'enregistrement.

### I. Commandes / missions
- Suivi par statuts : en attente → en cours → livrée (ou annulée, état terminal).
- Libellé adaptatif selon secteur (« commande » vs « mission »).
- Client optionnel, montant, date prévue.
- Objectif à terme (non livré) : convertir une commande livrée directement en vente ou facture.

### J. Trésorerie
- Aujourd'hui : mouvement net du jour par mode de paiement (espèces, MTN MoMo, Orange Money,
  banque/virement), calculé depuis toutes les écritures qui touchent ces comptes, quelle que
  soit leur origine (vente, dépense, encaissement de créance, règlement de dette).
- **Vision cible (le prototype Figma la montre bien)** : un solde par compte réel, suivi dans le
  temps, avec un journal chronologique des mouvements et la possibilité de saisir une entrée ou
  sortie manuelle (dépôt, retrait, virement interne). C'est un chantier plus profond que l'UI
  seule — nécessite un socle « trésorerie multi-comptes » côté données, pas encore construit.

### K. Comptabilité & états financiers
- **Écritures immuables** : toute écriture validée est verrouillée par des déclencheurs
  (impossible de la modifier ou de la supprimer en base). Toute correction passe par une
  écriture inverse.
- **Compte de résultat et bilan** dérivés en temps réel du grand-livre — pas de saisie manuelle.
- **Journal d'audit** : chaque opération sensible (vente, dépense, entrée de stock, émission/
  paiement de facture, annulation…) est journalisée, chaînée par hash (toute altération casse la
  chaîne), consultable avec un badge d'intégrité — réservé aux rôles admin et comptable.
- **Ce qui manque encore** (à ne pas promettre dans l'UI avant que ce soit réellement câblé) :
  livre-journal/grand-livre/balance comme rapports exportables, bilan aux rubriques SYSCOHADA
  normalisées, liquidation TVA déclarative périodique, clôture d'exercice avec à-nouveaux.

### L. Fiscalité
- **IGS** (régime forfaitaire) : barème à 10 classes selon le CA annuel HT, divisé par deux si
  adhérent CGA, majoré de 10 % (Centimes Additionnels Communaux). Seuil de sortie : 50 M FCFA
  (négoce/artisanal) ou 30 M FCFA (profession libérale) — au-delà, bascule au régime réel.
  Déclaration annuelle au plus tard le **15 avril**.
- **Régime réel** : TVA 19,25 % collectée/déductible, IS (25 % ou 30 % selon le CA, minimum de
  perception 2,2 %) — la liquidation TVA périodique et l'IS complet restent à construire.
- Le régime d'une entreprise n'est **jamais mis en cache** côté app : toujours relu depuis la
  base de contrôle à chaque calcul, pour qu'un changement de régime prenne effet immédiatement.

### M. Abonnements & plans
- Trois paliers : **Gratuit** (1 utilisateur, 50 factures/mois, modules cœur), **Essentiel**
  (multi-utilisateurs, factures illimitées, + Stock/Achats), **Pro** (+ rapprochement bancaire,
  factures récurrentes/relances, multi-boutiques — fonctionnalités pas encore construites
  derrière ce palier).
- Toute nouvelle entreprise démarre en essai gratuit 30 jours.
- Le quota de factures du plan Gratuit bloque l'émission (pas la création en brouillon) au-delà
  de la limite mensuelle, avec un message explicite invitant à changer de plan.
- Changement de plan : validation manuelle par l'admin de l'entreprise pour l'instant (pas de
  passerelle de paiement automatisée).

### N. Équipe
- Réservé à l'admin : inviter un membre par email, assigner un rôle, retirer un membre.

### O. Paramètres entreprise (fiscal)
- **Réservé à l'admin.** NIU, adhésion à un Centre de Gestion Agréé (CGA — divise l'IGS par
  deux, seule condition étant une attestation d'adhésion réelle), assujettissement TVA (visible
  seulement au régime réel — la TVA est interdite en IGS). Modifiable à tout moment après la
  création de l'entreprise (jusqu'ici collecté seulement à l'onboarding, jamais modifiable
  ensuite — un vrai défaut : sans cet écran, aucune entreprise adhérente CGA ne pouvait
  bénéficier de la réduction).
- **`regime_fiscal` volontairement absent de cet écran** : un changement de régime (IGS ↔ Réel)
  ne doit jamais s'appliquer rétroactivement sans un vrai parcours de confirmation dédié — pas
  un simple interrupteur à côté du NIU.
- **Hors scope pour l'instant** (pas de colonne de données correspondante) : coordonnées
  complètes (adresse, ville, téléphone, email, RCCM), logo et personnalisation visuelle des PDF
  (couleur, mentions, pied de page), profil utilisateur (nom/téléphone/mot de passe). Prévoir ces
  écrans dans la maquette (le besoin est réel et documenté), mais sans backend à brancher dessus
  pour l'instant côté Kombi.

## 1.5 Parcours utilisateurs de bout en bout

Ces scénarios doivent tous être fluides et sans détour inutile — c'est le test ultime de chaque
écran.

1. **Premier lancement** : inscription → création de l'entreprise (secteur, activité, NIU
   optionnel, CGA) → arrivée sur un tableau de bord vide avec des invitations claires à agir
   (« Enregistrez votre première vente »).
2. **Vente comptant simple** : caisse → ajouter des articles (recherche ou grille) → régler
   (mode + montant reçu) → rendu-monnaie affiché → reçu → retour caisse prêt pour la vente
   suivante. Trois taps, pas plus.
3. **Vente à crédit puis encaissement différé** : caisse → articles → sélectionner/créer le
   client → choisir « à crédit » → valider (pas de rendu-monnaie, pas de trésorerie touchée) →
   plus tard, écran Créances → trouver le client → encaisser (montant + mode réel, partiel ou
   total).
4. **Achat fournisseur à crédit puis règlement** : Stock → « + Entrée » sur un produit → à
   crédit → sélectionner/créer le fournisseur → plus tard, écran Dettes → régler.
5. **Devis → facture → encaissement → correction** : Factures → nouveau devis → lignes → client
   → (le client accepte) → convertir en facture → émettre (numéro attribué, écriture générée,
   contrôle NIU si régime réel) → encaisser (partiel ou total) → si erreur constatée après coup,
   émettre un avoir (jamais modifier la facture).
6. **Ajustement d'inventaire** : Stock → produit concerné → « Ajuster » → perte ou surplus +
   motif → stock corrigé, écriture comptable passée.
7. **Erreur de caisse** : Historique des ventes → repérer la vente → annuler (rôle gérant/admin
   uniquement) → confirmation explicite → stock et écriture contre-passés.
8. **Contrôle périodique du gérant** : tableau de bord → trésorerie du jour, créances/dettes en
   cours, alertes stock → écran Comptabilité pour vérifier bilan/résultat → écran Fiscalité pour
   suivre l'IGS estimé ou l'échéance TVA.

---

# Partie 2 — Système de design à conserver (prototype v15)

Le prototype Figma Make a posé une direction visuelle forte, cohérente avec l'identité émeraude
de Kombi mais plus premium — **à garder comme base** pour tout ce qui suit, pas à réinventer.

- **Fond** : vert forêt très sombre (proche de `#0a1408` / `#0e1c0f`), quasi noir.
- **Accent** : vert lime vif (`#b4e033`) pour les CTA principaux, les montants positifs, les
  éléments actifs.
- **Sémantique** : vert = argent qui rentre / bon état · rouge (`#f87171`) = retard / sortie
  d'argent · ambre = attention. Appliquée sans exception.
- **Cartes trésorerie « peek »** : empilement façon carte bancaire, dégradés vert → menthe par
  compte (Caisse, Orange Money, MTN MoMo chacun sa teinte), puce EMV stylisée, numéro masqué,
  pagination à points.
- **Composants à réutiliser partout** :
  - Chips de catégorie horizontales scrollables (Ventes, Stock).
  - Donut de répartition + 3 KPI alignés à droite (Stock : OK/Faible/Critique).
  - Carte de tiers/facture : avatar-initiales coloré, badge de statut, montant à droite, rangée
    de boutons d'action en bas.
  - FAB « + » flottant bas-droite pour créer (Stock, Factures) — cohérent entre écrans.
  - Feuille (bottom sheet) pour les actions secondaires : panier, encaissement, menu « autres
    modules ».
  - Barre de navigation basse à 5 entrées + une feuille « Autres modules » pour le reste — à
    préférer aux boutons « fantômes » en bas de page utilisés ailleurs.
- **Typographie** : chiffres/montants en gras blanc pur, libellés en petites majuscules grises
  espacées — hiérarchie très lisible, à ne pas casser.

---

# Partie 3 — Écarts identifiés (résumé)

| Écran | Statut | Écart principal |
|---|---|---|
| Tableau de bord | 🟡 Bon, incomplet | Aucune branche IGS/Réel visible |
| Ventes / Caisse | 🟠 Risque de régression | Pas de crédit, pas de rendu-monnaie, pas de remise, pas de reçu partageable |
| Panier / Encaissement | 🟠 | Idem + pas de sélection client |
| Stock | 🟢 Très bon | Incohérence Critique/Faible dans les compteurs |
| Factures & devis | 🟡 | Devis invisibles, pas d'avoir, pas de contrôle NIU, encaissement appauvri |
| Trésorerie | 🟢 Visuellement excellent | Suppose un socle multi-comptes pas encore construit |
| Clients & fournisseurs | 🟢 Très bon | Vérifier le pendant fournisseur symétrique |
| Comptabilité (OHADA) | 🟡 | Suppose le régime réel partout, aucune vue IGS |
| Navigation | 🟢 Bon motif | Plusieurs actions encore décoratives, aucun état vide/erreur |
| — | — | **Manquants pour couvrir tout Kombi** : Équipe, Notifications (contenu réel), Onboarding, Login, Abonnement/Plans, Ajustement stock (écran dédié), Fiche produit détaillée, Commandes/Missions, Dépenses, Journal d'audit |

---

# Partie 4 — Prompts pour Figma Make

Colle chaque prompt tel quel dans le chat. Ils sont écrits pour être compris sans relire ce
document — chacun redonne le contexte utile. Garde l'ordre suggéré : les corrections d'abord
(elles touchent des écrans déjà là), puis les nouveaux écrans.

## 4.A — Corrections sur écrans existants

### Prompt 1 — Brancher le régime fiscal sur le Tableau de bord et l'écran Comptabilité

```
Le régime fiscal d'une entreprise camerounaise est soit l'IGS (impôt forfaitaire par tranche de
chiffre d'affaires, aucune TVA, c'est le régime de la majorité des petits commerces), soit le
Régime réel (TVA 19,25 %, impôt sur les sociétés). Ce n'est jamais les deux à la fois, et ça
change complètement ce qu'on doit afficher.

Ajoute un champ regimeFiscal: 'igs' | 'reel' sur l'entreprise (mock : ajoute-le aux données de
Commerce Mballa & Fils, mets-le à 'igs' par défaut, mais prévois aussi un second jeu de données
d'exemple en 'reel' pour pouvoir prévisualiser les deux cas).

Sur le Tableau de bord, remplace la logique de la carte fiscale actuelle : si régime IGS, affiche
"IGS estimé" avec le montant annuel et la classe du barème (ex. "Classe 6") ; si régime réel,
affiche à la place "Régime réel" avec la TVA nette à reverser du mois et son échéance. Les deux
variantes doivent utiliser le même gabarit de carte que l'actuel, juste un contenu différent.

Sur l'écran Comptabilité (OHADA), fais la même bascule à l'échelle de l'écran entier : en régime
réel, garde l'état de TVA tel qu'il existe aujourd'hui (collectée/déductible/nette à
reverser/échéance) ; en régime IGS, remplace ce bloc par une carte "Impôt Général Synthétique"
montrant : le CA cumulé de l'exercice, la classe du barème actuel, le montant annuel dû, et une
mention "Déclaration au plus tard le 15 avril". Le compte de résultat et le bilan simplifié
restent affichés dans les deux régimes (ils ne dépendent pas du régime), seule la section fiscale
change.
```

### Prompt 2 — Réintégrer vente à crédit, rendu-monnaie et remise dans la Caisse

```
L'écran d'encaissement actuel (feuille "Encaissement" avec Espèces/Orange Money/MTN MoMo/
Virement) est incomplet pour un commerce camerounais réel. Complète-le sans changer son style
visuel actuel (feuille bottom sheet, fond vert sombre, CTA lime) :

1. Ajoute un sélecteur en haut de la feuille panier (avant le choix du mode de paiement) :
   "Comptant" / "À crédit", façon segmented control à deux options.
2. Si "À crédit" est sélectionné : remplace toute la section "MODE DE PAIEMENT" par un champ de
   recherche/sélection de client obligatoire (avec possibilité de créer un client à la volée -
   juste nom + téléphone) et un bouton "Confirmer la vente à crédit" (pas de saisie de montant
   reçu, aucune trésorerie n'est mouvementée dans ce cas).
3. Si "Comptant" est sélectionné et que le mode choisi est "Espèces" : ajoute un champ "Montant
   reçu" (clavier numérique) sous les 4 boutons de mode de paiement, et affiche en dessous, en
   grand, le "Rendu-monnaie" calculé en temps réel (reçu − total). Le bouton de confirmation doit
   être désactivé si le montant reçu est inférieur au total.
4. Dans la feuille "Panier", ajoute sous le total un champ "Remise globale (%)" (numérique,
   0-100) qui recalcule le total affiché en direct. Ajoute aussi un petit champ de remise (%) sur
   chaque ligne du panier, à côté du sélecteur de quantité, avec le même recalcul.
5. Après confirmation d'une vente comptant, remplace le toast de confirmation actuel (trop bref,
   il disparaît sans qu'on puisse rien faire) par un écran de reçu qui reste affiché jusqu'à
   action de l'utilisateur : récapitulatif des lignes, remise appliquée, total, mode de paiement,
   rendu-monnaie le cas échéant, et trois boutons "Imprimer", "Partager (WhatsApp)", "Nouvelle
   vente". Utilise le même style de carte que le reste de l'app pour ce récapitulatif.
```

### Prompt 3 — Corriger l'incohérence des compteurs Faible/Critique sur l'écran Stock

```
Sur l'écran Stock, le donut de répartition affiche "OK 9 / Faible 1 / Critique 2" mais dans la
liste des produits, seuls deux badges "Stock faible" apparaissent (sur Huile de palme, 3/5
unités, et Huile végétale, 2/4 unités) - aucun produit n'affiche de badge "Critique", donc le
chiffre "Critique 2" du donut est invérifiable.

Définis une règle claire à deux paliers, en dessous du seuil d'alerte défini par produit :
- "Stock faible" (badge orange) : stock > 50% du seuil d'alerte mais ≤ seuil.
- "Stock critique" (badge rouge) : stock ≤ 50% du seuil d'alerte, mais > 0.
- "Rupture" (badge rouge foncé, plus visible) : stock = 0.

Applique cette règle aux données mock existantes (recalcule quel produit tombe dans quelle
catégorie selon son stock actuel et son seuil), affiche le bon badge sur chaque carte produit
correspondante dans la liste, et fais en sorte que les compteurs du donut (OK/Faible/Critique)
correspondent exactement à ce qui est affiché sur les cartes en dessous.
```

### Prompt 4 — Enrichir l'écran Factures : devis, avoir, encaissement complet, contrôle NIU

```
L'écran "Factures" actuel ne montre que des factures (FAC-xxx), aucun devis, et l'action
"Marquer payée" ne capture ni mode de paiement ni montant partiel. Corrige :

1. Ajoute 2 devis au jeu de données mock (type "devis", préfixe DEV-xxx, statut "brouillon" ou
   "envoyé"), affichés dans la même liste avec un badge de type distinct (ex. badge gris "Devis"
   à côté du badge de statut habituel). Sur la carte d'un devis, remplace les actions "Voir
   détail / Marquer payée" par un bouton "Convertir en facture" (accent lime, action principale)
   et "Voir détail" (secondaire). Si un devis a déjà été converti, affiche un badge "Convertie"
   à la place du statut et retire le bouton de conversion.

2. Remplace l'action "Marquer payée" (qui ne demande rien) par une feuille d'encaissement : au
   tap, ouvre une bottom sheet avec le montant restant dû pré-rempli (modifiable, pour un
   paiement partiel), un sélecteur de mode de paiement (Espèces/Orange Money/MTN MoMo/Virement/
   Chèque), et un bouton "Confirmer l'encaissement". Réutilise le style de la feuille
   d'encaissement de l'écran Ventes pour rester cohérent.

3. Ajoute un bouton "Avoir" (texte rouge, discret) sur les factures au statut "Payée" ou "En
   attente" (jamais sur un devis, jamais sur une facture déjà annulée par un avoir). Au tap,
   demande confirmation ("Émettre un avoir pour FAC-xxx, 85 000 F ? Cette action est
   irréversible.") puis affiche un badge "Avoir" à la place du statut normal sur cette facture.

4. Sur le flux de création de facture (pas de devis), avant le bouton final d'émission, ajoute un
   contrôle : si le client sélectionné n'a pas de NIU renseigné, affiche un message d'avertissement
   bloquant ("Le NIU du client est requis pour émettre une facture") avec un lien pour l'ajouter
   directement au client. Ce contrôle ne doit apparaître que pour une entreprise au régime réel
   assujettie TVA (mock : suppose que Commerce Mballa & Fils l'est) - jamais pour un régime IGS.
```

### Prompt 5 — Rendre fonctionnels les boutons encore décoratifs

```
Plusieurs boutons du prototype ne déclenchent encore aucune action : la cloche de notification
dans l'en-tête, "Voir détail" sur les factures, et le bouton "+" flottant de l'écran Factures.
Corrige les trois :

1. Cloche de notification : au tap, ouvre une feuille (même style que "Autres modules") intitulée
   "Notifications" listant : les factures en retard ou à échéance dans moins de 5 jours, les
   produits en rupture ou stock bas, et s'il y a une échéance IGS dans moins de 30 jours, une
   ligne dédiée. Chaque ligne a une pastille de gravité (rouge = critique, orange = attention) et
   un texte court, cliquable vers l'écran concerné. Ajoute un badge numérique sur la cloche
   correspondant au nombre total de notifications, rouge si au moins une est critique. Si aucune
   notification, affiche "Aucune notification." centré, discret.

2. "Voir détail" sur une facture : ouvre un écran de détail plein écran (pas une feuille) avec
   l'en-tête entreprise/client, le tableau des lignes (désignation, quantité, prix unitaire,
   montant), les totaux HT/TVA/TTC, l'historique des paiements si partiellement réglée, et les
   mêmes actions que sur la carte liste (PDF, WhatsApp, Encaisser, Avoir selon le statut).

3. Bouton "+" de l'écran Factures : ouvre le flux de création de facture/devis existant
   (réutilise l'écran "Nouvelle facture" déjà présent ailleurs dans le prototype si il existe,
   sinon applique le Prompt 8 ci-dessous d'abord).
```

## 4.B — Nouveaux écrans à créer

### Prompt 6 — Écran Onboarding (création d'entreprise)

```
Crée l'écran de création d'entreprise, affiché à la toute première connexion d'un utilisateur
qui n'a encore aucune entreprise. Style cohérent avec le reste de l'app (fond vert sombre, accent
lime, cartes arrondies), mais en plein écran sans navigation basse (l'utilisateur n'a pas encore
d'entreprise à naviguer).

Étape 1 - Secteur : trois grandes cartes tactiles au choix unique, "Commerce" (icône panier),
"Service" (icône outils/prestation), "Mixte" (icône combiné) - avec une phrase d'une ligne sous
chaque nom expliquant la différence ("Vous vendez des produits en stock" / "Vous facturez des
prestations, pas de stock" / "Un peu des deux").

Étape 2 - Informations entreprise : raison sociale (texte), nature d'activité (sélecteur :
Négoce / Artisanal / Service / Profession libérale - détermine plus tard le seuil de sortie de
l'IGS), NIU (texte, optionnel, avec une note "Vous pourrez l'ajouter plus tard"), ville, case à
cocher "Je suis adhérent d'un Centre de Gestion Agréé (CGA)" avec une info-bulle expliquant que
ça réduit l'IGS de moitié.

Étape 3 - Confirmation : récapitulatif des choix, bouton "Créer mon entreprise" (accent lime,
pleine largeur). Après validation, redirige vers le Tableau de bord vide avec un message
d'accueil et une carte "Enregistrez votre première vente" pointant vers l'écran Ventes.

Utilise un indicateur de progression à 3 points en haut (étape 1/2/3), et un bouton "Retour" pour
revenir à l'étape précédente sans perdre la saisie.
```

### Prompt 7 — Écrans Connexion / Inscription

```
Crée les écrans de connexion et d'inscription, avant l'accès à l'app. Style sombre cohérent,
logo Kombi centré en haut (le même badge carré vert clair avec l'icône de calques déjà utilisé
dans l'en-tête de l'app).

Connexion : champ email, champ mot de passe, bouton "Se connecter" (lime, pleine largeur), lien
"Créer un compte" en bas, lien "Mot de passe oublié ?" discret sous le champ mot de passe.

Inscription : champ nom, email, mot de passe, confirmation du mot de passe, bouton "Créer mon
compte". Après inscription réussie, enchaîne directement sur l'écran Onboarding (Prompt 6) - une
personne qui s'inscrit n'a jamais encore d'entreprise.

Les deux écrans doivent avoir des messages d'erreur clairs et non techniques sous les champs
concernés en cas de saisie invalide (ex. "Cet email est déjà utilisé" plutôt qu'un code
d'erreur).
```

### Prompt 8 — Flux complet de création de facture/devis

```
Crée (ou complète s'il existe déjà partiellement) le flux "Nouvelle facture", accessible depuis
le bouton "+" de l'écran Factures.

Étape 1 - Type : segmented control "Devis" / "Facture" en haut de l'écran.

Étape 2 - Client : recherche/sélection d'un client existant, ou "+ Nouveau client" (nom +
téléphone minimum, ouvre une petite feuille inline sans quitter l'écran de facture).

Étape 3 - Lignes : liste de lignes ajoutables, chacune avec désignation (texte libre - une
facture n'est pas forcément liée au catalogue produit), quantité, prix unitaire, total ligne
calculé. Bouton "+ Ajouter une ligne". Total HT, TVA (si applicable selon le régime de
l'entreprise - n'affiche même pas le champ TVA si l'entreprise est en IGS), Total TTC recalculés
en direct en bas de la liste.

Étape 4 - Échéance : sélecteur de date d'échéance (optionnel pour un devis, recommandé pour une
facture).

Le document est d'abord enregistré en "Brouillon" (bouton "Enregistrer le brouillon", style
secondaire) - il ne devient une facture numérotée et comptabilisée qu'après un second bouton
explicite "Émettre" sur l'écran de détail du brouillon (voir Prompt 5, écran de détail facture).
Un devis n'a pas de bouton "Émettre" au sens comptable mais peut tout de même recevoir un numéro
DEV-xxx au même endroit ("Envoyer le devis"), sans générer d'écriture comptable dans les deux
cas.
```

### Prompt 9 — Écran de détail produit avec ajustement de stock

```
Sur l'écran Stock, chaque carte produit doit être cliquable (elle ne l'est peut-être pas encore)
et ouvrir un écran de détail plein écran :

En-tête : nom du produit, catégorie, unité.
Carte principale : stock actuel (très grand), seuil d'alerte, coût moyen pondéré (CMP), prix de
vente, marge unitaire calculée (prix vente − CMP) et marge en pourcentage - reprends le style des
grandes cartes chiffrées du Tableau de bord.
Historique des mouvements : liste chronologique (entrées en vert avec +, sorties en rouge avec −,
ajustements avec une icône dédiée), chacune avec date, quantité, motif si ajustement, prix pour
une entrée.

Deux boutons d'action en bas, côte à côte : "+ Entrée" (ouvre la même feuille
d'approvisionnement que sur la liste) et "Ajuster" (accent différent, ex. ambre) qui ouvre une
feuille dédiée :

Feuille "Ajuster le stock" : segmented control "Perte" (casse, vol, périmé) / "Surplus trouvé",
champ quantité, sélecteur de motif (Casse / Vol / Périmé / Écart d'inventaire / Autre), bouton
"Valider l'ajustement". Affiche sous le champ quantité un rappel du stock actuel et du stock
résultant après l'ajustement, recalculé en direct.
```

### Prompt 10 — Écran Dépenses

```
Crée l'écran "Dépenses", accessible depuis la feuille "Autres modules" (ajoute-la à la liste
existante, avec une icône de type facture/reçu).

En-tête : liste des dépenses avec, pour chacune, catégorie (badge coloré : Loyer, Eau,
Électricité, Téléphone/Internet, Fournitures, Transport, Assurance, Publicité, Frais bancaires,
Salaires, Charges sociales, Impôts & taxes, Autre), libellé, montant, mode de paiement, date, et
un badge "Récurrente" si applicable.

KPI en tête : total des dépenses de l'exercice, total du jour (deux petites cartes côte à côte,
même style que les KPI de l'écran Stock).

FAB "+" pour ouvrir la feuille "Nouvelle dépense" : sélecteur de catégorie (liste avec icônes),
libellé (texte libre), montant, mode de paiement, case "TVA récupérable sur cette dépense"
(uniquement visible si l'entreprise est au régime réel assujettie TVA), case "Dépense
récurrente", bouton "Enregistrer".
```

### Prompt 11 — Écran Commandes / Missions

```
Crée l'écran "Commandes" (le libellé devient "Missions" si l'entreprise est de secteur service -
prévois les deux variantes de textes, pilotées par une seule variable de secteur), accessible
depuis la feuille "Autres modules".

Onglets de statut avec compteurs, même motif que l'écran Factures : "Toutes" / "En attente" /
"En cours" / "Livrées" (ou "Terminées" en secteur service).

Carte par commande : client (optionnel, peut être vide - "Client non renseigné" en gris si
absent), libellé, montant, date prévue, badge de statut coloré (gris = en attente, bleu = en
cours, vert = livrée, rouge barré = annulée), et un bouton pour faire avancer le statut au tap
suivant dans le cycle (En attente → En cours → Livrée).

FAB "+" pour créer : libellé, client (optionnel), montant, date prévue.
```

### Prompt 12 — Écran Équipe

```
Crée l'écran "Équipe", accessible uniquement pour le rôle admin (prévois un état "Accès
restreint" si un autre rôle y accède, mais dans le prototype affiche simplement l'écran complet).
Ajoute-le à la feuille "Autres modules" avec une icône de groupe de personnes.

Liste des membres : avatar-initiales, nom, email, badge de rôle coloré (Admin / Gérant / Caissier
/ Comptable / Employé - une couleur distincte par rôle), bouton "Changer le rôle" (ouvre un
sélecteur inline) et bouton retirer (icône poubelle, avec confirmation).

FAB "+" ou bouton en en-tête "Inviter" : champ email, sélecteur de rôle avec une courte
description sous chaque option (ex. "Caissier - vend en caisse uniquement, ne voit ni la marge ni
le stock"), bouton "Envoyer l'invitation".
```

### Prompt 13 — Écran Abonnement / Plans

```
Crée l'écran "Mon abonnement", accessible depuis le menu ou les paramètres du compte (ajoute un
point d'entrée cohérent, par exemple depuis l'avatar en haut à droite de l'en-tête).

Carte en tête : plan actuel (Gratuit / Essentiel / Pro), statut (badge "Essai - 12 jours
restants" ou "Actif"), et pour le plan Gratuit uniquement, une barre de progression "32 / 50
factures ce mois".

Trois cartes de plan en dessous, empilées verticalement, chacune avec : nom, prix mensuel ("0 F"
/ "15 000 F" / "35 000 F"), liste de fonctionnalités avec coche verte, et un bouton "Plan actuel"
(désactivé, grisé) ou "Choisir ce plan" (lime) selon le plan affiché vs le plan actuel de
l'entreprise :
- Gratuit : 1 utilisateur, 50 factures/mois, ventes+compta+dépenses.
- Essentiel : utilisateurs illimités, factures illimitées, + Stock et Achats fournisseurs.
- Pro : tout Essentiel + rapprochement bancaire, factures récurrentes et relances automatiques,
  multi-boutiques.

Au tap sur "Choisir ce plan" pour un plan supérieur, affiche une feuille de confirmation simple
("Passer au plan Essentiel - 15 000 F/mois ? Un membre de l'équipe Kombi validera le changement
sous 24h.") plutôt qu'un vrai paiement (pas de passerelle de paiement automatisée pour l'instant).
```

### Prompt 14 — Écran Journal d'audit

```
Crée l'écran "Journal d'audit", accessible depuis la feuille "Autres modules" mais réservé aux
rôles admin et comptable (prévois de le masquer/griser pour les autres rôles dans le menu).

En-tête : badge d'intégrité de la chaîne ("✓ Chaîne intacte" en vert, ou "⚠ Anomalie détectée" en
rouge si jamais un maillon ne correspond plus).

Liste chronologique (plus récent en premier) : chaque entrée montre l'action (ex. "Vente
enregistrée", "Facture émise", "Dépense créée", "Stock ajusté"), l'auteur (nom + rôle), la date/
heure précise, et un résumé court du changement (ex. "18 250 F · Espèces"). Style sobre, liste
dense, pas de grosses cartes ici - c'est un écran de contrôle, pas un écran d'action.

Filtre en haut : par type d'action (menu déroulant) et par plage de dates.
```

### Prompt 15 — Écran Paramètres fiscaux (entreprise)

```
Crée l'écran "Paramètres fiscaux", réservé à l'admin (accessible depuis un menu Réglages ou
depuis l'avatar en haut à droite de l'en-tête - ajoute ce point d'entrée s'il n'existe pas déjà).
Ce n'est PAS un écran de personnalisation visuelle (pas de logo, pas de couleur) - uniquement les
réglages qui changent le calcul des impôts.

En-tête : nom de l'entreprise + badge du régime fiscal actuel ("IGS (forfaitaire, sans TVA)" ou
"Régime réel").

Formulaire :
- Champ "NIU (Numéro d'Identifiant Unique)" - texte libre.
- Case à cocher "Adhérent d'un Centre de Gestion Agréé (CGA)" avec une note en petit texte gris
  en dessous : "Réduit l'IGS de moitié - à cocher seulement si vous avez une attestation
  d'adhésion réelle, sinon votre IGS serait sous-estimé."
- Case à cocher "Assujetti à la TVA" - visible SEULEMENT si le régime actuel est "Réel" (au
  régime IGS, remplace la case par une phrase grise : "Au régime IGS, la TVA est interdite -
  ce réglage n'apparaît qu'au régime réel.").
- PAS de sélecteur pour changer le régime fiscal lui-même (IGS ↔ Réel) sur cet écran - c'est
  volontaire, un changement de régime a des conséquences rétroactives qui méritent un parcours
  de confirmation séparé, pas un simple interrupteur à côté du NIU.

Bouton "Enregistrer" en bas, avec un message de confirmation discret après sauvegarde
("Paramètres enregistrés.").
```

## 4.C — Système transverse

### Prompt 16 — États vides, de chargement et d'erreur

```
Aucun écran du prototype ne montre encore d'état vide, de chargement ou d'erreur (les données
sont toutes statiques). Définis un système cohérent à appliquer à chaque écran à données :

État de chargement : squelette (rectangles gris pulsants) reprenant la forme des cartes réelles
de l'écran, plutôt qu'un simple spinner centré - donne l'impression que le contenu arrive.

État vide : icône discrète (pas d'illustration lourde), un titre court ("Aucune vente
aujourd'hui", "Aucun client pour l'instant"), une phrase secondaire encourageante, et si
pertinent un bouton d'action vers la création ("Ajouter un client"). Applique ce patron aux
écrans Ventes (historique), Stock, Factures, Clients & Fournisseurs, Dépenses, Commandes.

État d'erreur (échec réseau ou serveur) : message clair et non technique ("Impossible de charger
vos factures pour le moment. Vérifiez votre connexion.") avec un bouton "Réessayer" - jamais de
message technique brut (pas de code d'erreur visible à l'utilisateur).

Documente ces trois états comme des variantes du même composant de carte/liste utilisé partout,
pas comme des écrans séparés à recréer à chaque fois.
```

### Prompt 17 — Indicateur hors-ligne et synchronisation

```
Le module Ventes doit fonctionner sans connexion réseau (contrainte terrain critique - les
commerces n'ont pas toujours un réseau stable). Ajoute un indicateur d'état réseau, visible sur
l'écran Ventes et le Tableau de bord :

Une petite bannière fine en haut de l'écran (sous l'en-tête, au-dessus du contenu), qui
n'apparaît QUE dans deux cas : hors-ligne ("Hors ligne · les ventes sont enregistrées et seront
envoyées au retour du réseau", fond ambre discret) ou synchronisation en cours avec des ventes en
attente ("3 ventes en attente d'envoi", fond bleu discret avec une icône de synchronisation
animée). Rien ne doit s'afficher quand tout est synchronisé et en ligne - pas de bruit visuel
permanent.
```

### Prompt 18 — Harmoniser les icônes de mode de paiement

```
La feuille "Encaissement" utilise encore des emoji bruts (💵 🟠 🟡 🏦) pour les modes de paiement,
alors que le reste de l'app (écran Trésorerie notamment) utilise des pictogrammes vectoriels
propres avec des badges de couleur circulaires. Remplace les emoji par des icônes cohérentes avec
le système déjà en place ailleurs : Espèces (icône billet), Orange Money (rond orange plein, sans
emoji), MTN MoMo (rond jaune plein), Virement (icône banque), Chèque (icône document) - ce
dernier mode manque actuellement dans le sélecteur d'encaissement alors qu'il apparaît dans le
journal de Trésorerie ; ajoute-le comme 5ème option.
```
