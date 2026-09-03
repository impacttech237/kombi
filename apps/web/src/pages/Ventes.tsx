import { useEffect, useState } from 'react';
import { formaterFCFA, peut, type RoleMembre } from '@kombi/shared';
import {
  listerVentesRecentes, annulerVente, creerFactureDepuisVente, type EntrepriseResume, type VenteRecente,
} from '../lib/api.js';
import { Icon } from '../components/ui.js';

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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={onRetour} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="baisse" size={18} /> <h1 className="titre-page">Historique des ventes</h1>
        </button>
      </div>

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{erreur}</p>}

      {ventes === null ? <p className="muet">Chargement…</p>
        : ventes.length === 0 ? (
          <div className="carte" style={{ textAlign: 'center', padding: 28 }}>
            <p className="muet">Aucune vente enregistrée pour l'instant.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ventes.map((v) => (
              <LigneVente key={v.id} entreprise={entreprise} vente={v} peutAnnuler={peutAnnuler} onFait={recharger} />
            ))}
          </div>
        )}
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
    <div className="carte" style={{ padding: 14, opacity: vente.statut === 'annulee' ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{vente.tiers_nom ?? 'Vente au comptant'}</div>
          <div className="muet" style={{ fontSize: 13 }}>
            {new Date(vente.date).toLocaleString('fr-FR')}
            {vente.mode_paiement ? ` · ${LIBELLE_MODE[vente.mode_paiement] ?? vente.mode_paiement}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="chiffre" style={{ fontWeight: 700 }}>{formaterFCFA(vente.total_ttc)}</div>
          <span className={`chip ${vente.statut === 'annulee' ? 'chip-bas' : ''}`}>
            {LIBELLE_STATUT[vente.statut] ?? vente.statut}
          </span>
        </div>
        {facturable && (
          <button onClick={facturer} disabled={chargeFacture} className="btn btn-clair" style={{ padding: '8px 12px' }}>
            {chargeFacture ? '…' : 'Facturer'}
          </button>
        )}
        {annulable && (
          <button onClick={() => setConfirmation(!confirmation)} className="btn btn-clair" style={{ padding: '8px 12px' }}>
            Annuler
          </button>
        )}
      </div>
      {vente.facture_id && vente.statut !== 'annulee' && (
        <p className="muet" style={{ fontSize: 12, marginTop: 8 }}>
          Une facture a été émise pour cette vente — annulez-la via un avoir sur l'écran Factures.
        </p>
      )}
      {vente.statut === 'payee' && !vente.facture_id && !vente.tiers_nom && (
        <p className="muet" style={{ fontSize: 12, marginTop: 8 }}>
          Vente sans client associé — impossible de la facturer a posteriori (ajoutez un client via Tiers, puis
          recommencez la vente si une facture est nécessaire).
        </p>
      )}
      {confirmation && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 14 }}>
            Confirmer l'annulation ? La marchandise revient en stock et l'écriture est contre-passée.
          </p>
          {erreur && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{erreur}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={annuler} disabled={charge} className="btn btn-clair" style={{ padding: '8px 14px' }}>
              {charge ? '…' : 'Oui, annuler'}
            </button>
            <button onClick={() => setConfirmation(false)} style={{ all: 'unset', cursor: 'pointer', padding: '8px 14px' }}>
              Retour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
