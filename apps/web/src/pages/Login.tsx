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
    <div className="min-h-screen bg-[#0e1c0f] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <Logo size={56} />
          <h1 className="text-[#edf5ea] text-3xl font-extrabold mt-3 mb-0.5">Kombi</h1>
          <p className="text-[#4a6b4a] text-sm">L'ami de votre gestion</p>
        </div>

        <div className="bg-[#162419] rounded-2xl p-5 border border-[#1e3222]">
          <h2 className="text-[#edf5ea] text-lg font-semibold mt-0 mb-4">
            {inscription ? 'Créer un compte' : 'Se connecter'}
          </h2>
          {inscription && (
            <Champ label="Votre nom" value={nom} onChange={setNom} placeholder="Ex. Awa Ngono" />
          )}
          <Champ label="Email" type="email" value={email} onChange={setEmail} placeholder="vous@exemple.cm" />
          <Champ label="Mot de passe" type="password" value={mdp} onChange={setMdp} placeholder="••••••••" />
          {erreur && <p className="text-[#f87171] text-sm mt-1 mb-3">{erreur}</p>}
          <Bouton bloc onClick={soumettre} disabled={charge || !email || !mdp}>
            {charge ? '…' : inscription ? 'Créer mon compte' : 'Se connecter'}
          </Bouton>
        </div>

        <p className="text-center text-[#4a6b4a] text-sm mt-4">
          {inscription ? 'Déjà un compte ? ' : 'Pas encore de compte ? '}
          <button className="text-[#b4e033] font-medium px-1.5 py-0.5 hover:underline"
            onClick={() => { setInscription(!inscription); setErreur(''); }}>
            {inscription ? 'Se connecter' : 'Créer un compte'}
          </button>
        </p>
      </div>
    </div>
  );
}
