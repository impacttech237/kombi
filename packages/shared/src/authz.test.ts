import { describe, it, expect } from 'vitest';
import { peut, PERMISSIONS } from './authz.js';

describe('Autorisation par rôle', () => {
  it('admin a toutes les permissions', () => {
    for (const p of PERMISSIONS) expect(peut('admin', p)).toBe(true);
  });

  it('caissier peut créer une vente mais pas gérer le stock ni les membres', () => {
    expect(peut('caissier', 'vente:create')).toBe(true);
    expect(peut('caissier', 'stock:manage')).toBe(false);
    expect(peut('caissier', 'membre:manage')).toBe(false);
    expect(peut('caissier', 'entreprise:manage')).toBe(false);
  });

  it('gérant gère la gestion quotidienne mais pas les membres ni l\'entreprise', () => {
    expect(peut('gerant', 'stock:manage')).toBe(true);
    expect(peut('gerant', 'facture:manage')).toBe(true);
    expect(peut('gerant', 'compta:read')).toBe(true);
    expect(peut('gerant', 'membre:manage')).toBe(false);
    expect(peut('gerant', 'entreprise:manage')).toBe(false);
  });

  it('comptable lit les données financières mais n\'opère rien', () => {
    expect(peut('comptable', 'compta:read')).toBe(true);
    expect(peut('comptable', 'depense:read')).toBe(true);
    expect(peut('comptable', 'vente:create')).toBe(false);
    expect(peut('comptable', 'depense:manage')).toBe(false);
    expect(peut('comptable', 'stock:manage')).toBe(false);
  });

  it('employé suit les commandes et tiers, sans accès à la caisse ni aux finances', () => {
    expect(peut('employe', 'commande:manage')).toBe(true);
    expect(peut('employe', 'tiers:read')).toBe(true);
    expect(peut('employe', 'vente:create')).toBe(false);
    expect(peut('employe', 'depense:read')).toBe(false);
    expect(peut('employe', 'compta:read')).toBe(false);
  });

  it('magasinier gère le stock, sans accès caisse ni finance (D18)', () => {
    expect(peut('magasinier', 'stock:manage')).toBe(true);
    expect(peut('magasinier', 'stock:read')).toBe(true);
    expect(peut('magasinier', 'tiers:read')).toBe(true);
    expect(peut('magasinier', 'vente:create')).toBe(false);
    expect(peut('magasinier', 'depense:read')).toBe(false);
    expect(peut('magasinier', 'compta:read')).toBe(false);
    expect(peut('magasinier', 'membre:manage')).toBe(false);
  });
});
