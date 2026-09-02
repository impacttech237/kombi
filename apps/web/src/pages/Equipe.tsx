import { useEffect, useState } from 'react';
import { ROLE_MEMBRE } from '@kombi/shared';
import {
  listerMembres, ajouterMembre, changerRoleMembre, retirerMembre,
  type EntrepriseResume, type Membre,
} from '../lib/api.js';
import { Bouton, Champ, Icon } from '../components/ui.js';

const LABEL_ROLE: Record<string, string> = {
  admin: 'Administrateur',
  gerant: 'Gérant',
  caissier: 'Caissier',
  comptable: 'Comptable',
  employe: 'Employé',
};

export function Equipe({ entreprise, onRetour }: { entreprise: EntrepriseResume; onRetour: () => void }) {
  const [liste, setListe] = useState<Membre[] | null>(null);
  const [vue, setVue] = useState<'liste' | 'ajouter'>('liste');
  const [erreur, setErreur] = useState('');

  function recharger() {
    listerMembres(entreprise.id).then(setListe).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }
  useEffect(recharger, [entreprise.id]);

  async function changer(m: Membre, role: string) {
    await changerRoleMembre(entreprise.id, m.id, role);
    recharger();
  }
  async function retirer(m: Membre) {
    await retirerMembre(entreprise.id, m.id);
    recharger();
  }

  if (vue === 'ajouter')
    return <AjouterMembre entreprise={entreprise} onFait={() => { setVue('liste'); recharger(); }} onRetour={() => setVue('liste')} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={onRetour} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="baisse" size={18} /> <h1 className="titre-page">Équipe</h1>
        </button>
        <Bouton onClick={() => setVue('ajouter')}><Icon name="plus" size={18} /> Membre</Bouton>
      </div>

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{erreur}</p>}

      {liste === null ? <p className="muet">Chargement…</p>
        : liste.length === 0 ? (
          <div className="carte" style={{ textAlign: 'center', padding: 28 }}>
            <p className="muet">Personne d'autre pour l'instant.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {liste.map((m) => (
              <div key={m.id} className="carte" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{m.nom}</div>
                    <div className="muet" style={{ fontSize: 13 }}>{m.email}</div>
                  </div>
                  <select value={m.role} onChange={(e) => changer(m, e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--bord)' }}>
                    {ROLE_MEMBRE.map((r) => <option key={r} value={r}>{LABEL_ROLE[r] ?? r}</option>)}
                  </select>
                  <button onClick={() => retirer(m)} aria-label="retirer"
                    style={{ border: 0, background: 'transparent', color: 'var(--danger)' }}>
                    <Icon name="baisse" size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function AjouterMembre({ entreprise, onFait, onRetour }: {
  entreprise: EntrepriseResume; onFait: () => void; onRetour: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('caissier');
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');

  async function ajouter() {
    setCharge(true); setErreur('');
    try {
      await ajouterMembre(entreprise.id, { email: email.trim(), role });
      onFait();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  return (
    <div>
      <h1 className="titre-page" style={{ marginBottom: 12 }}>Ajouter un membre</h1>
      <div className="carte">
        <p className="muet" style={{ marginTop: 0, fontSize: 13 }}>
          La personne doit déjà avoir un compte Kombi avec cet email.
        </p>
        <Champ label="Email" type="email" value={email} onChange={setEmail} placeholder="nom@exemple.com" />
        <Champ label="Rôle" value={role} onChange={setRole}
          options={ROLE_MEMBRE.filter((r) => r !== 'admin').map((r) => ({ value: r, label: LABEL_ROLE[r] ?? r }))} />
        {erreur && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{erreur}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <Bouton variante="clair" onClick={onRetour}>Annuler</Bouton>
          <Bouton bloc onClick={ajouter} disabled={charge || !email.trim()}>
            {charge ? '…' : 'Ajouter'}
          </Bouton>
        </div>
      </div>
    </div>
  );
}
