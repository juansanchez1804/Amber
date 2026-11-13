import { readFileSync } from 'node:fs';

// El resumen para el psicólogo (pirámide del 12/11): lo arma Amber con las charlas
// guardadas en el teléfono, cuando la persona lo pide. Acá no se guarda nada: entra,
// se escribe y vuelve. Lo lee, lo edita y lo manda ella; Amber no tiene canal con nadie.
const leer = (n) => readFileSync(new URL(`../prompts/${n}`, import.meta.url), 'utf8');
const PROMPT = leer('resumen.md');

// El mismo modelo que el cierre: es un texto que va a leer un profesional.
const MODELO = 'claude-sonnet-5';
const TOPE = { charlas: 30, porMensaje: 1200, total: 60000 };

async function anthropic(body, key) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

const fecha = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'sin fecha' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'solo POST' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'falta ANTHROPIC_API_KEY' });

  try {
    const { charlas, genero } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!Array.isArray(charlas) || !charlas.length) return res.status(400).json({ error: 'faltan charlas' });

    // Los mismos topes que la app, por si llega algo más grande de lo que debería.
    let total = 0;
    const bloques = [];
    for (const ch of charlas.slice(-TOPE.charlas)) {
      const lineas = (Array.isArray(ch?.m) ? ch.m : [])
        .filter(x => x && typeof x.c === 'string' && x.c.trim())
        .map(x => `${x.r === 'assistant' ? 'AMBER' : 'PERSONA'}: ${x.c.slice(0, TOPE.porMensaje)}`);
      const texto = lineas.join('\n');
      if (!texto || total + texto.length > TOPE.total) continue;
      total += texto.length;
      bloques.push(`### Charla del ${fecha(ch.f)}\n${texto}`);
    }
    if (!bloques.length) return res.status(400).json({ error: 'charlas vacías' });

    const generoTexto = { m: 'masculino', f: 'femenino', neutro: 'pidió que no se lo marques' }[genero]
      ?? 'no se sabe: escribí sin marcarlo';

    const out = await anthropic({
      model: MODELO,
      // Sonnet 5 piensa antes de escribir y el tope cuenta ese pensamiento.
      max_tokens: 3000,
      system: [{ type: 'text', text: PROMPT }],
      messages: [{ role: 'user', content: `Datos de la persona:\n- Género gramatical: ${generoTexto}\n\nLas charlas:\n\n${bloques.join('\n\n')}` }],
    }, key);

    const resumen = (out.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!resumen) return res.status(502).json({ error: 'resumen vacío' });
    res.json({ resumen: resumen.slice(0, 3000) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'no se pudo armar el resumen' });
  }
}
