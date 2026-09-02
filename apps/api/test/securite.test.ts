import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

async function inscrire(email: string, ip: string) {
  const res = await SELF.fetch('http://localhost/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email, password: 'motdepasse123', name: 'Test' }),
  });
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  // Le profil métier `utilisateur` n'est créé qu'au premier appel authentifié (pont better-auth
  // → domaine, voir middleware/auth.ts) — on le déclenche pour que l'email soit trouvable.
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

describe('CORS — origines restreintes', () => {
  it('reflète une origine de confiance, refuse une origine inconnue', async () => {
    const ok = await SELF.fetch('http://localhost/health', { headers: { origin: 'http://localhost:5173' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

    const refuse = await SELF.fetch('http://localhost/health', { headers: { origin: 'https://evil.example' } });
    expect(refuse.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('Rate limiting — routes d\'authentification', () => {
  it('bloque après 10 tentatives de connexion depuis la même IP', async () => {
    const ip = '203.0.113.9';
    let dernierStatut = 0;
    for (let i = 0; i < 11; i++) {
      const res = await SELF.fetch('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ email: 'inconnu@test.cm', password: 'mauvais' }),
      });
      dernierStatut = res.status;
    }
    expect(dernierStatut).toBe(429);
  });
});

describe('Validation Zod — montants, taux, dates', () => {
  it('rejette une vente avec un montant négatif', async () => {
    const cookie = await inscrire('vendeur@zod.cm', '198.51.100.1');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Zod');

    const res = await SELF.fetch('http://localhost/api/ventes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId },
      body: JSON.stringify({ modePaiement: 'especes', lignes: [{ prixUnitaire: -500, quantite: 1 }] }),
    });
    expect(res.status).toBe(400);
  });

  it('rejette une dépense avec un montant négatif ou un mode de paiement invalide', async () => {
    const cookie = await inscrire('gerant@zod.cm', '198.51.100.2');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Zod 2');

    const montantInvalide = await SELF.fetch('http://localhost/api/depenses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId },
      body: JSON.stringify({ categorie: 'loyer', libelle: 'Loyer', montant: -1, modePaiement: 'especes' }),
    });
    expect(montantInvalide.status).toBe(400);

    const modeInvalide = await SELF.fetch('http://localhost/api/depenses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId },
      body: JSON.stringify({ categorie: 'loyer', libelle: 'Loyer', montant: 50000, modePaiement: 'bitcoin' }),
    });
    expect(modeInvalide.status).toBe(400);

    // Une dépense valide passe toujours.
    const valide = await SELF.fetch('http://localhost/api/depenses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId },
      body: JSON.stringify({ categorie: 'loyer', libelle: 'Loyer', montant: 50000, modePaiement: 'especes' }),
    });
    expect(valide.status).toBe(201);
  });
});

describe('Fiscalité protégée par permission (compta:read)', () => {
  it('un caissier n\'accède pas aux données fiscales, un admin oui', async () => {
    const cookieAdmin = await inscrire('admin@fisc.cm', '198.51.100.3');
    const entrepriseId = await creerEntreprise(cookieAdmin, 'Boutique Fiscale');

    // L'admin (créateur) accède bien à la fiscalité.
    const okAdmin = await SELF.fetch('http://localhost/api/fiscalite/igs', {
      headers: { cookie: cookieAdmin, 'x-entreprise-id': entrepriseId },
    });
    expect(okAdmin.status).toBe(200);

    // Un caissier ajouté à l'équipe n'a pas la permission compta:read.
    const cookieCaissier = await inscrire('caissiere@fisc.cm', '198.51.100.8');
    await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieAdmin },
      body: JSON.stringify({ email: 'caissiere@fisc.cm', role: 'caissier' }),
    });
    const refuse = await SELF.fetch('http://localhost/api/fiscalite/igs', {
      headers: { cookie: cookieCaissier, 'x-entreprise-id': entrepriseId },
    });
    expect(refuse.status).toBe(403);
  });
});

describe('Équipe — invitation et rôles', () => {
  it('un admin ajoute un membre existant par email, change son rôle, puis le retire', async () => {
    const cookieAdmin = await inscrire('boss@equipe.cm', '198.51.100.4');
    const entrepriseId = await creerEntreprise(cookieAdmin, 'Boutique Équipe');
    await inscrire('recrue@equipe.cm', '198.51.100.5'); // doit déjà avoir un compte

    const ajout = await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieAdmin },
      body: JSON.stringify({ email: 'recrue@equipe.cm', role: 'caissier' }),
    });
    expect(ajout.status).toBe(201);

    const liste = await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      headers: { cookie: cookieAdmin },
    });
    const { membres } = await liste.json<{ membres: { id: string; email: string; role: string }[] }>();
    const recrue = membres.find((m) => m.email === 'recrue@equipe.cm');
    expect(recrue?.role).toBe('caissier');

    const changement = await SELF.fetch(
      `http://localhost/api/entreprises/${entrepriseId}/membres/${recrue!.id}/role`,
      { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieAdmin }, body: JSON.stringify({ role: 'comptable' }) },
    );
    expect(changement.status).toBe(200);

    const retrait = await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres/${recrue!.id}`, {
      method: 'DELETE', headers: { cookie: cookieAdmin },
    });
    expect(retrait.status).toBe(200);
  });

  it('un non-admin ne peut pas gérer l\'équipe', async () => {
    const cookieAdmin = await inscrire('boss2@equipe.cm', '198.51.100.6');
    const entrepriseId = await creerEntreprise(cookieAdmin, 'Boutique Équipe 2');
    const cookieAutre = await inscrire('salarie@equipe.cm', '198.51.100.7');

    const refuse = await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      headers: { cookie: cookieAutre },
    });
    expect(refuse.status).toBe(403);
  });
});
