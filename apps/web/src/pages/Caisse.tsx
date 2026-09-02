import { useEffect, useState } from 'react';
import { formaterFCFA } from '@kombi/shared';
import {
  listerProduits, listerTiers, type EntrepriseResume, type LigneCaisse, type Produit, type Tiers,
} from '../lib/api.js';
import { enfilerMutation, nouvelUuid } from '../offline/db.js';
import { synchroniser } from '../offline/sync.js';
import { Bouton, Icon } from '../components/ui.js';

const MODES = [
  { code: 'especes', label: 'Espèces', icone: 'argent' },
  { code: 'mtn_momo', label: 'MTN MoMo', icone: 'caisse' },
  { code: 'orange_money', label: 'Orange Money', icone: 'caisse' },
  { code: 'virement', label: 'Virement', icone: 'boite' },
];

interface Recu { total: number; lignes: LigneCaisse[]; recu: number; rendu: number; aCredit: boolean; client: string | null; }

export function Caisse({ entreprise, onVendu }: { entreprise: EntrepriseResume; onVendu?: () => void }) {
  const [panier, setPanier] = useState<LigneCaisse[]>([]);
  const [design, setDesign] = useState('');
  const [prix, setPrix] = useState('');
  const [mode, setMode] = useState('especes');
  const [tiersId, setTiersId] = useState('');
  const [montantRecu, setMontantRecu] = useState('');
  const [charge, setCharge] = useState(false);
  const [succes, setSucces] = useState<Recu | null>(null);
  const [erreur, setErreur] = useState('');
  const [produits, setProduits] = useState<Produit[]>([]);
  const [tiers, setTiers] = useState<Tiers[]>([]);

  useEffect(() => {
    if (entreprise.secteur !== 'service')
      listerProduits(entreprise.id).then(setProduits).catch(() => {});
    listerTiers(entreprise.id).then(setTiers).catch(() => {});
  }, [entreprise.id, entreprise.secteur]);

  const total = panier.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);
  const aCredit = mode === 'credit';
  const recu = montantRecu ? Number(montantRecu) : total;
  const rendu = aCredit ? 0 : Math.max(0, recu - total);
  const insuffisant = !aCredit && recu < total;

  function ajouterProduit(p: Produit) {
    const existante = panier.findIndex((l) => l.produitId === p.id);
    if (existante >= 0) {
      const copie = [...panier];
      copie[existante] = { ...copie[existante]!, quantite: copie[existante]!.quantite + 1 };
      setPanier(copie);
    } else {
      setPanier([...panier, { designation: p.nom, quantite: 1, prixUnitaire: p.prix_vente, produitId: p.id }]);
    }
  }

  function ajouter() {
    const p = Math.floor(Number(prix));
    if (!p || p <= 0) return;
    setPanier([...panier, { designation: design.trim() || 'Article', quantite: 1, prixUnitaire: p }]);
    setDesign(''); setPrix('');
  }
  function retirer(i: number) { setPanier(panier.filter((_, k) => k !== i)); }
  function changerQuantite(i: number, delta: number) {
    const copie = [...panier];
    const q = copie[i]!.quantite + delta;
    if (q <= 0) { retirer(i); return; }
    copie[i] = { ...copie[i]!, quantite: q };
    setPanier(copie);
  }

  async function encaisser() {
    if (!panier.length) return;
    if (aCredit && !tiersId) { setErreur('Choisissez un client pour une vente à crédit'); return; }
    if (insuffisant) { setErreur('Le montant reçu est inférieur au total'); return; }
    setCharge(true); setErreur('');
    try {
      // Offline-first : on enregistre localement (marche sans réseau), puis on tente la synchro.
      const clientUuid = nouvelUuid();
      await enfilerMutation({
        clientUuid, entrepriseId: entreprise.id, type: 'vente',
        payload: {
          lignes: panier, modePaiement: aCredit ? null : mode, aCredit,
          tiersId: tiersId || null,
        },
      });
      void synchroniser(); // rejeu immédiat si en ligne ; sinon au retour du réseau
      setSucces({
        total, lignes: panier, recu: aCredit ? 0 : recu, rendu, aCredit,
        client: tiersId ? (tiers.find((t) => t.id === tiersId)?.nom ?? null) : null,
      });
      setPanier([]); setMontantRecu(''); setTiersId('');
      onVendu?.();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  if (succes !== null) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 420, textAlign: 'center' }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--vert-clair)',
            color: 'var(--vert)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <Icon name="check" size={44} />
          </div>
          <h2 style={{ margin: '0 0 4px' }}>{succes.aCredit ? 'Vente à crédit enregistrée' : 'Encaissé !'}</h2>
          <p className="chiffre" style={{ fontSize: 34, fontWeight: 700, margin: '0 0 6px' }}>
            {formaterFCFA(succes.total)}
          </p>
          {succes.aCredit ? (
            <p className="muet">À régler par {succes.client ?? 'le client'}. La comptabilité est à jour.</p>
          ) : (
            <>
              {succes.rendu > 0 && (
                <p className="muet" style={{ margin: '0 0 4px' }}>
                  Reçu {formaterFCFA(succes.recu)} · Rendu-monnaie <strong>{formaterFCFA(succes.rendu)}</strong>
                </p>
              )}
              <p className="muet">Reçu enregistré. La comptabilité est à jour.</p>
            </>
          )}

          <div className="carte" id="recu-impression" style={{ textAlign: 'left', margin: '16px 0', fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{entreprise.raison_sociale}</div>
            {succes.client && <div className="muet" style={{ marginBottom: 6 }}>Client : {succes.client}</div>}
            {succes.lignes.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span>{l.quantite} × {l.designation}</span>
                <span className="chiffre">{formaterFCFA(l.quantite * l.prixUnitaire)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--bord)',
              marginTop: 6, paddingTop: 6, fontWeight: 700 }}>
              <span>Total</span><span className="chiffre">{formaterFCFA(succes.total)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Bouton variante="clair" onClick={() => window.print()}><Icon name="facture" size={16} /> Imprimer le reçu</Bouton>
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
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.designation}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => changerQuantite(i, -1)} className="btn btn-clair" style={{ width: 28, height: 28, padding: 0 }}>−</button>
                  <span className="chiffre" style={{ minWidth: 18, textAlign: 'center' }}>{l.quantite}</span>
                  <button onClick={() => changerQuantite(i, 1)} className="btn btn-clair" style={{ width: 28, height: 28, padding: 0 }}>+</button>
                </div>
                <span className="chiffre" style={{ fontWeight: 600, minWidth: 70, textAlign: 'right' }}>
                  {formaterFCFA(l.quantite * l.prixUnitaire)}
                </span>
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

      {tiers.length > 0 && (
        <div className="champ" style={{ marginBottom: 4 }}>
          <label>Client {aCredit ? '(requis pour une vente à crédit)' : '(optionnel)'}</label>
          <select value={tiersId} onChange={(e) => setTiersId(e.target.value)}>
            <option value="">Aucun client</option>
            {tiers.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
          </select>
        </div>
      )}

      <p className="muet" style={{ fontSize: 13, margin: '12px 2px 8px' }}>Mode de paiement</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
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
        {tiers.length > 0 && (
          <button onClick={() => setMode('credit')} className="carte" style={{
            padding: 14, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            gridColumn: '1 / -1', border: aCredit ? '2px solid var(--vert)' : '1px solid var(--bord)',
            background: aCredit ? 'var(--vert-clair)' : '#fff', fontWeight: 600,
          }}>
            <Icon name="boite" size={18} /> À crédit (le client paiera plus tard)
          </button>
        )}
      </div>

      {!aCredit && (
        <div className="champ" style={{ marginBottom: 4 }}>
          <label>Montant reçu</label>
          <input inputMode="numeric" placeholder={String(total)} value={montantRecu}
            onChange={(e) => setMontantRecu(e.target.value.replace(/\D/g, ''))}
            style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--bord)', borderRadius: 12, boxSizing: 'border-box' }} />
        </div>
      )}
      {!aCredit && montantRecu !== '' && (
        <p className="muet" style={{ fontSize: 13, margin: '0 2px 12px' }}>
          Rendu-monnaie : <strong className="chiffre">{formaterFCFA(rendu)}</strong>
        </p>
      )}

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{erreur}</p>}
      <Bouton bloc onClick={encaisser} disabled={charge || total <= 0 || insuffisant || (aCredit && !tiersId)}>
        {charge ? '…' : aCredit ? `Enregistrer à crédit ${formaterFCFA(total)}` : `Encaisser ${formaterFCFA(total)}`}
      </Bouton>
    </div>
  );
}
