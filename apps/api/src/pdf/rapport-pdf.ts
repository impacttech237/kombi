import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface DonneesRapport {
  type: string;
  periode: { debut: string; fin: string };
  stats: { ca: number; cogs: number; marge: number; depenses: number; resultat: number };
  produits: { designation: string; ca_ht: number; marge: number }[];
  clients: { nom: string; ca_ht: number; marge: number }[];
  comparaison: { variationCaPct: number | null; variationMargePct: number | null; variationDepensesPct: number | null } | null;
}
export interface Emetteur { raisonSociale: string; }

const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
const VERT = rgb(0.063, 0.471, 0.31);

/** Voir `apps/api/src/pdf/facture-pdf.ts` — même contournement (pdf-lib rejette hors WinAnsi). */
function safe(s: string | undefined | null): string {
  if (!s) return '';
  return Array.from(s).map((ch) => (ch.codePointAt(0)! > 255 ? '?' : ch)).join('');
}

const LABEL_TYPE: Record<string, string> = {
  mensuel: 'Rapport mensuel', trimestriel: 'Rapport trimestriel', annuel: 'Rapport annuel', comparaison: 'Comparaison de périodes',
};

/** Génère le PDF d'un rapport périodique (synthèse — pas le détail ligne à ligne). */
export async function genererRapportPDF(r: DonneesRapport, e: Emetteur): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width } = page.getSize();
  const M = 48;
  let y = 800;

  const txt = (s: string, x: number, yy: number, size = 10, b = false, color = rgb(0, 0.14, 0.01)) =>
    page.drawText(safe(s), { x, y: yy, size, font: b ? bold : font, color });

  txt(e.raisonSociale, M, y, 16, true, VERT);
  txt(LABEL_TYPE[r.type] ?? 'Rapport', width - M - 200, y, 14, true, VERT);
  txt(`${r.periode.debut} → ${r.periode.fin}`, width - M - 200, y - 16, 9);
  y -= 50;

  page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 96, color: rgb(0.906, 0.969, 0.941) });
  const chiffres: [string, number][] = [
    ['Chiffre d\'affaires', r.stats.ca], ['Coût des ventes', r.stats.cogs],
    ['Marge', r.stats.marge], ['Dépenses', r.stats.depenses], ['Résultat', r.stats.resultat],
  ];
  let cy = y - 18;
  for (const [label, valeur] of chiffres) {
    txt(label, M + 12, cy, 10);
    txt(fmt(valeur), width - M - 130, cy, 10, true, valeur >= 0 ? VERT : rgb(0.86, 0.15, 0.15));
    cy -= 16;
  }
  y -= 110;

  if (r.comparaison) {
    txt('Comparaison à la période précédente', M, y, 11, true, VERT);
    y -= 16;
    const varTxt = (label: string, pct: number | null) => `${label} : ${pct === null ? 'n/a' : `${pct > 0 ? '+' : ''}${pct}%`}`;
    txt(varTxt('CA', r.comparaison.variationCaPct), M, y, 9);
    txt(varTxt('Marge', r.comparaison.variationMargePct), M + 180, y, 9);
    txt(varTxt('Dépenses', r.comparaison.variationDepensesPct), M + 360, y, 9);
    y -= 24;
  }

  txt('Top produits (marge)', M, y, 11, true, VERT);
  y -= 16;
  for (const p of r.produits.slice(0, 8)) {
    txt(p.designation.slice(0, 40), M + 8, y, 9);
    txt(fmt(p.marge), width - M - 100, y, 9);
    y -= 14;
  }
  y -= 12;

  txt('Top clients (marge)', M, y, 11, true, VERT);
  y -= 16;
  for (const cl of r.clients.slice(0, 8)) {
    txt(cl.nom.slice(0, 40), M + 8, y, 9);
    txt(fmt(cl.marge), width - M - 100, y, 9);
    y -= 14;
  }

  txt('Généré par Kombi.', M, 40, 8, false, rgb(0.5, 0.55, 0.52));
  return doc.save();
}
