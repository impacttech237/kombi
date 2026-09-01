import { describe, it, expect } from 'vitest';
import {
  modulesActifsPourSecteur,
  dependancesSatisfaites,
  MODULES,
} from './modules.js';

describe('Configuration par secteur', () => {
  it('commerce active le stock et les achats', () => {
    const m = modulesActifsPourSecteur('commerce');
    expect(m).toContain('stock');
    expect(m).toContain('achats');
    expect(m).toContain('ventes'); // cœur
  });

  it('service pur n\'active PAS le stock ni les achats', () => {
    const m = modulesActifsPourSecteur('service');
    expect(m).not.toContain('stock');
    expect(m).not.toContain('achats');
    expect(m).toContain('facturation'); // cœur toujours présent
  });

  it('mixte active tout', () => {
    expect(modulesActifsPourSecteur('mixte')).toContain('stock');
  });

  it('les modules cœur sont toujours présents quel que soit le secteur', () => {
    const coeur = Object.values(MODULES).filter((m) => m.coeur).map((m) => m.code);
    for (const secteur of ['commerce', 'service', 'mixte'] as const) {
      const actifs = modulesActifsPourSecteur(secteur);
      for (const c of coeur) expect(actifs).toContain(c);
    }
  });

  it('dépendances : achats sans stock est invalide', () => {
    expect(dependancesSatisfaites(['achats', 'tiers'])).toBe(false);
    expect(dependancesSatisfaites(['achats', 'stock', 'tiers'])).toBe(true);
  });
});
