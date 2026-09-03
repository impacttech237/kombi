/**
 * Trésorerie — porté fidèlement du prototype Figma Make (Treasury() + BankChip/ContactlessIcon,
 * lignes 2057-2276). Pile de cartes swipeable par mode de paiement, solde total, flux de
 * transactions filtrable.
 * Adaptations : 4 comptes réels (espèces/Orange Money/MTN MoMo/banque, via tresorerieDuJour) au
 * lieu des 3 mock du prototype ; pas de variation « +8.2% » (aucune donnée historique pour la
 * calculer, plutôt que d'inventer un chiffre) ; le flux fusionne ventes + dépenses réelles (les
 * achats payés et les Créances/Dettes — argent pas encore encaissé/payé — restent sur leurs
 * écrans dédiés, accessibles depuis le tableau de bord).
 */
import { useEffect, useMemo, useState } from 'react';
import { formaterFCFA as fmt } from '@kombi/shared';
import {
  tresorerieDuJour, listerVentesRecentes, listerDepenses,
  type EntrepriseResume, type TresorerieJour, type VenteRecente, type Depense,
} from '../lib/api.js';
import { MODE_PAIEMENT_LABEL, MODE_PAIEMENT_COULEUR } from '../components/charts.js';
import { IcoDn, IcoUp, IcoPlus, Avatar } from '../components/icons.js';

type Compte = { code: keyof TresorerieJour; name: string; sub: string; from: string; to: string };
const COMPTES: Compte[] = [
  { code: 'especes', name: 'Caisse', sub: 'Espèces', from: '#b4e033', to: '#4ade80' },
  { code: 'orangeMoney', name: 'Orange Money', sub: 'Mobile Money', from: '#16a34a', to: '#22c55e' },
  { code: 'mtnMomo', name: 'MTN MoMo', sub: 'Mobile Money', from: '#0a3d1c', to: '#15803d' },
  { code: 'banque', name: 'Banque', sub: 'Virement', from: '#1e3a8a', to: '#3b82f6' },
];

function BankChip() {
  return (
    <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
      <rect width="32" height="24" rx="4" fill="rgba(255,255,255,0.28)" />
      <rect x="11" y="0" width="1.5" height="24" fill="rgba(255,255,255,0.16)" />
      <rect x="19.5" y="0" width="1.5" height="24" fill="rgba(255,255,255,0.16)" />
      <rect x="0" y="8.5" width="32" height="1.5" fill="rgba(255,255,255,0.16)" />
      <rect x="0" y="14" width="32" height="1.5" fill="rgba(255,255,255,0.16)" />
      <rect x="11" y="6.5" width="10" height="11" rx="2" fill="rgba(255,255,255,0.22)" />
    </svg>
  );
}
function ContactlessIcon() {
  return (
    <svg width="22" height="20" viewBox="0 0 22 20" fill="none">
      <circle cx="2.5" cy="10" r="2" fill="rgba(255,255,255,0.65)" />
      <path d="M7 5.5 C9.5 7.5 9.5 12.5 7 14.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M11 2.5 C15.5 5.5 15.5 14.5 11 17.5" stroke="rgba(255,255,255,0.32)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M15 0.5 C21 4 21 16 15 19.5" stroke="rgba(255,255,255,0.18)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

type Tx = { id: string; date: string; time: string; description: string; type: 'in' | 'out'; amount: number; method: string; client: string | null };

function joursGroupe(date: string): string {
  const d = new Date(date);
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const hier = new Date(auj); hier.setDate(hier.getDate() - 1);
  const dJour = new Date(d); dJour.setHours(0, 0, 0, 0);
  if (dJour.getTime() === auj.getTime()) return "Aujourd'hui";
  if (dJour.getTime() === hier.getTime()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function Tresorerie({ entreprise, onCaisse, onDepenses }: {
  entreprise: EntrepriseResume; onCaisse: () => void; onDepenses: () => void;
}) {
  const [tresor, setTresor] = useState<TresorerieJour | null>(null);
  const [ventes, setVentes] = useState<VenteRecente[]>([]);
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [txFilter, setTxFilter] = useState<'all' | 'in' | 'out'>('all');
  const [frontCard, setFrontCard] = useState(0);

  useEffect(() => {
    tresorerieDuJour(entreprise.id).then(setTresor).catch(() => {});
    listerVentesRecentes(entreprise.id).then(setVentes).catch(() => {});
    listerDepenses(entreprise.id).then(setDepenses).catch(() => {});
  }, [entreprise.id]);

  const total = tresor ? COMPTES.reduce((s, c) => s + (tresor[c.code] ?? 0), 0) : 0;

  const txs: Tx[] = useMemo(() => {
    const v: Tx[] = ventes.filter((v) => v.mode_paiement).map((v) => ({
      id: `v-${v.id}`, date: v.date, time: new Date(v.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      description: v.tiers_nom ? `Vente · ${v.tiers_nom}` : 'Vente au comptant', type: 'in', amount: v.total_ttc,
      method: v.mode_paiement!, client: v.tiers_nom,
    }));
    const d: Tx[] = depenses.map((d) => ({
      id: `d-${d.id}`, date: d.date, time: new Date(d.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      description: d.libelle, type: 'out', amount: d.montant, method: d.mode_paiement, client: d.tiers_nom,
    }));
    return [...v, ...d].sort((a, b) => b.date.localeCompare(a.date));
  }, [ventes, depenses]);

  const filtered = txs.filter((t) => txFilter === 'all' || t.type === txFilter);
  const grouped = filtered.reduce<Record<string, Tx[]>>((acc, t) => {
    const g = joursGroupe(t.date);
    (acc[g] ??= []).push(t);
    return acc;
  }, {});

  const CARD_H = 130;
  const STEP = 52;
  const STACK_H = 2 * STEP + CARD_H;
  const getPos = (idx: number): number => (idx === frontCard ? 2 : (frontCard + 1) % COMPTES.length === idx ? 1 : 0);

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col overflow-hidden">
      <div className="mx-4 md:mx-8 mt-4 bg-[#08100a] rounded-3xl p-5">
        <div className="relative" style={{ height: STACK_H }}>
          {COMPTES.map((acc, idx) => {
            const pos = getPos(idx);
            const isFront = pos === 2;
            const topOffset = (2 - pos) * STEP;
            const balance = tresor ? tresor[acc.code] ?? 0 : 0;
            return (
              <div key={acc.code} onClick={() => !isFront && setFrontCard(idx)}
                style={{
                  position: 'absolute', top: topOffset, left: 0, right: 0, height: CARD_H, zIndex: pos + 1,
                  background: `linear-gradient(145deg, ${acc.from} 0%, ${acc.to} 100%)`,
                  transition: 'top 0.38s cubic-bezier(0.4,0,0.2,1), box-shadow 0.38s',
                  boxShadow: isFront ? '0 12px 40px rgba(0,0,0,0.55)' : '0 3px 12px rgba(0,0,0,0.3)',
                  overflow: 'hidden',
                }}
                className="rounded-2xl select-none cursor-pointer">
                <div style={{ position: 'absolute', top: -50, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: -60, left: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(0,0,0,0.12)', pointerEvents: 'none' }} />
                <div className="relative h-full flex flex-col justify-between px-5 py-4" style={{ zIndex: 1 }}>
                  <div className="flex items-center justify-between">
                    <BankChip />
                    <ContactlessIcon />
                  </div>
                  <p className="font-mono text-xs tracking-[0.22em] text-white/50 mt-3">•••• &nbsp;•••• &nbsp;•••• &nbsp;{entreprise.id.slice(0, 4)}</p>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-white/55 text-[10px] font-medium uppercase tracking-widest leading-none mb-1">{acc.sub}</p>
                      <p className="text-white text-sm font-semibold">{acc.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white/55 text-[10px] uppercase tracking-widest leading-none mb-1">Solde</p>
                      <p className="text-white font-mono font-bold text-base leading-none">{fmt(balance)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-1.5 mt-4">
          {COMPTES.map((_, idx) => (
            <button key={idx} onClick={() => setFrontCard(idx)} className="transition-all duration-300"
              style={{ width: getPos(idx) === 2 ? 20 : 6, height: 6, borderRadius: 999, background: getPos(idx) === 2 ? '#b4e033' : 'rgba(255,255,255,0.2)' }} />
          ))}
        </div>

        <div className="h-px my-4" style={{ background: 'rgba(255,255,255,0.06)' }} />

        <div className="text-center mb-5">
          <p className="text-[#4a6b4a] text-[10px] font-medium uppercase tracking-widest mb-1.5">Total disponible</p>
          <p className="text-white font-mono font-bold leading-none" style={{ fontSize: '2.4rem' }}>{fmt(total)}</p>
        </div>

        <div className="flex gap-3">
          <button onClick={onCaisse}
            className="flex-1 rounded-2xl py-3.5 flex items-center justify-center gap-2 text-sm font-semibold active:scale-95 transition-transform"
            style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.22)', color: '#4ade80' }}>
            <IcoDn cls="w-4 h-4" />
            Entrée
          </button>
          <button onClick={onDepenses}
            className="flex-1 rounded-2xl py-3.5 flex items-center justify-center gap-2 text-sm font-semibold active:scale-95 transition-transform"
            style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.22)', color: '#f87171' }}>
            <IcoUp cls="w-4 h-4" />
            Sortie
          </button>
        </div>
      </div>

      <div className="px-4 md:px-8 pt-4 pb-2 flex items-center gap-2">
        {([{ key: 'all', label: 'Tous' }, { key: 'in', label: 'Entrées' }, { key: 'out', label: 'Sorties' }] as const).map((f) => (
          <button key={f.key} onClick={() => setTxFilter(f.key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${txFilter === f.key ? 'bg-[#b4e033] text-[#0e1c0f]' : 'bg-[#1e3222] text-[#6b9165] border border-[#2a4230]'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-4">
        {Object.keys(grouped).length === 0 ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Aucun mouvement.</p>
        ) : (
          Object.entries(grouped).map(([date, txs]) => (
            <div key={date}>
              <p className="text-[#4a6b4a] text-xs font-medium mb-2 uppercase tracking-wide">{date}</p>
              <div className="bg-[#162419] rounded-2xl overflow-hidden">
                {txs.map((t, i) => (
                  <div key={t.id} className={`flex items-center gap-3 px-4 py-3.5 ${i < txs.length - 1 ? 'border-b border-[#1e3222]' : ''}`}>
                    {t.client
                      ? <Avatar name={t.client} size="sm" />
                      : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${t.type === 'in' ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-[#f87171]/10 text-[#f87171]'}`}>
                          {t.type === 'in' ? <IcoDn cls="w-4 h-4" /> : <IcoUp cls="w-4 h-4" />}
                        </div>
                      )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[#edf5ea] text-sm font-medium truncate">{t.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[#4a6b4a] text-xs">{t.time}</span>
                        <span className={`text-xs font-medium ${MODE_PAIEMENT_COULEUR[t.method] ?? 'text-[#6b9165]'}`}>{MODE_PAIEMENT_LABEL[t.method] ?? t.method}</span>
                      </div>
                    </div>
                    <span className={`font-mono text-sm font-bold shrink-0 ${t.type === 'in' ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                      {t.type === 'in' ? '+' : '−'}{fmt(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <button onClick={onCaisse}
        className="fixed bottom-24 md:bottom-6 right-4 w-14 h-14 bg-[#b4e033] rounded-full flex items-center justify-center text-[#0e1c0f] shadow-lg shadow-[#b4e033]/20 z-10 active:scale-95 transition-all">
        <IcoPlus cls="w-6 h-6" />
      </button>
    </div>
  );
}
