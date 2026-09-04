/**
 * Rentabilité — marge par produit, absent du prototype Figma Make, design original dans le même
 * langage visuel. Répond au repositionnement « pilotage » (voir docs/PLAN-cockpit-dirigeant.md,
 * DECISIONS.md D18) : au-delà du volume vendu (déjà visible dans "Meilleures ventes" du Dashboard),
 * cet écran répond à « qu'est-ce qui me rapporte VRAIMENT ? », qui peut être très différent.
 */
import { useEffect, useState } from 'react';
import { formaterFCFA as fmt } from '@kombi/shared';
import { listerMargeProduits, type EntrepriseResume, type MargeProduit } from '../lib/api.js';
import { IcoChevR } from '../components/icons.js';

export function Rentabilite({ entreprise, onRetour }: { entreprise: EntrepriseResume; onRetour: () => void }) {
  const [produits, setProduits] = useState<MargeProduit[] | null>(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    listerMargeProduits(entreprise.id).then(setProduits).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }, [entreprise.id]);

  const margeTotale = (produits ?? []).reduce((s, p) => s + p.marge, 0);

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-8 pt-4 pb-2 flex items-center gap-2">
        <button onClick={onRetour} className="w-9 h-9 shrink-0 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h1 className="text-[#edf5ea] text-lg font-bold flex-1">Rentabilité par produit</h1>
      </div>

      {erreur && <p className="text-[#f87171] text-sm px-4 md:px-8">{erreur}</p>}

      {produits !== null && produits.length > 0 && (
        <div className="px-4 md:px-8 pb-2">
          <div className="bg-[#162419] rounded-2xl p-4 text-center">
            <p className="text-[#4a6b4a] text-xs">Marge brute cumulée (exercice en cours)</p>
            <p className="text-[#4ade80] font-mono font-bold text-2xl mt-0.5">{fmt(margeTotale)}</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-2 pt-1">
        {produits === null ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
        ) : produits.length === 0 ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Aucune vente enregistrée cet exercice.</p>
        ) : (
          produits.map((p) => {
            const perte = p.marge < 0;
            return (
              <div key={p.designation} className="bg-[#162419] rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[#edf5ea] font-medium text-sm truncate">{p.designation}</p>
                    <p className="text-[#4a6b4a] text-xs mt-0.5">
                      {p.quantite} vendu{p.quantite > 1 ? 's' : ''} · CA {fmt(p.ca_ht)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-mono font-semibold text-sm ${perte ? 'text-[#f87171]' : 'text-[#4ade80]'}`}>
                      {perte ? '−' : '+'}{fmt(Math.abs(p.marge))}
                    </p>
                    {p.margePct !== null && (
                      <p className={`text-xs mt-0.5 ${perte ? 'text-[#f87171]' : 'text-[#6b9165]'}`}>{p.margePct} % de marge</p>
                    )}
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
