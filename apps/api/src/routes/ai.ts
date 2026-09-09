import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

export const ai = new Hono<AppEnv>();

ai.post('/chat', async (c) => {
  const entrepriseId = c.get('entrepriseId');
  const ns = c.env.KOMBI_AGENT;
  const agentId = ns.idFromName(entrepriseId);
  const agent = ns.get(agentId);

  const headers = new Headers(c.req.raw.headers);
  headers.set('x-kombi-user-id', c.get('utilisateurId'));
  headers.set('x-kombi-role', c.get('role'));

  const req = new Request(c.req.url, {
    method: 'POST',
    headers,
    body: c.req.raw.body,
  });

  const response = await agent.fetch(req);
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});
