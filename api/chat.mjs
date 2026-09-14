import { readFileSync } from 'node:fs';

// Se leen los .md directamente: así, editar prompts/system.md desde GitHub
// cambia la voz de Amber sin ningún paso intermedio.
const leer = (n) => readFileSync(new URL(`../prompts/${n}`, import.meta.url), 'utf8');
const SYSTEM = leer('system.md');
const CLASIF = leer('clasificador.md');

const MODELO_CHARLA = 'claude-sonnet-5';
const MODELO_CLASIF = 'claude-haiku-4-5-20251001';
const MAX_MENSAJES  = 40;   // tope por conversación, para que nadie vacíe el saldo

// Frases que literalmente hablan de matarse o morirse. Las frases hechas
// ("me quiero morir de vergüenza") no cuentan.
const FRASE_LITERAL = /\b(me\s+quiero\s+(matar|morir)|quiero\s+(matarme|morirme)|me\s+voy\s+a\s+(matar|morir)|matarme|morirme|suicid\w*|(me\s+quiero\s+tirar|tirarme)\s+(abajo|debajo)\s+de)\b(?!\s+de\s+(la\s+)?(risa|vergüenza|verguenza|amor|hambre|sueño|calor|frío|frio|ganas|envidia))/i;

function bloqueMemoria(m) {
  if (!m || !m.activa) return '';
  const l = [];
  if (m.apodo) l.push(`Le gusta que le digan: ${m.apodo}`);
  if (m.genero) l.push(`Cuando le hablás, usá el género gramatical ${m.genero}`);
  if (m.objetivos?.length)   l.push(`Lo que viene trabajando: ${m.objetivos.join('; ')}`);
  if (m.estrategias?.length) l.push(`Lo que le ayudó antes: ${m.estrategias.join('; ')}`);
  if (m.sensibles?.length)   l.push(`Temas sensibles, que vos no traés: ${m.sensibles.join('; ')}`);
  // Ya abriste preguntando por esto, así que lo que te escribe es la respuesta.
  if (m.dia?.valor) l.push(`Hoy marcó su día en ${m.dia.valor} de 5 (1 muy difícil, 5 muy bien) y vos ya abriste preguntándole por eso. No repitas el número ni lo trates como un puntaje: es de dónde viene, no un dato que se comenta.`);
  // Los resúmenes viejos son texto suelto; los que deja el cierre traen fecha.
  if (m.resumenes?.length) {
    const hoy = Date.parse(new Date().toISOString().slice(0, 10));
    const linea = (r) => {
      if (typeof r === 'string') return r;
      const d = Math.round((hoy - Date.parse(r.f)) / 86400000);
      const c = d <= 0 ? 'Hoy' : d === 1 ? 'Ayer' : d < 7 ? `Hace ${d} días`
              : d < 14 ? 'La semana pasada' : `Hace ${Math.floor(d / 7)} semanas`;
      return `${c}, ${r.t.charAt(0).toLowerCase()}${r.t.slice(1)}`;
    };
    l.push(`\nDe las últimas conversaciones:\n${m.resumenes.map(r => `- ${linea(r)}`).join('\n')}`);
  }
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
    const { mensajes, memoria, ambiguos } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
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
      if (['ninguno', 'ambiguo', 'atencion', 'alto'].includes(j.nivel)) riesgo = { nivel: j.nivel, motivo: j.motivo ?? '' };
    } catch (e) { console.error('clasificador:', e.message); }

    // Una frase de hacerse daño dicha de bronca se nombra una vez. Si vuelve a
    // aparecer en la misma conversación, sube a alto. Esto no depende del
    // clasificador: si la persona ya aclaró "de bronca", tiende a leer la segunda
    // con ese filtro y a dejarla pasar.
    const dePersona = limpios.filter(m => m.role === 'user');
    const literalAhora = FRASE_LITERAL.test(dePersona.at(-1)?.content ?? '');
    const literalAntes = dePersona.slice(0, -1).some(m => FRASE_LITERAL.test(m.content));
    const fueAmbiguo = riesgo.nivel === 'ambiguo' || (literalAhora && riesgo.nivel === 'ninguno');
    if (fueAmbiguo && riesgo.nivel === 'ninguno') riesgo = { nivel: 'ambiguo', motivo: `${riesgo.motivo} (frase literal)` };
    if (fueAmbiguo && (Number(ambiguos) >= 1 || literalAntes)) riesgo = { nivel: 'alto', motivo: `${riesgo.motivo} (repetida)` };

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
    });
    const mandar = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    mandar({ tipo: 'riesgo', nivel: riesgo.nivel, ambiguo: fueAmbiguo });

    if (mensajes.length > MAX_MENSAJES) {
      mandar({ tipo: 'texto', t: riesgo.nivel === 'alto'
        ? 'Hablamos mucho hoy y hasta acá puedo acompañarte en esta conversación. No te quedes con esto sin nadie: el 135 en CABA y Gran Buenos Aires, el 0800 345 1435 desde el resto del país, y el 911 si es una emergencia ahora.'
        : 'Charlamos bastante por hoy. Si querés arrancar de nuevo, recargá la página.' });
      mandar({ tipo: 'fin', fin: true });
      return res.end();
    }

    // Con alto, el modelo tiende a leer "me robaron la bici", decidir que la señal
    // exagera y seguir con la bici. Explicarle por qué es alto evita que la ignore.
    const porQue = riesgo.motivo.endsWith('(repetida)')
      ? '\n\nEs alto porque es la segunda vez en esta conversación que la persona dice que se quiere matar o morir. La primera vez dijo que era de bronca. Esta vez no la tomes como forma de decir: preguntale en serio cómo está, en una o dos oraciones, sin seguir con el tema anterior.'
      : riesgo.nivel === 'alto'
        ? '\n\nLa señal es alto: aplicá el protocolo aunque el mensaje parezca liviano. No sigas con el tema anterior. No le digas que lo que piensa no es cierto ni que no es así: aunque suene a consuelo, es discutirle lo que siente.'
        : '';

    // La regla de género está en el prompt, pero se escapa justo en los momentos
    // difíciles ("no estás solo"). Recordarla al final, cerca de la respuesta, la sostiene.
    const genero = memoria?.activa && memoria.genero ? ''
      : '\n\nNo sabés el género de esta persona. Antes de mandar, revisá cada palabra que la describe: si termina en -o o en -a, decilo de otra forma: "no estás solo" → "acá estoy"; "cargarlo solo" → "cargarlo por tu cuenta"; "vos mismo" → "vos"; "cansado" → "con todo encima"; "encerrada" → "sin salir". No copies estos ejemplos: son para que veas la trampa.';

    const primera = limpios.filter(m => m.role === 'user').length !== 1 ? ''
      : memoria?.dia?.valor
        ? '\n\nEs el primer mensaje. Vos ya abriste preguntándole por el día que acaba de marcar, así que esto que te escribe es la respuesta a esa pregunta: entrá directo en lo que te cuenta. No saludes, no te presentes y no vuelvas a preguntarle lo mismo. Si te dice que prefiere no hablar de eso, no insistas: soltá el tema y quedate.'
        : '\n\nEs el primer mensaje de la conversación. Vos ya abriste con una línea corta diciendo que estás acá: no vuelvas a saludar ni a presentarte.';

    for await (const t of anthropicStream({
      model: MODELO_CHARLA,
      // Tope de seguridad, no de estilo: es un corte duro que el modelo no ve y deja
      // frases por la mitad. El largo de las respuestas lo decide el prompt.
      max_tokens: 1024,
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `${bloqueMemoria(memoria)}\n\nSeñal del clasificador para el último mensaje: ${riesgo.nivel}${porQue}${riesgo.nivel === 'alto' ? '' : guiaPreguntas(limpios)}${genero}${primera}` },
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
