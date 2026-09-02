import { useEnLigne, useEnAttente } from '../offline/useReseau.js';
import { synchroniser } from '../offline/sync.js';
import { Icon } from './ui.js';

/** Bandeau discret : hors-ligne ou synchronisation en attente. Rien si en ligne et à jour. */
export function OfflineBanner() {
  const enLigne = useEnLigne();
  const enAttente = useEnAttente();
  if (enLigne && enAttente === 0) return null;

  const horsLigne = !enLigne;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px',
      padding: '10px 14px', borderRadius: 14, fontSize: 13, fontWeight: 500,
      background: horsLigne ? '#fff4e5' : 'var(--vert-clair)',
      color: horsLigne ? '#a15c00' : 'var(--vert-fonce)',
    }}>
      <Icon name={horsLigne ? 'cloche' : 'boite'} size={16} />
      <span style={{ flex: 1 }}>
        {horsLigne
          ? `Hors ligne — vos ventes sont enregistrées${enAttente ? ` (${enAttente} en attente)` : ''}`
          : `Synchronisation… ${enAttente} vente${enAttente > 1 ? 's' : ''} en attente`}
      </span>
      {enLigne && enAttente > 0 && (
        <button onClick={() => void synchroniser()} className="btn btn-clair" style={{ padding: '4px 12px', fontSize: 12 }}>
          Synchroniser
        </button>
      )}
    </div>
  );
}
