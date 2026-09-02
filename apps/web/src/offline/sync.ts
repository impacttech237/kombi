/**
 * Rejeu des mutations hors-ligne vers l'API dès que le réseau revient.
 * Idempotence garantie par clientUuid (dédup côté API). Déclenché au démarrage, sur l'événement
 * `online`, et après chaque nouvelle mutation.
 */

import { db, mutationsEnAttente, notifierFile as notifier } from './db.js';
import { enregistrerVente } from '../lib/api.js';

let enCours = false;

export async function synchroniser(): Promise<{ envoyees: number; echecs: number }> {
  if (enCours || !navigator.onLine) return { envoyees: 0, echecs: 0 };
  enCours = true;
  let envoyees = 0, echecs = 0;
  try {
    for (const m of await mutationsEnAttente()) {
      try {
        if (m.type === 'vente') {
          await enregistrerVente(m.entrepriseId, {
            lignes: m.payload.lignes as never,
            modePaiement: m.payload.modePaiement as string,
            clientUuid: m.clientUuid,
          });
        }
        await db.mutations.update(m.clientUuid, { synchronise: 1 });
        envoyees++;
      } catch {
        await db.mutations.update(m.clientUuid, { tentatives: m.tentatives + 1 });
        echecs++;
      }
    }
  } finally {
    enCours = false;
    if (envoyees > 0) notifier();
  }
  return { envoyees, echecs };
}

/** Installe la synchro automatique (retour de connexion + au démarrage). */
export function activerSyncAuto(): void {
  window.addEventListener('online', () => { notifier(); void synchroniser(); });
  window.addEventListener('offline', notifier);
  if (navigator.onLine) void synchroniser();
}
