/**
 * Journal d'audit — absent du prototype Figma Make, design original dans le même langage visuel
 * que les écrans portés. Affiché comme onglet de Comptabilité.tsx.
 */
import { useEffect, useState } from 'react';
import { journalAudit, type EntrepriseResume, type JournalAudit } from '../lib/api.js';
import { IcoOk, IcoAlert } from '../components/icons.js';

const LABEL_ACTION: Record<string, string> = {
  'vente.enregistrer': 'Vente enregistrée',
  'depense.creer': 'Dépense enregistrée',
  'stock.entree': 'Approvisionnement',
  'facture.emettre': 'Facture émise',
  'facture.payer': 'Facture encaissée',
};

export function Journal({ entreprise }: { entreprise: EntrepriseResume }) {
  const [journal, setJournal] = useState<JournalAudit | null>(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    journalAudit(entreprise.id).then(setJournal).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }, [entreprise.id]);

  if (erreur) return <p className="text-[#f87171] text-sm">{erreur}</p>;
  if (!journal) return <p className="text-[#4a6b4a] text-sm text-center py-8">Chargement…</p>;

  return (
    <div className="space-y-2">
      <div className="bg-[#162419] rounded-2xl p-4 flex items-center justify-between">
        <div>
          <p className="text-[#edf5ea] font-semibold text-sm">Intégrité de la chaîne</p>
          <p className="text-[#4a6b4a] text-xs mt-0.5">{journal.integrite.nbLignes} entrée(s)</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1.5 ${journal.integrite.valide ? 'bg-[#4ade80]/10 text-[#4ade80]' : 'bg-[#f87171]/15 text-[#f87171]'}`}>
          {journal.integrite.valide ? <IcoOk cls="w-3 h-3" /> : <IcoAlert cls="w-3 h-3" />}
          {journal.integrite.valide ? 'Non altérée' : 'Altération détectée'}
        </span>
      </div>

      {journal.entrees.length === 0 ? (
        <p className="text-[#4a6b4a] text-sm text-center py-8">Aucune opération journalisée pour l'instant.</p>
      ) : (
        journal.entrees.map((e) => (
          <div key={e.id} className="bg-[#162419] rounded-2xl p-4">
            <div className="flex justify-between items-baseline gap-3">
              <p className="text-[#edf5ea] font-medium text-sm">{LABEL_ACTION[e.action] ?? e.action}</p>
              <span className="text-[#4a6b4a] text-xs shrink-0">{new Date(e.ts + 'Z').toLocaleString('fr-FR')}</span>
            </div>
            <p className="text-[#4a6b4a] text-xs mt-1">{e.role} · {e.utilisateur_id === 'systeme' ? 'système' : e.utilisateur_id}</p>
          </div>
        ))
      )}
    </div>
  );
}
