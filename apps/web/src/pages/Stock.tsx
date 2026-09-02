import { useEffect, useState } from 'react';
import { formaterFCFA } from '@kombi/shared';
import { TAUX_TVA_EFFECTIF } from '@kombi/fiscal';
import {
  listerProduits, creerProduit, approvisionner, listerTiers, creerTiers, ajusterStock,
  type EntrepriseResume, type Produit, type Tiers,
} from '../lib/api.js';
import { Bouton, Champ, Icon } from '../components/ui.js';

export function Stock({ entreprise }: { entreprise: EntrepriseResume }) {
  const [produits, setProduits] = useState<Produit[] | null>(null);
  const [vue, setVue] = useState<'liste' | 'nouveau'>('liste');
  const [appro, setAppro] = useState<Produit | null>(null);
  const [ajust, setAjust] = useState<Produit | null>(null);

  function recharger() { listerProduits(entreprise.id).then(setProduits).catch(() => setProduits([])); }
  useEffect(recharger, [entreprise.id]);

  if (vue === 'nouveau')
    return <NouveauProduit entreprise={entreprise} onFait={() => { setVue('liste'); recharger(); }} />;
  if (appro)
    return <Approvisionner entreprise={entreprise} produit={appro}
      onFait={() => { setAppro(null); recharger(); }} />;
  if (ajust)
    return <AjusterStockEcran entreprise={entreprise} produit={ajust}
      onFait={() => { setAjust(null); recharger(); }} onAnnuler={() => setAjust(null)} />;

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
                  <div className="muet" style={{ fontSize: 13 }}>
                    {formaterFCFA(p.prix_vente)} · vente
                    {p.cout_moyen_pondere > 0 && (
                      <> · {formaterFCFA(p.cout_moyen_pondere)} CMP
                        {p.prix_vente > 0 && (
                          <> · marge {Math.round(((p.prix_vente - p.cout_moyen_pondere) / p.prix_vente) * 100)}%</>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="chiffre" style={{ fontWeight: 700 }}>{p.stock_actuel}</div>
                  {p.en_rupture === 1
                    ? <span className="chip chip-bas">Rupture</span>
                    : p.en_alerte === 1
                    ? <span className="chip chip-bas">Stock bas</span>
                    : <span className="muet" style={{ fontSize: 12 }}>en stock</span>}
                </div>
                <button onClick={() => setAjust(p)} className="btn btn-clair" style={{ padding: '8px 12px', fontSize: 12 }}>
                  Ajuster
                </button>
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
  const [aCredit, setACredit] = useState(false);
  const [avecTva, setAvecTva] = useState(false);
  const [fournisseurs, setFournisseurs] = useState<Tiers[]>([]);
  const [fournisseurId, setFournisseurId] = useState('');
  const [nouveauFournisseur, setNouveauFournisseur] = useState('');
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const tvaEligible = entreprise.regime_fiscal !== 'igs' && entreprise.assujetti_tva === 1;

  useEffect(() => {
    listerTiers(entreprise.id)
      .then((ts) => setFournisseurs(ts.filter((t) => t.type === 'fournisseur' || t.type === 'les_deux')))
      .catch(() => {});
  }, [entreprise.id]);

  async function valider() {
    setErreur(''); setCharge(true);
    try {
      let tiersId = fournisseurId;
      if (aCredit && !tiersId && nouveauFournisseur.trim()) {
        tiersId = (await creerTiers(entreprise.id, { nom: nouveauFournisseur.trim(), type: 'fournisseur' })).tiersId;
      }
      if (aCredit && !tiersId) { setErreur('Choisissez ou créez un fournisseur'); setCharge(false); return; }
      await approvisionner(entreprise.id, produit.id, {
        quantite: Number(qte), coutUnitaire: Number(cout),
        modePaiement: aCredit ? null : mode, aCredit, tiersId: aCredit ? tiersId : null,
        tauxTva: avecTva ? TAUX_TVA_EFFECTIF : 0,
      });
      onFait();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
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

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px', fontSize: 14 }}>
          <input type="checkbox" checked={aCredit} onChange={(e) => setACredit(e.target.checked)} />
          Achat à crédit (fournisseur payé plus tard)
        </label>
        {tvaEligible && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px', fontSize: 14 }}>
            <input type="checkbox" checked={avecTva} onChange={(e) => setAvecTva(e.target.checked)} />
            TVA récupérable sur cet achat (19,25 %)
          </label>
        )}

        {aCredit ? (
          <>
            {fournisseurs.length > 0 && (
              <Champ label="Fournisseur" value={fournisseurId} onChange={(v) => { setFournisseurId(v); setNouveauFournisseur(''); }}
                options={[{ value: '', label: 'Nouveau fournisseur…' }, ...fournisseurs.map((f) => ({ value: f.id, label: f.nom }))]} />
            )}
            {!fournisseurId && (
              <Champ label="Nom du fournisseur" value={nouveauFournisseur} onChange={setNouveauFournisseur} placeholder="Ex. Grossiste Awa" />
            )}
          </>
        ) : (
          <Champ label="Payé par" value={mode} onChange={setMode} options={[
            { value: 'especes', label: 'Espèces' }, { value: 'mtn_momo', label: 'MTN MoMo' },
            { value: 'orange_money', label: 'Orange Money' }, { value: 'virement', label: 'Virement' },
          ]} />
        )}

        {erreur && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{erreur}</p>}
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

const MOTIFS_AJUSTEMENT = ['Casse', 'Vol', 'Périmé', 'Écart d\'inventaire', 'Autre'];

/** Ajustement d'inventaire (casse, vol, écart constaté) — corrige le stock physique. */
function AjusterStockEcran({ entreprise, produit, onFait, onAnnuler }: {
  entreprise: EntrepriseResume; produit: Produit; onFait: () => void; onAnnuler: () => void;
}) {
  const [sens, setSens] = useState<'perte' | 'surplus'>('perte');
  const [quantite, setQuantite] = useState('');
  const [motif, setMotif] = useState(MOTIFS_AJUSTEMENT[0]!);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');

  async function valider() {
    const q = Number(quantite);
    if (!q || q <= 0) { setErreur('Quantité invalide'); return; }
    setCharge(true); setErreur('');
    try {
      await ajusterStock(entreprise.id, produit.id, { delta: sens === 'perte' ? -q : q, motif });
      onFait();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  return (
    <div>
      <h1 className="titre-page" style={{ marginBottom: 4 }}>Ajuster le stock</h1>
      <p className="muet" style={{ marginTop: 0 }}>{produit.nom} — stock actuel {produit.stock_actuel}</p>
      <div className="carte">
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button onClick={() => setSens('perte')}
            className={`btn ${sens === 'perte' ? 'btn-primaire' : 'btn-clair'}`} style={{ flex: 1 }}>
            Perte (casse, vol…)
          </button>
          <button onClick={() => setSens('surplus')}
            className={`btn ${sens === 'surplus' ? 'btn-primaire' : 'btn-clair'}`} style={{ flex: 1 }}>
            Surplus trouvé
          </button>
        </div>
        <Champ label="Quantité" type="text" value={quantite}
          onChange={(v) => setQuantite(v.replace(/\D/g, ''))} placeholder="2" />
        <Champ label="Motif" value={motif} onChange={setMotif}
          options={MOTIFS_AJUSTEMENT.map((m) => ({ value: m, label: m }))} />

        {erreur && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{erreur}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <Bouton variante="clair" onClick={onAnnuler}>Annuler</Bouton>
          <Bouton bloc onClick={valider} disabled={charge || !quantite}>
            {charge ? '…' : 'Valider l\'ajustement'}
          </Bouton>
        </div>
      </div>
    </div>
  );
}
