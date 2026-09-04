/**
 * Rentabilité — marge par produit/client, absent du prototype Figma Make, design original dans
 * le même langage visuel. Répond au repositionnement « pilotage » (voir
 * docs/PLAN-cockpit-dirigeant.md, DECISIONS.md D18) : au-delà du volume vendu (déjà visible dans
 * "Meilleures ventes" du Dashboard), cet écran répond à « qu'est-ce qui/qui me rapporte
 * VRAIMENT ? », qui peut être très différent — un client fidèle sur de petits volumes peut être
 * plus rentable qu'un gros client négocié à la marge.
 */
import { useEffect, useState } from 'react';
import { formaterFCFA as fmt } from '@kombi/shared';
import { listerMargeProduits, listerMargeClients, type EntrepriseResume, type MargeProduit, type MargeClient } from '../lib/api.js';
import { IcoChevR } from '../components/icons.js';

interface Ligne { cle: string; titre: string; sousTitre: string; marge: number; margePct: number | null; }

export function Rentabilite({ entreprise, onRetour }: { entreprise: EntrepriseResume; onRetour: () => void }) {
  const [onglet, setOnglet] = useState<'produits' | 'clients'>('produits');
  const [produits, setProduits] = useState<MargeProduit[] | null>(null);
  const [clients, setClients] = useState<MargeClient[] | null>(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    listerMargeProduits(entreprise.id).then(setProduits).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
    listerMargeClients(entreprise.id).then(setClients).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }, [entreprise.id]);

  const donnees = onglet === 'produits' ? produits : clients;
  const lignes: Ligne[] | null = donnees === null ? null : onglet === 'produits'
    ? (produits as MargeProduit[]).map((p) => ({
        cle: p.designation, titre: p.designation, sousTitre: `${p.quantite} vendu${p.quantite > 1 ? 's' : ''} · CA ${fmt(p.ca_ht)}`,
        marge: p.marge, margePct: p.margePct,
      }))
    : (clients as MargeClient[]).map((c) => ({
        cle: c.tiers_id ?? c.nom, titre: c.nom, sousTitre: `${c.nb_ventes} vente${c.nb_ventes > 1 ? 's' : ''} · CA ${fmt(c.ca_ht)}`,
        marge: c.marge, margePct: c.margePct,
      }));

  const margeTotale = (donnees ?? []).reduce((s, d) => s + d.marge, 0);

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-8 pt-4 pb-2 flex items-center gap-2">
        <button onClick={onRetour} className="w-9 h-9 shrink-0 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h1 className="text-[#edf5ea] text-lg font-bold flex-1">Rentabilité</h1>
      </div>

      <div className="px-4 md:px-8 pb-2 flex gap-2">
        {(['produits', 'clients'] as const).map((o) => (
          <button key={o} onClick={() => setOnglet(o)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${onglet === o ? 'bg-[#b4e033] text-[#0e1c0f]' : 'bg-[#1e3222] text-[#6b9165] border border-[#2a4230]'}`}>
            {o === 'produits' ? 'Par produit' : 'Par client'}
          </button>
        ))}
      </div>

      {erreur && <p className="text-[#f87171] text-sm px-4 md:px-8">{erreur}</p>}

      {donnees !== null && donnees.length > 0 && (
        <div className="px-4 md:px-8 pb-2">
          <div className="bg-[#162419] rounded-2xl p-4 text-center">
            <p className="text-[#4a6b4a] text-xs">Marge brute cumulée (exercice en cours)</p>
            <p className="text-[#4ade80] font-mono font-bold text-2xl mt-0.5">{fmt(margeTotale)}</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-2 pt-1">
        {lignes === null ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
        ) : lignes.length === 0 ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Aucune vente enregistrée cet exercice.</p>
        ) : (
          lignes.map((l) => {
            const perte = l.marge < 0;
            return (
              <div key={l.cle} className="bg-[#162419] rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[#edf5ea] font-medium text-sm truncate">{l.titre}</p>
                    <p className="text-[#4a6b4a] text-xs mt-0.5">{l.sousTitre}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-mono font-semibold text-sm ${perte ? 'text-[#f87171]' : 'text-[#4ade80]'}`}>
                      {perte ? '−' : '+'}{fmt(Math.abs(l.marge))}
                    </p>
                    {l.margePct !== null && (
                      <p className={`text-xs mt-0.5 ${perte ? 'text-[#f87171]' : 'text-[#6b9165]'}`}>{l.margePct} % de marge</p>
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
