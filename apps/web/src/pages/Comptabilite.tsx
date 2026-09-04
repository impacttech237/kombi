/**
 * Comptabilité — porté fidèlement du prototype Figma Make (Accounting(), lignes 2390-2606).
 * Adaptations : pas de bascule de prévisualisation IGS/Réel (le régime de l'entreprise n'est pas
 * une simulation ad hoc — voir Paramètres fiscaux) ; les lignes Produits/Charges/Actif/Passif
 * viennent des vrais comptes SYSCOHADA (numéro + libellé) plutôt que du mock à 2-3 lignes fixes ;
 * pas de détail TVA collectée/déductible en régime réel (aucun endpoint dédié pour l'instant, State fiscal
 * réel se limite au résultat net) ; l'écran Journal d'audit (absent du prototype) reste accessible
 * via un onglet supplémentaire.
 */
import { useEffect, useState } from 'react';
import { formaterFCFA as fmt, peut, type RoleMembre } from '@kombi/shared';
import {
  api, etatsFinanciers, listerClotures, cloturerMois, rouvrirMois,
  type EntrepriseResume, type EtatsFinanciers, type LigneEtat, type ClotureMensuelle,
} from '../lib/api.js';
import { IcoLayers } from '../components/icons.js';
import { Journal } from './Journal.js';

interface IgsResp { caCumule: number; regime: string; igs: { igsAnnuel: number; classe: number } | null }

export function Comptabilite({ entreprise }: { entreprise: EntrepriseResume }) {
  const [etats, setEtats] = useState<EtatsFinanciers | null>(null);
  const [igs, setIgs] = useState<IgsResp | null>(null);
  const [vue, setVue] = useState<'etats' | 'journal' | 'clotures'>('etats');
  const [erreur, setErreur] = useState('');
  const voitJournal = peut(entreprise.role as RoleMembre, 'audit:read');
  const regimeIgs = entreprise.regime_fiscal === 'igs';

  useEffect(() => {
    etatsFinanciers(entreprise.id).then(setEtats).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
    if (regimeIgs) api<IgsResp>('/api/fiscalite/igs', { entrepriseId: entreprise.id }).then(setIgs).catch(() => {});
  }, [entreprise.id, regimeIgs]);

  const profit = etats?.resultat.resultat ?? 0;
  const passifLines: LigneEtat[] = etats?.bilan.passif ?? [];

  return (
    <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6 flex-1 overflow-y-auto pb-24 md:pb-8">
      <div className="mx-4 md:mx-8 mt-4 bg-[#b4e033]/5 border border-[#b4e033]/20 rounded-2xl p-4 flex items-start gap-3">
        <IcoLayers cls="w-4 h-4 text-[#b4e033] shrink-0 mt-0.5" />
        <div>
          <p className="text-[#b4e033] text-sm font-semibold">Généré automatiquement</p>
          <p className="text-[#6b9165] text-xs mt-1 leading-relaxed">
            Ces états sont calculés depuis vos ventes, achats et mouvements de trésorerie. Aucune saisie comptable
            requise. Conforme à la norme <strong className="text-[#b4e033]/80">SYSCOHADA</strong>.
          </p>
        </div>
      </div>

      <div className="px-4 md:px-8 pt-4 pb-2 flex items-center justify-between">
        <div>
          <p className="text-[#edf5ea] font-semibold">États financiers</p>
          <p className="text-[#4a6b4a] text-xs mt-0.5">{entreprise.raison_sociale}</p>
        </div>
        {voitJournal && (
          <div className="flex items-center gap-1 bg-[#1e3222] rounded-xl p-1 border border-[#2a4230]">
            <button onClick={() => setVue('etats')}
              className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${vue === 'etats' ? 'bg-[#b4e033] text-[#0e1c0f]' : 'text-[#4a6b4a] hover:text-[#6b9165]'}`}>
              États
            </button>
            <button onClick={() => setVue('journal')}
              className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${vue === 'journal' ? 'bg-[#60a5fa] text-[#0e1c0f]' : 'text-[#4a6b4a] hover:text-[#6b9165]'}`}>
              Journal
            </button>
            <button onClick={() => setVue('clotures')}
              className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${vue === 'clotures' ? 'bg-[#fbbf24] text-[#0e1c0f]' : 'text-[#4a6b4a] hover:text-[#6b9165]'}`}>
              Clôtures
            </button>
          </div>
        )}
      </div>

      {erreur && <p className="text-[#f87171] text-sm px-4 md:px-8">{erreur}</p>}

      {vue === 'journal' ? (
        <div className="px-4 md:px-8"><Journal entreprise={entreprise} /></div>
      ) : vue === 'clotures' ? (
        <div className="px-4 md:px-8"><ClotureMensuelleTab entreprise={entreprise} /></div>
      ) : !etats ? (
        <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
      ) : (
        <>
          <div className="mx-4 md:mx-8 mt-2">
            <div className="bg-[#162419] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1e3222] flex items-center justify-between">
                <div>
                  <h3 className="text-[#edf5ea] font-semibold text-sm">Compte de résultat</h3>
                  <p className="text-[#4a6b4a] text-xs mt-0.5">Produits et charges · Classes 6 &amp; 7</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${profit > 0 ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-[#f87171]/10 text-[#f87171]'}`}>
                  {profit > 0 ? 'Bénéfice' : 'Déficit'}
                </span>
              </div>
              <div className="p-4 space-y-4">
                <LigneSection titre="Produits (recettes)" lignes={etats.resultat.detailProduits} total={etats.resultat.produits} couleurMontant="text-[#4ade80]" prefixe="" />
                <LigneSection titre="Charges (dépenses)" lignes={etats.resultat.detailCharges} total={etats.resultat.charges} couleurMontant="text-[#f87171]" prefixe="−" />
                <div className={`rounded-xl p-4 flex justify-between items-center ${profit > 0 ? 'bg-[#4ade80]/5 border border-[#4ade80]/15' : 'bg-[#f87171]/5 border border-[#f87171]/15'}`}>
                  <div>
                    <p className="text-[#edf5ea] font-semibold text-sm">Résultat net</p>
                    <p className="text-[#4a6b4a] text-xs mt-0.5">{regimeIgs ? 'Avant IGS' : 'Avant impôt sur les sociétés'}</p>
                  </div>
                  <span className={`font-mono font-bold text-xl ${profit > 0 ? 'text-[#b4e033]' : 'text-[#f87171]'}`}>{fmt(profit)}</span>
                </div>
              </div>
            </div>
          </div>

          {regimeIgs && igs?.igs && (
            <div className="mx-4 md:mx-8 mt-3">
              <div className="bg-[#162419] rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#1e3222] flex items-center justify-between">
                  <div>
                    <h3 className="text-[#edf5ea] font-semibold text-sm">Impôt Général Synthétique</h3>
                    <p className="text-[#4a6b4a] text-xs mt-0.5">Régime micro-entreprise · Cameroun · art. 45 CGI</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full font-semibold bg-[#fbbf24]/10 text-[#fbbf24]">IGS</span>
                </div>
                <div className="p-4 space-y-2">
                  {[
                    { label: 'CA cumulé exercice', value: fmt(igs.caCumule), color: 'text-[#edf5ea]' },
                    { label: 'Classe du barème', value: `Classe ${igs.igs.classe}`, color: 'text-[#fbbf24]' },
                    { label: 'Montant annuel dû', value: fmt(igs.igs.igsAnnuel), color: 'text-[#fbbf24]' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex justify-between items-center py-1.5 border-b border-[#1e3222]/50">
                      <span className="text-[#b3ceac] text-sm">{label}</span>
                      <span className={`font-mono text-sm font-semibold ${color}`}>{value}</span>
                    </div>
                  ))}
                  <div className="bg-[#fbbf24]/5 border border-[#fbbf24]/20 rounded-xl p-3.5 flex justify-between items-center mt-2">
                    <div>
                      <p className="text-[#fbbf24] text-sm font-semibold">Déclaration unique annuelle</p>
                      <p className="text-[#4a6b4a] text-xs mt-0.5">Au plus tard le 15 avril</p>
                    </div>
                    <span className="font-mono font-bold text-[#fbbf24] text-lg">{fmt(igs.igs.igsAnnuel)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mx-4 md:mx-8 mt-3">
            <div className="bg-[#162419] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1e3222] flex items-center justify-between">
                <div>
                  <h3 className="text-[#edf5ea] font-semibold text-sm">Bilan simplifié</h3>
                  <p className="text-[#4a6b4a] text-xs mt-0.5">Situation patrimoniale actuelle</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${etats.bilan.equilibre ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-[#f87171]/10 text-[#f87171]'}`}>
                  {etats.bilan.equilibre ? 'Équilibré' : 'Écart'}
                </span>
              </div>
              <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#1e3222]">
                <div className="p-4">
                  <p className="text-[#6b9165] text-xs font-medium uppercase tracking-wide mb-3">Actif · Ce que possède l'entreprise</p>
                  <LigneListe lignes={etats.bilan.actif} />
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-[#edf5ea] font-medium text-sm">Total actif</span>
                    <span className="font-mono text-[#edf5ea] font-semibold">{fmt(etats.bilan.totalActif)}</span>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-[#6b9165] text-xs font-medium uppercase tracking-wide mb-3">Passif · Ce que doit l'entreprise</p>
                  <LigneListe lignes={passifLines} />
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-[#edf5ea] font-medium text-sm">Total passif</span>
                    <span className="font-mono text-[#edf5ea] font-semibold">{fmt(etats.bilan.totalPassif)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LigneSection({ titre, lignes, total, couleurMontant, prefixe }: {
  titre: string; lignes: LigneEtat[]; total: number; couleurMontant: string; prefixe: string;
}) {
  return (
    <div>
      <p className="text-[#6b9165] text-xs font-medium uppercase tracking-wide mb-2">{titre}</p>
      {lignes.map((l) => (
        <div key={l.numero} className="flex justify-between items-center py-1.5 border-b border-[#1e3222]/50">
          <span className="text-[#b3ceac] text-sm">{l.libelle}</span>
          <span className={`font-mono text-sm font-medium ${couleurMontant}`}>
            {l.montant < 0 ? fmt(l.montant) : `${prefixe}${fmt(l.montant)}`}
          </span>
        </div>
      ))}
      <div className="flex justify-between items-center pt-2">
        <span className="text-[#edf5ea] font-medium text-sm">Total {titre.toLowerCase()}</span>
        <span className={`font-mono font-semibold ${couleurMontant}`}>{prefixe}{fmt(total)}</span>
      </div>
    </div>
  );
}

function LigneListe({ lignes }: { lignes: LigneEtat[] }) {
  return (
    <>
      {lignes.map((l) => (
        <div key={l.numero} className="flex justify-between items-center py-1.5 border-b border-[#1e3222]/50">
          <span className="text-[#b3ceac] text-sm">{l.libelle}</span>
          <span className="font-mono text-[#edf5ea] text-sm">{fmt(l.montant)}</span>
        </div>
      ))}
    </>
  );
}

/**
 * Clôture mensuelle (D18) : verrouille un mois pour empêcher toute nouvelle vente/achat/dépense
 * daté dedans. Ne couvre que ce verrouillage mois par mois — pas une clôture d'exercice complète
 * (à-nouveaux etc., voir DECISIONS.md D17, encore à construire).
 */
function ClotureMensuelleTab({ entreprise }: { entreprise: EntrepriseResume }) {
  const [clotures, setClotures] = useState<ClotureMensuelle[] | null>(null);
  const [moisSaisi, setMoisSaisi] = useState(new Date().toISOString().slice(0, 7));
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');

  function recharger() {
    return listerClotures(entreprise.id).then(setClotures).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }
  useEffect(() => { void recharger(); }, [entreprise.id]);

  async function cloturer() {
    if (!confirm(`Clôturer ${moisSaisi} ? Plus aucune vente, achat ou dépense ne pourra y être daté.`)) return;
    setCharge(true); setErreur('');
    try { await cloturerMois(entreprise.id, moisSaisi); await recharger(); }
    catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur'); }
    finally { setCharge(false); }
  }

  async function rouvrir(anneeMois: string) {
    if (!confirm(`Rouvrir ${anneeMois} ? Les opérations y redeviendront possibles.`)) return;
    setCharge(true); setErreur('');
    try { await rouvrirMois(entreprise.id, anneeMois); await recharger(); }
    catch (e) { setErreur(e instanceof Error ? e.message : 'Erreur'); }
    finally { setCharge(false); }
  }

  return (
    <div className="pt-2">
      <div className="bg-[#162419] rounded-2xl p-4 border border-[#2a4230] mb-3">
        <p className="text-[#edf5ea] text-sm font-medium mb-1">Clôturer un mois</p>
        <p className="text-[#4a6b4a] text-xs leading-relaxed mb-3">
          Une fois clôturé, aucune vente, aucun achat et aucune dépense ne peut plus être daté dans ce mois — utile
          une fois les comptes du mois vérifiés, pour éviter une saisie tardive qui fausserait un résultat déjà validé.
        </p>
        <div className="flex gap-2">
          <input type="month" value={moisSaisi} onChange={(e) => setMoisSaisi(e.target.value)}
            className="flex-1 bg-[#1e3222] text-[#edf5ea] rounded-xl px-3 py-2.5 text-sm border border-[#2a4230] focus:border-[#fbbf24] focus:outline-none [color-scheme:dark]" />
          <button onClick={cloturer} disabled={charge}
            className="bg-[#fbbf24] text-[#0e1c0f] rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40">
            {charge ? '…' : 'Clôturer'}
          </button>
        </div>
      </div>

      {erreur && <p className="text-[#f87171] text-xs mb-3">{erreur}</p>}

      <p className="text-[#4a6b4a] text-xs font-medium uppercase tracking-wide mb-2">Mois clôturés</p>
      {clotures === null ? (
        <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>
      ) : clotures.length === 0 ? (
        <p className="text-[#4a6b4a] text-sm text-center py-8">Aucun mois clôturé pour l'instant.</p>
      ) : (
        <div className="bg-[#162419] rounded-2xl overflow-hidden">
          {clotures.map((c, i) => (
            <div key={c.annee_mois} className={`flex items-center gap-3 px-4 py-3 ${i < clotures.length - 1 ? 'border-b border-[#1e3222]' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-[#edf5ea] text-sm font-medium">{c.annee_mois}</p>
                <p className="text-[#4a6b4a] text-xs mt-0.5">Clôturé le {new Date(c.cloture_le).toLocaleDateString('fr-FR')}</p>
              </div>
              <button onClick={() => rouvrir(c.annee_mois)} disabled={charge}
                className="text-[#f87171] text-xs font-medium px-3 py-1.5 hover:bg-[#f87171]/8 rounded-xl transition-colors disabled:opacity-40">
                Rouvrir
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
