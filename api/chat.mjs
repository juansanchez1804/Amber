import { readFileSync } from 'node:fs';

// Se leen los .md directamente: así, editar prompts/system.md desde GitHub
// cambia la voz de Amber sin ningún paso intermedio.
const leer = (n) => readFileSync(new URL(`../prompts/${n}`, import.meta.url), 'utf8');
const SYSTEM = leer('system.md');
const CLASIF = leer('clasificador.md');

// Producción usa Sonnet. probar.mjs elige otro con AMBER_MODELO_CHARLA.
const MODELO_CHARLA = process.env.AMBER_MODELO_CHARLA || 'claude-sonnet-5';
// Solo probar.mjs lo prende: habilita el riesgo fijo y el reporte de tokens.
const MODO_PRUEBA = process.env.AMBER_MODO_PRUEBA === '1';
const MODELO_CLASIF = 'claude-haiku-4-5-20251001';
const MAX_MENSAJES  = 40;   // tope por conversación, para que nadie vacíe el saldo

// Red de seguridad para cuando el clasificador no responde (caída, límite, sin
// crédito): sin él, el servidor asumía "ninguno" y "no quiero seguir viviendo"
// pasaba como un mensaje cualquiera. Mejor un falso alto que un riesgo real ignorado.
const RIESGO_SIN_CLASIFICADOR = /\b(morir|morirme|matar|matarme|suicid\w*|no\s+quiero\s+(seguir|vivir)|mejor\s+sin\s+m[ií]|no\s+le\s+hago\s+falta\s+a\s+nadie|lastimarme|cortarme|terminar\s+con\s+todo|quitarme\s+la\s+vida|para\s+qu[eé]\s+seguir|quiero\s+que\s+(se\s+)?termine|cuando\s+yo\s+no\s+est[eé])(?![a-záéíóúñ])/i;

// Frases que literalmente hablan de matarse o morirse. Las frases hechas
// ("me quiero morir de vergüenza") no cuentan.
const FRASE_LITERAL = /\b(me\s+quiero\s+(matar|morir)|quiero\s+(matarme|morirme)|me\s+voy\s+a\s+(matar|morir)|matarme|morirme|suicid\w*|(me\s+quiero\s+tirar|tirarme)\s+(abajo|debajo)\s+de)\b(?!\s+de\s+(la\s+)?(risa|vergüenza|verguenza|amor|hambre|sueño|calor|frío|frio|ganas|envidia))/i;

function bloqueMemoria(m) {
  if (!m || !m.activa) return '';
  const l = [];
  if (m.apodo) l.push(`Le gusta que le digan: ${m.apodo}`);
  if (m.genero) l.push(`Cuando le hablás, usá el género gramatical ${m.genero}`);
  // Elegido por la persona en el onboarding. Modula el registro; no toca el
  // protocolo de riesgo, que manda siempre por encima de cualquier preferencia.
  if (m.registro === 'escuchar') l.push('Te pidió que la escuches más de lo que le devolvés. Quedate un turno más en lo que te dice antes de traer nada tuyo, y no le propongas ni le señales contradicciones si no te lo pide. Esto no aplica cuando hay riesgo: ahí hablás igual.');
  if (m.registro === 'devolver') l.push('Te pidió que le digas lo que ves, aunque incomode. Podés nombrar algo que se repite o algo que no cierra en lo que cuenta. Sigue prohibido diagnosticar, etiquetar y sermonear: nombrás lo que viste, no lo que concluís.');
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
    ? '\n\nTu mensaje anterior terminó en pregunta, así que este no lleva ninguna. Cerrá con una observación que la persona pueda tomar o dejar, no con una pregunta encubierta ni con una frase que espere respuesta. Está bien dejar el turno abierto sin pedir nada.'
    : '';
}

// Con `alto` el modelo dictamina sobre la idea una de cada tres veces, y siete
// vueltas de prompt no lo bajaron de ahí. Esto no lo convence: lo detecta y pide la
// respuesta de nuevo. Una de tres pasa a una de nueve, y sólo cuesta una llamada
// extra cuando de verdad falla.
const VEREDICTO = /\bno\s+(es|lo que es|sea|son)\s*[^.,;]{0,20}(cierto|verdad|real)|\bno\s+(te\s+|lo\s+)?creo\b|\bno pienses eso\b|\bno digas eso\b|\bno\s+(lo\s+)?voy a discutir\b|\beso no es (cierto|verdad|as[íi])\b/i;

const AVISO_REINTENTO = '\n\nTu respuesta anterior dictaminó sobre lo que dijo: le contestaste si su idea es verdad o no. Eso es justo lo que no va. Escribila de nuevo con dos partes y ninguna más: lo que escuchaste, y que te quedás. La idea queda entera, sin que vos opines sobre ella.';

// Sin género conocido, el adjetivo se escapa igual en crisis ("no te dejo con eso
// sola"). Es el mismo caso que el veredicto: un patrón conocido que el prompt no
// logra sostener, y que acá ya tenemos la respuesta entera para revisar.
const ADJ = '(sol[oa]|cansad[oa]|agotad[oa]|tranquil[oa]|perdid[oa]|segur[oa]|content[oa]|encerrad[oa]|reventad[oa])';
const GENERO_FUGA = new RegExp(`\\b(est[áa]s|est[ée]s|sent[íi]s|pod[ée]s|puedas|segu[íi]s|sigas|quedaste|qued[áa]s|vos|dejo|dejar|dejarte|cargarlo|llevarlo|pasarlo|con eso|vos mism[oa])\\s+(\\S+\\s+){0,2}${ADJ}\\b|\\bvos mism[oa]\\b`, 'i');

const AVISO_GENERO = '\n\nTu respuesta anterior le puso género con un adjetivo terminado en -o o en -a, y no sabés cuál es el suyo. Escribila de nuevo sin ese adjetivo: no hace falta ninguno. En vez de decir cómo está o con qué se queda, decí qué hacés vos.';

// Sonnet 5 puede devolver un bloque de pensamiento antes del texto.
const soloTexto = (out) => (out.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('');


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
async function* anthropicStream(body, key, uso = {}) {
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
      if (d.type === 'message_start') Object.assign(uso, d.message?.usage ?? {});
      if (d.type === 'message_delta' && d.usage?.output_tokens != null) uso.output_tokens = d.usage.output_tokens;
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
    let riesgo = { nivel: 'ninguno', motivo: '' }, clasificadorFallo = false, usoClasif = null;
    // En pruebas de voz el nivel se pasa a mano y no se paga el clasificador. Viene en
    // req.riesgoFijo, que ningún cliente puede setear por HTTP, y solo en modo prueba.
    const riesgoFijo = MODO_PRUEBA && ['ninguno', 'ambiguo', 'atencion', 'alto'].includes(req.riesgoFijo) ? req.riesgoFijo : null;
    if (riesgoFijo) riesgo = { nivel: riesgoFijo, motivo: 'fijo (prueba)' };
    else try {
      const ctx = limpios.slice(-4).map(m => `${m.role === 'user' ? 'PERSONA' : 'AMBER'}: ${m.content}`).join('\n');
      const out = await anthropic({ model: MODELO_CLASIF, max_tokens: 80, temperature: 0,
        system: CLASIF, messages: [{ role: 'user', content: ctx }] }, key);
      usoClasif = out.usage ?? null;
      const j = JSON.parse((out.content?.[0]?.text ?? '').match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      if (['ninguno', 'ambiguo', 'atencion', 'alto'].includes(j.nivel)) riesgo = { nivel: j.nivel, motivo: j.motivo ?? '' };
    } catch (e) { clasificadorFallo = true; console.error('clasificador:', e.message); }
    if (clasificadorFallo && RIESGO_SIN_CLASIFICADOR.test(limpios.filter(m => m.role === 'user').at(-1)?.content ?? ''))
      riesgo = { nivel: 'alto', motivo: 'sin clasificador, palabra de riesgo' };

    // Una frase de hacerse daño dicha de bronca se nombra una vez. Si vuelve a
    // aparecer en la misma conversación, sube a alto. Esto no depende del
    // clasificador: si la persona ya aclaró "de bronca", tiende a leer la segunda
    // con ese filtro y a dejarla pasar.
    const dePersona = limpios.filter(m => m.role === 'user');
    const literalAhora = FRASE_LITERAL.test(dePersona.at(-1)?.content ?? '');
    const literalAntes = dePersona.slice(0, -1).some(m => FRASE_LITERAL.test(m.content));
    const fueAmbiguo = !riesgoFijo && (riesgo.nivel === 'ambiguo' || (literalAhora && riesgo.nivel === 'ninguno'));
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
        ? '\n\nLa señal es alto: aplicá el protocolo aunque el mensaje parezca liviano. No sigas con el tema anterior. No discutas lo que piensa, ni para confirmarlo ni para negarlo: aunque suene a consuelo, es discutirle lo que siente. Una o dos oraciones: la calidez está en qué decís, no en decir más.'
        : '';

    // La regla de género está en el prompt, pero se escapa justo en los momentos
    // difíciles ("no estás solo"). Recordarla al final, cerca de la respuesta, la sostiene.
    const genero = memoria?.activa && memoria.genero ? ''
      : '\n\nNo sabés el género de esta persona. Antes de mandar, revisá cada palabra que la describe: si termina en -o o en -a, decilo de otra forma: "no estás solo" → "acá estoy"; "cargarlo solo" → "cargarlo por tu cuenta"; "vos mismo" → "vos"; "cansado" → "con todo encima"; "encerrada" → "sin salir"; "estás parada" → "estás"; "reventado" → "sin resto". No copies estos ejemplos: son para que veas la trampa. La trampa peor está en las respuestas de riesgo, donde la frase sale sola. No es una lista de frases: es una construcción, y cambiarle el verbo no la arregla. Cualquier forma de "dejarte solo", "estar sola", "poder sola", "cargarlo solo" lleva la marca, la escribas como la escribas. El reemplazo nunca necesita el adjetivo: "no te dejo con eso", "acá estoy", "no tenés que poder con esto", "no lo cargás por tu cuenta".';

    const sinSenal = clasificadorFallo && riesgo.nivel === 'ninguno'
      ? '\n\nEl clasificador de riesgo no respondió en este mensaje: esa señal no es confiable. Si la persona habla de querer morirse, lastimarse o de que estarían mejor sin ella, aplicá el protocolo de alto igual.'
      : '';

    const primera = limpios.filter(m => m.role === 'user').length !== 1 ? ''
      : memoria?.dia?.valor
        ? '\n\nEs el primer mensaje. Vos ya abriste con una línea sobre el día que acaba de marcar, así que esto que te escribe es la respuesta: entrá directo en lo que te cuenta. No saludes, no te presentes y no vuelvas a preguntarle lo mismo. Si te dice que prefiere no hablar de eso, no insistas: soltá el tema y quedate. De esta respuesta depende que siga hablando: que sienta que alguien la escuchó, no que llenó un formulario.'
        : '\n\nEs el primer mensaje de la conversación. Vos ya abriste con una línea corta diciendo que estás acá: no vuelvas a saludar ni a presentarte. De esta respuesta depende que siga hablando: que sienta que alguien la escuchó, no que llenó un formulario.';

    const usoCharla = {};
    // Tope de seguridad, no de estilo: es un corte duro que el modelo no ve y deja
    // frases por la mitad. El largo de las respuestas lo decide el prompt.
    const pedido = (extra = '') => ({
      model: MODELO_CHARLA,
      max_tokens: 1024,
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `${bloqueMemoria(memoria)}\n\nSeñal del clasificador para el último mensaje: ${riesgo.nivel}${porQue}${sinSenal}${riesgo.nivel === 'alto' ? '' : guiaPreguntas(limpios)}${genero}${primera}${extra}` },
      ],
      messages: limpios,
    });

    if (riesgo.nivel === 'alto') {
      // Sin streaming: hay que tener la respuesta entera para poder revisarla. No se
      // nota, porque el cliente la revela a ritmo de lectura igual; lo único que
      // cambia es que la primera palabra tarda un poco más en aparecer.
      const uno = await anthropic(pedido(), key);
      Object.assign(usoCharla, uno.usage ?? {});
      let texto = soloTexto(uno);
      const sinGenero = !(memoria?.activa && memoria.genero);
      const falla = (t) => (VEREDICTO.test(t) ? AVISO_REINTENTO
                          : sinGenero && GENERO_FUGA.test(t) ? AVISO_GENERO : null);
      const aviso = falla(texto);
      if (aviso) {
        const dos = await anthropic(pedido(aviso), key);
        const u = dos.usage ?? {};
        for (const k of Object.keys(u)) usoCharla[k] = (usoCharla[k] ?? 0) + (u[k] ?? 0);
        const segundo = soloTexto(dos);
        // Si la segunda también falla va igual: contestar mal es mejor que no
        // contestar en una crisis. Queda en el log para poder medirlo.
        if (falla(segundo)) console.error('reintento alto: la segunda tampoco pasó');
        texto = segundo;
      }
      mandar({ tipo: 'texto', t: texto });
    } else {
      for await (const t of anthropicStream(pedido(), key, usoCharla)) mandar({ tipo: 'texto', t });
    }

    if (MODO_PRUEBA) mandar({ tipo: 'uso',
      charla: { modelo: MODELO_CHARLA, ...usoCharla },
      clasificador: usoClasif ? { modelo: MODELO_CLASIF, ...usoClasif } : null });

    mandar({ tipo: 'fin' });
    res.end();
  } catch (e) {
    console.error(e);
    if (res.headersSent) { res.write(`data: ${JSON.stringify({ tipo: 'fin' })}\n\n`); res.end(); }
    else res.status(500).json({ error: e.message });
  }
}
