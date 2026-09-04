/**
 * Équipe — absent du prototype Figma Make (mentionné dans docs/parcours.md comme écran à
 * concevoir), design original dans le même langage visuel que les écrans portés.
 */
import { useEffect, useState } from 'react';
import { ROLE_MEMBRE } from '@kombi/shared';
import {
  listerMembres, ajouterMembre, changerRoleMembre, retirerMembre,
  type EntrepriseResume, type Membre,
} from '../lib/api.js';
import { IcoPlus, IcoChevR, IcoX, Avatar } from '../components/icons.js';

const LABEL_ROLE: Record<string, string> = {
  admin: 'Administrateur', gerant: 'Gérant', caissier: 'Caissier', comptable: 'Comptable', employe: 'Employé',
  magasinier: 'Magasinier',
};

const inputCls = 'w-full bg-[#1e3222] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl px-4 py-3 text-sm border border-[#2a4230] focus:border-[#b4e033] focus:outline-none';

export function Equipe({ entreprise, onRetour }: { entreprise: EntrepriseResume; onRetour: () => void }) {
  const [liste, setListe] = useState<Membre[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  function recharger() {
    return listerMembres(entreprise.id).then(setListe).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }
  useEffect(() => { void recharger(); }, [entreprise.id]);

  async function changer(m: Membre, role: string) {
    await changerRoleMembre(entreprise.id, m.id, role);
    void recharger();
  }
  async function retirer(m: Membre) {
    if (!confirm(`Retirer ${m.nom} de l'équipe ? Cette personne perdra immédiatement l'accès.`)) return;
    await retirerMembre(entreprise.id, m.id);
    void recharger();
  }

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-8 pt-4 pb-2 flex items-center gap-2">
        <button onClick={onRetour} className="w-9 h-9 shrink-0 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h1 className="text-[#edf5ea] text-lg font-bold flex-1">Équipe</h1>
      </div>

      {erreur && <p className="text-[#f87171] text-sm px-4 md:px-8">{erreur}</p>}

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-2 pt-2">
        {liste === null ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
        ) : liste.length === 0 ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Personne d'autre pour l'instant.</p>
        ) : (
          liste.map((m) => (
            <div key={m.id} className="bg-[#162419] rounded-2xl p-4 flex items-center gap-3">
              <Avatar name={m.nom} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-[#edf5ea] font-medium text-sm truncate">{m.nom}</p>
                <p className="text-[#4a6b4a] text-xs mt-0.5 truncate">{m.email}</p>
              </div>
              <select value={m.role} onChange={(e) => changer(m, e.target.value)}
                className="bg-[#1e3222] text-[#edf5ea] text-xs rounded-lg px-2.5 py-2 border border-[#2a4230] focus:border-[#b4e033] focus:outline-none shrink-0">
                {ROLE_MEMBRE.map((r) => <option key={r} value={r}>{LABEL_ROLE[r] ?? r}</option>)}
              </select>
              <button onClick={() => retirer(m)} className="text-[#f87171] p-1.5 shrink-0" aria-label="retirer">
                <IcoX cls="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <button onClick={() => setAddOpen(true)}
        className="fixed bottom-24 md:bottom-6 right-4 w-14 h-14 bg-[#b4e033] rounded-full flex items-center justify-center text-[#0e1c0f] shadow-lg shadow-[#b4e033]/20 z-10 active:scale-95 transition-all">
        <IcoPlus cls="w-6 h-6" />
      </button>

      {addOpen && (
        <AjouterMembreSheet entreprise={entreprise} onClose={() => setAddOpen(false)}
          onAjoute={() => { setAddOpen(false); void recharger(); }} />
      )}
    </div>
  );
}

function AjouterMembreSheet({ entreprise, onClose, onAjoute }: {
  entreprise: EntrepriseResume; onClose: () => void; onAjoute: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('caissier');
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');

  async function ajouter() {
    setCharge(true); setErreur('');
    try {
      await ajouterMembre(entreprise.id, { email: email.trim(), role });
      onAjoute();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0e1c0f]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e3222] bg-[#0a1408] shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h2 className="text-[#edf5ea] font-semibold text-sm flex-1">Ajouter un membre</h2>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoX cls="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-5 space-y-4">
        <p className="text-[#4a6b4a] text-xs leading-relaxed">La personne doit déjà avoir un compte Kombi avec cet email.</p>
        <div>
          <label className="text-[#6b9165] text-xs font-medium block mb-1.5">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@exemple.com" className={inputCls} />
        </div>
        <div>
          <label className="text-[#6b9165] text-xs font-medium block mb-1.5">Rôle</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
            {ROLE_MEMBRE.filter((r) => r !== 'admin').map((r) => <option key={r} value={r}>{LABEL_ROLE[r] ?? r}</option>)}
          </select>
        </div>
        {erreur && <p className="text-[#f87171] text-xs">{erreur}</p>}
      </div>
      <div className="border-t border-[#1e3222] px-4 py-3 bg-[#0a1408] shrink-0">
        <button onClick={ajouter} disabled={charge || !email.trim()}
          className="w-full bg-[#b4e033] text-[#0e1c0f] rounded-2xl py-4 font-semibold text-base active:scale-95 transition-all disabled:opacity-40">
          {charge ? '…' : 'Ajouter'}
        </button>
      </div>
    </div>
  );
}
