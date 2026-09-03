import { useEffect, useState } from 'react';
import { formaterFCFA, CATEGORIES_DEPENSE } from '@kombi/shared';
import {
  listerDepenses, televerserPieceDepense, urlPieceDepense, supprimerPieceDepense,
  type EntrepriseResume, type Depense,
} from '../lib/api.js';
import { enfilerMutation, nouvelUuid } from '../offline/db.js';
import { synchroniser } from '../offline/sync.js';
import { Bouton, Champ, Icon } from '../components/ui.js';

/**
 * Re-décode l'image via le décodeur natif du navigateur puis la redessine sur un canvas — le
 * lecteur PNG/JPEG interne de Tesseract.js (Leptonica/WASM) est plus strict que celui du
 * navigateur et échoue sur certains fichiers pourtant valides (constaté avec un PNG généré par
 * PIL). Passer un canvas normalise systématiquement le format et évite ce cas.
 */
async function normaliserImage(fichier: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image illisible'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Extrait le texte d'une image via OCR côté navigateur (Tesseract.js, aucune clé/API externe).
 * Chargé à la demande (le moteur + les données de langue pèsent plusieurs Mo). */
async function lireTexteImage(fichier: File): Promise<string> {
  const [{ recognize }, canvas] = await Promise.all([import('tesseract.js'), normaliserImage(fichier)]);
  const { data } = await recognize(canvas, 'fra');
  return data.text.trim();
}

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
            {liste.map((d) => <LigneDepense key={d.id} entreprise={entreprise} depense={d} onMaj={recharger} />)}
          </div>
        )}
    </div>
  );
}

function LigneDepense({ entreprise, depense, onMaj }: {
  entreprise: EntrepriseResume; depense: Depense; onMaj: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');

  async function ajouterPiece(fichier: File) {
    setCharge(true); setErreur('');
    try {
      await televerserPieceDepense(entreprise.id, depense.id, fichier);
      onMaj();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  async function voirPiece() {
    try { window.open(await urlPieceDepense(entreprise.id, depense.id), '_blank'); } catch { /* ignore */ }
  }

  async function retirerPiece() {
    if (!confirm('Retirer la pièce jointe de cette dépense ?')) return;
    setCharge(true);
    try { await supprimerPieceDepense(entreprise.id, depense.id); onMaj(); } finally { setCharge(false); }
  }

  return (
    <div className="carte" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{depense.libelle}</div>
          <div className="muet" style={{ fontSize: 13 }}>
            {labelCategorie(depense.categorie)}{depense.recurrente ? ' · récurrente' : ''}
          </div>
        </div>
        <span className="chiffre" style={{ fontWeight: 700, color: 'var(--danger)' }}>
          −{formaterFCFA(depense.montant)}
        </span>
        <button onClick={() => setOuvert(!ouvert)} className="btn btn-clair"
          style={{ padding: '6px 10px', color: depense.piece_cle ? 'var(--vert)' : undefined }}
          aria-label={depense.piece_cle ? 'Pièce jointe' : 'Joindre une pièce'}
          title={depense.piece_cle ? 'Pièce jointe' : 'Joindre une pièce'}>
          <Icon name="facture" size={16} />
        </button>
      </div>
      {ouvert && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--bord)' }}>
          {depense.piece_cle ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-clair" onClick={voirPiece}>Voir la pièce</button>
              <button className="btn btn-clair" onClick={() => document.getElementById(`piece-${depense.id}`)?.click()}
                disabled={charge}>Remplacer</button>
              <button className="btn btn-clair" onClick={retirerPiece} disabled={charge}
                style={{ color: 'var(--danger)' }}>Retirer</button>
            </div>
          ) : (
            <p className="muet" style={{ fontSize: 13, margin: '0 0 8px' }}>
              Photo du reçu/de la facture — utile pour retrouver le justificatif plus tard.
            </p>
          )}
          <input id={`piece-${depense.id}`} type="file" accept="image/*,application/pdf" capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void ajouterPiece(f); e.target.value = ''; }} />
          {!depense.piece_cle && (
            <Bouton variante="clair" onClick={() => document.getElementById(`piece-${depense.id}`)?.click()} disabled={charge}>
              {charge ? 'Envoi…' : 'Joindre une photo/PDF'}
            </Bouton>
          )}
          {erreur && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{erreur}</p>}
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
  const [dateOperation, setDateOperation] = useState('');
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const [texteScan, setTexteScan] = useState('');
  const [lectureEnCours, setLectureEnCours] = useState(false);

  async function scanner(fichier: File) {
    setLectureEnCours(true); setTexteScan('');
    try {
      setTexteScan(await lireTexteImage(fichier) || '(aucun texte détecté)');
    } catch {
      setTexteScan('Lecture impossible sur cette image.');
    } finally { setLectureEnCours(false); }
  }

  async function creer() {
    setCharge(true); setErreur('');
    try {
      // Offline-first : enregistrée localement (marche sans réseau), synchronisée dès que possible.
      const clientUuid = nouvelUuid();
      await enfilerMutation({
        clientUuid, entrepriseId: entreprise.id, type: 'depense',
        payload: {
          categorie, libelle: libelle.trim() || labelCategorie(categorie), montant: Number(montant),
          modePaiement: mode, recurrente, dateOperation: dateOperation || null,
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
      <div className="carte" style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          <Icon name="facture" size={18} /> Scanner un reçu (optionnel)
        </label>
        <p className="muet" style={{ margin: '0 0 10px', fontSize: 13 }}>
          Lit le texte de la photo pour vous aider à recopier le montant et le fournisseur —
          rien n'est rempli automatiquement. La pièce elle-même se joint après l'enregistrement,
          depuis la liste des dépenses.
        </p>
        <input type="file" accept="image/*" capture="environment"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void scanner(f); }} />
        {lectureEnCours && <p className="muet" style={{ fontSize: 13, marginTop: 8 }}>Lecture en cours…</p>}
        {texteScan && (
          <textarea readOnly value={texteScan} rows={5} style={{
            width: '100%', marginTop: 10, padding: 10, border: '1px solid var(--bord)',
            borderRadius: 12, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical',
          }} />
        )}
      </div>
      <div className="carte">
        <Champ label="Catégorie" value={categorie} onChange={setCategorie}
          options={CATEGORIES_DEPENSE.map((c) => ({ value: c.code, label: c.label }))} />
        <Champ label="Libellé" value={libelle} onChange={setLibelle}
          placeholder={`Ex. ${labelCategorie(categorie)} de ce mois`} />
        <Champ label="Montant (FCFA)" type="text" value={montant}
          onChange={(v) => setMontant(v.replace(/\D/g, ''))} placeholder="25000" />
        <Champ label="Mode de paiement" value={mode} onChange={setMode} options={MODES_PAIEMENT} />
        <Champ label="Date de la dépense (optionnel, si saisie plus tard)" type="date"
          value={dateOperation} onChange={setDateOperation} />
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
