import { useState } from 'react';
import { signIn, signUp } from '../lib/auth.js';
import { Bouton, Champ, Logo } from '../components/ui.js';

export function Login() {
  const [inscription, setInscription] = useState(false);
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState('');
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);

  async function soumettre() {
    setErreur(''); setCharge(true);
    try {
      const r = inscription
        ? await signUp.email({ email, password: mdp, name: nom || email })
        : await signIn.email({ email, password: mdp });
      if (r.error) setErreur(r.error.message ?? 'Échec de la connexion');
      // en cas de succès, useSession se met à jour et App bascule automatiquement
    } catch {
      setErreur('Impossible de contacter le serveur');
    } finally {
      setCharge(false);
    }
  }

  return (
    <div className="center-ecran">
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 22 }}>
          <Logo size={56} />
          <h1 style={{ fontSize: 30, margin: '14px 0 2px', fontWeight: 800 }}>Kombi</h1>
          <p className="muet" style={{ margin: 0 }}>L'ami de votre gestion</p>
        </div>

        <div className="carte" style={{ padding: 22 }}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>
            {inscription ? 'Créer un compte' : 'Se connecter'}
          </h2>
          {inscription && (
            <Champ label="Votre nom" value={nom} onChange={setNom} placeholder="Ex. Awa Ngono" />
          )}
          <Champ label="Email" type="email" value={email} onChange={setEmail} placeholder="vous@exemple.cm" />
          <Champ label="Mot de passe" type="password" value={mdp} onChange={setMdp} placeholder="••••••••" />
          {erreur && <p style={{ color: 'var(--danger)', fontSize: 14, margin: '4px 0 12px' }}>{erreur}</p>}
          <Bouton bloc onClick={soumettre} disabled={charge || !email || !mdp}>
            {charge ? '…' : inscription ? 'Créer mon compte' : 'Se connecter'}
          </Bouton>
        </div>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }} className="muet">
          {inscription ? 'Déjà un compte ? ' : 'Pas encore de compte ? '}
          <button className="btn btn-ghost" style={{ padding: '2px 6px' }}
            onClick={() => { setInscription(!inscription); setErreur(''); }}>
            {inscription ? 'Se connecter' : 'Créer un compte'}
          </button>
        </p>
      </div>
    </div>
  );
}
