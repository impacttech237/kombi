import { describe, it, expect } from 'vitest';
import { buildSelect, buildInsert } from './scoped.js';

describe('Couture de sharding — construction SQL', () => {
  it('SELECT injecte toujours le filtre entreprise_id en premier', () => {
    const q = buildSelect('e1', 'vente');
    expect(q.sql).toBe('SELECT * FROM vente WHERE entreprise_id = ?');
    expect(q.binds).toEqual(['e1']);
  });

  it('SELECT avec clause supplémentaire garde le filtre tenant', () => {
    const q = buildSelect('e1', 'facture', { extraWhere: 'statut = ?', extraBinds: ['payee'], limit: 10 });
    expect(q.sql).toBe('SELECT * FROM facture WHERE entreprise_id = ? AND (statut = ?) LIMIT 10');
    expect(q.binds).toEqual(['e1', 'payee']);
  });

  it('INSERT force entreprise_id même si absent des valeurs', () => {
    const q = buildInsert('e1', 'tiers', { id: 't1', nom: 'ACME', type: 'client' });
    expect(q.sql).toContain('entreprise_id');
    expect(q.binds).toContain('e1');
  });

  it('rejette une table hors whitelist (anti-injection)', () => {
    expect(() => buildSelect('e1', 'utilisateur')).toThrow();
    expect(() => buildSelect('e1', 'vente; DROP TABLE')).toThrow();
  });

  it('rejette un nom de colonne invalide', () => {
    expect(() => buildSelect('e1', 'vente', { colonnes: ['id', 'x; DROP'] })).toThrow();
  });
});
