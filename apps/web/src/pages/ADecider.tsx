/**
 * À décider — absent du prototype Figma Make, design original dans le même langage visuel.
 * Répond au repositionnement « pilotage » (audit 2026-09-04) : au lieu d'obliger le dirigeant à
 * consulter chaque module, une synthèse quotidienne des 3 problèmes les plus importants
 * (impact financier), avec cause, urgence et une action pour y aller directement.
 */
import { useEffect, useState } from 'react';
import { formaterFCFA as fmt } from '@kombi/shared';
import { listerDecisions, type EntrepriseResume, type Decision } from '../lib/api.js';
import { IcoChevR, IcoAlert } from '../components/icons.js';

const URGENCE_STYLE: Record<Decision['urgence'], { fond: string; bord: string; texte: string; label: string }> = {
  haute: { fond: 'bg-[#f87171]/8', bord: 'border-[#f87171]/30', texte: 'text-[#f87171]', label: 'Urgent' },
  moyenne: { fond: 'bg-[#fbbf24]/8', bord: 'border-[#fbbf24]/30', texte: 'text-[#fbbf24]', label: 'À surveiller' },
  faible: { fond: 'bg-[#60a5fa]/8', bord: 'border-[#60a5fa]/30', texte: 'text-[#60a5fa]', label: 'Pour info' },
};

export function ADecider({ entreprise, onRetour, onNav }: {
  entreprise: EntrepriseResume; onRetour: () => void; onNav: (code: string) => void;
}) {
  const [problemes, setProblemes] = useState<Decision[] | null>(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    listerDecisions(entreprise.id).then(setProblemes).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }, [entreprise.id]);

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-8 pt-4 pb-2 flex items-center gap-2">
        <button onClick={onRetour} className="w-9 h-9 shrink-0 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h1 className="text-[#edf5ea] text-lg font-bold flex-1">À décider aujourd'hui</h1>
      </div>

      {erreur && <p className="text-[#f87171] text-sm px-4 md:px-8">{erreur}</p>}

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-3 pt-2">
        {problemes === null ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
        ) : problemes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#4ade80] text-2xl mb-2">✓</p>
            <p className="text-[#edf5ea] text-sm font-medium">Rien d'urgent aujourd'hui</p>
            <p className="text-[#4a6b4a] text-xs mt-1">Aucun problème prioritaire détecté sur vos données actuelles.</p>
          </div>
        ) : (
          problemes.map((p, i) => {
            const s = URGENCE_STYLE[p.urgence];
            return (
              <div key={i} className={`rounded-2xl p-4 border ${s.fond} ${s.bord}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full ${s.fond} flex items-center justify-center shrink-0 ${s.texte}`}>
                    <IcoAlert cls="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[#edf5ea] font-semibold text-sm">{p.probleme}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.texte} ${s.fond} border ${s.bord}`}>{s.label}</span>
                    </div>
                    <p className="text-[#4a6b4a] text-xs mt-1 leading-relaxed">{p.cause}</p>
                    <p className={`font-mono font-bold text-lg mt-2 ${s.texte}`}>{fmt(p.impactFinancier)}</p>
                    <button onClick={() => onNav(p.actionCible.page)}
                      className="mt-3 bg-[#1e3222] text-[#edf5ea] rounded-xl px-3.5 py-2 text-xs font-semibold border border-[#2a4230]">
                      {p.actionSuggeree} →
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
