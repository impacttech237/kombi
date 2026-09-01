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
  ];
  return { entrepriseId, stmts };
}
