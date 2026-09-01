/**
 * Détermination du régime fiscal (IGS / Réel) et du système comptable OHADA (SMT / Normal).
 * Sources : CGI 2026 Art. 93 ter-quinquies ; Acte uniforme OHADA Art. 11-13.
 * Voir docs/reference/01-regimes-imposition.md et 06-etats-financiers.md.
 */

import type { FCFA, NatureActivite, RegimeFiscal, SystemeOhada } from '@kombi/shared';
import { SEUIL_IGS_COMMERCIAL, SEUIL_IGS_LIBERAL } from './igs.js';

/** Secteurs toujours au Réel quel que soit le CA (CGI Art. 93 quater (2) b). */
export const SECTEURS_TOUJOURS_REEL = [
  'petrolier',
  'minier',
  'gazier',
  'credit',
  'microfinance',
  'assurance',
  'telephonie',
  'notaire',
  'transport_interurbain',
  'jeux',
] as const;
export type SecteurSpecial = (typeof SECTEURS_TOUJOURS_REEL)[number];

export interface EntreeRegime {
  readonly caAnnuelHT: FCFA;
  readonly natureActivite: NatureActivite;
  /** Secteur imposant le Réel sans condition de CA (optionnel). */
  readonly secteurSpecial?: SecteurSpecial | null;
  /** Régime de l'exercice précédent (pour la règle de maintien 2 ans). */
  readonly regimePrecedent?: RegimeFiscal | null;
  /** Nombre d'exercices consécutifs clôturés sous le seuil. */
  readonly ansSousSeuil?: number;
}

export function seuilIGS(nature: NatureActivite): FCFA {
  return nature === 'liberale' ? SEUIL_IGS_LIBERAL : SEUIL_IGS_COMMERCIAL;
}

/**
 * Détermine le régime fiscal applicable.
 * Règle de maintien (Art. 93 quinquies) : une entreprise passée au Réel y reste
 * pendant 2 exercices même si son CA repasse sous le seuil.
 */
export function determinerRegime(e: EntreeRegime): RegimeFiscal {
  if (e.secteurSpecial) return 'reel_normal';

  const seuil = seuilIGS(e.natureActivite);
  if (e.caAnnuelHT >= seuil) return 'reel_normal';

  // Maintien 2 ans : si on était au Réel et moins de 2 ans sous le seuil.
  if (
    (e.regimePrecedent === 'reel_normal' || e.regimePrecedent === 'reel_simplifie') &&
    (e.ansSousSeuil ?? 0) < 2
  ) {
    return e.regimePrecedent;
  }

  return 'igs';
}

/** Seuils SMT (Acte uniforme OHADA Art. 13) — CA HT en dessous duquel le SMT s'applique. */
export const SEUIL_SMT: Record<NatureActivite, FCFA> = {
  negoce: 60_000_000,
  artisanal: 40_000_000,
  service: 30_000_000,
  liberale: 30_000_000, // assimilé services
};

export interface EntreeSysteme {
  readonly caAnnuelHT: FCFA;
  readonly natureActivite: NatureActivite;
  /** Option volontaire pour le Système Normal (Art. 13). */
  readonly optionNormal?: boolean;
}

/** Détermine le système de présentation des états financiers (SMT ou Normal). */
export function determinerSystemeOhada(e: EntreeSysteme): SystemeOhada {
  if (e.optionNormal) return 'normal';
  return e.caAnnuelHT < SEUIL_SMT[e.natureActivite] ? 'smt' : 'normal';
}

export interface AlerteSeuil {
  readonly caProjete: FCFA;
  readonly franchitSeuilReel: boolean;
  readonly changeClasseIGS: boolean;
}

/**
 * Projette le CA sur l'exercice complet et signale un franchissement de seuil.
 * Projection linéaire : ca_cumule / mois_ecoules * 12 (cahier des charges §4.1).
 */
export function projeterFranchissement(
  caCumule: FCFA,
  moisEcoules: number,
  natureActivite: NatureActivite,
  classeIGSActuelle: number | null,
): AlerteSeuil {
  if (moisEcoules <= 0 || moisEcoules > 12) {
    throw new Error(`moisEcoules doit être dans [1,12], reçu ${moisEcoules}`);
  }
  const caProjete = Math.round((caCumule / moisEcoules) * 12);
  const seuil = seuilIGS(natureActivite);
  return {
    caProjete,
    franchitSeuilReel: caProjete >= seuil && caCumule < seuil,
    changeClasseIGS:
      classeIGSActuelle !== null && caProjete < seuil
        ? classeDe(caProjete) !== classeIGSActuelle
        : false,
  };
}

// évite un import circulaire lourd : recalcule juste la classe
function classeDe(ca: FCFA): number | null {
  const bornes = [
    500_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000, 5_000_000, 10_000_000, 20_000_000,
    30_000_000, 50_000_000,
  ];
  for (let i = 0; i < bornes.length; i++) {
    if (ca < bornes[i]!) return i + 1;
  }
  return null;
}
