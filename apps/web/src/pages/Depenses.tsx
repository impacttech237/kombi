import { useEffect, useState } from 'react';
import { formaterFCFA, CATEGORIES_DEPENSE } from '@kombi/shared';
import { listerDepenses, type EntrepriseResume, type Depense } from '../lib/api.js';
import { enfilerMutation, nouvelUuid } from '../offline/db.js';
import { synchroniser } from '../offline/sync.js';
import { Bouton, Champ, Icon } from '../components/ui.js';

const MODES_PAIEMENT = [
  { value: 'especes', label: 'Espèces' },
  { value: 'mtn_momo', label: 'MTN MoMo' },
  { value: 'orange_money', label: 'Orange Money' },
  { value: 'virement', label: 'Virement' },
  { value: 'cheque', label: 'Chèque' },
];

function labelCategorie(code: string): string {
  return CATEGORIES_DEPENSE.find((c) => c.code === code)?.label ?? code;
}

export function Depenses({ entreprise, onRetour }: { entreprise: EntrepriseResume; onRetour: () => void }) {
  const [liste, setListe] = useState<Depense[] | null>(null);
  const [vue, setVue] = useState<'liste' | 'nouveau'>('liste');

  function recharger() { listerDepenses(entreprise.id).then(setListe).catch(() => setListe((p) => p ?? [])); }
  useEffect(recharger, [entreprise.id]);

  if (vue === 'nouveau')
    return <NouvelleDepense entreprise={entreprise} onFait={() => { setVue('liste'); recharger(); }} onRetour={() => setVue('liste')} />;

  const totalMois = (liste ?? []).reduce((s, d) => s + d.montant, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={onRetour} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="baisse" size={18} /> <h1 className="titre-page">Dépenses</h1>
        </button>
        <Bouton onClick={() => setVue('nouveau')}><Icon name="plus" size={18} /> Dépense</Bouton>
      </div>

      {liste !== null && liste.length > 0 && (
        <div className="carte" style={{ textAlign: 'center', marginBottom: 12 }}>
          <div className="muet" style={{ fontSize: 13 }}>Total des dépenses enregistrées</div>
          <div className="chiffre" style={{ fontSize: 28, fontWeight: 700, color: 'var(--danger)' }}>
            {formaterFCFA(totalMois)}
          </div>
        </div>
      )}

      {liste === null ? <p className="muet">Chargement…</p>
        : liste.length === 0 ? (
          <div className="carte" style={{ textAlign: 'center', padding: 28 }}>
            <p className="muet">Aucune dépense enregistrée pour l'instant.</p>
            <Bouton onClick={() => setVue('nouveau')}>Nouvelle dépense</Bouton>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {liste.map((d) => (
              <div key={d.id} className="carte" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{d.libelle}</div>
                    <div className="muet" style={{ fontSize: 13 }}>
                      {labelCategorie(d.categorie)}{d.recurrente ? ' · récurrente' : ''}
                    </div>
                  </div>
                  <span className="chiffre" style={{ fontWeight: 700, color: 'var(--danger)' }}>
                    −{formaterFCFA(d.montant)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function NouvelleDepense({ entreprise, onFait, onRetour }: {
  entreprise: EntrepriseResume; onFait: () => void; onRetour: () => void;
}) {
  const [categorie, setCategorie] = useState(CATEGORIES_DEPENSE[0]!.code);
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState('');
  const [mode, setMode] = useState('especes');
  const [recurrente, setRecurrente] = useState(false);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');

  async function creer() {
    setCharge(true); setErreur('');
    try {
      // Offline-first : enregistrée localement (marche sans réseau), synchronisée dès que possible.
      const clientUuid = nouvelUuid();
      await enfilerMutation({
        clientUuid, entrepriseId: entreprise.id, type: 'depense',
        payload: {
          categorie, libelle: libelle.trim() || labelCategorie(categorie), montant: Number(montant),
          modePaiement: mode, recurrente,
        },
      });
      void synchroniser();
      onFait();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  return (
    <div>
      <h1 className="titre-page" style={{ marginBottom: 12 }}>Nouvelle dépense</h1>
      <div className="carte">
        <Champ label="Catégorie" value={categorie} onChange={setCategorie}
          options={CATEGORIES_DEPENSE.map((c) => ({ value: c.code, label: c.label }))} />
        <Champ label="Libellé" value={libelle} onChange={setLibelle}
          placeholder={`Ex. ${labelCategorie(categorie)} de ce mois`} />
        <Champ label="Montant (FCFA)" type="text" value={montant}
          onChange={(v) => setMontant(v.replace(/\D/g, ''))} placeholder="25000" />
        <Champ label="Mode de paiement" value={mode} onChange={setMode} options={MODES_PAIEMENT} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 14px', fontSize: 14 }}>
          <input type="checkbox" checked={recurrente} onChange={(e) => setRecurrente(e.target.checked)} />
          Dépense récurrente (loyer, abonnement…)
        </label>
        {erreur && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{erreur}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <Bouton variante="clair" onClick={onRetour}>Annuler</Bouton>
          <Bouton bloc onClick={creer} disabled={charge || !montant || Number(montant) <= 0}>
            {charge ? '…' : 'Enregistrer'}
          </Bouton>
        </div>
      </div>
    </div>
  );
}
