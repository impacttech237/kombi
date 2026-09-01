import { useEffect, useState } from 'react';
import { formaterFCFA } from '@kombi/shared';
import {
  enregistrerVente, listerProduits, type EntrepriseResume, type LigneCaisse, type Produit,
} from '../lib/api.js';
import { Bouton, Icon } from '../components/ui.js';

const MODES = [
  { code: 'especes', label: 'Espèces', icone: 'argent' },
  { code: 'mtn_momo', label: 'MTN MoMo', icone: 'caisse' },
  { code: 'orange_money', label: 'Orange Money', icone: 'caisse' },
  { code: 'virement', label: 'Virement', icone: 'boite' },
];

export function Caisse({ entreprise, onVendu }: { entreprise: EntrepriseResume; onVendu?: () => void }) {
  const [panier, setPanier] = useState<LigneCaisse[]>([]);
  const [design, setDesign] = useState('');
  const [prix, setPrix] = useState('');
  const [mode, setMode] = useState('especes');
  const [charge, setCharge] = useState(false);
  const [succes, setSucces] = useState<number | null>(null);
  const [erreur, setErreur] = useState('');
  const [produits, setProduits] = useState<Produit[]>([]);

  useEffect(() => {
    if (entreprise.secteur !== 'service')
      listerProduits(entreprise.id).then(setProduits).catch(() => {});
  }, [entreprise.id, entreprise.secteur]);

  const total = panier.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);

  function ajouterProduit(p: Produit) {
    setPanier([...panier, { designation: p.nom, quantite: 1, prixUnitaire: p.prix_vente, produitId: p.id }]);
  }

  function ajouter() {
    const p = Math.floor(Number(prix));
    if (!p || p <= 0) return;
    setPanier([...panier, { designation: design.trim() || 'Article', quantite: 1, prixUnitaire: p }]);
    setDesign(''); setPrix('');
  }
  function retirer(i: number) { setPanier(panier.filter((_, k) => k !== i)); }

  async function encaisser() {
    if (!panier.length) return;
    setCharge(true); setErreur('');
    try {
      const r = await enregistrerVente(entreprise.id, {
        lignes: panier, modePaiement: mode, clientUuid: crypto.randomUUID(),
      });
      setSucces(r.totalTtc); setPanier([]);
      onVendu?.();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  if (succes !== null) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 420, textAlign: 'center' }}>
        <div>
          <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--vert-clair)',
            color: 'var(--vert)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <Icon name="check" size={44} />
          </div>
          <h2 style={{ margin: '0 0 4px' }}>Encaissé !</h2>
          <p className="chiffre" style={{ fontSize: 34, fontWeight: 700, margin: '0 0 6px' }}>
            {formaterFCFA(succes)}
          </p>
          <p className="muet">Reçu enregistré. La comptabilité est à jour.</p>
          <div style={{ marginTop: 18 }}>
            <Bouton onClick={() => setSucces(null)}><Icon name="plus" size={18} /> Nouvelle vente</Bouton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="titre-page" style={{ marginBottom: 10 }}>Caisse</h1>

      <div className="carte" style={{ marginBottom: 14 }}>
        <div style={{ textAlign: 'center', padding: '6px 0 12px' }}>
          <div className="muet" style={{ fontSize: 13 }}>Total à encaisser</div>
          <div className="chiffre" style={{ fontSize: 40, fontWeight: 700 }}>{formaterFCFA(total)}</div>
        </div>

        {panier.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {panier.map((l, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--fond)', borderRadius: 12, padding: '10px 12px' }}>
                <span style={{ flex: 1 }}>{l.designation}</span>
                <span className="chiffre" style={{ fontWeight: 600 }}>{formaterFCFA(l.prixUnitaire)}</span>
                <button onClick={() => retirer(i)} style={{ border: 0, background: 'transparent',
                  color: 'var(--danger)' }} aria-label="retirer"><Icon name="baisse" size={18} /></button>
              </div>
            ))}
          </div>
        )}

        {produits.length > 0 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 10 }}>
            {produits.map((p) => (
              <button key={p.id} onClick={() => ajouterProduit(p)} className="btn btn-clair"
                style={{ flexShrink: 0, flexDirection: 'column', gap: 2, padding: '8px 14px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 13 }}>{p.nom}</span>
                <span className="chiffre" style={{ fontSize: 13 }}>{formaterFCFA(p.prix_vente)}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Article (optionnel)" value={design} onChange={(e) => setDesign(e.target.value)}
            style={{ flex: 1, padding: '12px 14px', border: '1px solid var(--bord)', borderRadius: 12 }} />
          <input placeholder="Montant" inputMode="numeric" value={prix}
            onChange={(e) => setPrix(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && ajouter()}
            style={{ width: 110, padding: '12px 14px', border: '1px solid var(--bord)', borderRadius: 12 }} />
          <button onClick={ajouter} className="btn btn-clair" style={{ padding: '0 16px' }}>
            <Icon name="plus" size={20} />
          </button>
        </div>
      </div>

      <p className="muet" style={{ fontSize: 13, margin: '0 2px 8px' }}>Mode de paiement</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {MODES.map((m) => {
          const on = m.code === mode;
          return (
            <button key={m.code} onClick={() => setMode(m.code)} className="carte" style={{
              padding: 14, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              border: on ? '2px solid var(--vert)' : '1px solid var(--bord)',
              background: on ? 'var(--vert-clair)' : '#fff', fontWeight: 600,
            }}>
              <Icon name={m.icone} size={18} /> {m.label}
            </button>
          );
        })}
      </div>

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{erreur}</p>}
      <Bouton bloc onClick={encaisser} disabled={charge || total <= 0}>
        {charge ? 'Encaissement…' : `Encaisser ${formaterFCFA(total)}`}
      </Bouton>
    </div>
  );
}
