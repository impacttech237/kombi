const BASE = import.meta.env.VITE_API_URL ?? '';

/** Appel API authentifié (cookies inclus) + en-tête d'entreprise active. */
export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; entrepriseId?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.entrepriseId) headers['x-entreprise-id'] = opts.entrepriseId;

  const res = await fetch(BASE + path, {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { erreur?: string };
    throw new Error(err.erreur ?? `Erreur ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface EntrepriseResume {
  id: string;
  raison_sociale: string;
  niu: string | null;
  secteur: string;
  regime_fiscal: string;
  assujetti_tva: number;
  role: string;
}

export const listerEntreprises = () =>
  api<{ entreprises: EntrepriseResume[] }>('/api/entreprises').then((r) => r.entreprises);

export const creerEntreprise = (data: {
  raisonSociale: string; secteur: string; natureActivite: string; niu?: string;
}) => api<{ entrepriseId: string }>('/api/entreprises', { method: 'POST', body: data });

// ── Paramètres entreprise (fiscal) ──
export interface ParametresEntreprise {
  raison_sociale: string; niu: string | null; secteur: string; nature_activite: string;
  regime_fiscal: string; adherent_cga: number; assujetti_tva: number; note_facture: string | null;
  en_tete_facture: string | null; couleur_facture: string | null;
}
export const getParametresEntreprise = (entrepriseId: string) =>
  api<ParametresEntreprise>(`/api/entreprises/${entrepriseId}/parametres`);
export const majParametresEntreprise = (
  entrepriseId: string,
  data: { niu?: string | null; adherentCga?: boolean; assujettiTva?: boolean; noteFacture?: string | null; enTeteFacture?: string | null; couleurFacture?: string },
) => api<{ ok: boolean }>(`/api/entreprises/${entrepriseId}`, { method: 'PATCH', body: data });

// ── Équipe (membres & rôles) ──
export interface Membre { id: string; nom: string; email: string; role: string; }
export const listerMembres = (entrepriseId: string) =>
  api<{ membres: Membre[] }>(`/api/entreprises/${entrepriseId}/membres`).then((r) => r.membres);
export const ajouterMembre = (entrepriseId: string, data: { email: string; role: string }) =>
  api<{ ok: boolean }>(`/api/entreprises/${entrepriseId}/membres`, { method: 'POST', body: data });
export const changerRoleMembre = (entrepriseId: string, membreId: string, role: string) =>
  api<{ ok: boolean }>(`/api/entreprises/${entrepriseId}/membres/${membreId}/role`, { method: 'POST', body: { role } });
export const retirerMembre = (entrepriseId: string, membreId: string) =>
  api<{ ok: boolean }>(`/api/entreprises/${entrepriseId}/membres/${membreId}`, { method: 'DELETE' });

export interface LigneCaisse {
  designation: string; quantite: number; prixUnitaire: number; produitId?: string; tauxTva?: number;
}

export const enregistrerVente = (
  entrepriseId: string,
  data: {
    lignes: LigneCaisse[]; modePaiement?: string | null; aCredit?: boolean;
    tiersId?: string | null; clientUuid: string; dateEcheance?: string | null;
  },
) => api<{ venteId: string; totalTtc: number; enSurvente: boolean }>('/api/ventes', { method: 'POST', body: data, entrepriseId });

export const payerVente = (
  entrepriseId: string, venteId: string, data: { montant: number; modePaiement: string; clientUuid?: string },
) => api<{ statut: string; regle: number }>(`/api/ventes/${venteId}/payer`, { method: 'POST', body: data, entrepriseId });

export interface VenteACredit {
  id: string; date: string; total_ttc: number; statut: string; tiers_nom: string | null; regle: number;
  date_echeance: string | null; enRetard: boolean; piece_cle: string | null;
}
export const listerVentesACredit = (entrepriseId: string) =>
  api<{ ventes: VenteACredit[] }>('/api/ventes/credit', { entrepriseId }).then((r) => r.ventes);

export interface VenteRecente {
  id: string; date: string; total_ttc: number; statut: string; mode_paiement: string | null;
  facture_id: string | null; tiers_nom: string | null;
}
export const listerVentesRecentes = (entrepriseId: string) =>
  api<{ ventes: VenteRecente[] }>('/api/ventes/recentes', { entrepriseId }).then((r) => r.ventes);

export const annulerVente = (entrepriseId: string, venteId: string) =>
  api<{ statut: string }>(`/api/ventes/${venteId}/annuler`, { method: 'POST', entrepriseId });

/** Facture-document pour une vente déjà réglée (réutilise son écriture, pas de double comptage). */
export const creerFactureDepuisVente = (entrepriseId: string, venteId: string) =>
  api<{ factureId: string; numero: string }>(`/api/factures/depuis-vente/${venteId}`, { method: 'POST', entrepriseId });

export const statsJour = (entrepriseId: string) =>
  api<{ nbVentes: number; totalJour: number }>('/api/ventes/jour', { entrepriseId });

export const tendance7Jours = (entrepriseId: string) =>
  api<{ tendance: { jour: string; total: number }[] }>('/api/ventes/tendance', { entrepriseId }).then((r) => r.tendance);

export const margeCumulee = (entrepriseId: string) =>
  api<{ marge: number }>('/api/ventes/marge', { entrepriseId }).then((r) => r.marge);

export interface MeilleureVente { designation: string; quantite: number; montant_ht: number; }
export const meilleuresVentes = (entrepriseId: string) =>
  api<{ top: MeilleureVente[] }>('/api/ventes/top', { entrepriseId }).then((r) => r.top);

export const depensesDuJour = (entrepriseId: string) =>
  api<{ total: number }>('/api/depenses/jour', { entrepriseId }).then((r) => r.total);

export interface TresorerieJour { especes: number; mtnMomo: number; orangeMoney: number; banque: number; }
export const tresorerieDuJour = (entrepriseId: string) =>
  api<TresorerieJour>('/api/etats/tresorerie-jour', { entrepriseId });
/** Soldes réels (cumul depuis l'ouverture de l'exercice, pas seulement le jour). */
export const soldesTresorerie = (entrepriseId: string) =>
  api<TresorerieJour>('/api/etats/tresorerie-solde', { entrepriseId });

export interface MouvementTresorerie {
  id: string; date: string; libelle: string; source: string; compte_numero: string; montant_net: number;
}
export const listerMouvementsTresorerie = (entrepriseId: string) =>
  api<{ mouvements: MouvementTresorerie[] }>('/api/etats/tresorerie-mouvements', { entrepriseId }).then((r) => r.mouvements);

// ── Cockpit dirigeant (voir docs/PLAN-cockpit-dirigeant.md) ──
export interface AlertePilotage { type: string; gravite: 'attention' | 'critique'; libelle: string; }
export interface StatsPeriode { ca: number; cogs: number; marge: number; depenses: number; resultat: number; }
export interface ComparaisonMensuelle {
  moisCourant: StatsPeriode; moisPrecedent: StatsPeriode;
  variationCaPct: number | null; variationMargePct: number | null; variationDepensesPct: number | null;
  topVariationsDepenses: { categorie: string; libelle: string; moisCourant: number; moisPrecedent: number; deltaMontant: number }[];
}
export interface Cockpit {
  tresorerie: TresorerieJour;
  margeCumulee: number;
  comparaisonMensuelle: ComparaisonMensuelle;
  alertes: AlertePilotage[];
  topProduits: { designation: string; quantite: number; ca_ht: number; cogs: number; marge: number; margePct: number | null }[];
  delaiMoyenPaiement: { jours: number | null; echantillon: number };
}
export const getCockpit = (entrepriseId: string) => api<Cockpit>('/api/pilotage/cockpit', { entrepriseId });

export interface MargeProduit {
  designation: string; quantite: number; ca_ht: number; cogs: number; marge: number; margePct: number | null;
}
export const listerMargeProduits = (entrepriseId: string) =>
  api<{ produits: MargeProduit[] }>('/api/pilotage/marge-produits', { entrepriseId }).then((r) => r.produits);

export interface MargeClient {
  tiers_id: string | null; nom: string; nb_ventes: number; ca_ht: number; cogs: number; marge: number; margePct: number | null;
}
export const listerMargeClients = (entrepriseId: string) =>
  api<{ clients: MargeClient[] }>('/api/pilotage/marge-clients', { entrepriseId }).then((r) => r.clients);

// ── Budgets & prévisions ──
export interface Budget {
  annee_mois: string; ca_cible: number | null; plafond_depenses: number | null;
  marge_cible_pct: number | null; cree_par: string | null; updated_at: string;
}
export const getBudget = (entrepriseId: string, anneeMois: string) =>
  api<{ budget: Budget | null }>(`/api/budgets/${anneeMois}`, { entrepriseId }).then((r) => r.budget);
export const listerBudgets = (entrepriseId: string) =>
  api<{ budgets: Budget[] }>('/api/budgets', { entrepriseId }).then((r) => r.budgets);
export const definirBudget = (
  entrepriseId: string, anneeMois: string,
  data: { caCible?: number | null; plafondDepenses?: number | null; margeCiblePct?: number | null },
) => api<{ ok: boolean }>(`/api/budgets/${anneeMois}`, { method: 'PUT', body: data, entrepriseId });

export interface PrevisionTresorerie {
  soldeActuel: number; entreesAttendues: number; sortiesAttendues: number; soldeProjete: number; horizonJours: number;
}
export const previsionTresorerie = (entrepriseId: string, horizon: 30 | 60 | 90) =>
  api<PrevisionTresorerie>(`/api/budgets/previsions?horizon=${horizon}`, { entrepriseId });

export interface SeuilRentabilite {
  margeSurCoutsVariablesPct: number | null; chargesFixesMensuelles: number; seuilCaMensuel: number | null;
}
export const seuilRentabilite = (entrepriseId: string) =>
  api<SeuilRentabilite>('/api/budgets/seuil-rentabilite', { entrepriseId });

export const simulerBaisseVentes = (entrepriseId: string, pct: number) =>
  api<{ caActuel: number; caProjete: number; margeActuelle: number; margeProjetee: number; impactMarge: number }>(
    `/api/budgets/simulation?type=baisse_ventes&pct=${pct}`, { entrepriseId },
  );
export const simulerRecrutement = (entrepriseId: string, coutMensuel: number) =>
  api<{ margeActuelle: number; coutMensuel: number; margeProjetee: number; impactMarge: number }>(
    `/api/budgets/simulation?type=recrutement_investissement&coutMensuel=${coutMensuel}`, { entrepriseId },
  );

// ── Rapports & Analyses ──
export type TypeRapport = 'mensuel' | 'trimestriel' | 'annuel' | 'comparaison' | 'personnalise';
export interface RapportPeriode { debut: string; fin: string; }
export interface RapportStats { ca: number; cogs: number; marge: number; depenses: number; resultat: number; }
export interface Rapport {
  type: string; periode: RapportPeriode; stats: RapportStats;
  depenses: AnalyseDepenses;
  produits: MargeProduit[]; clients: MargeClient[];
  tresorerie: TresorerieJour;
  delaiMoyenPaiement: { jours: number | null; echantillon: number };
  comparaison: { periode: RapportPeriode; stats: RapportStats; variationCaPct: number | null; variationMargePct: number | null; variationDepensesPct: number | null } | null;
}
export interface ParamsRapport {
  type: TypeRapport; debut: string; fin: string; debutComparaison?: string; finComparaison?: string; agence?: string;
}

function qsRapport(p: ParamsRapport): string {
  const q = new URLSearchParams({ type: p.type, debut: p.debut, fin: p.fin });
  if (p.debutComparaison) q.set('debutComparaison', p.debutComparaison);
  if (p.finComparaison) q.set('finComparaison', p.finComparaison);
  if (p.agence) q.set('agence', p.agence);
  return q.toString();
}
export const getRapport = (entrepriseId: string, p: ParamsRapport) =>
  api<Rapport>(`/api/rapports?${qsRapport(p)}`, { entrepriseId });

async function blobRapport(entrepriseId: string, p: ParamsRapport, format: 'pdf' | 'csv'): Promise<Blob> {
  const BASE = import.meta.env.VITE_API_URL ?? '';
  const res = await fetch(`${BASE}/api/rapports/${format}?${qsRapport(p)}`, {
    headers: { 'x-entreprise-id': entrepriseId },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Export indisponible');
  return res.blob();
}
export async function urlRapportPdf(entrepriseId: string, p: ParamsRapport): Promise<string> {
  return URL.createObjectURL(await blobRapport(entrepriseId, p, 'pdf'));
}
export async function telechargerRapportCsv(entrepriseId: string, p: ParamsRapport): Promise<void> {
  const blob = await blobRapport(entrepriseId, p, 'csv');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `rapport-${p.type}-${p.debut}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ── À décider ──
export interface Decision {
  probleme: string; impactFinancier: number; cause: string; urgence: 'faible' | 'moyenne' | 'haute';
  actionSuggeree: string; actionCible: { page: string };
}
export const listerDecisions = (entrepriseId: string) =>
  api<{ problemes: Decision[] }>('/api/decisions', { entrepriseId }).then((r) => r.problemes);

// ── Fiabilité des données (D18) : rapprochement de trésorerie, clôture mensuelle ──
export interface Pointage { id: string; compte: string; date: string; solde_declare: number; solde_calcule: number; ecart: number; }
export const listerPointages = (entrepriseId: string) =>
  api<{ pointages: Pointage[] }>('/api/etats/pointages', { entrepriseId }).then((r) => r.pointages);
export const enregistrerPointage = (
  entrepriseId: string, compte: 'especes' | 'mtnMomo' | 'orangeMoney' | 'banque', soldeDeclare: number,
) => api<{ id: string; soldeCalcule: number; ecart: number }>('/api/etats/pointages', { method: 'POST', body: { compte, soldeDeclare }, entrepriseId });

export interface ClotureMensuelle { annee_mois: string; cloture_le: string; cloture_par: string | null; }
export const listerClotures = (entrepriseId: string) =>
  api<{ clotures: ClotureMensuelle[] }>('/api/etats/clotures', { entrepriseId }).then((r) => r.clotures);
export const cloturerMois = (entrepriseId: string, anneeMois: string) =>
  api<{ ok: boolean }>('/api/etats/clotures', { method: 'POST', body: { anneeMois }, entrepriseId });
export const rouvrirMois = (entrepriseId: string, anneeMois: string) =>
  api<{ ok: boolean }>(`/api/etats/clotures/${anneeMois}`, { method: 'DELETE', entrepriseId });

export interface NotificationActive { type: string; gravite: 'attention' | 'critique'; libelle: string; }
export const listerNotifications = (entrepriseId: string) =>
  api<{ notifications: NotificationActive[] }>('/api/notifications', { entrepriseId }).then((r) => r.notifications);

export interface Produit {
  id: string; nom: string; sku: string | null; unite: string;
  prix_vente: number; cout_moyen_pondere: number; stock_actuel: number;
  seuil_alerte: number; en_alerte: number; en_rupture: number;
}

export const listerProduits = (entrepriseId: string) =>
  api<{ produits: Produit[] }>('/api/produits', { entrepriseId }).then((r) => r.produits);

export const ajusterStock = (entrepriseId: string, produitId: string, data: { delta: number; motif: string }) =>
  api<{ nouveauStock: number }>(`/api/produits/${produitId}/ajustement`, { method: 'POST', body: data, entrepriseId });

export const creerProduit = (
  entrepriseId: string,
  data: { nom: string; prixVente: number; seuilAlerte?: number },
) => api<{ produitId: string }>('/api/produits', { method: 'POST', body: data, entrepriseId });

export const approvisionner = (
  entrepriseId: string,
  produitId: string,
  data: {
    quantite: number; coutUnitaire: number; modePaiement?: string | null; aCredit?: boolean;
    tiersId?: string | null; tauxTva?: number; clientUuid?: string; dateOperation?: string | null;
    dateEcheance?: string | null;
  },
) => api<{ nouveauStock: number; nouveauCmp: number; achatId: string | null }>(
  `/api/produits/${produitId}/entree`, { method: 'POST', body: data, entrepriseId },
);

// ── Dettes fournisseurs (« ce que je dois ») ──
export interface DetteFournisseur {
  id: string; date: string; total_ttc: number; statut: string; tiers_nom: string | null; regle: number;
  date_echeance: string | null; enRetard: boolean; piece_cle: string | null;
}
export const listerDettesFournisseurs = (entrepriseId: string) =>
  api<{ dettes: DetteFournisseur[] }>('/api/achats/dettes', { entrepriseId }).then((r) => r.dettes);
export const payerAchat = (
  entrepriseId: string, achatId: string, data: { montant: number; modePaiement: string; clientUuid?: string },
) => api<{ statut: string; regle: number }>(`/api/achats/${achatId}/payer`, { method: 'POST', body: data, entrepriseId });

// ── Tiers ──
export interface Tiers {
  id: string; nom: string; type: string; niu: string | null; telephone: string | null;
  email: string | null; adresse: string | null;
}
export const listerTiers = (entrepriseId: string) =>
  api<{ tiers: Tiers[] }>('/api/tiers', { entrepriseId }).then((r) => r.tiers);
export const creerTiers = (
  entrepriseId: string,
  data: {
    nom: string; telephone?: string; niu?: string; email?: string; adresse?: string;
    type?: 'client' | 'fournisseur'; clientUuid?: string;
  },
) => api<{ tiersId: string }>('/api/tiers', { method: 'POST', body: { ...data, type: data.type ?? 'client' }, entrepriseId });

export interface TiersDetail extends Tiers {
  ventes: { id: string; date: string; total_ttc: number; statut: string }[];
  factures: { id: string; numero: string | null; type: string; total_ttc: number; statut: string; date_emission: string | null }[];
  achats: { id: string; date: string; total_ttc: number; statut: string; piece_cle: string | null }[];
  soldeDu: number; soldeAPayer: number;
}
export const getTiersDetail = (entrepriseId: string, id: string) =>
  api<TiersDetail>(`/api/tiers/${id}`, { entrepriseId });

// ── Factures ──
export interface FactureResume {
  id: string; type: string; numero: string | null; statut: string;
  total_ttc: number; date_emission: string | null; date_echeance: string | null;
  tiers_nom: string | null; tiers_telephone: string | null;
  avoir_de_id: string | null; a_un_avoir: number; a_ete_converti: number;
  regle: number; montantDu: number; enRetard: boolean;
}
export interface LigneFacture { designation: string; quantite: number; prixUnitaire: number; }

export const listerFactures = (entrepriseId: string) =>
  api<{ factures: FactureResume[] }>('/api/factures', { entrepriseId }).then((r) => r.factures);

export interface FactureImpayee {
  id: string; numero: string; total_ttc: number; date_echeance: string | null;
  tiers_nom: string | null; regle: number; montantDu: number; enRetard: boolean;
}
export const listerFacturesImpayees = (entrepriseId: string) =>
  api<{ factures: FactureImpayee[] }>('/api/factures/impayees', { entrepriseId }).then((r) => r.factures);
export const creerFacture = (
  entrepriseId: string,
  data: { type: string; tiersId: string; lignes: LigneFacture[]; dateEcheance?: string; clientUuid?: string },
) => api<{ factureId: string }>('/api/factures', { method: 'POST', body: data, entrepriseId });
export const emettreFacture = (entrepriseId: string, id: string) =>
  api<{ numero: string }>(`/api/factures/${id}/emettre`, { method: 'POST', entrepriseId });
export const creerAvoir = (entrepriseId: string, id: string) =>
  api<{ avoirId: string; numero: string }>(`/api/factures/${id}/avoir`, { method: 'POST', entrepriseId });
export const convertirDevisEnFacture = (entrepriseId: string, id: string) =>
  api<{ factureId: string }>(`/api/factures/${id}/convertir`, { method: 'POST', entrepriseId });
export const payerFacture = (
  entrepriseId: string, id: string, data: { montant: number; modePaiement: string; clientUuid?: string },
) => api<{ statut: string; regle: number }>(`/api/factures/${id}/payer`, { method: 'POST', body: data, entrepriseId });

// ── États financiers ──
export interface LigneEtat { numero: string; libelle: string; montant: number; }
export interface EtatsFinanciers {
  resultat: { produits: number; charges: number; resultat: number; detailProduits: LigneEtat[]; detailCharges: LigneEtat[] };
  bilan: { actif: LigneEtat[]; passif: LigneEtat[]; totalActif: number; totalPassif: number; equilibre: boolean };
}
export const etatsFinanciers = (entrepriseId: string) =>
  api<EtatsFinanciers>('/api/etats', { entrepriseId });

// ── Journal d'audit ──
export interface EntreeAudit {
  id: string; ts: string; utilisateur_id: string; role: string; action: string;
  entite: string | null; entite_id: string | null; avant_json: string | null; apres_json: string | null;
}
export interface JournalAudit {
  entrees: EntreeAudit[];
  integrite: { valide: boolean; casseeA: string | null; nbLignes: number };
}
export const journalAudit = (entrepriseId: string) =>
  api<JournalAudit>('/api/etats/audit', { entrepriseId });

// ── Commandes / missions ──
export interface Commande {
  id: string; type: string; libelle: string; statut: string;
  montant: number | null; date_prevue: string | null; tiers_nom: string | null;
  description: string | null; priorite: string; date_debut: string | null; date_rendez_vous: string | null;
  date_paiement: string | null; lieu: string | null; responsable_id: string | null; responsable_nom: string | null;
  tiers_telephone: string | null; piece_cle: string | null; facture_id: string | null;
  reference: string | null; cout_budget: number; cout_reel: number; archivee: number;
  validee_client_le: string | null; preuve_livraison: string | null;
  encaissements_echeancier: number; remboursements_echeancier: number;
  acompte: number; remboursement: number; progression: number; motif_blocage: string | null;
  nb_taches: number; nb_taches_terminees: number; nb_taches_bloquees: number;
}
export interface TacheOperation {
  id: string; commande_id: string; titre: string; description: string | null; statut: string; priorite: string;
  responsable_id: string | null; responsable_nom: string | null; date_echeance: string | null; ordre: number;
  depend_de_id: string | null;
  parent_id:string|null;duree_minutes:number;recurrence:string|null;assignes_noms:string|null;
}
export interface CommentaireOperation { id: string; commande_id: string; message: string; auteur_nom: string | null; cree_le: string; }
export interface CoutOperation { id:string;commande_id:string;categorie:string;libelle:string;montant:number;date:string;fournisseur_nom:string|null; }
export interface EcheanceOperation { id:string;commande_id:string;type:'encaissement'|'remboursement';libelle:string;montant:number;date_prevue:string;statut:'a_venir'|'payee'|'annulee';date_paiement:string|null;mode_paiement:string|null; }
export interface HistoriqueOperation { id:string;commande_id:string;action:string;detail:string|null;auteur_nom:string|null;created_at:string; }
export interface PieceOperation { id:string;commande_id:string;nom:string;type_mime:string;categorie:string;created_at:string; }
export interface DisponibiliteEquipe { id:string;utilisateur_id:string;nom:string;type:string;debut:string;fin:string;motif:string|null; }
export interface FraisEquipe { id:string;utilisateur_id:string;nom:string;type:'avance'|'note_frais';libelle:string;montant:number;mode_paiement:string;date:string;statut:string; }
export interface MembreOperation { id: string; nom: string; role: string; }
export const listerCommandes = (entrepriseId: string) =>
  api<{ commandes: Commande[]; taches: TacheOperation[]; commentaires: CommentaireOperation[]; couts:CoutOperation[];echeances:EcheanceOperation[];historique:HistoriqueOperation[];pieces:PieceOperation[];disponibilites:DisponibiliteEquipe[];fraisEquipe:FraisEquipe[] }>('/api/commandes', { entrepriseId });
export const creerCommande = (
  entrepriseId: string,
  data: {
    type: string; libelle: string; montant?: number; tiersId?: string; datePrevue?: string; clientUuid?: string;
    description?: string; priorite?: string; dateDebut?: string; dateRendezVous?: string; datePaiement?: string;
    lieu?: string; responsableId?: string; responsableNom?: string; acompte?: number; remboursement?: number; coutBudget?:number;
  },
) => api<{ commandeId: string }>('/api/commandes', { method: 'POST', body: data, entrepriseId });
export const changerStatutCommande = (entrepriseId: string, id: string, statut: string) =>
  api<{ ok: boolean }>(`/api/commandes/${id}/statut`, { method: 'POST', body: { statut }, entrepriseId });
export const listerEquipeOperations = (entrepriseId: string) =>
  api<{ membres: MembreOperation[] }>('/api/commandes/equipe', { entrepriseId }).then((r) => r.membres);
export const creerTacheOperation = (entrepriseId: string, commandeId: string, data: {
  titre: string; description?: string; priorite?: string; responsableId?: string; responsableNom?: string; dateEcheance?: string; dependDeId?: string;parentId?:string;dureeMinutes?:number;recurrence?:'quotidienne'|'hebdomadaire'|'mensuelle';assignes?:{id:string;nom:string}[];
}) => api<{ tacheId: string }>(`/api/commandes/${commandeId}/taches`, { method: 'POST', body: data, entrepriseId });
export const changerStatutTache = (entrepriseId: string, id: string, statut: string) =>
  api<{ ok: boolean }>(`/api/commandes/taches/${id}/statut`, { method: 'POST', body: { statut }, entrepriseId });
export const modifierTacheOperation=(entrepriseId:string,id:string,data:Record<string,unknown>)=>api<{ok:boolean}>(`/api/commandes/taches/${id}`,{method:'PATCH',body:data,entrepriseId});
export const supprimerTacheOperation=(entrepriseId:string,id:string)=>api<{ok:boolean}>(`/api/commandes/taches/${id}`,{method:'DELETE',entrepriseId});
export const ajouterCommentaireOperation = (entrepriseId: string, id: string, data: { message: string; auteurNom?: string }) =>
  api<{ commentaireId: string }>(`/api/commandes/${id}/commentaires`, { method: 'POST', body: data, entrepriseId });
export const creerFactureOperation = (entrepriseId: string, id: string, clientUuid: string) =>
  api<{ factureId: string }>(`/api/commandes/${id}/facture`, { method: 'POST', body: { clientUuid }, entrepriseId });
export const modifierCommande = (entrepriseId:string,id:string,data:Record<string,unknown>)=>api<{ok:boolean}>(`/api/commandes/${id}`,{method:'PATCH',body:data,entrepriseId});
export const dupliquerCommande = (entrepriseId:string,id:string)=>api<{commandeId:string}>(`/api/commandes/${id}/dupliquer`,{method:'POST',entrepriseId});
export const archiverCommande = (entrepriseId:string,id:string)=>api<{ok:boolean}>(`/api/commandes/${id}/archiver`,{method:'POST',entrepriseId});
export const ajouterCoutOperation = (entrepriseId:string,id:string,data:{categorie:string;libelle:string;montant:number;date:string;fournisseurNom?:string;modePaiement?:string;clientUuid?:string})=>api<{coutId:string}>(`/api/commandes/${id}/couts`,{method:'POST',body:data,entrepriseId});
export const supprimerCoutOperation = (entrepriseId:string,id:string)=>api<{ok:boolean}>(`/api/commandes/couts/${id}`,{method:'DELETE',entrepriseId});
export const ajouterEcheanceOperation = (entrepriseId:string,id:string,data:{type:'encaissement'|'remboursement';libelle:string;montant:number;datePrevue:string})=>api<{echeanceId:string}>(`/api/commandes/${id}/echeances`,{method:'POST',body:data,entrepriseId});
export const payerEcheanceOperation = (entrepriseId:string,id:string,data:{modePaiement:string;datePaiement?:string})=>api<{ok:boolean}>(`/api/commandes/echeances/${id}/payer`,{method:'POST',body:data,entrepriseId});
export async function televerserPiecesOperation(entrepriseId:string,id:string,fichier:File,categorie='autre'){const res=await fetch(`${BASE}/api/commandes/${id}/pieces`,{method:'POST',headers:{'x-entreprise-id':entrepriseId,'content-type':fichier.type,'x-file-name':encodeURIComponent(fichier.name),'x-piece-category':categorie},credentials:'include',body:fichier});if(!res.ok)throw new Error(((await res.json().catch(()=>({}))) as {erreur?:string}).erreur??'Envoi impossible');return res.json() as Promise<{pieceId:string}>}
export async function urlPieceOperationMultiple(entrepriseId:string,id:string){const r=await fetch(`${BASE}/api/commandes/pieces/${id}`,{headers:{'x-entreprise-id':entrepriseId},credentials:'include'});if(!r.ok)throw new Error('Pièce indisponible');return URL.createObjectURL(await r.blob())}
export const supprimerPieceOperationMultiple=(entrepriseId:string,id:string)=>api<{ok:boolean}>(`/api/commandes/pieces/${id}`,{method:'DELETE',entrepriseId});
export const ajouterDisponibiliteEquipe=(entrepriseId:string,data:{utilisateurId:string;nom:string;type:'absence'|'indisponible'|'disponible';debut:string;fin:string;motif?:string})=>api<{id:string}>('/api/commandes/equipe/disponibilites',{method:'POST',body:data,entrepriseId});
export const supprimerDisponibiliteEquipe=(entrepriseId:string,id:string)=>api<{ok:boolean}>(`/api/commandes/equipe/disponibilites/${id}`,{method:'DELETE',entrepriseId});
export const ajouterFraisEquipe=(entrepriseId:string,data:{utilisateurId:string;nom:string;type:'avance'|'note_frais';libelle:string;montant:number;modePaiement:string;date:string;clientUuid:string})=>api<{id:string}>('/api/commandes/equipe/frais',{method:'POST',body:data,entrepriseId});

// ── Dépenses ──
export interface Depense {
  id: string; categorie: string; compte_numero: string; libelle: string; montant: number;
  mode_paiement: string; recurrente: number; date: string; tiers_nom: string | null;
  piece_cle: string | null; agence: string | null; cree_par: string | null; ecriture_id: string | null;
}
export const listerDepenses = (entrepriseId: string) =>
  api<{ depenses: Depense[] }>('/api/depenses', { entrepriseId }).then((r) => r.depenses);

export interface AnalyseDepenses {
  periode: { debut: string; fin: string };
  total: number;
  parCategorie: { categorie: string; libelle: string; total: number }[];
  evolutionMensuelle: { moisLabel: string; total: number }[];
  budget: { plafondDepenses: number | null; ecart: number | null } | null;
  postesEnHausse: { categorie: string; libelle: string; moisCourant: number; moisPrecedent: number; deltaMontant: number }[];
  recurrentes: Depense[];
  topFournisseurs: { tiersId: string | null; nom: string; total: number; nb: number }[];
  inhabituelles: { categorie: string; libelle: string; total: number; moyenneHistorique: number }[];
  sansJustificatif: Depense[];
  parAgence: { agence: string; total: number }[];
}
export const analyserDepenses = (entrepriseId: string, periode?: { debut: string; fin: string }, agence?: string) => {
  const q = new URLSearchParams();
  if (periode) { q.set('debut', periode.debut); q.set('fin', periode.fin); }
  if (agence) q.set('agence', agence);
  const qs = q.toString();
  return api<AnalyseDepenses>(`/api/depenses/analyse${qs ? `?${qs}` : ''}`, { entrepriseId });
};

/** Détail des dépenses d'une catégorie — drill-down depuis l'écran Analyse. */
export const listerDepensesParCategorie = (
  entrepriseId: string, categorie: string, periode?: { debut: string; fin: string }, agence?: string,
) => {
  const q = new URLSearchParams();
  if (periode) { q.set('debut', periode.debut); q.set('fin', periode.fin); }
  if (agence) q.set('agence', agence);
  const qs = q.toString();
  return api<{ depenses: Depense[] }>(`/api/depenses/categorie/${encodeURIComponent(categorie)}${qs ? `?${qs}` : ''}`, { entrepriseId })
    .then((r) => r.depenses);
};

/**
 * Pièce justificative (photo/scan ou PDF) attachée à une dépense/un achat/une vente — fichier
 * stocké dans R2, même mécanique partout (voir apps/api/src/services/pieces.ts).
 */
function creerAidesPiece(base: string) {
  async function televerser(entrepriseId: string, id: string, fichier: File): Promise<void> {
    const res = await fetch(`${BASE}${base}/${id}/piece`, {
      method: 'POST',
      headers: { 'x-entreprise-id': entrepriseId, 'content-type': fichier.type },
      credentials: 'include',
      body: fichier,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { erreur?: string };
      throw new Error(err.erreur ?? `Erreur ${res.status}`);
    }
  }
  async function url(entrepriseId: string, id: string): Promise<string> {
    const res = await fetch(`${BASE}${base}/${id}/piece`, {
      headers: { 'x-entreprise-id': entrepriseId },
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Pièce indisponible');
    return URL.createObjectURL(await res.blob());
  }
  const supprimer = (entrepriseId: string, id: string) =>
    api<{ ok: boolean }>(`${base}/${id}/piece`, { method: 'DELETE', entrepriseId });
  return { televerser, url, supprimer };
}

const aidesPieceDepense = creerAidesPiece('/api/depenses');
export const televerserPieceDepense = aidesPieceDepense.televerser;
export const urlPieceDepense = aidesPieceDepense.url;
export const supprimerPieceDepense = aidesPieceDepense.supprimer;

const aidesPieceAchat = creerAidesPiece('/api/achats');
export const televerserPieceAchat = aidesPieceAchat.televerser;
export const urlPieceAchat = aidesPieceAchat.url;
export const supprimerPieceAchat = aidesPieceAchat.supprimer;

const aidesPieceVente = creerAidesPiece('/api/ventes');
export const televerserPieceVente = aidesPieceVente.televerser;
export const urlPieceVente = aidesPieceVente.url;
export const supprimerPieceVente = aidesPieceVente.supprimer;

const aidesPieceOperation = creerAidesPiece('/api/commandes');
export const televerserPieceOperation = aidesPieceOperation.televerser;
export const urlPieceOperation = aidesPieceOperation.url;

// ── Pièces justificatives (écran centralisé — dépenses + achats + ventes) ──
export interface PieceJustificative {
  type: 'depense' | 'achat' | 'vente';
  id: string; date: string; libelle: string; montant: number; piece_cle: string; tiers_nom: string | null;
}
export const listerPiecesJustificatives = (entrepriseId: string) =>
  api<{ pieces: PieceJustificative[] }>('/api/pieces', { entrepriseId }).then((r) => r.pieces);

const AIDES_PIECE_PAR_TYPE = { depense: aidesPieceDepense, achat: aidesPieceAchat, vente: aidesPieceVente };
export const urlPiece = (type: PieceJustificative['type'], entrepriseId: string, id: string) =>
  AIDES_PIECE_PAR_TYPE[type].url(entrepriseId, id);
export const creerDepense = (
  entrepriseId: string,
  data: {
    categorie: string; libelle: string; montant: number; modePaiement: string; recurrente?: boolean;
    clientUuid?: string; dateOperation?: string | null; agence?: string | null;
  },
) => api<{ depenseId: string; deja: boolean }>('/api/depenses', { method: 'POST', body: data, entrepriseId });

/** Récupère le PDF de la facture (avec en-têtes d'auth) sous forme de blob brut. */
async function blobPdfFacture(entrepriseId: string, id: string): Promise<Blob> {
  const BASE = import.meta.env.VITE_API_URL ?? '';
  const res = await fetch(`${BASE}/api/factures/${id}/pdf`, {
    headers: { 'x-entreprise-id': entrepriseId },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('PDF indisponible');
  return res.blob();
}

/** Le PDF sous forme de `File` (partage natif — WhatsApp, etc.) nommé d'après le numéro. */
export async function fichierPdfFacture(entrepriseId: string, id: string, nomFichier: string): Promise<File> {
  const blob = await blobPdfFacture(entrepriseId, id);
  return new File([blob], nomFichier, { type: 'application/pdf' });
}

/** Récupère le PDF de la facture (avec en-têtes d'auth) et retourne une URL blob affichable. */
export async function urlPdfFacture(entrepriseId: string, id: string): Promise<string> {
  return URL.createObjectURL(await blobPdfFacture(entrepriseId, id));
}
