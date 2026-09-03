import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Comptes Mobile Money corrigés (validation ONECCA §1 : 5521/5522, pas 552/553)', () => {
  it('une vente MTN MoMo poste sur 5522, une vente Orange Money sur 5521', async () => {
    const e = doE('momo-1');
    await e.initialiser('momo-1', 'commerce', 2026);
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 10000 }], modePaiement: 'mtn_momo',
    });
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 7000 }], modePaiement: 'orange_money',
    });

    const treso = await e.tresorerieDuJour();
    expect(treso.mtnMomo).toBe(10000);
    expect(treso.orangeMoney).toBe(7000);

    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
    const numeros = (bilan.actif as { numero: string }[]).map((l) => l.numero);
    expect(numeros).toContain('5522');
    expect(numeros).toContain('5521');
    expect(numeros).not.toContain('552');
    expect(numeros).not.toContain('553');
  });
});
