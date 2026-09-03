import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { regimeActuelDe } from '../src/services/bascule-regime.js';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

/**
 * Règle de maintien 2 ans (CGI Art. 93 quinquies, audit produit/fiscal 2026-09-03) : une
 * entreprise passée au Réel y reste 2 exercices même si son CA repasse sous le seuil IGS. Teste
 * le câblage réel (persistance D1 + lecture du CA de l'exercice clos précédent), pas seulement
 * la fonction pure `determinerRegime` (déjà testée dans packages/fiscal).
 */
describe('Bascule IGS↔Réel avec maintien 2 ans (services/bascule-regime.ts)', () => {
  async function creerEntrepriseReelle(id: string, caAnneePrecedente: number) {
    await env.DB.prepare(
      `INSERT INTO entreprise (id, raison_sociale, secteur, nature_activite, regime_fiscal, ans_sous_seuil)
       VALUES (?, ?, 'commerce', 'negoce', 'reel_simplifie', 0)`,
    ).bind(id, `Entreprise ${id}`).run();
    if (caAnneePrecedente > 0) {
      await doE(id).initialiser(id, 'commerce', 2025);
      await doE(id).enregistrerVente({
        lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: caAnneePrecedente }],
        modePaiement: 'especes', dateOperation: '2025-06-15',
      });
    } else {
      await doE(id).initialiser(id, 'commerce', 2025);
    }
  }

  it('maintient le régime Réel la 1ère année sous le seuil, ansSousSeuil passe à 1', async () => {
    const id = 'bascule-1';
    await creerEntrepriseReelle(id, 100_000); // très sous le seuil (50M)

    const etat = await regimeActuelDe(env, id);
    expect(etat.regime).toBe('reel_simplifie');
    expect(etat.ansSousSeuil).toBe(1);

    const row = await env.DB.prepare('SELECT regime_fiscal, ans_sous_seuil, regime_annee_maj FROM entreprise WHERE id = ?')
      .bind(id).first<{ regime_fiscal: string; ans_sous_seuil: number; regime_annee_maj: number }>();
    expect(row?.regime_fiscal).toBe('reel_simplifie');
    expect(row?.ans_sous_seuil).toBe(1);
    expect(row?.regime_annee_maj).toBe(new Date().getUTCFullYear());
  });

  it('bascule en IGS une fois le maintien de 2 ans épuisé', async () => {
    const id = 'bascule-2';
    // ansSousSeuil = 2 : déjà maintenu 2 exercices (déterminerRegime maintient tant que < 2) —
    // cette réévaluation doit enfin faire basculer en IGS.
    await env.DB.prepare(
      `INSERT INTO entreprise (id, raison_sociale, secteur, nature_activite, regime_fiscal, ans_sous_seuil, regime_annee_maj)
       VALUES (?, 'Boutique', 'commerce', 'negoce', 'reel_simplifie', 2, ?)`,
    ).bind(id, new Date().getUTCFullYear() - 1).run(); // année pas encore réévaluée
    await doE(id).initialiser(id, 'commerce', 2025);
    await doE(id).enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 100_000 }],
      modePaiement: 'especes', dateOperation: '2025-06-15',
    });

    const etat = await regimeActuelDe(env, id);
    expect(etat.regime).toBe('igs');
    expect(etat.ansSousSeuil).toBe(0);
  });

  it('repasse en Réel « solide » (ansSousSeuil remis à 0) si le CA repasse au-dessus du seuil', async () => {
    const id = 'bascule-3';
    await env.DB.prepare(
      `INSERT INTO entreprise (id, raison_sociale, secteur, nature_activite, regime_fiscal, ans_sous_seuil)
       VALUES (?, 'Boutique', 'commerce', 'negoce', 'reel_simplifie', 1)`,
    ).bind(id).run();
    await doE(id).initialiser(id, 'commerce', 2025);
    await doE(id).enregistrerVente({
      lignes: [{ designation: 'Gros contrat', quantite: 1, prixUnitaire: 60_000_000 }], // > seuil 50M
      modePaiement: 'especes', dateOperation: '2025-06-15',
    });

    const etat = await regimeActuelDe(env, id);
    expect(etat.regime).toBe('reel_normal'); // CA >= seuil → Réel de plein droit, pas via maintien
    expect(etat.ansSousSeuil).toBe(0);
  });

  it('ne réévalue qu\'une fois par année civile (idempotent sur des appels répétés)', async () => {
    const id = 'bascule-4';
    await creerEntrepriseReelle(id, 100_000);

    const premier = await regimeActuelDe(env, id);
    expect(premier.ansSousSeuil).toBe(1);

    // Un second appel la même année ne doit pas incrémenter à nouveau ansSousSeuil.
    const second = await regimeActuelDe(env, id);
    expect(second.ansSousSeuil).toBe(1);
    expect(second.regime).toBe('reel_simplifie');
  });
});
