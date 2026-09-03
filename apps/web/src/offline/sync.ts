/**
 * Rejeu des mutations hors-ligne vers l'API dès que le réseau revient.
 * Idempotence garantie par clientUuid (dédup côté API). Déclenché au démarrage, sur l'événement
 * `online`, et après chaque nouvelle mutation.
 */

import { db, mutationsEnAttente, notifierFile as notifier, type Mutation } from './db.js';
import {
  enregistrerVente, creerDepense, creerTiers, approvisionner, payerVente, payerFacture, payerAchat,
} from '../lib/api.js';

let enCours = false;

/** Rejoue une mutation vers l'API selon son type — un seul appel réseau, idempotent (clientUuid). */
async function rejouer(m: Mutation): Promise<void> {
  const p = m.payload;
  switch (m.type) {
    case 'vente':
      await enregistrerVente(m.entrepriseId, {
        lignes: p.lignes as never,
        modePaiement: (p.modePaiement as string | undefined) ?? null,
        aCredit: p.aCredit as boolean | undefined,
        tiersId: (p.tiersId as string | undefined) ?? null,
        clientUuid: m.clientUuid,
      });
      return;
    case 'depense':
      await creerDepense(m.entrepriseId, {
        categorie: p.categorie as string, libelle: p.libelle as string, montant: p.montant as number,
        modePaiement: p.modePaiement as string, recurrente: p.recurrente as boolean | undefined,
        clientUuid: m.clientUuid, dateOperation: (p.dateOperation as string | undefined) ?? null,
      });
      return;
    case 'tiers':
      await creerTiers(m.entrepriseId, {
        nom: p.nom as string, telephone: p.telephone as string | undefined, niu: p.niu as string | undefined,
        email: p.email as string | undefined, adresse: p.adresse as string | undefined,
        type: p.type as 'client' | 'fournisseur' | undefined, clientUuid: m.clientUuid,
      });
      return;
    case 'stock_entree':
      await approvisionner(m.entrepriseId, p.produitId as string, {
        quantite: p.quantite as number, coutUnitaire: p.coutUnitaire as number,
        modePaiement: (p.modePaiement as string | undefined) ?? null, aCredit: p.aCredit as boolean | undefined,
        tiersId: (p.tiersId as string | undefined) ?? null, tauxTva: p.tauxTva as number | undefined,
        clientUuid: m.clientUuid, dateOperation: (p.dateOperation as string | undefined) ?? null,
      });
      return;
    case 'paiement_vente':
      await payerVente(m.entrepriseId, p.venteId as string, {
        montant: p.montant as number, modePaiement: p.modePaiement as string, clientUuid: m.clientUuid,
      });
      return;
    case 'paiement_facture':
      await payerFacture(m.entrepriseId, p.factureId as string, {
        montant: p.montant as number, modePaiement: p.modePaiement as string, clientUuid: m.clientUuid,
      });
      return;
    case 'paiement_achat':
      await payerAchat(m.entrepriseId, p.achatId as string, {
        montant: p.montant as number, modePaiement: p.modePaiement as string, clientUuid: m.clientUuid,
      });
      return;
  }
}

export async function synchroniser(): Promise<{ envoyees: number; echecs: number }> {
  if (enCours || !navigator.onLine) return { envoyees: 0, echecs: 0 };
  enCours = true;
  let envoyees = 0, echecs = 0;
  try {
    for (const m of await mutationsEnAttente()) {
      try {
        await rejouer(m);
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
