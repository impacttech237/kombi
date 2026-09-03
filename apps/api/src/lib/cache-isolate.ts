/**
 * Cache TTL en mémoire, à l'échelle de l'isolate Worker (audit infra 2026-09-03, point 7 :
 * D1 interrogé 3 à 5 fois par requête métier avant même d'atteindre le Durable Object shardé —
 * goulot d'étranglement à l'échelle contrairement à l'objectif du sharding par entreprise).
 *
 * Best-effort, PAS une garantie de cohérence forte : un isolate Cloudflare Workers sert en
 * pratique de nombreuses requêtes avant recyclage (particulièrement sous charge soutenue, le
 * scénario visé par ce correctif), donc ce cache réduit réellement la charge D1 — mais un isolate
 * froid repart à vide (dégradation propre : re-lecture D1, pas d'erreur). Aucune coordination
 * entre isolates : ne PAS l'utiliser pour une donnée où une incohérence inter-isolate serait
 * dangereuse (paiement, écriture comptable — ceux-là passent par le Durable Object, jamais ici).
 * Réservé aux lectures d'autorisation à faible enjeu et forte volumétrie (profil utilisateur,
 * rôle dans une entreprise), avec un TTL court pour borner la fenêtre de désynchronisation.
 */

interface Entree<V> { valeur: V; expireA: number; }

const cache = new Map<string, Entree<unknown>>();

/** Purge paresseuse : évite une fuite mémoire si l'isolate vit longtemps sous forte volumétrie. */
function purgerSiNecessaire(maintenant: number): void {
  if (cache.size < 5000) return;
  for (const [cle, entree] of cache) if (entree.expireA <= maintenant) cache.delete(cle);
}

/**
 * Retourne la valeur en cache si présente et non expirée, sinon calcule via `charger`, met en
 * cache pour `ttlMs`, et retourne. `null`/`undefined` ne sont jamais mis en cache (évite de figer
 * un résultat « pas trouvé » transitoire, ex. utilisateur en cours de création).
 */
export async function avecCacheTTL<V>(
  cle: string, ttlMs: number, charger: () => Promise<V>,
): Promise<V> {
  const maintenant = Date.now();
  const entree = cache.get(cle);
  if (entree && entree.expireA > maintenant) return entree.valeur as V;

  const valeur = await charger();
  if (valeur !== null && valeur !== undefined) {
    purgerSiNecessaire(maintenant);
    cache.set(cle, { valeur, expireA: maintenant + ttlMs });
  }
  return valeur;
}

/** Invalide une entrée précise — à appeler après toute mutation qui rendrait le cache faux. */
export function invaliderCache(cle: string): void {
  cache.delete(cle);
}
