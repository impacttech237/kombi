/**
 * File de mutations hors-ligne (IndexedDB via Dexie).
 * Contrainte critique CEMAC : la saisie doit fonctionner sans réseau, puis se synchroniser.
 *
 * Chaque mutation porte un `clientUuid` (idempotence). Rejouée à la reconnexion ; l'API
 * déduplique sur (entreprise_id, client_uuid) → aucun doublon même si rejouée plusieurs fois.
 */

import Dexie, { type Table } from 'dexie';

/**
 * Types de mutations pouvant être créées hors-ligne (spec §5.2, Phase P1 : dépense, encaissement,
 * tiers, produit — en plus de la vente, déjà offline depuis l'origine).
 */
export type TypeMutation =
  | 'vente' | 'depense' | 'tiers' | 'stock_entree'
  | 'paiement_vente' | 'paiement_facture' | 'paiement_achat';

export interface Mutation {
  clientUuid: string;
  entrepriseId: string;
  type: TypeMutation;
  payload: Record<string, unknown>;
  creeLe: number;
  synchronise: 0 | 1;
  tentatives: number;
}

class KombiDB extends Dexie {
  mutations!: Table<Mutation, string>;
  constructor() {
    super('kombi');
    this.version(1).stores({
      mutations: 'clientUuid, entrepriseId, synchronise, creeLe',
    });
  }
}

export const db = new KombiDB();
export const nouvelUuid = () => crypto.randomUUID();

// Pub/sub pour rafraîchir l'indicateur « N en attente ».
const abonnes = new Set<() => void>();
export function onFileChange(cb: () => void): () => void { abonnes.add(cb); return () => abonnes.delete(cb); }
export function notifierFile(): void { for (const cb of abonnes) cb(); }

/** Enregistre une mutation localement (retourne immédiatement, même hors-ligne). */
export async function enfilerMutation(m: {
  clientUuid: string; entrepriseId: string; type: TypeMutation; payload: Record<string, unknown>;
}): Promise<void> {
  await db.mutations.put({
    ...m, creeLe: Date.now(), synchronise: 0, tentatives: 0,
  });
  notifierFile();
}

export function mutationsEnAttente(entrepriseId?: string): Promise<Mutation[]> {
  const q = db.mutations.where('synchronise').equals(0);
  return entrepriseId
    ? q.and((x) => x.entrepriseId === entrepriseId).sortBy('creeLe')
    : q.sortBy('creeLe');
}

export function compterEnAttente(): Promise<number> {
  return db.mutations.where('synchronise').equals(0).count();
}
