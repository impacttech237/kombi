/**
 * Caisse — porté fidèlement du prototype Figma Make (Sales() + ReceiptScreen(), lignes 668-1175).
 * Adaptations : pas de catégories de produits (le modèle Produit de Kombi n'en a pas), ajout d'une
 * ligne « article libre » pour les entreprises de service (sans catalogue produits).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formaterFCFA as fmt } from '@kombi/shared';
import { TAUX_TVA_EFFECTIF } from '@kombi/fiscal';
import {
  listerProduits, listerTiers, creerTiers, type EntrepriseResume, type LigneCaisse, type Produit, type Tiers,
} from '../lib/api.js';
import { enfilerMutation, nouvelUuid } from '../offline/db.js';
import { synchroniser } from '../offline/sync.js';
import { IcoSearch, IcoPlus, IcoMinus, IcoX, IcoOk, IcoFile, IcoTrend, Avatar } from '../components/icons.js';

interface LignePanier extends LigneCaisse { remisePct?: number; }
type ModePaiement = 'especes' | 'orange_money' | 'mtn_momo' | 'virement';

const MODES: { code: ModePaiement; label: string; icone: string }[] = [
  { code: 'especes', label: 'Espèces', icone: '💵' },
  { code: 'orange_money', label: 'Orange Money', icone: '🟠' },
  { code: 'mtn_momo', label: 'MTN MoMo', icone: '🟡' },
  { code: 'virement', label: 'Virement', icone: '🏦' },
];

interface Recu {
  totalHt: number; totalTva: number; total: number; remise: number; tvaApplicable: boolean;
  lignes: LignePanier[]; recu: number; rendu: number; aCredit: boolean; client: string | null;
  mode: ModePaiement | null; datetime: string;
}

/** Prix unitaire effectif après remise de ligne puis remise globale (arrondi FCFA, jamais négatif). */
function prixApresRemises(l: LignePanier, remiseGlobalePct: number): number {
  const facteurLigne = 1 - (l.remisePct ?? 0) / 100;
  const facteurGlobal = 1 - remiseGlobalePct / 100;
  return Math.max(0, Math.round(l.prixUnitaire * facteurLigne * facteurGlobal));
}

function ReceiptScreen({ entreprise, recu, onNew }: { entreprise: EntrepriseResume; recu: Recu; onNew: () => void }) {
  const hasDisc = recu.remise > 0 || recu.lignes.some((l) => (l.remisePct ?? 0) > 0);
  const texteRecu = [
    entreprise.raison_sociale, entreprise.niu ? `NIU : ${entreprise.niu}` : null, '',
    ...recu.lignes.map((l) => `${l.quantite} × ${l.designation} — ${fmt(l.quantite * l.prixUnitaire)}`),
    '', recu.tvaApplicable ? `Total HT : ${fmt(recu.totalHt)}` : null,
    recu.tvaApplicable ? `TVA 19,25% : ${fmt(recu.totalTva)}` : null,
    `Total : ${fmt(recu.total)}`,
  ].filter(Boolean).join('\n');

  return (
    <div className="flex-1 overflow-y-auto pb-28 md:pb-8">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-full bg-[#b4e033] flex items-center justify-center text-[#0e1c0f] mx-auto mb-3 shadow-lg shadow-[#b4e033]/30">
          <IcoOk cls="w-8 h-8" />
        </div>
        <p className="text-[#edf5ea] text-xl font-semibold">
          {recu.aCredit ? 'Vente à crédit enregistrée' : 'Vente encaissée !'}
        </p>
        <p className="text-[#4a6b4a] text-xs mt-1">{recu.datetime}</p>
      </div>

      <div id="recu-impression" className="bg-[#162419] rounded-2xl overflow-hidden mb-3">
        <div className="px-4 py-3 border-b border-[#1e3222]">
          <h3 className="text-[#edf5ea] font-semibold text-sm">Détail de la vente</h3>
          {recu.client && <p className="text-[#4a6b4a] text-xs mt-0.5">Client : {recu.client}</p>}
        </div>
        <div className="divide-y divide-[#1e3222]">
          {recu.lignes.map((l, i) => (
            <div key={i} className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[#edf5ea] text-sm font-medium truncate">{l.designation}</p>
                <p className="text-[#4a6b4a] text-xs mt-0.5">
                  {fmt(l.prixUnitaire)} × {l.quantite}
                  {(l.remisePct ?? 0) > 0 && <span className="text-[#f87171]"> · remise {l.remisePct}%</span>}
                </p>
              </div>
              <p className="font-mono text-[#b4e033] text-sm font-semibold shrink-0">{fmt(l.quantite * l.prixUnitaire)}</p>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 bg-[#1e3222] space-y-1.5">
          {hasDisc && recu.remise > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[#f87171]">Remise</span>
              <span className="font-mono text-[#f87171]">−{fmt(recu.remise)}</span>
            </div>
          )}
          {recu.tvaApplicable && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-[#6b9165]">Total HT</span>
                <span className="font-mono text-[#edf5ea]">{fmt(recu.totalHt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#6b9165]">TVA 19,25%</span>
                <span className="font-mono text-[#edf5ea]">{fmt(recu.totalTva)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between items-baseline pt-1 border-t border-[#2a4230]">
            <span className="text-[#edf5ea] font-semibold">Total</span>
            <span className="font-mono font-bold text-xl text-[#b4e033]">{fmt(recu.total)}</span>
          </div>
        </div>
      </div>

      <div className="bg-[#162419] rounded-2xl p-4 mb-5 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[#6b9165]">Mode de règlement</span>
          <span className="text-[#edf5ea] font-medium">
            {recu.aCredit ? `À crédit · ${recu.client}` : MODES.find((m) => m.code === recu.mode)?.label}
          </span>
        </div>
        {!recu.aCredit && (
          <div className="flex justify-between text-sm">
            <span className="text-[#6b9165]">Montant reçu</span>
            <span className="font-mono text-[#edf5ea]">{fmt(recu.recu)}</span>
          </div>
        )}
        {!recu.aCredit && recu.rendu > 0 && (
          <div className="flex justify-between items-baseline pt-1.5 border-t border-[#1e3222]">
            <span className="text-[#4ade80] font-semibold text-sm">Rendu-monnaie</span>
            <span className="font-mono font-bold text-[#4ade80] text-lg">{fmt(recu.rendu)}</span>
          </div>
        )}
      </div>

      <div className="space-y-2 px-4 md:px-0">
        <button onClick={() => window.print()}
          className="w-full bg-[#1e3222] border border-[#2a4230] text-[#edf5ea] rounded-2xl py-3.5 flex items-center justify-center gap-2.5 text-sm font-medium active:scale-95 transition-all">
          <IcoFile cls="w-4 h-4 text-[#6b9165]" />
          Imprimer le reçu
        </button>
        <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(texteRecu)}`, '_blank')}
          className="w-full border text-sm font-semibold rounded-2xl py-3.5 flex items-center justify-center gap-2.5 active:scale-95 transition-all"
          style={{ background: 'rgba(74,222,128,0.08)', borderColor: 'rgba(74,222,128,0.25)', color: '#4ade80' }}>
          <IcoTrend cls="w-4 h-4" />
          Partager (WhatsApp)
        </button>
        <button onClick={onNew} className="w-full bg-[#b4e033] text-[#0e1c0f] rounded-2xl py-4 font-semibold text-base active:scale-95 transition-all">
          Nouvelle vente
        </button>
      </div>
    </div>
  );
}

export function Caisse({ entreprise, onVendu, onHistorique }: {
  entreprise: EntrepriseResume; onVendu?: () => void; onHistorique?: () => void;
}) {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [tiers, setTiers] = useState<Tiers[]>([]);

  function rechargerTiers() {
    return listerTiers(entreprise.id).then(setTiers).catch(() => {});
  }
  useEffect(() => {
    if (entreprise.secteur !== 'service') listerProduits(entreprise.id).then(setProduits).catch(() => {});
    else setProduits([]);
    void rechargerTiers();
  }, [entreprise.id, entreprise.secteur]);

  const [search, setSearch] = useState('');
  const [panier, setPanier] = useState<LignePanier[]>([]);
  const [libreDesign, setLibreDesign] = useState('');
  const [librePrix, setLibrePrix] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [saleMode, setSaleMode] = useState<'comptant' | 'credit'>('comptant');
  const [remiseGlobale, setRemiseGlobale] = useState('');
  const [montantRecu, setMontantRecu] = useState('');
  const [tiersId, setTiersId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientNom, setNewClientNom] = useState('');
  const [creationClient, setCreationClient] = useState(false);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const [recu, setRecu] = useState<Recu | null>(null);

  const filtres = useMemo(
    () => produits.filter((p) => p.nom.toLowerCase().includes(search.toLowerCase())),
    [produits, search],
  );

  const lineTotal = useCallback((l: LignePanier, remiseGlobalePct: number) => l.quantite * prixApresRemises(l, remiseGlobalePct), []);

  // TVA jamais applicable au régime IGS (Art. 142) ; sinon seulement si l'entreprise y est assujettie.
  const tvaApplicable = entreprise.regime_fiscal !== 'igs' && entreprise.assujetti_tva === 1;
  const tauxTva = tvaApplicable ? TAUX_TVA_EFFECTIF : 0;
  const gd = Math.min(100, Math.max(0, Number(remiseGlobale) || 0));

  const sousTotal = panier.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);
  const totalHt = panier.reduce((s, l) => s + lineTotal(l, gd), 0);
  const totalTva = Math.round(totalHt * tauxTva);
  const cartTotal = totalHt + totalTva;
  const cartCount = panier.reduce((s, l) => s + l.quantite, 0);
  const remiseMontant = sousTotal - totalHt;

  const recuAmount = montantRecu ? Number(montantRecu) : 0;
  const rendu = Math.max(0, recuAmount - cartTotal);
  const aCredit = saleMode === 'credit';
  const canConfirm = aCredit ? !!tiersId : recuAmount >= cartTotal;

  function ajouterProduit(p: Produit) {
    setPanier((prev) => {
      const idx = prev.findIndex((l) => l.produitId === p.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx]!, quantite: n[idx]!.quantite + 1 }; return n; }
      return [...prev, { designation: p.nom, quantite: 1, prixUnitaire: p.prix_vente, produitId: p.id }];
    });
  }
  function ajouterArticleLibre() {
    const p = Math.floor(Number(librePrix));
    if (!p || p <= 0) return;
    setPanier((prev) => [...prev, { designation: libreDesign.trim() || 'Article', quantite: 1, prixUnitaire: p }]);
    setLibreDesign(''); setLibrePrix('');
  }
  function retirerLigne(i: number) { setPanier((prev) => prev.filter((_, k) => k !== i)); }
  function changerQuantite(i: number, delta: number) {
    setPanier((prev) => {
      const q = prev[i]!.quantite + delta;
      if (q <= 0) return prev.filter((_, k) => k !== i);
      const n = [...prev]; n[i] = { ...n[i]!, quantite: q }; return n;
    });
  }
  function changerRemiseLigne(i: number, val: string) {
    const v = Math.min(100, Math.max(0, Number(val.replace(/\D/g, '')) || 0));
    setPanier((prev) => { const n = [...prev]; n[i] = { ...n[i]!, remisePct: v || undefined }; return n; });
  }

  function resetAll() {
    setPanier([]); setShowCart(false); setShowPay(false); setRecu(null);
    setRemiseGlobale(''); setMontantRecu(''); setSaleMode('comptant');
    setTiersId(''); setClientSearch(''); setShowNewClient(false); setNewClientNom(''); setErreur('');
  }

  async function creerClientRapide() {
    const nom = newClientNom.trim();
    if (!nom) return;
    setCreationClient(true); setErreur('');
    try {
      const { tiersId: id } = await creerTiers(entreprise.id, { nom });
      await rechargerTiers();
      setTiersId(id); setShowNewClient(false); setNewClientNom(''); setClientSearch('');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCreationClient(false); }
  }

  async function confirmerVente() {
    if (!panier.length) return;
    if (aCredit && !tiersId) { setErreur('Choisissez un client pour une vente à crédit'); return; }
    if (!aCredit && recuAmount < cartTotal) { setErreur('Le montant reçu est inférieur au total'); return; }
    setCharge(true); setErreur('');
    const lignesFinales: LignePanier[] = panier.map((l) => ({ ...l, prixUnitaire: prixApresRemises(l, gd), tauxTva }));
    try {
      const clientUuid = nouvelUuid();
      await enfilerMutation({
        clientUuid, entrepriseId: entreprise.id, type: 'vente',
        payload: {
          lignes: lignesFinales.map(({ remisePct: _remisePct, ...l }) => l),
          modePaiement: aCredit ? null : mode, aCredit, tiersId: tiersId || null,
        },
      });
      await synchroniser();
      const now = new Date();
      const datetime = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
        + ' à ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      setRecu({
        totalHt, totalTva, total: cartTotal, remise: remiseMontant, tvaApplicable, lignes: lignesFinales,
        recu: aCredit ? 0 : recuAmount, rendu: aCredit ? 0 : rendu, aCredit,
        client: tiersId ? (tiers.find((t) => t.id === tiersId)?.nom ?? null) : null,
        mode: aCredit ? null : mode, datetime,
      });
      setShowPay(false);
      onVendu?.();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  if (recu) return <ReceiptScreen entreprise={entreprise} recu={recu} onNew={resetAll} />;

  const filteredClients = tiers.filter((t) => clientSearch.length > 0 && t.nom.toLowerCase().includes(clientSearch.toLowerCase()));

  const CartLine = ({ item, i }: { item: LignePanier; i: number }) => {
    const raw = item.prixUnitaire * item.quantite;
    const net = lineTotal(item, gd);
    return (
      <div className="flex items-start gap-2 px-4 py-3 border-b border-[#1e3222]">
        <div className="flex-1 min-w-0">
          <p className="text-[#edf5ea] text-sm font-medium truncate">{item.designation}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[#4a6b4a] text-xs">{fmt(item.prixUnitaire)} × {item.quantite}</span>
            <span className="text-[#2a4230] text-[10px]">·</span>
            <span className="text-[#4a6b4a] text-[10px]">Remise</span>
            <input type="text" inputMode="numeric" value={item.remisePct ?? ''} placeholder="0"
              onChange={(e) => changerRemiseLigne(i, e.target.value)}
              className="w-9 bg-[#0e1c0f] text-[#edf5ea] text-xs text-center rounded-md py-0.5 px-1 border border-[#2a4230] focus:outline-none focus:border-[#b4e033]/60" />
            <span className="text-[#4a6b4a] text-[10px]">%</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1">
            <button onClick={() => changerQuantite(i, -1)} className="w-7 h-7 rounded-full bg-[#1e3222] text-[#edf5ea] flex items-center justify-center hover:bg-[#2a4230]"><IcoMinus cls="w-3 h-3" /></button>
            <span className="w-5 text-center text-[#edf5ea] text-sm font-medium">{item.quantite}</span>
            <button onClick={() => changerQuantite(i, 1)} className="w-7 h-7 rounded-full bg-[#1e3222] text-[#edf5ea] flex items-center justify-center hover:bg-[#2a4230]"><IcoPlus cls="w-3 h-3" /></button>
          </div>
          {(item.remisePct ?? 0) > 0 && <span className="font-mono text-[10px] text-[#4a6b4a] line-through">{fmt(raw)}</span>}
          <span className="font-mono text-[#b4e033] text-sm font-semibold">{fmt(net)}</span>
          <button onClick={() => retirerLigne(i)} className="text-[#f87171] text-[10px]">Retirer</button>
        </div>
      </div>
    );
  };

  const CartFooter = ({ onCheckout }: { onCheckout: () => void }) => {
    const hasDiscs = gd > 0 || panier.some((l) => (l.remisePct ?? 0) > 0);
    return (
      <div className="p-4 border-t border-[#1e3222] space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[#6b9165] text-sm">Remise globale</span>
          <div className="flex items-center gap-1.5">
            <input type="text" inputMode="numeric" value={remiseGlobale} placeholder="0"
              onChange={(e) => setRemiseGlobale(e.target.value.replace(/\D/g, ''))}
              className="w-12 bg-[#1e3222] text-[#edf5ea] text-sm text-center rounded-lg py-1.5 border border-[#2a4230] focus:outline-none focus:border-[#b4e033] transition-colors" />
            <span className="text-[#4a6b4a] text-sm">%</span>
          </div>
        </div>
        {hasDiscs && (
          <div className="flex justify-between text-sm">
            <span className="text-[#4a6b4a]">Sous-total</span>
            <span className="font-mono text-[#6b9165]">{fmt(sousTotal)}</span>
          </div>
        )}
        {tvaApplicable && (
          <div className="flex justify-between text-sm">
            <span className="text-[#4a6b4a]">HT {fmt(totalHt)} + TVA</span>
            <span className="font-mono text-[#6b9165]">{fmt(totalTva)}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline">
          <span className="text-[#6b9165] font-medium">Total</span>
          <span className="text-[#edf5ea] font-mono font-bold text-xl">{fmt(cartTotal)}</span>
        </div>
        <button onClick={onCheckout} className="w-full bg-[#b4e033] text-[#0e1c0f] rounded-2xl py-4 font-semibold text-base active:scale-95 transition-all">
          Encaisser {fmt(cartTotal)}
        </button>
      </div>
    );
  };

  const EmptyCart = () => (
    <div className="flex flex-col items-center gap-4 py-10">
      <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden="true">
        <circle cx="44" cy="44" r="42" fill="#1e3222" opacity="0.7" />
        <path d="M24 32h40l-5 24H29z" stroke="#b4e033" strokeWidth="2" strokeLinejoin="round" fill="#b4e033" fillOpacity="0.08" />
        <path d="M32 32c0-6.6 5.4-12 12-12s12 5.4 12 12" stroke="#b4e033" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="33" cy="60" r="3" fill="#b4e033" opacity="0.6" />
        <circle cx="55" cy="60" r="3" fill="#b4e033" opacity="0.6" />
      </svg>
      <div className="text-center">
        <p className="text-[#edf5ea] font-semibold text-sm">Panier vide</p>
        <p className="text-[#4a6b4a] text-xs mt-1">Sélectionnez un produit pour commencer</p>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col md:flex-row -mx-4 -mt-4 md:-mx-8 md:-mt-6 md:min-h-[calc(100vh-64px)]">
      {/* Panneau produits */}
      <div className="flex-1 flex flex-col overflow-hidden px-4 md:px-8 pt-4 md:pt-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h1 className="text-[#edf5ea] text-xl font-bold">Caisse</h1>
          {onHistorique && (
            <button onClick={onHistorique} className="text-[#6b9165] text-sm font-medium">Historique</button>
          )}
        </div>

        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6b4a]"><IcoSearch cls="w-4 h-4" /></span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit..."
            className="w-full bg-[#1e3222] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl pl-9 pr-4 py-3 text-sm border border-[#2a4230] focus:border-[#b4e033] focus:outline-none transition-colors" />
        </div>

        {/* Article libre : services / articles hors catalogue */}
        <div className="flex gap-2 mb-4">
          <input placeholder="Article libre (optionnel)" value={libreDesign} onChange={(e) => setLibreDesign(e.target.value)}
            className="flex-1 bg-[#1e3222] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl px-3 py-2.5 text-sm border border-[#2a4230] focus:border-[#b4e033] focus:outline-none" />
          <input placeholder="Montant" inputMode="numeric" value={librePrix}
            onChange={(e) => setLibrePrix(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && ajouterArticleLibre()}
            className="w-28 bg-[#1e3222] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl px-3 py-2.5 text-sm border border-[#2a4230] focus:border-[#b4e033] focus:outline-none" />
          <button onClick={ajouterArticleLibre} className="w-11 h-11 rounded-xl bg-[#1e3222] border border-[#2a4230] text-[#b4e033] flex items-center justify-center shrink-0">
            <IcoPlus cls="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {produits.length === 0 ? (
            <p className="text-[#4a6b4a] text-sm text-center py-8">
              {entreprise.secteur === 'service' ? 'Aucun catalogue produit — utilisez « Article libre » ci-dessus.' : 'Aucun produit.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {filtres.map((p) => {
                const inCart = panier.find((l) => l.produitId === p.id);
                const isLow = p.en_alerte === 1;
                return (
                  <button key={p.id} onClick={() => ajouterProduit(p)}
                    className="bg-[#162419] rounded-2xl p-3.5 text-left active:scale-95 transition-all hover:bg-[#1e3222] border border-transparent hover:border-[#b4e033]/20 relative">
                    {inCart && <span className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-[#b4e033] text-[#0e1c0f] text-xs font-bold flex items-center justify-center">{inCart.quantite}</span>}
                    {isLow && <span className="absolute top-2.5 left-2.5 w-2 h-2 rounded-full bg-[#fbbf24]" />}
                    <p className="text-[#edf5ea] font-medium text-sm leading-tight mt-1 pr-8">{p.nom}</p>
                    <p className="text-[#4a6b4a] text-xs mt-1">{p.unite}</p>
                    <p className="text-[#b4e033] font-mono font-semibold text-sm mt-2">{fmt(p.prix_vente)}</p>
                    <p className="text-[#4a6b4a] text-xs mt-0.5">Stock : {p.stock_actuel}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {cartCount > 0 && (
          <div className="md:hidden pb-24">
            <button onClick={() => setShowCart(true)}
              className="w-full bg-[#b4e033] text-[#0e1c0f] rounded-2xl py-4 font-semibold flex items-center justify-between px-5 active:scale-95 transition-all">
              <span className="bg-[#0e1c0f]/20 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">{cartCount}</span>
              <span>Voir le panier</span>
              <span className="font-mono font-semibold">{fmt(cartTotal)}</span>
            </button>
          </div>
        )}
      </div>

      {/* Panneau panier desktop */}
      <div className="hidden md:flex w-80 flex-col border-l border-[#1e3222] bg-[#0e1c0f] shrink-0">
        <div className="px-4 py-3.5 border-b border-[#1e3222] flex items-center justify-between">
          <h3 className="text-[#edf5ea] font-semibold">Panier</h3>
          {panier.length > 0 && <button onClick={() => setPanier([])} className="text-[#f87171] text-xs">Vider</button>}
        </div>
        {panier.length === 0 ? (
          <div className="flex-1 flex items-center justify-center"><EmptyCart /></div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              {panier.map((item, i) => <CartLine key={i} item={item} i={i} />)}
            </div>
            <CartFooter onCheckout={() => setShowPay(true)} />
          </>
        )}
      </div>

      {/* Feuille panier mobile */}
      {showCart && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCart(false)} />
          <div className="relative bg-[#162419] rounded-t-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[#1e3222] shrink-0">
              <h3 className="text-[#edf5ea] font-semibold">Panier ({cartCount})</h3>
              <button onClick={() => setShowCart(false)} className="text-[#6b9165]"><IcoX /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {panier.map((item, i) => <CartLine key={i} item={item} i={i} />)}
            </div>
            <CartFooter onCheckout={() => { setShowCart(false); setShowPay(true); }} />
          </div>
        </div>
      )}

      {/* Modale d'encaissement */}
      {showPay && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowPay(false)} />
          <div className="relative bg-[#162419] rounded-t-3xl md:rounded-3xl w-full md:max-w-sm max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#1e3222] shrink-0">
              <h3 className="text-[#edf5ea] font-semibold text-lg">Encaissement</h3>
              <button onClick={() => setShowPay(false)} className="text-[#6b9165]"><IcoX /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              <div className="bg-[#1e3222] rounded-2xl p-4 text-center">
                <p className="text-[#6b9165] text-sm mb-1">Montant à encaisser</p>
                <p className="text-[#b4e033] font-mono text-3xl font-bold">{fmt(cartTotal)}</p>
              </div>

              <div className="flex bg-[#1e3222] rounded-2xl p-1 border border-[#2a4230] gap-1">
                {(['comptant', 'credit'] as const).map((m) => (
                  <button key={m} onClick={() => setSaleMode(m)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${saleMode === m
                      ? m === 'comptant' ? 'bg-[#b4e033] text-[#0e1c0f]' : 'bg-[#fbbf24] text-[#0e1c0f]'
                      : 'text-[#6b9165] hover:text-[#edf5ea]'}`}>
                    {m === 'comptant' ? 'Comptant' : 'À crédit'}
                  </button>
                ))}
              </div>

              {saleMode === 'comptant' ? (
                <>
                  <div>
                    <p className="text-[#4a6b4a] text-xs font-medium uppercase tracking-wide mb-3">Mode de paiement</p>
                    <div className="grid grid-cols-2 gap-2">
                      {MODES.map(({ code, label, icone }) => (
                        <button key={code} onClick={() => setMode(code)}
                          className={`flex items-center gap-2.5 p-3.5 rounded-xl border text-left transition-all ${mode === code ? 'border-[#b4e033] bg-[#b4e033]/10' : 'border-[#2a4230] bg-[#1e3222]'}`}>
                          <span className="text-lg">{icone}</span>
                          <span className={`text-sm font-medium ${mode === code ? 'text-[#b4e033]' : 'text-[#6b9165]'}`}>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-[#4a6b4a] text-xs font-medium uppercase tracking-wide mb-2">Montant reçu</p>
                      <input type="text" inputMode="numeric" value={montantRecu}
                        onChange={(e) => setMontantRecu(e.target.value.replace(/\D/g, ''))} placeholder={String(cartTotal)}
                        className="w-full bg-[#1e3222] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-2xl px-4 py-3.5 font-mono text-xl border border-[#2a4230] focus:border-[#b4e033] focus:outline-none transition-colors" />
                    </div>
                    {montantRecu !== '' && (
                      <div className={`rounded-2xl p-4 text-center ${recuAmount >= cartTotal ? 'bg-[#4ade80]/5 border border-[#4ade80]/20' : 'bg-[#f87171]/5 border border-[#f87171]/20'}`}>
                        <p className="text-[#4a6b4a] text-xs mb-1">Rendu-monnaie</p>
                        <p className={`font-mono font-bold text-3xl ${recuAmount >= cartTotal ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                          {recuAmount >= cartTotal ? fmt(rendu) : `−${fmt(cartTotal - recuAmount)}`}
                        </p>
                        {recuAmount < cartTotal && <p className="text-[#f87171] text-xs mt-1">Montant insuffisant</p>}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div>
                  <p className="text-[#4a6b4a] text-xs font-medium uppercase tracking-wide mb-3">Client (obligatoire)</p>
                  {tiersId ? (
                    <div className="flex items-center gap-3 bg-[#1e3222] rounded-2xl p-3.5 border border-[#fbbf24]/30">
                      <Avatar name={tiers.find((t) => t.id === tiersId)?.nom ?? '?'} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[#edf5ea] text-sm font-medium">{tiers.find((t) => t.id === tiersId)?.nom}</p>
                      </div>
                      <button onClick={() => setTiersId('')} className="text-[#6b9165] p-1"><IcoX cls="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <>
                      <div className="relative mb-2">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6b4a]"><IcoSearch cls="w-4 h-4" /></span>
                        <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Rechercher un client..."
                          className="w-full bg-[#1e3222] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl pl-9 pr-4 py-3 text-sm border border-[#2a4230] focus:border-[#fbbf24] focus:outline-none transition-colors" />
                      </div>
                      {filteredClients.length > 0 && (
                        <div className="space-y-1 max-h-36 overflow-y-auto mb-3">
                          {filteredClients.map((t) => (
                            <button key={t.id} onClick={() => { setTiersId(t.id); setClientSearch(''); }}
                              className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#1e3222] hover:bg-[#2a4230] transition-colors text-left">
                              <Avatar name={t.nom} size="sm" />
                              <div className="flex-1 min-w-0"><p className="text-[#edf5ea] text-sm font-medium truncate">{t.nom}</p></div>
                            </button>
                          ))}
                        </div>
                      )}
                      {!showNewClient ? (
                        <button onClick={() => setShowNewClient(true)} className="flex items-center gap-2 py-1.5 text-[#b4e033] text-sm font-medium">
                          <IcoPlus cls="w-4 h-4" />
                          Créer un nouveau client
                        </button>
                      ) : (
                        <div className="mt-2 bg-[#1e3222] rounded-2xl p-4 border border-[#b4e033]/20 space-y-2">
                          <p className="text-[#b4e033] text-xs font-semibold uppercase tracking-wide">Nouveau client</p>
                          <input autoFocus value={newClientNom} onChange={(e) => setNewClientNom(e.target.value)} placeholder="Nom complet *"
                            onKeyDown={(e) => e.key === 'Enter' && creerClientRapide()}
                            className="w-full bg-[#162419] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl px-3 py-2.5 text-sm border border-[#2a4230] focus:border-[#b4e033] focus:outline-none" />
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => { setShowNewClient(false); setNewClientNom(''); }}
                              className="flex-1 bg-[#162419] text-[#6b9165] rounded-xl py-2 text-xs font-medium border border-[#2a4230]">
                              Annuler
                            </button>
                            <button disabled={creationClient || !newClientNom.trim()} onClick={creerClientRapide}
                              className="flex-1 bg-[#b4e033] text-[#0e1c0f] rounded-xl py-2 text-xs font-semibold disabled:opacity-40">
                              {creationClient ? '…' : 'Ajouter'}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {erreur && <p className="text-[#f87171] text-xs">{erreur}</p>}
            </div>

            <div className="px-5 pb-5 pt-3 border-t border-[#1e3222] shrink-0">
              <button onClick={confirmerVente} disabled={!canConfirm || charge}
                className={`w-full rounded-2xl py-4 font-semibold text-base transition-all ${canConfirm && !charge
                  ? saleMode === 'credit' ? 'bg-[#fbbf24] text-[#0e1c0f] active:scale-95' : 'bg-[#b4e033] text-[#0e1c0f] active:scale-95'
                  : 'bg-[#2a4230] text-[#4a6b4a] cursor-not-allowed'}`}>
                {charge ? '…' : saleMode === 'credit' ? 'Confirmer la vente à crédit' : "Confirmer l'encaissement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
