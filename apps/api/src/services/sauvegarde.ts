/**
 * Sauvegarde des Durable Objects (docs/AUDIT_2026-09-03.md point 1) : chaque entreprise vit dans
 * UNE SEULE instance DO, sans réplique Cloudflare native. Snapshot logique complet (toutes les
 * tables + l'état clé/valeur) exporté quotidiennement (cron, voir wrangler.toml) vers R2, avec
 * rétention glissante. Restauration : voir `EntrepriseDO.importerDonnees()` — volontairement PAS
 * exposée en self-service (pas de rôle super-admin dans ce MVP, cf. « back-office admin » reporté
 * en P2), à déclencher manuellement par le porteur du projet en cas d'incident réel.
 */

import type { Bindings } from '../types.js';
import { stubEntreprise } from '../types.js';

const PREFIXE_R2 = 'sauvegardes';
/** Nombre de sauvegardes conservées par entreprise (rotation quotidienne ≈ 1 mois d'historique). */
const RETENTION = 30;

function cle(entrepriseId: string, horodatage: string): string {
  return `${PREFIXE_R2}/${entrepriseId}/${horodatage}.json`;
}

/** Exporte l'instantané d'une entreprise et l'écrit dans R2. Retourne la clé R2 créée. */
export async function sauvegarderEntreprise(env: Bindings, entrepriseId: string): Promise<string> {
  const dump = await stubEntreprise(env, entrepriseId).exporterDonnees();
  const horodatage = dump.exporteLe.replace(/[:.]/g, '-');
  const objectKey = cle(entrepriseId, horodatage);
  await env.DOCS.put(objectKey, JSON.stringify(dump), {
    httpMetadata: { contentType: 'application/json' },
  });
  return objectKey;
}

/** Supprime les sauvegardes au-delà de la rétention pour une entreprise (garde les plus récentes). */
export async function purgerAnciennesSauvegardes(env: Bindings, entrepriseId: string): Promise<number> {
  const liste = await env.DOCS.list({ prefix: `${PREFIXE_R2}/${entrepriseId}/` });
  const objets = liste.objects.sort((a, b) => b.key.localeCompare(a.key)); // plus récent d'abord
  const enTrop = objets.slice(RETENTION);
  for (const o of enTrop) await env.DOCS.delete(o.key);
  return enTrop.length;
}

/** Liste les sauvegardes disponibles pour une entreprise, plus récente en premier. */
export async function listerSauvegardes(
  env: Bindings, entrepriseId: string,
): Promise<{ cle: string; taille: number; date: string }[]> {
  const liste = await env.DOCS.list({ prefix: `${PREFIXE_R2}/${entrepriseId}/` });
  return liste.objects
    .map((o) => ({ cle: o.key, taille: o.size, date: o.uploaded.toISOString() }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Sauvegarde toutes les entreprises connues du control plane (D1) — appelé par le cron. */
export async function sauvegarderToutesLesEntreprises(env: Bindings): Promise<{
  reussies: number; echecs: { entrepriseId: string; erreur: string }[];
}> {
  const { results } = await env.DB.prepare('SELECT id FROM entreprise').all<{ id: string }>();
  let reussies = 0;
  const echecs: { entrepriseId: string; erreur: string }[] = [];
  for (const { id } of results ?? []) {
    try {
      await sauvegarderEntreprise(env, id);
      await purgerAnciennesSauvegardes(env, id);
      reussies++;
    } catch (e) {
      echecs.push({ entrepriseId: id, erreur: e instanceof Error ? e.message : 'Erreur inconnue' });
    }
  }
  return { reussies, echecs };
}
