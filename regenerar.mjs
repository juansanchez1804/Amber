// Después de editar prompts/*.md, corré:  node regenerar.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const s = readFileSync('prompts/system.md', 'utf8');
const c = readFileSync('prompts/clasificador.md', 'utf8');
writeFileSync('api/prompts.mjs',
  `// Generado desde prompts/*.md — no editar acá, editar el .md y correr: node regenerar.mjs\n` +
  `export const SYSTEM = ${JSON.stringify(s)};\n\n` +
  `export const CLASIF = ${JSON.stringify(c)};\n`);
console.log(`listo — system ${s.length} chars, clasificador ${c.length} chars`);
