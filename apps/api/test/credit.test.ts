import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

async function inscrire(email: string) {
  const res = await SELF.fetch('http://localhost/api/auth/sign-up/email', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'motdepasse123', name: 'Test' }),
  });
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  await SELF.fetch('http://localhost/api/entreprises', { headers: { cookie } }); // crée le profil utilisateur
  return cookie;
}

describe('Vente à crédit (411) — corrections caisse P0 #7', () => {
  it('une vente à crédit sans client est refusée (validation Zod, 400)', async () => {
    const cookie = await inscrire('credit-refus@test.cm');
    const create = await SELF.fetch('http://localhost/api/entreprises', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ raisonSociale: 'Boutique Refus', secteur: 'commerce', natureActivite: 'negoce' }),
    });
    const { entrepriseId } = await create.json<{ entrepriseId: string }>();

    const res = await SELF.fetch('http://localhost/api/ventes', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId },
      body: JSON.stringify({ aCredit: true, lignes: [{ prixUnitaire: 1000, quantite: 1 }] }),
    });
    expect(res.status).toBe(400);
  });

  it('une vente à crédit débite 411 et crédite le produit — pas de trésorerie mouvementée', async () => {
    const e = doE('credit-1');
    await e.initialiser('credit-1', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Fidèle' });

    const r = await e.enregistrerVente({
      lignes: [{ designation: 'Sac de riz', quantite: 2, prixUnitaire: 15000 }],
      aCredit: true, tiersId,
    });
    expect(r.totalTtc).toBe(30000);

    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
    // La créance client (411, classe 4 solde débiteur) doit apparaître à l'actif.
    const creance = (bilan.actif as { numero: string; montant: number }[]).find((l) => l.numero === '411');
    expect(creance?.montant).toBe(30000);

    const enCours = await e.listerVentesACredit();
    expect(enCours.length).toBe(1);
    expect((enCours[0] as { statut: string }).statut).toBe('a_credit');
  });

  it('un règlement partiel puis total solde la vente et alimente la trésorerie', async () => {
    const e = doE('credit-2');
    await e.initialiser('credit-2', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Partiel' });
    const { venteId, totalTtc } = await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 10000 }],
      aCredit: true, tiersId,
    });
    expect(totalTtc).toBe(10000);

    const partiel = await e.payerVente(venteId, 4000, 'especes');
    expect(partiel.statut).toBe('payee_partiellement');
    expect(partiel.regle).toBe(4000);

    const solde = await e.payerVente(venteId, 6000, 'especes');
    expect(solde.statut).toBe('payee');
    expect(solde.regle).toBe(10000);

    const enCours = await e.listerVentesACredit();
    expect(enCours.length).toBe(0); // soldée, ne figure plus dans « on me doit »

    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
    const creance = (bilan.actif as { numero: string }[]).find((l) => l.numero === '411');
    expect(creance).toBeUndefined(); // plus de solde 411 : entièrement réglée
  });

  it('les écritures de vente à crédit sont journalisées et immuables', async () => {
    const e = doE('credit-4');
    await e.initialiser('credit-4', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Test' });
    const acteur = { utilisateurId: 'u-caissier', role: 'caissier' };
    const { venteId } = await e.enregistrerVente(
      { lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 8000 }], aCredit: true, tiersId }, acteur,
    );
    await e.payerVente(venteId, 8000, 'especes', acteur);

    const journal = await e.listerAuditLog();
    const actions = (journal as { action: string }[]).map((j) => j.action).sort();
    expect(actions).toEqual(['vente.credit', 'vente.payer'].sort());

    const integrite = await e.verifierChaineAudit();
    expect(integrite.valide).toBe(true);
  });
});
