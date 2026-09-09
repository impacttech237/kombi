import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

export const ai = new Hono<AppEnv>();

/**
 * POST /api/ai/chat — envoie un message à l'agent IA de l'entreprise.
 * Le body suit le format AI SDK : { messages: Message[] }
 * La réponse est un data stream (SSE) pour le streaming temps réel.
 */
ai.post('/chat', async (c) => {
  const entrepriseId = c.get('entrepriseId');
  const ns = c.env.KOMBI_AGENT;
  const agentId = ns.idFromName(entrepriseId);
  const agent = ns.get(agentId);

  // Forward la requête au DO agent qui gère le streaming
  const req = new Request(c.req.url, {
    method: 'POST',
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  });

  const response = await agent.fetch(req);
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});
