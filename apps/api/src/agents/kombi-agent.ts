import { Think } from '@cloudflare/think';
import { tool } from 'ai';
import { z } from 'zod';
import type { Bindings } from '../types.js';

// zod v3/v4 type mismatch with ai SDK v7 — tools work at runtime but types don't align
const t = tool as any;

export class KombiAgent extends Think<Bindings> {
  private get entrepriseId(): string {
    return this.name;
  }

  private get stub() {
    const ns = this.env.ENTREPRISE;
    return ns.get(ns.idFromName(this.entrepriseId));
  }

  getModel() {
    return '@cf/meta/llama-4-scout-17b-16e-instruct';
  }

  getSystemPrompt(): string {
    return `Tu es l'assistant IA Kombi pour cette entreprise.
Tu aides l'entrepreneur avec la gestion quotidienne : ventes, dépenses, trésorerie, stock, factures, fiscalité.
Tu as accès aux données réelles de l'entreprise via tes outils. Utilise-les pour donner des réponses précises.

Règles :
- Réponds toujours en français
- Sois concis et pratique — l'entrepreneur est pressé
- Donne les montants en FCFA
- Quand tu utilises un outil, explique brièvement ce que tu fais
- Pour les actions sensibles (créer facture, modifier stock), demande confirmation
- Si tu ne sais pas, dis-le — ne fabrique jamais de chiffres`;
  }

  getTools() {
    const stub = this.stub;

    return {
      stats_jour: t({
        description: "Nombre de ventes et total du jour en FCFA",
        parameters: z.object({}),
        execute: async () => stub.statsJour(),
      }),

      tendance_7_jours: t({
        description: "Chiffre d'affaires des 7 derniers jours, jour par jour",
        parameters: z.object({}),
        execute: async () => stub.tendance7Jours(),
      }),

      ventes_recentes: t({
        description: "Liste les ventes récentes (max 20)",
        parameters: z.object({
          limite: z.number().max(50).default(20).describe("Nombre de ventes à retourner"),
        }),
        execute: async ({ limite }: { limite: number }) => stub.listerVentesRecentes(limite),
      }),

      ventes_a_credit: t({
        description: "Liste les ventes à crédit non soldées (argent dû par les clients)",
        parameters: z.object({}),
        execute: async () => stub.listerVentesACredit(),
      }),

      soldes_tresorerie: t({
        description: "Soldes actuels : espèces, MTN MoMo, Orange Money, banque",
        parameters: z.object({}),
        execute: async () => stub.soldesTresorerie(),
      }),

      tresorerie_du_jour: t({
        description: "Mouvements de trésorerie du jour par caisse",
        parameters: z.object({}),
        execute: async () => stub.tresorerieDuJour(),
      }),

      depenses_recentes: t({
        description: "Liste les dépenses récentes",
        parameters: z.object({}),
        execute: async () => stub.listerDepenses(),
      }),

      analyse_depenses: t({
        description: "Analyse détaillée des dépenses : total, par catégorie, évolution mensuelle",
        parameters: z.object({
          debut: z.string().optional().describe("Date début YYYY-MM-DD"),
          fin: z.string().optional().describe("Date fin YYYY-MM-DD"),
        }),
        execute: async ({ debut, fin }: { debut?: string; fin?: string }) => {
          const periode = debut && fin ? { debut, fin } : undefined;
          return stub.analyseDepenses(periode);
        },
      }),

      liste_produits: t({
        description: "Liste tous les produits/articles en stock avec quantités et prix",
        parameters: z.object({}),
        execute: async () => stub.listerProduits(),
      }),

      factures_impayees: t({
        description: "Liste les factures impayées (clients qui doivent de l'argent)",
        parameters: z.object({}),
        execute: async () => stub.listerFacturesImpayees(),
      }),

      liste_factures: t({
        description: "Liste toutes les factures émises",
        parameters: z.object({}),
        execute: async () => stub.listerFactures(),
      }),

      dettes_fournisseurs: t({
        description: "Liste les dettes aux fournisseurs (achats non soldés)",
        parameters: z.object({}),
        execute: async () => stub.listerDettesFournisseurs(),
      }),

      etats_financiers: t({
        description: "États financiers : bilan simplifié, compte de résultat, soldes intermédiaires",
        parameters: z.object({}),
        execute: async () => stub.etatsFinanciers(),
      }),

      ca_cumule: t({
        description: "Chiffre d'affaires cumulé depuis le début de l'exercice",
        parameters: z.object({}),
        execute: async () => {
          const ca = await stub.caCumule();
          return { ca_cumule_fcfa: ca };
        },
      }),

      marge_cumulee: t({
        description: "Marge brute cumulée depuis le début de l'exercice",
        parameters: z.object({}),
        execute: async () => {
          const marge = await stub.margeCumulee();
          return { marge_cumulee_fcfa: marge };
        },
      }),

      meilleures_ventes: t({
        description: "Top produits les plus vendus (par chiffre d'affaires)",
        parameters: z.object({
          limite: z.number().max(20).default(5),
        }),
        execute: async ({ limite }: { limite: number }) => stub.meilleuresVentes(limite),
      }),

      cockpit: t({
        description: "Tableau de bord complet : CA, marge, trésorerie, alertes, tendances",
        parameters: z.object({}),
        execute: async () => stub.cockpit(),
      }),

      alertes: t({
        description: "Alertes de pilotage : stock bas, trésorerie critique, impayés anciens, etc.",
        parameters: z.object({}),
        execute: async () => stub.alertesPilotage(),
      }),

      prevision_tresorerie: t({
        description: "Prévision de trésorerie sur 30, 60 ou 90 jours",
        parameters: z.object({
          horizon_jours: z.enum(['30', '60', '90']).describe("Horizon de prévision"),
        }),
        execute: async ({ horizon_jours }: { horizon_jours: string }) =>
          stub.previsionTresorerie(Number(horizon_jours) as 30 | 60 | 90),
      }),

      comparaison_mensuelle: t({
        description: "Comparaison mois courant vs mois précédent (CA, dépenses, marge)",
        parameters: z.object({}),
        execute: async () => stub.comparaisonMensuelle(),
      }),

      seuil_rentabilite: t({
        description: "Seuil de rentabilité (point mort) mensuel",
        parameters: z.object({}),
        execute: async () => stub.seuilRentabilite(),
      }),

      problemes_prioritaires: t({
        description: "Problèmes prioritaires détectés dans l'entreprise avec recommandations",
        parameters: z.object({}),
        execute: async () => stub.problemesPrioritaires(),
      }),

      liste_tiers: t({
        description: "Liste des clients et fournisseurs",
        parameters: z.object({}),
        execute: async () => stub.listerTiers(),
      }),

      liste_ecritures: t({
        description: "Liste les écritures comptables",
        parameters: z.object({}),
        execute: async () => stub.listerEcritures(),
      }),

      mouvements_tresorerie: t({
        description: "Derniers mouvements de trésorerie (entrées/sorties de caisse)",
        parameters: z.object({
          limite: z.number().max(200).default(50),
        }),
        execute: async ({ limite }: { limite: number }) => stub.listerMouvementsTresorerie(limite),
      }),
    };
  }
}
