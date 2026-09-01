/**
 * Création d'une entreprise avec application du preset sectoriel :
 * insère l'entreprise, ses lignes module_entreprise (cœur + optionnels du secteur),
 * le plan comptable OHADA par défaut, et l'exercice courant.
 */

import {
  CODES_MODULE,
  MODULES,
  modulesActifsPourSecteur,
  type CodeModule,
  type Secteur,
} from '@kombi/shared';
import { PLAN_COMPTABLE_DEFAUT } from '@kombi/comptable';

export interface CreationEntreprise {
  raisonSociale: string;
  secteur: Secteur;
  natureActivite: 'negoce' | 'artisanal' | 'service' | 'liberale';
  niu?: string;
  utilisateurId: string;
  annee: number; // exercice courant (fourni par l'appelant — pas de Date() ici)
}

const uid = () => crypto.randomUUID();

/** Construit les instructions D1 (batch atomique) pour créer une entreprise configurée. */
export function planCreationEntreprise(db: D1Database, e: CreationEntreprise) {
  const entrepriseId = uid();
  const exerciceId = uid();
  const actifs = new Set<CodeModule>(modulesActifsPourSecteur(e.secteur));

  const stmts: D1PreparedStatement[] = [];

  stmts.push(
    db
      .prepare(
        `INSERT INTO entreprise (id, raison_sociale, niu, secteur, nature_activite)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(entrepriseId, e.raisonSociale, e.niu ?? null, e.secteur, e.natureActivite),
  );

  stmts.push(
    db
      .prepare(
        `INSERT INTO membre_entreprise (id, utilisateur_id, entreprise_id, role)
         VALUES (?, ?, ?, 'admin')`,
      )
      .bind(uid(), e.utilisateurId, entrepriseId),
  );

  stmts.push(
    db
      .prepare(
        `INSERT INTO exercice (id, entreprise_id, annee, date_debut, date_fin)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(exerciceId, entrepriseId, e.annee, `${e.annee}-01-01`, `${e.annee}-12-31`),
  );

  // Une ligne module_entreprise par module connu : actif si cœur ou dans le preset secteur.
  for (const code of CODES_MODULE) {
    const actif = MODULES[code].coeur || actifs.has(code) ? 1 : 0;
    stmts.push(
      db
        .prepare(
          `INSERT INTO module_entreprise (entreprise_id, code_module, actif) VALUES (?, ?, ?)`,
        )
        .bind(entrepriseId, code, actif),
    );
  }

  // Plan comptable OHADA par défaut.
  for (const c of PLAN_COMPTABLE_DEFAUT) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO compte_comptable (id, entreprise_id, numero, libelle, classe, type)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(uid(), entrepriseId, c.numero, c.libelle, c.classe, c.type),
    );
  }

  return { entrepriseId, exerciceId, stmts };
}
