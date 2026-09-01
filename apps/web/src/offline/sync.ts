/**
 * Rejeu des mutations hors-ligne vers l'API à la reconnexion.
 * Idempotence garantie par clientUuid (dédup côté API). Déclenché sur l'événement `online`
 * et au démarrage. Backoff simple sur les tentatives.
 */

import { db, mutationsEnAttente, type Mutation } from './db.js';

const ENDPOINT: Record<Mutation['type'], string> = {
  creer_ecriture: '/api/comptabilite/ecritures',
  creer_facture: '/api/facturation/factures',
  creer_tiers: '/api/tiers',
};

export interface OptionsSync {
  apiBaseUrl: string;
  utilisateurId: string;
}

let enCours = false;

export async function synchroniser(opts: OptionsSync): Promise<{ envoyees: number; echecs: number }> {
  if (enCours || !navigator.onLine) return { envoyees: 0, echecs: 0 };
  enCours = true;
  let envoyees = 0;
  let echecs = 0;
  try {
    for (const m of await mutationsEnAttente()) {
      try {
        const res = await fetch(opts.apiBaseUrl + ENDPOINT[m.type], {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-utilisateur-id': opts.utilisateurId,
            'x-entreprise-id': m.entrepriseId,
            'idempotency-key': m.clientUuid,
          },
          body: JSON.stringify({ ...(m.payload as object), clientUuid: m.clientUuid }),
        });
        if (res.ok || res.status === 409 /* déjà synchronisé */) {
          await db.mutations.update(m.clientUuid, { synchronise: 1 });
          envoyees++;
        } else {
          await db.mutations.update(m.clientUuid, { tentatives: m.tentatives + 1 });
          echecs++;
        }
      } catch {
        await db.mutations.update(m.clientUuid, { tentatives: m.tentatives + 1 });
        echecs++;
      }
    }
  } finally {
    enCours = false;
  }
  return { envoyees, echecs };
}

/** Installe les déclencheurs de synchronisation automatique. */
export function activerSyncAuto(opts: OptionsSync): void {
  window.addEventListener('online', () => void synchroniser(opts));
  if (navigator.onLine) void synchroniser(opts);
}
