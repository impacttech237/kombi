import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

/**
 * Un achat au comptant AVEC fournisseur renseigné doit maintenant aussi tracer un
 * `achat_fournisseur` (statut 'regle') pour permettre d'y attacher le scan de la facture — jusque
 * là, seuls les achats à crédit en créaient un (voir migration v6, "l'approvisionnement réglait
 * toujours comptant"). Un comptant SANS fournisseur reste inchangé (aucune trace créée).
 */

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

describe('Achat au comptant avec fournisseur — pièce jointe possible sans être une dette', () => {
  it('un comptant avec fournisseur trace un achat_fournisseur réglé, sur lequel une pièce peut être jointe', async () => {
    const cookie = await inscrire('piece-comptant-1@test.cm');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Comptant Fournisseur');
    const headers = { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId };

    const produit = await SELF.fetch('http://localhost/api/produits', {
      method: 'POST', headers, body: JSON.stringify({ nom: 'Sac de riz', prixVente: 15000 }),
    });
    const { produitId } = await produit.json<{ produitId: string }>();
    const fournisseur = await SELF.fetch('http://localhost/api/tiers', {
      method: 'POST', headers, body: JSON.stringify({ nom: 'Grossiste Comptant', type: 'fournisseur' }),
    });
    const { tiersId } = await fournisseur.json<{ tiersId: string }>();

    const entree = await SELF.fetch(`http://localhost/api/produits/${produitId}/entree`, {
      method: 'POST', headers,
      body: JSON.stringify({ quantite: 5, coutUnitaire: 10000, modePaiement: 'especes', tiersId }),
    });
    expect(entree.status).toBe(200);
    const { achatId } = await entree.json<{ achatId: string | null }>();
    expect(achatId).not.toBeNull();

    // N'apparaît PAS comme une dette (déjà réglé).
    const dettes = await SELF.fetch('http://localhost/api/achats/dettes', { headers: { cookie, 'x-entreprise-id': entrepriseId } });
    expect((await dettes.json<{ dettes: unknown[] }>()).dettes).toEqual([]);

    // Mais reste visible dans la fiche du fournisseur, avec la pièce attachable.
    const fiche = await SELF.fetch(`http://localhost/api/tiers/${tiersId}`, { headers: { cookie, 'x-entreprise-id': entrepriseId } });
    const ficheJson = await fiche.json<{ achats: { id: string; statut: string; piece_cle: string | null }[] }>();
    expect(ficheJson.achats.length).toBe(1);
    expect(ficheJson.achats[0]!.statut).toBe('regle');
    expect(ficheJson.achats[0]!.piece_cle).toBeNull();

    const upload = await SELF.fetch(`http://localhost/api/achats/${achatId}/piece`, {
      method: 'POST', headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'image/png' }, body: PNG_1PX,
    });
    expect(upload.status).toBe(201);

    const consultation = await SELF.fetch(`http://localhost/api/achats/${achatId}/piece`, { headers: { cookie, 'x-entreprise-id': entrepriseId } });
    expect(consultation.status).toBe(200);
    expect(new Uint8Array(await consultation.arrayBuffer())).toEqual(PNG_1PX); // consomme le corps (sinon le stream R2 reste ouvert et casse l'isolation entre tests)

    // Apparaît maintenant dans l'écran centralisé.
    const pieces = await SELF.fetch('http://localhost/api/pieces', { headers: { cookie, 'x-entreprise-id': entrepriseId } });
    const { pieces: liste } = await pieces.json<{ pieces: { type: string; id: string }[] }>();
    expect(liste.some((p) => p.type === 'achat' && p.id === achatId)).toBe(true);
  });

  it('un comptant SANS fournisseur ne trace toujours rien (comportement historique inchangé)', async () => {
    const cookie = await inscrire('piece-comptant-2@test.cm');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Comptant Sans Fournisseur');
    const headers = { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId };

    const produit = await SELF.fetch('http://localhost/api/produits', {
      method: 'POST', headers, body: JSON.stringify({ nom: 'Article', prixVente: 5000 }),
    });
    const { produitId } = await produit.json<{ produitId: string }>();

    const entree = await SELF.fetch(`http://localhost/api/produits/${produitId}/entree`, {
      method: 'POST', headers, body: JSON.stringify({ quantite: 3, coutUnitaire: 2000, modePaiement: 'especes' }),
    });
    expect(entree.status).toBe(200);
    const { achatId } = await entree.json<{ achatId: string | null }>();
    expect(achatId).toBeNull();
  });
});
