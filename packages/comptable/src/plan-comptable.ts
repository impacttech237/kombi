/**
 * Plan comptable OHADA — sous-ensemble par défaut créé à l'ouverture d'une entreprise.
 * Source : docs/reference/05-plan-comptable-ohada.md (comptes vérifiés dans le texte officiel).
 * Élargir progressivement ; toute ajout doit référencer le plan SYSCOHADA.
 */

export type TypeCompte = 'actif' | 'passif' | 'charge' | 'produit';

export interface CompteDefaut {
  readonly numero: string;
  readonly libelle: string;
  readonly classe: number;
  readonly type: TypeCompte;
}

export const PLAN_COMPTABLE_DEFAUT: readonly CompteDefaut[] = [
  // Classe 3 — Stocks (module stock, inventaire permanent)
  { numero: '311', libelle: 'Marchandises', classe: 3, type: 'actif' },
  // Classe 4 — Tiers
  { numero: '401', libelle: 'Fournisseurs, dettes en compte', classe: 4, type: 'passif' },
  { numero: '411', libelle: 'Clients', classe: 4, type: 'actif' },
  { numero: '4431', libelle: 'État, TVA facturée sur ventes', classe: 4, type: 'passif' },
  { numero: '4432', libelle: 'État, TVA facturée sur prestations de services', classe: 4, type: 'passif' },
  { numero: '4452', libelle: 'État, TVA récupérable sur achats', classe: 4, type: 'actif' },
  // Classe 5 — Trésorerie
  { numero: '521', libelle: 'Banques locales', classe: 5, type: 'actif' },
  { numero: '531', libelle: 'Chèques postaux', classe: 5, type: 'actif' },
  { numero: '552', libelle: 'Mobile Money MTN MoMo', classe: 5, type: 'actif' }, // choix modélisation
  { numero: '553', libelle: 'Mobile Money Orange Money', classe: 5, type: 'actif' }, // choix modélisation
  { numero: '571', libelle: 'Caisse', classe: 5, type: 'actif' },
  { numero: '585', libelle: 'Virements de fonds (transit)', classe: 5, type: 'actif' },
  // Classe 6 — Charges (dépenses)
  { numero: '601', libelle: 'Achats de marchandises', classe: 6, type: 'charge' },
  { numero: '602', libelle: 'Achats de matières premières et fournitures liées', classe: 6, type: 'charge' },
  { numero: '605', libelle: 'Autres achats', classe: 6, type: 'charge' },
  { numero: '6031', libelle: 'Variations des stocks de marchandises', classe: 6, type: 'charge' },
  { numero: '622', libelle: 'Locations et charges locatives', classe: 6, type: 'charge' },
  { numero: '627', libelle: 'Publicité, publications, relations publiques', classe: 6, type: 'charge' },
  // Classe 7 — Produits (recettes)
  { numero: '701', libelle: 'Ventes de marchandises', classe: 7, type: 'produit' },
  { numero: '702', libelle: 'Ventes de produits finis', classe: 7, type: 'produit' },
  { numero: '706', libelle: 'Services vendus', classe: 7, type: 'produit' },
  { numero: '707', libelle: 'Produits accessoires', classe: 7, type: 'produit' },
] as const;

/** Compte de trésorerie associé à un mode de paiement. */
export const COMPTE_TRESORERIE_PAR_MODE: Record<string, string> = {
  especes: '571',
  virement: '521',
  cheque: '521',
  mtn_momo: '552',
  orange_money: '553',
  autre: '571',
};
