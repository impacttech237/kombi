/**
 * Stock — porté fidèlement du prototype Figma Make (Stock(), lignes 1934-2053).
 * Adaptations : pas de catégories de produits ni de palier « critique » distinct dans le modèle
 * Produit de Kombi (seulement en_alerte/en_rupture) — 3 états (ok/faible/rupture) au lieu de 4.
 * « Valeur stock » utilise le coût moyen pondéré (comme le prototype utilisait `price`, le prix
 * de VENTE) — sinon ce chiffre ne recoupe jamais la ligne « Marchandises » du Bilan (qui valorise
 * au coût, seule base reconnue en comptabilité), ce qui a déjà fait croire à une incohérence.
 * Les écrans Nouveau produit / Approvisionner / Ajuster (absents du prototype) sont reskinnés
 * dans le même langage visuel plutôt que dans l'ancien style clair.
 */
import { useEffect, useState } from 'react';
import { formaterFCFA as fmt } from '@kombi/shared';
import { TAUX_TVA_EFFECTIF } from '@kombi/fiscal';
import {
  listerProduits, creerProduit, listerTiers, creerTiers, ajusterStock,
  type EntrepriseResume, type Produit, type Tiers,
} from '../lib/api.js';
import { enfilerMutation, nouvelUuid } from '../offline/db.js';
import { synchroniser } from '../offline/sync.js';
import { StockHealthChart } from '../components/charts.js';
import { IcoSearch, IcoPlus, IcoAlert, IcoX, IcoChevR } from '../components/icons.js';

type Statut = 'ok' | 'faible' | 'rupture';
function statutProduit(p: Produit): Statut {
  return p.en_rupture === 1 ? 'rupture' : p.en_alerte === 1 ? 'faible' : 'ok';
}

export function Stock({ entreprise }: { entreprise: EntrepriseResume }) {
  const [produits, setProduits] = useState<Produit[] | null>(null);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [appro, setAppro] = useState<Produit | null>(null);
  const [ajust, setAjust] = useState<Produit | null>(null);

  function recharger() { return listerProduits(entreprise.id).then(setProduits).catch(() => setProduits((p) => p ?? [])); }
  useEffect(() => { void recharger(); }, [entreprise.id]);

  const liste = produits ?? [];
  const filtered = liste.filter((p) => p.nom.toLowerCase().includes(search.toLowerCase()));
  const enAlerte = liste.filter((p) => statutProduit(p) !== 'ok');
  const enRupture = enAlerte.filter((p) => statutProduit(p) === 'rupture');
  const enFaible = enAlerte.filter((p) => statutProduit(p) === 'faible');
  const totalValue = liste.reduce((s, p) => s + p.cout_moyen_pondere * p.stock_actuel, 0);

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col overflow-hidden">
      {enRupture.length > 0 && (
        <div className="mx-4 md:mx-8 mt-4 bg-[#f87171]/8 border border-[#f87171]/25 rounded-2xl p-3 flex items-start gap-3">
          <IcoAlert cls="w-4 h-4 text-[#f87171] shrink-0 mt-0.5" />
          <p className="text-[#f87171] text-sm font-medium">
            {enRupture.length} produit{enRupture.length > 1 ? 's' : ''} en rupture : {enRupture.map((p) => p.nom).join(', ')}
          </p>
        </div>
      )}
      {enFaible.length > 0 && (
        <div className={`mx-4 md:mx-8 bg-[#fbbf24]/8 border border-[#fbbf24]/25 rounded-2xl p-3 flex items-start gap-3 ${enRupture.length > 0 ? 'mt-2' : 'mt-4'}`}>
          <IcoAlert cls="w-4 h-4 text-[#fbbf24] shrink-0 mt-0.5" />
          <p className="text-[#fbbf24] text-sm font-medium">
            {enFaible.length} produit{enFaible.length > 1 ? 's' : ''} en stock faible : {enFaible.map((p) => p.nom).join(', ')}
          </p>
        </div>
      )}

      <div className="px-4 md:px-8 pt-4 pb-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6b4a]"><IcoSearch cls="w-4 h-4" /></span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit..."
            className="w-full bg-[#1e3222] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl pl-9 pr-4 py-3 text-sm border border-[#2a4230] focus:border-[#b4e033] focus:outline-none" />
        </div>
      </div>

      {liste.length > 0 && (
        <div className="px-4 md:px-8 pb-2">
          <div className="bg-[#162419] rounded-2xl p-3 flex items-center gap-3">
            <StockHealthChart ok={liste.length - enAlerte.length} faible={enFaible.length} critique={0} rupture={enRupture.length} />
            <div className="flex-1 flex flex-col gap-1.5 pl-1 border-l border-[#1e3222]">
              <div className="flex items-center justify-between">
                <span className="text-[#4a6b4a] text-xs">Références</span>
                <span className="text-[#edf5ea] font-semibold text-sm">{liste.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#4a6b4a] text-xs">Valeur stock</span>
                <span className="text-[#b4e033] font-mono font-semibold text-xs">{fmt(totalValue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#4a6b4a] text-xs">Alertes actives</span>
                <span className={`font-semibold text-sm ${enRupture.length > 0 ? 'text-[#f87171]' : enAlerte.length > 0 ? 'text-[#fbbf24]' : 'text-[#4ade80]'}`}>{enAlerte.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-2 pt-1">
        {produits === null ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
        ) : liste.length === 0 ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Aucun produit — utilisez le bouton + pour en ajouter un.</p>
        ) : (
          filtered.map((p) => {
            const st = statutProduit(p);
            const stockPct = Math.min(100, (p.stock_actuel / Math.max(p.seuil_alerte * 4, p.stock_actuel, 1)) * 100);
            const borderCls = st === 'rupture' ? 'border-[#7f1d1d]/40' : st === 'faible' ? 'border-[#fbbf24]/25' : 'border-transparent';
            const barCls = st === 'rupture' ? 'bg-[#7f1d1d]' : st === 'faible' ? 'bg-[#fbbf24]' : 'bg-[#b4e033]';
            const cntCls = st === 'rupture' ? 'text-[#f87171]' : st === 'faible' ? 'text-[#fbbf24]' : 'text-[#b4e033]';
            return (
              <div key={p.id} className={`bg-[#162419] rounded-2xl p-4 border ${borderCls}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[#edf5ea] font-medium text-sm">{p.nom}</p>
                      {st === 'faible' && <span className="bg-[#fbbf24]/15 text-[#fbbf24] text-xs px-2 py-0.5 rounded-full font-medium">Stock faible</span>}
                      {st === 'rupture' && <span className="bg-[#7f1d1d]/30 text-[#fca5a5] text-xs px-2 py-0.5 rounded-full font-semibold tracking-wide">Rupture</span>}
                    </div>
                    <p className="text-[#4a6b4a] text-xs mt-0.5">{p.unite}{p.sku ? ` · ${p.sku}` : ''}</p>
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <div className="flex-1 h-1.5 bg-[#1e3222] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: `${stockPct}%` }} />
                      </div>
                      <span className={`text-xs font-mono font-semibold ${cntCls}`}>{p.stock_actuel} unités</span>
                    </div>
                    <p className="text-[#4a6b4a] text-xs mt-1">Seuil alerte : {p.seuil_alerte}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[#edf5ea] font-mono font-semibold text-sm">{fmt(p.prix_vente)}</p>
                    <p className="text-[#4a6b4a] text-xs mt-0.5">/ {p.unite}</p>
                    <div className="flex gap-1.5 mt-2">
                      <button onClick={() => setAjust(p)}
                        className="bg-[#1e3222] text-[#6b9165] text-xs px-2.5 py-1.5 rounded-lg font-medium hover:bg-[#2a4230] transition-colors border border-[#2a4230]">
                        Ajuster
                      </button>
                      <button onClick={() => setAppro(p)}
                        className="bg-[#1e3222] text-[#b4e033] text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-[#2a4230] transition-colors border border-[#b4e033]/20">
                        + Entrée
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button onClick={() => setCreateOpen(true)}
        className="fixed bottom-24 md:bottom-6 right-4 w-14 h-14 bg-[#b4e033] rounded-full flex items-center justify-center text-[#0e1c0f] shadow-lg shadow-[#b4e033]/20 z-10 active:scale-95 transition-all">
        <IcoPlus cls="w-6 h-6" />
      </button>

      {createOpen && (
        <NouveauProduitSheet entreprise={entreprise} onClose={() => setCreateOpen(false)}
          onCree={() => { setCreateOpen(false); void recharger(); }} />
      )}
      {appro && (
        <ApprovisionnerSheet entreprise={entreprise} produit={appro} onClose={() => setAppro(null)}
          onFait={() => { setAppro(null); void recharger(); }} />
      )}
      {ajust && (
        <AjusterSheet entreprise={entreprise} produit={ajust} onClose={() => setAjust(null)}
          onFait={() => { setAjust(null); void recharger(); }} />
      )}
    </div>
  );
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e3222] bg-[#0a1408] shrink-0">
      <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
        <IcoChevR cls="w-4 h-4 rotate-180" />
      </button>
      <h2 className="text-[#edf5ea] font-semibold text-sm flex-1">{title}</h2>
      <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
        <IcoX cls="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[#6b9165] text-xs font-medium block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
const inputCls = 'w-full bg-[#1e3222] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl px-4 py-3 text-sm border border-[#2a4230] focus:border-[#b4e033] focus:outline-none';

function NouveauProduitSheet({ entreprise, onClose, onCree }: { entreprise: EntrepriseResume; onClose: () => void; onCree: () => void }) {
  const [nom, setNom] = useState('');
  const [prix, setPrix] = useState('');
  const [seuil, setSeuil] = useState('5');
  const [charge, setCharge] = useState(false);

  async function creer() {
    setCharge(true);
    try {
      await creerProduit(entreprise.id, { nom, prixVente: Number(prix), seuilAlerte: Number(seuil) });
      onCree();
    } finally { setCharge(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0e1c0f]">
      <SheetHeader title="Nouveau produit" onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-4 pt-5 space-y-4">
        <Champ label="Nom du produit"><input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Riz 5kg" className={inputCls} /></Champ>
        <Champ label="Prix de vente (FCFA)">
          <input inputMode="numeric" value={prix} onChange={(e) => setPrix(e.target.value.replace(/\D/g, ''))} placeholder="4000" className={inputCls} />
        </Champ>
        <Champ label="Seuil d'alerte de rupture">
          <input inputMode="numeric" value={seuil} onChange={(e) => setSeuil(e.target.value.replace(/\D/g, ''))} className={inputCls} />
        </Champ>
      </div>
      <div className="border-t border-[#1e3222] px-4 py-3 bg-[#0a1408] shrink-0">
        <button onClick={creer} disabled={charge || !nom || !prix}
          className="w-full bg-[#b4e033] text-[#0e1c0f] rounded-2xl py-4 font-semibold text-base active:scale-95 transition-all disabled:opacity-40">
          {charge ? '…' : 'Créer le produit'}
        </button>
      </div>
    </div>
  );
}

function ApprovisionnerSheet({ entreprise, produit, onClose, onFait }: {
  entreprise: EntrepriseResume; produit: Produit; onClose: () => void; onFait: () => void;
}) {
  const [qte, setQte] = useState('');
  const [cout, setCout] = useState(String(produit.cout_moyen_pondere || ''));
  const [mode, setMode] = useState('especes');
  const [aCredit, setACredit] = useState(false);
  const [avecTva, setAvecTva] = useState(false);
  const [fournisseurs, setFournisseurs] = useState<Tiers[]>([]);
  const [fournisseurId, setFournisseurId] = useState('');
  const [nouveauFournisseur, setNouveauFournisseur] = useState('');
  const [dateEcheance, setDateEcheance] = useState('');
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const tvaEligible = entreprise.regime_fiscal !== 'igs' && entreprise.assujetti_tva === 1;

  useEffect(() => {
    listerTiers(entreprise.id).then((ts) => setFournisseurs(ts.filter((t) => t.type === 'fournisseur' || t.type === 'les_deux'))).catch(() => {});
  }, [entreprise.id]);

  async function valider() {
    setErreur(''); setCharge(true);
    try {
      let tiersId = fournisseurId;
      if (aCredit && !tiersId && nouveauFournisseur.trim()) {
        tiersId = (await creerTiers(entreprise.id, { nom: nouveauFournisseur.trim(), type: 'fournisseur' })).tiersId;
      }
      if (aCredit && !tiersId) { setErreur('Choisissez ou créez un fournisseur'); setCharge(false); return; }
      const clientUuid = nouvelUuid();
      await enfilerMutation({
        clientUuid, entrepriseId: entreprise.id, type: 'stock_entree',
        payload: {
          produitId: produit.id, quantite: Number(qte), coutUnitaire: Number(cout),
          modePaiement: aCredit ? null : mode, aCredit, tiersId: aCredit ? tiersId : null,
          tauxTva: avecTva ? TAUX_TVA_EFFECTIF : 0, dateOperation: null,
          dateEcheance: aCredit ? (dateEcheance || null) : null,
        },
      });
      await synchroniser();
      onFait();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0e1c0f]">
      <SheetHeader title={`Approvisionner · ${produit.nom}`} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-4 pt-5 space-y-4">
        <p className="text-[#4a6b4a] text-xs">Stock actuel : {produit.stock_actuel}</p>
        <Champ label="Quantité reçue"><input inputMode="numeric" value={qte} onChange={(e) => setQte(e.target.value.replace(/\D/g, ''))} placeholder="10" className={inputCls} /></Champ>
        <Champ label="Coût d'achat unitaire (FCFA)"><input inputMode="numeric" value={cout} onChange={(e) => setCout(e.target.value.replace(/\D/g, ''))} placeholder="3000" className={inputCls} /></Champ>

        <label className="flex items-center gap-2.5 text-sm text-[#edf5ea]">
          <input type="checkbox" checked={aCredit} onChange={(e) => setACredit(e.target.checked)} className="accent-[#b4e033] w-4 h-4" />
          Achat à crédit (fournisseur payé plus tard)
        </label>
        {tvaEligible && (
          <label className="flex items-center gap-2.5 text-sm text-[#edf5ea]">
            <input type="checkbox" checked={avecTva} onChange={(e) => setAvecTva(e.target.checked)} className="accent-[#b4e033] w-4 h-4" />
            TVA récupérable sur cet achat (19,25 %)
          </label>
        )}

        {aCredit ? (
          <>
            {fournisseurs.length > 0 && (
              <Champ label="Fournisseur">
                <select value={fournisseurId} onChange={(e) => { setFournisseurId(e.target.value); setNouveauFournisseur(''); }} className={inputCls}>
                  <option value="">Nouveau fournisseur…</option>
                  {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </Champ>
            )}
            {!fournisseurId && (
              <Champ label="Nom du fournisseur"><input value={nouveauFournisseur} onChange={(e) => setNouveauFournisseur(e.target.value)} placeholder="Ex. Grossiste Awa" className={inputCls} /></Champ>
            )}
            <Champ label="Échéance de paiement (optionnel)">
              <input type="date" value={dateEcheance} onChange={(e) => setDateEcheance(e.target.value)} className={inputCls} />
            </Champ>
          </>
        ) : (
          <Champ label="Payé par">
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls}>
              <option value="especes">Espèces</option>
              <option value="mtn_momo">MTN MoMo</option>
              <option value="orange_money">Orange Money</option>
              <option value="virement">Virement</option>
            </select>
          </Champ>
        )}
        {erreur && <p className="text-[#f87171] text-xs">{erreur}</p>}
      </div>
      <div className="border-t border-[#1e3222] px-4 py-3 bg-[#0a1408] shrink-0">
        <button onClick={valider} disabled={charge || !qte || !cout}
          className="w-full bg-[#b4e033] text-[#0e1c0f] rounded-2xl py-4 font-semibold text-base active:scale-95 transition-all disabled:opacity-40">
          {charge ? '…' : "Enregistrer l'entrée"}
        </button>
      </div>
    </div>
  );
}

const MOTIFS_AJUSTEMENT = ['Casse', 'Vol', 'Périmé', "Écart d'inventaire", 'Autre'];

function AjusterSheet({ entreprise, produit, onClose, onFait }: {
  entreprise: EntrepriseResume; produit: Produit; onClose: () => void; onFait: () => void;
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
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0e1c0f]">
      <SheetHeader title={`Ajuster le stock · ${produit.nom}`} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-4 pt-5 space-y-4">
        <p className="text-[#4a6b4a] text-xs">Stock actuel : {produit.stock_actuel}</p>
        <div className="flex gap-2 bg-[#162419] rounded-2xl p-1.5 border border-[#2a4230]">
          <button onClick={() => setSens('perte')} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${sens === 'perte' ? 'bg-[#b4e033] text-[#0e1c0f]' : 'text-[#4a6b4a]'}`}>
            Perte (casse, vol…)
          </button>
          <button onClick={() => setSens('surplus')} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${sens === 'surplus' ? 'bg-[#b4e033] text-[#0e1c0f]' : 'text-[#4a6b4a]'}`}>
            Surplus trouvé
          </button>
        </div>
        <Champ label="Quantité"><input inputMode="numeric" value={quantite} onChange={(e) => setQuantite(e.target.value.replace(/\D/g, ''))} placeholder="2" className={inputCls} /></Champ>
        <Champ label="Motif">
          <select value={motif} onChange={(e) => setMotif(e.target.value)} className={inputCls}>
            {MOTIFS_AJUSTEMENT.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Champ>
        {erreur && <p className="text-[#f87171] text-xs">{erreur}</p>}
      </div>
      <div className="border-t border-[#1e3222] px-4 py-3 bg-[#0a1408] shrink-0">
        <button onClick={valider} disabled={charge || !quantite}
          className="w-full bg-[#b4e033] text-[#0e1c0f] rounded-2xl py-4 font-semibold text-base active:scale-95 transition-all disabled:opacity-40">
          {charge ? '…' : "Valider l'ajustement"}
        </button>
      </div>
    </div>
  );
}
