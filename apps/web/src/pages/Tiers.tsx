/**
 * Clients & Fournisseurs — porté fidèlement du prototype Figma Make (Clients(), lignes 2280-2386).
 * Adaptations : listerTiers() ne renvoie pas de solde/dernière opération/nb de transactions par
 * tiers en liste (seul getTiersDetail(), par tiers, les calcule) — la liste n'affiche donc que
 * les infos disponibles en masse ; le solde réel apparaît dans la fiche détail.
 */
import { useEffect, useState } from 'react';
import { formaterFCFA as fmt } from '@kombi/shared';
import {
  listerTiers, getTiersDetail, creerTiers, televerserPieceAchat, urlPieceAchat, supprimerPieceAchat,
  type EntrepriseResume, type Tiers as TiersType, type TiersDetail,
} from '../lib/api.js';
import { IcoSearch, IcoPlus, IcoChevR, IcoX, IcoFile, Avatar } from '../components/icons.js';

const STATUT_LIBELLE: Record<string, string> = {
  brouillon: 'Brouillon', envoyee: 'Envoyée', payee_partiellement: 'Partiel', payee: 'Payée',
  en_retard: 'En retard', annulee: 'Annulée', a_credit: 'À crédit', regle: 'Réglé', annule: 'Annulé',
};

const inputCls = 'w-full bg-[#1e3222] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl px-4 py-3 text-sm border border-[#2a4230] focus:border-[#b4e033] focus:outline-none';

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

export function Tiers({ entreprise, onRetour, onNav }: {
  entreprise: EntrepriseResume; onRetour: () => void; onNav?: (m: string) => void;
}) {
  const [liste, setListe] = useState<TiersType[] | null>(null);
  const [tab, setTab] = useState<'clients' | 'fournisseurs'>('clients');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectionne, setSelectionne] = useState<string | null>(null);

  function recharger() { return listerTiers(entreprise.id).then(setListe).catch(() => setListe((p) => p ?? [])); }
  useEffect(() => { void recharger(); }, [entreprise.id]);

  if (selectionne)
    return <FicheTiers entreprise={entreprise} tiersId={selectionne} onRetour={() => setSelectionne(null)} />;

  const tousClients = (liste ?? []).filter((t) => t.type === 'client' || t.type === 'les_deux');
  const tousFournisseurs = (liste ?? []).filter((t) => t.type === 'fournisseur' || t.type === 'les_deux');
  const items = tab === 'clients' ? tousClients : tousFournisseurs;
  const filtered = items.filter((t) => t.nom.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-8 pt-4 pb-2 flex gap-2 items-center">
        <button onClick={onRetour} className="w-9 h-9 shrink-0 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        {([
          { key: 'clients' as const, label: 'Clients', count: tousClients.length },
          { key: 'fournisseurs' as const, label: 'Fournisseurs', count: tousFournisseurs.length },
        ]).map(({ key, label, count }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${tab === key ? 'bg-[#b4e033] text-[#0e1c0f]' : 'bg-[#1e3222] text-[#6b9165] border border-[#2a4230]'}`}>
            {label}
            <span className={`rounded-full text-xs px-1.5 ${tab === key ? 'bg-[#0e1c0f]/20 text-[#0e1c0f]' : 'bg-[#2a4230] text-[#6b9165]'}`}>{count}</span>
          </button>
        ))}
      </div>

      <div className="px-4 md:px-8 pb-2 pt-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a6b4a]"><IcoSearch cls="w-4 h-4" /></span>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={`Rechercher un ${tab === 'clients' ? 'client' : 'fournisseur'}...`}
            className="w-full bg-[#1e3222] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl pl-9 pr-4 py-3 text-sm border border-[#2a4230] focus:border-[#b4e033] focus:outline-none" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-2 pt-1">
        {liste === null ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
        ) : filtered.length === 0 ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">
            {items.length === 0 ? `Aucun ${tab === 'clients' ? 'client' : 'fournisseur'} pour l'instant.` : `Aucun résultat pour « ${search} ».`}
          </p>
        ) : (
          filtered.map((t) => (
            <div key={t.id} className="bg-[#162419] rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <Avatar name={t.nom} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-[#edf5ea] font-medium text-sm truncate">{t.nom}</p>
                  <p className="text-[#4a6b4a] text-xs mt-0.5">{t.telephone ?? 'Pas de téléphone'}</p>
                </div>
                <button onClick={() => setSelectionne(t.id)} className="text-[#b4e033] text-xs font-medium shrink-0">Voir fiche</button>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-[#1e3222]">
                <button onClick={() => onNav?.('factures')}
                  className="flex-1 bg-[#1e3222] text-[#edf5ea] rounded-xl py-2 text-xs font-medium hover:bg-[#2a4230] transition-colors">
                  {tab === 'clients' ? 'Factures' : 'Bons de commande'}
                </button>
                {tab === 'clients' && (
                  <button onClick={() => onNav?.('caisse')}
                    className="flex-1 bg-[#1e3222] text-[#edf5ea] rounded-xl py-2 text-xs font-medium hover:bg-[#2a4230] transition-colors">
                    Nouvelle vente
                  </button>
                )}
                {t.telephone && (
                  <a href={`tel:${t.telephone.replace(/\s/g, '')}`}
                    className="bg-[#b4e033]/10 text-[#b4e033] rounded-xl py-2 px-3 text-xs font-medium border border-[#b4e033]/20 hover:bg-[#b4e033]/20 transition-colors">
                    Appeler
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <button onClick={() => setCreateOpen(true)}
        className="fixed bottom-24 md:bottom-6 right-4 w-14 h-14 bg-[#b4e033] rounded-full flex items-center justify-center text-[#0e1c0f] shadow-lg shadow-[#b4e033]/20 z-10 active:scale-95 transition-all">
        <IcoPlus cls="w-6 h-6" />
      </button>

      {createOpen && (
        <NouveauTiersSheet entreprise={entreprise} typeInitial={tab === 'clients' ? 'client' : 'fournisseur'}
          onClose={() => setCreateOpen(false)} onCree={() => { setCreateOpen(false); void recharger(); }} />
      )}
    </div>
  );
}

function NouveauTiersSheet({ entreprise, typeInitial, onClose, onCree }: {
  entreprise: EntrepriseResume; typeInitial: 'client' | 'fournisseur'; onClose: () => void; onCree: () => void;
}) {
  const [nom, setNom] = useState('');
  const [type, setType] = useState<'client' | 'fournisseur'>(typeInitial);
  const [telephone, setTelephone] = useState('');
  const [niu, setNiu] = useState('');
  const [email, setEmail] = useState('');
  const [adresse, setAdresse] = useState('');
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');

  async function valider() {
    if (!nom.trim()) { setErreur('Nom requis'); return; }
    setCharge(true); setErreur('');
    try {
      await creerTiers(entreprise.id, {
        nom: nom.trim(), type, telephone: telephone || undefined, niu: niu || undefined,
        email: email || undefined, adresse: adresse || undefined,
      });
      onCree();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0e1c0f]">
      <SheetHeader title="Nouveau tiers" onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-4 pt-5 space-y-4">
        <div className="flex gap-2 bg-[#162419] rounded-2xl p-1.5 border border-[#2a4230]">
          {(['client', 'fournisseur'] as const).map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${type === t ? 'bg-[#b4e033] text-[#0e1c0f]' : 'text-[#4a6b4a]'}`}>
              {t === 'client' ? 'Client' : 'Fournisseur'}
            </button>
          ))}
        </div>
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom / Raison sociale *" className={inputCls} />
        <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Téléphone" type="tel" className={inputCls} />
        <input value={niu} onChange={(e) => setNiu(e.target.value)} placeholder="NIU (optionnel)" className={inputCls} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optionnel)" type="email" className={inputCls} />
        <input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Adresse (optionnel)" className={inputCls} />
        {erreur && <p className="text-[#f87171] text-xs">{erreur}</p>}
      </div>
      <div className="border-t border-[#1e3222] px-4 py-3 bg-[#0a1408] shrink-0">
        <button onClick={valider} disabled={charge || !nom.trim()}
          className="w-full bg-[#b4e033] text-[#0e1c0f] rounded-2xl py-4 font-semibold text-base active:scale-95 transition-all disabled:opacity-40">
          {charge ? '…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

function FicheTiers({ entreprise, tiersId, onRetour }: {
  entreprise: EntrepriseResume; tiersId: string; onRetour: () => void;
}) {
  const [fiche, setFiche] = useState<TiersDetail | null>(null);
  const [erreur, setErreur] = useState('');

  function recharger() {
    getTiersDetail(entreprise.id, tiersId).then(setFiche).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }
  useEffect(recharger, [entreprise.id, tiersId]);

  const operations = fiche ? [
    ...fiche.ventes.map((v) => ({ type: 'vente' as const, id: v.id, date: v.date, montant: v.total_ttc, statut: v.statut, libelle: 'Vente', pieceCle: null })),
    ...fiche.factures.map((f) => ({
      type: 'facture' as const, id: f.id, date: f.date_emission ?? '', montant: f.total_ttc, statut: f.statut,
      libelle: f.numero ?? (f.type === 'devis' ? 'Devis (brouillon)' : 'Facture (brouillon)'), pieceCle: null,
    })),
    ...fiche.achats.map((a) => ({
      type: 'achat' as const, id: a.id, date: a.date, montant: a.total_ttc, statut: a.statut,
      libelle: 'Achat fournisseur', pieceCle: a.piece_cle,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1)) : [];

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0e1c0f]">
      <SheetHeader title={fiche?.nom ?? '…'} onClose={onRetour} />
      <div className="flex-1 overflow-y-auto pb-8">
        {erreur ? (
          <p className="text-[#f87171] text-sm px-4 pt-4">{erreur}</p>
        ) : !fiche ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
        ) : (
          <>
            <div className="mx-4 mt-4 bg-[#162419] rounded-2xl p-4 border border-[#1e3222] space-y-1.5">
              <p className="text-[#4a6b4a] text-xs uppercase tracking-wide font-medium">
                {fiche.type === 'fournisseur' ? 'Fournisseur' : fiche.type === 'les_deux' ? 'Client & fournisseur' : 'Client'}
              </p>
              {fiche.telephone && <p className="text-[#edf5ea] text-sm">Tél. : {fiche.telephone}</p>}
              {fiche.email && <p className="text-[#edf5ea] text-sm">Email : {fiche.email}</p>}
              {fiche.niu && <p className="text-[#edf5ea] text-sm">NIU : {fiche.niu}</p>}
              {fiche.adresse && <p className="text-[#edf5ea] text-sm">{fiche.adresse}</p>}
            </div>

            {(fiche.soldeDu > 0 || fiche.soldeAPayer > 0) && (
              <div className="mx-4 mt-3 grid gap-3" style={{ gridTemplateColumns: fiche.soldeDu > 0 && fiche.soldeAPayer > 0 ? '1fr 1fr' : '1fr' }}>
                {fiche.soldeDu > 0 && (
                  <div className="bg-[#162419] rounded-2xl p-4 text-center border border-[#fbbf24]/20">
                    <p className="text-[#4a6b4a] text-xs">Nous doit</p>
                    <p className="text-[#fbbf24] font-mono font-bold text-lg mt-0.5">{fmt(fiche.soldeDu)}</p>
                  </div>
                )}
                {fiche.soldeAPayer > 0 && (
                  <div className="bg-[#162419] rounded-2xl p-4 text-center border border-[#f87171]/20">
                    <p className="text-[#4a6b4a] text-xs">On lui doit</p>
                    <p className="text-[#f87171] font-mono font-bold text-lg mt-0.5">{fmt(fiche.soldeAPayer)}</p>
                  </div>
                )}
              </div>
            )}

            <p className="text-[#4a6b4a] text-xs font-medium uppercase tracking-wide mx-4 mt-5 mb-2">Historique</p>
            {operations.length === 0 ? (
              <p className="text-[#4a6b4a] text-sm px-4">Aucune opération enregistrée.</p>
            ) : (
              <div className="mx-4 bg-[#162419] rounded-2xl overflow-hidden">
                {operations.map((o, i) => (
                  <OperationLigne key={`${o.type}-${o.id}`} entreprise={entreprise} operation={o}
                    dernier={i === operations.length - 1} onFait={recharger} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface Operation {
  type: 'vente' | 'facture' | 'achat';
  id: string; date: string; montant: number; statut: string; libelle: string; pieceCle: string | null;
}

/**
 * Une ligne de l'historique. Seuls les achats fournisseurs ont un contrôle « pièce » (scan de la
 * facture) — les ventes/factures n'ont pas d'endpoint dédié ici (voir Créances pour les ventes à
 * crédit) et les factures se régénèrent déjà en PDF à la demande.
 */
function OperationLigne({ entreprise, operation: o, dernier, onFait }: {
  entreprise: EntrepriseResume; operation: Operation; dernier: boolean; onFait: () => void;
}) {
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const pieceInputId = `piece-tiers-achat-${o.id}`;

  async function ajouterPiece(fichier: File) {
    setCharge(true); setErreur('');
    try {
      await televerserPieceAchat(entreprise.id, o.id, fichier);
      onFait();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }
  async function voirPiece() {
    try { window.open(await urlPieceAchat(entreprise.id, o.id), '_blank'); } catch { /* ignore */ }
  }
  async function retirerPiece() {
    if (!confirm('Retirer la pièce jointe de cet achat ?')) return;
    setCharge(true);
    try { await supprimerPieceAchat(entreprise.id, o.id); onFait(); } finally { setCharge(false); }
  }

  return (
    <div className={`px-4 py-3 ${dernier ? '' : 'border-b border-[#1e3222]'}`}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[#edf5ea] text-sm font-medium">{o.libelle}</p>
          <p className="text-[#4a6b4a] text-xs mt-0.5">{o.date ? new Date(o.date).toLocaleDateString('fr-FR') : '—'}</p>
        </div>
        {o.pieceCle && <IcoFile cls="w-4 h-4 text-[#b4e033] shrink-0" />}
        <div className="text-right shrink-0">
          <p className="text-[#edf5ea] font-mono font-semibold text-sm">{fmt(o.montant)}</p>
          <p className="text-[#4a6b4a] text-xs mt-0.5">{STATUT_LIBELLE[o.statut] ?? o.statut}</p>
        </div>
      </div>
      {o.type === 'achat' && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {o.pieceCle ? (
            <>
              <button onClick={voirPiece} className="bg-[#1e3222] text-[#edf5ea] rounded-xl px-3 py-1.5 text-xs font-medium border border-[#2a4230]">Voir la pièce</button>
              <button onClick={() => document.getElementById(pieceInputId)?.click()} disabled={charge}
                className="bg-[#1e3222] text-[#edf5ea] rounded-xl px-3 py-1.5 text-xs font-medium border border-[#2a4230] disabled:opacity-40">Remplacer</button>
              <button onClick={retirerPiece} disabled={charge}
                className="text-[#f87171] text-xs font-medium px-3 py-1.5 hover:bg-[#f87171]/8 rounded-xl transition-colors disabled:opacity-40">Retirer</button>
            </>
          ) : (
            <button onClick={() => document.getElementById(pieceInputId)?.click()} disabled={charge}
              className="bg-[#1e3222] text-[#b4e033] rounded-xl px-3 py-1.5 text-xs font-medium border border-[#b4e033]/20 disabled:opacity-40">
              {charge ? 'Envoi…' : 'Joindre la facture fournisseur'}
            </button>
          )}
          <input id={pieceInputId} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void ajouterPiece(f); e.target.value = ''; }} />
        </div>
      )}
      {erreur && <p className="text-[#f87171] text-xs mt-1">{erreur}</p>}
    </div>
  );
}
