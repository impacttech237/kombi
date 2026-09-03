import { useEnLigne, useEnAttente } from '../offline/useReseau.js';
import { synchroniser } from '../offline/sync.js';
import { IcoAlert, IcoOk } from './icons.js';

/** Bandeau discret : hors-ligne ou synchronisation en attente. Rien si en ligne et à jour. */
export function OfflineBanner() {
  const enLigne = useEnLigne();
  const enAttente = useEnAttente();
  if (enLigne && enAttente === 0) return null;

  const horsLigne = !enLigne;
  return (
    <div className={`flex items-center gap-2.5 mb-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium border ${horsLigne ? 'bg-[#fbbf24]/8 border-[#fbbf24]/25 text-[#fbbf24]' : 'bg-[#b4e033]/8 border-[#b4e033]/25 text-[#b4e033]'}`}>
      {horsLigne ? <IcoAlert cls="w-4 h-4 shrink-0" /> : <IcoOk cls="w-4 h-4 shrink-0" />}
      <span className="flex-1">
        {horsLigne
          ? `Hors ligne — vos ventes sont enregistrées${enAttente ? ` (${enAttente} en attente)` : ''}`
          : `Synchronisation… ${enAttente} vente${enAttente > 1 ? 's' : ''} en attente`}
      </span>
      {enLigne && enAttente > 0 && (
        <button onClick={() => void synchroniser()}
          className="bg-[#1e3222] text-[#edf5ea] rounded-lg px-3 py-1 text-xs font-medium border border-[#2a4230] shrink-0">
          Synchroniser
        </button>
      )}
    </div>
  );
}
