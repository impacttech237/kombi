/**
 * Impôt Général Synthétique (IGS).
 * Source : CGI 2026, Art. C 40 à C 43. Voir docs/reference/02-igs.md.
 *
 * ⚠️ Fonctionnalité gratuite phare — barème codé EXACTEMENT.
 * À faire valider par l'expert-comptable ONECCA avant mise en production.
 */

import { arrondirFCFA, type FCFA } from '@kombi/shared';

/** Seuil de sortie de l'IGS (CA HT). Au-delà : régime du Réel. */
export const SEUIL_IGS_COMMERCIAL: FCFA = 50_000_000; // Art. 93 quater a
export const SEUIL_IGS_LIBERAL: FCFA = 30_000_000; // Art. 93 quater b

/** Taux des Centimes Additionnels Communaux appliqué à l'impôt. */
export const TAUX_CAC = 0.1; // +10 %

export interface TrancheIGS {
  readonly classe: number;
  /** Borne basse INCLUSIVE (FCFA). */
  readonly min: FCFA;
  /** Borne haute EXCLUSIVE (FCFA), null = pas de plafond dans la tranche. */
  readonly max: FCFA | null;
  /** Tarif annuel de base avant CGA et CAC (FCFA). */
  readonly tarif: FCFA;
}

/** Barème officiel IGS — CGI 2026, Art. C 40 (1). 10 classes. */
export const BAREME_IGS: readonly TrancheIGS[] = [
  { classe: 1, min: 0, max: 500_000, tarif: 20_000 },
  { classe: 2, min: 500_000, max: 1_000_000, tarif: 30_000 },
  { classe: 3, min: 1_000_000, max: 1_500_000, tarif: 40_000 },
  { classe: 4, min: 1_500_000, max: 2_000_000, tarif: 50_000 },
  { classe: 5, min: 2_000_000, max: 2_500_000, tarif: 60_000 },
  { classe: 6, min: 2_500_000, max: 5_000_000, tarif: 150_000 },
  { classe: 7, min: 5_000_000, max: 10_000_000, tarif: 300_000 },
  { classe: 8, min: 10_000_000, max: 20_000_000, tarif: 500_000 },
  { classe: 9, min: 20_000_000, max: 30_000_000, tarif: 1_000_000 },
  { classe: 10, min: 30_000_000, max: 50_000_000, tarif: 2_000_000 },
] as const;

export interface OptionsIGS {
  /** Adhérent d'un Centre de Gestion Agréé + tient une comptabilité → tarif ÷ 2 (Art. C 40 (2)). */
  readonly adherentCGA?: boolean;
}

export interface ResultatIGS {
  readonly classe: number;
  /** Tarif de barème avant réductions (FCFA). */
  readonly tarifBase: FCFA;
  /** Tarif après abattement CGA éventuel (FCFA). */
  readonly apresCGA: FCFA;
  /** Montant des CAC (FCFA). */
  readonly cac: FCFA;
  /** IGS annuel dû, tout compris (FCFA). */
  readonly igsAnnuel: FCFA;
  /** IGS trimestriel (option paiement trimestriel) = igsAnnuel / 4. */
  readonly igsTrimestriel: FCFA;
}

/** Trouve la tranche du barème pour un CA donné (null si hors IGS). */
export function trancheIGS(caAnnuelHT: FCFA): TrancheIGS | null {
  if (!Number.isFinite(caAnnuelHT) || caAnnuelHT < 0) {
    throw new Error(`CA invalide: ${caAnnuelHT}`);
  }
  return (
    BAREME_IGS.find(
      (t) => caAnnuelHT >= t.min && (t.max === null || caAnnuelHT < t.max),
    ) ?? null
  );
}

/**
 * Calcule l'IGS dû.
 * @returns null si le CA est hors champ IGS (>= 50 000 000) → relève du Réel.
 */
export function calculerIGS(caAnnuelHT: FCFA, options: OptionsIGS = {}): ResultatIGS | null {
  const tranche = trancheIGS(caAnnuelHT);
  if (tranche === null) return null;

  const tarifBase = tranche.tarif;
  const apresCGA = options.adherentCGA ? arrondirFCFA(tarifBase / 2) : tarifBase;
  const cac = arrondirFCFA(apresCGA * TAUX_CAC);
  const igsAnnuel = apresCGA + cac;

  return {
    classe: tranche.classe,
    tarifBase,
    apresCGA,
    cac,
    igsAnnuel,
    igsTrimestriel: arrondirFCFA(igsAnnuel / 4),
  };
}
