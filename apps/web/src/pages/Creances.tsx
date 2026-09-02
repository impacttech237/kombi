import { useEffect, useState } from 'react';
import { formaterFCFA } from '@kombi/shared';
import {
  listerVentesACredit, listerFacturesImpayees, payerVente, payerFacture,
  type EntrepriseResume, type VenteACredit, type FactureImpayee,
} from '../lib/api.js';
import { Bouton, Icon } from '../components/ui.js';

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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={onRetour} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="baisse" size={18} /> <h1 className="titre-page">On me doit</h1>
        </button>
      </div>

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{erreur}</p>}

      {!chargement && (ventes!.length > 0 || factures!.length > 0) && (
        <div className="carte" style={{ textAlign: 'center', marginBottom: 12 }}>
          <div className="muet" style={{ fontSize: 13 }}>Total dû par les clients</div>
          <div className="chiffre" style={{ fontSize: 28, fontWeight: 700, color: 'var(--vert)' }}>{formaterFCFA(total)}</div>
        </div>
      )}

      {chargement ? <p className="muet">Chargement…</p>
        : ventes!.length === 0 && factures!.length === 0 ? (
          <div className="carte" style={{ textAlign: 'center', padding: 28 }}>
            <p className="muet">Aucune créance en cours. Personne ne vous doit rien !</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ventes!.map((v) => (
              <LigneCreance key={v.id} entreprise={entreprise} titre={v.tiers_nom ?? 'Client'}
                sousTitre="Vente à crédit" du={v.total_ttc - v.regle}
                onPayer={(montant, mode) => payerVente(entreprise.id, v.id, { montant, modePaiement: mode })}
                onFait={recharger} />
            ))}
            {factures!.map((f) => (
              <LigneCreance key={f.id} entreprise={entreprise} titre={f.tiers_nom ?? 'Client'}
                sousTitre={f.numero} du={f.montantDu} enRetard={f.enRetard}
                onPayer={(montant, mode) => payerFacture(entreprise.id, f.id, { montant, modePaiement: mode })}
                onFait={recharger} />
            ))}
          </div>
        )}
    </div>
  );
}

function LigneCreance({ titre, sousTitre, du, enRetard, onPayer, onFait }: {
  entreprise: EntrepriseResume; titre: string; sousTitre: string; du: number; enRetard?: boolean;
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
    <div className="carte" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{titre}</div>
          <div className="muet" style={{ fontSize: 13 }}>{sousTitre}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="chiffre" style={{ fontWeight: 700 }}>{formaterFCFA(du)}</div>
          {enRetard && <span className="chip chip-bas">En retard</span>}
        </div>
        <button onClick={() => setOuvert(!ouvert)} className="btn btn-clair" style={{ padding: '8px 12px' }}>
          Encaisser
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
          <Bouton onClick={encaisser} disabled={charge || !montant}>{charge ? '…' : 'Valider'}</Bouton>
        </div>
      )}
    </div>
  );
}
