import { describe, it, expect } from 'vitest';
import { tvaDepuisHT, tvaDepuisTTC, TAUX_TVA_EFFECTIF } from './tva.js';

describe('TVA — taux effectif 19,25 % (CGI Art. 142)', () => {
  it('HT 10 000 → TVA 1 925, TTC 11 925', () => {
    const r = tvaDepuisHT(10_000);
    expect(r.tva).toBe(1_925);
    expect(r.montantTTC).toBe(11_925);
    expect(r.taux).toBe(TAUX_TVA_EFFECTIF);
  });

  it('taux zéro (export) : TTC = HT', () => {
    const r = tvaDepuisHT(10_000, 0);
    expect(r.tva).toBe(0);
    expect(r.montantTTC).toBe(10_000);
  });

  it('reconstitution depuis TTC 11 925 → HT 10 000', () => {
    const r = tvaDepuisTTC(11_925);
    expect(r.montantHT).toBe(10_000);
    expect(r.tva).toBe(1_925);
  });
});
