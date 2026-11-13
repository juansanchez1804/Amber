// Feedback desde la app: lo único que viaja a un servidor nuestro, y la pantalla lo
// avisa antes de escribir. Por ahora no hay base de datos: queda en los registros de
// Vercel (vercel logs, o el panel del proyecto → Logs), con la marca [feedback].
// No se guarda nada que identifique a la persona: ni IP, ni navegador, ni memoria.
const TIPOS = ['general', 'tecnico'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'solo POST' });
  try {
    const { tipo, texto } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const t = typeof texto === 'string' ? texto.trim().slice(0, 2000) : '';
    if (!t) return res.status(400).json({ error: 'falta el texto' });
    console.log(`[feedback] ${JSON.stringify({ tipo: TIPOS.includes(tipo) ? tipo : 'general', texto: t, cuando: new Date().toISOString() })}`);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'no se pudo guardar' });
  }
}
