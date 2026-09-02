/**
 * Système de configuration par secteur — produit modulaire, pas produit unique.
 *
 * 3 niveaux (voir mémo de cadrage) :
 *  ① MODULES        — registre de ce qui EXISTE (typé, en code)
 *  ② PROFILS_SECTEUR — presets secteur → modules activés (en code)
 *  ③ module_entreprise (table D1) — ce qui est RÉELLEMENT activé pour une entreprise
 *
 * Ajouter un module futur (ex. 'projets', 'actifs') = 1 entrée MODULES + mapping dans
 * PROFILS_SECTEUR. Aucune modification du cœur, aucune migration lourde.
 */

export const CODES_MODULE = [
  'ventes', // caisse / encaissement — cœur
  'tiers', // clients & fournisseurs — cœur
  'facturation', // devis & factures — cœur
  'commandes', // commandes / missions — cœur (libellé adaptatif)
  'comptabilite', // couche invisible — cœur, toujours actif
  'fiscalite', // IGS / régimes — cœur, toujours actif
  'stock', // optionnel — produits, mouvements, alertes
  'achats', // optionnel — achats fournisseurs (dépend de stock)
  'depenses', // cœur — charges courantes (loyer, eau, élec, transport, salaires…)
] as const;
export type CodeModule = (typeof CODES_MODULE)[number];

export interface DefinitionModule {
  readonly code: CodeModule;
  readonly nom: string;
  /** Cœur = toujours actif, non désactivable. */
  readonly coeur: boolean;
  /** Modules requis pour que celui-ci fonctionne. */
  readonly dependances: readonly CodeModule[];
}

export const MODULES: Record<CodeModule, DefinitionModule> = {
  ventes: { code: 'ventes', nom: 'Ventes & caisse', coeur: true, dependances: [] },
  tiers: { code: 'tiers', nom: 'Clients & fournisseurs', coeur: true, dependances: [] },
  facturation: { code: 'facturation', nom: 'Facturation & devis', coeur: true, dependances: ['tiers'] },
  commandes: { code: 'commandes', nom: 'Commandes / missions', coeur: true, dependances: ['tiers'] },
  comptabilite: { code: 'comptabilite', nom: 'Comptabilité', coeur: true, dependances: [] },
  fiscalite: { code: 'fiscalite', nom: 'Fiscalité', coeur: true, dependances: ['comptabilite'] },
  stock: { code: 'stock', nom: 'Stock', coeur: false, dependances: [] },
  achats: { code: 'achats', nom: 'Achats fournisseurs', coeur: false, dependances: ['stock', 'tiers'] },
  depenses: { code: 'depenses', nom: 'Dépenses', coeur: true, dependances: [] },
};

export const SECTEURS = ['commerce', 'service', 'mixte'] as const;
export type Secteur = (typeof SECTEURS)[number];

/** Modules OPTIONNELS activés par défaut selon le secteur (les modules cœur sont toujours actifs). */
export const PROFILS_SECTEUR: Record<Secteur, readonly CodeModule[]> = {
  commerce: ['stock', 'achats'],
  service: [], // pas de stock
  mixte: ['stock', 'achats'],
};

/** Vocabulaire adaptatif par secteur (le module `commandes` change de libellé). */
export interface Terminologie {
  readonly commande: string; // singulier
  readonly commandes: string; // pluriel
  readonly article: string; // « produit » vs « prestation »
}

export const TERMINOLOGIE: Record<Secteur, Terminologie> = {
  commerce: { commande: 'commande', commandes: 'commandes', article: 'produit' },
  service: { commande: 'mission', commandes: 'missions', article: 'prestation' },
  mixte: { commande: 'commande', commandes: 'commandes', article: 'produit' },
};

/** Calcule l'ensemble des modules actifs pour un secteur donné (cœur + optionnels du preset). */
export function modulesActifsPourSecteur(secteur: Secteur): CodeModule[] {
  const coeur = CODES_MODULE.filter((c) => MODULES[c].coeur);
  const optionnels = PROFILS_SECTEUR[secteur];
  return [...new Set([...coeur, ...optionnels])];
}

/** Vérifie qu'une activation respecte les dépendances (ex. achats requiert stock). */
export function dependancesSatisfaites(actifs: readonly CodeModule[]): boolean {
  const set = new Set(actifs);
  return actifs.every((c) => MODULES[c].dependances.every((d) => set.has(d)));
}
