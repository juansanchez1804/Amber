const TEMA = new URLSearchParams(location.search).get('tema');
if (TEMA === 'ambar') document.documentElement.dataset.tema = 'ambar';

const $ = s => document.querySelector(s);
const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };

const SEMILLA = {
  "activa": true,
  "apodo": "Nico",
  "genero": "masculino",
  "objetivos": [
    "La ansiedad antes de los finales",
    "Volver a dormir bien"
  ],
  "estrategias": [
    "Escribir de noche en vez de dar vueltas"
  ],
  "sensibles": [
    "Lo de tu ex"
  ],
  "resumenes": [
    "Hace dos semanas dormiste mal varios días por el final de Análisis, que al final aprobaste.",
    "La semana pasada, un jueves cerca de medianoche, estuviste dándole vueltas a si seguís en la carrera.",
    "Escribir un rato antes de dormir te bajó la cabeza dos noches seguidas."
  ]
};

// Subir esta versión invalida la memoria guardada de todos los que ya entraron,
// y hace que reciban la semilla nueva sin tener que limpiar nada a mano.
const LLAVE = 'amber.memoria.v2';

// ?reset borra lo guardado y arranca de cero. Sirve para demostrar dos veces seguidas.
if (new URLSearchParams(location.search).has('reset')) {
  try { localStorage.removeItem('amber.memoria.v1'); localStorage.removeItem(LLAVE); } catch (e) {}
}
const DEMO_MEMORIA = new URLSearchParams(location.search).get('memoria') === 'demo';

// Sin memoria guardada y sin ?memoria=demo, no hay nada que mostrar: arranca el onboarding.
function cargarMemoria() {
  try { const g = localStorage.getItem(LLAVE); if (g) return JSON.parse(g); } catch (e) {}
  return DEMO_MEMORIA ? structuredClone(SEMILLA) : null;
}
function guardarMemoria() {
  try { localStorage.setItem(LLAVE, JSON.stringify(memoria)); } catch (e) {}
}

let memoria = cargarMemoria();
let mensajes = [];   // historial que va a la API
let apodoOnboarding = '';

// ── navegación ────────────────────────────────────────────────────────────
function ir(id) {
  document.querySelectorAll('.p').forEach(p => p.classList.toggle('on', p.id === id));
  if (id === 'conv') { $('#txt').focus(); scroll(); }
  if (id === 'calma') reiniciarCalma();
  if (id === 'mem') pintarMemoria();
  if (id === 'ob2') $('#ob-nombre').focus();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ir]');
  if (b) ir(b.dataset.ir);
});
$('#salir-calma').onclick = () => ir(mensajes.length ? 'conv' : 'entrada');
$('#salir-mem').onclick   = () => ir(mensajes.length ? 'conv' : 'entrada');

// reinicia la animación de respiración cada vez que se entra
function reiniciarCalma() {
  ['.o1', '.o2', '.w1', '.w2', '.barrita i'].forEach(s => {
    const n = $(s); const a = n.style.animation; n.style.animation = 'none';
    void n.offsetWidth; n.style.animation = a || '';
  });
}

// ── entrada ───────────────────────────────────────────────────────────────
const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
function pintarEntrada() {
  const d = new Date();
  $('#fecha').textContent = `${DIAS[d.getDay()]}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  $('#saludo').textContent = memoria?.activa && memoria.apodo ? `Hola, ${memoria.apodo}.` : 'Hola.';
  const r = memoria?.activa ? memoria.resumenes?.[1] ?? memoria.resumenes?.[0] : null;
  const sabe = $('#sabe');
  sabe.classList.toggle('acento', !!memoria?.activa && !r);
  sabe.textContent = r ?? (memoria?.activa ? '¿Cómo venís?' : '');
}

// ── conversación ──────────────────────────────────────────────────────────
const hilo = $('#hilo');
const scroll = () => hilo.scrollTo({ top: hilo.scrollHeight, behavior: 'smooth' });

function turno(quien, texto) {
  const n = el('div', quien === 'user' ? 'yo' : 'am', texto);
  hilo.appendChild(n); scroll(); return n;
}
function puntos() {
  const n = el('div', 'puntos');
  n.innerHTML = '<i class="pt"></i><i class="pt"></i><i class="pt"></i>';
  hilo.appendChild(n); scroll(); return n;
}

const RECURSOS = [
  ['135', 'Centro de Asistencia al Suicida. CABA y GBA, de 8 a 24 h.', true],
  ['0800 345 1435', 'La misma línea, desde todo el país.', false],
  ['911', 'Si es una emergencia ahora.', false],
];
function recursos() {
  const c = el('div', 'rec');
  for (const [num, desc, pri] of RECURSOS) {
    const f = el('div', 'rec-f' + (pri ? ' pri' : ''));
    const izq = el('div'); izq.style.cssText = 'display:flex;flex-direction:column;gap:3px';
    izq.append(el('div', 'rec-n', num), el('div', 'rec-d', desc));
    f.append(izq); c.append(f);
  }
  hilo.appendChild(c); scroll();
}

const txt = $('#txt'), enviar = $('#enviar');
txt.addEventListener('input', () => {
  txt.style.height = 'auto'; txt.style.height = Math.min(txt.scrollHeight, 96) + 'px';
  enviar.classList.toggle('listo', txt.value.trim().length > 0);
});
txt.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandar(); }
});
enviar.onclick = mandar;

let ocupado = false;
async function mandar() {
  const t = txt.value.trim();
  if (!t || ocupado) return;
  ocupado = true;
  txt.value = ''; txt.style.height = 'auto'; enviar.classList.remove('listo');
  turno('user', t);
  mensajes.push({ role: 'user', content: t });
  const p = puntos();
  try {
    const r = await fetch('/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mensajes, memoria }),
    });
    const d = await r.json();
    p.remove();
    if (d.error) { turno('assistant', 'Se me cortó algo acá. Probá de nuevo.'); console.error(d.error); }
    else {
      turno('assistant', d.texto);
      mensajes.push({ role: 'assistant', content: d.texto });
      if (d.riesgo === 'alto') recursos();
    }
  } catch (e) {
    p.remove(); turno('assistant', 'Se me cortó algo acá. Probá de nuevo.'); console.error(e);
  }
  ocupado = false; txt.focus();
}

// ── memoria ───────────────────────────────────────────────────────────────
const LAPIZ = '<svg width="18" height="18" viewBox="0 0 24 24" stroke="#9B9189"><path d="M4 20h4l10-10-4-4L4 16v4z"/></svg>';
const CRUZ  = '<svg width="18" height="18" viewBox="0 0 24 24" stroke="#6E675E"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>';

function entrada(texto, alBorrar, alEditar, nota) {
  const f = el('div', 'ent');
  const izq = el('div'); izq.style.cssText = 'display:flex;flex-direction:column;gap:6px;flex-grow:1';
  const s = el('span', null, texto);
  s.contentEditable = 'plaintext-only';
  s.addEventListener('blur', () => alEditar(s.textContent.trim()));
  izq.append(s);
  if (nota) izq.append(el('div', 'nota', nota));
  const acc = el('div', 'acc');
  const bl = el('button'); bl.innerHTML = LAPIZ; bl.onclick = () => s.focus();
  const bc = el('button'); bc.innerHTML = CRUZ;  bc.onclick = alBorrar;
  acc.append(bl, bc);
  f.append(izq, acc);
  return f;
}

function grupo(rotulo, hijos) {
  const g = el('div', 'grupo');
  g.append(el('div', 'rot', rotulo));
  const t = el('div', 'tarj');
  hijos.forEach((h, i) => { if (i) t.append(el('div', 'div')); t.append(h); });
  g.append(t); return g;
}

function pintarMemoria() {
  const c = $('#mem-cuerpo'); c.innerHTML = '';
  const guardar = () => { guardarMemoria(); pintarMemoria(); pintarEntrada(); };
  const lista = (clave) => memoria[clave].map((v, i) =>
    entrada(v,
      () => { memoria[clave].splice(i, 1); guardar(); },
      (nuevo) => { if (nuevo && nuevo !== v) { memoria[clave][i] = nuevo; guardar(); } },
      clave === 'sensibles' ? 'No lo saco yo. Lo traés vos cuando querés.' : null));

  if (memoria.apodo) c.append(grupo('Cómo te digo', [
    entrada(memoria.apodo, () => { memoria.apodo = ''; guardar(); },
      n => { if (n && n !== memoria.apodo) { memoria.apodo = n; guardar(); } })]));
  if (memoria.objetivos.length)   c.append(grupo('Lo que venís trabajando', lista('objetivos')));
  if (memoria.estrategias.length) c.append(grupo('Lo que te ayuda', lista('estrategias')));
  if (memoria.sensibles.length)   c.append(grupo('Temas sensibles', lista('sensibles')));

  c.style.opacity = memoria.activa ? '1' : '.35';
  $('#toggle-mem').textContent = memoria.activa ? 'Desactivar la memoria' : 'Activar la memoria';
}
$('#toggle-mem').onclick = () => {
  memoria.activa = !memoria.activa;
  guardarMemoria(); pintarMemoria(); pintarEntrada();
};

// ── onboarding ────────────────────────────────────────────────────────────
const obNombre = $('#ob-nombre'), obSeguir = $('#ob-seguir');
obNombre.addEventListener('input', () => {
  obSeguir.disabled = obNombre.value.trim().length < 2;
});
obSeguir.onclick = () => {
  apodoOnboarding = obNombre.value.trim();
  ir('ob3');
};

const obCheck = $('#ob-check'), obEntrar = $('#ob-entrar');
obCheck.addEventListener('change', () => { obEntrar.disabled = !obCheck.checked; });
obEntrar.onclick = () => {
  memoria = { activa: true, apodo: apodoOnboarding, objetivos: [], estrategias: [], sensibles: [], resumenes: [] };
  guardarMemoria();
  pintarEntrada();
  ir('entrada');
};

// ── arranque ──────────────────────────────────────────────────────────────
if (memoria) { pintarEntrada(); ir('entrada'); } else { ir('ob1'); }


// El marco mide 884px de alto: en una laptop no entra. En vez de esconderlo,
// lo achicamos para que entre siempre. En celular no se escala, va a pantalla completa.
function ajustarMarco() {
  const m = document.getElementById('marco');
  if (!m) return;
  if (window.innerWidth <= 520) { m.style.transform = ''; return; }
  const s = Math.min(1, (window.innerHeight - 32) / 884, (window.innerWidth - 32) / 430);
  m.style.transform = `scale(${s.toFixed(4)})`;
}
addEventListener('resize', ajustarMarco);
ajustarMarco();
