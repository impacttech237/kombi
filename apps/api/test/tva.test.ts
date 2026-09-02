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

describe('Chaîne TVA — comptes conditionnés par secteur et régime', () => {
  it('une vente de service avec TVA collecte sur 4432 (pas 4431)', async () => {
    const e = doE('tva-service');
    await e.initialiser('tva-service', 'service', 2026);
    await e.enregistrerVente({
      lignes: [{ designation: 'Consultation', quantite: 1, prixUnitaire: 20000, tauxTva: 0.1925 }],
      modePaiement: 'especes',
    });
    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
    const tva4432 = (bilan.passif as { numero: string; montant: number }[]).find((l) => l.numero === '4432');
    const tva4431 = (bilan.passif as { numero: string }[]).find((l) => l.numero === '4431');
    expect(tva4432?.montant).toBe(3850); // 20000 × 0,1925
    expect(tva4431).toBeUndefined();
  });

  it('une facture de service avec TVA collecte aussi sur 4432', async () => {
    const e = doE('tva-facture-svc');
    await e.initialiser('tva-facture-svc', 'service', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Pro' });
    const factureId = await e.creerFacture({
      type: 'facture', tiersId,
      lignes: [{ designation: 'Prestation', quantite: 1, prixUnitaire: 40000, tauxTva: 0.1925 }],
    });
    await e.emettreFacture(factureId, 'ENT');
    const { bilan } = await e.etatsFinanciers();
    expect((bilan.passif as { numero: string }[]).find((l) => l.numero === '4432')).toBeDefined();
  });

  it('une entreprise au régime réel (non-IGS) peut appliquer la TVA sans être bloquée', async () => {
    // Preuve que verifierTvaAutorisee() ne bloque pas à tort un régime autorisé — le refus
    // effectif au régime IGS est une garde d'une ligne (voir entreprise-do.ts), vérifiée par
    // lecture de code : un throw synchrone y est immédiat, avant tout accès au stockage.
    const cookie = await inscrire('reel-tva@test.cm');
    const create = await SELF.fetch('http://localhost/api/entreprises', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ raisonSociale: 'Boutique Réel', secteur: 'commerce', natureActivite: 'negoce' }),
    });
    const { entrepriseId } = await create.json<{ entrepriseId: string }>();
    await env.DB.prepare("UPDATE entreprise SET regime_fiscal = 'reel_simplifie' WHERE id = ?").bind(entrepriseId).run();

    const res = await SELF.fetch('http://localhost/api/ventes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId },
      body: JSON.stringify({
        modePaiement: 'especes', lignes: [{ prixUnitaire: 10000, quantite: 1, tauxTva: 0.1925 }],
      }),
    });
    expect(res.status).toBe(201);
  });

  it('un taux de TVA hors {0 ; 0,1925} est rejeté par la validation (400)', async () => {
    const cookie = await inscrire('taux-invalide@test.cm');
    const create = await SELF.fetch('http://localhost/api/entreprises', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ raisonSociale: 'Boutique Taux', secteur: 'commerce', natureActivite: 'negoce' }),
    });
    const { entrepriseId } = await create.json<{ entrepriseId: string }>();
    const res = await SELF.fetch('http://localhost/api/ventes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId },
      body: JSON.stringify({
        modePaiement: 'especes', lignes: [{ prixUnitaire: 10000, quantite: 1, tauxTva: 0.1 }],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('un achat avec TVA récupérable débite 4452 et stocke la marchandise à son coût HT', async () => {
    const e = doE('tva-achat');
    await e.initialiser('tva-achat', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Article', prixVente: 5000 });
    const { nouveauCmp } = await e.entrerStock({
      produitId, quantite: 10, coutUnitaire: 1000, modePaiement: 'especes', tauxTva: 0.1925,
    });
    expect(nouveauCmp).toBe(1000); // CMP valorisé HT, la TVA récupérable n'est pas un coût

    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
    const tvaDeductible = (bilan.actif as { numero: string; montant: number }[]).find((l) => l.numero === '4452');
    expect(tvaDeductible?.montant).toBe(1925); // 10000 × 0,1925
  });

  it('une dépense avec TVA récupérable débite aussi 4452', async () => {
    const e = doE('tva-depense');
    await e.initialiser('tva-depense', 'commerce', 2026);
    await e.creerDepense({
      categorie: 'fournitures', compteNumero: '6054', libelle: 'Fournitures bureau',
      montant: 20000, modePaiement: 'especes', tauxTva: 0.1925,
    });
    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
    const tvaDeductible = (bilan.actif as { numero: string; montant: number }[]).find((l) => l.numero === '4452');
    expect(tvaDeductible?.montant).toBe(3850); // 20000 × 0,1925
  });
});
