/**
 * Paramètres fiscaux — absent du prototype Figma Make (mentionné dans docs/parcours.md comme
 * écran à concevoir), design original dans le même langage visuel que les écrans portés (cartes à
 * bascule dans le style de l'étape CGA de l'Onboarding).
 */
import { useEffect, useState } from 'react';
import {
  getParametresEntreprise, majParametresEntreprise,
  type EntrepriseResume, type ParametresEntreprise,
} from '../lib/api.js';
import { IcoChevR, IcoOk, IcoAlert } from '../components/icons.js';

const REGIME_LIBELLE: Record<string, string> = {
  igs: 'IGS (forfaitaire, sans TVA)', reel_simplifie: 'Réel simplifié', reel_normal: 'Réel normal',
};

const inputCls = 'w-full bg-[#1e3222] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl px-4 py-3 text-sm font-mono border border-[#2a4230] focus:border-[#b4e033] focus:outline-none';

function Toggle({ checked, onChange, title, desc }: { checked: boolean; onChange: (v: boolean) => void; title: string; desc: string }) {
  return (
    <div role="button" tabIndex={0} onClick={() => onChange(!checked)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!checked); } }}
      className="w-full flex items-start gap-3 bg-[#1e3222] rounded-2xl p-4 border border-[#2a4230] text-left cursor-pointer">
      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${checked ? 'bg-[#b4e033] border-[#b4e033]' : 'border-[#4a6b4a]'}`}>
        {checked && <IcoOk cls="w-3 h-3 text-[#0e1c0f]" />}
      </div>
      <div className="flex-1">
        <p className="text-[#edf5ea] text-sm font-medium leading-snug">{title}</p>
        <p className="text-[#6b9165] text-xs mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

export function Parametres({ entreprise, onRetour }: { entreprise: EntrepriseResume; onRetour: () => void }) {
  const [params, setParams] = useState<ParametresEntreprise | null>(null);
  const [niu, setNiu] = useState('');
  const [adherentCga, setAdherentCga] = useState(false);
  const [assujettiTva, setAssujettiTva] = useState(false);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    getParametresEntreprise(entreprise.id).then((p) => {
      setParams(p); setNiu(p.niu ?? ''); setAdherentCga(p.adherent_cga === 1); setAssujettiTva(p.assujetti_tva === 1);
    }).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }, [entreprise.id]);

  async function enregistrer() {
    setCharge(true); setErreur(''); setSucces(false);
    try {
      await majParametresEntreprise(entreprise.id, { niu: niu.trim() || null, adherentCga, assujettiTva });
      setSucces(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  const auReel = params?.regime_fiscal !== 'igs';

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 overflow-y-auto pb-24 md:pb-8">
      <div className="px-4 md:px-8 pt-4 pb-2 flex items-center gap-2">
        <button onClick={onRetour} className="w-9 h-9 shrink-0 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h1 className="text-[#edf5ea] text-lg font-bold flex-1">Paramètres fiscaux</h1>
      </div>

      {!params ? (
        <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
      ) : (
        <div className="px-4 md:px-8 pt-3 space-y-4">
          <div className="bg-[#162419] rounded-2xl p-4 border border-[#1e3222]">
            <p className="text-[#4a6b4a] text-[10px] uppercase tracking-wide font-medium mb-1">Régime fiscal actuel</p>
            <p className="text-[#edf5ea] font-semibold text-sm">{params.raison_sociale}</p>
            <p className="text-[#fbbf24] font-mono text-sm mt-1">{REGIME_LIBELLE[params.regime_fiscal] ?? params.regime_fiscal}</p>
          </div>

          <div>
            <label className="text-[#6b9165] text-xs font-medium block mb-1.5">NIU (Numéro d'Identifiant Unique)</label>
            <input value={niu} onChange={(e) => setNiu(e.target.value)} placeholder="M012345678901X" className={inputCls} />
          </div>

          <Toggle checked={adherentCga} onChange={setAdherentCga}
            title="Adhérent d'un Centre de Gestion Agréé (CGA)"
            desc="Réduit l'IGS de moitié (CGI Art. C 40 (2)) — coché à tort si vous n'avez pas d'attestation d'adhésion, votre IGS réel serait sous-estimé." />

          {auReel ? (
            <Toggle checked={assujettiTva} onChange={setAssujettiTva}
              title="Assujetti à la TVA"
              desc="Applique 19,25 % sur les ventes et factures, récupérable sur les achats/dépenses." />
          ) : (
            <div className="bg-[#fbbf24]/6 border border-[#fbbf24]/20 rounded-2xl p-4 flex gap-3">
              <IcoAlert cls="w-4 h-4 text-[#fbbf24] shrink-0 mt-0.5" />
              <p className="text-[#6b9165] text-xs leading-relaxed">
                Au régime IGS, la TVA est interdite (CGI Art. 142) — ce réglage n'apparaît qu'au régime réel.
              </p>
            </div>
          )}

          {erreur && <p className="text-[#f87171] text-xs">{erreur}</p>}
          {succes && <p className="text-[#4ade80] text-xs">Paramètres enregistrés.</p>}

          <button onClick={enregistrer} disabled={charge}
            className="w-full bg-[#b4e033] text-[#0e1c0f] rounded-2xl py-4 font-semibold text-base active:scale-95 transition-all disabled:opacity-50">
            {charge ? '…' : 'Enregistrer'}
          </button>
        </div>
      )}
    </div>
  );
}
