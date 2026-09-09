import { Think } from '@cloudflare/think';
import { generateText, streamText, tool } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
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

  private _tablesReady = false;
  private ensureTables() {
    if (this._tablesReady) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    this._tablesReady = true;
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

    if (path.endsWith('/reminders') && request.method === 'GET') {
      return this.handleReminders(request);
    }

    if (path.endsWith('/reminders') && request.method === 'POST') {
      return this.handleReminderToggle(request);
    }

    // Capture user context from headers for system prompt
    (this as any)._userId = request.headers.get('x-kombi-user-id') ?? 'inconnu';
    (this as any)._userRole = request.headers.get('x-kombi-role') ?? 'membre';
    (this as any)._userName = request.headers.get('x-kombi-user-name') ?? '';
    (this as any)._entrepriseName = request.headers.get('x-kombi-entreprise-name') ?? '';

    if (request.method === 'POST' && (path.endsWith('/chat') || path === '/')) {
      return this.handleChat(request);
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleChat(request: Request): Promise<Response> {
    let userContent: string | undefined;
    let messages: { role: string; content: string }[] = [];
    try {
      const body = await request.json() as { messages?: { role: string; content: string }[] };
      messages = body.messages ?? [];
      const last = messages[messages.length - 1];
      if (last?.role === 'user') {
        userContent = last.content;
        this.saveMessage({ id: crypto.randomUUID(), role: 'user', content: last.content });
      }
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const workersAI = createWorkersAI({ binding: this.env.AI });
    const modelId = this.getModel();
    const model = workersAI(modelId);
    const system = this.getSystemPrompt();
    const tools = this.getTools();
    const self = this;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let chatMessages = [...messages] as any[];

          // Multi-step tool calling: up to 5 rounds so the agent can investigate
          for (let step = 0; step < 5; step++) {
            const gen = await generateText({
              model,
              system,
              tools,
              messages: chatMessages,
            });

            // If the model made tool calls, emit them and add to conversation
            if (gen.toolCalls?.length) {
              for (const tc of gen.toolCalls) {
                controller.enqueue(encoder.encode(
                  `9:${JSON.stringify({ toolCallId: tc.toolCallId, toolName: tc.toolName })}\n`
                ));
              }
              if (gen.toolResults?.length) {
                for (const tr of gen.toolResults as any[]) {
                  controller.enqueue(encoder.encode(
                    `a:${JSON.stringify({ toolCallId: tr.toolCallId })}\n`
                  ));
                }
              }
              // Add response messages (properly formatted) for the next round
              chatMessages.push(...(gen as any).response.messages);
              continue; // another round to get the text response
            }

            // No tool calls — model produced text, emit it and break
            if (gen.text) {
              for (const chunk of gen.text.match(/.{1,20}/g) ?? [gen.text]) {
                controller.enqueue(encoder.encode(`0:${JSON.stringify(chunk)}\n`));
              }
              self.saveMessage({ id: crypto.randomUUID(), role: 'assistant', content: gen.text });
            }
            break;
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`3:${JSON.stringify(String(err))}\n`));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  private async handleAlerts(): Promise<Response> {
    const proactiveAlerts: { type: string; gravite: string; message: string }[] = [];
    let resume: { ventesJour: number; caJour: number; tresorerieTotal: number } | null = null;

    try {
      const stub = this.stub;

      // Each call wrapped individually so one failure doesn't break everything
      const [alertes, soldes, stats] = await Promise.allSettled([
        stub.alertesPilotage(),
        stub.soldesTresorerie(),
        stub.statsJour(),
      ]);

      if (alertes.status === 'fulfilled' && Array.isArray(alertes.value)) {
        for (const a of alertes.value as { type: string; gravite: string; libelle: string }[]) {
          proactiveAlerts.push({ type: a.type, gravite: a.gravite, message: a.libelle });
        }
      }

      if (soldes.status === 'fulfilled' && soldes.value) {
        const s = soldes.value as unknown as Record<string, number>;
        const total = (s.especes ?? 0) + (s.mtnMomo ?? 0) + (s.orangeMoney ?? 0) + (s.banque ?? 0);
        if (total < 50_000) {
          proactiveAlerts.push({
            type: 'tresorerie_critique',
            gravite: 'critique',
            message: `Trésorerie totale très basse : ${Math.round(total).toLocaleString('fr')} FCFA`,
          });
        }
        const st = stats.status === 'fulfilled' ? stats.value as unknown as Record<string, number> : null;
        resume = {
          ventesJour: st?.nbVentes ?? 0,
          caJour: st?.totalJour ?? 0,
          tresorerieTotal: Math.round(total),
        };
      }
    } catch {
      // total failure — return empty
    }

    return Response.json({ alertes: proactiveAlerts, resume });
  }

  // ── Scheduled daily digest via DO alarm ──

  private ensureScheduleTable() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_reminders (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        cron_hour INTEGER NOT NULL DEFAULT 8,
        last_run TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  async scheduleNextAlarm() {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(7, 0, 0, 0); // 8h WAT (UTC+1)
    if (next <= now) next.setDate(next.getDate() + 1);
    await this.ctx.storage.setAlarm(next.getTime());
  }

  async alarm() {
    this.ensureScheduleTable();
    const reminders = [...this.ctx.storage.sql.exec(
      `SELECT id, type FROM scheduled_reminders WHERE enabled = 1`,
    )] as { id: string; type: string }[];

    if (reminders.length === 0) {
      await this.scheduleNextAlarm();
      return;
    }

    try {
      const stub = this.stub;
      const digest: string[] = [];

      for (const r of reminders) {
        try {
          if (r.type === 'daily_summary') {
            const [stats, soldes] = await Promise.allSettled([
              stub.statsJour(),
              stub.soldesTresorerie(),
            ]);
            if (stats.status === 'fulfilled') {
              const s = stats.value as unknown as { nbVentes: number; totalJour: number };
              digest.push(`Ventes hier : ${s.nbVentes} pour ${s.totalJour.toLocaleString('fr')} FCFA`);
            }
            if (soldes.status === 'fulfilled') {
              const s = soldes.value as unknown as Record<string, number>;
              const total = (s.especes ?? 0) + (s.mtnMomo ?? 0) + (s.orangeMoney ?? 0) + (s.banque ?? 0);
              digest.push(`Trésorerie : ${Math.round(total).toLocaleString('fr')} FCFA`);
            }
          } else if (r.type === 'unpaid_invoices') {
            const factures = await stub.listerFacturesImpayees() as unknown as { id: string }[];
            if (Array.isArray(factures) && factures.length > 0) {
              digest.push(`${factures.length} facture(s) impayée(s) à relancer`);
            }
          } else if (r.type === 'low_stock') {
            const produits = await stub.listerProduits() as unknown as { en_alerte: number; nom: string }[];
            if (Array.isArray(produits)) {
              const alertes = produits.filter(p => p.en_alerte);
              if (alertes.length > 0) {
                digest.push(`${alertes.length} produit(s) en stock bas`);
              }
            }
          }

          this.ctx.storage.sql.exec(
            `UPDATE scheduled_reminders SET last_run = datetime('now') WHERE id = ?`,
            r.id,
          );
        } catch { /* skip individual reminder */ }
      }

      if (digest.length > 0) {
        this.saveMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `📋 **Résumé quotidien**\n\n${digest.map(d => `- ${d}`).join('\n')}`,
        });
      }
    } catch { /* best-effort */ }

    await this.scheduleNextAlarm();
  }

  private handleReminders(request: Request): Response {
    this.ensureScheduleTable();
    const url = new URL(request.url);

    if (request.method === 'GET') {
      const rows = [...this.ctx.storage.sql.exec(
        `SELECT id, type, enabled, cron_hour, last_run FROM scheduled_reminders ORDER BY created_at`,
      )];
      return Response.json({ reminders: rows });
    }

    return Response.json({ erreur: 'Méthode non supportée' }, { status: 405 });
  }

  private async handleReminderToggle(request: Request): Promise<Response> {
    this.ensureScheduleTable();
    const { type, enabled } = await request.json() as { type: string; enabled: boolean };

    const existing = [...this.ctx.storage.sql.exec(
      `SELECT id FROM scheduled_reminders WHERE type = ?`, type,
    )];

    if (existing.length === 0) {
      this.ctx.storage.sql.exec(
        `INSERT INTO scheduled_reminders (id, type, enabled) VALUES (?, ?, ?)`,
        crypto.randomUUID(), type, enabled ? 1 : 0,
      );
    } else {
      this.ctx.storage.sql.exec(
        `UPDATE scheduled_reminders SET enabled = ? WHERE type = ?`,
        enabled ? 1 : 0, type,
      );
    }

    // Ensure alarm is scheduled
    const anyEnabled = [...this.ctx.storage.sql.exec(
      `SELECT 1 FROM scheduled_reminders WHERE enabled = 1 LIMIT 1`,
    )];
    if (anyEnabled.length > 0) {
      await this.scheduleNextAlarm();
    }

    return Response.json({ ok: true });
  }

  getModel() {
    return (this.env as any).AI_MODEL ?? '@cf/meta/llama-4-scout-17b-16e-instruct';
  }

  getSystemPrompt(): string {
    const userId = (this as any)._userId ?? 'inconnu';
    const role = (this as any)._userRole ?? 'membre';
    const userName = (this as any)._userName ?? '';
    const entrepriseName = (this as any)._entrepriseName ?? '';
    const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const prenom = userName ? userName.split(' ')[0] : 'patron';
    return `Tu es Kombi, assistant de gestion de ${entrepriseName || 'cette entreprise'}. Date : ${today}.
Tu tutoies ${prenom}. Tu es chaleureux et direct.

COMMENT RÉPONDRE :
1. Appelle un outil pour chaque question sur les données.
2. L'outil te retourne une ANALYSE PRÊTE. Reprends-la telle quelle dans ta réponse en la rendant naturelle et chaleureuse.
3. N'AJOUTE RIEN de toi-même. Ne complète pas avec des conseils génériques. Le texte de l'outil contient déjà l'analyse et le conseil.
4. Tu peux reformuler légèrement pour le ton, mais garde TOUS les chiffres et noms exacts de l'outil.
5. Montants en **gras** : **1 500 000 FCFA**.
6. Réponse courte : pas plus de 8 lignes.

ACTIONS (vente, dépense, facture) : résume + demande "Je fais ça ?" AVANT d'exécuter.

INTERDIT : inventer des chiffres, ajouter des conseils que l'outil n'a pas donnés, dire "il faudrait vérifier/analyser", vouvoyer.`;
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
        description: "Top PRODUITS les plus vendus. Utilise pour : meilleures ventes, top produits, qu'est-ce qui se vend le mieux.",
        parameters: z.object({
          limite: z.number().max(20).default(5),
        }),
        execute: async ({ limite }: { limite: number }) => {
          const data = await stub.meilleuresVentes(limite) as any[];
          if (!Array.isArray(data) || data.length === 0) return 'Aucune vente enregistrée.';
          const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
          const totalCA = data.reduce((s: number, p: any) => s + (p.montant_ht ?? 0), 0);
          const lines = data.map((p: any, i: number) => {
            const ca = p.montant_ht ?? 0;
            const pct = totalCA > 0 ? Math.round(ca / totalCA * 100) : 0;
            return `${i + 1}. **${p.designation ?? 'Produit'}** — **${fmt(ca)} FCFA** (${pct}% du CA, ${p.quantite ?? '?'} vendus)`;
          });
          return `Top ${data.length} produits :\n${lines.join('\n')}`;
        },
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

      // ── Phase 6 : commandes, dettes, annulations, rapports ──

      liste_commandes: t({
        description: "Liste les commandes/missions en cours avec tâches et coûts",
        parameters: z.object({}),
        execute: async () => stub.listerCommandes(),
      }),

      creer_commande: t({
        description: "Crée une nouvelle commande ou mission. Demander confirmation.",
        parameters: z.object({
          type: z.enum(['commande', 'mission']).optional().describe("Type"),
          libelle: z.string().describe("Intitulé"),
          montant: z.number().optional().describe("Montant en FCFA"),
          tiersId: z.string().optional().describe("ID du client"),
          datePrevue: z.string().optional().describe("Date prévue YYYY-MM-DD"),
          description: z.string().optional(),
          priorite: z.enum(['basse', 'normale', 'haute', 'urgente']).optional(),
        }),
        execute: async (args: {
          type?: 'commande' | 'mission'; libelle: string; montant?: number; tiersId?: string;
          datePrevue?: string; description?: string; priorite?: string;
        }) => {
          return await stub.creerCommande({
            ...args, tiersId: args.tiersId ?? null, montant: args.montant ?? null,
            datePrevue: args.datePrevue ?? null, description: args.description ?? null,
            clientUuid: crypto.randomUUID(),
          });
        },
      }),

      changer_statut_commande: t({
        description: "Change le statut d'une commande (en_cours, terminee, annulee, en_attente). Demander confirmation.",
        parameters: z.object({
          commandeId: z.string().describe("ID de la commande"),
          statut: z.string().describe("Nouveau statut"),
        }),
        execute: async ({ commandeId, statut }: { commandeId: string; statut: string }) => {
          return await stub.changerStatutCommande(commandeId, statut);
        },
      }),

      annuler_vente: t({
        description: "Annule une vente. Demander confirmation.",
        parameters: z.object({
          venteId: z.string().describe("ID de la vente à annuler"),
        }),
        execute: async ({ venteId }: { venteId: string }) => {
          return await stub.annulerVente(venteId);
        },
      }),

      payer_dette_fournisseur: t({
        description: "Paye une dette fournisseur (achat à crédit). Demander confirmation.",
        parameters: z.object({
          achatId: z.string().describe("ID de l'achat/dette"),
          montant: z.number().min(1).describe("Montant en FCFA"),
          modePaiement: z.enum(['especes', 'mtnMomo', 'orangeMoney', 'banque']),
        }),
        execute: async ({ achatId, montant, modePaiement }: {
          achatId: string; montant: number; modePaiement: string;
        }) => {
          return await stub.payerAchat(achatId, montant, modePaiement);
        },
      }),

      convertir_devis_en_facture: t({
        description: "Convertit un devis accepté en facture. Demander confirmation.",
        parameters: z.object({
          devisId: z.string().describe("ID du devis à convertir"),
        }),
        execute: async ({ devisId }: { devisId: string }) => {
          const factureId = await stub.convertirDevisEnFacture(devisId);
          return { factureId, message: 'Devis converti en facture' };
        },
      }),

      creer_avoir: t({
        description: "Crée un avoir (note de crédit) sur une facture. Demander confirmation.",
        parameters: z.object({
          factureId: z.string().describe("ID de la facture"),
        }),
        execute: async ({ factureId }: { factureId: string }) => {
          return await stub.creerAvoir(factureId, 'AVO');
        },
      }),

      detail_tiers: t({
        description: "Détail d'un client/fournisseur : ventes, factures, solde dû",
        parameters: z.object({
          tiersId: z.string().describe("ID du tiers"),
        }),
        execute: async ({ tiersId }: { tiersId: string }) => {
          return await stub.getTiersDetail(tiersId);
        },
      }),

      rapport_periode: t({
        description: "Génère un rapport financier pour une période donnée",
        parameters: z.object({
          type: z.enum(['mensuel', 'trimestriel', 'annuel', 'comparaison', 'personnalise']).describe("Type de rapport"),
          debut: z.string().describe("Date début YYYY-MM-DD"),
          fin: z.string().describe("Date fin YYYY-MM-DD"),
        }),
        execute: async ({ type, debut, fin }: {
          type: 'mensuel' | 'trimestriel' | 'annuel' | 'comparaison' | 'personnalise'; debut: string; fin: string;
        }) => {
          return await stub.rapport({ type, periode: { debut, fin } });
        },
      }),

      marge_par_produit: t({
        description: "Marge bénéficiaire détaillée par produit",
        parameters: z.object({}),
        execute: async () => stub.margeParProduit(),
      }),

      marge_par_client: t({
        description: "Classement des CLIENTS par chiffre d'affaires et marge. Utilise pour : meilleur client, top clients, qui achète le plus.",
        parameters: z.object({}),
        execute: async () => {
          const data = await stub.margeParClient() as any[];
          if (!Array.isArray(data) || data.length === 0) return 'Aucun client enregistré.';
          const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
          const named = data.filter((c: any) => c.nom && c.nom !== 'Vente au comptant / client de passage');
          const best = named.length > 0 ? named : data;
          const top = best[0];
          const totalCA = data.reduce((s: number, c: any) => s + (c.ca_ht ?? 0), 0);
          const topCA = top.ca_ht ?? 0;
          const pct = totalCA > 0 ? Math.round(topCA / totalCA * 100) : 0;

          let result = `Ton meilleur client c'est **${top.nom}** avec **${fmt(topCA)} FCFA** de CA`;
          if (top.marge != null) result += ` et **${fmt(top.marge)} FCFA** de marge (${top.margePct ?? '?'}%)`;
          result += `. Il représente **${pct}%** de ton chiffre d'affaires. ${top.nb_ventes} vente(s).`;

          if (best.length > 1) {
            result += `\nTop 3 :`;
            best.slice(0, 3).forEach((c: any, i: number) => {
              result += `\n${i + 1}. **${c.nom}** — **${fmt(c.ca_ht ?? 0)} FCFA**, marge ${c.margePct ?? '?'}%`;
            });
          }
          return result;
        },
      }),

      budget_du_mois: t({
        description: "Budget et objectifs du mois en cours",
        parameters: z.object({
          anneeMois: z.string().optional().describe("YYYY-MM (défaut: mois courant)"),
        }),
        execute: async ({ anneeMois }: { anneeMois?: string }) => {
          const am = anneeMois ?? new Date().toISOString().slice(0, 7);
          return await stub.getBudget(am);
        },
      }),

      journal_audit: t({
        description: "Journal d'audit : historique des actions et vérification d'intégrité",
        parameters: z.object({}),
        execute: async () => {
          const [entrees, integrite] = await Promise.all([
            stub.listerAuditLog(),
            stub.verifierChaineAudit(),
          ]);
          return { entrees, integrite };
        },
      }),
      lien_pdf_facture: t({
        description: "Génère le lien pour télécharger/voir le PDF d'une facture",
        parameters: z.object({
          factureId: z.string().describe("ID de la facture"),
        }),
        execute: async ({ factureId }: { factureId: string }) => {
          return { url: `/api/factures/${factureId}/pdf`, message: 'Cliquez sur le lien pour voir le PDF' };
        },
      }),

      diagnostic_tresorerie: t({
        description: "Diagnostic complet de la trésorerie. Utilise cet outil quand on parle de trésorerie, caisse, argent, ou pourquoi c'est négatif. Retourne une analyse prête à relayer.",
        parameters: z.object({}),
        execute: async () => {
          const [soldes, credits, depenses, dettes] = await Promise.allSettled([
            stub.soldesTresorerie(),
            stub.listerVentesACredit(),
            stub.listerDepenses(),
            stub.listerDettesFournisseurs(),
          ]);

          const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');
          const s = soldes.status === 'fulfilled' ? soldes.value as any : null;
          const totalTreso = s ? (s.especes ?? 0) + (s.mtnMomo ?? 0) + (s.orangeMoney ?? 0) + (s.banque ?? 0) : 0;

          const parts: string[] = [];

          // Headline
          if (totalTreso < 0) {
            parts.push(`Ta trésorerie est à **${fmt(totalTreso)} FCFA**, c'est critique 🔴`);
          } else if (totalTreso < 100000) {
            parts.push(`Ta trésorerie est tendue à **${fmt(totalTreso)} FCFA** 🟡`);
          } else {
            parts.push(`Ta trésorerie va bien : **${fmt(totalTreso)} FCFA** 🟢`);
          }

          // Detail caisses
          if (s) {
            const parts2: string[] = [];
            if (s.especes) parts2.push(`espèces **${fmt(s.especes)}**`);
            if (s.mtnMomo) parts2.push(`MoMo **${fmt(s.mtnMomo)}**`);
            if (s.orangeMoney) parts2.push(`OM **${fmt(s.orangeMoney)}**`);
            if (s.banque) parts2.push(`banque **${fmt(s.banque)}**`);
            if (parts2.length > 1) parts.push(`Détail : ${parts2.join(', ')}.`);
          }

          // Causes (only if negative/tight)
          if (totalTreso < 100000) {
            const causes: string[] = [];

            const creditsList = credits.status === 'fulfilled' && Array.isArray(credits.value) ? credits.value as any[] : [];
            const creditsWithDebt = creditsList.filter((v: any) => (v.reste_du ?? v.montant ?? 0) > 0);
            if (creditsWithDebt.length > 0) {
              const totalCredits = creditsWithDebt.reduce((sum: number, v: any) => sum + (v.reste_du ?? v.montant ?? 0), 0);
              const top = creditsWithDebt.slice(0, 2).map((v: any) =>
                `${v.tiers_nom ?? 'un client'} te doit **${fmt(v.reste_du ?? v.montant ?? 0)} FCFA**`
              ).join(' et ');
              causes.push(`**${fmt(totalCredits)} FCFA** de ventes à crédit non récupérées (${creditsWithDebt.length} clients). ${top}`);
            }

            const depensesList = depenses.status === 'fulfilled' && Array.isArray(depenses.value) ? depenses.value as any[] : [];
            if (depensesList.length > 0) {
              const totalDep = depensesList.reduce((sum: number, d: any) => sum + (d.montant ?? 0), 0);
              const parCat: Record<string, number> = {};
              for (const d of depensesList) parCat[d.categorie ?? 'autre'] = (parCat[d.categorie ?? 'autre'] ?? 0) + (d.montant ?? 0);
              const topCat = Object.entries(parCat).sort((a, b) => b[1] - a[1])[0];
              if (topCat) {
                causes.push(`**${fmt(totalDep)} FCFA** de dépenses ce mois, le plus gros poste c'est ${topCat[0]} (**${fmt(topCat[1])} FCFA**)`);
              }
            }

            const dettesList = dettes.status === 'fulfilled' && Array.isArray(dettes.value) ? dettes.value as any[] : [];
            const dettesWithDebt = dettesList.filter((d: any) => (d.reste_du ?? d.montant ?? 0) > 0);
            if (dettesWithDebt.length > 0) {
              const totalDettes = dettesWithDebt.reduce((sum: number, d: any) => sum + (d.reste_du ?? d.montant ?? 0), 0);
              causes.push(`**${fmt(totalDettes)} FCFA** de dettes fournisseurs à payer`);
            }

            if (causes.length > 0) {
              parts.push(`Ce qui plombe ta caisse :`);
              causes.forEach(c => parts.push(`- ${c}`));
            }

            // Conseil
            if (creditsWithDebt.length > 0) {
              const top = creditsWithDebt[0];
              parts.push(`Mon conseil : relance en priorité **${top.tiers_nom ?? 'ton plus gros débiteur'}**, ça peut te récupérer **${fmt(top.reste_du ?? top.montant ?? 0)} FCFA** rapidement.`);
            }
          }

          return parts.join('\n');
        },
      }),

      suggestions_business: t({
        description: "Analyse les données et propose des actions concrètes pour améliorer la gestion",
        parameters: z.object({}),
        execute: async () => {
          const [impayees, credit, alertes, stats] = await Promise.allSettled([
            stub.listerFacturesImpayees(),
            stub.listerVentesACredit(),
            stub.alertesPilotage(),
            stub.statsJour(),
          ]);
          const suggestions: string[] = [];

          if (impayees.status === 'fulfilled' && Array.isArray(impayees.value) && (impayees.value as any[]).length > 0) {
            const arr = impayees.value as any[];
            const total = arr.reduce((s: number, f: any) => s + (f.montant_ttc ?? 0), 0);
            suggestions.push(`${arr.length} facture(s) impayée(s) pour ${Math.round(total).toLocaleString('fr')} FCFA — relancer les clients`);
          }
          if (credit.status === 'fulfilled' && Array.isArray(credit.value) && (credit.value as any[]).length > 0) {
            suggestions.push(`${(credit.value as any[]).length} vente(s) à crédit non soldée(s) — envisager des rappels`);
          }
          if (alertes.status === 'fulfilled' && Array.isArray(alertes.value)) {
            const stockBas = (alertes.value as any[]).filter(a => a.type === 'stock_bas');
            if (stockBas.length > 0) {
              suggestions.push(`${stockBas.length} produit(s) en stock bas — réapprovisionner`);
            }
          }
          if (suggestions.length === 0) suggestions.push('Tout semble en ordre ! Continuez sur cette lancée.');
          return { suggestions };
        },
      }),
    };
  }
}
