import { useEffect, useState } from 'react';
import { compterEnAttente, onFileChange } from './db.js';

/** État de connexion réseau (réactif). */
export function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine);
    window.addEventListener('online', maj);
    window.addEventListener('offline', maj);
    return () => { window.removeEventListener('online', maj); window.removeEventListener('offline', maj); };
  }, []);
  return enLigne;
}

/** Nombre de mutations en attente de synchronisation (réactif). */
export function useEnAttente(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const maj = () => { void compterEnAttente().then(setN); };
    maj();
    const off = onFileChange(maj);
    const i = window.setInterval(maj, 5000);
    return () => { off(); window.clearInterval(i); };
  }, []);
  return n;
}
