/**
 * Historique des ventes — absent du prototype Figma Make, design original dans le même langage
 * visuel que les écrans portés (accessible depuis Caisse → « Historique »).
 */
import { useEffect, useState } from 'react';
import { formaterFCFA as fmt, peut, type RoleMembre } from '@kombi/shared';
import {
  listerVentesRecentes, annulerVente, creerFactureDepuisVente, type EntrepriseResume, type VenteRecente,
} from '../lib/api.js';
import { IcoChevR } from '../components/icons.js';

const LIBELLE_MODE: Record<string, string> = {
  especes: 'Espèces', mtn_momo: 'MTN MoMo', orange_money: 'Orange Money', virement: 'Virement',
  cheque: 'Chèque', autre: 'Autre',
};
const LIBELLE_STATUT: Record<string, string> = {
  payee: 'Payée', a_credit: 'À crédit', payee_partiellement: 'Partiellement réglée', annulee: 'Annulée',
};

export function Ventes({ entreprise, role, onRetour }: {
  entreprise: EntrepriseResume; role: RoleMembre; onRetour: () => void;
}) {
  const [ventes, setVentes] = useState<VenteRecente[] | null>(null);
  const [erreur, setErreur] = useState('');
  const peutAnnuler = peut(role, 'vente:annuler');

  function recharger() {
    listerVentesRecentes(entreprise.id).then(setVentes).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }
  useEffect(recharger, [entreprise.id]);

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-8 pt-4 pb-2 flex items-center gap-2">
        <button onClick={onRetour} className="w-9 h-9 shrink-0 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h1 className="text-[#edf5ea] text-lg font-bold flex-1">Historique des ventes</h1>
      </div>

      {erreur && <p className="text-[#f87171] text-sm px-4 md:px-8">{erreur}</p>}

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-2 pt-1">
        {ventes === null ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
        ) : ventes.length === 0 ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Aucune vente enregistrée pour l'instant.</p>
        ) : (
          ventes.map((v) => <LigneVente key={v.id} entreprise={entreprise} vente={v} peutAnnuler={peutAnnuler} onFait={recharger} />)
        )}
      </div>
    </div>
  );
}

function LigneVente({ entreprise, vente, peutAnnuler, onFait }: {
  entreprise: EntrepriseResume; vente: VenteRecente; peutAnnuler: boolean; onFait: () => void;
}) {
  const [confirmation, setConfirmation] = useState(false);
  const [charge, setCharge] = useState(false);
  const [chargeFacture, setChargeFacture] = useState(false);
  const [erreur, setErreur] = useState('');

  const annulable = peutAnnuler && vente.statut !== 'annulee' && !vente.facture_id;
  const facturable = vente.statut === 'payee' && !vente.facture_id && !!vente.tiers_nom;
  const annulee = vente.statut === 'annulee';

  async function annuler() {
    setCharge(true); setErreur('');
    try {
      await annulerVente(entreprise.id, vente.id);
      setConfirmation(false); onFait();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  async function facturer() {
    setChargeFacture(true); setErreur('');
    try {
      await creerFactureDepuisVente(entreprise.id, vente.id);
      onFait();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setChargeFacture(false); }
  }

  return (
    <div className={`bg-[#162419] rounded-2xl p-4 ${annulee ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[#edf5ea] font-medium text-sm truncate">{vente.tiers_nom ?? 'Vente au comptant'}</p>
          <p className="text-[#4a6b4a] text-xs mt-0.5">
            {new Date(vente.date).toLocaleString('fr-FR')}
            {vente.mode_paiement ? ` · ${LIBELLE_MODE[vente.mode_paiement] ?? vente.mode_paiement}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[#edf5ea] font-mono font-semibold text-sm">{fmt(vente.total_ttc)}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 inline-block ${annulee ? 'bg-[#4a6b4a]/20 text-[#6b9165]' : 'bg-[#4ade80]/10 text-[#4ade80]'}`}>
            {LIBELLE_STATUT[vente.statut] ?? vente.statut}
          </span>
        </div>
      </div>
      {(facturable || annulable) && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-[#1e3222]">
          {facturable && (
            <button onClick={facturer} disabled={chargeFacture}
              className="flex-1 bg-[#1e3222] text-[#edf5ea] rounded-xl py-2 text-xs font-medium hover:bg-[#2a4230] transition-colors disabled:opacity-40">
              {chargeFacture ? '…' : 'Facturer'}
            </button>
          )}
          {annulable && (
            <button onClick={() => setConfirmation(!confirmation)}
              className="text-[#f87171] text-xs font-medium px-2 py-2 hover:bg-[#f87171]/8 rounded-xl transition-colors">
              Annuler
            </button>
          )}
        </div>
      )}
      {vente.facture_id && !annulee && (
        <p className="text-[#4a6b4a] text-xs mt-2">
          Une facture a été émise pour cette vente — annulez-la via un avoir sur l'écran Factures.
        </p>
      )}
      {vente.statut === 'payee' && !vente.facture_id && !vente.tiers_nom && (
        <p className="text-[#4a6b4a] text-xs mt-2">
          Vente sans client associé — impossible de la facturer a posteriori (ajoutez un client via Tiers, puis
          recommencez la vente si une facture est nécessaire).
        </p>
      )}
      {confirmation && (
        <div className="mt-3 pt-3 border-t border-[#1e3222] space-y-2">
          <p className="text-[#edf5ea] text-sm">Confirmer l'annulation ? La marchandise revient en stock et l'écriture est contre-passée.</p>
          {erreur && <p className="text-[#f87171] text-xs">{erreur}</p>}
          <div className="flex gap-2">
            <button onClick={annuler} disabled={charge}
              className="bg-[#f87171]/15 text-[#f87171] rounded-xl px-4 py-2 text-xs font-semibold border border-[#f87171]/30 disabled:opacity-40">
              {charge ? '…' : 'Oui, annuler'}
            </button>
            <button onClick={() => setConfirmation(false)} className="text-[#6b9165] text-xs font-medium px-4 py-2">
              Retour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
