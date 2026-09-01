import { describe, it, expect } from 'vitest';
import { determinerRegime, determinerSystemeOhada, projeterFranchissement } from './regime.js';

describe('Régime fiscal — seuils IGS/Réel (CGI Art. 93 quater)', () => {
  it('commerçant CA 40M → IGS', () => {
    expect(determinerRegime({ caAnnuelHT: 40_000_000, natureActivite: 'negoce' })).toBe('igs');
  });

  it('commerçant CA 50M → Réel', () => {
    expect(determinerRegime({ caAnnuelHT: 50_000_000, natureActivite: 'negoce' })).toBe(
      'reel_normal',
    );
  });

  it('profession libérale : seuil abaissé à 30M', () => {
    expect(determinerRegime({ caAnnuelHT: 29_000_000, natureActivite: 'liberale' })).toBe('igs');
    expect(determinerRegime({ caAnnuelHT: 30_000_000, natureActivite: 'liberale' })).toBe(
      'reel_normal',
    );
  });

  it('secteur spécial (microfinance) → toujours Réel même à faible CA', () => {
    expect(
      determinerRegime({
        caAnnuelHT: 1_000_000,
        natureActivite: 'service',
        secteurSpecial: 'microfinance',
      }),
    ).toBe('reel_normal');
  });
});

describe('Règle de maintien 2 ans (CGI Art. 93 quinquies)', () => {
  it('CA repassé sous le seuil, 1 an seulement → maintenu au Réel', () => {
    expect(
      determinerRegime({
        caAnnuelHT: 40_000_000,
        natureActivite: 'negoce',
        regimePrecedent: 'reel_normal',
        ansSousSeuil: 1,
      }),
    ).toBe('reel_normal');
  });

  it('CA sous le seuil depuis 2 ans → bascule vers IGS', () => {
    expect(
      determinerRegime({
        caAnnuelHT: 40_000_000,
        natureActivite: 'negoce',
        regimePrecedent: 'reel_normal',
        ansSousSeuil: 2,
      }),
    ).toBe('igs');
  });
});

describe('Système OHADA — SMT/Normal (Acte uniforme Art. 13)', () => {
  it('négoce : seuil SMT 60M', () => {
    expect(determinerSystemeOhada({ caAnnuelHT: 59_000_000, natureActivite: 'negoce' })).toBe(
      'smt',
    );
    expect(determinerSystemeOhada({ caAnnuelHT: 60_000_000, natureActivite: 'negoce' })).toBe(
      'normal',
    );
  });

  it('services : seuil SMT 30M', () => {
    expect(determinerSystemeOhada({ caAnnuelHT: 29_000_000, natureActivite: 'service' })).toBe(
      'smt',
    );
    expect(determinerSystemeOhada({ caAnnuelHT: 30_000_000, natureActivite: 'service' })).toBe(
      'normal',
    );
  });

  it("option volontaire pour le Système Normal l'emporte", () => {
    expect(
      determinerSystemeOhada({ caAnnuelHT: 1_000_000, natureActivite: 'negoce', optionNormal: true }),
    ).toBe('normal');
  });
});

describe('Projection de franchissement (cahier des charges §4.1)', () => {
  it('CA 25M à mi-année (6 mois) → projeté 50M → franchit le seuil Réel', () => {
    const a = projeterFranchissement(25_000_000, 6, 'negoce', 9);
    expect(a.caProjete).toBe(50_000_000);
    expect(a.franchitSeuilReel).toBe(true);
  });

  it('CA modéré ne franchissant pas le seuil', () => {
    const a = projeterFranchissement(5_000_000, 6, 'negoce', 7);
    expect(a.caProjete).toBe(10_000_000);
    expect(a.franchitSeuilReel).toBe(false);
  });
});
