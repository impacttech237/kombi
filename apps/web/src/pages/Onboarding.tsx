/**
 * Onboarding — porté fidèlement du prototype Figma Make (CompanySetup() + StepDots(),
 * lignes 2891-3133). 3 étapes : secteur → informations → récapitulatif.
 * Adaptation : pas de champ Ville (absent du modèle Entreprise de Kombi) ; le récapitulatif
 * annonce le régime IGS par défaut (régime de démarrage réel des nouvelles entreprises) sans
 * citer de seuil précis en FCFA — la bascule automatique vers le régime réel est calculée
 * côté serveur depuis le CGI, pas devinée côté client.
 */
import { useState, type ReactNode } from 'react';
import { creerEntreprise, majParametresEntreprise } from '../lib/api.js';
import { IcoChevR, IcoLayers, IcoOk, IcoAlert } from '../components/icons.js';

type Secteur = 'commerce' | 'service' | 'mixte';
type Nature = 'negoce' | 'artisanal' | 'service' | 'liberale';

const NATURE_OPTIONS: { key: Nature; label: string }[] = [
  { key: 'negoce', label: 'Négoce' },
  { key: 'artisanal', label: 'Artisanal' },
  { key: 'service', label: 'Service' },
  { key: 'liberale', label: 'Profession libérale' },
];

const SECTEUR_OPTIONS: { key: Secteur; label: string; desc: string; icon: ReactNode }[] = [
  {
    key: 'commerce', label: 'Commerce', desc: 'Vous vendez des produits en stock',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
        <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
  },
  {
    key: 'service', label: 'Service', desc: 'Vous facturez des prestations, pas de stock',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    key: 'mixte', label: 'Mixte', desc: 'Un peu des deux — vente et prestation',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
        <path d="M7 7h3v5H7zM14 7h3v2h-3zM14 12h3" />
      </svg>
    ),
  },
];

function StepDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {([1, 2, 3] as const).map((s) => (
        <div key={s} className={`rounded-full transition-all duration-300 ${s === step ? 'w-6 h-2 bg-[#b4e033]' : s < step ? 'w-2 h-2 bg-[#4a6b4a]' : 'w-2 h-2 bg-[#2a4230]'}`} />
      ))}
    </div>
  );
}

interface Draft { secteur: Secteur | null; raisonSociale: string; nature: Nature | ''; niu: string; cga: boolean }

export function Onboarding({ onCree }: { onCree: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<Draft>({ secteur: null, raisonSociale: '', nature: '', niu: '', cga: false });
  const [tooltip, setTooltip] = useState(false);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');

  function set<K extends keyof Draft>(k: K, v: Draft[K]) { setDraft((d) => ({ ...d, [k]: v })); }

  const secteurLabel = SECTEUR_OPTIONS.find((s) => s.key === draft.secteur)?.label ?? '';
  const natureLabel = NATURE_OPTIONS.find((n) => n.key === draft.nature)?.label ?? '';
  const step2Valid = draft.raisonSociale.trim().length > 0 && draft.nature !== '';

  async function creer() {
    if (!draft.secteur || !draft.nature) return;
    setCharge(true); setErreur('');
    try {
      const { entrepriseId } = await creerEntreprise({
        raisonSociale: draft.raisonSociale.trim(), secteur: draft.secteur, natureActivite: draft.nature,
        niu: draft.niu.trim() || undefined,
      });
      if (draft.cga) {
        // Best-effort : la réduction IGS CGA (÷2) est un avantage, pas une condition de création.
        await majParametresEntreprise(entrepriseId, { adherentCga: true }).catch(() => {});
      }
      onCree();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
      setCharge(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#0e1c0f] text-[#edf5ea] overflow-hidden">
      <div className="px-5 pt-6 pb-4 flex items-center gap-4 shrink-0">
        {step > 1 ? (
          <button onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
            className="w-9 h-9 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165] shrink-0">
            <IcoChevR cls="w-4 h-4 rotate-180" />
          </button>
        ) : <div className="w-9 h-9 shrink-0" />}
        <div className="flex-1"><StepDots step={step} /></div>
        <div className="w-9 h-9 shrink-0 flex items-center justify-center">
          <div className="w-7 h-7 bg-[#b4e033] rounded-lg flex items-center justify-center text-[#0e1c0f]">
            <IcoLayers cls="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {step === 1 && (
          <div className="flex flex-col gap-6 pt-2">
            <div>
              <p className="text-[#4a6b4a] text-xs font-medium uppercase tracking-widest mb-1">Étape 1 sur 3</p>
              <h1 className="text-[#edf5ea] text-2xl font-bold leading-snug">Quel est votre<br />secteur d'activité ?</h1>
            </div>
            <div className="flex flex-col gap-3">
              {SECTEUR_OPTIONS.map((opt) => {
                const active = draft.secteur === opt.key;
                return (
                  <button key={opt.key} onClick={() => set('secteur', opt.key)}
                    className={`w-full flex items-center gap-4 p-5 rounded-2xl text-left border-2 transition-all active:scale-[0.98] ${active ? 'bg-[#b4e033]/10 border-[#b4e033] text-[#b4e033]' : 'bg-[#162419] border-[#2a4230] text-[#edf5ea] hover:border-[#4a6b4a]'}`}>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${active ? 'bg-[#b4e033]/15' : 'bg-[#1e3222]'}`}>{opt.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base">{opt.label}</p>
                      <p className={`text-sm mt-0.5 ${active ? 'text-[#b4e033]/70' : 'text-[#6b9165]'}`}>{opt.desc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-[#b4e033] bg-[#b4e033]' : 'border-[#2a4230]'}`}>
                      {active && <IcoOk cls="w-3 h-3 text-[#0e1c0f]" />}
                    </div>
                  </button>
                );
              })}
            </div>
            <button disabled={!draft.secteur} onClick={() => setStep(2)}
              className={`w-full rounded-2xl py-4 font-semibold text-sm transition-all ${draft.secteur ? 'bg-[#b4e033] text-[#0e1c0f] active:scale-[0.98]' : 'bg-[#1e3222] text-[#4a6b4a] cursor-not-allowed'}`}>
              Continuer
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5 pt-2">
            <div>
              <p className="text-[#4a6b4a] text-xs font-medium uppercase tracking-widest mb-1">Étape 2 sur 3</p>
              <h1 className="text-[#edf5ea] text-2xl font-bold leading-snug">Votre entreprise</h1>
            </div>

            <div>
              <label className="text-[#6b9165] text-xs font-medium block mb-1.5">Raison sociale <span className="text-[#f87171]">*</span></label>
              <input value={draft.raisonSociale} onChange={(e) => set('raisonSociale', e.target.value)} placeholder="Ex : Boutique Awa"
                className="w-full bg-[#162419] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl px-4 py-3.5 text-sm border border-[#2a4230] focus:border-[#b4e033] focus:outline-none" />
            </div>

            <div>
              <label className="text-[#6b9165] text-xs font-medium block mb-1.5">Nature d'activité <span className="text-[#f87171]">*</span></label>
              <div className="grid grid-cols-2 gap-2">
                {NATURE_OPTIONS.map((opt) => (
                  <button key={opt.key} onClick={() => set('nature', opt.key)}
                    className={`py-3 px-4 rounded-xl text-sm font-medium text-left border transition-all ${draft.nature === opt.key ? 'bg-[#b4e033]/10 border-[#b4e033] text-[#b4e033]' : 'bg-[#162419] border-[#2a4230] text-[#edf5ea]'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[#6b9165] text-xs font-medium block mb-1.5">NIU <span className="text-[#4a6b4a]">(optionnel)</span></label>
              <input value={draft.niu} onChange={(e) => set('niu', e.target.value)} placeholder="M082400001234B"
                className="w-full bg-[#162419] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl px-4 py-3.5 text-sm font-mono border border-[#2a4230] focus:border-[#b4e033] focus:outline-none" />
              <p className="text-[#4a6b4a] text-xs mt-1.5">Vous pourrez l'ajouter plus tard dans les paramètres.</p>
            </div>

            <div role="button" tabIndex={0} onClick={() => set('cga', !draft.cga)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set('cga', !draft.cga); } }}
              className="w-full flex items-start gap-3 bg-[#162419] rounded-2xl p-4 border border-[#2a4230] text-left cursor-pointer">
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${draft.cga ? 'bg-[#b4e033] border-[#b4e033]' : 'border-[#4a6b4a]'}`}>
                {draft.cga && <IcoOk cls="w-3 h-3 text-[#0e1c0f]" />}
              </div>
              <div className="flex-1">
                <p className="text-[#edf5ea] text-sm font-medium leading-snug">Je suis adhérent d'un Centre de Gestion Agréé (CGA)</p>
                <button type="button" onClick={(e) => { e.stopPropagation(); setTooltip((v) => !v); }}
                  className="text-[#b4e033] text-xs font-medium mt-1 underline underline-offset-2">
                  Qu'est-ce que c'est ?
                </button>
                {tooltip && (
                  <div className="mt-2 bg-[#1e3222] rounded-xl p-3 border border-[#2a4230]">
                    <p className="text-[#6b9165] text-xs leading-relaxed">
                      Un CGA est un organisme agréé par l'État qui accompagne les PME dans leur gestion comptable et
                      fiscale. L'adhésion permet de réduire votre cotisation IGS de <strong className="text-[#b4e033]">50 %</strong>.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <button disabled={!step2Valid} onClick={() => setStep(3)}
              className={`w-full rounded-2xl py-4 font-semibold text-sm transition-all ${step2Valid ? 'bg-[#b4e033] text-[#0e1c0f] active:scale-[0.98]' : 'bg-[#1e3222] text-[#4a6b4a] cursor-not-allowed'}`}>
              Continuer
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-5 pt-2">
            <div>
              <p className="text-[#4a6b4a] text-xs font-medium uppercase tracking-widest mb-1">Étape 3 sur 3</p>
              <h1 className="text-[#edf5ea] text-2xl font-bold leading-snug">Récapitulatif</h1>
            </div>

            <div className="bg-[#162419] rounded-2xl border border-[#2a4230] overflow-hidden">
              <div className="bg-[#1e3222] px-4 py-3 border-b border-[#2a4230]">
                <p className="text-[#edf5ea] font-semibold">{draft.raisonSociale}</p>
              </div>
              <div className="divide-y divide-[#1e3222]">
                {[
                  { label: 'Secteur', value: secteurLabel },
                  { label: "Nature d'activité", value: natureLabel },
                  { label: 'NIU', value: draft.niu || 'Non renseigné' },
                  { label: 'Adhérent CGA', value: draft.cga ? 'Oui — IGS réduit de 50 %' : 'Non' },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between px-4 py-3 gap-4">
                    <span className="text-[#6b9165] text-sm">{row.label}</span>
                    <span className={`text-sm font-medium text-right ${row.value === 'Non renseigné' ? 'text-[#4a6b4a] italic' : 'text-[#edf5ea]'}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#fbbf24]/6 border border-[#fbbf24]/20 rounded-2xl p-4 flex gap-3">
              <IcoAlert cls="w-4 h-4 text-[#fbbf24] shrink-0 mt-0.5" />
              <div>
                <p className="text-[#fbbf24] text-sm font-medium">Régime fiscal de démarrage : IGS</p>
                <p className="text-[#6b9165] text-xs mt-1 leading-relaxed">
                  Votre entreprise démarre à l'Impôt Général Synthétique, le régime le plus simple pour les PME.
                  Kombi bascule automatiquement vers le régime réel dès que votre chiffre d'affaires dépasse le
                  seuil légal (CGI).
                  {draft.cga && ' En tant qu\'adhérent CGA, votre cotisation sera réduite de moitié.'}
                </p>
              </div>
            </div>

            {erreur && <p className="text-[#f87171] text-xs">{erreur}</p>}

            <button onClick={creer} disabled={charge}
              className="w-full bg-[#b4e033] text-[#0e1c0f] rounded-2xl py-4 font-bold text-base active:scale-[0.98] transition-all shadow-lg shadow-[#b4e033]/20 disabled:opacity-50">
              {charge ? 'Création…' : 'Créer mon entreprise →'}
            </button>

            <p className="text-[#4a6b4a] text-xs text-center">Vous pourrez modifier ces informations dans Paramètres à tout moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}
