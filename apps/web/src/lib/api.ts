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
  secteur: string;
  regime_fiscal: string;
  role: string;
}

export const listerEntreprises = () =>
  api<{ entreprises: EntrepriseResume[] }>('/api/entreprises').then((r) => r.entreprises);

export const creerEntreprise = (data: {
  raisonSociale: string; secteur: string; natureActivite: string; niu?: string;
}) => api<{ entrepriseId: string }>('/api/entreprises', { method: 'POST', body: data });

export interface LigneCaisse { designation: string; quantite: number; prixUnitaire: number; produitId?: string; }

export const enregistrerVente = (
  entrepriseId: string,
  data: { lignes: LigneCaisse[]; modePaiement: string; clientUuid: string },
) => api<{ venteId: string; totalTtc: number }>('/api/ventes', { method: 'POST', body: data, entrepriseId });

export const statsJour = (entrepriseId: string) =>
  api<{ nbVentes: number; totalJour: number }>('/api/ventes/jour', { entrepriseId });

export interface Produit {
  id: string; nom: string; sku: string | null; unite: string;
  prix_vente: number; cout_moyen_pondere: number; stock_actuel: number;
  seuil_alerte: number; en_alerte: number;
}

export const listerProduits = (entrepriseId: string) =>
  api<{ produits: Produit[] }>('/api/produits', { entrepriseId }).then((r) => r.produits);

export const creerProduit = (
  entrepriseId: string,
  data: { nom: string; prixVente: number; seuilAlerte?: number },
) => api<{ produitId: string }>('/api/produits', { method: 'POST', body: data, entrepriseId });

export const approvisionner = (
  entrepriseId: string,
  produitId: string,
  data: { quantite: number; coutUnitaire: number; modePaiement: string },
) => api<{ nouveauStock: number; nouveauCmp: number }>(
  `/api/produits/${produitId}/entree`, { method: 'POST', body: data, entrepriseId },
);

// ── Tiers ──
export interface Tiers { id: string; nom: string; type: string; niu: string | null; telephone: string | null; }
export const listerTiers = (entrepriseId: string) =>
  api<{ tiers: Tiers[] }>('/api/tiers', { entrepriseId }).then((r) => r.tiers);
export const creerTiers = (entrepriseId: string, data: { nom: string; telephone?: string; niu?: string }) =>
  api<{ tiersId: string }>('/api/tiers', { method: 'POST', body: { ...data, type: 'client' }, entrepriseId });

// ── Factures ──
export interface FactureResume {
  id: string; type: string; numero: string | null; statut: string;
  total_ttc: number; date_emission: string | null; tiers_nom: string | null;
}
export interface LigneFacture { designation: string; quantite: number; prixUnitaire: number; }

export const listerFactures = (entrepriseId: string) =>
  api<{ factures: FactureResume[] }>('/api/factures', { entrepriseId }).then((r) => r.factures);
export const creerFacture = (
  entrepriseId: string,
  data: { type: string; tiersId: string; lignes: LigneFacture[]; dateEcheance?: string },
) => api<{ factureId: string }>('/api/factures', { method: 'POST', body: data, entrepriseId });
export const emettreFacture = (entrepriseId: string, id: string) =>
  api<{ numero: string }>(`/api/factures/${id}/emettre`, { method: 'POST', entrepriseId });
export const payerFacture = (entrepriseId: string, id: string, data: { montant: number; modePaiement: string }) =>
  api<{ statut: string; regle: number }>(`/api/factures/${id}/payer`, { method: 'POST', body: data, entrepriseId });

// ── États financiers ──
export interface LigneEtat { numero: string; libelle: string; montant: number; }
export interface EtatsFinanciers {
  resultat: { produits: number; charges: number; resultat: number; detailProduits: LigneEtat[]; detailCharges: LigneEtat[] };
  bilan: { actif: LigneEtat[]; passif: LigneEtat[]; totalActif: number; totalPassif: number; equilibre: boolean };
}
export const etatsFinanciers = (entrepriseId: string) =>
  api<EtatsFinanciers>('/api/etats', { entrepriseId });

// ── Commandes / missions ──
export interface Commande {
  id: string; type: string; libelle: string; statut: string;
  montant: number | null; date_prevue: string | null; tiers_nom: string | null;
}
export const listerCommandes = (entrepriseId: string) =>
  api<{ commandes: Commande[] }>('/api/commandes', { entrepriseId }).then((r) => r.commandes);
export const creerCommande = (
  entrepriseId: string,
  data: { type: string; libelle: string; montant?: number; tiersId?: string },
) => api<{ commandeId: string }>('/api/commandes', { method: 'POST', body: data, entrepriseId });
export const changerStatutCommande = (entrepriseId: string, id: string, statut: string) =>
  api<{ ok: boolean }>(`/api/commandes/${id}/statut`, { method: 'POST', body: { statut }, entrepriseId });

// ── Dépenses ──
export interface Depense {
  id: string; categorie: string; compte_numero: string; libelle: string; montant: number;
  mode_paiement: string; recurrente: number; date: string; tiers_nom: string | null;
}
export const listerDepenses = (entrepriseId: string) =>
  api<{ depenses: Depense[] }>('/api/depenses', { entrepriseId }).then((r) => r.depenses);
export const creerDepense = (
  entrepriseId: string,
  data: { categorie: string; libelle: string; montant: number; modePaiement: string; recurrente?: boolean },
) => api<{ depenseId: string }>('/api/depenses', { method: 'POST', body: data, entrepriseId });

/** Récupère le PDF de la facture (avec en-têtes d'auth) et retourne une URL blob affichable. */
export async function urlPdfFacture(entrepriseId: string, id: string): Promise<string> {
  const BASE = import.meta.env.VITE_API_URL ?? '';
  const res = await fetch(`${BASE}/api/factures/${id}/pdf`, {
    headers: { 'x-entreprise-id': entrepriseId },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('PDF indisponible');
  return URL.createObjectURL(await res.blob());
}
