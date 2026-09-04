/**
 * Tableau de bord — porté fidèlement du prototype Figma Make (docs/Interface application
 * gestion PME/src/App.tsx, fonction Dashboard) avec les vraies données Kombi à la place des
 * tableaux mock. Voir docs/parcours.md « Refonte design system ».
 */
import { useEffect, useState } from 'react';
import { formaterFCFA, peut, type RoleMembre } from '@kombi/shared';
import {
  api, statsJour, tendance7Jours, listerDepenses, listerFacturesImpayees, meilleuresVentes,
  depensesDuJour, soldesTresorerie, listerProduits, listerVentesRecentes, getCockpit,
  type EntrepriseResume, type MeilleureVente, type TresorerieJour, type FactureImpayee, type Cockpit,
} from '../lib/api.js';
import {
  IcoTrend, IcoWlt, IcoAlert, IcoCart, IcoFile, IcoUser, IcoBox, IcoChevR, IcoDn, IcoUp,
} from '../components/icons.js';
import { Avatar } from '../components/icons.js';
import { DashboardIllustration, SalesAreaChart, CashFlowRing, MODE_PAIEMENT_LABEL, MODE_PAIEMENT_COULEUR } from '../components/charts.js';

interface IgsResp {
  caCumule: number;
  regime: string;
  igs: { igsAnnuel: number; classe: number } | null;
}

function fmt(n: number) { return formaterFCFA(n); }

export function Dashboard({ entreprise, onCaisse, onNav }: {
  entreprise: EntrepriseResume; onCaisse?: () => void; onNav?: (code: string) => void;
}) {
  const [igs, setIgs] = useState<IgsResp | null>(null);
  const [jour, setJour] = useState<{ nbVentes: number; totalJour: number } | null>(null);
  const [tendance, setTendance] = useState<{ jour: string; total: number }[] | null>(null);
  const [top, setTop] = useState<MeilleureVente[] | null>(null);
  const [depensesJour, setDepensesJour] = useState<number | null>(null);
  const [alertesStockListe, setAlertesStockListe] = useState<{ nom: string; stock: number; seuil: number; rupture: boolean }[] | null>(null);
  const [tresorerie, setTresorerie] = useState<TresorerieJour | null>(null);
  const [cockpit, setCockpit] = useState<Cockpit | null>(null);
  const [facturesImpayees, setFacturesImpayees] = useState<FactureImpayee[] | null>(null);
  const [mouvements, setMouvements] = useState<{ id: string; libelle: string; montant: number; sens: 'in' | 'out'; date: string; mode: string; client: string | null }[] | null>(null);
  const [erreur, setErreur] = useState('');
  const role = entreprise.role as RoleMembre;
  const voitCompta = peut(role, 'compta:read');
  const voitDepenses = peut(role, 'depense:read');
  const voitCreances = peut(role, 'vente:read') || peut(role, 'facture:read');
  const voitVentes = peut(role, 'vente:read');
  const voitStock = entreprise.secteur !== 'service' && peut(role, 'stock:read');

  useEffect(() => {
    if (voitCompta) {
      api<IgsResp>('/api/fiscalite/igs', { entrepriseId: entreprise.id })
        .then(setIgs)
        .catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
    }
    statsJour(entreprise.id).then(setJour).catch(() => {});
    tendance7Jours(entreprise.id).then(setTendance).catch(() => {});
    if (voitCreances) listerFacturesImpayees(entreprise.id).then(setFacturesImpayees).catch(() => {});
    if (voitCompta) soldesTresorerie(entreprise.id).then(setTresorerie).catch(() => {});
    if (voitCompta) getCockpit(entreprise.id).then(setCockpit).catch(() => {});
    if (voitVentes) meilleuresVentes(entreprise.id).then(setTop).catch(() => {});
    if (voitDepenses) depensesDuJour(entreprise.id).then(setDepensesJour).catch(() => {});
    if (voitStock) {
      listerProduits(entreprise.id)
        .then((ps) => setAlertesStockListe(
          ps.filter((p) => p.en_alerte === 1)
            .map((p) => ({ nom: p.nom, stock: p.stock_actuel, seuil: p.seuil_alerte, rupture: p.en_rupture === 1 })),
        ))
        .catch(() => {});
    }
    if (voitVentes) {
      Promise.all([
        listerVentesRecentes(entreprise.id).catch(() => []),
        voitDepenses ? listerDepenses(entreprise.id).catch(() => []) : Promise.resolve([]),
      ]).then(([ventes, depenses]) => {
        // Une vente à crédit (mode_paiement null) n'est pas un encaissement à sa date de création —
        // seul son règlement (payerVente, non listé ici) en est un. L'exclure pour ne pas laisser
        // croire qu'un montant a été encaissé en espèces alors qu'il reste dû.
        const v = ventes.filter((x) => x.statut !== 'annulee' && x.mode_paiement).map((x) => ({
          id: x.id, libelle: x.tiers_nom ?? 'Vente au comptant', montant: x.total_ttc,
          sens: 'in' as const, date: x.date, mode: x.mode_paiement!, client: x.tiers_nom,
        }));
        const d = depenses.map((x) => ({
          id: x.id, libelle: x.libelle, montant: x.montant, sens: 'out' as const,
          date: x.date, mode: x.mode_paiement, client: null,
        }));
        setMouvements([...v, ...d].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5));
      });
    }
  }, [entreprise.id, voitCompta, voitDepenses, voitCreances, voitVentes, voitStock]);

  const regimeIgs = entreprise.regime_fiscal === 'igs';
  const nomUtilisateur = entreprise.raison_sociale;
  const dateAujourdhui = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const facturesEnRetard = (facturesImpayees ?? []).filter((f) => f.enRetard);
  const totalImpayees = (facturesImpayees ?? []).reduce((s, f) => s + f.montantDu, 0);
  const tresorerieTotal = tresorerie ? tresorerie.especes + tresorerie.mtnMomo + tresorerie.orangeMoney + tresorerie.banque : 0;

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="pb-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <Avatar name={nomUtilisateur} size="sm" />
            <p className="text-[#6b9165] text-sm font-medium">Bonjour 👋</p>
          </div>
          <h1 className="text-[#edf5ea] text-2xl font-semibold">{entreprise.raison_sociale}</h1>
          <p className="text-[#4a6b4a] text-xs mt-1 capitalize">{dateAujourdhui}</p>
        </div>
        <div className="shrink-0 opacity-90 hidden sm:block">
          <DashboardIllustration />
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="bg-[#162419] rounded-2xl overflow-hidden">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#6b9165] text-xs font-medium uppercase tracking-wide">Ventes du jour</span>
              <div className="w-8 h-8 rounded-full bg-[#b4e033]/10 flex items-center justify-center text-[#b4e033]"><IcoTrend /></div>
            </div>
            <p className="text-[#edf5ea] text-2xl font-mono font-semibold">{jour ? fmt(jour.totalJour) : '—'}</p>
          </div>
          <div className="bg-[#1e3222] px-4 py-2">
            <span className="text-[#6b9165] text-xs">{jour ? `${jour.nbVentes} vente${jour.nbVentes > 1 ? 's' : ''}` : '…'}</span>
          </div>
        </div>

        {voitCompta && (
          <div className="bg-[#162419] rounded-2xl overflow-hidden border border-[#b4e033]/20">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[#6b9165] text-xs font-medium uppercase tracking-wide">Trésorerie</span>
                <div className="w-8 h-8 rounded-full bg-[#b4e033]/10 flex items-center justify-center text-[#b4e033]"><IcoWlt /></div>
              </div>
              <p className="text-[#b4e033] text-2xl font-mono font-semibold">{tresorerie ? fmt(tresorerieTotal) : '—'}</p>
            </div>
            <div className="bg-[#1e3222] px-4 py-2">
              <span className="text-[#6b9165] text-xs">Disponible aujourd'hui</span>
            </div>
          </div>
        )}

        {voitCreances && (
          <button onClick={onNav ? () => onNav('tresorerie') : undefined} className="text-left bg-[#162419] rounded-2xl overflow-hidden">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[#6b9165] text-xs font-medium uppercase tracking-wide">Factures impayées</span>
                <div className="w-8 h-8 rounded-full bg-[#f87171]/10 flex items-center justify-center text-[#f87171]"><IcoAlert /></div>
              </div>
              <p className="text-[#f87171] text-2xl font-mono font-semibold">{facturesImpayees ? fmt(totalImpayees) : '—'}</p>
            </div>
            <div className="bg-[#1e3222] px-4 py-2">
              <span className="text-[#4a6b4a] text-xs">
                {facturesImpayees ? `${facturesImpayees.length} facture${facturesImpayees.length > 1 ? 's' : ''}${facturesEnRetard.length > 0 ? ` · dont ${facturesEnRetard.length} en retard` : ''}` : '…'}
              </span>
            </div>
          </button>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mt-4">
        <p className="text-[#4a6b4a] text-xs font-medium uppercase tracking-wide mb-2">Actions rapides</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <button onClick={onCaisse}
            className="bg-[#b4e033] text-[#0e1c0f] rounded-2xl p-4 flex items-center gap-3 active:scale-95 transition-all">
            <div className="w-9 h-9 rounded-full bg-[#0e1c0f]/15 flex items-center justify-center shrink-0"><IcoCart /></div>
            <span className="text-sm font-semibold text-left leading-tight">Nouvelle vente</span>
          </button>
          {peut(role, 'facture:manage') && (
            <button onClick={onNav ? () => onNav('factures') : undefined}
              className="bg-[#1e3222] text-[#edf5ea] rounded-2xl p-4 flex items-center gap-3 active:scale-95 transition-all border border-[#2a4230]">
              <div className="w-9 h-9 rounded-full bg-[#2a4230] flex items-center justify-center shrink-0"><IcoFile /></div>
              <span className="text-sm font-medium text-left leading-tight">Nouvelle facture</span>
            </button>
          )}
          {peut(role, 'tiers:read') && (
            <button onClick={onNav ? () => onNav('tiers') : undefined}
              className="bg-[#1e3222] text-[#edf5ea] rounded-2xl p-4 flex items-center gap-3 active:scale-95 transition-all border border-[#2a4230]">
              <div className="w-9 h-9 rounded-full bg-[#2a4230] flex items-center justify-center shrink-0"><IcoUser /></div>
              <span className="text-sm font-medium text-left leading-tight">Clients &amp; Fourns.</span>
            </button>
          )}
          {voitStock && (
            <button onClick={onNav ? () => onNav('stock') : undefined}
              className="bg-[#1e3222] text-[#edf5ea] rounded-2xl p-4 flex items-center gap-3 active:scale-95 transition-all border border-[#2a4230]">
              <div className="w-9 h-9 rounded-full bg-[#2a4230] flex items-center justify-center shrink-0"><IcoBox /></div>
              <span className="text-sm font-medium text-left leading-tight">Saisie stock</span>
            </button>
          )}
        </div>
      </div>

      {/* Fiscal card */}
      {voitCompta && igs && (
        <div className="mt-4">
          <button onClick={onNav ? () => onNav('compta') : undefined}
            className="w-full bg-[#162419] rounded-2xl overflow-hidden text-left border border-[#fbbf24]/15 active:scale-[0.99] transition-transform">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[#6b9165] text-xs font-medium uppercase tracking-wide">
                  {regimeIgs ? 'IGS estimé' : 'Régime fiscal'}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${regimeIgs ? 'bg-[#fbbf24]/10 text-[#fbbf24]' : 'bg-[#60a5fa]/10 text-[#60a5fa]'}`}>
                    {regimeIgs ? `Classe ${igs.igs?.classe ?? '—'}` : 'Régime réel'}
                  </span>
                  <IcoChevR cls="w-4 h-4 text-[#4a6b4a]" />
                </div>
              </div>
              <p className="text-[#fbbf24] text-2xl font-mono font-semibold">
                {regimeIgs ? fmt(igs.igs?.igsAnnuel ?? 0) : '—'}
              </p>
            </div>
            <div className="bg-[#1e3222] px-4 py-2">
              <span className="text-[#4a6b4a] text-xs">
                CA cumulé : <span className="text-[#6b9165] font-mono font-medium">{fmt(igs.caCumule)}</span>
                {regimeIgs && ' · Déclaration avant le 15 avr.'}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Ce mois-ci vs le mois dernier */}
      {voitCompta && cockpit && (
        <div className="mt-4 bg-[#162419] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[#edf5ea] font-semibold text-sm">Ce mois-ci vs le mois dernier</h3>
            {onNav && (
              <button onClick={() => onNav('rentabilite')} className="text-[#b4e033] text-xs font-medium flex items-center gap-0.5">
                Par produit <IcoChevR cls="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Variation label="CA" valeur={cockpit.comparaisonMensuelle.moisCourant.ca} pct={cockpit.comparaisonMensuelle.variationCaPct} favorableSiHausse />
            <Variation label="Marge" valeur={cockpit.comparaisonMensuelle.moisCourant.marge} pct={cockpit.comparaisonMensuelle.variationMargePct} favorableSiHausse />
            <Variation label="Dépenses" valeur={cockpit.comparaisonMensuelle.moisCourant.depenses} pct={cockpit.comparaisonMensuelle.variationDepensesPct} favorableSiHausse={false} />
          </div>
          {(cockpit.comparaisonMensuelle.topVariationsDepenses.some((v) => v.deltaMontant !== 0) || cockpit.delaiMoyenPaiement.jours !== null) && (
            <p className="text-[#4a6b4a] text-xs mt-3 leading-relaxed">
              {cockpit.comparaisonMensuelle.topVariationsDepenses
                .filter((v) => v.deltaMontant !== 0)
                .slice(0, 2)
                .map((v) => `${v.libelle} ${v.deltaMontant > 0 ? '+' : '−'}${fmt(Math.abs(v.deltaMontant))}`)
                .join(' · ')}
              {cockpit.delaiMoyenPaiement.jours !== null && (
                <>
                  {cockpit.comparaisonMensuelle.topVariationsDepenses.some((v) => v.deltaMontant !== 0) && ' · '}
                  Délai moyen de paiement : {cockpit.delaiMoyenPaiement.jours} j
                </>
              )}
            </p>
          )}
        </div>
      )}

      {/* À surveiller — alertes de pilotage (dettes en retard, dépenses inhabituelles, ventes à perte) */}
      {voitCompta && cockpit && cockpit.alertes.filter((a) => a.type !== 'creance').length > 0 && (
        <div className="mt-4">
          <p className="text-[#4a6b4a] text-xs font-medium uppercase tracking-wide mb-2">À surveiller</p>
          <div className="space-y-2">
            {cockpit.alertes.filter((a) => a.type !== 'creance').map((a, i) => {
              const critique = a.gravite === 'critique';
              const color = critique ? '#f87171' : '#fbbf24';
              return (
                <div key={i} className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{ background: `${color}0d`, border: `1px solid ${color}33` }}>
                  <IcoAlert cls={`w-4 h-4 shrink-0 ${critique ? 'text-[#f87171]' : 'text-[#fbbf24]'}`} />
                  <p className="text-[#edf5ea] text-sm flex-1 min-w-0">{a.libelle}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="mt-4 flex gap-3 items-stretch">
        <div className="flex-1 min-w-0 bg-[#162419] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-[#edf5ea] font-semibold text-sm">Ventes — 7 jours</h3>
              <p className="text-[#4a6b4a] text-xs mt-0.5">{tendance ? fmt(tendance.reduce((a, b) => a + b.total, 0)) : '…'}</p>
            </div>
            {onNav && (
              <button onClick={() => onNav('tresorerie')} className="text-[#b4e033] text-xs font-medium flex items-center gap-0.5">
                Détails <IcoChevR cls="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {tendance && tendance.length > 0 ? (
            <SalesAreaChart
              data={tendance.map((t) => t.total)}
              days={tendance.map((t) => new Date(t.jour + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''))}
            />
          ) : <p className="text-[#4a6b4a] text-xs py-8 text-center">Pas encore de données.</p>}
        </div>
        {voitCompta && jour && (
          <div className="w-36 shrink-0 bg-[#162419] rounded-2xl p-3.5">
            <CashFlowRing totalIn={jour.totalJour} totalOut={depensesJour ?? 0} />
          </div>
        )}
      </div>

      {/* Alerts */}
      {((alertesStockListe && alertesStockListe.length > 0) || facturesEnRetard.length > 0) && (
        <div className="mt-4">
          <p className="text-[#4a6b4a] text-xs font-medium uppercase tracking-wide mb-2">Alertes</p>
          <div className="space-y-2">
            {(alertesStockListe ?? []).map((p) => {
              const color = p.rupture ? '#f87171' : '#fbbf24';
              const label = p.rupture ? 'rupture de stock' : 'stock bas';
              return (
                <div key={p.nom} className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{ background: `${color}0d`, border: `1px solid ${color}33` }}>
                  <IcoAlert cls={`w-4 h-4 shrink-0 ${p.rupture ? 'text-[#f87171]' : 'text-[#fbbf24]'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[#edf5ea] text-sm font-medium">{p.nom} — {label}</p>
                    <p className="text-[#4a6b4a] text-xs">{p.stock} restant{p.stock !== 1 ? 's' : ''} · seuil : {p.seuil}</p>
                  </div>
                  {onNav && <button onClick={() => onNav('stock')} className={`text-xs font-semibold shrink-0 ${p.rupture ? 'text-[#f87171]' : 'text-[#fbbf24]'}`}>Gérer →</button>}
                </div>
              );
            })}
            {facturesEnRetard.map((f) => (
              <div key={f.id} className="bg-[#f87171]/5 border border-[#f87171]/20 rounded-xl px-4 py-3 flex items-center gap-3">
                <IcoAlert cls="w-4 h-4 text-[#f87171] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[#edf5ea] text-sm font-medium">{f.numero} — en retard</p>
                  <p className="text-[#4a6b4a] text-xs">{f.tiers_nom ?? '—'} · {fmt(f.montantDu)}</p>
                </div>
                {onNav && <button onClick={() => onNav('factures')} className="text-[#f87171] text-xs font-semibold shrink-0">Voir →</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meilleures ventes */}
      {voitVentes && top !== null && top.length > 0 && (
        <div className="mt-4 bg-[#162419] rounded-2xl p-4">
          <h3 className="text-[#edf5ea] font-semibold text-sm mb-3">Meilleures ventes</h3>
          <div className="space-y-2">
            {top.map((t, i) => (
              <div key={t.designation} className="flex items-center gap-2.5">
                <span className="text-[#4a6b4a] text-xs w-4">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate text-[#edf5ea] text-sm">{t.designation}</span>
                <span className="text-[#4a6b4a] text-xs">×{t.quantite}</span>
                <span className="text-[#edf5ea] text-sm font-mono font-semibold">{fmt(t.montant_ht)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      {mouvements && mouvements.length > 0 && (
        <div className="mt-4 mb-24 md:mb-8">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[#4a6b4a] text-xs font-medium uppercase tracking-wide">Derniers mouvements</p>
          </div>
          <div className="bg-[#162419] rounded-2xl overflow-hidden">
            {mouvements.map((m, i) => (
              <div key={m.id} className={`flex items-center gap-3 px-4 py-3.5 ${i < mouvements.length - 1 ? 'border-b border-[#1e3222]' : ''}`}>
                {m.client
                  ? <Avatar name={m.client} size="sm" />
                  : (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.sens === 'in' ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-[#f87171]/10 text-[#f87171]'}`}>
                      {m.sens === 'in' ? <IcoDn cls="w-4 h-4" /> : <IcoUp cls="w-4 h-4" />}
                    </div>
                  )}
                <div className="flex-1 min-w-0">
                  <p className="text-[#edf5ea] text-sm font-medium truncate">{m.libelle}</p>
                  <p className="text-[#4a6b4a] text-xs">
                    {new Date(m.date).toLocaleDateString('fr-FR')} · <span className={MODE_PAIEMENT_COULEUR[m.mode] ?? 'text-[#6b9165]'}>{MODE_PAIEMENT_LABEL[m.mode] ?? m.mode}</span>
                  </p>
                </div>
                <span className={`font-mono text-sm font-semibold shrink-0 ${m.sens === 'in' ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                  {m.sens === 'in' ? '+' : '−'}{fmt(m.montant)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {erreur && <p className="text-[#f87171] text-xs mt-3">{erreur}</p>}
    </div>
  );
}

/**
 * Une valeur + sa variation vs le mois précédent. `favorableSiHausse` détermine la couleur : une
 * hausse est bonne pour le CA/la marge, mauvaise pour les dépenses.
 */
function Variation({ label, valeur, pct, favorableSiHausse }: {
  label: string; valeur: number; pct: number | null; favorableSiHausse: boolean;
}) {
  const hausse = pct !== null && pct > 0;
  const baisse = pct !== null && pct < 0;
  const favorable = pct === null ? null : favorableSiHausse ? hausse : baisse;
  const couleur = favorable === null ? 'text-[#6b9165]' : favorable ? 'text-[#4ade80]' : 'text-[#f87171]';
  return (
    <div className="bg-[#1e3222] rounded-xl p-3">
      <p className="text-[#4a6b4a] text-[10px] uppercase tracking-wide font-medium">{label}</p>
      <p className="text-[#edf5ea] font-mono font-semibold text-sm mt-1">{fmt(valeur)}</p>
      <p className={`text-xs font-medium mt-0.5 ${couleur}`}>
        {pct === null ? '—' : `${pct > 0 ? '+' : ''}${pct} %`}
      </p>
    </div>
  );
}
