import { useEffect, useState } from 'react';
import { formaterFCFA } from '@kombi/shared';
import {
  listerProduits, creerProduit, approvisionner, type EntrepriseResume, type Produit,
} from '../lib/api.js';
import { Bouton, Champ, Icon } from '../components/ui.js';

export function Stock({ entreprise }: { entreprise: EntrepriseResume }) {
  const [produits, setProduits] = useState<Produit[] | null>(null);
  const [vue, setVue] = useState<'liste' | 'nouveau'>('liste');
  const [appro, setAppro] = useState<Produit | null>(null);

  function recharger() { listerProduits(entreprise.id).then(setProduits).catch(() => setProduits([])); }
  useEffect(recharger, [entreprise.id]);

  if (vue === 'nouveau')
    return <NouveauProduit entreprise={entreprise} onFait={() => { setVue('liste'); recharger(); }} />;
  if (appro)
    return <Approvisionner entreprise={entreprise} produit={appro}
      onFait={() => { setAppro(null); recharger(); }} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 className="titre-page">Stock</h1>
        <Bouton onClick={() => setVue('nouveau')}><Icon name="plus" size={18} /> Produit</Bouton>
      </div>

      {produits === null ? <p className="muet">Chargement…</p>
        : produits.length === 0 ? (
          <div className="carte" style={{ textAlign: 'center', padding: 28 }}>
            <p className="muet">Aucun produit pour l'instant.</p>
            <Bouton onClick={() => setVue('nouveau')}>Ajouter un produit</Bouton>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {produits.map((p) => (
              <div key={p.id} className="carte" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                  background: p.en_alerte ? 'var(--danger-clair)' : 'var(--vert-clair)',
                  color: p.en_alerte ? 'var(--danger)' : 'var(--vert)', display: 'grid', placeItems: 'center' }}>
                  <Icon name="stock" size={20} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{p.nom}</div>
                  <div className="muet" style={{ fontSize: 13 }}>{formaterFCFA(p.prix_vente)} · vente</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="chiffre" style={{ fontWeight: 700 }}>{p.stock_actuel}</div>
                  {p.en_alerte === 1
                    ? <span className="chip chip-bas">Rupture</span>
                    : <span className="muet" style={{ fontSize: 12 }}>en stock</span>}
                </div>
                <button onClick={() => setAppro(p)} className="btn btn-clair" style={{ padding: '8px 12px' }}>
                  <Icon name="plus" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function NouveauProduit({ entreprise, onFait }: { entreprise: EntrepriseResume; onFait: () => void }) {
  const [nom, setNom] = useState('');
  const [prix, setPrix] = useState('');
  const [seuil, setSeuil] = useState('5');
  const [charge, setCharge] = useState(false);

  async function creer() {
    setCharge(true);
    try {
      await creerProduit(entreprise.id, { nom, prixVente: Number(prix), seuilAlerte: Number(seuil) });
      onFait();
    } finally { setCharge(false); }
  }
  return (
    <div>
      <h1 className="titre-page" style={{ marginBottom: 12 }}>Nouveau produit</h1>
      <div className="carte">
        <Champ label="Nom du produit" value={nom} onChange={setNom} placeholder="Ex. Riz 5kg" />
        <Champ label="Prix de vente (FCFA)" type="text" value={prix}
          onChange={(v) => setPrix(v.replace(/\D/g, ''))} placeholder="4000" />
        <Champ label="Seuil d'alerte de rupture" type="text" value={seuil}
          onChange={(v) => setSeuil(v.replace(/\D/g, ''))} />
        <div style={{ display: 'flex', gap: 10 }}>
          <Bouton variante="clair" onClick={onFait}>Annuler</Bouton>
          <Bouton bloc onClick={creer} disabled={charge || !nom || !prix}>
            {charge ? '…' : 'Créer'}
          </Bouton>
        </div>
      </div>
    </div>
  );
}

function Approvisionner({ entreprise, produit, onFait }: {
  entreprise: EntrepriseResume; produit: Produit; onFait: () => void;
}) {
  const [qte, setQte] = useState('');
  const [cout, setCout] = useState(String(produit.cout_moyen_pondere || ''));
  const [mode, setMode] = useState('especes');
  const [charge, setCharge] = useState(false);

  async function valider() {
    setCharge(true);
    try {
      await approvisionner(entreprise.id, produit.id, {
        quantite: Number(qte), coutUnitaire: Number(cout), modePaiement: mode,
      });
      onFait();
    } finally { setCharge(false); }
  }
  return (
    <div>
      <h1 className="titre-page" style={{ marginBottom: 4 }}>Approvisionner</h1>
      <p className="muet" style={{ marginTop: 0 }}>{produit.nom} — stock actuel {produit.stock_actuel}</p>
      <div className="carte">
        <Champ label="Quantité reçue" type="text" value={qte}
          onChange={(v) => setQte(v.replace(/\D/g, ''))} placeholder="10" />
        <Champ label="Coût d'achat unitaire (FCFA)" type="text" value={cout}
          onChange={(v) => setCout(v.replace(/\D/g, ''))} placeholder="3000" />
        <Champ label="Payé par" value={mode} onChange={setMode} options={[
          { value: 'especes', label: 'Espèces' }, { value: 'mtn_momo', label: 'MTN MoMo' },
          { value: 'orange_money', label: 'Orange Money' }, { value: 'virement', label: 'Virement' },
        ]} />
        <div style={{ display: 'flex', gap: 10 }}>
          <Bouton variante="clair" onClick={onFait}>Annuler</Bouton>
          <Bouton bloc onClick={valider} disabled={charge || !qte || !cout}>
            {charge ? '…' : 'Enregistrer l\'entrée'}
          </Bouton>
        </div>
      </div>
    </div>
  );
}
