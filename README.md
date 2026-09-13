# Amber — prototipo

Prototipo funcional del acompañante emocional. Node sin dependencias, desplegado en Vercel.

**En vivo:** https://amber-prototipo.vercel.app
(el tema ámbar original: `?tema=ambar`)

## Dónde está cada cosa

| Archivo | Qué es |
|---|---|
| `prompts/system.md` | **La voz de Amber.** Lo más importante del proyecto. |
| `prompts/clasificador.md` | Detecta riesgo. Devuelve `ninguno` / `atencion` / `alto`. |
| `api/prompts.mjs` | Copia generada de los dos anteriores, es lo que lee el servidor. |
| `api/chat.mjs` | El servidor: clasifica, arma el contexto, llama a Claude. |
| `public/` | La app: `index.html`, `styles.css`, `app.js`. |
| `memoria.json` | Memoria de arranque. Se copia al navegador de cada visitante. |
| `set-de-prueba.md` | Veinte situaciones para probar cada cambio de prompt. |

## Si tocás un prompt

`prompts/*.md` no se leen en producción. Después de editarlos hay que regenerar:

```bash
node regenerar.mjs
```

## Desplegar

```bash
vercel deploy --prod
```

La API key vive como variable de entorno en Vercel (`ANTHROPIC_API_KEY`), nunca en el código.
Para correr local hace falta un `.env` propio con esa variable.

## Regla

Antes de dar por buena cualquier corrección de prompt, correr las veinte situaciones
de `set-de-prueba.md`. Sin eso no se sabe si un cambio mejoró o empeoró.
