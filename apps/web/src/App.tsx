import { useState } from 'react';
import { calculerIGS, determinerRegime } from '@kombi/fiscal';
import { formaterFCFA, type NatureActivite } from '@kombi/shared';

/**
 * Écran de démonstration : calcul IGS 100% hors-ligne (le moteur fiscal tourne dans le navigateur).
 * Prouve que la contrainte offline est tenue pour le cœur réglementaire.
 * À remplacer par les vrais écrans (saisie recette/dépense, factures, etc.).
 */
export function App() {
  const [ca, setCa] = useState(3_000_000);
  const [cga, setCga] = useState(false);
  const [nature, setNature] = useState<NatureActivite>('negoce');

  const igs = calculerIGS(ca, { adherentCGA: cga });
  const regime = determinerRegime({ caAnnuelHT: ca, natureActivite: nature });

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 480, margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ color: '#0b6e4f' }}>Kombi</h1>
      <p>Calcul de l'IGS (fonctionne hors-ligne).</p>

      <label style={{ display: 'block', margin: '1rem 0' }}>
        Chiffre d'affaires annuel (FCFA)
        <input
          type="number"
          value={ca}
          onChange={(e) => setCa(Number(e.target.value))}
          style={{ display: 'block', width: '100%', padding: 8, fontSize: 16 }}
        />
      </label>

      <label style={{ display: 'block', margin: '1rem 0' }}>
        Nature d'activité
        <select
          value={nature}
          onChange={(e) => setNature(e.target.value as NatureActivite)}
          style={{ display: 'block', width: '100%', padding: 8, fontSize: 16 }}
        >
          <option value="negoce">Commerce</option>
          <option value="artisanal">Artisanat</option>
          <option value="service">Services</option>
          <option value="liberale">Profession libérale</option>
        </select>
      </label>

      <label style={{ display: 'block', margin: '1rem 0' }}>
        <input type="checkbox" checked={cga} onChange={(e) => setCga(e.target.checked)} /> Adhérent
        d'un Centre de Gestion Agréé (CGA)
      </label>

      <div style={{ background: '#f0f7f4', padding: 16, borderRadius: 8 }}>
        <p>
          Régime : <strong>{regime === 'igs' ? 'IGS' : 'Réel'}</strong>
        </p>
        {igs ? (
          <>
            <p>Classe IGS : <strong>{igs.classe}</strong></p>
            <p>IGS annuel : <strong>{formaterFCFA(igs.igsAnnuel)}</strong></p>
            <p>IGS trimestriel : {formaterFCFA(igs.igsTrimestriel)}</p>
          </>
        ) : (
          <p>CA ≥ 50 000 000 FCFA → hors IGS, relève du régime du Réel.</p>
        )}
      </div>
    </main>
  );
}
