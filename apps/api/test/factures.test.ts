import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Facturation & devis', () => {
  it('conserve l’échéance lors de l’émission et calcule le retard', async () => {
    const e = doE('fact-echeance');
    await e.initialiser('fact-echeance', 'commerce', 2026);
    const t = await e.creerTiers({ type: 'client', nom: 'Client retard' });
    const f = await e.creerFacture({
      type: 'facture', tiersId: t, dateEcheance: '2026-08-31',
      lignes: [{ designation: 'Mission', quantite: 1, prixUnitaire: 10000 }],
    });
    await e.emettreFacture(f, 'TEST');
    const ligne = (await e.listerFactures() as { id: string; date_echeance: string | null; enRetard: boolean }[]).find((x) => x.id === f)!;
    expect(ligne.date_echeance).toBe('2026-08-31');
    expect(ligne.enRetard).toBe(true);
  });

  it('numérotation strictement séquentielle et gap-less', async () => {
    const e = doE('fact-1');
    await e.initialiser('fact-1', 'commerce', 2026);
    const t = await e.creerTiers({ type: 'client', nom: 'Client SARL' });

    const f1 = await e.creerFacture({ type: 'facture', tiersId: t, lignes: [{ designation: 'A', quantite: 1, prixUnitaire: 10000 }] });
    const f2 = await e.creerFacture({ type: 'facture', tiersId: t, lignes: [{ designation: 'B', quantite: 1, prixUnitaire: 20000 }] });

    const r1 = await e.emettreFacture(f1, 'BOUTIQUE');
    const r2 = await e.emettreFacture(f2, 'BOUTIQUE');
    expect(r1.numero).toBe('BOUTIQUE-FAC-2026-0001');
    expect(r2.numero).toBe('BOUTIQUE-FAC-2026-0002');

    // ré-émettre est idempotent (même numéro)
    expect((await e.emettreFacture(f1, 'BOUTIQUE')).numero).toBe('BOUTIQUE-FAC-2026-0001');
  });

  it('émettre une facture crée la créance client (411) et alimente le CA', async () => {
    const e = doE('fact-2');
    await e.initialiser('fact-2', 'commerce', 2026);
    const t = await e.creerTiers({ type: 'client', nom: 'Client' });
    const f = await e.creerFacture({ type: 'facture', tiersId: t, lignes: [{ designation: 'Marchandise', quantite: 1, prixUnitaire: 50000 }] });
    await e.emettreFacture(f, 'ESE');
    expect(await e.caCumule()).toBe(50000); // crédit 701
  });

  it('paiement partiel puis total met à jour le statut', async () => {
    const e = doE('fact-3');
    await e.initialiser('fact-3', 'commerce', 2026);
    const t = await e.creerTiers({ type: 'client', nom: 'Client' });
    const f = await e.creerFacture({ type: 'facture', tiersId: t, lignes: [{ designation: 'X', quantite: 1, prixUnitaire: 10000 }] });
    await e.emettreFacture(f, 'ESE');

    let p = await e.payerFacture(f, 4000, 'especes');
    expect(p.statut).toBe('payee_partiellement');
    p = await e.payerFacture(f, 6000, 'mtn_momo');
    expect(p.statut).toBe('payee');
    expect(p.regle).toBe(10000);
  });

  it('un devis n\'alimente pas le CA (pas de comptabilisation)', async () => {
    const e = doE('fact-4');
    await e.initialiser('fact-4', 'commerce', 2026);
    const t = await e.creerTiers({ type: 'client', nom: 'Prospect' });
    const d = await e.creerFacture({ type: 'devis', tiersId: t, lignes: [{ designation: 'Offre', quantite: 1, prixUnitaire: 99000 }] });
    const r = await e.emettreFacture(d, 'ESE');
    expect(r.numero).toBe('ESE-DEV-2026-0001');
    expect(await e.caCumule()).toBe(0);
  });
});
