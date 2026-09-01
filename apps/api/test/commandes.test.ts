import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Commandes / missions', () => {
  it('création, changement de statut et compteur d\'actives', async () => {
    const e = doE('cmd-1');
    await e.initialiser('cmd-1', 'commerce', 2026);

    const c1 = await e.creerCommande({ type: 'commande', libelle: 'Livraison 10 sacs', montant: 40000 });
    await e.creerCommande({ type: 'commande', libelle: 'Commande boissons' });

    expect(await e.commandesActives()).toBe(2);

    await e.changerStatutCommande(c1, 'en_cours');
    let liste = await e.listerCommandes();
    expect(liste.find((c) => c.id === c1)!.statut).toBe('en_cours');
    expect(await e.commandesActives()).toBe(2); // en_cours reste actif

    await e.changerStatutCommande(c1, 'livree');
    expect(await e.commandesActives()).toBe(1); // livrée n'est plus active
  });

  it('une mission (service) est créée avec son type', async () => {
    const e = doE('cmd-2');
    await e.initialiser('cmd-2', 'service', 2026);
    const m = await e.creerCommande({ type: 'mission', libelle: 'Audit compta', montant: 150000 });
    const liste = await e.listerCommandes();
    const mission = liste.find((c) => c.id === m)!;
    expect(mission.type).toBe('mission');
    expect(mission.statut).toBe('en_attente');
  });
});
