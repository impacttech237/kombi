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
