import { readFileSync } from 'node:fs';

// La voz sale del mismo archivo que el resto: una despedida tiene que sonar a
// Amber, no a un sistema cerrando una sesión.
const leer = (n) => readFileSync(new URL(`../prompts/${n}`, import.meta.url), 'utf8');
const SYSTEM = leer('system.md');
const CIERRE = leer('cierre.md');

const MODELO = 'claude-sonnet-5';

async function anthropic(body, key) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'solo POST' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'falta ANTHROPIC_API_KEY' });

  try {
    const { mensajes } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!Array.isArray(mensajes) || !mensajes.length)
      return res.status(400).json({ error: 'faltan mensajes' });

    const charla = mensajes.slice(-30)
      .map(m => `${m.role === 'assistant' ? 'AMBER' : 'PERSONA'}: ${String(m.content).slice(0, 4000)}`)
      .join('\n');

    const out = await anthropic({
      model: MODELO,
      max_tokens: 400,
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: CIERRE },
      ],
      messages: [{ role: 'user', content: charla }],
    }, key);

    // Sonnet 5 puede devolver un bloque de pensamiento antes del texto: el
    // primer bloque no es necesariamente la respuesta.
    const txt = (out.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('');
    const j = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    const str = (v) => (typeof v === 'string' ? v.trim() : '');

    res.json({ despedida: str(j.despedida), resumen: str(j.resumen).slice(0, 300) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'no se pudo cerrar' });
  }
}
