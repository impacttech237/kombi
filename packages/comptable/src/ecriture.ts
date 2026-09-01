/**
 * Génération d'écritures en partie double à partir d'une saisie simplifiée.
 * L'utilisateur voit « recette / dépense » ; le moteur produit une vraie écriture équilibrée.
 * Voir docs/reference/05-plan-comptable-ohada.md.
 */

import type { FCFA, ModePaiement } from '@kombi/shared';
import { COMPTE_TRESORERIE_PAR_MODE } from './plan-comptable.js';

export interface LigneEcriture {
  readonly compteNumero: string;
  readonly sens: 'debit' | 'credit';
  readonly montant: FCFA;
}

export interface EcritureGeneree {
  readonly libelle: string;
  readonly lignes: readonly LigneEcriture[];
}

export interface SaisieRecette {
  readonly montantHT: FCFA;
  readonly tva?: FCFA; // 0 si non assujetti
  readonly modePaiement: ModePaiement;
  readonly compteProduit: string; // ex '701'
  readonly libelle: string;
}

export interface SaisieDepense {
  readonly montantHT: FCFA;
  readonly tvaRecuperable?: FCFA;
  readonly modePaiement: ModePaiement;
  readonly compteCharge: string; // ex '601'
  readonly libelle: string;
}

function compteTresorerie(mode: ModePaiement): string {
  const c = COMPTE_TRESORERIE_PAR_MODE[mode];
  if (!c) throw new Error(`Mode de paiement inconnu: ${mode}`);
  return c;
}

/** Recette encaissée : débit trésorerie / crédit produit (+ TVA collectée 4431). */
export function genererRecette(s: SaisieRecette): EcritureGeneree {
  const tva = s.tva ?? 0;
  const ttc = s.montantHT + tva;
  const lignes: LigneEcriture[] = [
    { compteNumero: compteTresorerie(s.modePaiement), sens: 'debit', montant: ttc },
    { compteNumero: s.compteProduit, sens: 'credit', montant: s.montantHT },
  ];
  if (tva > 0) lignes.push({ compteNumero: '4431', sens: 'credit', montant: tva });
  return { libelle: s.libelle, lignes };
}

/** Dépense réglée : débit charge (+ TVA récupérable 4452) / crédit trésorerie. */
export function genererDepense(s: SaisieDepense): EcritureGeneree {
  const tva = s.tvaRecuperable ?? 0;
  const ttc = s.montantHT + tva;
  const lignes: LigneEcriture[] = [
    { compteNumero: s.compteCharge, sens: 'debit', montant: s.montantHT },
  ];
  if (tva > 0) lignes.push({ compteNumero: '4452', sens: 'debit', montant: tva });
  lignes.push({ compteNumero: compteTresorerie(s.modePaiement), sens: 'credit', montant: ttc });
  return { libelle: s.libelle, lignes };
}

/** Vérifie qu'une écriture est équilibrée (débit = crédit). Invariant comptable. */
export function estEquilibree(e: EcritureGeneree): boolean {
  let debit = 0;
  let credit = 0;
  for (const l of e.lignes) {
    if (l.sens === 'debit') debit += l.montant;
    else credit += l.montant;
  }
  return debit === credit && debit > 0;
}
