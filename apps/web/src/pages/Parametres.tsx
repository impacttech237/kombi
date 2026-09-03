import { useEffect, useState } from 'react';
import {
  getParametresEntreprise, majParametresEntreprise,
  type EntrepriseResume, type ParametresEntreprise,
} from '../lib/api.js';
import { Bouton, Champ, Icon } from '../components/ui.js';

const REGIME_LIBELLE: Record<string, string> = {
  igs: 'IGS (forfaitaire, sans TVA)', reel_simplifie: 'Réel simplifié', reel_normal: 'Réel normal',
};

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
      setParams(p);
      setNiu(p.niu ?? '');
      setAdherentCga(p.adherent_cga === 1);
      setAssujettiTva(p.assujetti_tva === 1);
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
    <div>
      <button onClick={onRetour} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Icon name="baisse" size={18} /> <h1 className="titre-page" style={{ margin: 0 }}>Paramètres fiscaux</h1>
      </button>

      {!params ? <p className="muet">Chargement…</p> : (
        <div className="carte">
          <p className="muet" style={{ fontSize: 13, marginTop: 0 }}>
            {params.raison_sociale} — régime {REGIME_LIBELLE[params.regime_fiscal] ?? params.regime_fiscal}
          </p>

          <Champ label="NIU (Numéro d'Identifiant Unique)" value={niu} onChange={setNiu} placeholder="M012345678901X" />

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '14px 0', fontSize: 14 }}>
            <input type="checkbox" checked={adherentCga} onChange={(e) => setAdherentCga(e.target.checked)}
              style={{ marginTop: 3 }} />
            <span>
              Adhérent d'un Centre de Gestion Agréé (CGA)
              <span className="muet" style={{ display: 'block', fontSize: 12 }}>
                Réduit l'IGS de moitié (CGI Art. C 40 (2)) — coché à tort si vous n'avez pas
                d'attestation d'adhésion, votre IGS réel serait sous-estimé.
              </span>
            </span>
          </label>

          {auReel && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '0 0 14px', fontSize: 14 }}>
              <input type="checkbox" checked={assujettiTva} onChange={(e) => setAssujettiTva(e.target.checked)}
                style={{ marginTop: 3 }} />
              <span>
                Assujetti à la TVA
                <span className="muet" style={{ display: 'block', fontSize: 12 }}>
                  Applique 19,25 % sur les ventes et factures, récupérable sur les achats/dépenses.
                </span>
              </span>
            </label>
          )}
          {!auReel && (
            <p className="muet" style={{ fontSize: 12, marginBottom: 14 }}>
              Au régime IGS, la TVA est interdite (CGI Art. 142) — ce réglage n'apparaît qu'au régime réel.
            </p>
          )}

          {erreur && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{erreur}</p>}
          {succes && <p style={{ color: 'var(--vert)', fontSize: 14 }}>Paramètres enregistrés.</p>}
          <Bouton bloc onClick={enregistrer} disabled={charge}>{charge ? '…' : 'Enregistrer'}</Bouton>
        </div>
      )}
    </div>
  );
}
