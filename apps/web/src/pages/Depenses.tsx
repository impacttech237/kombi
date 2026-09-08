/**
 * Dépenses — absent du prototype Figma Make, design original dans le même langage visuel que
 * les écrans portés. Rejoindra à terme le flux de transactions de Trésorerie (voir
 * docs/parcours.md) ; en attendant, reste un écran autonome.
 */
import { useEffect, useState } from 'react';
import { formaterFCFA as fmt, CATEGORIES_DEPENSE } from '@kombi/shared';
import {
  listerDepenses, televerserPieceDepense, urlPieceDepense, supprimerPieceDepense,
  analyserDepenses, listerMembres, listerDepensesParCategorie,
  type EntrepriseResume, type Depense, type AnalyseDepenses, type Membre,
} from '../lib/api.js';
import { enfilerMutation, nouvelUuid } from '../offline/db.js';
import { synchroniser } from '../offline/sync.js';
import { IcoPlus, IcoChevR, IcoX, IcoFile, IcoAlert } from '../components/icons.js';
import { DepensesCategorieDonut, EvolutionMensuelleChart } from '../components/charts.js';

/**
 * Re-décode l'image via le décodeur natif du navigateur puis la redessine sur un canvas — le
 * lecteur PNG/JPEG interne de Tesseract.js (Leptonica/WASM) est plus strict que celui du
 * navigateur et échoue sur certains fichiers pourtant valides (constaté avec un PNG généré par
 * PIL). Passer un canvas normalise systématiquement le format et évite ce cas.
 */
async function normaliserImage(fichier: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image illisible'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Extrait le texte d'une image via OCR côté navigateur (Tesseract.js, aucune clé/API externe).
 * Chargé à la demande (le moteur + les données de langue pèsent plusieurs Mo). */
async function lireTexteImage(fichier: File): Promise<string> {
  const [{ recognize }, canvas] = await Promise.all([import('tesseract.js'), normaliserImage(fichier)]);
  const { data } = await recognize(canvas, 'fra');
  return data.text.trim();
}

const MODES_PAIEMENT = [
  { value: 'especes', label: 'Espèces' }, { value: 'mtn_momo', label: 'MTN MoMo' },
  { value: 'orange_money', label: 'Orange Money' }, { value: 'virement', label: 'Virement' },
  { value: 'cheque', label: 'Chèque' },
];

function labelCategorie(code: string): string {
  return CATEGORIES_DEPENSE.find((c) => c.code === code)?.label ?? code;
}

const inputCls = 'w-full bg-[var(--k-surface-soft)] text-[var(--k-ink)] placeholder:text-[var(--k-faint)] rounded-xl px-4 py-3 text-sm border border-[var(--k-line)] focus:ring-2 focus:ring-[var(--k-lime)] focus:outline-none';

export function Depenses({ entreprise, onRetour }: { entreprise: EntrepriseResume; onRetour: () => void }) {
  const [liste, setListe] = useState<Depense[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Depense | null>(null);
  const [onglet, setOnglet] = useState<'liste' | 'analyse'>('liste');

  function recharger() { return listerDepenses(entreprise.id).then(setListe).catch(() => setListe((p) => p ?? [])); }
  useEffect(() => { void recharger(); }, [entreprise.id]);

  const total = (liste ?? []).reduce((s, d) => s + d.montant, 0);

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-8 pt-4 pb-2 flex items-center gap-2">
        <button onClick={onRetour} className="w-9 h-9 shrink-0 rounded-full bg-[var(--k-surface-soft)] flex items-center justify-center text-[var(--k-muted)]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h1 className="text-[var(--k-ink)] text-lg font-bold flex-1">Dépenses</h1>
      </div>

      {liste !== null && liste.length > 0 && (
        <div className="px-4 md:px-8 pb-2">
          <div className="bg-[var(--k-surface)] rounded-2xl p-4 text-center">
            <p className="text-[var(--k-faint)] text-xs">Total des dépenses enregistrées</p>
            <p className="text-[#f87171] font-mono font-bold text-2xl mt-0.5">{fmt(total)}</p>
          </div>
        </div>
      )}

      <div className="px-4 md:px-8 pb-2">
        <div className="flex bg-[var(--k-surface-soft)] rounded-xl p-1 border border-[var(--k-line)]">
          {(['liste', 'analyse'] as const).map((o) => (
            <button key={o} onClick={() => setOnglet(o)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${onglet === o ? 'bg-[#3a9e6e] text-white' : 'text-[var(--k-muted)]'}`}>
              {o === 'liste' ? 'Liste' : 'Analyse'}
            </button>
          ))}
        </div>
      </div>

      {onglet === 'liste' ? (
        <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-2 pt-1">
          {liste === null ? (
            <p className="text-[var(--k-faint)] text-sm text-center py-8">Chargement…</p>
          ) : liste.length === 0 ? (
            <p className="text-[var(--k-faint)] text-sm text-center py-8">Aucune dépense enregistrée pour l'instant.</p>
          ) : (
            liste.map((d) => (
              <button key={d.id} onClick={() => setDetail(d)}
                className="w-full bg-[var(--k-surface)] rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-[var(--k-surface-soft)] transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-[var(--k-ink)] font-medium text-sm truncate">{d.libelle}</p>
                  <p className="text-[var(--k-faint)] text-xs mt-0.5">{labelCategorie(d.categorie)}{d.recurrente ? ' · récurrente' : ''}{d.agence ? ` · ${d.agence}` : ''}</p>
                </div>
                {d.piece_cle && <IcoFile cls="w-4 h-4 text-[var(--k-lime)] shrink-0" />}
                <span className="text-[#f87171] font-mono font-semibold text-sm shrink-0">−{fmt(d.montant)}</span>
              </button>
            ))
          )}
        </div>
      ) : (
        <AnalyseDepensesTab entreprise={entreprise} />
      )}

      <button onClick={() => setCreateOpen(true)}
        className="fixed bottom-24 md:bottom-6 right-4 w-14 h-14 bg-[#3a9e6e] rounded-full flex items-center justify-center text-white shadow-lg shadow-[var(--k-lime)]/20 z-10 active:scale-95 transition-all">
        <IcoPlus cls="w-6 h-6" />
      </button>

      {createOpen && (
        <NouvelleDepenseSheet entreprise={entreprise} onClose={() => setCreateOpen(false)}
          onCree={() => { setCreateOpen(false); void recharger(); }} />
      )}
      {detail && (
        <DetailDepenseSheet entreprise={entreprise} depense={detail} onClose={() => setDetail(null)}
          onMaj={() => {
            void recharger().then(() => {
              listerDepenses(entreprise.id).then((liste) => setDetail(liste.find((d) => d.id === detail.id) ?? null)).catch(() => {});
            });
          }} />
      )}
    </div>
  );
}

function AnalyseDepensesTab({ entreprise }: { entreprise: EntrepriseResume }) {
  const [analyse, setAnalyse] = useState<AnalyseDepenses | null>(null);
  const [categorieOuverte, setCategorieOuverte] = useState<{ code: string; libelle: string } | null>(null);
  const [detail, setDetail] = useState<Depense | null>(null);

  useEffect(() => {
    analyserDepenses(entreprise.id).then(setAnalyse).catch(() => setAnalyse(null));
  }, [entreprise.id]);

  if (analyse === null) return <p className="text-[var(--k-faint)] text-sm text-center py-8">Chargement…</p>;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-4 pt-1">
      {analyse.budget && (
        <div className={`rounded-2xl p-4 border ${analyse.budget.ecart != null && analyse.budget.ecart > 0 ? 'bg-[#f87171]/8 border-[#f87171]/30' : 'bg-[var(--k-surface)] border-[var(--k-line)]'}`}>
          <p className="text-[var(--k-faint)] text-xs">Plafond du mois</p>
          <p className="text-[var(--k-ink)] font-mono font-semibold text-sm mt-0.5">
            {fmt(analyse.total)} / {analyse.budget.plafondDepenses != null ? fmt(analyse.budget.plafondDepenses) : '—'}
            {analyse.budget.ecart != null && analyse.budget.ecart > 0 && (
              <span className="text-[#f87171] ml-2">dépassé de {fmt(analyse.budget.ecart)}</span>
            )}
          </p>
        </div>
      )}

      <div className="bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-line)]">
        <p className="text-[var(--k-muted)] text-xs font-medium uppercase tracking-wide mb-3">Répartition par catégorie</p>
        {analyse.parCategorie.length === 0 ? (
          <p className="text-[var(--k-faint)] text-xs">Rien sur cette période.</p>
        ) : (
          <DepensesCategorieDonut data={analyse.parCategorie}
            onSelect={(code) => setCategorieOuverte({ code, libelle: analyse.parCategorie.find((c) => c.categorie === code)?.libelle ?? code })} />
        )}
      </div>

      <div className="bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-line)]">
        <p className="text-[var(--k-muted)] text-xs font-medium uppercase tracking-wide mb-1">Évolution sur 6 mois</p>
        <EvolutionMensuelleChart data={analyse.evolutionMensuelle} />
      </div>

      {analyse.postesEnHausse.length > 0 && (
        <div className="bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-line)]">
          <p className="text-[var(--k-muted)] text-xs font-medium uppercase tracking-wide mb-2">Postes en hausse</p>
          <div className="space-y-2">
            {analyse.postesEnHausse.map((p) => (
              <button key={p.categorie} onClick={() => setCategorieOuverte({ code: p.categorie, libelle: p.libelle })}
                className="w-full flex items-center justify-between text-sm hover:bg-[var(--k-surface-soft)] rounded-lg -mx-1 px-1 py-0.5 transition-colors">
                <span className="text-[var(--k-ink)]">{p.libelle}</span>
                <span className="text-[#f87171] font-mono text-xs">+{fmt(p.deltaMontant)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {analyse.topFournisseurs.length > 0 && (
        <div className="bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-line)]">
          <p className="text-[var(--k-muted)] text-xs font-medium uppercase tracking-wide mb-2">Fournisseurs les plus coûteux</p>
          <div className="space-y-2">
            {analyse.topFournisseurs.map((f) => (
              <div key={f.tiersId ?? f.nom} className="flex items-center justify-between text-sm">
                <span className="text-[var(--k-ink)] truncate">{f.nom} <span className="text-[var(--k-faint)]">×{f.nb}</span></span>
                <span className="text-[var(--k-ink)] font-mono text-xs">{fmt(f.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {analyse.parAgence.length > 1 && (
        <div className="bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-line)]">
          <p className="text-[var(--k-muted)] text-xs font-medium uppercase tracking-wide mb-2">Par agence</p>
          <div className="space-y-2">
            {analyse.parAgence.map((a) => (
              <div key={a.agence} className="flex items-center justify-between text-sm">
                <span className="text-[var(--k-ink)]">{a.agence}</span>
                <span className="text-[var(--k-ink)] font-mono text-xs">{fmt(a.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {analyse.inhabituelles.length > 0 && (
        <div className="bg-[#f87171]/8 rounded-2xl p-4 border border-[#f87171]/30">
          <p className="text-[#f87171] text-xs font-medium uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <IcoAlert cls="w-3.5 h-3.5" /> Dépenses inhabituelles
          </p>
          <div className="space-y-1">
            {analyse.inhabituelles.map((i) => (
              <button key={i.categorie} onClick={() => setCategorieOuverte({ code: i.categorie, libelle: i.libelle })}
                className="block w-full text-left text-[var(--k-ink)] text-xs hover:bg-[var(--k-surface-soft)] rounded-lg -mx-1 px-1 py-0.5 transition-colors">
                {i.libelle} : {fmt(i.total)} <span className="text-[var(--k-faint)]">(moyenne habituelle {fmt(i.moyenneHistorique)})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {analyse.recurrentes.length > 0 && (
        <div className="bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-line)]">
          <p className="text-[var(--k-muted)] text-xs font-medium uppercase tracking-wide mb-2">Dépenses récurrentes</p>
          <div className="space-y-2">
            {analyse.recurrentes.map((d) => (
              <button key={d.id} onClick={() => setDetail(d)}
                className="w-full flex items-center justify-between text-sm hover:bg-[var(--k-surface-soft)] rounded-lg -mx-1 px-1 py-0.5 transition-colors">
                <span className="text-[var(--k-ink)] truncate">{d.libelle}</span>
                <span className="text-[var(--k-ink)] font-mono text-xs">{fmt(d.montant)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {analyse.sansJustificatif.length > 0 && (
        <div className="bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-line)]">
          <p className="text-[var(--k-muted)] text-xs font-medium uppercase tracking-wide mb-2">Sans justificatif ({analyse.sansJustificatif.length})</p>
          <div className="space-y-2">
            {analyse.sansJustificatif.slice(0, 8).map((d) => (
              <button key={d.id} onClick={() => setDetail(d)}
                className="w-full flex items-center justify-between text-sm hover:bg-[var(--k-surface-soft)] rounded-lg -mx-1 px-1 py-0.5 transition-colors">
                <span className="text-[var(--k-ink)] truncate">{d.libelle}</span>
                <span className="text-[#fbbf24] font-mono text-xs">{fmt(d.montant)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {categorieOuverte && (
        <CategorieDrillDownSheet entreprise={entreprise} categorie={categorieOuverte.code} libelle={categorieOuverte.libelle}
          onClose={() => setCategorieOuverte(null)} onSelectDepense={setDetail} />
      )}
      {detail && (
        <DetailDepenseSheet entreprise={entreprise} depense={detail} onClose={() => setDetail(null)}
          onMaj={() => {
            listerDepensesParCategorie(entreprise.id, detail.categorie).then((liste) => {
              const maj = liste.find((d) => d.id === detail.id);
              if (maj) setDetail(maj);
            }).catch(() => {});
          }} />
      )}
    </div>
  );
}

/**
 * Drill-down d'une catégorie de dépense — retour testeur 2026-09-04 : « je devrais pouvoir
 * cliquer sur une catégorie pour voir les transactions, justificatifs, utilisateurs,
 * fournisseurs, budget consommé, écriture comptable ». Liste les dépenses de la catégorie sur le
 * mois en cours ; chaque ligne ouvre `DetailDepenseSheet`, qui porte déjà tout ce contexte.
 */
function CategorieDrillDownSheet({ entreprise, categorie, libelle, onClose, onSelectDepense }: {
  entreprise: EntrepriseResume; categorie: string; libelle: string; onClose: () => void; onSelectDepense: (d: Depense) => void;
}) {
  const [liste, setListe] = useState<Depense[] | null>(null);

  useEffect(() => {
    listerDepensesParCategorie(entreprise.id, categorie).then(setListe).catch(() => setListe([]));
  }, [entreprise.id, categorie]);

  const total = (liste ?? []).reduce((s, d) => s + d.montant, 0);
  const sansPiece = (liste ?? []).filter((d) => !d.piece_cle).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0e1c0f]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--k-line)] bg-[#0a1408] shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-[var(--k-surface-soft)] flex items-center justify-center text-[var(--k-muted)]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h2 className="text-[var(--k-ink)] font-semibold text-sm flex-1">{libelle}</h2>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-[var(--k-surface-soft)] flex items-center justify-center text-[var(--k-muted)]">
          <IcoX cls="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-5 space-y-4">
        {liste !== null && (
          <div className="bg-[var(--k-surface)] rounded-2xl p-4 text-center">
            <p className="text-[var(--k-faint)] text-xs">{liste.length} transaction{liste.length > 1 ? 's' : ''} ce mois-ci</p>
            <p className="text-[#f87171] font-mono font-bold text-2xl mt-0.5">{fmt(total)}</p>
            {sansPiece > 0 && <p className="text-[#fbbf24] text-xs mt-1">{sansPiece} sans justificatif</p>}
          </div>
        )}
        {liste === null ? (
          <p className="text-[var(--k-faint)] text-sm text-center py-8">Chargement…</p>
        ) : liste.length === 0 ? (
          <p className="text-[var(--k-faint)] text-sm text-center py-8">Aucune dépense dans cette catégorie ce mois-ci.</p>
        ) : (
          <div className="space-y-2">
            {liste.map((d) => (
              <button key={d.id} onClick={() => onSelectDepense(d)}
                className="w-full bg-[var(--k-surface)] rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-[var(--k-surface-soft)] transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-[var(--k-ink)] font-medium text-sm truncate">{d.libelle}</p>
                  <p className="text-[var(--k-faint)] text-xs mt-0.5">
                    {d.date.slice(0, 10)}{d.tiers_nom ? ` · ${d.tiers_nom}` : ''}{d.agence ? ` · ${d.agence}` : ''}
                  </p>
                </div>
                {d.piece_cle && <IcoFile cls="w-4 h-4 text-[var(--k-lime)] shrink-0" />}
                <span className="text-[#f87171] font-mono font-semibold text-sm shrink-0">−{fmt(d.montant)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailDepenseSheet({ entreprise, depense, onClose, onMaj }: {
  entreprise: EntrepriseResume; depense: Depense; onClose: () => void; onMaj: () => void;
}) {
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const [membres, setMembres] = useState<Membre[] | null>(null);

  useEffect(() => { listerMembres(entreprise.id).then(setMembres).catch(() => setMembres([])); }, [entreprise.id]);
  const nomCreateur = membres?.find((m) => m.id === depense.cree_par)?.nom ?? depense.cree_par;

  async function ajouterPiece(fichier: File) {
    setCharge(true); setErreur('');
    try {
      await televerserPieceDepense(entreprise.id, depense.id, fichier);
      onMaj();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }
  async function voirPiece() {
    try { window.open(await urlPieceDepense(entreprise.id, depense.id), '_blank'); } catch { /* ignore */ }
  }
  async function retirerPiece() {
    if (!confirm('Retirer la pièce jointe de cette dépense ?')) return;
    setCharge(true);
    try { await supprimerPieceDepense(entreprise.id, depense.id); onMaj(); } finally { setCharge(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0e1c0f]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--k-line)] bg-[#0a1408] shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-[var(--k-surface-soft)] flex items-center justify-center text-[var(--k-muted)]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h2 className="text-[var(--k-ink)] font-semibold text-sm flex-1">{depense.libelle}</h2>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-[var(--k-surface-soft)] flex items-center justify-center text-[var(--k-muted)]">
          <IcoX cls="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-5 space-y-4">
        <div className="bg-[var(--k-surface)] rounded-2xl p-4 text-center">
          <p className="text-[var(--k-faint)] text-xs">{labelCategorie(depense.categorie)}</p>
          <p className="text-[#f87171] font-mono font-bold text-2xl mt-0.5">−{fmt(depense.montant)}</p>
        </div>

        <div className="bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-line)] space-y-2">
          <p className="text-[var(--k-muted)] text-xs font-medium uppercase tracking-wide mb-1">Contexte</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--k-faint)] text-xs">Date</span>
            <span className="text-[var(--k-ink)]">{depense.date.slice(0, 10)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--k-faint)] text-xs">Mode de paiement</span>
            <span className="text-[var(--k-ink)]">{MODES_PAIEMENT.find((m) => m.value === depense.mode_paiement)?.label ?? depense.mode_paiement}</span>
          </div>
          {depense.tiers_nom && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--k-faint)] text-xs">Fournisseur</span>
              <span className="text-[var(--k-ink)]">{depense.tiers_nom}</span>
            </div>
          )}
          {depense.agence && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--k-faint)] text-xs">Agence</span>
              <span className="text-[var(--k-ink)]">{depense.agence}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--k-faint)] text-xs">Enregistrée par</span>
            <span className="text-[var(--k-ink)]">{nomCreateur ?? '—'}</span>
          </div>
          {depense.ecriture_id && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--k-faint)] text-xs">Écriture comptable</span>
              <span className="text-[var(--k-faint)] font-mono text-[10px]">{depense.ecriture_id.slice(0, 8)}</span>
            </div>
          )}
        </div>

        <div>
          <p className="text-[var(--k-muted)] text-xs font-medium uppercase tracking-wide mb-2">Pièce justificative</p>
          {depense.piece_cle ? (
            <div className="flex gap-2 flex-wrap">
              <button onClick={voirPiece} className="bg-[var(--k-surface-soft)] text-[var(--k-ink)] rounded-xl px-3 py-2 text-xs font-medium border border-[var(--k-line)]">Voir la pièce</button>
              <button onClick={() => document.getElementById('piece-input')?.click()} disabled={charge}
                className="bg-[var(--k-surface-soft)] text-[var(--k-ink)] rounded-xl px-3 py-2 text-xs font-medium border border-[var(--k-line)] disabled:opacity-40">Remplacer</button>
              <button onClick={retirerPiece} disabled={charge}
                className="text-[#f87171] text-xs font-medium px-3 py-2 hover:bg-[#f87171]/8 rounded-xl transition-colors disabled:opacity-40">Retirer</button>
            </div>
          ) : (
            <>
              <p className="text-[var(--k-faint)] text-xs mb-2 leading-relaxed">Photo du reçu/de la facture — utile pour retrouver le justificatif plus tard.</p>
              <button onClick={() => document.getElementById('piece-input')?.click()} disabled={charge}
                className="bg-[var(--k-surface-soft)] text-[var(--k-lime)] rounded-xl px-4 py-2.5 text-sm font-medium border border-[var(--k-lime)]/20 disabled:opacity-40">
                {charge ? 'Envoi…' : 'Joindre une photo/PDF'}
              </button>
            </>
          )}
          <input id="piece-input" type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void ajouterPiece(f); e.target.value = ''; }} />
          {erreur && <p className="text-[#f87171] text-xs mt-2">{erreur}</p>}
        </div>
      </div>
    </div>
  );
}

function NouvelleDepenseSheet({ entreprise, onClose, onCree }: {
  entreprise: EntrepriseResume; onClose: () => void; onCree: () => void;
}) {
  const [categorie, setCategorie] = useState(CATEGORIES_DEPENSE[0]!.code);
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState('');
  const [mode, setMode] = useState('especes');
  const [recurrente, setRecurrente] = useState(false);
  const [dateOperation, setDateOperation] = useState('');
  const [agence, setAgence] = useState('');
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const [texteScan, setTexteScan] = useState('');
  const [lectureEnCours, setLectureEnCours] = useState(false);

  async function scanner(fichier: File) {
    setLectureEnCours(true); setTexteScan('');
    try {
      setTexteScan(await lireTexteImage(fichier) || '(aucun texte détecté)');
    } catch {
      setTexteScan('Lecture impossible sur cette image.');
    } finally { setLectureEnCours(false); }
  }

  async function creer() {
    setCharge(true); setErreur('');
    try {
      const clientUuid = nouvelUuid();
      await enfilerMutation({
        clientUuid, entrepriseId: entreprise.id, type: 'depense',
        payload: {
          categorie, libelle: libelle.trim() || labelCategorie(categorie), montant: Number(montant),
          modePaiement: mode, recurrente, dateOperation: dateOperation || null, agence: agence.trim() || null,
        },
      });
      await synchroniser();
      onCree();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0e1c0f]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--k-line)] bg-[#0a1408] shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-[var(--k-surface-soft)] flex items-center justify-center text-[var(--k-muted)]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h2 className="text-[var(--k-ink)] font-semibold text-sm flex-1">Nouvelle dépense</h2>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-[var(--k-surface-soft)] flex items-center justify-center text-[var(--k-muted)]">
          <IcoX cls="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-5 space-y-4">
        <div className="bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-line)]">
          <div className="flex items-center gap-2 mb-2">
            <IcoFile cls="w-4 h-4 text-[var(--k-lime)]" />
            <p className="text-[var(--k-ink)] text-sm font-medium">Scanner un reçu (optionnel)</p>
          </div>
          <p className="text-[var(--k-faint)] text-xs leading-relaxed mb-2">
            Lit le texte de la photo pour vous aider à recopier le montant et le fournisseur —
            rien n'est rempli automatiquement. La pièce elle-même se joint après l'enregistrement.
          </p>
          <input type="file" accept="image/*" capture="environment" className="text-xs text-[var(--k-muted)]"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void scanner(f); }} />
          {lectureEnCours && <p className="text-[var(--k-faint)] text-xs mt-2">Lecture en cours…</p>}
          {texteScan && (
            <textarea readOnly value={texteScan} rows={5}
              className="w-full mt-2 bg-[var(--k-surface-soft)] text-[var(--k-ink)] text-xs rounded-xl p-3 border border-[var(--k-line)] resize-y" />
          )}
        </div>

        <div>
          <label className="text-[var(--k-muted)] text-xs font-medium block mb-1.5">Catégorie</label>
          <select value={categorie} onChange={(e) => setCategorie(e.target.value)} className={inputCls}>
            {CATEGORIES_DEPENSE.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[var(--k-muted)] text-xs font-medium block mb-1.5">Libellé</label>
          <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder={`Ex. ${labelCategorie(categorie)} de ce mois`} className={inputCls} />
        </div>
        <div>
          <label className="text-[var(--k-muted)] text-xs font-medium block mb-1.5">Montant (FCFA)</label>
          <input inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value.replace(/\D/g, ''))} placeholder="25000" className={inputCls} />
        </div>
        <div>
          <label className="text-[var(--k-muted)] text-xs font-medium block mb-1.5">Mode de paiement</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls}>
            {MODES_PAIEMENT.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[var(--k-muted)] text-xs font-medium block mb-1.5">Date de la dépense (optionnel)</label>
          <input type="date" value={dateOperation} onChange={(e) => setDateOperation(e.target.value)} className={`${inputCls} [color-scheme:dark]`} />
        </div>
        <div>
          <label className="text-[var(--k-muted)] text-xs font-medium block mb-1.5">Agence (optionnel)</label>
          <input value={agence} onChange={(e) => setAgence(e.target.value)} placeholder="Ex. Agence Bonanjo" className={inputCls} />
        </div>
        <label className="flex items-center gap-2.5 text-sm text-[var(--k-ink)]">
          <input type="checkbox" checked={recurrente} onChange={(e) => setRecurrente(e.target.checked)} className="accent-[#3a9e6e] w-4 h-4" />
          Dépense récurrente (loyer, abonnement…)
        </label>
        {erreur && (
          <div className="flex items-start gap-2">
            <IcoAlert cls="w-4 h-4 text-[#f87171] shrink-0 mt-0.5" />
            <p className="text-[#f87171] text-xs">{erreur}</p>
          </div>
        )}
      </div>
      <div className="border-t border-[var(--k-line)] px-4 py-3 bg-[#0a1408] shrink-0">
        <button onClick={creer} disabled={charge || !montant || Number(montant) <= 0}
          className="w-full bg-[#3a9e6e] text-white rounded-2xl py-4 font-semibold text-base active:scale-95 transition-all disabled:opacity-40">
          {charge ? '…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
