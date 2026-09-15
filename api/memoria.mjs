import { readFileSync } from 'node:fs';

// Lo que la persona va contando se guarda mientras habla, sin esperar a "Cerrar por
// hoy". La app llama acá después de cada respuesta de Amber, aparte, así no la
// demora. Si falla no pasa nada: la charla sigue igual y se intenta con el mensaje
// siguiente. La memoria vive en el navegador: esto solo dice qué agregar o cambiar.
const PROMPT = readFileSync(new URL('../prompts/memoria.md', import.meta.url), 'utf8');

// Leer un intercambio y anotar hechos no necesita a Sonnet. Haiku cuesta la mitad y
// no piensa antes de contestar, así que el tope de tokens es todo para el JSON.
const MODELO = 'claude-haiku-4-5';
const LISTAS = ['datos', 'objetivos', 'estrategias', 'sensibles'];
const texto = (v, max = 160) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'solo POST' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'falta ANTHROPIC_API_KEY' });

  try {
    const { memoria, mensajes } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!memoria?.activa || !Array.isArray(mensajes) || !mensajes.length)
      return res.json({ agregar: {}, reemplazar: [] });

    const sabe = LISTAS.map(k => {
      const xs = (Array.isArray(memoria[k]) ? memoria[k] : []).map(x => texto(x)).filter(Boolean);
      return `${k}:\n${xs.length ? xs.map(x => `- ${x}`).join('\n') : '(nada todavía)'}`;
    }).join('\n\n');
    const temas = Array.isArray(memoria.temas) && memoria.temas.length
      ? `\n\nTemas que eligió al empezar: ${memoria.temas.map(t => texto(t, 60)).join('; ')}` : '';
    const charla = mensajes.slice(-4)
      .map(m => `${m.role === 'assistant' ? 'AMBER' : 'PERSONA'}: ${String(m.content).slice(0, 4000)}`)
      .join('\n');

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 700,
        system: PROMPT,
        messages: [{ role: 'user', content: `Lo que Amber ya sabe:\n\n${sabe}${temas}\n\nEl final de la charla:\n${charla}` }],
      }),
    });
    if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const out = await r.json();

    const txt = (out.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('');
    const j = JSON.parse(txt.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    // Lo que vuelve del modelo se revisa antes de mandarlo: listas conocidas, textos
    // cortos y pocos. Un JSON raro no puede llenarle la memoria a nadie.
    const agregar = Object.fromEntries(LISTAS.map(k => [k,
      (Array.isArray(j.agregar?.[k]) ? j.agregar[k] : []).map(x => texto(x, 140)).filter(Boolean).slice(0, 3)]));
    const reemplazar = (Array.isArray(j.reemplazar) ? j.reemplazar : [])
      .filter(x => LISTAS.includes(x?.lista) && texto(x.viejo) && texto(x.nuevo, 140))
      .map(x => ({ lista: x.lista, viejo: texto(x.viejo), nuevo: texto(x.nuevo, 140) }))
      .slice(0, 3);

    res.json({ agregar, reemplazar });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'no se pudo leer la charla' });
  }
}
