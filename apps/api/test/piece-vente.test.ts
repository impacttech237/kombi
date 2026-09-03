import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

/** Pièce justificative (bon de livraison, commande client...) attachée à une vente à crédit —
 * même mécanique que piece-depense.test.ts / piece-achat.test.ts (fichier stocké dans R2). */

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

async function creerVenteACredit(cookie: string, entrepriseId: string) {
  const headers = { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId };
  const client = await SELF.fetch('http://localhost/api/tiers', {
    method: 'POST', headers, body: JSON.stringify({ nom: 'Client Test', type: 'client' }),
  });
  const { tiersId } = await client.json<{ tiersId: string }>();

  const vente = await SELF.fetch('http://localhost/api/ventes', {
    method: 'POST', headers,
    body: JSON.stringify({
      lignes: [{ designation: 'Sac de riz', quantite: 1, prixUnitaire: 15000 }],
      aCredit: true, tiersId,
    }),
  });
  expect(vente.status).toBe(201);
  const { venteId } = await vente.json<{ venteId: string }>();
  return venteId;
}

describe('Pièce justificative d\'une vente à crédit (scan → R2)', () => {
  it('téléverse, consulte, remplace puis retire une pièce', async () => {
    const cookie = await inscrire('piece-vente-1@test.cm');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Pièce Vente');
    const venteId = await creerVenteACredit(cookie, entrepriseId);

    const upload = await SELF.fetch(`http://localhost/api/ventes/${venteId}/piece`, {
      method: 'POST',
      headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'image/png' },
      body: PNG_1PX,
    });
    expect(upload.status).toBe(201);
    const { cle } = await upload.json<{ cle: string }>();
    expect(cle).toContain(entrepriseId);
    expect(cle).toContain(venteId);

    const consultation = await SELF.fetch(`http://localhost/api/ventes/${venteId}/piece`, {
      headers: { cookie, 'x-entreprise-id': entrepriseId },
    });
    expect(consultation.status).toBe(200);
    expect(consultation.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await consultation.arrayBuffer())).toEqual(PNG_1PX);

    const creditApres = await SELF.fetch('http://localhost/api/ventes/credit', {
      headers: { cookie, 'x-entreprise-id': entrepriseId },
    });
    const { ventes } = await creditApres.json<{ ventes: { piece_cle: string | null }[] }>();
    expect(ventes[0]!.piece_cle).toBe(cle);

    const remplace = await SELF.fetch(`http://localhost/api/ventes/${venteId}/piece`, {
      method: 'POST',
      headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'image/png' },
      body: PNG_1PX,
    });
    expect(remplace.status).toBe(201);
    const { cle: nouvelleCle } = await remplace.json<{ cle: string }>();
    expect(nouvelleCle).not.toBe(cle);

    const retrait = await SELF.fetch(`http://localhost/api/ventes/${venteId}/piece`, {
      method: 'DELETE', headers: { cookie, 'x-entreprise-id': entrepriseId },
    });
    expect(retrait.status).toBe(200);

    const apresRetrait = await SELF.fetch(`http://localhost/api/ventes/${venteId}/piece`, {
      headers: { cookie, 'x-entreprise-id': entrepriseId },
    });
    expect(apresRetrait.status).toBe(404);
  });

  it('refuse un type de fichier non supporté', async () => {
    const cookie = await inscrire('piece-vente-2@test.cm');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Pièce Vente 2');
    const venteId = await creerVenteACredit(cookie, entrepriseId);

    const res = await SELF.fetch(`http://localhost/api/ventes/${venteId}/piece`, {
      method: 'POST',
      headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'application/zip' },
      body: PNG_1PX,
    });
    expect(res.status).toBe(415);
  });

  it('refuse le téléversement pour une vente inexistante (aucun objet orphelin créé)', async () => {
    const cookie = await inscrire('piece-vente-3@test.cm');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Pièce Vente 3');

    const res = await SELF.fetch('http://localhost/api/ventes/id-inexistant/piece', {
      method: 'POST',
      headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'image/png' },
      body: PNG_1PX,
    });
    expect(res.status).toBe(404);
  });
});
