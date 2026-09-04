import { Hono } from 'hono';
import { z } from 'zod';
import { zDateISO, messageErreurZod } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';
import { avecCacheTTL } from '../lib/cache-isolate.js';
import { genererRapportPDF, type DonneesRapport } from '../pdf/rapport-pdf.js';

const zPeriode = z.object({
  type: z.enum(['mensuel', 'trimestriel', 'annuel', 'comparaison']),
  debut: zDateISO, fin: zDateISO,
  debutComparaison: zDateISO.nullish(), finComparaison: zDateISO.nullish(),
});

function lireParams(c: { req: { query: (k: string) => string | undefined } }) {
  return zPeriode.safeParse({
    type: c.req.query('type'), debut: c.req.query('debut'), fin: c.req.query('fin'),
    debutComparaison: c.req.query('debutComparaison') ?? null, finComparaison: c.req.query('finComparaison') ?? null,
  });
}

async function emetteur(c: { env: AppEnv['Bindings'] }, entrepriseId: string) {
  return (c.env as AppEnv['Bindings']).DB
    .prepare('SELECT raison_sociale FROM entreprise WHERE id = ?')
    .bind(entrepriseId)
    .first<{ raison_sociale: string }>();
}

/** Échappe une valeur pour un champ CSV (RFC 4180) : entoure de guillemets si nécessaire. */
function csvChamp(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvLigne(champs: (string | number)[]): string {
  return champs.map(csvChamp).join(',') + '\r\n';
}

export const rapports = new Hono<AppEnv>();

rapports.get('/', requirePermission('rapport:read'), async (c) => {
  const p = lireParams(c);
  if (!p.success) return c.json({ erreur: messageErreurZod(p.error) }, 400);
  const { type, debut, fin, debutComparaison, finComparaison } = p.data;
  const periodeComparaison = debutComparaison && finComparaison ? { debut: debutComparaison, fin: finComparaison } : undefined;
  const entrepriseId = c.get('entrepriseId');
  const cle = `rapport:${entrepriseId}:${type}:${debut}:${fin}:${debutComparaison ?? ''}:${finComparaison ?? ''}`;
  const rapport = await avecCacheTTL(cle, 60_000, () =>
    stubEntreprise(c.env, entrepriseId).rapport({ type, periode: { debut, fin }, periodeComparaison }),
  );
  return c.json(rapport);
});

rapports.get('/pdf', requirePermission('rapport:read'), async (c) => {
  const p = lireParams(c);
  if (!p.success) return c.json({ erreur: messageErreurZod(p.error) }, 400);
  const { type, debut, fin, debutComparaison, finComparaison } = p.data;
  const periodeComparaison = debutComparaison && finComparaison ? { debut: debutComparaison, fin: finComparaison } : undefined;
  const entrepriseId = c.get('entrepriseId');
  const rapport = await stubEntreprise(c.env, entrepriseId).rapport({ type, periode: { debut, fin }, periodeComparaison }) as DonneesRapport & {
    produits: { designation: string; ca_ht: number; marge: number }[]; clients: { nom: string; ca_ht: number; marge: number }[];
  };
  const ent = await emetteur(c, entrepriseId);
  const pdf = await genererRapportPDF(rapport, { raisonSociale: ent?.raison_sociale ?? 'Kombi' });
  return new Response(pdf, {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="rapport-${type}-${debut}.pdf"` },
  });
});

rapports.get('/csv', requirePermission('rapport:read'), async (c) => {
  const p = lireParams(c);
  if (!p.success) return c.json({ erreur: messageErreurZod(p.error) }, 400);
  const { type, debut, fin, debutComparaison, finComparaison } = p.data;
  const periodeComparaison = debutComparaison && finComparaison ? { debut: debutComparaison, fin: finComparaison } : undefined;
  const entrepriseId = c.get('entrepriseId');
  const rapport = await stubEntreprise(c.env, entrepriseId).rapport({ type, periode: { debut, fin }, periodeComparaison }) as {
    stats: { ca: number; cogs: number; marge: number; depenses: number; resultat: number };
    produits: { designation: string; ca_ht: number; marge: number }[];
    clients: { nom: string; ca_ht: number; marge: number }[];
    depenses: { parCategorie: { libelle: string; total: number }[] };
  };

  let csv = '﻿'; // BOM — Excel détecte l'UTF-8 sans quoi les accents s'affichent mal.
  csv += csvLigne(['Résumé', debut, fin]);
  csv += csvLigne(['CA', rapport.stats.ca]);
  csv += csvLigne(['Coût des ventes', rapport.stats.cogs]);
  csv += csvLigne(['Marge', rapport.stats.marge]);
  csv += csvLigne(['Dépenses', rapport.stats.depenses]);
  csv += csvLigne(['Résultat', rapport.stats.resultat]);
  csv += '\r\n';
  csv += csvLigne(['Produit', 'CA HT', 'Marge']);
  for (const p2 of rapport.produits) csv += csvLigne([p2.designation, p2.ca_ht, p2.marge]);
  csv += '\r\n';
  csv += csvLigne(['Client', 'CA HT', 'Marge']);
  for (const cl of rapport.clients) csv += csvLigne([cl.nom, cl.ca_ht, cl.marge]);
  csv += '\r\n';
  csv += csvLigne(['Catégorie de dépense', 'Total']);
  for (const dc of rapport.depenses.parCategorie) csv += csvLigne([dc.libelle, dc.total]);

  return new Response(csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="rapport-${type}-${debut}.csv"` },
  });
});
