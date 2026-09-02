/**
 * Schémas Zod partagés pour les champs sensibles (montants, taux, dates) — voir docs/parcours.md,
 * backlog sécurité P0 #5 : « validation Zod (montants/taux/dates) » sur les entrées API.
 */
import { z } from 'zod';
import { MODE_PAIEMENT } from './enums.js';

/** Montant en FCFA (entier, positif). Les montants FCFA n'ont pas de décimales. */
export const zMontantPositif = z.coerce.number().int().positive();
/** Montant en FCFA pouvant être nul (ex. prix d'appel, coût initial). */
export const zMontantPositifOuNul = z.coerce.number().int().min(0);

/** Taux de TVA exprimé en fraction (0.1925 = 19,25 %), jamais négatif ni > 100 %. */
export const zTauxTva = z.coerce.number().min(0).max(1);

/** Date calendaire ISO stricte (YYYY-MM-DD) — rejette les horodatages et formats ambigus. */
export const zDateISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ attendu)');

export const zModePaiement = z.enum(MODE_PAIEMENT);

export const zLigneMontant = z.object({
  designation: z.string().trim().min(1).max(120).default('Article'),
  quantite: z.coerce.number().int().positive().default(1),
  prixUnitaire: zMontantPositifOuNul,
  tauxTva: zTauxTva.optional().default(0),
  produitId: z.string().nullish(),
});
export type LigneMontant = z.infer<typeof zLigneMontant>;

/** Formate les erreurs Zod en un message unique lisible pour l'utilisateur final. */
export function messageErreurZod(erreur: z.ZodError): string {
  return erreur.issues.map((i) => `${i.path.join('.') || 'valeur'} : ${i.message}`).join(' · ');
}
