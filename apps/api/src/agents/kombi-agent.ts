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

  private ensureTables() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS chat_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  private saveMessage(msg: { id: string; role: string; content: string; toolCalls?: unknown[] }) {
    this.ensureTables();
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO chat_messages (id, role, content, tool_calls) VALUES (?, ?, ?, ?)`,
      msg.id,
      msg.role,
      msg.content,
      msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
    );
  }

  private loadMessages(): { id: string; role: string; content: string; created_at: string }[] {
    this.ensureTables();
    return [...this.ctx.storage.sql.exec(
      `SELECT id, role, content, created_at FROM chat_messages ORDER BY created_at ASC LIMIT 200`,
    )] as { id: string; role: string; content: string; created_at: string }[];
  }

  private clearChatHistory() {
    this.ensureTables();
    this.ctx.storage.sql.exec(`DELETE FROM chat_messages`);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.endsWith('/history') && request.method === 'GET') {
      const messages = this.loadMessages();
      return Response.json({ messages });
    }

    if (path.endsWith('/history') && request.method === 'DELETE') {
      this.clearChatHistory();
      return Response.json({ ok: true });
    }

    if (path.endsWith('/alerts') && request.method === 'GET') {
      return this.handleAlerts();
    }

    const response = await super.fetch(request);

    if (request.method === 'POST' && (path.endsWith('/chat') || path === '/')) {
      try {
        const body = await request.clone().json() as { messages?: { role: string; content: string }[] };
        if (body.messages?.length) {
          const last = body.messages[body.messages.length - 1]!;
          this.saveMessage({ id: crypto.randomUUID(), role: last.role, content: last.content });
        }
      } catch { /* best-effort */ }
    }

    return response;
  }

  private async handleAlerts(): Promise<Response> {
    try {
      const stub = this.stub;
      const [alertes, soldes, stats] = await Promise.all([
        stub.alertesPilotage(),
        stub.soldesTresorerie(),
        stub.statsJour(),
      ]);
      const totalTresorerie = (soldes as any).especes + (soldes as any).mtnMomo +
        (soldes as any).orangeMoney + (soldes as any).banque;

      const proactiveAlerts: { type: string; gravite: string; message: string }[] = [];

      if (Array.isArray(alertes)) {
        for (const a of alertes as { type: string; gravite: string; libelle: string }[]) {
          proactiveAlerts.push({ type: a.type, gravite: a.gravite, message: a.libelle });
        }
      }

      if (totalTresorerie < 50_000) {
        proactiveAlerts.push({
          type: 'tresorerie_critique',
          gravite: 'critique',
          message: `Trésorerie totale très basse : ${Math.round(totalTresorerie).toLocaleString('fr')} FCFA`,
        });
      }

      return Response.json({
        alertes: proactiveAlerts,
        resume: {
          ventesJour: (stats as any).nbVentes ?? 0,
          caJour: (stats as any).totalJour ?? 0,
          tresorerieTotal: Math.round(totalTresorerie),
        },
      });
    } catch (e) {
      return Response.json({ alertes: [], resume: null, erreur: String(e) });
    }
  }

  getModel() {
    return '@cf/meta/llama-4-scout-17b-16e-instruct';
  }

  getSystemPrompt(): string {
    return `Tu es l'assistant IA Kombi pour cette entreprise.
Tu aides l'entrepreneur avec la gestion quotidienne : ventes, dépenses, trésorerie, stock, factures, fiscalité.
Tu as accès aux données réelles de l'entreprise via tes outils. Utilise-les pour donner des réponses précises.
Tu peux aussi AGIR : enregistrer des ventes, créer des dépenses, ajouter des produits, émettre des factures.

Règles :
- Réponds toujours en français
- Sois concis et pratique — l'entrepreneur est pressé
- Donne les montants en FCFA
- Quand tu utilises un outil de lecture, explique brièvement ce que tu fais

Règles pour les actions (écriture) :
- TOUJOURS résumer l'action et demander "Voulez-vous que je procède ?" AVANT d'appeler un outil d'action
- Ne JAMAIS exécuter une action sans confirmation explicite de l'utilisateur ("oui", "ok", "vas-y", "confirme")
- Après une action, confirme ce qui a été fait avec les détails (montant, numéro, etc.)
- Si tu ne sais pas, dis-le — ne fabrique jamais de chiffres
- En cas d'erreur, explique clairement ce qui s'est passé`;
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

      // ── Outils d'ACTION (écriture) ──

      enregistrer_vente: t({
        description: "Enregistre une nouvelle vente. TOUJOURS demander confirmation à l'utilisateur avant d'appeler.",
        parameters: z.object({
          lignes: z.array(z.object({
            designation: z.string().describe("Nom du produit/service"),
            quantite: z.number().min(1).describe("Quantité vendue"),
            prixUnitaire: z.number().min(0).describe("Prix unitaire en FCFA"),
            produitId: z.string().optional().describe("ID produit (si en stock)"),
          })).min(1).describe("Lignes de la vente"),
          modePaiement: z.enum(['especes', 'mtnMomo', 'orangeMoney', 'banque']).optional().describe("Mode de paiement (requis sauf crédit)"),
          aCredit: z.boolean().optional().describe("Vente à crédit ?"),
          tiersId: z.string().optional().describe("ID du client (requis si à crédit)"),
        }),
        execute: async ({ lignes, modePaiement, aCredit, tiersId }: {
          lignes: { designation: string; quantite: number; prixUnitaire: number; produitId?: string }[];
          modePaiement?: string; aCredit?: boolean; tiersId?: string;
        }) => {
          const result = await stub.enregistrerVente({
            lignes, modePaiement: modePaiement ?? null, aCredit,
            tiersId: tiersId ?? null, clientUuid: crypto.randomUUID(),
          });
          return result;
        },
      }),

      creer_depense: t({
        description: "Enregistre une dépense. TOUJOURS demander confirmation avant d'appeler.",
        parameters: z.object({
          categorie: z.string().describe("Catégorie (loyer, transport, fournitures, telecom, salaires, marketing, autre)"),
          libelle: z.string().describe("Description de la dépense"),
          montant: z.number().min(1).describe("Montant en FCFA"),
          modePaiement: z.enum(['especes', 'mtnMomo', 'orangeMoney', 'banque']).describe("Mode de paiement"),
        }),
        execute: async ({ categorie, libelle, montant, modePaiement }: {
          categorie: string; libelle: string; montant: number; modePaiement: string;
        }) => {
          const comptes: Record<string, string> = {
            loyer: '6132', transport: '6135', fournitures: '6040', telecom: '6282',
            salaires: '6610', marketing: '6270', autre: '6580',
          };
          const result = await stub.creerDepense({
            categorie, compteNumero: comptes[categorie] ?? '6580',
            libelle, montant, modePaiement, clientUuid: crypto.randomUUID(),
          });
          return result;
        },
      }),

      creer_tiers: t({
        description: "Crée un nouveau client ou fournisseur",
        parameters: z.object({
          nom: z.string().describe("Nom du tiers"),
          type: z.enum(['client', 'fournisseur']).default('client'),
          telephone: z.string().optional().describe("Numéro de téléphone"),
          email: z.string().optional(),
          adresse: z.string().optional(),
        }),
        execute: async ({ nom, type, telephone, email, adresse }: {
          nom: string; type: string; telephone?: string; email?: string; adresse?: string;
        }) => {
          const id = await stub.creerTiers({ type, nom, telephone, email, adresse });
          return { tiersId: id, message: `${type === 'client' ? 'Client' : 'Fournisseur'} "${nom}" créé` };
        },
      }),

      creer_produit: t({
        description: "Crée un nouveau produit dans le catalogue",
        parameters: z.object({
          nom: z.string().describe("Nom du produit"),
          prixVente: z.number().min(0).describe("Prix de vente en FCFA"),
          seuilAlerte: z.number().optional().describe("Seuil de stock bas (alerte)"),
        }),
        execute: async ({ nom, prixVente, seuilAlerte }: {
          nom: string; prixVente: number; seuilAlerte?: number;
        }) => {
          const id = await stub.creerProduit({ nom, prixVente, seuilAlerte });
          return { produitId: id, message: `Produit "${nom}" créé à ${prixVente} FCFA` };
        },
      }),

      creer_facture: t({
        description: "Crée une facture ou un devis. TOUJOURS demander confirmation.",
        parameters: z.object({
          type: z.enum(['facture', 'devis']).describe("Type de document"),
          tiersId: z.string().describe("ID du client"),
          lignes: z.array(z.object({
            designation: z.string(),
            quantite: z.number().min(1),
            prixUnitaire: z.number().min(0),
          })).min(1),
          dateEcheance: z.string().optional().describe("Date d'échéance YYYY-MM-DD"),
        }),
        execute: async ({ type, tiersId, lignes, dateEcheance }: {
          type: 'facture' | 'devis'; tiersId: string;
          lignes: { designation: string; quantite: number; prixUnitaire: number }[];
          dateEcheance?: string;
        }) => {
          const id = await stub.creerFacture({
            type, tiersId, lignes, dateEcheance,
            clientUuid: crypto.randomUUID(),
          });
          return { factureId: id, type, message: `${type === 'facture' ? 'Facture' : 'Devis'} créé(e)` };
        },
      }),

      emettre_facture: t({
        description: "Émet une facture (lui attribue un numéro officiel). Demander confirmation.",
        parameters: z.object({
          factureId: z.string().describe("ID de la facture à émettre"),
        }),
        execute: async ({ factureId }: { factureId: string }) => {
          const result = await stub.emettreFacture(factureId, 'FA');
          return result;
        },
      }),

      payer_vente: t({
        description: "Enregistre un paiement sur une vente à crédit. Demander confirmation.",
        parameters: z.object({
          venteId: z.string().describe("ID de la vente"),
          montant: z.number().min(1).describe("Montant payé en FCFA"),
          modePaiement: z.enum(['especes', 'mtnMomo', 'orangeMoney', 'banque']),
        }),
        execute: async ({ venteId, montant, modePaiement }: {
          venteId: string; montant: number; modePaiement: string;
        }) => {
          return await stub.payerVente(venteId, montant, modePaiement);
        },
      }),

      payer_facture: t({
        description: "Enregistre un paiement sur une facture. Demander confirmation.",
        parameters: z.object({
          factureId: z.string().describe("ID de la facture"),
          montant: z.number().min(1).describe("Montant payé en FCFA"),
          modePaiement: z.enum(['especes', 'mtnMomo', 'orangeMoney', 'banque']),
        }),
        execute: async ({ factureId, montant, modePaiement }: {
          factureId: string; montant: number; modePaiement: string;
        }) => {
          return await stub.payerFacture(factureId, montant, modePaiement);
        },
      }),

      approvisionner_stock: t({
        description: "Entrée de stock (achat de marchandises). Demander confirmation.",
        parameters: z.object({
          produitId: z.string().describe("ID du produit"),
          quantite: z.number().min(1).describe("Quantité achetée"),
          coutUnitaire: z.number().min(0).describe("Coût d'achat unitaire en FCFA"),
          modePaiement: z.enum(['especes', 'mtnMomo', 'orangeMoney', 'banque']).optional(),
          aCredit: z.boolean().optional().describe("Achat à crédit ?"),
          tiersId: z.string().optional().describe("ID du fournisseur"),
        }),
        execute: async ({ produitId, quantite, coutUnitaire, modePaiement, aCredit, tiersId }: {
          produitId: string; quantite: number; coutUnitaire: number;
          modePaiement?: string; aCredit?: boolean; tiersId?: string;
        }) => {
          return await stub.entrerStock({
            produitId, quantite, coutUnitaire,
            modePaiement: modePaiement ?? null, aCredit, tiersId: tiersId ?? null,
            clientUuid: crypto.randomUUID(),
          });
        },
      }),
    };
  }
}
