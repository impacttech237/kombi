/**
 * Création d'une entreprise :
 *  1) control plane (D1) : ligne entreprise + membre (admin) — atomique.
 *  2) données métier : initialisation du Durable Object de l'entreprise (modules du secteur,
 *     plan comptable OHADA, exercice) — fait par la route via stubEntreprise().initialiser().
 */

import type { Secteur } from '@kombi/shared';

export interface CreationEntreprise {
  raisonSociale: string;
  secteur: Secteur;
  natureActivite: 'negoce' | 'artisanal' | 'service' | 'liberale';
  niu?: string;
  utilisateurId: string;
  annee: number;
}

const uid = () => crypto.randomUUID();

/** Statements D1 (control plane) pour enregistrer l'entreprise et son membre admin. */
export function planCreationEntreprise(db: D1Database, e: CreationEntreprise) {
  const entrepriseId = uid();
  // Essai gratuit de 30 jours à la création (spec §7) — pas de paiement automatisé au MVP,
  // une mise à niveau se fait manuellement (staff) tant que le paiement en ligne n'existe pas.
  const finEssai = new Date(Date.now() + 30 * 24 * 3_600_000).toISOString().slice(0, 10);
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO entreprise (id, raison_sociale, niu, secteur, nature_activite)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(entrepriseId, e.raisonSociale, e.niu ?? null, e.secteur, e.natureActivite),
    db
      .prepare(
        `INSERT INTO membre_entreprise (id, utilisateur_id, entreprise_id, role)
         VALUES (?, ?, ?, 'admin')`,
      )
      .bind(uid(), e.utilisateurId, entrepriseId),
    db
      .prepare(
        `INSERT INTO abonnement (id, entreprise_id, plan_code, statut, essai_fin)
         VALUES (?, ?, 'gratuit', 'essai', ?)`,
      )
      .bind(uid(), entrepriseId, finEssai),
  ];
  return { entrepriseId, stmts };
}
