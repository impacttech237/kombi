import { describe, it, expect } from 'vitest';
import { genererRecette, genererDepense, estEquilibree } from './ecriture.js';

describe('Génération d\'écritures — partie double', () => {
  it('recette espèces sans TVA : débit 571 / crédit 701', () => {
    const e = genererRecette({
      montantHT: 10_000,
      modePaiement: 'especes',
      compteProduit: '701',
      libelle: 'Vente marchandise',
    });
    expect(e.lignes).toEqual([
      { compteNumero: '571', sens: 'debit', montant: 10_000 },
      { compteNumero: '701', sens: 'credit', montant: 10_000 },
    ]);
    expect(estEquilibree(e)).toBe(true);
  });

  it('recette MTN MoMo : débit 5522 (sous-compte du 552 Téléphone portable, validation ONECCA)', () => {
    const e = genererRecette({
      montantHT: 5_000,
      modePaiement: 'mtn_momo',
      compteProduit: '706',
      libelle: 'Service',
    });
    expect(e.lignes[0]!.compteNumero).toBe('5522');
    expect(estEquilibree(e)).toBe(true);
  });

  it('recette avec TVA 19,25% : 571 débit 11 925, 701 crédit 10 000, 4431 crédit 1 925', () => {
    const e = genererRecette({
      montantHT: 10_000,
      tva: 1_925,
      modePaiement: 'especes',
      compteProduit: '701',
      libelle: 'Vente TTC',
    });
    expect(e.lignes).toContainEqual({ compteNumero: '571', sens: 'debit', montant: 11_925 });
    expect(e.lignes).toContainEqual({ compteNumero: '4431', sens: 'credit', montant: 1_925 });
    expect(estEquilibree(e)).toBe(true);
  });

  it('dépense virement : débit 601 / crédit 521', () => {
    const e = genererDepense({
      montantHT: 5_000,
      modePaiement: 'virement',
      compteCharge: '601',
      libelle: 'Achat marchandise',
    });
    expect(e.lignes).toContainEqual({ compteNumero: '601', sens: 'debit', montant: 5_000 });
    expect(e.lignes).toContainEqual({ compteNumero: '521', sens: 'credit', montant: 5_000 });
    expect(estEquilibree(e)).toBe(true);
  });
});
