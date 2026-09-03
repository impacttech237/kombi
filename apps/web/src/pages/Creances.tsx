/**
 * Créances (« on me doit ») — absent du prototype Figma Make, design original dans le même
 * langage visuel que les écrans portés. Argent pas encore encaissé, distinct du flux de
 * transactions réalisées de Trésorerie (voir docs/parcours.md).
 */
import { useEffect, useState } from 'react';
import { formaterFCFA as fmt } from '@kombi/shared';
import {
  listerVentesACredit, listerFacturesImpayees,
  type EntrepriseResume, type VenteACredit, type FactureImpayee,
} from '../lib/api.js';
import { enfilerMutation, nouvelUuid } from '../offline/db.js';
import { synchroniser } from '../offline/sync.js';
import { IcoChevR } from '../components/icons.js';

/** Offline-first : encaissement mis en file localement, synchronisé dès que possible. */
async function encaisserOffline(
  entrepriseId: string, type: 'paiement_vente' | 'paiement_facture', idField: string, id: string,
  montant: number, modePaiement: string,
): Promise<void> {
  const clientUuid = nouvelUuid();
  await enfilerMutation({ clientUuid, entrepriseId, type, payload: { [idField]: id, montant, modePaiement } });
  await synchroniser();
}

const MODES = [
  { value: 'especes', label: 'Espèces' }, { value: 'mtn_momo', label: 'MTN MoMo' },
  { value: 'orange_money', label: 'Orange Money' }, { value: 'virement', label: 'Virement' },
];

export function Creances({ entreprise, onRetour }: { entreprise: EntrepriseResume; onRetour: () => void }) {
  const [ventes, setVentes] = useState<VenteACredit[] | null>(null);
  const [factures, setFactures] = useState<FactureImpayee[] | null>(null);
  const [erreur, setErreur] = useState('');

  function recharger() {
    listerVentesACredit(entreprise.id).then(setVentes).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
    listerFacturesImpayees(entreprise.id).then(setFactures).catch(() => {});
  }
  useEffect(recharger, [entreprise.id]);

  const chargement = ventes === null || factures === null;
  const total = (ventes ?? []).reduce((s, v) => s + (v.total_ttc - v.regle), 0)
    + (factures ?? []).reduce((s, f) => s + f.montantDu, 0);

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-8 pt-4 pb-2 flex items-center gap-2">
        <button onClick={onRetour} className="w-9 h-9 shrink-0 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h1 className="text-[#edf5ea] text-lg font-bold flex-1">On me doit</h1>
      </div>

      {erreur && <p className="text-[#f87171] text-sm px-4 md:px-8">{erreur}</p>}

      {!chargement && (ventes!.length > 0 || factures!.length > 0) && (
        <div className="px-4 md:px-8 pb-2">
          <div className="bg-[#162419] rounded-2xl p-4 text-center">
            <p className="text-[#4a6b4a] text-xs">Total dû par les clients</p>
            <p className="text-[#fbbf24] font-mono font-bold text-2xl mt-0.5">{fmt(total)}</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-2 pt-1">
        {chargement ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
        ) : ventes!.length === 0 && factures!.length === 0 ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Aucune créance en cours. Personne ne vous doit rien !</p>
        ) : (
          <>
            {ventes!.map((v) => (
              <LigneCreance key={v.id} titre={v.tiers_nom ?? 'Client'}
                sousTitre={v.date_echeance ? `Vente à crédit · échéance ${v.date_echeance}` : 'Vente à crédit'}
                du={v.total_ttc - v.regle} enRetard={v.enRetard}
                onPayer={(montant, mode) => encaisserOffline(entreprise.id, 'paiement_vente', 'venteId', v.id, montant, mode)}
                onFait={recharger} />
            ))}
            {factures!.map((f) => (
              <LigneCreance key={f.id} titre={f.tiers_nom ?? 'Client'} sousTitre={f.numero} du={f.montantDu} enRetard={f.enRetard}
                onPayer={(montant, mode) => encaisserOffline(entreprise.id, 'paiement_facture', 'factureId', f.id, montant, mode)}
                onFait={recharger} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function LigneCreance({ titre, sousTitre, du, enRetard, onPayer, onFait }: {
  titre: string; sousTitre: string; du: number; enRetard?: boolean;
  onPayer: (montant: number, mode: string) => Promise<unknown>; onFait: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [montant, setMontant] = useState(String(du));
  const [mode, setMode] = useState('especes');
  const [charge, setCharge] = useState(false);

  async function encaisser() {
    setCharge(true);
    try {
      await onPayer(Math.min(du, Number(montant) || 0), mode);
      setOuvert(false); onFait();
    } finally { setCharge(false); }
  }

  return (
    <div className="bg-[#162419] rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[#edf5ea] font-medium text-sm truncate">{titre}</p>
          <p className="text-[#4a6b4a] text-xs mt-0.5">{sousTitre}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[#fbbf24] font-mono font-semibold text-sm">{fmt(du)}</p>
          {enRetard && <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-[#f87171]/15 text-[#f87171] mt-0.5 inline-block">En retard</span>}
        </div>
        <button onClick={() => setOuvert(!ouvert)}
          className="bg-[#1e3222] text-[#b4e033] text-xs px-3 py-2 rounded-xl font-medium border border-[#b4e033]/20 shrink-0">
          Encaisser
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
          <button onClick={encaisser} disabled={charge || !montant}
            className="bg-[#b4e033] text-[#0e1c0f] rounded-xl px-4 py-2.5 text-sm font-semibold active:scale-95 transition-all disabled:opacity-40">
            {charge ? '…' : 'Valider'}
          </button>
        </div>
      )}
    </div>
  );
}
