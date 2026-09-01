import { createAuthClient } from 'better-auth/react';

// En dev, un proxy Vite route /api vers le Worker (même origine → cookies OK).
// En prod, définir VITE_API_URL vers le domaine du Worker.
const base = (import.meta.env.VITE_API_URL ?? window.location.origin) + '/api/auth';

export const authClient = createAuthClient({ baseURL: base });
export const { signIn, signUp, signOut, useSession } = authClient;
