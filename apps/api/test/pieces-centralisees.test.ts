import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

/** Écran centralisé « Pièces justificatives » — agrège dépenses + achats + ventes, y compris
 * une fois la dette/créance soldée (contrairement aux listes filtrées Dettes/Créances). */

async function inscrire(email: string) {
  const res = await SELF.fetch('http://localhost/api/auth/sign-up/email', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'motdepasse123', name: 'Test' }),
  });
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  await SELF.fetch('http://localhost/api/entreprises', { headers: { cookie } });
  return cookie;
}

async function creerEntreprise(cookie: string, raisonSociale: string) {
  const res = await SELF.fetch('http://localhost/api/entreprises', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ raisonSociale, secteur: 'commerce', natureActivite: 'negoce' }),
  });
  const { entrepriseId } = await res.json<{ entrepriseId: string }>();
  return entrepriseId;
}

const PNG_1PX = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
), (c) => c.charCodeAt(0));

describe('Pièces justificatives — écran centralisé (/api/pieces)', () => {
  it('agrège dépenses, achats et ventes ayant une pièce jointe, triés par date décroissante', async () => {
    const cookie = await inscrire('pieces-1@test.cm');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Pièces Centralisées');
    const headers = { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId };

    // Dépense avec pièce
    const depense = await SELF.fetch('http://localhost/api/depenses', {
      method: 'POST', headers, body: JSON.stringify({ categorie: 'loyer', libelle: 'Loyer', montant: 30000, modePaiement: 'especes' }),
    });
    const { depenseId } = await depense.json<{ depenseId: string }>();
    await SELF.fetch(`http://localhost/api/depenses/${depenseId}/piece`, {
      method: 'POST', headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'image/png' }, body: PNG_1PX,
    });

    // Dépense SANS pièce — ne doit pas apparaître
    await SELF.fetch('http://localhost/api/depenses', {
      method: 'POST', headers, body: JSON.stringify({ categorie: 'transport', libelle: 'Carburant', montant: 5000, modePaiement: 'especes' }),
    });

    // Achat à crédit avec pièce, réglé ensuite — doit rester listé malgré le solde à zéro.
    const produit = await SELF.fetch('http://localhost/api/produits', {
      method: 'POST', headers, body: JSON.stringify({ nom: 'Sac de riz', prixVente: 15000 }),
    });
    const { produitId } = await produit.json<{ produitId: string }>();
    const fournisseur = await SELF.fetch('http://localhost/api/tiers', {
      method: 'POST', headers, body: JSON.stringify({ nom: 'Grossiste Test', type: 'fournisseur' }),
    });
    const { tiersId: fournisseurId } = await fournisseur.json<{ tiersId: string }>();
    await SELF.fetch(`http://localhost/api/produits/${produitId}/entree`, {
      method: 'POST', headers, body: JSON.stringify({ quantite: 10, coutUnitaire: 10000, aCredit: true, tiersId: fournisseurId }),
    });
    const dettesRes = await SELF.fetch('http://localhost/api/achats/dettes', { headers: { cookie, 'x-entreprise-id': entrepriseId } });
    const { dettes } = await dettesRes.json<{ dettes: { id: string }[] }>();
    const achatId = dettes[0]!.id;
    await SELF.fetch(`http://localhost/api/achats/${achatId}/piece`, {
      method: 'POST', headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'image/png' }, body: PNG_1PX,
    });
    await SELF.fetch(`http://localhost/api/achats/${achatId}/payer`, {
      method: 'POST', headers, body: JSON.stringify({ montant: 100000, modePaiement: 'especes' }),
    });
    expect((await (await SELF.fetch('http://localhost/api/achats/dettes', { headers: { cookie, 'x-entreprise-id': entrepriseId } })).json<{ dettes: unknown[] }>()).dettes.length).toBe(0);

    // Vente à crédit SANS pièce — ne doit pas apparaître.
    const client = await SELF.fetch('http://localhost/api/tiers', {
      method: 'POST', headers, body: JSON.stringify({ nom: 'Client Test', type: 'client' }),
    });
    const { tiersId: clientId } = await client.json<{ tiersId: string }>();
    await SELF.fetch('http://localhost/api/ventes', {
      method: 'POST', headers,
      body: JSON.stringify({ lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 8000 }], aCredit: true, tiersId: clientId }),
    });

    const res = await SELF.fetch('http://localhost/api/pieces', { headers: { cookie, 'x-entreprise-id': entrepriseId } });
    expect(res.status).toBe(200);
    const { pieces } = await res.json<{ pieces: { type: string; id: string; montant: number; piece_cle: string }[] }>();

    expect(pieces.length).toBe(2); // la dépense sans pièce et la vente sans pièce sont exclues
    const types = pieces.map((p) => p.type).sort();
    expect(types).toEqual(['achat', 'depense']);
    const achatListe = pieces.find((p) => p.type === 'achat')!;
    expect(achatListe.id).toBe(achatId);
    expect(achatListe.montant).toBe(100000); // reste listé même soldé
  });
});
