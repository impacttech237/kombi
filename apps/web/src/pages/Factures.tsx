/**
 * Factures & Devis — porté fidèlement du prototype Figma Make (Invoices(), lignes 1189-1930).
 * Adaptations : listerFactures() ne renvoie pas les lignes ni l'échéance par facture (seul
 * listerFacturesImpayees() les a) — le détail affiche donc émetteur/client/total puis renvoie au
 * PDF (déjà conforme DGI) pour le détail des lignes, plutôt que de dupliquer un tableau fictif.
 */
import { useEffect, useMemo, useState } from 'react';
import { formaterFCFA as fmt } from '@kombi/shared';
import { TAUX_TVA_EFFECTIF } from '@kombi/fiscal';
import {
  listerFactures, creerFacture, emettreFacture, creerAvoir, convertirDevisEnFacture,
  listerTiers, creerTiers, urlPdfFacture, fichierPdfFacture, listerProduits,
  type EntrepriseResume, type FactureResume, type Tiers, type LigneFacture, type Produit,
} from '../lib/api.js';
import { enfilerMutation, nouvelUuid } from '../offline/db.js';
import { synchroniser } from '../offline/sync.js';
import { IcoPlus, IcoX, IcoChevR, IcoSearch, IcoOk, IcoAlert, IcoShare, Avatar } from '../components/icons.js';

type Filtre = 'all' | 'pending' | 'overdue' | 'paid' | 'devis';
const TABS: { key: Filtre; label: string }[] = [
  { key: 'all', label: 'Tous' }, { key: 'pending', label: 'En attente' }, { key: 'overdue', label: 'En retard' },
  { key: 'paid', label: 'Payées' }, { key: 'devis', label: 'Devis' },
];

const BADGE: Record<string, { label: string; cls: string }> = {
  brouillon: { label: 'Brouillon', cls: 'bg-[var(--k-muted)]/15 text-[var(--k-muted)]' },
  envoyee: { label: 'En attente', cls: 'bg-[#fbbf24]/15 text-[#fbbf24]' },
  payee_partiellement: { label: 'Partiel', cls: 'bg-[#fbbf24]/15 text-[#fbbf24]' },
  payee: { label: 'Payée', cls: 'bg-[#4ade80]/10 text-[#4ade80]' },
  en_retard: { label: 'En retard', cls: 'bg-[#f87171]/15 text-[#f87171]' },
  annulee: { label: 'Annulée', cls: 'bg-[var(--k-faint)]/20 text-[var(--k-muted)]' },
};

const MODES_PAIEMENT: [string, string, string][] = [
  ['especes', 'Espèces', '#234b3d'], ['orange_money', 'Orange Money', '#e08a1e'], ['mtn_momo', 'MTN MoMo', '#2e8a5e'],
  ['virement', 'Virement', '#5fa8e0'], ['cheque', 'Chèque', '#a78bfa'],
];

function courte(date: string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).replace('.', '');
}

/** Numéro au format attendu par wa.me (chiffres seulement, indicatif CEMAC 237 par défaut). */
function numeroWhatsApp(telephone: string): string {
  const chiffres = telephone.replace(/\D/g, '');
  return chiffres.startsWith('237') ? chiffres : `237${chiffres.replace(/^0+/, '')}`;
}

export function Factures({ entreprise }: { entreprise: EntrepriseResume }) {
  const [docs, setDocs] = useState<FactureResume[] | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [paySheet, setPaySheet] = useState<FactureResume | null>(null);
  const [avoirDoc, setAvoirDoc] = useState<FactureResume | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  function recharger() { return listerFactures(entreprise.id).then(setDocs).catch(() => setDocs((p) => p ?? [])); }
  useEffect(() => { void recharger(); }, [entreprise.id]);

  const factures = useMemo(() => (docs ?? []).filter((d) => d.type === 'facture'), [docs]);
  const devis = useMemo(() => (docs ?? []).filter((d) => d.type === 'devis'), [docs]);
  // Aucun statut `en_retard` n'est jamais persisté en base (voir le commentaire de
  // listerFactures() côté API) — le retard est le booléen `enRetard`, dérivé de date_echeance à
  // chaque appel, indépendamment du statut envoyee/payee_partiellement sous-jacent.
  const pending = useMemo(() => factures.filter((d) => (d.statut === 'envoyee' || d.statut === 'payee_partiellement') && !d.enRetard), [factures]);
  const overdue = useMemo(() => factures.filter((d) => d.enRetard), [factures]);
  const paid = useMemo(() => factures.filter((d) => d.statut === 'payee'), [factures]);

  const filtered = useMemo(() => {
    if (!docs) return [];
    if (filtre === 'devis') return devis;
    if (filtre === 'all') return docs;
    if (filtre === 'pending') return pending;
    if (filtre === 'overdue') return overdue;
    return paid;
  }, [docs, filtre, devis, pending, overdue, paid]);

  const tabCount: Record<Filtre, number> = {
    all: docs?.length ?? 0, pending: pending.length, overdue: overdue.length, paid: paid.length, devis: devis.length,
  };

  const detailDoc = docs?.find((d) => d.id === detailId) ?? null;

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col">
      <div className="px-4 md:px-8 pt-4 md:pt-6 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((tab) => (
            <button key={tab.key} onClick={() => setFiltre(tab.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${filtre === tab.key ? 'bg-[#3a9e6e] text-white' : 'bg-[var(--k-surface-soft)] text-[var(--k-muted)] border border-[var(--k-line)]'}`}>
              {tab.label}
              <span className={`rounded-full text-xs px-1.5 ${filtre === tab.key ? 'bg-[#0e1c0f]/20 text-white' : 'bg-[var(--k-surface-inset)] text-[var(--k-muted)]'}`}>{tabCount[tab.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 md:px-8 pb-2">
        <div className="bg-[var(--k-surface)] rounded-2xl p-4 grid grid-cols-3 gap-4">
          <div>
            <p className="text-[var(--k-faint)] text-xs">À encaisser</p>
            <p className="text-[#fbbf24] font-mono font-semibold text-sm mt-0.5">{fmt(pending.reduce((s, i) => s + i.montantDu, 0))}</p>
          </div>
          <div>
            <p className="text-[var(--k-faint)] text-xs">En retard</p>
            <p className="text-[#f87171] font-mono font-semibold text-sm mt-0.5">{fmt(overdue.reduce((s, i) => s + i.montantDu, 0))}</p>
          </div>
          <div>
            <p className="text-[var(--k-faint)] text-xs">Encaissé</p>
            <p className="text-[#4ade80] font-mono font-semibold text-sm mt-0.5">{fmt(factures.reduce((s, i) => s + i.regle, 0))}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-2 pt-1">
        {docs === null ? (
          <p className="text-[var(--k-faint)] text-sm text-center py-8">Chargement…</p>
        ) : filtered.length === 0 ? (
          <p className="text-[var(--k-faint)] text-sm text-center py-8">Aucun document.</p>
        ) : (
          filtered.map((d) => {
            const isDevis = d.type === 'devis';
            const isAvoir = !!d.avoir_de_id;
            const isConverted = isDevis && !!d.a_ete_converti;
            const isBrouillon = d.statut === 'brouillon';
            const canAvoir = !isDevis && !isAvoir && !isBrouillon && !d.a_un_avoir && d.statut !== 'brouillon';
            const canPay = !isDevis && !isAvoir && !isBrouillon && d.statut !== 'payee';
            const partiel = d.regle > 0 && d.montantDu > 0;
            const badge = isAvoir ? { label: 'Avoir', cls: 'bg-[#a78bfa]/15 text-[#a78bfa]' }
              : isConverted ? { label: 'Convertie', cls: 'bg-[#4ade80]/10 text-[#4ade80]' }
              : !isDevis && d.enRetard ? { label: 'En retard', cls: 'bg-[#f87171]/15 text-[#f87171]' }
              : BADGE[d.statut] ?? { label: d.statut, cls: 'bg-[var(--k-faint)]/20 text-[var(--k-muted)]' };
            const montantCls = isAvoir ? 'text-[#a78bfa]' : !isDevis && d.statut === 'payee' ? 'text-[#4ade80]' : !isDevis && d.enRetard ? 'text-[#f87171]' : 'text-[var(--k-ink)]';
            return (
              <div key={d.id} className="bg-[var(--k-surface)] rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={d.tiers_nom ?? '?'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-[var(--k-faint)] text-xs font-mono">{d.numero ?? 'Brouillon'}</span>
                      {isDevis && <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-[var(--k-faint)]/20 text-[var(--k-muted)]">Devis</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <p className="text-[var(--k-ink)] font-medium text-sm">{d.tiers_nom ?? '—'}</p>
                    <p className="text-[var(--k-faint)] text-xs mt-1.5">{isDevis ? 'Créé le' : 'Émis le'} {courte(d.date_emission)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-mono font-semibold ${montantCls}`}>{fmt(d.total_ttc)}</p>
                    {partiel && <p className="text-[var(--k-faint)] text-[11px] mt-0.5">reste {fmt(d.montantDu)}</p>}
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--k-line)] flex-wrap">
                  <button onClick={() => setDetailId(d.id)} className="flex-1 bg-[var(--k-surface-soft)] text-[var(--k-ink)] rounded-xl py-2 text-xs font-medium hover:bg-[var(--k-surface-inset)] transition-colors">
                    Voir détail
                  </button>
                  {isDevis && !isConverted && (
                    <button onClick={async () => { await convertirDevisEnFacture(entreprise.id, d.id); void recharger(); }}
                      className="flex-1 bg-[#3a9e6e] text-white rounded-xl py-2 text-xs font-semibold active:scale-95 transition-all">
                      Convertir en facture
                    </button>
                  )}
                  {canPay && (
                    <button onClick={() => setPaySheet(d)} className="flex-1 bg-[#3a9e6e] text-white rounded-xl py-2 text-xs font-semibold active:scale-95 transition-all">
                      Encaisser
                    </button>
                  )}
                  {canAvoir && (
                    <button onClick={() => setAvoirDoc(d)} className="text-[#f87171] text-xs font-medium px-2 py-2 hover:bg-[#f87171]/8 rounded-xl transition-colors">
                      Avoir
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <button onClick={() => setCreateOpen(true)}
        className="fixed bottom-24 md:bottom-6 right-4 w-14 h-14 bg-[#3a9e6e] rounded-full flex items-center justify-center text-white shadow-lg shadow-[var(--k-lime)]/20 z-10 active:scale-95 transition-all">
        <IcoPlus cls="w-6 h-6" />
      </button>

      {detailDoc && (
        <DetailOverlay entreprise={entreprise} doc={detailDoc} onClose={() => setDetailId(null)}
          onEmettre={async () => { await emettreFacture(entreprise.id, detailDoc.id); setDetailId(null); void recharger(); }}
          onEncaisser={() => { setDetailId(null); setPaySheet(detailDoc); }}
          onAvoir={() => { setDetailId(null); setAvoirDoc(detailDoc); }}
        />
      )}

      {paySheet && (
        <PaySheet doc={paySheet} onClose={() => setPaySheet(null)}
          onConfirm={async (montant, modePaiement) => {
            const clientUuid = nouvelUuid();
            await enfilerMutation({ clientUuid, entrepriseId: entreprise.id, type: 'paiement_facture', payload: { factureId: paySheet.id, montant, modePaiement } });
            await synchroniser();
            setPaySheet(null); void recharger();
          }}
        />
      )}

      {avoirDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setAvoirDoc(null)}>
          <div className="bg-[var(--k-surface)] rounded-2xl p-5 w-full max-w-sm border border-[var(--k-line)]" onClick={(e) => e.stopPropagation()}>
            <p className="text-[var(--k-ink)] font-semibold text-base mb-2">Émettre un avoir</p>
            <p className="text-[var(--k-muted)] text-sm mb-1">
              Émettre un avoir pour <span className="text-[var(--k-ink)] font-medium">{avoirDoc.numero}</span>,{' '}
              <span className="text-[var(--k-ink)] font-mono font-medium">{fmt(avoirDoc.total_ttc)}</span> ?
            </p>
            <p className="text-[#f87171] text-xs mb-5">Cette action est irréversible.</p>
            <div className="flex gap-2">
              <button onClick={() => setAvoirDoc(null)} className="flex-1 bg-[var(--k-surface-soft)] text-[var(--k-muted)] rounded-xl py-2.5 text-sm font-medium">Annuler</button>
              <button onClick={async () => { await creerAvoir(entreprise.id, avoirDoc.id); setAvoirDoc(null); void recharger(); }}
                className="flex-1 bg-[#f87171]/15 text-[#f87171] rounded-xl py-2.5 text-sm font-semibold border border-[#f87171]/30">Confirmer</button>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <CreateWizard entreprise={entreprise} onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); void recharger(); }} />
      )}
    </div>
  );
}

function DetailOverlay({ entreprise, doc, onClose, onEmettre, onEncaisser, onAvoir }: {
  entreprise: EntrepriseResume; doc: FactureResume; onClose: () => void;
  onEmettre: () => void; onEncaisser: () => void; onAvoir: () => void;
}) {
  const [apercuUrl, setApercuUrl] = useState<string | null>(null);
  const [apercuCharge, setApercuCharge] = useState(false);
  const [erreurPdf, setErreurPdf] = useState('');
  useEffect(() => () => { if (apercuUrl) URL.revokeObjectURL(apercuUrl); }, [apercuUrl]);
  const isDevis = doc.type === 'devis';
  const isAvoir = !!doc.avoir_de_id;
  const isBrouillon = doc.statut === 'brouillon';
  const canPay = !isDevis && !isAvoir && !isBrouillon && doc.statut !== 'payee';
  const canAvoir = !isDevis && !isAvoir && !isBrouillon && !doc.a_un_avoir && doc.statut !== 'brouillon';
  const tvaApplicable = entreprise.regime_fiscal !== 'igs' && entreprise.assujetti_tva === 1;
  const ht = tvaApplicable ? Math.round(doc.total_ttc / (1 + TAUX_TVA_EFFECTIF)) : doc.total_ttc;
  const tva = doc.total_ttc - ht;
  const partiel = doc.regle > 0 && doc.montantDu > 0;
  const badge = isAvoir ? { label: 'Avoir', cls: 'bg-[#a78bfa]/15 text-[#a78bfa]' }
    : isBrouillon ? { label: 'Brouillon', cls: 'bg-[var(--k-muted)]/15 text-[var(--k-muted)]' }
    : isDevis ? { label: 'Devis', cls: 'bg-[var(--k-faint)]/20 text-[var(--k-muted)]' }
    : doc.enRetard ? { label: 'En retard', cls: 'bg-[#f87171]/15 text-[#f87171]' }
    : BADGE[doc.statut] ?? { label: doc.statut, cls: 'bg-[var(--k-faint)]/20 text-[var(--k-muted)]' };

  async function voirPdf() {
    const fenetre = window.open('', '_blank');
    try {
      const url = await urlPdfFacture(entreprise.id, doc.id);
      if (fenetre) fenetre.location.href = url;
      else { URL.revokeObjectURL(url); setErreurPdf('Ouverture bloquée par le navigateur. Utilisez l’aperçu intégré.'); }
    } catch (e) { fenetre?.close(); setErreurPdf(e instanceof Error ? e.message : 'PDF indisponible'); }
  }
  async function basculerApercu() {
    if (apercuUrl) { URL.revokeObjectURL(apercuUrl); setApercuUrl(null); return; }
    setApercuCharge(true); setErreurPdf('');
    try { setApercuUrl(await urlPdfFacture(entreprise.id, doc.id)); }
    catch (e) { setErreurPdf(e instanceof Error ? e.message : 'Aperçu indisponible'); }
    finally { setApercuCharge(false); }
  }
  async function whatsapp() {
    const texte = `Bonjour, voici votre ${doc.type} ${doc.numero ?? ''} d'un montant de ${fmt(doc.total_ttc)}. Merci !`;
    try {
      const fichier = await fichierPdfFacture(entreprise.id, doc.id, `${doc.numero ?? 'facture'}.pdf`);
      if (navigator.canShare?.({ files: [fichier] })) {
        await navigator.share({ files: [fichier], text: texte, title: doc.numero ?? 'Facture' });
        return;
      }
    } catch { /* PDF ou partage natif indisponible → repli lien texte ci-dessous */ }
    const lien = doc.tiers_telephone
      ? `https://wa.me/${numeroWhatsApp(doc.tiers_telephone)}?text=${encodeURIComponent(texte)}`
      : `https://wa.me/?text=${encodeURIComponent(texte)}`;
    window.open(lien, '_blank');
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0e1c0f]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--k-line)] bg-[#0a1408] shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-[var(--k-surface-soft)] flex items-center justify-center text-[var(--k-muted)]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <div className="flex-1">
          <p className="text-[var(--k-ink)] font-semibold text-sm">{doc.numero ?? 'Brouillon'}</p>
          <p className="text-[var(--k-faint)] text-xs">{doc.tiers_nom ?? '—'}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${badge.cls}`}>{badge.label}</span>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        <div className="mx-4 mt-4 bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-line)]">
          <div className="flex justify-between gap-4">
            <div>
              <p className="text-[var(--k-faint)] text-[10px] uppercase tracking-wide font-medium mb-1">Émetteur</p>
              <p className="text-[var(--k-ink)] font-semibold text-sm">{entreprise.raison_sociale}</p>
              {entreprise.niu && <p className="text-[var(--k-faint)] text-xs mt-0.5">NIU : {entreprise.niu}</p>}
            </div>
            <div className="text-right">
              <p className="text-[var(--k-faint)] text-[10px] uppercase tracking-wide font-medium mb-1">Client</p>
              <p className="text-[var(--k-ink)] font-semibold text-sm">{doc.tiers_nom ?? '—'}</p>
              <p className="text-[var(--k-faint)] text-xs mt-0.5">{isDevis ? 'Créé le' : 'Émis le'} {courte(doc.date_emission)}</p>
            </div>
          </div>
        </div>

        <div className="mx-4 mt-3 bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-line)] space-y-2">
          {tvaApplicable && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--k-muted)]">Montant HT</span>
                <span className="text-[var(--k-ink)] font-mono">{fmt(ht)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--k-muted)]">TVA (19,25 %)</span>
                <span className="text-[var(--k-ink)] font-mono">{fmt(tva)}</span>
              </div>
              <div className="border-t border-[var(--k-line)] pt-2" />
            </>
          )}
          <div className="flex justify-between">
            <span className="text-[var(--k-ink)] font-semibold text-sm">{tvaApplicable ? 'Total TTC' : 'Total'}</span>
            <span className={`font-mono font-bold text-base ${isAvoir ? 'text-[#a78bfa]' : doc.statut === 'payee' && !isDevis ? 'text-[#4ade80]' : doc.enRetard && !isDevis ? 'text-[#f87171]' : 'text-[var(--k-ink)]'}`}>
              {fmt(doc.total_ttc)}
            </span>
          </div>
          {!isDevis && partiel && (
            <div className="flex justify-between text-sm pt-1 border-t border-[var(--k-line)]">
              <span className="text-[var(--k-muted)]">Déjà réglé · reste dû</span>
              <span className="font-mono text-[#fbbf24]">{fmt(doc.regle)} · {fmt(doc.montantDu)}</span>
            </div>
          )}
        </div>

        {!isBrouillon && (
          <div className="mx-4 mt-3 bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-line)]">
            <p className="text-[var(--k-faint)] text-xs font-medium uppercase tracking-wide mb-2">Détail des lignes</p>
            <p className="text-[var(--k-faint)] text-sm">Voir le PDF pour le détail complet, conforme DGI.</p>
          </div>
        )}

        {!isBrouillon && (
          <div className="mx-4 mt-3">
            <button onClick={basculerApercu} disabled={apercuCharge}
              className="w-full bg-[var(--k-surface-soft)] text-[var(--k-ink)] rounded-xl py-3 text-sm font-medium border border-[var(--k-line)] disabled:opacity-50">
              {apercuCharge ? 'Chargement…' : apercuUrl ? 'Masquer l’aperçu' : 'Prévisualiser la facture'}
            </button>
            {erreurPdf && <p role="alert" className="text-[#f87171] text-xs mt-2">{erreurPdf}</p>}
            {apercuUrl && (
              <iframe title={`Aperçu ${doc.numero ?? doc.type}`} src={apercuUrl}
                className="w-full h-[70vh] bg-white rounded-xl mt-3 border border-[var(--k-line)]" />
            )}
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-[var(--k-surface)] border-t border-[var(--k-line)] px-4 py-3 flex gap-2">
        {!isBrouillon && (
          <button onClick={whatsapp} className="w-9 h-9 shrink-0 bg-[var(--k-surface-soft)] rounded-xl flex items-center justify-center text-[var(--k-muted)] border border-[var(--k-line)]">
            <IcoShare cls="w-4 h-4" />
          </button>
        )}
        {!isBrouillon && (
          <button onClick={voirPdf} className="flex-1 bg-[var(--k-surface-soft)] text-[var(--k-muted)] rounded-xl py-2.5 text-xs font-medium border border-[var(--k-line)]">PDF</button>
        )}
        {isBrouillon && (
          <button onClick={onEmettre} className="flex-1 bg-[#3a9e6e] text-white rounded-xl py-2.5 text-sm font-bold active:scale-95 transition-all">
            {isDevis ? 'Envoyer le devis' : 'Émettre la facture'}
          </button>
        )}
        {canPay && (
          <button onClick={onEncaisser} className="flex-1 bg-[#3a9e6e] text-white rounded-xl py-2.5 text-xs font-semibold active:scale-95 transition-all">
            Encaisser
          </button>
        )}
        {canAvoir && (
          <button onClick={onAvoir} className="px-3 bg-[#f87171]/10 text-[#f87171] rounded-xl py-2.5 text-xs font-medium border border-[#f87171]/20">
            Avoir
          </button>
        )}
      </div>
    </div>
  );
}

function PaySheet({ doc, onClose, onConfirm }: {
  doc: FactureResume; onClose: () => void; onConfirm: (montant: number, mode: string) => Promise<void>;
}) {
  const [montant, setMontant] = useState(String(doc.montantDu));
  const [mode, setMode] = useState('especes');
  const [charge, setCharge] = useState(false);
  const val = parseFloat(montant.replace(/\s/g, '').replace(',', '.')) || 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div className="bg-[var(--k-surface)] rounded-t-3xl p-5 space-y-4 max-w-lg mx-auto w-full" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-[var(--k-surface-inset)] rounded-full mx-auto mb-1" />
        <h3 className="text-[var(--k-ink)] font-semibold text-base">Encaissement</h3>
        {doc.regle > 0 && (
          <p className="text-[var(--k-faint)] text-xs -mt-2">Déjà réglé : {fmt(doc.regle)} sur {fmt(doc.total_ttc)}</p>
        )}
        <div>
          <label className="text-[var(--k-muted)] text-xs font-medium block mb-1.5">Montant à encaisser (F)</label>
          <input type="text" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)}
            className="w-full bg-[var(--k-surface-soft)] text-[var(--k-ink)] font-mono text-lg rounded-xl px-4 py-3 border border-[var(--k-line)] focus:ring-2 focus:ring-[var(--k-lime)] focus:outline-none" />
          {val > 0 && val < doc.montantDu && (
            <p className="text-[#fbbf24] text-xs mt-1.5">Paiement partiel — solde restant : {fmt(doc.montantDu - val)}</p>
          )}
        </div>
        <div>
          <label className="text-[var(--k-muted)] text-xs font-medium block mb-2">Mode de paiement</label>
          <div className="grid grid-cols-3 gap-2">
            {MODES_PAIEMENT.map(([key, label, couleur]) => (
              <button key={key} onClick={() => setMode(key)}
                className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl text-xs font-medium border transition-all ${mode === key ? 'bg-[#3a9e6e]/10 border-[var(--k-lime)] text-[var(--k-lime)]' : 'bg-[var(--k-surface-soft)] border-[var(--k-line)] text-[var(--k-muted)]'}`}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: couleur }} />{label}
              </button>
            ))}
          </div>
        </div>
        <button disabled={charge || val <= 0} onClick={async () => { setCharge(true); await onConfirm(val, mode); }}
          className="w-full bg-[#3a9e6e] text-white rounded-2xl py-3.5 font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-50">
          {charge ? '…' : "Confirmer l'encaissement"}
        </button>
      </div>
    </div>
  );
}

function CreateWizard({ entreprise, onClose, onCreated }: {
  entreprise: EntrepriseResume; onClose: () => void; onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [type, setType] = useState<'facture' | 'devis'>('facture');
  const [tiers, setTiers] = useState<Tiers[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [newCliSheet, setNewCliSheet] = useState(false);
  const [newCliNom, setNewCliNom] = useState('');
  const [newCliTel, setNewCliTel] = useState('');
  type WizLine = { id: string; desc: string; qty: string; unitPrice: string; produitId?: string };
  const [lignes, setLignes] = useState<WizLine[]>([{ id: '1', desc: '', qty: '1', unitPrice: '' }]);
  const [dueDate, setDueDate] = useState('');
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const [produits, setProduits] = useState<Produit[]>([]);
  const [pickerLigneId, setPickerLigneId] = useState<string | null>(null);
  const [produitSearch, setProduitSearch] = useState('');

  useEffect(() => {
    listerTiers(entreprise.id).then((ts) => setTiers(ts.filter((t) => t.type === 'client' || t.type === 'les_deux'))).catch(() => {});
    listerProduits(entreprise.id).then(setProduits).catch(() => {});
  }, [entreprise.id]);

  const tvaApplicable = entreprise.regime_fiscal !== 'igs' && entreprise.assujetti_tva === 1;
  function ligneTotal(l: WizLine) { return Math.round((parseFloat(l.qty) || 0) * (parseFloat(l.unitPrice) || 0)); }
  const sousTotal = lignes.reduce((s, l) => s + ligneTotal(l), 0);
  const tva = tvaApplicable ? Math.round(sousTotal * TAUX_TVA_EFFECTIF) : 0;
  const total = sousTotal + tva;

  function addLigne() { setLignes((prev) => [...prev, { id: String(prev.length + 1) + Math.random(), desc: '', qty: '1', unitPrice: '' }]); }
  function updateLigne(id: string, field: keyof WizLine, val: string) {
    setLignes((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: val } : l)));
  }
  function removeLigne(id: string) { setLignes((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev)); }

  async function ajouterClient() {
    const nom = newCliNom.trim();
    if (!nom) return;
    try {
      const { tiersId } = await creerTiers(entreprise.id, { nom, telephone: newCliTel.trim() || undefined });
      setTiers((prev) => [...prev, { id: tiersId, nom, type: 'client', niu: null, telephone: newCliTel.trim() || null, email: null, adresse: null }]);
      setClientId(tiersId); setNewCliSheet(false); setNewCliNom(''); setNewCliTel('');
    } catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur'); }
  }

  async function enregistrerBrouillon() {
    if (!clientId) { setErreur('Choisissez un client avant d\'enregistrer.'); setStep(2); return; }
    const lignesReelles: LigneFacture[] = lignes.filter((l) => l.desc.trim())
      .map((l) => ({ designation: l.desc.trim(), quantite: parseFloat(l.qty) || 1, prixUnitaire: parseFloat(l.unitPrice) || 0 }));
    if (!lignesReelles.length) { setErreur('Ajoutez au moins une ligne avec une désignation.'); setStep(3); return; }
    setCharge(true); setErreur('');
    try {
      await creerFacture(entreprise.id, { type, tiersId: clientId, lignes: lignesReelles, dateEcheance: dueDate || undefined, clientUuid: nouvelUuid() });
      onCreated();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  const filteredCli = tiers.filter((t) => t.nom.toLowerCase().includes(clientSearch.toLowerCase()));
  const filteredProduits = produits.filter((p) => p.nom.toLowerCase().includes(produitSearch.toLowerCase()));
  const step2Valid = !!clientId;
  const step3Valid = lignes.some((l) => l.desc.trim());
  const selClient = tiers.find((t) => t.id === clientId);

  function goNext() {
    if (step === 2 && !step2Valid) { setErreur('Choisissez un client pour continuer.'); return; }
    setErreur('');
    setStep((s) => (Math.min(4, s + 1) as 1 | 2 | 3 | 4));
  }
  function goBack() { setStep((s) => (Math.max(1, s - 1) as 1 | 2 | 3 | 4)); }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0e1c0f]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--k-line)] bg-[#0a1408] shrink-0">
        {step > 1
          ? <button onClick={goBack} className="w-9 h-9 rounded-full bg-[var(--k-surface-soft)] flex items-center justify-center text-[var(--k-muted)]"><IcoChevR cls="w-4 h-4 rotate-180" /></button>
          : <div className="w-9 h-9" />}
        <div className="flex-1 flex items-center justify-center gap-1.5">
          {([1, 2, 3, 4] as const).map((s) => (
            <div key={s} className={`rounded-full transition-all duration-300 ${s === step ? 'w-5 h-1.5 bg-[#3a9e6e]' : s < step ? 'w-1.5 h-1.5 bg-[var(--k-faint)]' : 'w-1.5 h-1.5 bg-[var(--k-surface-inset)]'}`} />
          ))}
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-[var(--k-surface-soft)] flex items-center justify-center text-[var(--k-muted)]">
          <IcoX cls="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {step === 1 && (
          <div className="pt-5 space-y-4">
            <div>
              <p className="text-[var(--k-faint)] text-xs font-medium uppercase tracking-widest">Étape 1 sur 4</p>
              <h2 className="text-[var(--k-ink)] text-xl font-bold mt-1">Type de document</h2>
            </div>
            <div className="flex gap-2 bg-[var(--k-surface)] rounded-2xl p-1.5 border border-[var(--k-line)]">
              {(['facture', 'devis'] as const).map((t) => (
                <button key={t} onClick={() => setType(t)}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${type === t ? 'bg-[#3a9e6e] text-white' : 'text-[var(--k-faint)]'}`}>
                  {t === 'facture' ? 'Facture' : 'Devis'}
                </button>
              ))}
            </div>
            <div className="bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-line)] space-y-2">
              {type === 'facture' ? (
                <>
                  <p className="text-[var(--k-ink)] text-sm font-medium">Document comptable</p>
                  <p className="text-[var(--k-muted)] text-xs leading-relaxed">Une facture génère une créance client et est enregistrée dans votre comptabilité après émission.</p>
                </>
              ) : (
                <>
                  <p className="text-[var(--k-ink)] text-sm font-medium">Proposition commerciale</p>
                  <p className="text-[var(--k-muted)] text-xs leading-relaxed">Un devis est sans valeur comptable. Une fois accepté, vous pouvez le convertir en facture.</p>
                </>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="pt-5 space-y-3">
            <div>
              <p className="text-[var(--k-faint)] text-xs font-medium uppercase tracking-widest">Étape 2 sur 4</p>
              <h2 className="text-[var(--k-ink)] text-xl font-bold mt-1">Sélectionner un client</h2>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--k-faint)]"><IcoSearch cls="w-4 h-4" /></span>
              <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Rechercher..." autoFocus
                className="w-full bg-[var(--k-surface)] text-[var(--k-ink)] placeholder:text-[var(--k-faint)] rounded-xl pl-9 pr-4 py-3 text-sm border border-[var(--k-line)] focus:ring-2 focus:ring-[var(--k-lime)] focus:outline-none" />
            </div>
            <div className="space-y-1.5">
              {filteredCli.map((c) => (
                <button key={c.id} onClick={() => setClientId(c.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm text-left transition-all border ${clientId === c.id ? 'bg-[#3a9e6e]/10 border-[var(--k-lime)]/40 text-[var(--k-lime)]' : 'bg-[var(--k-surface)] border-[var(--k-line)] text-[var(--k-ink)]'}`}>
                  <Avatar name={c.nom} size="xs" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{c.nom}</p>
                    {c.niu && <p className="text-[var(--k-faint)] text-xs font-mono">{c.niu}</p>}
                  </div>
                  {clientId === c.id && <IcoOk cls="w-4 h-4 shrink-0" />}
                </button>
              ))}
            </div>
            <button onClick={() => setNewCliSheet(true)}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm border border-dashed border-[var(--k-line)] text-[var(--k-muted)] hover:border-[var(--k-lime)]/40 hover:text-[var(--k-lime)] transition-all">
              <div className="w-7 h-7 rounded-full bg-[var(--k-surface-soft)] flex items-center justify-center"><IcoPlus cls="w-3.5 h-3.5" /></div>
              Nouveau client
            </button>
            {type === 'facture' && clientId && !selClient?.niu && entreprise.regime_fiscal !== 'igs' && (
              <div className="bg-[#fbbf24]/8 border border-[#fbbf24]/30 rounded-xl p-3 flex items-start gap-2.5">
                <IcoAlert cls="w-4 h-4 text-[#fbbf24] shrink-0 mt-0.5" />
                <p className="text-[#fbbf24] text-xs leading-relaxed">Ce client n'a pas de NIU. Vous pouvez enregistrer le brouillon, mais vous devrez l'ajouter avant d'émettre la facture (régime réel).</p>
              </div>
            )}
            {newCliSheet && (
              <div className="bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-lime)]/30 space-y-3">
                <p className="text-[var(--k-ink)] font-semibold text-sm">Nouveau client</p>
                <input value={newCliNom} onChange={(e) => setNewCliNom(e.target.value)} placeholder="Nom / Raison sociale *"
                  className="w-full bg-[var(--k-surface-soft)] text-[var(--k-ink)] placeholder:text-[var(--k-faint)] rounded-xl px-4 py-3 text-sm border border-[var(--k-line)] focus:ring-2 focus:ring-[var(--k-lime)] focus:outline-none" />
                <input value={newCliTel} onChange={(e) => setNewCliTel(e.target.value)} placeholder="Téléphone" type="tel"
                  className="w-full bg-[var(--k-surface-soft)] text-[var(--k-ink)] placeholder:text-[var(--k-faint)] rounded-xl px-4 py-3 text-sm border border-[var(--k-line)] focus:ring-2 focus:ring-[var(--k-lime)] focus:outline-none" />
                <div className="flex gap-2">
                  <button onClick={() => { setNewCliSheet(false); setNewCliNom(''); setNewCliTel(''); }}
                    className="flex-1 bg-[var(--k-surface-soft)] text-[var(--k-muted)] rounded-xl py-2.5 text-xs font-medium">Annuler</button>
                  <button onClick={ajouterClient} disabled={!newCliNom.trim()}
                    className={`flex-1 rounded-xl py-2.5 text-xs font-semibold ${newCliNom.trim() ? 'bg-[#3a9e6e] text-white' : 'bg-[var(--k-surface-inset)] text-[var(--k-faint)]'}`}>
                    Ajouter
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="pt-5 space-y-3">
            <div>
              <p className="text-[var(--k-faint)] text-xs font-medium uppercase tracking-widest">Étape 3 sur 4</p>
              <h2 className="text-[var(--k-ink)] text-xl font-bold mt-1">Lignes du document</h2>
            </div>
            <div className="space-y-2">
              {lignes.map((l, idx) => (
                <div key={l.id} className="bg-[var(--k-surface)] rounded-2xl p-3 border border-[var(--k-line)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--k-faint)] text-xs font-medium">Ligne {idx + 1}</span>
                    {lignes.length > 1 && (
                      <button onClick={() => removeLigne(l.id)} className="text-[#f87171] text-xs"><IcoX cls="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input value={l.desc} onChange={(e) => updateLigne(l.id, 'desc', e.target.value)} placeholder="Désignation"
                      className="flex-1 min-w-0 bg-[var(--k-surface-soft)] text-[var(--k-ink)] placeholder:text-[var(--k-faint)] rounded-xl px-3 py-2.5 text-sm border border-[var(--k-line)] focus:ring-2 focus:ring-[var(--k-lime)] focus:outline-none" />
                    {produits.length > 0 && (
                      <button type="button" onClick={() => { setPickerLigneId(l.id); setProduitSearch(''); }}
                        className="shrink-0 bg-[var(--k-surface-soft)] text-[var(--k-lime)] rounded-xl px-3 py-2.5 text-xs font-medium border border-[var(--k-lime)]/30">
                        Catalogue
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[var(--k-faint)] text-[10px] font-medium block mb-1">Quantité</label>
                      <input type="number" min="0" value={l.qty} onChange={(e) => updateLigne(l.id, 'qty', e.target.value)}
                        className="w-full bg-[var(--k-surface-soft)] text-[var(--k-ink)] rounded-xl px-3 py-2 text-sm border border-[var(--k-line)] focus:ring-2 focus:ring-[var(--k-lime)] focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-[var(--k-faint)] text-[10px] font-medium block mb-1">Prix unitaire (F)</label>
                      <input type="number" min="0" value={l.unitPrice} onChange={(e) => updateLigne(l.id, 'unitPrice', e.target.value)}
                        className="w-full bg-[var(--k-surface-soft)] text-[var(--k-ink)] rounded-xl px-3 py-2 text-sm border border-[var(--k-line)] focus:ring-2 focus:ring-[var(--k-lime)] focus:outline-none" />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <span className="text-[var(--k-lime)] font-mono text-sm font-semibold">{fmt(ligneTotal(l))}</span>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addLigne}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-[var(--k-line)] text-[var(--k-muted)] text-sm hover:border-[var(--k-lime)]/30 hover:text-[var(--k-lime)] transition-all">
              <IcoPlus cls="w-4 h-4" /> Ajouter une ligne
            </button>
            <div className="bg-[var(--k-surface)] rounded-2xl border border-[var(--k-line)] divide-y divide-[var(--k-line)]">
              {tvaApplicable && (
                <>
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-[var(--k-muted)]">Total HT</span>
                    <span className="text-[var(--k-ink)] font-mono">{fmt(sousTotal)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-[var(--k-muted)]">TVA (19,25 %)</span>
                    <span className="text-[var(--k-ink)] font-mono">{fmt(tva)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between px-4 py-3">
                <span className="text-[var(--k-ink)] font-semibold text-sm">{tvaApplicable ? 'Total TTC' : 'Total'}</span>
                <span className="text-[var(--k-lime)] font-mono font-bold text-base">{fmt(total)}</span>
              </div>
            </div>
          </div>
        )}

        {pickerLigneId && (
          <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60" onClick={() => setPickerLigneId(null)}>
            <div className="bg-[var(--k-surface)] rounded-t-3xl overflow-hidden max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="w-10 h-1 bg-[var(--k-surface-inset)] rounded-full mx-auto mt-3 mb-1 shrink-0" />
              <div className="px-5 pt-3 pb-2 flex items-center justify-between shrink-0">
                <p className="text-[var(--k-ink)] font-semibold text-base">Choisir un article / service</p>
                <button onClick={() => setPickerLigneId(null)} className="w-7 h-7 rounded-full bg-[var(--k-surface-soft)] flex items-center justify-center text-[var(--k-muted)]">
                  <IcoX cls="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="px-4 pb-2 shrink-0">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--k-faint)]"><IcoSearch cls="w-4 h-4" /></span>
                  <input value={produitSearch} onChange={(e) => setProduitSearch(e.target.value)} placeholder="Rechercher..." autoFocus
                    className="w-full bg-[var(--k-surface-soft)] text-[var(--k-ink)] placeholder:text-[var(--k-faint)] rounded-xl pl-9 pr-4 py-3 text-sm border border-[var(--k-line)] focus:ring-2 focus:ring-[var(--k-lime)] focus:outline-none" />
                </div>
              </div>
              <div className="overflow-y-auto px-4 pb-8 space-y-1.5">
                {filteredProduits.length === 0 ? (
                  <p className="text-[var(--k-faint)] text-sm text-center py-8">Aucun article trouvé.</p>
                ) : filteredProduits.map((p) => (
                  <button key={p.id} onClick={() => {
                    const id = pickerLigneId;
                    setLignes((prev) => prev.map((l) => (l.id === id
                      ? { ...l, desc: p.nom, unitPrice: String(p.prix_vente), produitId: p.id } : l)));
                    setPickerLigneId(null);
                  }}
                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm text-left bg-[var(--k-surface-soft)] border border-[var(--k-line)] hover:border-[var(--k-lime)]/40 transition-all">
                    <div className="flex-1 min-w-0">
                      <p className="text-[var(--k-ink)] font-medium truncate">{p.nom}</p>
                      {p.sku && <p className="text-[var(--k-faint)] text-xs font-mono">{p.sku}</p>}
                    </div>
                    <span className="text-[var(--k-lime)] font-mono text-sm font-semibold shrink-0">{fmt(p.prix_vente)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="pt-5 space-y-4">
            <div>
              <p className="text-[var(--k-faint)] text-xs font-medium uppercase tracking-widest">Étape 4 sur 4</p>
              <h2 className="text-[var(--k-ink)] text-xl font-bold mt-1">Date d'échéance</h2>
            </div>
            <div className="bg-[var(--k-surface)] rounded-2xl p-4 border border-[var(--k-line)] space-y-3">
              <label className="text-[var(--k-muted)] text-xs font-medium block">
                {type === 'devis' ? 'Valable jusqu\'au (optionnel)' : 'Échéance de paiement (recommandé)'}
              </label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-[var(--k-surface-soft)] text-[var(--k-ink)] rounded-xl px-4 py-3 text-sm border border-[var(--k-line)] focus:ring-2 focus:ring-[var(--k-lime)] focus:outline-none [color-scheme:dark]" />
              {type === 'facture' && !dueDate && (
                <p className="text-[#fbbf24] text-xs">Une échéance est recommandée pour le suivi des paiements.</p>
              )}
              {type === 'devis' && <p className="text-[var(--k-faint)] text-xs">Vous pouvez laisser vide.</p>}
            </div>
            <div className="bg-[var(--k-surface)] rounded-2xl border border-[var(--k-line)] overflow-hidden">
              <div className="bg-[var(--k-surface-soft)] px-4 py-2.5">
                <p className="text-[var(--k-muted)] text-xs font-medium uppercase tracking-wide">Récapitulatif</p>
              </div>
              <div className="divide-y divide-[var(--k-line)]">
                {[
                  { label: 'Type', val: type === 'facture' ? 'Facture' : 'Devis' },
                  { label: 'Client', val: selClient?.nom ?? '—' },
                  { label: 'Lignes', val: `${lignes.filter((l) => l.desc.trim()).length} ligne(s)` },
                  { label: type === 'devis' ? 'Valable jusqu’au' : 'Échéance', val: dueDate || 'Non renseignée' },
                  { label: tvaApplicable ? 'Total TTC' : 'Total', val: fmt(total) },
                ].map((r) => (
                  <div key={r.label} className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-[var(--k-muted)]">{r.label}</span>
                    <span className="text-[var(--k-ink)] font-medium">{r.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {erreur && <p className="text-[#f87171] text-xs px-4 pb-2">{erreur}</p>}
      <div className="border-t border-[var(--k-line)] px-4 py-3 flex gap-2 bg-[#0a1408] shrink-0">
        <button onClick={enregistrerBrouillon} disabled={charge}
          className="flex-1 bg-[var(--k-surface-soft)] text-[var(--k-muted)] rounded-xl py-3 text-xs font-medium border border-[var(--k-line)] disabled:opacity-40">
          Enregistrer le brouillon
        </button>
        {step < 4 ? (
          <button onClick={goNext}
            className="flex-1 rounded-xl py-3 text-sm font-semibold transition-all bg-[#3a9e6e] text-white active:scale-[0.98]">
            Continuer →
          </button>
        ) : (
          <button onClick={enregistrerBrouillon} disabled={charge}
            className="flex-1 bg-[#3a9e6e] text-white rounded-xl py-3 text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-40">
            {charge ? '…' : 'Créer le brouillon'}
          </button>
        )}
      </div>
    </div>
  );
}
