/**
 * Rapports & Analyses — absent du prototype Figma Make, design original dans le même langage
 * visuel. Répond à l'audit du 2026-09-04 : le dirigeant n'avait aucun moyen de sortir un rapport
 * périodique (mensuel/trimestriel/annuel/comparaison) ni d'exporter ses chiffres.
 */
import { useEffect, useState } from 'react';
import { formaterFCFA as fmt } from '@kombi/shared';
import {
  getRapport, urlRapportPdf, telechargerRapportCsv,
  type EntrepriseResume, type Rapport, type TypeRapport,
} from '../lib/api.js';
import { DepensesCategorieDonut, EvolutionMensuelleChart } from '../components/charts.js';
import { IcoChevR, IcoFile } from '../components/icons.js';

const TYPES: { value: TypeRapport; label: string }[] = [
  { value: 'mensuel', label: 'Mensuel' }, { value: 'trimestriel', label: 'Trimestriel' },
  { value: 'annuel', label: 'Annuel' }, { value: 'comparaison', label: 'Comparaison' },
  { value: 'personnalise', label: 'Plage libre' },
];

/** Période de référence : année + mois (0-indexé). Le mois est ignoré pour le type 'annuel'. */
interface RefPeriode { annee: number; mois: number; }

/** 'AAAA-MM-01' pour un couple (année, mois 0-indexé) — normalise mois hors [0,11] (ex. 12 → janvier suivant). */
function premierJour(annee: number, mois: number): string {
  const d = new Date(Date.UTC(annee, mois, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** Bornes [debut, fin) d'un mois/trimestre/année civil contenant la période de référence. */
function bornes(type: TypeRapport, ref: RefPeriode): { debut: string; fin: string } {
  if (type === 'annuel') return { debut: `${ref.annee}-01-01`, fin: `${ref.annee + 1}-01-01` };
  if (type === 'trimestriel') {
    const debutMois = Math.floor(ref.mois / 3) * 3;
    return { debut: premierJour(ref.annee, debutMois), fin: premierJour(ref.annee, debutMois + 3) };
  }
  return { debut: premierJour(ref.annee, ref.mois), fin: premierJour(ref.annee, ref.mois + 1) };
}

/**
 * Décale une période de référence de `delta` unités (mois/trimestre/année) — arithmétique
 * entière pure, jamais de `Date.setMonth` (l'overflow de jour-du-mois peut faire sauter un mois
 * quand le mois cible est plus court, ex. 31 janvier − 1 mois avec setMonth peut retomber en
 * mars). Sert à la fois à la navigation (précédent/suivant) et au calcul de la période
 * comparative — un décalage calendaire, PAS une soustraction de durée en jours (bug corrigé le
 * 2026-09-04 : « période précédente » d'un mois de 30 jours retombait un jour trop tôt).
 */
function decalerRef(type: TypeRapport, ref: RefPeriode, delta: number): RefPeriode {
  if (type === 'annuel') return { annee: ref.annee + delta, mois: 0 };
  const pas = type === 'trimestriel' ? 3 : 1;
  const totalMois = ref.annee * 12 + ref.mois + delta * pas;
  return { annee: Math.floor(totalMois / 12), mois: ((totalMois % 12) + 12) % 12 };
}

const MOIS_LABEL = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
function labelPeriode(type: TypeRapport, ref: RefPeriode): string {
  if (type === 'annuel') return String(ref.annee);
  if (type === 'trimestriel') return `T${Math.floor(ref.mois / 3) + 1} ${ref.annee}`;
  return `${MOIS_LABEL[ref.mois]} ${ref.annee}`;
}

export function Rapports({ entreprise, onRetour }: { entreprise: EntrepriseResume; onRetour: () => void }) {
  const [type, setType] = useState<TypeRapport>('mensuel');
  const auj = new Date();
  const [ref, setRef] = useState<RefPeriode>({ annee: auj.getFullYear(), mois: auj.getMonth() });
  const debutMoisCourant = premierJour(auj.getFullYear(), auj.getMonth());
  const [plageDebut, setPlageDebut] = useState(debutMoisCourant);
  const [plageFin, setPlageFin] = useState(premierJour(auj.getFullYear(), auj.getMonth() + 1));
  const [agenceFiltre, setAgenceFiltre] = useState('');
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [erreur, setErreur] = useState('');
  const [exportEnCours, setExportEnCours] = useState<'pdf' | 'csv' | null>(null);

  const effectif: TypeRapport = type === 'comparaison' ? 'mensuel' : type;
  const agencesDisponibles = (rapport?.depenses.parAgence ?? []).filter((a) => a.agence !== 'Sans agence').map((a) => a.agence);

  function paramsActuels() {
    const agence = agenceFiltre || undefined;
    if (type === 'personnalise') return { type, debut: plageDebut, fin: plageFin, agence };
    const periode = bornes(effectif, ref);
    if (type !== 'comparaison') return { type, ...periode, agence };
    const refPrec = decalerRef(effectif, ref, -1);
    const c = bornes(effectif, refPrec);
    return { type, ...periode, debutComparaison: c.debut, finComparaison: c.fin, agence };
  }

  useEffect(() => {
    setRapport(null); setErreur('');
    getRapport(entreprise.id, paramsActuels()).then(setRapport).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entreprise.id, type, ref.annee, ref.mois, plageDebut, plageFin, agenceFiltre]);

  async function exporterPdf() {
    setExportEnCours('pdf');
    try { window.open(await urlRapportPdf(entreprise.id, paramsActuels()), '_blank'); }
    catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur'); }
    finally { setExportEnCours(null); }
  }
  async function exporterCsv() {
    setExportEnCours('csv');
    try { await telechargerRapportCsv(entreprise.id, paramsActuels()); }
    catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur'); }
    finally { setExportEnCours(null); }
  }

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-8 pt-4 pb-2 flex items-center gap-2">
        <button onClick={onRetour} className="w-9 h-9 shrink-0 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
          <IcoChevR cls="w-4 h-4 rotate-180" />
        </button>
        <h1 className="text-[#edf5ea] text-lg font-bold flex-1">Rapports &amp; Analyses</h1>
      </div>

      <div className="px-4 md:px-8 pb-2 flex gap-2 flex-wrap">
        {TYPES.map((t) => (
          <button key={t.value} onClick={() => setType(t.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${type === t.value ? 'bg-[#b4e033] text-[#0e1c0f]' : 'bg-[#1e3222] text-[#6b9165] border border-[#2a4230]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 md:px-8 pb-2 flex items-center gap-2 flex-wrap">
        {type === 'personnalise' ? (
          <>
            <input type="date" value={plageDebut} onChange={(e) => e.target.value && setPlageDebut(e.target.value)}
              className="bg-[#1e3222] text-[#edf5ea] text-sm font-medium rounded-xl px-3 py-1.5 border border-[#2a4230] focus:border-[#b4e033] focus:outline-none [color-scheme:dark]" />
            <span className="text-[#4a6b4a] text-sm">→</span>
            <input type="date" value={plageFin} onChange={(e) => e.target.value && setPlageFin(e.target.value)}
              className="bg-[#1e3222] text-[#edf5ea] text-sm font-medium rounded-xl px-3 py-1.5 border border-[#2a4230] focus:border-[#b4e033] focus:outline-none [color-scheme:dark]" />
          </>
        ) : (
          <>
            <button onClick={() => setRef((r) => decalerRef(effectif, r, -1))}
              className="w-8 h-8 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165] shrink-0">
              <IcoChevR cls="w-3.5 h-3.5 rotate-180" />
            </button>
            {effectif === 'mensuel' ? (
              <input type="month" value={`${ref.annee}-${String(ref.mois + 1).padStart(2, '0')}`}
                onChange={(e) => {
                  const [a, m] = e.target.value.split('-').map(Number);
                  if (a && m) setRef({ annee: a, mois: m - 1 });
                }}
                className="bg-[#1e3222] text-[#edf5ea] text-sm font-medium rounded-xl px-3 py-1.5 border border-[#2a4230] focus:border-[#b4e033] focus:outline-none [color-scheme:dark]" />
            ) : (
              <span className="text-[#edf5ea] text-sm font-medium min-w-[90px] text-center">{labelPeriode(effectif, ref)}</span>
            )}
            <button onClick={() => setRef((r) => decalerRef(effectif, r, 1))}
              className="w-8 h-8 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165] shrink-0">
              <IcoChevR cls="w-3.5 h-3.5" />
            </button>
            {(ref.annee !== auj.getFullYear() || ref.mois !== auj.getMonth()) && (
              <button onClick={() => setRef({ annee: auj.getFullYear(), mois: auj.getMonth() })}
                className="text-[#6b9165] text-xs font-medium px-2 py-1 hover:text-[#b4e033]">
                Aujourd'hui
              </button>
            )}
          </>
        )}

        {rapport && (
          <select value={agenceFiltre} onChange={(e) => setAgenceFiltre(e.target.value)}
            className="ml-auto bg-[#1e3222] text-[#edf5ea] text-xs rounded-xl px-2.5 py-1.5 border border-[#2a4230] focus:border-[#b4e033] focus:outline-none">
            <option value="">Toutes agences</option>
            {agencesDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>
      {agenceFiltre && (
        <p className="text-[#4a6b4a] text-[11px] px-4 md:px-8 pb-1">
          Filtre agence « {agenceFiltre} » — ne s'applique qu'aux dépenses (CA, marge et clients restent sur toute l'entreprise).
        </p>
      )}

      {erreur && <p className="text-[#f87171] text-sm px-4 md:px-8">{erreur}</p>}

      <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-24 md:pb-8 space-y-4 pt-2">
        {rapport === null ? (
          <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
        ) : (
          <>
            <p className="text-[#4a6b4a] text-xs">{rapport.periode.debut} → {rapport.periode.fin}</p>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Chiffre d\'affaires', valeur: rapport.stats.ca, couleur: 'text-[#edf5ea]' },
                { label: 'Marge', valeur: rapport.stats.marge, couleur: 'text-[#4ade80]' },
                { label: 'Dépenses', valeur: rapport.stats.depenses, couleur: 'text-[#f87171]' },
                { label: 'Résultat', valeur: rapport.stats.resultat, couleur: rapport.stats.resultat >= 0 ? 'text-[#b4e033]' : 'text-[#f87171]' },
              ].map((c) => (
                <div key={c.label} className="bg-[#162419] rounded-2xl p-3.5">
                  <p className="text-[#4a6b4a] text-xs">{c.label}</p>
                  <p className={`font-mono font-bold text-lg mt-0.5 ${c.couleur}`}>{fmt(c.valeur)}</p>
                </div>
              ))}
            </div>

            {rapport.comparaison && (
              <div className="bg-[#162419] rounded-2xl p-4 border border-[#2a4230]">
                <p className="text-[#6b9165] text-xs font-medium uppercase tracking-wide mb-2">
                  Vs période précédente ({rapport.comparaison.periode.debut} → {rapport.comparaison.periode.fin})
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'CA', pct: rapport.comparaison.variationCaPct },
                    { label: 'Marge', pct: rapport.comparaison.variationMargePct },
                    { label: 'Dépenses', pct: rapport.comparaison.variationDepensesPct },
                  ].map((v) => (
                    <div key={v.label}>
                      <p className="text-[#4a6b4a] text-xs">{v.label}</p>
                      <p className={`font-mono text-sm font-semibold mt-0.5 ${v.pct === null ? 'text-[#4a6b4a]' : v.pct >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                        {v.pct === null ? '—' : `${v.pct > 0 ? '+' : ''}${v.pct}%`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-[#162419] rounded-2xl p-4 border border-[#2a4230]">
              <p className="text-[#6b9165] text-xs font-medium uppercase tracking-wide mb-3">Dépenses par catégorie</p>
              {rapport.depenses.parCategorie.length === 0 ? (
                <p className="text-[#4a6b4a] text-xs">Rien sur cette période.</p>
              ) : (
                <DepensesCategorieDonut data={rapport.depenses.parCategorie} />
              )}
            </div>

            <div className="bg-[#162419] rounded-2xl p-4 border border-[#2a4230]">
              <p className="text-[#6b9165] text-xs font-medium uppercase tracking-wide mb-1">
                Évolution des dépenses ({rapport.depenses.evolutionMensuelle.length} mois)
              </p>
              <EvolutionMensuelleChart data={rapport.depenses.evolutionMensuelle} />
            </div>

            {rapport.produits.length > 0 && (
              <div className="bg-[#162419] rounded-2xl p-4 border border-[#2a4230]">
                <p className="text-[#6b9165] text-xs font-medium uppercase tracking-wide mb-2">Top produits (marge)</p>
                <div className="space-y-2">
                  {rapport.produits.slice(0, 5).map((p) => (
                    <div key={p.designation} className="flex items-center justify-between text-sm">
                      <span className="text-[#edf5ea] truncate">{p.designation}</span>
                      <span className={`font-mono text-xs ${p.marge >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>{fmt(p.marge)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rapport.clients.length > 0 && (
              <div className="bg-[#162419] rounded-2xl p-4 border border-[#2a4230]">
                <p className="text-[#6b9165] text-xs font-medium uppercase tracking-wide mb-2">Top clients (marge)</p>
                <div className="space-y-2">
                  {rapport.clients.slice(0, 5).map((cl) => (
                    <div key={cl.tiers_id ?? cl.nom} className="flex items-center justify-between text-sm">
                      <span className="text-[#edf5ea] truncate">{cl.nom}</span>
                      <span className={`font-mono text-xs ${cl.marge >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>{fmt(cl.marge)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-[#162419] rounded-2xl p-4 border border-[#2a4230]">
              <p className="text-[#6b9165] text-xs font-medium uppercase tracking-wide mb-2">Délai moyen de paiement</p>
              <p className="text-[#edf5ea] font-mono text-sm">
                {rapport.delaiMoyenPaiement.jours !== null ? `${rapport.delaiMoyenPaiement.jours} jours` : 'Pas assez de données'}
              </p>
            </div>

            <div className="flex gap-2 pb-2">
              <button onClick={exporterPdf} disabled={exportEnCours !== null}
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#1e3222] text-[#edf5ea] rounded-xl px-4 py-2.5 text-sm font-medium border border-[#2a4230] disabled:opacity-40">
                <IcoFile cls="w-3.5 h-3.5" /> {exportEnCours === 'pdf' ? '…' : 'Export PDF'}
              </button>
              <button onClick={exporterCsv} disabled={exportEnCours !== null}
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#1e3222] text-[#edf5ea] rounded-xl px-4 py-2.5 text-sm font-medium border border-[#2a4230] disabled:opacity-40">
                <IcoFile cls="w-3.5 h-3.5" /> {exportEnCours === 'csv' ? '…' : 'Export Excel (CSV)'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
