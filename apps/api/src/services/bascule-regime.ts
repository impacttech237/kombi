/**
 * Bascule IGS↔Réel avec règle de maintien 2 ans (CGI Art. 93 quinquies) — audit produit/fiscal
 * 2026-09-03 : `determinerRegime()` (packages/fiscal/src/regime.ts) implémente correctement la
 * règle, mais `GET /api/fiscalite/igs` l'appelait sans jamais lui passer `regimePrecedent`/
 * `ansSousSeuil`, donc la règle ne s'appliquait jamais en pratique — une entreprise qui repasse
 * sous le seuil basculait immédiatement en IGS au lieu d'être maintenue au Réel 2 exercices.
 *
 * Le régime légal d'un exercice se décide sur le CA de l'exercice CLOS PRÉCÉDENT, pas sur le CA
 * en cours d'accumulation de l'exercice courant — donc pas quelque chose à recalculer à chaque
 * requête : ce module réévalue et persiste la bascule une seule fois par changement d'année
 * civile (exercice = année civile, D10), en s'appuyant sur `regime_annee_maj` comme marqueur de
 * "déjà évalué pour cette année". Déclenché paresseusement au premier appel de l'année à
 * `regimeActuelDe()` (typiquement via `GET /api/fiscalite/igs`) — pas de cron de clôture d'exercice
 * dédié (fonctionnalité distincte, encore non construite, voir docs/parcours.md).
 */

import { determinerRegime, seuilIGS } from '@kombi/fiscal';
import type { NatureActivite, RegimeFiscal } from '@kombi/shared';
import { stubEntreprise, type Bindings } from '../types.js';

export interface EtatRegime {
  regime: RegimeFiscal;
  ansSousSeuil: number;
}

export async function regimeActuelDe(env: Bindings, entrepriseId: string): Promise<EtatRegime> {
  const ent = await env.DB.prepare(
    'SELECT regime_fiscal, ans_sous_seuil, regime_annee_maj, nature_activite FROM entreprise WHERE id = ?',
  )
    .bind(entrepriseId)
    .first<{
      regime_fiscal: RegimeFiscal; ans_sous_seuil: number; regime_annee_maj: number | null;
      nature_activite: NatureActivite;
    }>();
  if (!ent) throw new Error('Entreprise introuvable');

  const anneeCourante = new Date().getUTCFullYear();
  if (ent.regime_annee_maj === anneeCourante) {
    return { regime: ent.regime_fiscal, ansSousSeuil: ent.ans_sous_seuil };
  }

  const caAnneePrecedente = await stubEntreprise(env, entrepriseId).caCumuleAnnee(anneeCourante - 1);
  const nouveauRegime = determinerRegime({
    caAnnuelHT: caAnneePrecedente, natureActivite: ent.nature_activite,
    regimePrecedent: ent.regime_fiscal, ansSousSeuil: ent.ans_sous_seuil,
  });
  const sousLeSeuil = caAnneePrecedente < seuilIGS(ent.nature_activite);
  // Retombé en IGS (maintien épuisé) ou solidement au-dessus du seuil : le compteur repart à 0.
  // Toujours sous le seuil mais encore maintenu au Réel : incrémente la fenêtre de maintien.
  const nouvelAnsSousSeuil = nouveauRegime === 'igs' || !sousLeSeuil ? 0 : ent.ans_sous_seuil + 1;

  await env.DB.prepare(
    'UPDATE entreprise SET regime_fiscal = ?, ans_sous_seuil = ?, regime_annee_maj = ? WHERE id = ?',
  )
    .bind(nouveauRegime, nouvelAnsSousSeuil, anneeCourante, entrepriseId)
    .run();

  return { regime: nouveauRegime, ansSousSeuil: nouvelAnsSousSeuil };
}
