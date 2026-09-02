import { useEffect, useState } from 'react';
import { journalAudit, type EntrepriseResume, type JournalAudit } from '../lib/api.js';
import { Icon } from '../components/ui.js';

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

  if (erreur) return <p style={{ color: 'var(--danger)' }}>{erreur}</p>;
  if (!journal) return <p className="muet">Chargement…</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="carte" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>Intégrité de la chaîne</strong>
          <p className="muet" style={{ margin: '2px 0 0', fontSize: 13 }}>{journal.integrite.nbLignes} entrée(s)</p>
        </div>
        <span className={`chip ${journal.integrite.valide ? 'chip-ok' : 'chip-bas'}`}>
          <Icon name={journal.integrite.valide ? 'check' : 'baisse'} size={13} />{' '}
          {journal.integrite.valide ? 'Non altérée' : 'Altération détectée'}
        </span>
      </div>

      {journal.entrees.length === 0 ? (
        <div className="carte" style={{ textAlign: 'center', padding: 28 }}>
          <p className="muet">Aucune opération journalisée pour l'instant.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {journal.entrees.map((e) => (
            <div key={e.id} className="carte" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong style={{ fontSize: 14 }}>{LABEL_ACTION[e.action] ?? e.action}</strong>
                <span className="muet" style={{ fontSize: 12 }}>{new Date(e.ts + 'Z').toLocaleString('fr-FR')}</span>
              </div>
              <div className="muet" style={{ fontSize: 13, marginTop: 2 }}>
                {e.role} · {e.utilisateur_id === 'systeme' ? 'système' : e.utilisateur_id}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
