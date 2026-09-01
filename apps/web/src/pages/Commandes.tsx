import { useEffect, useState } from 'react';
import { formaterFCFA, TERMINOLOGIE, type Secteur } from '@kombi/shared';
import {
  listerCommandes, creerCommande, changerStatutCommande, type EntrepriseResume, type Commande,
} from '../lib/api.js';
import { Bouton, Champ, Icon } from '../components/ui.js';

const STATUT: Record<string, { label: string; classe: string }> = {
  en_attente: { label: 'En attente', classe: 'chip-bas' },
  en_cours: { label: 'En cours', classe: 'chip-bas' },
  livree: { label: 'Livrée', classe: 'chip-ok' },
  annulee: { label: 'Annulée', classe: 'chip-bas' },
};

export function Commandes({ entreprise, onRetour }: { entreprise: EntrepriseResume; onRetour: () => void }) {
  const term = TERMINOLOGIE[(entreprise.secteur as Secteur) ?? 'commerce'];
  const [liste, setListe] = useState<Commande[] | null>(null);
  const [vue, setVue] = useState<'liste' | 'nouveau'>('liste');

  function recharger() { listerCommandes(entreprise.id).then(setListe).catch(() => setListe([])); }
  useEffect(recharger, [entreprise.id]);

  async function avancer(c: Commande, statut: string) {
    await changerStatutCommande(entreprise.id, c.id, statut);
    recharger();
  }

  if (vue === 'nouveau')
    return <NouvelleCommande entreprise={entreprise} term={term} onFait={() => { setVue('liste'); recharger(); }} onRetour={() => setVue('liste')} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={onRetour} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="baisse" size={18} /> <h1 className="titre-page">{term.commandes[0]!.toUpperCase() + term.commandes.slice(1)}</h1>
        </button>
        <Bouton onClick={() => setVue('nouveau')}><Icon name="plus" size={18} /> {term.commande}</Bouton>
      </div>

      {liste === null ? <p className="muet">Chargement…</p>
        : liste.length === 0 ? (
          <div className="carte" style={{ textAlign: 'center', padding: 28 }}>
            <p className="muet">Aucune {term.commande} pour l'instant.</p>
            <Bouton onClick={() => setVue('nouveau')}>Nouvelle {term.commande}</Bouton>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {liste.map((c) => (
              <div key={c.id} className="carte" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{c.libelle}</div>
                    <div className="muet" style={{ fontSize: 13 }}>
                      {c.tiers_nom ?? 'Sans client'}{c.montant ? ` · ${formaterFCFA(c.montant)}` : ''}
                    </div>
                  </div>
                  <span className={`chip ${STATUT[c.statut]?.classe}`}>{STATUT[c.statut]?.label}</span>
                </div>
                {(c.statut === 'en_attente' || c.statut === 'en_cours') && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {c.statut === 'en_attente' && (
                      <button className="btn btn-clair" onClick={() => avancer(c, 'en_cours')}>Démarrer</button>
                    )}
                    {c.statut === 'en_cours' && (
                      <button className="btn btn-primaire" onClick={() => avancer(c, 'livree')}>
                        <Icon name="check" size={16} /> Terminée
                      </button>
                    )}
                    <button className="btn btn-ghost" onClick={() => avancer(c, 'annulee')}>Annuler</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function NouvelleCommande({ entreprise, term, onFait, onRetour }: {
  entreprise: EntrepriseResume; term: { commande: string }; onFait: () => void; onRetour: () => void;
}) {
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState('');
  const [charge, setCharge] = useState(false);
  const type = entreprise.secteur === 'service' ? 'mission' : 'commande';

  async function creer() {
    setCharge(true);
    try {
      await creerCommande(entreprise.id, {
        type, libelle, montant: montant ? Number(montant) : undefined,
      });
      onFait();
    } finally { setCharge(false); }
  }
  return (
    <div>
      <h1 className="titre-page" style={{ marginBottom: 12 }}>Nouvelle {term.commande}</h1>
      <div className="carte">
        <Champ label={`Objet de la ${term.commande}`} value={libelle} onChange={setLibelle}
          placeholder="Ex. Livraison 10 sacs de riz" />
        <Champ label="Montant estimé (optionnel)" type="text" value={montant}
          onChange={(v) => setMontant(v.replace(/\D/g, ''))} placeholder="40000" />
        <div style={{ display: 'flex', gap: 10 }}>
          <Bouton variante="clair" onClick={onRetour}>Annuler</Bouton>
          <Bouton bloc onClick={creer} disabled={charge || !libelle}>
            {charge ? '…' : 'Créer'}
          </Bouton>
        </div>
      </div>
    </div>
  );
}
