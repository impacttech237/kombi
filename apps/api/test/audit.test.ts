import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Journal d\'audit immuable (chaîné par hash)', () => {
  it('journalise chaque opération financière avec acteur, action et chaîne valide', async () => {
    const e = doE('audit-1');
    await e.initialiser('audit-1', 'commerce', 2026);
    const acteur = { utilisateurId: 'u-gerant', role: 'gerant' };

    await e.enregistrerVente(
      { lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 5000 }], modePaiement: 'especes' },
      acteur,
    );
    await e.creerDepense(
      { categorie: 'loyer', compteNumero: '622', libelle: 'Loyer', montant: 30000, modePaiement: 'especes' },
      acteur,
    );

    const journal = await e.listerAuditLog();
    expect(journal.length).toBe(2);
    // Le plus récent en premier.
    expect((journal[0] as { action: string }).action).toBe('depense.creer');
    expect((journal[1] as { action: string }).action).toBe('vente.enregistrer');
    expect((journal[0] as { utilisateur_id: string }).utilisateur_id).toBe('u-gerant');
    expect((journal[0] as { role: string }).role).toBe('gerant');

    const integrite = await e.verifierChaineAudit();
    expect(integrite.valide).toBe(true);
    expect(integrite.nbLignes).toBe(2);
  });

  it('un approvisionnement et un paiement de facture sont aussi journalisés', async () => {
    const e = doE('audit-2');
    await e.initialiser('audit-2', 'commerce', 2026);
    const acteur = { utilisateurId: 'u-admin', role: 'admin' };

    const produitId = await e.creerProduit({ nom: 'Sac de riz', prixVente: 15000 });
    await e.entrerStock({ produitId, quantite: 5, coutUnitaire: 10000, modePaiement: 'especes' }, acteur);

    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Test' });
    const factureId = await e.creerFacture({
      type: 'facture', tiersId, lignes: [{ designation: 'Prestation', quantite: 1, prixUnitaire: 20000 }],
    });
    await e.emettreFacture(factureId, 'ENT', acteur);
    await e.payerFacture(factureId, 20000, 'especes', acteur);

    const journal = await e.listerAuditLog();
    const actions = (journal as { action: string }[]).map((j) => j.action).sort();
    expect(actions).toEqual(['facture.emettre', 'facture.payer', 'stock.entree'].sort());

    const integrite = await e.verifierChaineAudit();
    expect(integrite.valide).toBe(true);
    expect(integrite.nbLignes).toBe(3);
  });

  it('le journal est immuable (triggers SQL bloquant UPDATE/DELETE)', async () => {
    const e = doE('audit-3');
    await e.initialiser('audit-3', 'commerce', 2026);
    await e.creerDepense(
      { categorie: 'loyer', compteNumero: '622', libelle: 'Loyer', montant: 10000, modePaiement: 'especes' },
      { utilisateurId: 'u1', role: 'gerant' },
    );
    const journal = await e.listerAuditLog();
    const auditId = (journal[0] as { id: string }).id;

    const { updateBloque, deleteBloque } = await e._verifierImmuabiliteAudit(auditId);
    expect(updateBloque).toBe(true);
    expect(deleteBloque).toBe(true);
  });

  it('opère sans acteur explicite (valeur par défaut « systeme ») — rétro-compatible', async () => {
    const e = doE('audit-4');
    await e.initialiser('audit-4', 'service', 2026);
    await e.enregistrerVente({
      lignes: [{ designation: 'Consultation', quantite: 1, prixUnitaire: 25000 }], modePaiement: 'virement',
    });
    const journal = await e.listerAuditLog();
    expect((journal[0] as { role: string }).role).toBe('systeme');
  });
});
