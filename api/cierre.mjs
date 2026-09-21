import { readFileSync } from 'node:fs';
// La voz sale del mismo archivo que el resto, en la misma versión que elige el chat:
// una despedida tiene que sonar a Amber, no a un sistema cerrando una sesión.
import { SYSTEM } from './chat.mjs';

const leer = (n) => readFileSync(new URL(`../prompts/${n}`, import.meta.url), 'utf8');
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
    const { mensajes, genero } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!Array.isArray(mensajes) || !mensajes.length)
      return res.status(400).json({ error: 'faltan mensajes' });

    // El género viene del onboarding (m, f, neutro; las memorias viejas lo traen
    // escrito entero). Sin él, el resumen elige uno solo y se lo pone a la persona.
    const generoTexto = { m: 'masculino', masculino: 'masculino', f: 'femenino', femenino: 'femenino',
      neutro: 'pidió que no se lo marques' }[genero] ?? 'no se sabe: escribí sin marcarlo';
    // Toda la charla, con el mismo tope que el chat: el resumen es de lo que pasó, no del final.
    const charla = mensajes.slice(-200)
      .map(m => `${m.role === 'assistant' ? 'AMBER' : 'PERSONA'}: ${String(m.content).slice(0, 4000)}`)
      .join('\n');

    const out = await anthropic({
      model: MODELO,
      // Sonnet 5 piensa antes de escribir y el tope cuenta ese pensamiento. Con 400, una
      // de seis despedidas salió vacía (la de después de una crisis) y el resumen se
      // perdía: esa charla no quedaba en la memoria.
      max_tokens: 2048,
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: CIERRE },
      ],
      messages: [{ role: 'user', content: `Datos de la persona:\n- Género gramatical: ${generoTexto}\n\nLa charla:\n${charla}` }],
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
