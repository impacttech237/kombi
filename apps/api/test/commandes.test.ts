import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Commandes / missions', () => {
  it('pilote une opération enrichie et calcule sa progression depuis les tâches', async () => {
    const e = doE('cmd-pilotage');
    await e.initialiser('cmd-pilotage', 'commerce', 2026);
    const id = await e.creerCommande({
      libelle: 'Confection de 20 uniformes', description: 'Prêts pour la rentrée', priorite: 'urgente',
      dateDebut: '2026-09-05', datePrevue: '2026-09-12', datePaiement: '2026-09-12',
      responsableId: 'u-1', responsableNom: 'Amina', montant: 200000, acompte: 80000, lieu: 'Akwa',
    });
    const coupe = await e.creerTacheOperation(id, { titre: 'Coupe', responsableNom: 'Amina', dateEcheance: '2026-09-07' });
    await e.creerTacheOperation(id, { titre: 'Assemblage', responsableNom: 'Boris', dateEcheance: '2026-09-10' });
    await e.changerStatutTache(coupe, 'terminee');
    await e.changerStatutCommande(id, 'controle');

    const op = (await e.listerCommandes()).find((c) => c.id === id)!;
    expect(op).toMatchObject({ priorite: 'urgente', responsable_nom: 'Amina', acompte: 80000, progression: 50, statut: 'controle' });
    expect(await e.listerTachesOperations()).toHaveLength(2);
  });

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

  it('gère les dépendances, le journal terrain et la facture liée', async () => {
    const e = doE('cmd-collaboration');
    await e.initialiser('cmd-collaboration', 'service', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Atelier Awa', telephone: '237699000000' });
    const commandeId = await e.creerCommande({ libelle: 'Site vitrine', tiersId, montant: 300000 });
    const brief = await e.creerTacheOperation(commandeId, { titre: 'Valider le brief' });
    const production = await e.creerTacheOperation(commandeId, { titre: 'Produire', dependDeId: brief });

    await e.changerStatutTache(brief, 'terminee');
    await e.changerStatutTache(production, 'terminee');
    await e.ajouterCommentaireOperation(commandeId, 'BAT validé par le client', 'u-1', 'Amina');
    const factureId = await e.creerFactureDepuisCommande(commandeId, 'facture-operation-1');

    expect(await e.listerCommentairesOperations()).toEqual(expect.arrayContaining([
      expect.objectContaining({ commande_id: commandeId, message: 'BAT validé par le client', auteur_nom: 'Amina' }),
    ]));
    expect((await e.listerCommandes()).find((c) => c.id === commandeId)).toMatchObject({ progression: 100, facture_id: factureId });
    expect(await e.creerFactureDepuisCommande(commandeId, 'autre-cle')).toBe(factureId);
  });

  it('pilote budget, coûts, échéancier, édition, duplication et archivage', async()=>{
    const e=doE('cmd-economie');await e.initialiser('cmd-economie','commerce',2026);
    const id=await e.creerCommande({libelle:'Mobilier bureau',montant:500000,coutBudget:300000});
    await e.ajouterCoutOperation(id,{categorie:'matiere',libelle:'Bois',montant:180000,date:'2026-09-05'});
    const ech=await e.ajouterEcheanceOperation(id,{type:'encaissement',libelle:'Premier versement',montant:200000,datePrevue:'2026-09-10'});
    await e.payerEcheanceOperation(ech,'orange_money','2026-09-06');
    await e.modifierCommande(id,{lieu:'Bonamoussadi',priorite:'haute'});
    const copie=await e.dupliquerCommande(id);await e.archiverCommande(copie,true);
    const ops=await e.listerCommandes();
    expect(ops.find(x=>x.id===id)).toMatchObject({cout_reel:180000,acompte:200000,lieu:'Bonamoussadi',priorite:'haute'});
    expect(ops.find(x=>x.id===copie)).toMatchObject({archivee:1,cout_budget:300000});
    expect(await e.listerHistoriqueOperations()).toEqual(expect.arrayContaining([expect.objectContaining({commande_id:id,action:'paiement'})]));
  });
  it('génère la prochaine occurrence et permet de modifier/supprimer une tâche',async()=>{const e=doE('cmd-recurrence');await e.initialiser('cmd-recurrence','service',2026);const c=await e.creerCommande({libelle:'Entretien'});const t=await e.creerTacheOperation(c,{titre:'Contrôle hebdomadaire',dateEcheance:'2026-09-05',recurrence:'hebdomadaire',dureeMinutes:45});await e.modifierTacheOperation(t,{titre:'Contrôle atelier'});await e.changerStatutTache(t,'terminee');let ts=await e.listerTachesOperations();expect(ts).toEqual(expect.arrayContaining([expect.objectContaining({titre:'Contrôle atelier',date_echeance:'2026-09-12',duree_minutes:45})]));const prochaine=ts.find(x=>x.date_echeance==='2026-09-12')!.id as string;await e.supprimerTacheOperation(prochaine);expect(await e.listerTachesOperations()).toHaveLength(1)});
});
