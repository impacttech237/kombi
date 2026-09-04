/**
 * Autorisation par rôle (mémo §4 : admin / gérant / caissier).
 * admin = accès total · gérant = gestion quotidienne · caissier = ventes/caisse uniquement.
 * Pur et testable ; utilisé par un guard côté API et pour masquer l'UI.
 */

import type { RoleMembre } from './enums.js';

export const PERMISSIONS = [
  'entreprise:manage', // paramètres entreprise, modules
  'membre:manage', // inviter / retirer des utilisateurs, changer les rôles
  'vente:create',
  'vente:read',
  'vente:annuler',
  'stock:manage',
  'stock:read',
  'achat:manage',
  'achat:read',
  'facture:manage',
  'facture:read',
  'tiers:manage',
  'tiers:read',
  'commande:manage',
  'commande:read',
  'compta:read', // consulter la couche invisible (bilan, CR, IGS)
  'depense:manage',
  'depense:read',
  'audit:read', // consulter le journal d'audit immuable
  'rapport:read', // module Rapports & Analyses (mensuel/trimestriel/annuel, exports)
  'budget:read', // consulter budgets, prévisions, simulations, seuil de rentabilité
  'budget:manage', // définir/modifier les objectifs mensuels (CA cible, plafond dépenses, marge cible)
  'decision:read', // page « À décider » — synthèse quotidienne orientée dirigeant
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const TOUTES = new Set<Permission>(PERMISSIONS);

const PERMS_GERANT: readonly Permission[] = [
  'vente:create',
  'vente:read',
  'vente:annuler',
  'stock:manage',
  'stock:read',
  'achat:manage',
  'achat:read',
  'facture:manage',
  'facture:read',
  'tiers:manage',
  'tiers:read',
  'commande:manage',
  'commande:read',
  'compta:read',
  'depense:manage',
  'depense:read',
  'rapport:read',
  'budget:read',
  'budget:manage',
  'decision:read',
];

const PERMS_CAISSIER: readonly Permission[] = [
  'vente:create',
  'vente:read',
  'tiers:read',
  'tiers:manage', // créer un client à la volée pour une vente à crédit (pas d'édition/suppression : routes inexistantes)
  'commande:read',
  'commande:manage',
  'facture:read',
];

/** Lecture seule des données financières — revue sans opérer (audit, préparation de la déclaration). */
const PERMS_COMPTABLE: readonly Permission[] = [
  'vente:read',
  'stock:read',
  'achat:read',
  'facture:read',
  'tiers:read',
  'commande:read',
  'depense:read',
  'compta:read',
  'audit:read',
  'rapport:read',
  'budget:read', // lecture seule — pas budget:manage (fixer les objectifs reste au dirigeant)
];

/** Opérationnel hors caisse/finance : suivi des commandes et des tiers, pas d'argent. */
const PERMS_EMPLOYE: readonly Permission[] = [
  'tiers:read',
  'commande:read',
  'commande:manage',
  'facture:read',
];

/** Stock uniquement (D18) : entrées/ajustements, aucun accès caisse ni finance. */
const PERMS_MAGASINIER: readonly Permission[] = [
  'stock:read',
  'stock:manage',
  'tiers:read', // pour rattacher un fournisseur à une entrée de stock
];

export const PERMISSIONS_PAR_ROLE: Record<RoleMembre, ReadonlySet<Permission>> = {
  admin: TOUTES,
  gerant: new Set(PERMS_GERANT),
  caissier: new Set(PERMS_CAISSIER),
  comptable: new Set(PERMS_COMPTABLE),
  employe: new Set(PERMS_EMPLOYE),
  magasinier: new Set(PERMS_MAGASINIER),
};

/** Le rôle a-t-il la permission demandée ? */
export function peut(role: RoleMembre, permission: Permission): boolean {
  return PERMISSIONS_PAR_ROLE[role].has(permission);
}
