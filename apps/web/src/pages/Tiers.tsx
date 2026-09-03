import { useEffect, useState } from 'react';
import { formaterFCFA } from '@kombi/shared';
import {
  listerTiers, getTiersDetail,
  type EntrepriseResume, type Tiers as TiersType, type TiersDetail,
} from '../lib/api.js';
import { enfilerMutation, nouvelUuid } from '../offline/db.js';
import { synchroniser } from '../offline/sync.js';
import { Bouton, Champ, Icon } from '../components/ui.js';

const STATUT_LIBELLE: Record<string, string> = {
  brouillon: 'Brouillon', envoyee: 'Envoyée', payee_partiellement: 'Partiel', payee: 'Payée',
  en_retard: 'En retard', annulee: 'Annulée', a_credit: 'À crédit', regle: 'Réglé', annule: 'Annulé',
};

export function Tiers({ entreprise, onRetour }: { entreprise: EntrepriseResume; onRetour: () => void }) {
  const [liste, setListe] = useState<TiersType[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [vue, setVue] = useState<'liste' | 'nouveau'>('liste');
  const [selectionne, setSelectionne] = useState<string | null>(null);

  function recharger() { listerTiers(entreprise.id).then(setListe).catch(() => setListe((p) => p ?? [])); }
  useEffect(recharger, [entreprise.id]);

  if (selectionne)
    return <FicheTiers entreprise={entreprise} tiersId={selectionne} onRetour={() => setSelectionne(null)} />;
  if (vue === 'nouveau')
    return <NouveauTiers entreprise={entreprise} onFait={() => { setVue('liste'); recharger(); }} onAnnuler={() => setVue('liste')} />;

  const filtres = (liste ?? []).filter((t) => t.nom.toLowerCase().includes(recherche.toLowerCase()));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={onRetour} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="baisse" size={18} /> <h1 className="titre-page">Clients &amp; fournisseurs</h1>
        </button>
        <Bouton onClick={() => setVue('nouveau')}><Icon name="plus" size={18} /> Nouveau</Bouton>
      </div>

      {liste !== null && liste.length > 0 && (
        <input placeholder="Rechercher un nom…" value={recherche} onChange={(e) => setRecherche(e.target.value)}
          style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--bord)', borderRadius: 12,
            boxSizing: 'border-box', marginBottom: 12 }} />
      )}

      {liste === null ? <p className="muet">Chargement…</p>
        : liste.length === 0 ? (
          <div className="carte" style={{ textAlign: 'center', padding: 28 }}>
            <p className="muet">Aucun client ni fournisseur pour l'instant.</p>
            <Bouton onClick={() => setVue('nouveau')}>Ajouter</Bouton>
          </div>
        ) : filtres.length === 0 ? (
          <p className="muet">Aucun résultat pour « {recherche} ».</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtres.map((t) => (
              <button key={t.id} onClick={() => setSelectionne(t.id)} className="carte"
                style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                  padding: 14, borderRadius: 16, background: '#fff', border: '1px solid var(--bord)' }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--vert-clair)',
                  color: 'var(--vert)', display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 700 }}>
                  {t.nom.slice(0, 1).toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{t.nom}</div>
                  <div className="muet" style={{ fontSize: 13 }}>
                    {t.type === 'fournisseur' ? 'Fournisseur' : t.type === 'les_deux' ? 'Client & fournisseur' : 'Client'}
                    {t.telephone && ` · ${t.telephone}`}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
    </div>
  );
}

function NouveauTiers({ entreprise, onFait, onAnnuler }: {
  entreprise: EntrepriseResume; onFait: () => void; onAnnuler: () => void;
}) {
  const [nom, setNom] = useState('');
  const [type, setType] = useState<'client' | 'fournisseur'>('client');
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
      // Offline-first : enregistré localement (marche sans réseau), synchronisé dès que possible.
      const clientUuid = nouvelUuid();
      await enfilerMutation({
        clientUuid, entrepriseId: entreprise.id, type: 'tiers',
        payload: {
          nom: nom.trim(), type, telephone: telephone || undefined, niu: niu || undefined,
          email: email || undefined, adresse: adresse || undefined,
        },
      });
      void synchroniser();
      onFait();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally { setCharge(false); }
  }

  return (
    <div>
      <h1 className="titre-page" style={{ marginBottom: 12 }}>Nouveau tiers</h1>
      <div className="carte">
        <Champ label="Nom" value={nom} onChange={setNom} placeholder="Ex. Boutique Awa" />
        <Champ label="Type" value={type} onChange={(v) => setType(v as 'client' | 'fournisseur')}
          options={[{ value: 'client', label: 'Client' }, { value: 'fournisseur', label: 'Fournisseur' }]} />
        <Champ label="Téléphone" value={telephone} onChange={setTelephone} placeholder="6XX XXX XXX" />
        <Champ label="NIU" value={niu} onChange={setNiu} placeholder="Optionnel" />
        <Champ label="Email" value={email} onChange={setEmail} placeholder="Optionnel" />
        <Champ label="Adresse" value={adresse} onChange={setAdresse} placeholder="Optionnel" />

        {erreur && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{erreur}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <Bouton variante="clair" onClick={onAnnuler}>Annuler</Bouton>
          <Bouton bloc onClick={valider} disabled={charge || !nom.trim()}>{charge ? '…' : 'Enregistrer'}</Bouton>
        </div>
      </div>
    </div>
  );
}

function FicheTiers({ entreprise, tiersId, onRetour }: {
  entreprise: EntrepriseResume; tiersId: string; onRetour: () => void;
}) {
  const [fiche, setFiche] = useState<TiersDetail | null>(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    getTiersDetail(entreprise.id, tiersId).then(setFiche).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }, [entreprise.id, tiersId]);

  if (erreur) return <p style={{ color: 'var(--danger)' }}>{erreur}</p>;
  if (!fiche) return <p className="muet">Chargement…</p>;

  const operations = [
    ...fiche.ventes.map((v) => ({ id: v.id, date: v.date, montant: v.total_ttc, statut: v.statut, libelle: 'Vente' })),
    ...fiche.factures.map((f) => ({
      id: f.id, date: f.date_emission ?? '', montant: f.total_ttc, statut: f.statut,
      libelle: f.numero ?? (f.type === 'devis' ? 'Devis (brouillon)' : 'Facture (brouillon)'),
    })),
    ...fiche.achats.map((a) => ({ id: a.id, date: a.date, montant: a.total_ttc, statut: a.statut, libelle: 'Achat' })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div>
      <button onClick={onRetour} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Icon name="baisse" size={18} /> <h1 className="titre-page" style={{ margin: 0 }}>{fiche.nom}</h1>
      </button>

      <div className="carte" style={{ marginBottom: 12 }}>
        <div className="muet" style={{ fontSize: 13, marginBottom: 8 }}>
          {fiche.type === 'fournisseur' ? 'Fournisseur' : fiche.type === 'les_deux' ? 'Client & fournisseur' : 'Client'}
        </div>
        {fiche.telephone && <div style={{ fontSize: 14, marginBottom: 4 }}>📞 {fiche.telephone}</div>}
        {fiche.email && <div style={{ fontSize: 14, marginBottom: 4 }}>✉️ {fiche.email}</div>}
        {fiche.niu && <div style={{ fontSize: 14, marginBottom: 4 }}>NIU : {fiche.niu}</div>}
        {fiche.adresse && <div style={{ fontSize: 14 }}>{fiche.adresse}</div>}
      </div>

      {(fiche.soldeDu > 0 || fiche.soldeAPayer > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: fiche.soldeDu > 0 && fiche.soldeAPayer > 0 ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 12 }}>
          {fiche.soldeDu > 0 && (
            <div className="carte" style={{ textAlign: 'center' }}>
              <div className="muet" style={{ fontSize: 12 }}>Nous doit</div>
              <div className="chiffre" style={{ fontSize: 20, fontWeight: 700, color: 'var(--vert)' }}>{formaterFCFA(fiche.soldeDu)}</div>
            </div>
          )}
          {fiche.soldeAPayer > 0 && (
            <div className="carte" style={{ textAlign: 'center' }}>
              <div className="muet" style={{ fontSize: 12 }}>On lui doit</div>
              <div className="chiffre" style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger)' }}>{formaterFCFA(fiche.soldeAPayer)}</div>
            </div>
          )}
        </div>
      )}

      <strong style={{ display: 'block', marginBottom: 8 }}>Historique</strong>
      {operations.length === 0 ? (
        <p className="muet">Aucune opération enregistrée.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {operations.map((o) => (
            <div key={o.id} className="carte" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{o.libelle}</div>
                <div className="muet" style={{ fontSize: 12 }}>{o.date ? new Date(o.date).toLocaleDateString('fr-FR') : '—'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="chiffre" style={{ fontWeight: 600 }}>{formaterFCFA(o.montant)}</div>
                <span className="muet" style={{ fontSize: 12 }}>{STATUT_LIBELLE[o.statut] ?? o.statut}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
