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
  'facture:manage',
  'facture:read',
  'tiers:manage',
  'tiers:read',
  'commande:manage',
  'commande:read',
  'compta:read', // consulter la couche invisible (bilan, CR, IGS)
  'depense:manage',
  'depense:read',
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
  'facture:manage',
  'facture:read',
  'tiers:manage',
  'tiers:read',
  'commande:manage',
  'commande:read',
  'compta:read',
  'depense:manage',
  'depense:read',
];

const PERMS_CAISSIER: readonly Permission[] = [
  'vente:create',
  'vente:read',
  'tiers:read',
  'commande:read',
  'commande:manage',
  'facture:read',
];

export const PERMISSIONS_PAR_ROLE: Record<RoleMembre, ReadonlySet<Permission>> = {
  admin: TOUTES,
  gerant: new Set(PERMS_GERANT),
  caissier: new Set(PERMS_CAISSIER),
};

/** Le rôle a-t-il la permission demandée ? */
export function peut(role: RoleMembre, permission: Permission): boolean {
  return PERMISSIONS_PAR_ROLE[role].has(permission);
}
