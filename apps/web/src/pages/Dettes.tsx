/**
 * Dettes (« ce que je dois ») — absent du prototype Figma Make, design original dans le même
 * langage visuel que les écrans portés. Argent pas encore payé, distinct du flux de transactions
 * réalisées de Trésorerie (voir docs/parcours.md).
 */
import { useEffect, useState } from 'react';
import { formaterFCFA as fmt } from '@kombi/shared';
import { listerDettesFournisseurs, type EntrepriseResume, type DetteFournisseur } from '../lib/api.js';
import { enfilerMutation, nouvelUuid } from '../offline/db.js';
import { synchroniser } from '../offline/sync.js';
import { IcoChevR } from '../components/icons.js';

const MODES = [
  { value: 'especes', label: 'Espèces' }, { value: 'mtn_momo', label: 'MTN MoMo' },
  { value: 'orange_money', label: 'Orange Money' }, { value: 'virement', label: 'Virement' },
];

export function Dettes({ entreprise, onRetour }: { entreprise: EntrepriseResume; onRetour: () => void }) {
  const [dettes, setDettes] = useState<DetteFournisseur[] | null>(null);
  const [erreur, setErreur] = useState('');

  function recharger() {
    listerDettesFournisseurs(entreprise.id).then(setDettes).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }
  useEffect(recharger, [entreprise.id]);

  const total = (dettes ?? []).reduce((s, d) => s + (d.total_ttc - d.regle), 0);

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-8 pt-4 pb-2 flex items-center gap-2">
        <button onClick={onRetour} className="w-9 h-9 shrink-0 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h1 className="text-[#edf5ea] text-lg font-bold flex-1">Ce que je dois</h1>
      </div>

      {erreur && <p className="text-[#f87171] text-sm px-4 md:px-8">{erreur}</p>}

      {dettes !== null && dettes.length > 0 && (
        <div className="px-4 md:px-8 pb-2">
          <div className="bg-[#162419] rounded-2xl p-4 text-center">
            <p className="text-[#4a6b4a] text-xs">Total dû aux fournisseurs</p>
            <p className="text-[#f87171] font-mono font-bold text-2xl mt-0.5">{fmt(total)}</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-2 pt-1">
        {dettes === null ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
        ) : dettes.length === 0 ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Aucune dette en cours. Rien à régler !</p>
        ) : (
          dettes.map((d) => <LigneDette key={d.id} entreprise={entreprise} dette={d} onFait={recharger} />)
        )}
      </div>
    </div>
  );
}

function LigneDette({ entreprise, dette, onFait }: {
  entreprise: EntrepriseResume; dette: DetteFournisseur; onFait: () => void;
}) {
  const du = dette.total_ttc - dette.regle;
  const [ouvert, setOuvert] = useState(false);
  const [montant, setMontant] = useState(String(du));
  const [mode, setMode] = useState('especes');
  const [charge, setCharge] = useState(false);

  async function regler() {
    setCharge(true);
    try {
      const clientUuid = nouvelUuid();
      await enfilerMutation({
        clientUuid, entrepriseId: entreprise.id, type: 'paiement_achat',
        payload: { achatId: dette.id, montant: Math.min(du, Number(montant) || 0), modePaiement: mode },
      });
      await synchroniser();
      setOuvert(false); onFait();
    } finally { setCharge(false); }
  }

  return (
    <div className="bg-[#162419] rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[#edf5ea] font-medium text-sm truncate">{dette.tiers_nom ?? 'Fournisseur'}</p>
          <p className="text-[#4a6b4a] text-xs mt-0.5">{dette.statut === 'payee_partiellement' ? 'Partiellement réglée' : 'Achat à crédit'}</p>
        </div>
        <p className="text-[#f87171] font-mono font-semibold text-sm shrink-0">{fmt(du)}</p>
        <button onClick={() => setOuvert(!ouvert)}
          className="bg-[#1e3222] text-[#edf5ea] text-xs px-3 py-2 rounded-xl font-medium border border-[#2a4230] shrink-0">
          Régler
        </button>
      </div>
      {ouvert && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-[#1e3222] flex-wrap">
          <input value={montant} inputMode="numeric" onChange={(e) => setMontant(e.target.value.replace(/\D/g, ''))}
            className="w-28 bg-[#1e3222] text-[#edf5ea] text-sm rounded-xl px-3 py-2.5 border border-[#2a4230] focus:border-[#b4e033] focus:outline-none" />
          <select value={mode} onChange={(e) => setMode(e.target.value)}
            className="bg-[#1e3222] text-[#edf5ea] text-sm rounded-xl px-3 py-2.5 border border-[#2a4230] focus:border-[#b4e033] focus:outline-none">
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button onClick={regler} disabled={charge || !montant}
            className="bg-[#b4e033] text-[#0e1c0f] rounded-xl px-4 py-2.5 text-sm font-semibold active:scale-95 transition-all disabled:opacity-40">
            {charge ? '…' : 'Valider'}
          </button>
        </div>
      )}
    </div>
  );
}
