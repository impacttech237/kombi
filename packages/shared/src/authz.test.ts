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
});
