/**
 * Enums métier — source de vérité partagée front/back.
 * En base D1 (SQLite) ces valeurs sont stockées en TEXT avec contrainte CHECK.
 */

export const REGIME_FISCAL = ['igs', 'reel_simplifie', 'reel_normal'] as const;
export type RegimeFiscal = (typeof REGIME_FISCAL)[number];

export const SYSTEME_OHADA = ['smt', 'normal'] as const;
export type SystemeOhada = (typeof SYSTEME_OHADA)[number];

/** Nature d'activité — détermine les seuils IGS et SMT. */
export const NATURE_ACTIVITE = ['negoce', 'artisanal', 'service', 'liberale'] as const;
export type NatureActivite = (typeof NATURE_ACTIVITE)[number];

/**
 * Rôles (mémo de cadrage §4 + extension P0 #5 + D18) :
 * admin = accès total · gérant = gestion quotidienne · caissier = ventes/caisse ·
 * comptable = lecture seule des données financières (revue, sans opérer) ·
 * employé = opérationnel hors caisse/finance (commandes, tiers) ·
 * magasinier = stock uniquement (entrées, ajustements), sans accès caisse/finance.
 */
export const ROLE_MEMBRE = ['admin', 'gerant', 'caissier', 'comptable', 'employe', 'magasinier'] as const;
export type RoleMembre = (typeof ROLE_MEMBRE)[number];

export const TYPE_COMMANDE = ['commande', 'mission'] as const;
export type TypeCommande = (typeof TYPE_COMMANDE)[number];

export const STATUT_COMMANDE = ['en_attente', 'en_cours', 'livree', 'annulee'] as const;
export type StatutCommande = (typeof STATUT_COMMANDE)[number];

export const TYPE_MOUVEMENT_STOCK = ['entree', 'sortie', 'ajustement'] as const;
export type TypeMouvementStock = (typeof TYPE_MOUVEMENT_STOCK)[number];

export const MODE_PAIEMENT = [
  'especes',
  'mtn_momo',
  'orange_money',
  'virement',
  'cheque',
  'autre',
] as const;
export type ModePaiement = (typeof MODE_PAIEMENT)[number];

export const STATUT_FACTURE = [
  'brouillon',
  'envoyee',
  'payee_partiellement',
  'payee',
  'en_retard',
  'annulee',
] as const;
export type StatutFacture = (typeof STATUT_FACTURE)[number];

export const TYPE_FACTURE = ['devis', 'facture'] as const;
export type TypeFacture = (typeof TYPE_FACTURE)[number];

export const TYPE_TIERS = ['client', 'fournisseur', 'les_deux'] as const;
export type TypeTiers = (typeof TYPE_TIERS)[number];

export const SENS_ECRITURE = ['debit', 'credit'] as const;
export type SensEcriture = (typeof SENS_ECRITURE)[number];

export const SOURCE_ECRITURE = ['manuelle', 'facture', 'import_bancaire'] as const;
export type SourceEcriture = (typeof SOURCE_ECRITURE)[number];

export const SOURCE_IMPORT = ['banque', 'mtn_momo', 'orange_money'] as const;
export type SourceImport = (typeof SOURCE_IMPORT)[number];

/** Transitions de statut de facture autorisées (machine à états). */
export const TRANSITIONS_FACTURE: Record<StatutFacture, StatutFacture[]> = {
  brouillon: ['envoyee', 'annulee'],
  envoyee: ['payee_partiellement', 'payee', 'en_retard', 'annulee'],
  payee_partiellement: ['payee', 'en_retard', 'annulee'],
  en_retard: ['payee_partiellement', 'payee', 'annulee'],
  payee: [], // état terminal — correction uniquement par avoir
  annulee: [],
};
