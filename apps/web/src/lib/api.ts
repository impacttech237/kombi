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
  regime_fiscal: string; adherent_cga: number; assujetti_tva: number;
}
export const getParametresEntreprise = (entrepriseId: string) =>
  api<ParametresEntreprise>(`/api/entreprises/${entrepriseId}/parametres`);
export const majParametresEntreprise = (
  entrepriseId: string, data: { niu?: string | null; adherentCga?: boolean; assujettiTva?: boolean },
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
    tiersId?: string | null; clientUuid: string;
  },
) => api<{ venteId: string; totalTtc: number; enSurvente: boolean }>('/api/ventes', { method: 'POST', body: data, entrepriseId });

export const payerVente = (
  entrepriseId: string, venteId: string, data: { montant: number; modePaiement: string; clientUuid?: string },
) => api<{ statut: string; regle: number }>(`/api/ventes/${venteId}/payer`, { method: 'POST', body: data, entrepriseId });

export interface VenteACredit {
  id: string; date: string; total_ttc: number; statut: string; tiers_nom: string | null; regle: number;
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
  },
) => api<{ nouveauStock: number; nouveauCmp: number }>(
  `/api/produits/${produitId}/entree`, { method: 'POST', body: data, entrepriseId },
);

// ── Dettes fournisseurs (« ce que je dois ») ──
export interface DetteFournisseur {
  id: string; date: string; total_ttc: number; statut: string; tiers_nom: string | null; regle: number;
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
  achats: { id: string; date: string; total_ttc: number; statut: string }[];
  soldeDu: number; soldeAPayer: number;
}
export const getTiersDetail = (entrepriseId: string, id: string) =>
  api<TiersDetail>(`/api/tiers/${id}`, { entrepriseId });

// ── Factures ──
export interface FactureResume {
  id: string; type: string; numero: string | null; statut: string;
  total_ttc: number; date_emission: string | null; tiers_nom: string | null; tiers_telephone: string | null;
  avoir_de_id: string | null; a_un_avoir: number; a_ete_converti: number;
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
}
export const listerCommandes = (entrepriseId: string) =>
  api<{ commandes: Commande[] }>('/api/commandes', { entrepriseId }).then((r) => r.commandes);
export const creerCommande = (
  entrepriseId: string,
  data: {
    type: string; libelle: string; montant?: number; tiersId?: string; datePrevue?: string;
    clientUuid?: string;
  },
) => api<{ commandeId: string }>('/api/commandes', { method: 'POST', body: data, entrepriseId });
export const changerStatutCommande = (entrepriseId: string, id: string, statut: string) =>
  api<{ ok: boolean }>(`/api/commandes/${id}/statut`, { method: 'POST', body: { statut }, entrepriseId });

// ── Dépenses ──
export interface Depense {
  id: string; categorie: string; compte_numero: string; libelle: string; montant: number;
  mode_paiement: string; recurrente: number; date: string; tiers_nom: string | null;
  piece_cle: string | null;
}
export const listerDepenses = (entrepriseId: string) =>
  api<{ depenses: Depense[] }>('/api/depenses', { entrepriseId }).then((r) => r.depenses);

/** Pièce justificative (photo/scan) attachée à une dépense — fichier stocké dans R2. */
export async function televerserPieceDepense(entrepriseId: string, depenseId: string, fichier: File): Promise<void> {
  const res = await fetch(`${BASE}/api/depenses/${depenseId}/piece`, {
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
export async function urlPieceDepense(entrepriseId: string, depenseId: string): Promise<string> {
  const res = await fetch(`${BASE}/api/depenses/${depenseId}/piece`, {
    headers: { 'x-entreprise-id': entrepriseId },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Pièce indisponible');
  return URL.createObjectURL(await res.blob());
}
export const supprimerPieceDepense = (entrepriseId: string, depenseId: string) =>
  api<{ ok: boolean }>(`/api/depenses/${depenseId}/piece`, { method: 'DELETE', entrepriseId });
export const creerDepense = (
  entrepriseId: string,
  data: {
    categorie: string; libelle: string; montant: number; modePaiement: string; recurrente?: boolean;
    clientUuid?: string; dateOperation?: string | null;
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
