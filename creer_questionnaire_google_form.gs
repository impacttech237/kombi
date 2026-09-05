/**
 * Crée automatiquement, dans VOTRE Google Drive, le Google Form correspondant à
 * questionnaire.md (dirigeants de PME — étude de besoins Kombi).
 *
 * COMMENT L'UTILISER (aucune configuration Google Cloud / OAuth nécessaire — Apps Script
 * s'exécute directement sous votre propre compte Google) :
 *   1. Allez sur https://script.google.com → « Nouveau projet ».
 *   2. Effacez le contenu par défaut (myFunction vide) et collez TOUT ce fichier à la place.
 *   3. En haut, dans le menu déroulant des fonctions, choisissez `creerQuestionnaireKombi`
 *      puis cliquez sur ▶ Exécuter.
 *   4. La première fois, Google demande une autorisation (« Cette app n'est pas vérifiée » —
 *      c'est normal, c'est VOTRE script sur VOTRE compte : cliquez sur « Paramètres avancés »
 *      puis « Accéder à [nom du projet] (non sécurisé) »).
 *   5. Une fois l'exécution terminée, ouvrez l'onglet « Journaux d'exécution » (View → Logs,
 *      ou Ctrl+Enter) : les deux liens du formulaire (édition + à partager) y sont affichés.
 *   6. Le formulaire est créé directement dans votre Drive, prêt à être personnalisé ou
 *      partagé tel quel.
 *
 * Relancer la fonction crée un NOUVEAU formulaire à chaque fois (elle n'écrase jamais un
 * formulaire existant) — supprimez les essais depuis votre Drive si besoin.
 */

function creerQuestionnaireKombi() {
  var form = FormApp.create('Kombi — Comprendre les dirigeants de PME');

  form.setDescription(
    'Bonjour, merci de prendre quelques minutes. Nous préparons un outil simple pour aider ' +
    'les patrons de petites entreprises comme la vôtre à gérer le quotidien — les ventes, ' +
    'le stock, les clients qui vous doivent de l\'argent, l\'équipe — sans prise de tête. ' +
    'La comptabilité et les impôts, eux, se mettent à jour tout seuls derrière, à partir de ' +
    'ce que vous faites déjà. Nous voulons construire ça à partir de vos besoins réels, pas ' +
    'de ce qu\'on imagine.\n\n' +
    'Il n\'y a pas de bonne ou de mauvaise réponse. Répondez comme vous le vivez vraiment.\n\n' +
    'Ça prend environ 12 à 15 minutes. Vos réponses restent confidentielles et ne seront ' +
    'utilisées que pour améliorer l\'outil.\n\n' +
    'Vous pouvez laisser une question sans réponse si elle ne vous convient pas — aucune ' +
    'question de ce formulaire n\'est obligatoire.'
  );
  form.setProgressBar(true);
  form.setCollectEmail(false);
  form.setConfirmationMessage(
    'Merci beaucoup pour votre temps. Vos réponses vont directement servir à construire un ' +
    'outil qui correspond à votre réalité, pas à une idée qu\'on s\'en fait.'
  );

  // ── Section A — Votre entreprise, en bref ──────────────────────────────────────────────
  page(form, 'A — Votre entreprise, en bref');

  mc(form, 'Quel est le secteur principal de votre activité ?', [
    'Commerce / vente de marchandises (boutique, dépôt, quincaillerie...)',
    'Service (salon de coiffure, atelier, conseil, agence...)',
    'Restauration / alimentation',
    'Artisanat / production',
    'Transport',
  ], true);

  mc(form, 'Depuis combien de temps votre entreprise existe-t-elle ?', [
    'Moins d\'1 an', '1 à 3 ans', '3 à 10 ans', 'Plus de 10 ans',
  ], false);

  mc(form, 'En comptant vous-même, combien de personnes travaillent dans l\'entreprise ?', [
    'Seul(e)', '2 à 5 personnes', '6 à 15 personnes', 'Plus de 15 personnes',
  ], false);

  mc(form, 'Votre entreprise est-elle officiellement enregistrée (immatriculée, NIU/numéro fiscal) ?', [
    'Oui, complètement en règle',
    'En cours de régularisation',
    'Pas encore, je fonctionne de manière informelle',
    'Je préfère ne pas répondre',
  ], false);

  // ── Section B — Comment vous gérez votre activité aujourd'hui ─────────────────────────
  page(form, 'B — Comment vous gérez votre activité aujourd\'hui');

  cb(form, 'Comment suivez-vous vos ventes, votre stock et vos dépenses aujourd\'hui ? (plusieurs réponses possibles)', [
    'Cahier ou carnet papier',
    'Excel ou tableur sur ordinateur/téléphone',
    'Une application de gestion',
    'Je note dans ma tête / je ne note pas',
    'Quelqu\'un d\'autre s\'en occupe pour moi (comptable, employé...)',
  ], false);
  text(form, 'Si vous avez coché « une application de gestion », laquelle ?', false);

  cb(form, 'Parmi ces tâches de gestion, lesquelles vous prennent le plus de temps ou vous demandent le plus d\'efforts ? (2 réponses maximum)', [
    'Suivre les ventes et encaisser',
    'Suivre le stock (savoir ce qu\'il reste, quand recommander)',
    'Suivre les clients qui doivent de l\'argent (relances)',
    'Suivre ce que je dois à mes fournisseurs',
    'Faire des factures ou des devis',
    'Gérer l\'équipe (qui a fait quoi, accès aux caisses/comptes)',
    'Suivre les commandes ou prestations en cours',
    'La comptabilité et les déclarations fiscales',
    'Aucune de ces tâches ne me pose de difficulté particulière',
  ], false).setValidation(
    FormApp.createCheckboxValidation().requireSelectAtMost(2).build()
  );

  mc(form, 'À quelle fréquence mettez-vous vos ventes et votre stock à jour ?', [
    'Tous les jours', 'Une fois par semaine', 'Une fois par mois',
    'Rarement, seulement quand j\'en ai besoin (impôts, banque...)', 'Jamais vraiment',
  ], false);

  mc(form, 'Combien de temps passez-vous, vous ou quelqu\'un dans votre équipe, chaque semaine sur la gestion (ventes, stock, comptes, factures) ?', [
    'Moins d\'1 heure', '1 à 3 heures', '4 à 8 heures', 'Plus d\'une journée complète',
  ], false);

  paragraph(form, 'Racontez-nous une situation récente où le suivi de vos ventes, de votre stock ou de votre argent vous a posé problème.', false);

  // ── Section C — Vos difficultés au quotidien ───────────────────────────────────────────
  page(form, 'C — Vos difficultés au quotidien');

  paragraph(form, 'Si vous deviez citer UN SEUL problème de gestion qui vous fait perdre le plus de temps ou d\'argent, ce serait lequel ?', false);

  cb(form, 'Parmi ces situations, lesquelles vous arrivent régulièrement ? (plusieurs réponses possibles)', [
    'Je ne sais pas exactement combien j\'ai en caisse à un instant donné',
    'Je découvre une rupture de stock trop tard',
    'J\'ai du mal à savoir qui me doit de l\'argent (clients) et combien',
    'J\'ai du mal à savoir ce que je dois à mes fournisseurs',
    'Je perds ou j\'égare des factures / reçus / justificatifs',
    'Je ne sais pas si mon activité est vraiment rentable',
    'Je fais des erreurs de calcul (prix, monnaie à rendre, totaux)',
    'J\'ai du mal à contrôler ce que fait chaque employé (vente, caisse, stock)',
    'Je perds le fil des commandes ou prestations en cours pour mes clients',
    'J\'ai du mal à savoir quels produits se vendent le mieux',
    'Aucune de ces situations',
  ], false);

  mc(form, 'Avez-vous déjà eu un problème avec les impôts ou une déclaration (retard, erreur, pénalité, contrôle) ?', [
    'Oui, plusieurs fois', 'Oui, une fois', 'Non, jamais',
    'Je ne sais pas / je ne m\'en occupe pas moi-même',
  ], false);

  scale(form, 'Sur une échelle de 1 à 5, à quel point la gestion administrative de votre entreprise vous stresse-t-elle ?', 'Pas du tout', 'Énormément');

  paragraph(form, 'Qu\'avez-vous déjà essayé pour résoudre ce genre de problème (une autre application, embaucher quelqu\'un, un cahier différent...) ? Pourquoi ça n\'a pas suffi ?', false);

  // ── Section D — Votre rapport à la comptabilité et aux impôts ─────────────────────────
  page(form, 'D — Votre rapport à la comptabilité et aux impôts')
    .setHelpText('Cette section reste confidentielle. Vous pouvez passer une question sans répondre.');

  mc(form, 'Qui s\'occupe de vos déclarations d\'impôts et de votre comptabilité aujourd\'hui ?', [
    'Moi-même', 'Un comptable ou cabinet que je paie',
    'Un proche ou employé, sans formation comptable',
    'Personne ne s\'en occupe vraiment', 'Je ne sais pas',
  ], false);

  mc(form, 'Si vous payez quelqu\'un pour ça, combien environ dépensez-vous par mois ?', [
    'Je ne paie personne', 'Moins de 20 000 FCFA', '20 000 à 50 000 FCFA',
    '50 000 à 150 000 FCFA', 'Plus de 150 000 FCFA', 'Je préfère ne pas répondre',
  ], false);

  mc(form, 'Comprenez-vous facilement ce que représentent vos obligations fiscales (ce que vous devez déclarer et payer, et quand) ?', [
    'Oui, c\'est clair pour moi',
    'Plus ou moins, mais ça reste flou par moments',
    'Non, c\'est difficile à comprendre',
    'Je délègue complètement, je ne cherche pas à comprendre',
  ], false);

  // ── Section E — Votre téléphone et vos habitudes numériques ───────────────────────────
  page(form, 'E — Votre téléphone et vos habitudes numériques');

  mc(form, 'Quel type de téléphone utilisez-vous le plus pour votre activité ?', [
    'Smartphone (Android)', 'iPhone', 'Téléphone simple (sans internet)',
    'Je n\'utilise pas de téléphone pour l\'activité',
  ], false);

  mc(form, 'Avez-vous un accès internet régulier là où vous travaillez ?', [
    'Oui, toujours', 'Souvent, mais avec des coupures', 'Rarement', 'Jamais',
  ], false);

  cb(form, 'Utilisez-vous déjà l\'une de ces solutions pour votre activité ? (plusieurs réponses possibles)', [
    'Mobile Money (MTN MoMo, Orange Money...)',
    'WhatsApp Business',
    'Une application bancaire',
    'Une application de gestion ou de comptabilité',
    'Aucune de ces solutions',
  ], false);

  mc(form, 'De manière générale, êtes-vous à l\'aise pour utiliser une nouvelle application sur votre téléphone ?', [
    'Très à l\'aise, j\'apprends vite',
    'À l\'aise si c\'est simple et bien expliqué',
    'Peu à l\'aise, j\'ai besoin d\'aide',
    'Pas à l\'aise du tout',
  ], false);

  // ── Section F — Ce qui compterait le plus pour vous ───────────────────────────────────
  page(form, 'F — Ce qui compterait le plus pour vous');

  mc(form, 'Laquelle de ces deux phrases décrit le mieux ce que vous voudriez d\'un outil pour votre entreprise ?', [
    'Un outil qui m\'aide à noter mes ventes, mon stock, mes dépenses',
    'Un outil qui me dit où en est mon business et m\'aide à décider',
    'Les deux à égalité, je ne saurais pas choisir',
  ], false);

  grid(
    form,
    'Voici des fonctions de GESTION AU QUOTIDIEN possibles. Pour chacune, dites si elle vous serait utile.',
    [
      'Encaisser une vente rapidement (avec reçu)',
      'Savoir en un coup d\'œil combien j\'ai en caisse, sur mon Mobile Money, en banque',
      'Suivre mon stock et être alerté avant la rupture',
      'Créer des factures et devis professionnels',
      'Savoir qui me doit de l\'argent et relancer facilement',
      'Savoir ce que je dois à mes fournisseurs',
      'Suivre les commandes ou prestations en cours pour chaque client',
      'Voir mes produits ou services qui se vendent le mieux',
      'Garder une photo de mes reçus, factures et justificatifs',
      'Donner un accès limité à un employé (il voit/fait seulement ce qu\'il faut)',
      'Gérer plusieurs boutiques/points de vente depuis un seul endroit',
      'Fonctionner même sans connexion internet',
    ],
    ['Indispensable', 'Utile', 'Pas nécessaire']
  );

  paragraph(form, 'Parmi toutes ces fonctions de gestion, laquelle vous ferait dire « ça, ça change ma vie » ?', false);

  grid(
    form,
    'Voici en plus des fonctions plus liées à la COMPTABILITÉ ET AUX IMPÔTS. Même question.',
    [
      'Voir si mon activité gagne ou perd de l\'argent, sans calcul à faire',
      'Être aidé pour mes déclarations et obligations fiscales',
      'Avoir des documents comptables prêts en cas de contrôle ou de demande de prêt',
    ],
    ['Indispensable', 'Utile', 'Pas nécessaire']
  );

  // ── Section G — Le prix et la décision ────────────────────────────────────────────────
  page(form, 'G — Le prix et la décision');

  mc(form, 'Voici 3 formules possibles. Laquelle correspond le mieux à ce que vous seriez prêt à utiliser ?', [
    'Gratuite — les fonctions de base pour démarrer, sans toutes les options',
    '10 000 FCFA/mois — l\'essentiel pour gérer sereinement (ventes, stock, clients, trésorerie...)',
    '20 000 FCFA/mois — toutes les fonctions, y compris comptabilité et fiscalité automatisées',
    'Aucune de ces formules ne me conviendrait, même la gratuite',
  ], false);

  mc(form, 'Qu\'est-ce qui vous ferait le plus hésiter à essayer un tel outil ? (la réponse la plus importante pour vous)', [
    'Le prix',
    'La peur que ce soit compliqué à apprendre',
    'La peur de perdre mes données ou qu\'on les utilise mal',
    'Le manque de temps pour m\'y mettre',
    'Le manque de connexion internet fiable',
    'Je préfère mes habitudes actuelles (cahier, Excel...)',
    'Rien ne m\'arrêterait si l\'outil est bon',
  ], false).showOtherOption(true);

  mc(form, 'Qu\'est-ce qui vous donnerait le plus confiance pour essayer un nouvel outil de gestion ?', [
    'La recommandation d\'un autre patron que je connais',
    'Un essai gratuit sans engagement',
    'Un accompagnement/une formation pour démarrer',
    'Voir que d\'autres entreprises comme la mienne l\'utilisent déjà',
  ], false).showOtherOption(true);

  // ── Section H — La parole est à vous ──────────────────────────────────────────────────
  page(form, 'H — La parole est à vous')
    .setHelpText(
      'Cette dernière partie n\'a pas de question précise. C\'est votre moment. Dites tout ce ' +
      'qui vous passe par la tête sur la gestion de votre entreprise — vos rêves, vos ' +
      'frustrations, vos idées, même si ça vous semble bizarre ou trop ambitieux. Il n\'y a ' +
      'pas de mauvaise réponse ici, lâchez-vous complètement.'
    );

  paragraph(form, 'Si vous pouviez demander une seule chose à celui qui construit cet outil, ce serait quoi ?', false);

  paragraph(
    form,
    'Carte blanche. Qu\'est-ce que vous aimeriez vraiment ? Qu\'est-ce qui vous énerve dans la ' +
    'gestion de votre entreprise et qu\'on ne vous demande jamais ? Décrivez l\'outil parfait, ' +
    'comme si tout était possible.',
    false
  );

  // ── Section I — Pour finir ─────────────────────────────────────────────────────────────
  page(form, 'I — Pour finir');

  var contact = mc(form, 'Accepteriez-vous d\'être recontacté(e) pour tester l\'outil avant tout le monde ?', [
    'Oui, par téléphone/WhatsApp',
    'Oui, par email',
    'Non merci',
  ], false);
  text(form, 'Si oui par téléphone/WhatsApp : votre numéro', false);
  text(form, 'Si oui par email : votre adresse', false);

  Logger.log('Formulaire créé.');
  Logger.log('Lien à PARTAGER avec les répondants : ' + form.getPublishedUrl());
  Logger.log('Lien pour VOUS (édition, voir les réponses) : ' + form.getEditUrl());
}

// ── Petits raccourcis pour garder la fonction principale lisible ─────────────────────────

/** Nouvelle section (saut de page) avec titre. */
function page(form, titre) {
  return form.addPageBreakItem().setTitle(titre);
}

/** Choix unique (bouton radio). */
function mc(form, titre, choix, requis) {
  return form.addMultipleChoiceItem().setTitle(titre).setChoiceValues(choix).setRequired(!!requis);
}

/** Choix multiple (cases à cocher). */
function cb(form, titre, choix, requis) {
  return form.addCheckboxItem().setTitle(titre).setChoiceValues(choix).setRequired(!!requis);
}

/** Réponse courte (une ligne). */
function text(form, titre, requis) {
  return form.addTextItem().setTitle(titre).setRequired(!!requis);
}

/** Réponse longue (plusieurs lignes). */
function paragraph(form, titre, requis) {
  return form.addParagraphTextItem().setTitle(titre).setRequired(!!requis);
}

/** Échelle numérique (ex. 1 à 5). */
function scale(form, titre, labelBas, labelHaut) {
  return form.addScaleItem().setTitle(titre).setBounds(1, 5).setLabels(labelBas, labelHaut);
}

/** Grille à choix unique par ligne (tableau de fonctions x niveaux d'utilité). */
function grid(form, titre, lignes, colonnes) {
  return form.addGridItem().setTitle(titre).setRows(lignes).setColumns(colonnes);
}
