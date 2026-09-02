/** Origines front de confiance (CSV dans l'env). Source unique pour CORS et better-auth. */
export function origenesConfiance(env: { BETTER_AUTH_TRUSTED_ORIGINS?: string }): string[] {
  return (env.BETTER_AUTH_TRUSTED_ORIGINS ?? 'http://localhost:5173,http://localhost:8787')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
