/**
 * Déclaration ambiante minimale pour `node:crypto` (fourni par `nodejs_compat`, voir wrangler.toml).
 * `@cloudflare/workers-types` n'inclut pas les modules `node:*` ; on ne type que ce qu'on utilise
 * (createHash synchrone, nécessaire pour le chaînage de hash de l'audit_log dans transactionSync).
 */
declare module 'node:crypto' {
  export function createHash(algorithm: string): {
    update(data: string): { digest(encoding: 'hex'): string };
  };
}
