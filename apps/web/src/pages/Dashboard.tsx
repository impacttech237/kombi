/**
 * Tableau de bord « Cockpit » — maquette validée (2025-09).
 * Répond aux 5 questions d'un dirigeant de PME : combien j'ai (trésorerie ventilée), est-ce que
 * je gagne (CA + marge + résultat vs mois dernier), vais-je manquer de cash (prévision 30 j),
 * qui me doit / je dois (créances vs dettes), quoi décider aujourd'hui (« À décider »).
 * Design system .k-* (theme.css). Icônes SVG uniquement — aucun émoji.
 */
import { useEffect, useState } from 'react';
import { formaterFCFA, peut, type RoleMembre } from '@kombi/shared';
import {
  api, statsJour, tendance7Jours, listerDepenses, listerFacturesImpayees, meilleuresVentes,
  soldesTresorerie, listerProduits, listerVentesRecentes, getCockpit, listerDecisions,
  listerVentesACredit, listerDettesFournisseurs, previsionTresorerie, getBudget,
  type EntrepriseResume, type TresorerieJour, type FactureImpayee, type Cockpit, type Decision,
  type PrevisionTresorerie,
} from '../lib/api.js';
import {
  IcoAlert, IcoCart, IcoFile, IcoBox, IcoChevR, IcoDn, IcoUp, IcoTrendDown, IcoUser, Avatar,
} from '../components/icons.js';

interface IgsResp { caCumule: number; regime: string; igs: { igsAnnuel: number; classe: number } | null }

/** Nombre formaté sans suffixe (le « FCFA » est rendu à part, plus petit et grisé). */
const n0 = (n: number) => Math.round(n).toLocaleString('fr-FR');
const fmt = (n: number) => formaterFCFA(n);
/** Abrégé compact : 8,2 M / 640 k / 900. */
function abr(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} M`;
  if (a >= 1_000) return `${Math.round(n / 1000)} k`;
  return String(Math.round(n));
}

const MODE_LABEL: Record<string, string> = {
  especes: 'Espèces', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', virement: 'Virement', cheque: 'Chèque', autre: 'Autre',
};

export function Dashboard({ entreprise, nomUtilisateur, onCaisse, onNav }: {
  entreprise: EntrepriseResume; nomUtilisateur?: string; onCaisse?: () => void; onNav?: (code: string) => void;
}) {
  const [igs, setIgs] = useState<IgsResp | null>(null);
  const [jour, setJour] = useState<{ nbVentes: number; totalJour: number } | null>(null);
  const [tendance, setTendance] = useState<{ jour: string; total: number }[] | null>(null);
  const [top, setTop] = useState<{ designation: string; quantite: number; montant_ht: number }[] | null>(null);
  const [tresorerie, setTresorerie] = useState<TresorerieJour | null>(null);
  const [cockpit, setCockpit] = useState<Cockpit | null>(null);
  const [facturesImpayees, setFacturesImpayees] = useState<FactureImpayee[] | null>(null);
  const [decisions, setDecisions] = useState<Decision[] | null>(null);
  const [prevision, setPrevision] = useState<PrevisionTresorerie | null>(null);
  const [plafond, setPlafond] = useState<number | null>(null);
  const [creanceCredit, setCreanceCredit] = useState<{ du: number; retards: number; clients: number } | null>(null);
  const [dette, setDette] = useState<{ du: number; retards: number; fournisseurs: number } | null>(null);
  const [stockAlertes, setStockAlertes] = useState<{ nom: string; stock: number; seuil: number; rupture: boolean }[] | null>(null);
  const [mouvements, setMouvements] = useState<{ id: string; libelle: string; montant: number; sens: 'in' | 'out'; date: string; mode: string; client: string | null }[] | null>(null);
  const [erreur, setErreur] = useState('');

  const role = entreprise.role as RoleMembre;
  const voitCompta = peut(role, 'compta:read');
  const voitDepenses = peut(role, 'depense:read');
  const voitCreances = peut(role, 'vente:read') || peut(role, 'facture:read');
  const voitVentes = peut(role, 'vente:read');
  const voitStock = entreprise.secteur !== 'service' && peut(role, 'stock:read');
  const voitDecisions = peut(role, 'decision:read');
  const voitBudget = peut(role, 'budget:read');

  useEffect(() => {
    const moisCourant = new Date().toISOString().slice(0, 7);
    statsJour(entreprise.id).then(setJour).catch(() => {});
    tendance7Jours(entreprise.id).then(setTendance).catch(() => {});
    if (voitCompta) {
      api<IgsResp>('/api/fiscalite/igs', { entrepriseId: entreprise.id }).then(setIgs).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
      soldesTresorerie(entreprise.id).then(setTresorerie).catch(() => {});
      getCockpit(entreprise.id).then(setCockpit).catch(() => {});
      previsionTresorerie(entreprise.id, 30).then(setPrevision).catch(() => {});
    }
    if (voitBudget) getBudget(entreprise.id, moisCourant).then((b) => setPlafond(b?.plafond_depenses ?? null)).catch(() => {});
    if (voitDecisions) listerDecisions(entreprise.id).then(setDecisions).catch(() => {});
    if (voitVentes) meilleuresVentes(entreprise.id).then(setTop).catch(() => {});
    if (voitCreances) {
      listerFacturesImpayees(entreprise.id).then(setFacturesImpayees).catch(() => {});
      listerVentesACredit(entreprise.id).then((vs) => setCreanceCredit({
        du: vs.reduce((s, v) => s + (v.total_ttc - v.regle), 0),
        retards: vs.filter((v) => v.enRetard).length,
        clients: new Set(vs.map((v) => v.tiers_nom)).size,
      })).catch(() => {});
    }
    if (peut(role, 'achat:read')) {
      listerDettesFournisseurs(entreprise.id).then((ds) => setDette({
        du: ds.reduce((s, d) => s + (d.total_ttc - d.regle), 0),
        retards: ds.filter((d) => d.enRetard).length,
        fournisseurs: new Set(ds.map((d) => d.tiers_nom)).size,
      })).catch(() => {});
    }
    if (voitStock) {
      listerProduits(entreprise.id).then((ps) => setStockAlertes(
        ps.filter((p) => p.en_alerte === 1).map((p) => ({ nom: p.nom, stock: p.stock_actuel, seuil: p.seuil_alerte, rupture: p.en_rupture === 1 })),
      )).catch(() => {});
    }
    if (voitVentes) {
      Promise.all([
        listerVentesRecentes(entreprise.id).catch(() => []),
        voitDepenses ? listerDepenses(entreprise.id).catch(() => []) : Promise.resolve([]),
      ]).then(([ventes, depenses]) => {
        const v = ventes.filter((x) => x.statut !== 'annulee' && x.mode_paiement).map((x) => ({
          id: x.id, libelle: x.tiers_nom ?? 'Vente au comptant', montant: x.total_ttc,
          sens: 'in' as const, date: x.date, mode: x.mode_paiement!, client: x.tiers_nom,
        }));
        const d = depenses.map((x) => ({ id: x.id, libelle: x.libelle, montant: x.montant, sens: 'out' as const, date: x.date, mode: x.mode_paiement, client: null }));
        setMouvements([...v, ...d].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6));
      });
    }
  }, [entreprise.id, voitCompta, voitDepenses, voitCreances, voitVentes, voitStock, voitDecisions, voitBudget, role]);

  const prenom = ((nomUtilisateur || entreprise.raison_sociale).trim().split(' ')[0]) || 'là';
  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const regimeIgs = entreprise.regime_fiscal === 'igs';

  const tresTotal = tresorerie ? tresorerie.especes + tresorerie.mtnMomo + tresorerie.orangeMoney + tresorerie.banque : 0;
  const cm = cockpit?.comparaisonMensuelle.moisCourant;
  const ca = cm?.ca ?? 0;
  const marge = cm?.marge ?? 0;
  const depensesMois = cm?.depenses ?? 0;
  const resultat = cm?.resultat ?? 0;
  const tauxMarge = ca > 0 ? Math.round((marge / ca) * 100) : 0;
  const variationCa = cockpit?.comparaisonMensuelle.variationCaPct ?? null;
  const totalImpayees = (facturesImpayees ?? []).reduce((s, f) => s + f.montantDu, 0);
  const facturesRetard = (facturesImpayees ?? []).filter((f) => f.enRetard).length;
  const onMeDoit = totalImpayees + (creanceCredit?.du ?? 0);
  const retardsCreance = facturesRetard + (creanceCredit?.retards ?? 0);
  const pctBudget = plafond && plafond > 0 ? Math.round((depensesMois / plafond) * 100) : null;
  const topCats = (cockpit?.comparaisonMensuelle.topVariationsDepenses ?? []).filter((c) => c.moisCourant > 0).slice(0, 3);
  const gaugeR = 56, gaugeC = 2 * Math.PI * gaugeR;

  return (
    <div className="k-dash">
      {/* En-tête */}
      <div className="k-dashtop sp12">
        <div>
          <h1>Bonjour {prenom}</h1>
          <p>Voici où en est <b>{entreprise.raison_sociale}</b> — <span style={{ textTransform: 'capitalize' }}>{dateStr}</span></p>
        </div>
        <div className="k-who">
          <div><div className="n">{entreprise.raison_sociale}</div><div className="e" style={{ textTransform: 'capitalize' }}>{role}</div></div>
          <Avatar name={entreprise.raison_sociale} size="sm" />
        </div>
      </div>

      {/* Bandeau à décider */}
      {voitDecisions && decisions && decisions.length > 0 && (
        <button className="k-decide sp12" onClick={() => onNav?.('a-decider')}>
          <span className="ic"><IcoAlert /></span>
          <div style={{ minWidth: 0 }}>
            <div className="t">{decisions.length} chose{decisions.length > 1 ? 's' : ''} à décider aujourd'hui</div>
            <div className="s" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              La plus urgente : {decisions[0]!.probleme} — {fmt(decisions[0]!.impactFinancier)}
            </div>
          </div>
          <span className="go">Ouvrir <IcoChevR cls="w-3.5 h-3.5" /></span>
        </button>
      )}

      {/* KPI 1 — Trésorerie disponible */}
      {voitCompta && (
        <section className="k-card sp5">
          <div className="k-card__hd">
            <h3>Trésorerie disponible</h3>
            <span className={`k-chip ${tresTotal >= 0 ? 'up' : 'dn'}`}>{tresTotal >= 0 ? 'Disponible' : 'Découvert'}</span>
          </div>
          <div className="k-label">Ce que vous avez, maintenant</div>
          <div className="k-big k-num" style={{ margin: '8px 0 18px', color: tresTotal < 0 ? 'var(--k-danger)' : 'var(--k-ink)' }}>
            {n0(tresTotal)}<span className="k-cur"> FCFA</span>
          </div>
          <div className="k-tres">
            {[
              { k: 'Espèces (caisse)', v: tresorerie?.especes ?? 0, c: 'var(--k-forest)' },
              { k: 'MTN MoMo', v: tresorerie?.mtnMomo ?? 0, c: 'var(--k-lime-deep)' },
              { k: 'Orange Money', v: tresorerie?.orangeMoney ?? 0, c: 'var(--k-warn)' },
              { k: 'Banque', v: tresorerie?.banque ?? 0, c: 'var(--k-sky)' },
            ].map((t) => (
              <div className="t" key={t.k}>
                <div className="k"><span className="dot" style={{ background: t.c }} />{t.k}</div>
                <div className="v">{n0(t.v)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* KPI 2 — Chiffre d'affaires du mois */}
      {voitCompta && (
        <section className="k-card sp4" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="k-card__hd"><h3>Chiffre d'affaires</h3><span className="k-chip soft" style={{ textTransform: 'capitalize' }}>{new Date().toLocaleDateString('fr-FR', { month: 'long' })}</span></div>
          <div className="k-label">Ventes du mois</div>
          <div className="k-big k-num" style={{ marginTop: 8 }}>{abr(ca)}<span className="k-cur"> FCFA</span></div>
          {variationCa !== null && (
            <div style={{ marginTop: 10 }}><span className={`k-chip ${variationCa >= 0 ? 'up' : 'dn'}`}>{variationCa >= 0 ? '▲' : '▼'} {variationCa > 0 ? '+' : ''}{variationCa} % vs mois dernier</span></div>
          )}
          <div className="k-split" style={{ marginTop: 'auto' }}>
            <div><div className="k">Marge</div><div className="v">{abr(marge)}</div></div>
            <div><div className="k">Taux</div><div className="v">{tauxMarge} %</div></div>
            <div><div className="k">Ventes/j</div><div className="v">{jour?.nbVentes ?? 0}</div></div>
          </div>
        </section>
      )}

      {/* KPI 3 — Résultat & marge (jauge) */}
      {voitCompta && (
        <section className="k-card sp3">
          <div className="k-card__hd"><h3>Résultat du mois</h3></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="k-gauge">
              <svg width="132" height="132" viewBox="0 0 132 132">
                <circle cx="66" cy="66" r={gaugeR} fill="none" stroke="var(--k-surface-soft)" strokeWidth="14" />
                <circle cx="66" cy="66" r={gaugeR} fill="none" stroke="var(--k-lime)" strokeWidth="14" strokeLinecap="round"
                  strokeDasharray={gaugeC}
                  style={{ strokeDashoffset: gaugeC * (1 - Math.min(100, Math.max(0, tauxMarge)) / 100), transition: 'stroke-dashoffset .6s ease' }}
                  transform="rotate(-90 66 66)" />
              </svg>
              <div className="c"><b>{tauxMarge} %</b><span>marge</span></div>
            </div>
            <div className="k-goal">
              <div className="row"><span className="k">Marge brute</span><span className="v">{abr(marge)}</span></div>
              <div className="row"><span className="k">Dépenses</span><span className="v">{abr(depensesMois)}</span></div>
              <div className="row"><span className="k" style={{ color: 'var(--k-ink)', fontWeight: 700 }}>Résultat net</span><span className="v" style={{ color: resultat >= 0 ? 'var(--k-ok)' : 'var(--k-danger)', fontWeight: 700 }}>{resultat >= 0 ? '+' : ''}{n0(resultat)}</span></div>
            </div>
          </div>
        </section>
      )}

      {/* Actions rapides */}
      <div className="sp12">
        <p className="k-label" style={{ textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 11, fontWeight: 600, marginBottom: 10 }}>Actions rapides</p>
        <div className="k-quick">
          {peut(role, 'vente:create') && (
            <button className="primary" onClick={onCaisse}><span className="qic"><IcoCart /></span>Nouvelle vente</button>
          )}
          {peut(role, 'facture:manage') && (
            <button onClick={() => onNav?.('factures')}><span className="qic"><IcoFile /></span>Nouvelle facture</button>
          )}
          {voitDepenses && (
            <button onClick={() => onNav?.('depenses')}><span className="qic"><IcoTrendDown /></span>Nouvelle dépense</button>
          )}
          {voitStock && (
            <button onClick={() => onNav?.('stock')}><span className="qic"><IcoBox /></span>Saisie stock</button>
          )}
          {peut(role, 'tiers:read') && (
            <button onClick={() => onNav?.('tiers')}><span className="qic"><IcoUser /></span>Clients &amp; fourn.</button>
          )}
        </div>
      </div>

      {/* Flux — entrées 7 derniers jours */}
      <section className="k-card sp8">
        <div className="k-card__hd">
          <h3>Entrées — 7 derniers jours</h3>
          <div className="k-legend"><span><i style={{ background: 'var(--k-forest)' }} />Encaissements</span></div>
        </div>
        {tendance && tendance.length > 0 ? (
          (() => {
            const max = Math.max(1, ...tendance.map((t) => t.total));
            return (
              <div className="k-flow">
                {tendance.map((t, i) => (
                  <div className={`col${i === tendance.length - 1 ? ' hi' : ''}`} key={t.jour}>
                    <div className="stack"><div className="seg in" style={{ height: `${Math.max(4, (t.total / max) * 100)}%` }} /></div>
                    <span className="m">{new Date(`${t.jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</span>
                  </div>
                ))}
              </div>
            );
          })()
        ) : <p className="k-empty">Pas encore de ventes cette semaine.</p>}
      </section>

      {/* Budget du mois */}
      {voitBudget && (
        <section className="k-card sp4">
          <div className="k-card__hd"><h3>Budget du mois</h3>{onNav && <button className="k-chip soft" style={{ border: 0, cursor: 'pointer' }} onClick={() => onNav('compta')}>Régler</button>}</div>
          {pctBudget !== null ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div className="k-big k-num" style={{ color: pctBudget > 100 ? 'var(--k-danger)' : 'var(--k-ink)' }}>{pctBudget}<span className="k-dec">%</span></div>
                <span className="k-label">du plafond<br />{abr(depensesMois)} / {abr(plafond!)} FCFA</span>
              </div>
              {topCats.length > 0 && (
                <div className="k-budg" style={{ marginTop: 16 }}>
                  {topCats.map((c, i) => (
                    <div className={`b b${i + 1}`} key={c.categorie}>
                      <div className="k">{c.libelle}</div>
                      <div><div className="p">{abr(c.moisCourant)}</div><div className="foot">ce mois</div></div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '18px 0' }}>
              <p className="k-label" style={{ lineHeight: 1.5 }}>Aucun plafond de dépenses défini pour ce mois.</p>
              {onNav && <button className="k-btn ghost" style={{ marginTop: 12 }} onClick={() => onNav('compta')}>Définir un budget</button>}
            </div>
          )}
        </section>
      )}

      {/* À décider */}
      {voitDecisions && decisions && decisions.length > 0 && (
        <section className="k-card sp7">
          <div className="k-card__hd"><h3>À décider aujourd'hui</h3><span className="k-chip soft">Trié par impact</span></div>
          <div className="k-dlist">
            {decisions.slice(0, 3).map((d, i) => (
              <div className={`k-di ${d.urgence === 'haute' ? 'u-crit' : 'u-warn'}`} key={i}>
                <span className="ic"><IcoAlert /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{d.probleme}</div>
                  <div className="c">{d.cause}</div>
                  <div className="amt">{fmt(d.impactFinancier)}</div>
                </div>
                {onNav && <button className="act" onClick={() => onNav(d.actionCible.page)}>{d.actionSuggeree} →</button>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Créances & dettes + prévision */}
      {voitCreances && (
        <section className="k-card sp5">
          <div className="k-card__hd"><h3>Créances &amp; dettes</h3>{cockpit?.delaiMoyenPaiement.jours !== null && cockpit && <span className="k-chip soft">Délai moyen : {cockpit.delaiMoyenPaiement.jours} j</span>}</div>
          <div className="k-duo">
            <div className="box a">
              <div className="k">On me doit</div>
              <div className="v k-num">{n0(onMeDoit)}</div>
              <div className="sub">{retardsCreance > 0 ? <span className="k-flag">{retardsCreance} en retard</span> : 'À jour'}{creanceCredit && creanceCredit.clients > 0 ? ` · ${creanceCredit.clients} client${creanceCredit.clients > 1 ? 's' : ''}` : ''}</div>
            </div>
            <div className="box b">
              <div className="k">Je dois</div>
              <div className="v k-num">{n0(dette?.du ?? 0)}</div>
              <div className="sub">{dette && dette.retards > 0 ? <span className="k-flag">{dette.retards} en retard</span> : (dette?.fournisseurs ? `${dette.fournisseurs} fournisseur${dette.fournisseurs > 1 ? 's' : ''}` : 'Rien à régler')}</div>
            </div>
          </div>
          {voitCompta && prevision && (
            <div className="k-forecast">
              <div>
                <div className="kf">Trésorerie prévue dans 30 jours</div>
                <div className="vf">{prevision.soldeProjete >= 0 ? '+ ' : '− '}{n0(Math.abs(prevision.soldeProjete))} FCFA</div>
              </div>
              <span className="k-chip" style={{ background: prevision.soldeProjete >= 0 ? 'rgba(180,224,51,.18)' : 'rgba(229,72,77,.16)', color: prevision.soldeProjete >= 0 ? 'var(--k-lime)' : '#ffb4b4' }}>{prevision.soldeProjete >= 0 ? 'Sain' : 'Tendu'}</span>
            </div>
          )}
        </section>
      )}

      {/* Alertes stock (si présentes) */}
      {stockAlertes && stockAlertes.length > 0 && (
        <section className="k-card sp7">
          <div className="k-card__hd"><h3>Alertes de stock</h3>{onNav && <button className="k-chip soft" style={{ border: 0, cursor: 'pointer' }} onClick={() => onNav('stock')}>Gérer</button>}</div>
          <div className="k-dlist">
            {stockAlertes.slice(0, 4).map((p) => (
              <div className={`k-di ${p.rupture ? 'u-crit' : 'u-warn'}`} key={p.nom}>
                <span className="ic"><IcoBox /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{p.nom}</div>
                  <div className="c">{p.rupture ? 'Rupture de stock' : 'Stock faible'} · {p.stock} restant{p.stock !== 1 ? 's' : ''} · seuil {p.seuil}</div>
                </div>
                {onNav && <button className="act" onClick={() => onNav('stock')}>Réappro. →</button>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Meilleures ventes */}
      {voitVentes && top && top.length > 0 && (
        <section className="k-card sp5">
          <div className="k-card__hd"><h3>Meilleures ventes</h3>{onNav && <button className="k-chip soft" style={{ border: 0, cursor: 'pointer' }} onClick={() => onNav('rentabilite')}>Rentabilité</button>}</div>
          <div className="k-rows">
            {top.slice(0, 6).map((t, i) => (
              <div className="r" key={t.designation}>
                <span className="rank">{i + 1}</span>
                <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.designation}</span>
                <span className="k-label">×{t.quantite}</span>
                <span className="k-mono" style={{ fontWeight: 600 }}>{n0(t.montant_ht)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* IGS / régime fiscal */}
      {voitCompta && igs && (
        <section className="k-card sp4" style={{ cursor: onNav ? 'pointer' : 'default' }} onClick={() => onNav?.('compta')}>
          <div className="k-card__hd"><h3>{regimeIgs ? 'IGS estimé' : 'Régime fiscal'}</h3><span className={`k-chip ${regimeIgs ? 'warn' : 'soft'}`}>{regimeIgs ? `Classe ${igs.igs?.classe ?? '—'}` : 'Réel'}</span></div>
          <div className="k-big k-num" style={{ marginTop: 8, color: regimeIgs ? 'var(--k-warn)' : 'var(--k-ink)' }}>{regimeIgs ? abr(igs.igs?.igsAnnuel ?? 0) : '—'}<span className="k-cur"> FCFA</span></div>
          <p className="k-label" style={{ marginTop: 14 }}>CA cumulé : <span className="k-mono">{n0(igs.caCumule)}</span>{regimeIgs && ' · déclaration avant le 15 avril'}</p>
        </section>
      )}

      {/* Derniers mouvements */}
      {voitVentes && mouvements && mouvements.length > 0 && (
        <section className="k-card k-card--pad0 sp12">
          <div className="k-card__hd" style={{ padding: '18px 22px', marginBottom: 0, borderBottom: '1px solid var(--k-line-soft)' }}>
            <h3>Derniers mouvements</h3>
            {onNav && <button className="k-chip soft" style={{ border: 0, cursor: 'pointer' }} onClick={() => onNav('tresorerie')}>Toutes les transactions</button>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="k-table">
              <thead><tr><th>Libellé</th><th>Date</th><th>Moyen</th><th className="r">Montant</th><th>Sens</th></tr></thead>
              <tbody>
                {mouvements.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="k-tname">
                        {m.client
                          ? <Avatar name={m.client} size="sm" />
                          : <span className="lo" style={{ background: m.sens === 'in' ? 'var(--k-ok-soft)' : 'var(--k-danger-soft)', color: m.sens === 'in' ? 'var(--k-ok)' : 'var(--k-danger)' }}>{m.sens === 'in' ? <IcoDn /> : <IcoUp />}</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{m.libelle}</span>
                      </div>
                    </td>
                    <td className="k-mono" style={{ color: 'var(--k-muted)' }}>{new Date(m.date).toLocaleDateString('fr-FR')}</td>
                    <td><span className="k-chip soft">{MODE_LABEL[m.mode] ?? m.mode}</span></td>
                    <td className="r k-mono" style={{ fontWeight: 600, color: m.sens === 'in' ? 'var(--k-ok)' : 'var(--k-ink)' }}>{m.sens === 'in' ? '+ ' : '− '}{n0(m.montant)}</td>
                    <td><span className={`k-pill ${m.sens === 'in' ? 'ok' : 'pend'}`}>{m.sens === 'in' ? 'Entrée' : 'Sortie'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {erreur && <p className="sp12" style={{ color: 'var(--k-danger)', fontSize: 13 }}>{erreur}</p>}
    </div>
  );
}
