/**
 * Couture de sharding (DECISIONS D11) : tout accès aux données métier passe par TenantDb,
 * qui injecte AUTOMATIQUEMENT `entreprise_id` dans chaque requête. Impossible d'oublier le filtre,
 * donc aucune fuite cross-tenant — et la bascule future « 1 base D1 par entreprise » reste mécanique.
 *
 * La construction SQL est pure (buildSelect/buildInsert) → unit-testable sans base.
 */

/** Tables portant une colonne entreprise_id (whitelist anti-injection). */
export const TABLES_TENANT = new Set([
  'membre_entreprise',
  'exercice',
  'compte_comptable',
  'tiers',
  'ecriture',
  'ligne_ecriture',
  'facture',
  'ligne_facture',
  'paiement_facture',
  'calcul_igs',
  'import_bancaire',
  'ligne_releve',
  'module_entreprise',
  'produit',
  'mouvement_stock',
  'vente',
  'ligne_vente',
  'achat_fournisseur',
  'ligne_achat',
  'commande',
]);

function assertTable(table: string): void {
  if (!TABLES_TENANT.has(table)) {
    throw new Error(`Table « ${table} » non déclarée comme table de tenant`);
  }
}

const IDENT = /^[a-z_][a-z0-9_]*$/;
function assertIdent(name: string): void {
  if (!IDENT.test(name)) throw new Error(`Identifiant invalide: ${name}`);
}

export interface RequeteConstruite {
  readonly sql: string;
  readonly binds: unknown[];
}

/** SELECT ... FROM table WHERE entreprise_id = ? [AND extra]. */
export function buildSelect(
  entrepriseId: string,
  table: string,
  opts: { colonnes?: string[]; extraWhere?: string; extraBinds?: unknown[]; limit?: number } = {},
): RequeteConstruite {
  assertTable(table);
  const cols = opts.colonnes?.length ? opts.colonnes.map((c) => (assertIdent(c), c)).join(', ') : '*';
  let sql = `SELECT ${cols} FROM ${table} WHERE entreprise_id = ?`;
  const binds: unknown[] = [entrepriseId];
  if (opts.extraWhere) {
    sql += ` AND (${opts.extraWhere})`;
    binds.push(...(opts.extraBinds ?? []));
  }
  if (opts.limit != null) sql += ` LIMIT ${Number(opts.limit)}`;
  return { sql, binds };
}

/** INSERT INTO table (...) VALUES (...) avec entreprise_id forcé. */
export function buildInsert(
  entrepriseId: string,
  table: string,
  valeurs: Record<string, unknown>,
): RequeteConstruite {
  assertTable(table);
  const data: Record<string, unknown> = { ...valeurs, entreprise_id: entrepriseId };
  const cols = Object.keys(data);
  cols.forEach(assertIdent);
  const placeholders = cols.map(() => '?').join(', ');
  return {
    sql: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
    binds: cols.map((c) => data[c]),
  };
}

/** Accès D1 borné à une entreprise. Toutes les méthodes filtrent sur entreprise_id. */
export class TenantDb {
  constructor(
    private readonly db: D1Database,
    public readonly entrepriseId: string,
  ) {}

  async list<T = Record<string, unknown>>(
    table: string,
    opts?: Parameters<typeof buildSelect>[2],
  ): Promise<T[]> {
    const { sql, binds } = buildSelect(this.entrepriseId, table, opts);
    const res = await this.db
      .prepare(sql)
      .bind(...binds)
      .all<T>();
    return res.results ?? [];
  }

  async first<T = Record<string, unknown>>(
    table: string,
    opts?: Parameters<typeof buildSelect>[2],
  ): Promise<T | null> {
    const { sql, binds } = buildSelect(this.entrepriseId, table, { ...opts, limit: 1 });
    return (await this.db
      .prepare(sql)
      .bind(...binds)
      .first<T>()) as T | null;
  }

  async insert(table: string, valeurs: Record<string, unknown>): Promise<void> {
    const { sql, binds } = buildInsert(this.entrepriseId, table, valeurs);
    await this.db
      .prepare(sql)
      .bind(...binds)
      .run();
  }
}
