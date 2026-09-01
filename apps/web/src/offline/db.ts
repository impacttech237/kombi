/**
 * File de mutations hors-ligne (IndexedDB via Dexie).
 * Contrainte critique CEMAC : la saisie doit fonctionner sans réseau, puis se synchroniser.
 *
 * Principe : chaque saisie génère une mutation avec un `clientUuid` (idempotence). Les mutations
 * sont rejouées vers l'API à la reconnexion ; l'API déduplique sur (entreprise_id, client_uuid).
 */

import Dexie, { type Table } from 'dexie';

export type TypeMutation = 'creer_ecriture' | 'creer_facture' | 'creer_tiers';

export interface Mutation {
  clientUuid: string; // clé d'idempotence, générée hors-ligne
  entrepriseId: string;
  type: TypeMutation;
  payload: unknown;
  creeLe: number; // timestamp local
  synchronise: 0 | 1;
  tentatives: number;
}

class ComptaDB extends Dexie {
  mutations!: Table<Mutation, string>;

  constructor() {
    super('compta-cemac');
    this.version(1).stores({
      // clé primaire clientUuid ; index sur synchronise pour retrouver la file en attente
      mutations: 'clientUuid, entrepriseId, synchronise, creeLe',
    });
  }
}

export const db = new ComptaDB();

export function nouvelUuid(): string {
  return crypto.randomUUID();
}

/** Enregistre une mutation localement (retournera immédiatement, même hors-ligne). */
export async function enfilerMutation(
  m: Omit<Mutation, 'clientUuid' | 'creeLe' | 'synchronise' | 'tentatives'> & {
    clientUuid?: string;
  },
): Promise<string> {
  const clientUuid = m.clientUuid ?? nouvelUuid();
  await db.mutations.put({
    clientUuid,
    entrepriseId: m.entrepriseId,
    type: m.type,
    payload: m.payload,
    creeLe: Date.now(),
    synchronise: 0,
    tentatives: 0,
  });
  return clientUuid;
}

export function mutationsEnAttente(): Promise<Mutation[]> {
  return db.mutations.where('synchronise').equals(0).sortBy('creeLe');
}
