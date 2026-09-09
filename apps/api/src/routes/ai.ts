import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

export const ai = new Hono<AppEnv>();

function getAgent(c: { get(k: 'entrepriseId'): string; env: AppEnv['Bindings'] }) {
  const entrepriseId = c.get('entrepriseId');
  const ns = c.env.KOMBI_AGENT;
  return ns.get(ns.idFromName(entrepriseId));
}

ai.post('/chat', async (c) => {
  const agent = getAgent(c);
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

ai.get('/history', async (c) => {
  const agent = getAgent(c);
  const res = await agent.fetch(new Request('https://do/history', { method: 'GET' }));
  return new Response(res.body, { status: res.status, headers: res.headers });
});

ai.delete('/history', async (c) => {
  const agent = getAgent(c);
  const res = await agent.fetch(new Request('https://do/history', { method: 'DELETE' }));
  return new Response(res.body, { status: res.status, headers: res.headers });
});

ai.get('/alerts', async (c) => {
  const agent = getAgent(c);
  const res = await agent.fetch(new Request('https://do/alerts', { method: 'GET' }));
  return new Response(res.body, { status: res.status, headers: res.headers });
});

ai.get('/reminders', async (c) => {
  const agent = getAgent(c);
  const res = await agent.fetch(new Request('https://do/reminders', { method: 'GET' }));
  return new Response(res.body, { status: res.status, headers: res.headers });
});

ai.post('/reminders', async (c) => {
  const agent = getAgent(c);
  const res = await agent.fetch(new Request('https://do/reminders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: c.req.raw.body,
  }));
  return new Response(res.body, { status: res.status, headers: res.headers });
});
