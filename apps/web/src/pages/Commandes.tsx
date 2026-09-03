/**
 * Commandes / Missions — absent du prototype Figma Make (mentionné dans docs/parcours.md comme
 * écran à concevoir), design original dans le même langage visuel que les écrans portés
 * (tabs de filtrage, FAB, cartes de statut — cf. Factures.tsx/Stock.tsx).
 */
import { useEffect, useMemo, useState } from 'react';
import { formaterFCFA as fmt, TERMINOLOGIE, type Secteur } from '@kombi/shared';
import {
  listerCommandes, creerCommande, changerStatutCommande, listerTiers,
  type EntrepriseResume, type Commande, type Tiers,
} from '../lib/api.js';
import { nouvelUuid } from '../offline/db.js';
import { IcoPlus, IcoChevR, IcoX, IcoOk } from '../components/icons.js';

type Filtre = 'all' | 'en_attente' | 'en_cours' | 'livree' | 'annulee';
const BADGE: Record<string, { label: string; cls: string }> = {
  en_attente: { label: 'En attente', cls: 'bg-[#fbbf24]/15 text-[#fbbf24]' },
  en_cours: { label: 'En cours', cls: 'bg-[#60a5fa]/15 text-[#60a5fa]' },
  livree: { label: 'Livrée', cls: 'bg-[#4ade80]/10 text-[#4ade80]' },
  annulee: { label: 'Annulée', cls: 'bg-[#4a6b4a]/20 text-[#6b9165]' },
};

const inputCls = 'w-full bg-[#1e3222] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl px-4 py-3 text-sm border border-[#2a4230] focus:border-[#b4e033] focus:outline-none';

export function Commandes({ entreprise, onRetour }: { entreprise: EntrepriseResume; onRetour: () => void }) {
  const term = TERMINOLOGIE[(entreprise.secteur as Secteur) ?? 'commerce'];
  const [liste, setListe] = useState<Commande[] | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('all');
  const [createOpen, setCreateOpen] = useState(false);

  function recharger() { return listerCommandes(entreprise.id).then(setListe).catch(() => setListe((p) => p ?? [])); }
  useEffect(() => { void recharger(); }, [entreprise.id]);

  async function avancer(c: Commande, statut: string) {
    if (statut === 'annulee' && !confirm(`Annuler « ${c.libelle} » ?`)) return;
    await changerStatutCommande(entreprise.id, c.id, statut);
    void recharger();
  }

  const tabs: { key: Filtre; label: string }[] = [
    { key: 'all', label: 'Toutes' }, { key: 'en_attente', label: 'En attente' },
    { key: 'en_cours', label: 'En cours' }, { key: 'livree', label: 'Livrées' }, { key: 'annulee', label: 'Annulées' },
  ];
  const filtered = useMemo(() => (liste ?? []).filter((c) => filtre === 'all' || c.statut === filtre), [liste, filtre]);
  const tabCount: Record<Filtre, number> = {
    all: liste?.length ?? 0,
    en_attente: (liste ?? []).filter((c) => c.statut === 'en_attente').length,
    en_cours: (liste ?? []).filter((c) => c.statut === 'en_cours').length,
    livree: (liste ?? []).filter((c) => c.statut === 'livree').length,
    annulee: (liste ?? []).filter((c) => c.statut === 'annulee').length,
  };

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-8 pt-4 pb-2 flex items-center gap-2">
        <button onClick={onRetour} className="w-9 h-9 shrink-0 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h1 className="text-[#edf5ea] text-lg font-bold">{term.commandes[0]!.toUpperCase() + term.commandes.slice(1)}</h1>
      </div>

      <div className="px-4 md:px-8 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setFiltre(tab.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${filtre === tab.key ? 'bg-[#b4e033] text-[#0e1c0f]' : 'bg-[#1e3222] text-[#6b9165] border border-[#2a4230]'}`}>
              {tab.label}
              <span className={`rounded-full text-xs px-1.5 ${filtre === tab.key ? 'bg-[#0e1c0f]/20 text-[#0e1c0f]' : 'bg-[#2a4230] text-[#6b9165]'}`}>{tabCount[tab.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-2 pt-1">
        {liste === null ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
        ) : filtered.length === 0 ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Aucune {term.commande}.</p>
        ) : (
          filtered.map((c) => {
            const badge = BADGE[c.statut] ?? { label: c.statut, cls: 'bg-[#4a6b4a]/20 text-[#6b9165]' };
            return (
              <div key={c.id} className="bg-[#162419] rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[#edf5ea] font-medium text-sm">{c.libelle}</p>
                    <p className="text-[#4a6b4a] text-xs mt-0.5">
                      {c.tiers_nom ?? 'Sans client'}{c.montant ? ` · ${fmt(c.montant)}` : ''}
                      {c.date_prevue ? ` · ${new Date(c.date_prevue).toLocaleDateString('fr-FR')}` : ''}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ${badge.cls}`}>{badge.label}</span>
                </div>
                {(c.statut === 'en_attente' || c.statut === 'en_cours') && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-[#1e3222]">
                    {c.statut === 'en_attente' && (
                      <button onClick={() => avancer(c, 'en_cours')}
                        className="flex-1 bg-[#1e3222] text-[#edf5ea] rounded-xl py-2 text-xs font-medium hover:bg-[#2a4230] transition-colors">
                        Démarrer
                      </button>
                    )}
                    {c.statut === 'en_cours' && (
                      <button onClick={() => avancer(c, 'livree')}
                        className="flex-1 bg-[#b4e033] text-[#0e1c0f] rounded-xl py-2 text-xs font-semibold active:scale-95 transition-all">
                        Terminée
                      </button>
                    )}
                    <button onClick={() => avancer(c, 'annulee')} className="text-[#f87171] text-xs font-medium px-2 py-2 hover:bg-[#f87171]/8 rounded-xl transition-colors">
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <button onClick={() => setCreateOpen(true)}
        className="fixed bottom-24 md:bottom-6 right-4 w-14 h-14 bg-[#b4e033] rounded-full flex items-center justify-center text-[#0e1c0f] shadow-lg shadow-[#b4e033]/20 z-10 active:scale-95 transition-all">
        <IcoPlus cls="w-6 h-6" />
      </button>

      {createOpen && (
        <NouvelleCommandeSheet entreprise={entreprise} term={term} onClose={() => setCreateOpen(false)}
          onCree={() => { setCreateOpen(false); void recharger(); }} />
      )}
    </div>
  );
}

function NouvelleCommandeSheet({ entreprise, term, onClose, onCree }: {
  entreprise: EntrepriseResume; term: { commande: string }; onClose: () => void; onCree: () => void;
}) {
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState('');
  const [tiersId, setTiersId] = useState('');
  const [datePrevue, setDatePrevue] = useState('');
  const [tiers, setTiers] = useState<Tiers[]>([]);
  const [charge, setCharge] = useState(false);
  const type = entreprise.secteur === 'service' ? 'mission' : 'commande';

  useEffect(() => { listerTiers(entreprise.id).then(setTiers).catch(() => {}); }, [entreprise.id]);

  async function creer() {
    setCharge(true);
    try {
      await creerCommande(entreprise.id, {
        type, libelle: libelle.trim(), montant: montant ? Number(montant) : undefined,
        tiersId: tiersId || undefined, datePrevue: datePrevue || undefined, clientUuid: nouvelUuid(),
      });
      onCree();
    } finally { setCharge(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0e1c0f]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e3222] bg-[#0a1408] shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h2 className="text-[#edf5ea] font-semibold text-sm flex-1">Nouvelle {term.commande}</h2>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoX cls="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-5 space-y-4">
        <div>
          <label className="text-[#6b9165] text-xs font-medium block mb-1.5">Objet de la {term.commande}</label>
          <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Ex. Livraison 10 sacs de riz" className={inputCls} />
        </div>
        {tiers.length > 0 && (
          <div>
            <label className="text-[#6b9165] text-xs font-medium block mb-1.5">Client (optionnel)</label>
            <select value={tiersId} onChange={(e) => setTiersId(e.target.value)} className={inputCls}>
              <option value="">Sans client</option>
              {tiers.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-[#6b9165] text-xs font-medium block mb-1.5">Montant estimé (optionnel)</label>
          <input inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value.replace(/\D/g, ''))} placeholder="40000" className={inputCls} />
        </div>
        <div>
          <label className="text-[#6b9165] text-xs font-medium block mb-1.5">Date prévue (optionnel)</label>
          <input type="date" value={datePrevue} onChange={(e) => setDatePrevue(e.target.value)} className={`${inputCls} [color-scheme:dark]`} />
        </div>
      </div>
      <div className="border-t border-[#1e3222] px-4 py-3 bg-[#0a1408] shrink-0">
        <button onClick={creer} disabled={charge || !libelle.trim()}
          className="w-full bg-[#b4e033] text-[#0e1c0f] rounded-2xl py-4 font-semibold text-base active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
          {charge ? '…' : <><IcoOk cls="w-4 h-4" /> Créer</>}
        </button>
      </div>
    </div>
  );
}
