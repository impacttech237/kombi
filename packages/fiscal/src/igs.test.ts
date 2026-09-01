import { describe, it, expect } from 'vitest';
import { calculerIGS, trancheIGS, BAREME_IGS } from './igs.js';

describe('IGS — barème officiel CGI 2026 Art. C 40', () => {
  // (CA, classe attendue, tarif de base attendu)
  const cas: [number, number, number][] = [
    [0, 1, 20_000],
    [499_999, 1, 20_000],
    [500_000, 2, 30_000],
    [999_999, 2, 30_000],
    [1_000_000, 3, 40_000],
    [1_499_999, 3, 40_000],
    [1_500_000, 4, 50_000],
    [2_000_000, 5, 60_000],
    [2_499_999, 5, 60_000],
    [2_500_000, 6, 150_000],
    [4_999_999, 6, 150_000],
    [5_000_000, 7, 300_000],
    [9_999_999, 7, 300_000],
    [10_000_000, 8, 500_000],
    [19_999_999, 8, 500_000],
    [20_000_000, 9, 1_000_000],
    [29_999_999, 9, 1_000_000],
    [30_000_000, 10, 2_000_000],
    [49_999_999, 10, 2_000_000],
  ];

  it.each(cas)('CA %i → classe %i, tarif %i', (ca, classe, tarif) => {
    const r = calculerIGS(ca);
    expect(r).not.toBeNull();
    expect(r!.classe).toBe(classe);
    expect(r!.tarifBase).toBe(tarif);
  });

  it('le barème couvre exactement 10 classes contiguës sans trou', () => {
    expect(BAREME_IGS).toHaveLength(10);
    for (let i = 1; i < BAREME_IGS.length; i++) {
      expect(BAREME_IGS[i]!.min).toBe(BAREME_IGS[i - 1]!.max);
    }
  });

  it('CA = 50 000 000 → hors IGS (relève du Réel)', () => {
    expect(calculerIGS(50_000_000)).toBeNull();
    expect(trancheIGS(50_000_000)).toBeNull();
    expect(calculerIGS(120_000_000)).toBeNull();
  });

  it('rejette un CA négatif', () => {
    expect(() => calculerIGS(-1)).toThrow();
  });
});

describe('IGS — CAC +10 % (Art. général CAC)', () => {
  it('classe 6 (150 000) → CAC 15 000, IGS annuel 165 000', () => {
    const r = calculerIGS(3_000_000)!;
    expect(r.tarifBase).toBe(150_000);
    expect(r.apresCGA).toBe(150_000);
    expect(r.cac).toBe(15_000);
    expect(r.igsAnnuel).toBe(165_000);
    expect(r.igsTrimestriel).toBe(41_250);
  });
});

describe('IGS — abattement CGA (tarif ÷ 2, Art. C 40 (2))', () => {
  it('classe 10 avec CGA : 2 000 000 → 1 000 000, +CAC = 1 100 000', () => {
    const r = calculerIGS(40_000_000, { adherentCGA: true })!;
    expect(r.tarifBase).toBe(2_000_000);
    expect(r.apresCGA).toBe(1_000_000);
    expect(r.cac).toBe(100_000);
    expect(r.igsAnnuel).toBe(1_100_000);
  });

  it('sans CGA le tarif est plein', () => {
    const r = calculerIGS(40_000_000, { adherentCGA: false })!;
    expect(r.apresCGA).toBe(2_000_000);
    expect(r.igsAnnuel).toBe(2_200_000);
  });
});
