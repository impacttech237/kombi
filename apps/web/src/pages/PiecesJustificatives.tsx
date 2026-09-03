/**
 * Pièces justificatives — écran centralisé (dépenses + achats fournisseurs + ventes à crédit),
 * absent du prototype Figma Make. Répond au besoin du comptable de retrouver un justificatif sans
 * ouvrir chaque écran un par un — voir routes/pieces.ts pour l'agrégation côté serveur.
 */
import { useEffect, useMemo, useState } from 'react';
import { formaterFCFA as fmt } from '@kombi/shared';
import { listerPiecesJustificatives, urlPiece, type EntrepriseResume, type PieceJustificative } from '../lib/api.js';
import { IcoChevR, IcoSearch, IcoFile } from '../components/icons.js';

const LABEL_TYPE: Record<PieceJustificative['type'], string> = {
  depense: 'Dépense', achat: 'Achat fournisseur', vente: 'Vente à crédit',
};
const CLS_TYPE: Record<PieceJustificative['type'], string> = {
  depense: 'bg-[#f87171]/15 text-[#f87171]', achat: 'bg-[#fbbf24]/15 text-[#fbbf24]', vente: 'bg-[#4ade80]/10 text-[#4ade80]',
};

export function PiecesJustificatives({ entreprise, onRetour }: { entreprise: EntrepriseResume; onRetour: () => void }) {
  const [pieces, setPieces] = useState<PieceJustificative[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [recherche, setRecherche] = useState('');
  const [filtreType, setFiltreType] = useState<'all' | PieceJustificative['type']>('all');

  useEffect(() => {
    listerPiecesJustificatives(entreprise.id).then(setPieces).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }, [entreprise.id]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (pieces ?? []).filter((p) =>
      (filtreType === 'all' || p.type === filtreType)
      && (!q || p.libelle.toLowerCase().includes(q) || (p.tiers_nom ?? '').toLowerCase().includes(q)));
  }, [pieces, recherche, filtreType]);

  async function ouvrir(p: PieceJustificative) {
    try { window.open(await urlPiece(p.type, entreprise.id, p.id), '_blank'); } catch { /* ignore */ }
  }

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-8 pt-4 pb-2 flex items-center gap-2">
        <button onClick={onRetour} className="w-9 h-9 shrink-0 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h1 className="text-[#edf5ea] text-lg font-bold flex-1">Pièces justificatives</h1>
      </div>

      {erreur && <p className="text-[#f87171] text-sm px-4 md:px-8">{erreur}</p>}

      <div className="px-4 md:px-8 pb-2 space-y-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6b4a]"><IcoSearch cls="w-4 h-4" /></span>
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher par libellé, client, fournisseur..."
            className="w-full bg-[#162419] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl pl-9 pr-4 py-3 text-sm border border-[#2a4230] focus:border-[#b4e033] focus:outline-none" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {(['all', 'depense', 'achat', 'vente'] as const).map((t) => (
            <button key={t} onClick={() => setFiltreType(t)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filtreType === t ? 'bg-[#b4e033] text-[#0e1c0f]' : 'bg-[#1e3222] text-[#6b9165] border border-[#2a4230]'}`}>
              {t === 'all' ? 'Tous' : LABEL_TYPE[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-2 pt-1">
        {pieces === null ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
        ) : filtrees.length === 0 ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">
            {pieces.length === 0 ? 'Aucune pièce jointe pour l\'instant.' : 'Aucun résultat pour cette recherche.'}
          </p>
        ) : (
          filtrees.map((p) => (
            <button key={`${p.type}-${p.id}`} onClick={() => void ouvrir(p)}
              className="w-full bg-[#162419] rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-[#1e3222] transition-colors">
              <div className="w-9 h-9 rounded-full bg-[#1e3222] flex items-center justify-center shrink-0">
                <IcoFile cls="w-4 h-4 text-[#b4e033]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#edf5ea] font-medium text-sm truncate">{p.libelle}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${CLS_TYPE[p.type]}`}>{LABEL_TYPE[p.type]}</span>
                  <span className="text-[#4a6b4a] text-xs">{p.date}</span>
                </div>
              </div>
              <span className="text-[#edf5ea] font-mono text-sm font-semibold shrink-0">{fmt(p.montant)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
