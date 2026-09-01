import { describe, it, expect } from 'vitest';
import { cmpApresEntree, sortieStock } from './cmp.js';

describe('CMP — inventaire permanent (Guide SYSCOHADA §1.1.4.1)', () => {
  it('recalcule le CMP après chaque entrée', () => {
    // 10 unités à 1000, puis 10 à 1400 → CMP = (10000+14000)/20 = 1200
    let s = { quantite: 10, cmp: 1000 };
    s = cmpApresEntree(s, 10, 1400);
    expect(s.quantite).toBe(20);
    expect(s.cmp).toBe(1200);
  });

  it('la sortie ne change pas le CMP et valorise le CMV au CMP', () => {
    const { etat, cmv } = sortieStock({ quantite: 20, cmp: 1200 }, 5);
    expect(etat.quantite).toBe(15);
    expect(etat.cmp).toBe(1200);
    expect(cmv).toBe(6000); // 5 × 1200
  });

  it('refuse une sortie supérieure au stock', () => {
    expect(() => sortieStock({ quantite: 3, cmp: 1000 }, 5)).toThrow('Stock insuffisant');
  });

  it('première entrée sur stock vide fixe le CMP', () => {
    const s = cmpApresEntree({ quantite: 0, cmp: 0 }, 8, 2500);
    expect(s).toEqual({ quantite: 8, cmp: 2500 });
  });
});
