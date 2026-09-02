import { useEffect, useState } from 'react';
import { formaterFCFA } from '@kombi/shared';
import {
  listerFactures, creerFacture, emettreFacture, creerAvoir, payerFacture, urlPdfFacture,
  listerTiers, creerTiers, type EntrepriseResume, type FactureResume, type Tiers, type LigneFacture,
} from '../lib/api.js';
import { Bouton, Champ, Icon } from '../components/ui.js';

const STATUT_LIBELLE: Record<string, string> = {
  brouillon: 'Brouillon', envoyee: 'Envoyée', payee_partiellement: 'Partiel',
  payee: 'Payée', en_retard: 'En retard', annulee: 'Annulée',
};

const MODES_PAIEMENT = [
  { value: 'especes', label: 'Espèces' }, { value: 'mtn_momo', label: 'MTN MoMo' },
  { value: 'orange_money', label: 'Orange Money' }, { value: 'virement', label: 'Virement' },
  { value: 'cheque', label: 'Chèque' },
];

export function Factures({ entreprise }: { entreprise: EntrepriseResume }) {
  const [liste, setListe] = useState<FactureResume[] | null>(null);
  const [vue, setVue] = useState<'liste' | 'nouveau'>('liste');

  function recharger() { listerFactures(entreprise.id).then(setListe).catch(() => setListe([])); }
  useEffect(recharger, [entreprise.id]);

  if (vue === 'nouveau')
    return <NouvelleFacture entreprise={entreprise} onFait={() => { setVue('liste'); recharger(); }} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 className="titre-page">Factures</h1>
        <Bouton onClick={() => setVue('nouveau')}><Icon name="plus" size={18} /> Facture</Bouton>
      </div>
      {liste === null ? <p className="muet">Chargement…</p>
        : liste.length === 0 ? (
          <div className="carte" style={{ textAlign: 'center', padding: 28 }}>
            <p className="muet">Aucune facture. Créez votre première facture ou devis.</p>
            <Bouton onClick={() => setVue('nouveau')}>Nouvelle facture</Bouton>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {liste.map((f) => <CarteFacture key={f.id} entreprise={entreprise} f={f} onMaj={recharger} />)}
          </div>
        )}
    </div>
  );
}

function CarteFacture({ entreprise, f, onMaj }: { entreprise: EntrepriseResume; f: FactureResume; onMaj: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [payMode, setPayMode] = useState(false);
  const [montant, setMontant] = useState(String(f.total_ttc));
  const [modePaiement, setModePaiement] = useState('especes');
  const paye = f.statut === 'payee';

  async function voirPdf() {
    try { window.open(await urlPdfFacture(entreprise.id, f.id), '_blank'); } catch { /* ignore */ }
  }
  function whatsapp() {
    const txt = encodeURIComponent(`Bonjour, voici votre ${f.type} ${f.numero ?? ''} d'un montant de ${formaterFCFA(f.total_ttc)}. Merci !`);
    window.open(`https://wa.me/?text=${txt}`, '_blank');
  }
  async function payer() {
    await payerFacture(entreprise.id, f.id, { montant: Number(montant), modePaiement });
    setPayMode(false); onMaj();
  }
  async function avoir() {
    if (!confirm(`Émettre un avoir pour ${f.numero} (${formaterFCFA(f.total_ttc)}) ?`)) return;
    await creerAvoir(entreprise.id, f.id);
    onMaj();
  }

  return (
    <div className="carte" style={{ padding: 14 }}>
      <button onClick={() => setOuvert(!ouvert)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--vert-clair)', color: 'var(--vert)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="graph" size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{f.numero ?? 'Brouillon'}</div>
          <div className="muet" style={{ fontSize: 13 }}>{f.tiers_nom ?? '—'} · {f.type}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="chiffre" style={{ fontWeight: 700 }}>{formaterFCFA(f.total_ttc)}</div>
          {f.avoir_de_id
            ? <span className="chip chip-bas">Avoir</span>
            : <span className={`chip ${paye ? 'chip-ok' : 'chip-bas'}`}>{STATUT_LIBELLE[f.statut]}</span>}
        </div>
      </button>

      {ouvert && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-clair" onClick={voirPdf}><Icon name="graph" size={16} /> PDF</button>
          <button className="btn btn-clair" onClick={whatsapp}>WhatsApp</button>
          {!paye && f.type === 'facture' && !f.avoir_de_id && (
            <button className="btn btn-primaire" onClick={() => setPayMode(!payMode)}>Encaisser</button>
          )}
          {f.type === 'facture' && f.statut !== 'brouillon' && !f.avoir_de_id && !f.a_un_avoir && (
            <button className="btn btn-clair" onClick={avoir} style={{ color: 'var(--danger)' }}>Avoir</button>
          )}
          {payMode && (
            <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 6, flexWrap: 'wrap' }}>
              <input value={montant} inputMode="numeric" onChange={(e) => setMontant(e.target.value.replace(/\D/g, ''))}
                style={{ width: 110, padding: '10px 12px', border: '1px solid var(--bord)', borderRadius: 12 }} />
              <select value={modePaiement} onChange={(e) => setModePaiement(e.target.value)}
                style={{ padding: '10px 12px', border: '1px solid var(--bord)', borderRadius: 12 }}>
                {MODES_PAIEMENT.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <Bouton onClick={payer}>Valider</Bouton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NouvelleFacture({ entreprise, onFait }: { entreprise: EntrepriseResume; onFait: () => void }) {
  const [type, setType] = useState<'facture' | 'devis'>('facture');
  const [tiers, setTiers] = useState<Tiers[]>([]);
  const [tiersId, setTiersId] = useState('');
  const [nouveauClient, setNouveauClient] = useState('');
  const [lignes, setLignes] = useState<LigneFacture[]>([]);
  const [design, setDesign] = useState('');
  const [prix, setPrix] = useState('');
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');

  useEffect(() => { listerTiers(entreprise.id).then(setTiers).catch(() => {}); }, [entreprise.id]);
  const total = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);

  function ajouter() {
    const p = Math.floor(Number(prix));
    if (!p) return;
    setLignes([...lignes, { designation: design.trim() || 'Article', quantite: 1, prixUnitaire: p }]);
    setDesign(''); setPrix('');
  }

  async function creer() {
    setErreur(''); setCharge(true);
    try {
      let cid = tiersId;
      if (!cid && nouveauClient.trim()) {
        cid = (await creerTiers(entreprise.id, { nom: nouveauClient.trim() })).tiersId;
      }
      if (!cid) { setErreur('Choisissez ou créez un client'); setCharge(false); return; }
      const { factureId } = await creerFacture(entreprise.id, { type, tiersId: cid, lignes });
      await emettreFacture(entreprise.id, factureId); // attribue le numéro séquentiel
      onFait();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  return (
    <div>
      <h1 className="titre-page" style={{ marginBottom: 12 }}>Nouvelle {type}</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['facture', 'devis'] as const).map((t) => (
          <button key={t} onClick={() => setType(t)} className={`btn ${type === t ? 'btn-primaire' : 'btn-clair'}`} style={{ flex: 1 }}>
            {t === 'facture' ? 'Facture' : 'Devis'}
          </button>
        ))}
      </div>

      <div className="carte" style={{ marginBottom: 12 }}>
        {tiers.length > 0 && (
          <Champ label="Client" value={tiersId} onChange={setTiersId} options={[
            { value: '', label: '— Nouveau client —' },
            ...tiers.map((t) => ({ value: t.id, label: t.nom })),
          ]} />
        )}
        {!tiersId && (
          <Champ label="Nom du nouveau client" value={nouveauClient} onChange={setNouveauClient} placeholder="Ex. Ese Kombi SARL" />
        )}
      </div>

      <div className="carte" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <strong>Lignes</strong>
          <span className="chiffre" style={{ fontWeight: 700 }}>{formaterFCFA(total)}</span>
        </div>
        {lignes.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <span style={{ flex: 1 }}>{l.designation}</span>
            <span className="chiffre">{formaterFCFA(l.prixUnitaire)}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input placeholder="Désignation" value={design} onChange={(e) => setDesign(e.target.value)}
            style={{ flex: 1, padding: '11px 13px', border: '1px solid var(--bord)', borderRadius: 12 }} />
          <input placeholder="Prix" inputMode="numeric" value={prix} onChange={(e) => setPrix(e.target.value.replace(/\D/g, ''))}
            style={{ width: 100, padding: '11px 13px', border: '1px solid var(--bord)', borderRadius: 12 }} />
          <button onClick={ajouter} className="btn btn-clair" style={{ padding: '0 14px' }}><Icon name="plus" size={18} /></button>
        </div>
      </div>

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{erreur}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <Bouton variante="clair" onClick={onFait}>Annuler</Bouton>
        <Bouton bloc onClick={creer} disabled={charge || !lignes.length}>
          {charge ? 'Émission…' : `Créer et émettre`}
        </Bouton>
      </div>
    </div>
  );
}
