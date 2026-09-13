import { SYSTEM, CLASIF } from './prompts.mjs';

const MODELO_CHARLA = 'claude-sonnet-5';
const MODELO_CLASIF = 'claude-haiku-4-5-20251001';
const MAX_MENSAJES  = 40;   // tope por conversación, para que nadie vacíe el saldo

function bloqueMemoria(m) {
  if (!m || !m.activa) return '';
  const l = [];
  if (m.apodo) l.push(`Le gusta que le digan: ${m.apodo}`);
  if (m.genero) l.push(`Cuando le hablás, usá el género gramatical ${m.genero}`);
  if (m.objetivos?.length)   l.push(`Lo que viene trabajando: ${m.objetivos.join('; ')}`);
  if (m.estrategias?.length) l.push(`Lo que le ayudó antes: ${m.estrategias.join('; ')}`);
  if (m.sensibles?.length)   l.push(`Temas sensibles, que vos no traés: ${m.sensibles.join('; ')}`);
  if (m.resumenes?.length)   l.push(`\nDe las últimas conversaciones:\n${m.resumenes.map(r => `- ${r}`).join('\n')}`);
  return l.length ? `\n\n## Lo que sabés de quien te escribe\n\n${l.join('\n')}` : '';
}

function guiaPreguntas(mensajes) {
  const u = [...mensajes].reverse().find(m => m.role === 'assistant');
  return u && /\?\s*$/.test(u.content.trim())
    ? '\n\nTu mensaje anterior terminó en pregunta. Este NO puede terminar en pregunta: devolvele algo en vez de pedirle algo.'
    : '';
}

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
    const { mensajes, memoria } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!Array.isArray(mensajes) || !mensajes.length)
      return res.status(400).json({ error: 'faltan mensajes' });
    if (mensajes.length > MAX_MENSAJES)
      return res.status(200).json({ texto: 'Charlamos bastante por hoy. Si querés arrancar de nuevo, recargá la página.', riesgo: 'ninguno', fin: true });

    const limpios = mensajes.slice(-30).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 4000),
    }));

    // clasificador: barato, rápido, determinista
    let riesgo = { nivel: 'ninguno', motivo: '' };
    try {
      const ctx = limpios.slice(-4).map(m => `${m.role === 'user' ? 'PERSONA' : 'AMBER'}: ${m.content}`).join('\n');
      const out = await anthropic({ model: MODELO_CLASIF, max_tokens: 80, temperature: 0,
        system: CLASIF, messages: [{ role: 'user', content: ctx }] }, key);
      const j = JSON.parse((out.content?.[0]?.text ?? '').match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      if (['ninguno', 'atencion', 'alto'].includes(j.nivel)) riesgo = { nivel: j.nivel, motivo: j.motivo ?? '' };
    } catch (e) { console.error('clasificador:', e.message); }

    const out = await anthropic({
      model: MODELO_CHARLA,
      max_tokens: 400,
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `${bloqueMemoria(memoria)}\n\nSeñal del clasificador para el último mensaje: ${riesgo.nivel}${guiaPreguntas(limpios)}` },
      ],
      messages: limpios,
    }, key);

    const texto = out.content?.filter(c => c.type === 'text').map(c => c.text).join('') ?? '';
    res.status(200).json({ texto, riesgo: riesgo.nivel });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
