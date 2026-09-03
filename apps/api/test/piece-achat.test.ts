import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

/** Pièce justificative (scan de la facture fournisseur) attachée à un achat fournisseur — même
 * mécanique que piece-depense.test.ts (fichier stocké dans R2, bucket DOCS). */

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

// PNG 1x1 minimal valide (en-tête + IHDR + IDAT + IEND), pour un test HTTP réel sans dépendance externe.
const PNG_1PX = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
), (c) => c.charCodeAt(0));

/** Crée un achat à crédit (seul cas qui peuple `achat_fournisseur` — voir schema.ts v6) via une entrée de stock. */
async function creerAchatACredit(cookie: string, entrepriseId: string) {
  const headers = { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId };
  const produit = await SELF.fetch('http://localhost/api/produits', {
    method: 'POST', headers, body: JSON.stringify({ nom: 'Sac de riz', prixVente: 15000 }),
  });
  const { produitId } = await produit.json<{ produitId: string }>();
  const fournisseur = await SELF.fetch('http://localhost/api/tiers', {
    method: 'POST', headers, body: JSON.stringify({ nom: 'Grossiste Test', type: 'fournisseur' }),
  });
  const { tiersId } = await fournisseur.json<{ tiersId: string }>();

  const entree = await SELF.fetch(`http://localhost/api/produits/${produitId}/entree`, {
    method: 'POST', headers,
    body: JSON.stringify({ quantite: 10, coutUnitaire: 10000, aCredit: true, tiersId }),
  });
  expect(entree.status).toBe(200);

  const dettes = await SELF.fetch('http://localhost/api/achats/dettes', {
    headers: { cookie, 'x-entreprise-id': entrepriseId },
  });
  const { dettes: liste } = await dettes.json<{ dettes: { id: string }[] }>();
  return liste[0]!.id;
}

describe('Pièce justificative d\'un achat fournisseur (scan facture → R2)', () => {
  it('téléverse, consulte, remplace puis retire une pièce', async () => {
    const cookie = await inscrire('piece-achat-1@test.cm');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Pièce Achat');
    const achatId = await creerAchatACredit(cookie, entrepriseId);

    const upload = await SELF.fetch(`http://localhost/api/achats/${achatId}/piece`, {
      method: 'POST',
      headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'image/png' },
      body: PNG_1PX,
    });
    expect(upload.status).toBe(201);
    const { cle } = await upload.json<{ cle: string }>();
    expect(cle).toContain(entrepriseId);
    expect(cle).toContain(achatId);

    const consultation = await SELF.fetch(`http://localhost/api/achats/${achatId}/piece`, {
      headers: { cookie, 'x-entreprise-id': entrepriseId },
    });
    expect(consultation.status).toBe(200);
    expect(consultation.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await consultation.arrayBuffer())).toEqual(PNG_1PX);

    // La liste des dettes expose désormais la clé, pour afficher le badge côté écran Dettes.
    const dettesApres = await SELF.fetch('http://localhost/api/achats/dettes', {
      headers: { cookie, 'x-entreprise-id': entrepriseId },
    });
    const { dettes } = await dettesApres.json<{ dettes: { piece_cle: string | null }[] }>();
    expect(dettes[0]!.piece_cle).toBe(cle);

    const remplace = await SELF.fetch(`http://localhost/api/achats/${achatId}/piece`, {
      method: 'POST',
      headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'image/png' },
      body: PNG_1PX,
    });
    expect(remplace.status).toBe(201);
    const { cle: nouvelleCle } = await remplace.json<{ cle: string }>();
    expect(nouvelleCle).not.toBe(cle);

    const retrait = await SELF.fetch(`http://localhost/api/achats/${achatId}/piece`, {
      method: 'DELETE', headers: { cookie, 'x-entreprise-id': entrepriseId },
    });
    expect(retrait.status).toBe(200);

    const apresRetrait = await SELF.fetch(`http://localhost/api/achats/${achatId}/piece`, {
      headers: { cookie, 'x-entreprise-id': entrepriseId },
    });
    expect(apresRetrait.status).toBe(404);
  });

  it('refuse un type de fichier non supporté', async () => {
    const cookie = await inscrire('piece-achat-2@test.cm');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Pièce Achat 2');
    const achatId = await creerAchatACredit(cookie, entrepriseId);

    const res = await SELF.fetch(`http://localhost/api/achats/${achatId}/piece`, {
      method: 'POST',
      headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'application/zip' },
      body: PNG_1PX,
    });
    expect(res.status).toBe(415);
  });

  it('refuse le téléversement pour un achat inexistant (aucun objet orphelin créé)', async () => {
    const cookie = await inscrire('piece-achat-3@test.cm');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Pièce Achat 3');

    const res = await SELF.fetch('http://localhost/api/achats/id-inexistant/piece', {
      method: 'POST',
      headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'image/png' },
      body: PNG_1PX,
    });
    expect(res.status).toBe(404);
  });
});
