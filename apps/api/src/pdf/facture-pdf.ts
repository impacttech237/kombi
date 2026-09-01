import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface DonneesFacture {
  numero: string | null;
  type: string;
  date_emission: string | null;
  date_echeance: string | null;
  total_ht: number; total_tva: number; total_ttc: number;
  tiers_nom?: string; tiers_niu?: string; tiers_adresse?: string;
  lignes: { designation: string; quantite: number; prix_unitaire: number; taux_tva: number; montant_ht: number }[];
}
export interface Emetteur { raisonSociale: string; niu?: string | null; }

const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
const VERT = rgb(0.063, 0.471, 0.31); // #10784f approx accent

/** Génère le PDF d'une facture conforme aux mentions DGI (CGI Art. 150). */
export async function genererFacturePDF(f: DonneesFacture, e: Emetteur): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width } = page.getSize();
  const M = 48;
  let y = 800;

  const txt = (s: string, x: number, yy: number, size = 10, b = false, color = rgb(0, 0.14, 0.01)) =>
    page.drawText(s ?? '', { x, y: yy, size, font: b ? bold : font, color });

  // En-tête émetteur
  txt(e.raisonSociale, M, y, 18, true, VERT);
  if (e.niu) txt(`NIU : ${e.niu}`, M, y - 20, 9);
  txt(f.type === 'devis' ? 'DEVIS' : 'FACTURE', width - M - 120, y, 20, true, VERT);
  txt(f.numero ?? '(brouillon)', width - M - 120, y - 22, 11, true);
  y -= 60;

  // Dates + client
  txt(`Date : ${f.date_emission ?? '-'}`, M, y, 9);
  if (f.date_echeance) txt(`Échéance : ${f.date_echeance}`, M, y - 13, 9);
  txt('CLIENT', width - M - 200, y, 9, true, VERT);
  txt(f.tiers_nom ?? '-', width - M - 200, y - 14, 10, true);
  if (f.tiers_niu) txt(`NIU : ${f.tiers_niu}`, width - M - 200, y - 27, 9);
  if (f.tiers_adresse) txt(f.tiers_adresse, width - M - 200, y - 39, 9);
  y -= 66;

  // Tableau : en-têtes
  page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 22, color: rgb(0.906, 0.969, 0.941) });
  txt('Désignation', M + 8, y + 3, 9, true);
  txt('Qté', 330, y + 3, 9, true);
  txt('P.U. HT', 380, y + 3, 9, true);
  txt('Montant HT', width - M - 90, y + 3, 9, true);
  y -= 26;

  for (const l of f.lignes) {
    txt(l.designation.slice(0, 42), M + 8, y, 9);
    txt(String(l.quantite), 330, y, 9);
    txt(fmt(l.prix_unitaire).replace(' FCFA', ''), 380, y, 9);
    txt(fmt(l.montant_ht).replace(' FCFA', ''), width - M - 90, y, 9);
    y -= 18;
  }

  // Totaux
  y -= 10;
  page.drawLine({ start: { x: 330, y: y + 6 }, end: { x: width - M, y: y + 6 }, thickness: 0.5, color: rgb(0.8, 0.85, 0.82) });
  txt('Total HT', 380, y - 8, 10);
  txt(fmt(f.total_ht), width - M - 110, y - 8, 10);
  if (f.total_tva > 0) {
    txt('TVA (19,25 %)', 380, y - 24, 10);
    txt(fmt(f.total_tva), width - M - 110, y - 24, 10);
  }
  txt('Total TTC', 380, y - 42, 12, true, VERT);
  txt(fmt(f.total_ttc), width - M - 110, y - 42, 12, true, VERT);

  // Pied
  txt('Correction éventuelle par avoir. Généré par Kombi.', M, 40, 8, false, rgb(0.5, 0.55, 0.52));

  return doc.save();
}
