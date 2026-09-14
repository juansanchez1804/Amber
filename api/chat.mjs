import { readFileSync } from 'node:fs';

// Se leen los .md directamente: así, editar prompts/system.md desde GitHub
// cambia la voz de Amber sin ningún paso intermedio.
const leer = (n) => readFileSync(new URL(`../prompts/${n}`, import.meta.url), 'utf8');
const SYSTEM = leer('system.md');
const CLASIF = leer('clasificador.md');

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
  // Un número puesto en una barra no es algo que se comente: es desde dónde arranca.
  if (m.dia?.valor) l.push(`Hoy, antes de escribirte, puso su día en ${m.dia.valor} de 5 (1 es muy difícil, 5 muy bien). No se lo menciones, no lo nombres como número y no lo felicites ni lo compadezcas por eso: usalo solo para saber desde dónde arranca.`);
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

// La respuesta se manda de a pedazos: la primera palabra aparece mucho antes
// que la última, y el texto se lee como alguien escribiendo.
async function* anthropicStream(body, key) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const dec = new TextDecoder();
  let resto = '';
  for await (const trozo of r.body) {
    resto += dec.decode(trozo, { stream: true });
    const partes = resto.split('\n\n');
    resto = partes.pop();
    for (const parte of partes) {
      const linea = parte.split('\n').find(l => l.startsWith('data: '));
      if (!linea) continue;
      let d; try { d = JSON.parse(linea.slice(6)); } catch (e) { continue; }
      if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') yield d.delta.text;
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'solo POST' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'falta ANTHROPIC_API_KEY' });

  try {
    const { mensajes, memoria } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!Array.isArray(mensajes) || !mensajes.length)
      return res.status(400).json({ error: 'faltan mensajes' });

    const limpios = mensajes.slice(-30).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 4000),
    }));

    // clasificador: barato, rápido, determinista. Corre siempre, incluso al cortar:
    // el tope de mensajes no puede dejar a alguien en riesgo sin los teléfonos.
    let riesgo = { nivel: 'ninguno', motivo: '' };
    try {
      const ctx = limpios.slice(-4).map(m => `${m.role === 'user' ? 'PERSONA' : 'AMBER'}: ${m.content}`).join('\n');
      const out = await anthropic({ model: MODELO_CLASIF, max_tokens: 80, temperature: 0,
        system: CLASIF, messages: [{ role: 'user', content: ctx }] }, key);
      const j = JSON.parse((out.content?.[0]?.text ?? '').match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      if (['ninguno', 'atencion', 'alto'].includes(j.nivel)) riesgo = { nivel: j.nivel, motivo: j.motivo ?? '' };
    } catch (e) { console.error('clasificador:', e.message); }

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
    });
    const mandar = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    mandar({ tipo: 'riesgo', nivel: riesgo.nivel });

    if (mensajes.length > MAX_MENSAJES) {
      mandar({ tipo: 'texto', t: riesgo.nivel === 'alto'
        ? 'Hablamos mucho hoy y hasta acá puedo acompañarte en esta conversación. No te quedes solo con esto: el 135 en CABA y Gran Buenos Aires, el 0800 345 1435 desde el resto del país, y el 911 si es una emergencia ahora.'
        : 'Charlamos bastante por hoy. Si querés arrancar de nuevo, recargá la página.' });
      mandar({ tipo: 'fin', fin: true });
      return res.end();
    }

    const primera = limpios.filter(m => m.role === 'user').length === 1
      ? '\n\nEs el primer mensaje de la conversación. Vos ya abriste con una línea corta diciendo que estás acá: no vuelvas a saludar ni a presentarte.'
      : '';

    for await (const t of anthropicStream({
      model: MODELO_CHARLA,
      max_tokens: 400,
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `${bloqueMemoria(memoria)}\n\nSeñal del clasificador para el último mensaje: ${riesgo.nivel}${guiaPreguntas(limpios)}${primera}` },
      ],
      messages: limpios,
    }, key)) mandar({ tipo: 'texto', t });

    mandar({ tipo: 'fin' });
    res.end();
  } catch (e) {
    console.error(e);
    if (res.headersSent) { res.write(`data: ${JSON.stringify({ tipo: 'fin' })}\n\n`); res.end(); }
    else res.status(500).json({ error: e.message });
  }
}
