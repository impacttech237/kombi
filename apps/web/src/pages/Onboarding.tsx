import { useState } from 'react';
import { creerEntreprise, majParametresEntreprise } from '../lib/api.js';
import { Bouton, Champ, Icon } from '../components/ui.js';

const SECTEURS = [
  { code: 'commerce', titre: 'Commerce', desc: 'Je vends des produits, je gère du stock', icone: 'stock' },
  { code: 'service', titre: 'Services', desc: 'Je vends des prestations, pas de stock', icone: 'tiers' },
  { code: 'mixte', titre: 'Mixte', desc: 'Un peu des deux', icone: 'boite' },
];

const NATURES = [
  { value: 'negoce', label: 'Commerce / négoce' },
  { value: 'artisanal', label: 'Artisanat' },
  { value: 'service', label: 'Services' },
  { value: 'liberale', label: 'Profession libérale' },
];

export function Onboarding({ onCree }: { onCree: () => void }) {
  const [etape, setEtape] = useState<1 | 2>(1);
  const [secteur, setSecteur] = useState('commerce');
  const [raisonSociale, setRaison] = useState('');
  const [niu, setNiu] = useState('');
  const [natureActivite, setNature] = useState('negoce');
  const [adherentCga, setAdherentCga] = useState(false);
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  async function creer() {
    setErreur(''); setCharge(true);
    try {
      const { entrepriseId } = await creerEntreprise({ raisonSociale, secteur, natureActivite, niu: niu || undefined });
      if (adherentCga) {
        // Best-effort : la réduction IGS CGA (÷2) est un avantage, pas une condition de création.
        await majParametresEntreprise(entrepriseId, { adherentCga: true }).catch(() => {});
      }
      onCree();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setCharge(false);
    }
  }

  return (
    <div className="center-ecran">
      <div style={{ width: '100%', maxWidth: 420 }}>
        <h1 className="titre-page" style={{ marginBottom: 4 }}>
          {etape === 1 ? 'Votre activité' : 'Votre entreprise'}
        </h1>
        <p className="muet" style={{ marginTop: 0 }}>
          {etape === 1 ? 'On adapte Kombi à votre métier.' : 'Presque fini !'}
        </p>

        {etape === 1 ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '16px 0' }}>
              {SECTEURS.map((s) => {
                const on = s.code === secteur;
                return (
                  <button key={s.code} onClick={() => setSecteur(s.code)}
                    className="carte" style={{
                      textAlign: 'left', display: 'flex', gap: 14, alignItems: 'center', cursor: 'pointer',
                      border: on ? '2px solid var(--vert)' : '1px solid var(--bord)',
                      background: on ? 'var(--vert-clair)' : '#fff',
                    }}>
                    <span style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--vert)',
                      color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <Icon name={s.icone} size={22} />
                    </span>
                    <span style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, display: 'block' }}>{s.titre}</span>
                      <span className="muet" style={{ fontSize: 13 }}>{s.desc}</span>
                    </span>
                    {on && <span style={{ color: 'var(--vert)' }}><Icon name="check" /></span>}
                  </button>
                );
              })}
            </div>
            <Bouton bloc onClick={() => setEtape(2)}>Continuer</Bouton>
          </>
        ) : (
          <div className="carte" style={{ marginTop: 16 }}>
            <Champ label="Nom de l'entreprise" value={raisonSociale} onChange={setRaison}
              placeholder="Ex. Boutique Awa" />
            <Champ label="Nature de l'activité" value={natureActivite} onChange={setNature} options={NATURES} />
            <Champ label="NIU (facultatif)" value={niu} onChange={setNiu} placeholder="Numéro d'identifiant unique" />
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '4px 0 14px', fontSize: 14 }}>
              <input type="checkbox" checked={adherentCga} onChange={(e) => setAdherentCga(e.target.checked)}
                style={{ marginTop: 2 }} />
              <span>
                J'adhère à un Centre de Gestion Agréé (CGA)
                <span className="muet" style={{ display: 'block', fontSize: 12 }}>
                  Réduit de moitié l'IGS si vous êtes au régime IGS — modifiable plus tard dans Paramètres fiscaux.
                </span>
              </span>
            </label>
            {erreur && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{erreur}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <Bouton variante="clair" onClick={() => setEtape(1)}>Retour</Bouton>
              <Bouton bloc onClick={creer} disabled={charge || !raisonSociale}>
                {charge ? 'Création…' : 'Créer mon espace'}
              </Bouton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
