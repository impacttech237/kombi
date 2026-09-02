import { useEffect, useState } from 'react';
import { formaterFCFA } from '@kombi/shared';
import { listerDettesFournisseurs, payerAchat, type EntrepriseResume, type DetteFournisseur } from '../lib/api.js';
import { Bouton, Icon } from '../components/ui.js';

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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={onRetour} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="baisse" size={18} /> <h1 className="titre-page">Ce que je dois</h1>
        </button>
      </div>

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{erreur}</p>}

      {dettes !== null && dettes.length > 0 && (
        <div className="carte" style={{ textAlign: 'center', marginBottom: 12 }}>
          <div className="muet" style={{ fontSize: 13 }}>Total dû aux fournisseurs</div>
          <div className="chiffre" style={{ fontSize: 28, fontWeight: 700, color: 'var(--danger)' }}>{formaterFCFA(total)}</div>
        </div>
      )}

      {dettes === null ? <p className="muet">Chargement…</p>
        : dettes.length === 0 ? (
          <div className="carte" style={{ textAlign: 'center', padding: 28 }}>
            <p className="muet">Aucune dette en cours. Rien à régler !</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dettes.map((d) => <LigneDette key={d.id} entreprise={entreprise} dette={d} onFait={recharger} />)}
          </div>
        )}
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
      await payerAchat(entreprise.id, dette.id, { montant: Math.min(du, Number(montant) || 0), modePaiement: mode });
      setOuvert(false); onFait();
    } finally { setCharge(false); }
  }

  return (
    <div className="carte" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{dette.tiers_nom ?? 'Fournisseur'}</div>
          <div className="muet" style={{ fontSize: 13 }}>
            {dette.statut === 'payee_partiellement' ? 'Partiellement réglée' : 'Achat à crédit'}
          </div>
        </div>
        <div className="chiffre" style={{ fontWeight: 700, color: 'var(--danger)' }}>{formaterFCFA(du)}</div>
        <button onClick={() => setOuvert(!ouvert)} className="btn btn-clair" style={{ padding: '8px 12px' }}>
          Régler
        </button>
      </div>
      {ouvert && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <input value={montant} inputMode="numeric" onChange={(e) => setMontant(e.target.value.replace(/\D/g, ''))}
            style={{ width: 110, padding: '10px 12px', border: '1px solid var(--bord)', borderRadius: 12 }} />
          <select value={mode} onChange={(e) => setMode(e.target.value)}
            style={{ padding: '10px 12px', border: '1px solid var(--bord)', borderRadius: 12 }}>
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <Bouton onClick={regler} disabled={charge || !montant}>{charge ? '…' : 'Valider'}</Bouton>
        </div>
      )}
    </div>
  );
}
