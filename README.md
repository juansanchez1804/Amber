# Amber — prototipo

Prototipo funcional del acompañante emocional. Node sin dependencias, desplegado en Vercel.

**En vivo:** https://amber-prototipo.vercel.app
(el tema ámbar original: `?tema=ambar`)

## Dónde está cada cosa

| Archivo | Qué es |
|---|---|
| `prompts/system.md` | **La voz de Amber.** Lo más importante del proyecto. |
| `prompts/clasificador.md` | Detecta riesgo. Devuelve `ninguno` / `ambiguo` / `atencion` / `alto`. |
| `api/chat.mjs` | El servidor: lee los prompts, clasifica, arma el contexto, llama a Claude. |
| `public/` | La app: `index.html`, `styles.css`, `app.js`. |
| `memoria.json` | Memoria de arranque. Se copia al navegador de cada visitante. |
| `set-de-prueba.md` | Las situaciones fijas para probar cada cambio de prompt. |
| `probar.mjs` | Corre el set de prueba y deja un informe en `pruebas/`. |

## Si tocás un prompt

El servidor lee `prompts/*.md` directo: editarlos cambia la voz, sin paso intermedio.
Pero no se sabe si un cambio mejoró hasta medirlo:

```bash
node --env-file=.env probar.mjs            # antes de tocar: la línea de base
# ...editar prompts/system.md o prompts/clasificador.md...
node --env-file=.env probar.mjs            # después: comparar los dos informes de pruebas/
node --env-file=.env probar.mjs 07 21 24   # solo algunos casos
```

Opciones para gastar menos:

```bash
node --env-file=.env probar.mjs --estimar                 # cuánto costaría, sin correr nada
node --env-file=.env probar.mjs --modelo sonnet           # modelo que escribe (default haiku)
node --env-file=.env probar.mjs --riesgo ninguno          # saltea el clasificador: para probar solo la voz
node --env-file=.env probar.mjs --juez sonnet             # juez de empatía más barato (default opus; "no" lo apaga)
AMBER_PROMPT=v3 node --env-file=.env probar.mjs            # prueba otra versión de la voz (v2 o v3; default: la del servidor)
```

Al terminar imprime el costo real, separado en entrada, caché y salida. Ojo: en
Haiku el system prompt no llega al mínimo de tokens para cachear, así que Haiku
sale más caro que Sonnet con caché.

El script marca solo lo que se puede medir: nivel de riesgo, largo, aperturas y
frases prohibidas, género, evaluar lo que dijo la persona. El eco no lo detecta:
hay que leer las respuestas del informe. Y el modelo varía entre corridas, así que
un caso que importa se corre más de una vez.

## Desplegar

```bash
vercel deploy --prod
```

La API key vive como variable de entorno en Vercel (`ANTHROPIC_API_KEY`), nunca en el código.
Para correr local hace falta un `.env` propio con esa variable.

`vercel.json` pide `maxDuration: 60` para las tres funciones: con señal `alto` el
chat hace el clasificador más una o dos llamadas sin streaming, y con el tope por
defecto del plan Hobby (10 s sin Fluid Compute) la función se corta justo en una
crisis. **Pendiente: Juan tiene que confirmar en qué plan está el proyecto** y que
el tope de 60 s esté efectivamente aplicado en el panel de Vercel.

## Regla

Antes de dar por buena cualquier corrección de prompt, correr `probar.mjs` antes y
después. Sin eso no se sabe si un cambio mejoró o empeoró.

Cuando algo falla en una conversación real y no estaba contemplado, se agrega como
caso nuevo en `set-de-prueba.md` antes de arreglarlo.
