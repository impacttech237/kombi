import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

/** Pièce justificative (photo/scan) attachée à une dépense — fichier stocké dans R2 (bucket DOCS). */

async function inscrire(email: string, ip: string) {
  const res = await SELF.fetch('http://localhost/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
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

async function creerDepense(cookie: string, entrepriseId: string) {
  const res = await SELF.fetch('http://localhost/api/depenses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId },
    body: JSON.stringify({ categorie: 'loyer', libelle: 'Loyer', montant: 30000, modePaiement: 'especes' }),
  });
  const { depenseId } = await res.json<{ depenseId: string }>();
  return depenseId;
}

describe('Pièce justificative de dépense (photo/scan → R2)', () => {
  it('téléverse, consulte, remplace puis retire une pièce', async () => {
    const cookie = await inscrire('piece-1@test.cm', '198.51.100.30');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Pièce');
    const depenseId = await creerDepense(cookie, entrepriseId);

    const upload = await SELF.fetch(`http://localhost/api/depenses/${depenseId}/piece`, {
      method: 'POST',
      headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'image/png' },
      body: PNG_1PX,
    });
    expect(upload.status).toBe(201);
    const { cle } = await upload.json<{ cle: string }>();
    expect(cle).toContain(entrepriseId);
    expect(cle).toContain(depenseId);

    const consultation = await SELF.fetch(`http://localhost/api/depenses/${depenseId}/piece`, {
      headers: { cookie, 'x-entreprise-id': entrepriseId },
    });
    expect(consultation.status).toBe(200);
    expect(consultation.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await consultation.arrayBuffer())).toEqual(PNG_1PX);

    // Remplacement : l'ancienne clé ne doit plus être accessible sous son ancien nom, la
    // dépense pointe désormais vers la nouvelle.
    const remplace = await SELF.fetch(`http://localhost/api/depenses/${depenseId}/piece`, {
      method: 'POST',
      headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'image/png' },
      body: PNG_1PX,
    });
    expect(remplace.status).toBe(201);
    const { cle: nouvelleCle } = await remplace.json<{ cle: string }>();
    expect(nouvelleCle).not.toBe(cle);

    const retrait = await SELF.fetch(`http://localhost/api/depenses/${depenseId}/piece`, {
      method: 'DELETE', headers: { cookie, 'x-entreprise-id': entrepriseId },
    });
    expect(retrait.status).toBe(200);

    const apresRetrait = await SELF.fetch(`http://localhost/api/depenses/${depenseId}/piece`, {
      headers: { cookie, 'x-entreprise-id': entrepriseId },
    });
    expect(apresRetrait.status).toBe(404);
  });

  it('refuse un type de fichier non supporté', async () => {
    const cookie = await inscrire('piece-2@test.cm', '198.51.100.31');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Pièce 2');
    const depenseId = await creerDepense(cookie, entrepriseId);

    const res = await SELF.fetch(`http://localhost/api/depenses/${depenseId}/piece`, {
      method: 'POST',
      headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'application/zip' },
      body: PNG_1PX,
    });
    expect(res.status).toBe(415);
  });

  it('refuse le téléversement pour une dépense inexistante (aucun objet orphelin créé)', async () => {
    const cookie = await inscrire('piece-3@test.cm', '198.51.100.32');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Pièce 3');

    const res = await SELF.fetch('http://localhost/api/depenses/id-inexistant/piece', {
      method: 'POST',
      headers: { cookie, 'x-entreprise-id': entrepriseId, 'content-type': 'image/png' },
      body: PNG_1PX,
    });
    expect(res.status).toBe(404);
  });

  it('404 quand aucune pièce n\'a jamais été jointe', async () => {
    const cookie = await inscrire('piece-4@test.cm', '198.51.100.33');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Pièce 4');
    const depenseId = await creerDepense(cookie, entrepriseId);

    const res = await SELF.fetch(`http://localhost/api/depenses/${depenseId}/piece`, {
      headers: { cookie, 'x-entreprise-id': entrepriseId },
    });
    expect(res.status).toBe(404);
  });
});
