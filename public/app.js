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

const capitalizar = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

// ── navegación ────────────────────────────────────────────────────────────
let pantallaPrevia = 'entrada';
function ir(id) {
  const actual = document.querySelector('.p.on');
  if (actual && actual.id !== id) pantallaPrevia = actual.id;
  document.querySelectorAll('.p').forEach(p => p.classList.toggle('on', p.id === id));
  if (id === 'conv') { abrirConversacion(); $('#txt').focus(); scroll(); }
  if (id === 'calma') reiniciarCalma();
  if (id === 'mem') pintarMemoria();
  if (id === 'ayuda') pintarAyuda();
  if (id === 'ob2') $('#ob-nombre').focus();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ir]');
  if (b) ir(b.dataset.ir);
});
$('#salir-calma').onclick = () => ir(mensajes.length ? 'conv' : 'entrada');
$('#salir-mem').onclick   = () => ir(mensajes.length ? 'conv' : 'entrada');
$('#salir-ayuda').onclick = () => ir(pantallaPrevia === 'ayuda' ? 'conv' : pantallaPrevia);
$('#ver-ayuda').onclick   = () => ir('ayuda');

function pintarAyuda() {
  const c = $('#ayuda-cuerpo'); c.innerHTML = '';
  c.append(tarjetasRecursos());
}

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
  const apodo = memoria?.apodo;
  $('#saludo').textContent = memoria?.activa && apodo ? `Hola, ${capitalizar(apodo)}.` : 'Hola.';
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
// El acceso a la memoria aparece donde nace la pregunta: justo después de que
// Amber demuestra por primera vez que se acuerda. Una vez por conversación.
let accesoMostrado = false;
function accesoMemoria() {
  if (accesoMostrado || !memoria || !memoria.activa) return;
  const hay = (memoria.objetivos?.length || memoria.estrategias?.length ||
               memoria.sensibles?.length || memoria.resumenes?.length);
  if (!hay) return;
  accesoMostrado = true;
  const b = el('button', 'acceso-mem', 'Lo que recuerdo de vos');
  b.onclick = () => ir('mem');
  hilo.appendChild(b); scroll();
}

function puntos() {
  const n = el('div', 'puntos');
  n.innerHTML = '<i class="pt"></i>';
  hilo.appendChild(n); scroll(); return n;
}

// Nadie tiene que enfrentarse a una caja vacía: Amber abre, y deja tres puertas
// de entrada para el que no sabe cómo arrancar. Se van con el primer mensaje.
const APERTURA = 'Estoy acá. Contame lo que quieras, no hace falta que tenga sentido.';
const APERTURAS = ['No sé por dónde empezar', 'Tuve un día horrible', 'No puedo dormir'];
let aperturasEl = null, conversacionAbierta = false;
function abrirConversacion() {
  if (conversacionAbierta || mensajes.length) return;
  conversacionAbierta = true;
  turno('assistant', APERTURA);
  const c = el('div', 'aperturas');
  for (const t of APERTURAS) {
    const b = el('button', 'apertura', t);
    b.onclick = () => mandar(t);
    c.append(b);
  }
  hilo.appendChild(c); scroll();
  aperturasEl = c;
}
function quitarAperturas() { aperturasEl?.remove(); aperturasEl = null; }

const RECURSOS = [
  ['135', '135', 'Centro de Asistencia al Suicida. CABA y GBA, de 8 a 24 h.', true],
  ['0800 345 1435', '08003451435', 'La misma línea, desde todo el país.', false],
  ['911', '911', 'Si es una emergencia ahora.', false],
];
const TUBO = '<svg class="rec-flecha" width="18" height="18" viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/></svg>';

// Un número que no se puede tocar no sirve de nada en un celular.
function tarjetasRecursos() {
  const c = el('div', 'rec');
  for (const [num, tel, desc, pri] of RECURSOS) {
    const a = el('a', 'rec-f' + (pri ? ' pri' : ''));
    a.href = `tel:${tel}`;
    const izq = el('div'); izq.style.cssText = 'display:flex;flex-direction:column;gap:3px';
    izq.append(el('div', 'rec-n', num), el('div', 'rec-d', desc));
    const flecha = el('span'); flecha.innerHTML = TUBO;
    a.append(izq, flecha); c.append(a);
  }
  return c;
}
function recursos() {
  hilo.appendChild(tarjetasRecursos()); scroll();
}

const txt = $('#txt'), enviar = $('#enviar');
txt.addEventListener('input', () => {
  txt.style.height = 'auto'; txt.style.height = Math.min(txt.scrollHeight, 96) + 'px';
  enviar.classList.toggle('listo', txt.value.trim().length > 0);
});
txt.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandar(); }
});
enviar.onclick = () => mandar();

// El texto llega de a pedazos, pero aparece a ritmo de alguien escribiendo.
// Si se acumula, acelera solo: nunca queda colgado detrás del modelo.
function revelador(nodo) {
  let pendiente = '', abierto = true, avisar = null;
  const id = setInterval(() => {
    if (pendiente) {
      const n = Math.max(1, Math.ceil(pendiente.length / 40));
      nodo.textContent += pendiente.slice(0, n);
      pendiente = pendiente.slice(n);
      scroll();
    } else if (!abierto) { clearInterval(id); avisar?.(); }
  }, 16);
  return {
    empujar: t => { pendiente += t; },
    terminar: () => new Promise(r => { abierto = false; avisar = r; }),
  };
}

let ocupado = false, cortado = false;
function cortar() {
  cortado = true;
  txt.disabled = true;
  txt.placeholder = 'Por hoy llegamos hasta acá.';
  enviar.classList.remove('listo');
}

async function mandar(textoDirecto) {
  const t = (textoDirecto ?? txt.value).trim();
  if (!t || ocupado || cortado) return;
  ocupado = true;
  quitarAperturas();
  if (textoDirecto == null) { txt.value = ''; txt.style.height = 'auto'; enviar.classList.remove('listo'); }
  turno('user', t);
  mensajes.push({ role: 'user', content: t });
  const p = puntos();
  try {
    const r = await fetch('/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mensajes, memoria }),
    });
    if ((r.headers.get('content-type') ?? '').includes('text/event-stream')) await leerStream(r, p);
    else {
      const d = await r.json().catch(() => ({}));
      p.remove(); turno('assistant', 'Se me cortó algo acá. Probá de nuevo.');
      console.error(d.error ?? r.status);
    }
  } catch (e) {
    p.remove(); turno('assistant', 'Se me cortó algo acá. Probá de nuevo.'); console.error(e);
  }
  ocupado = false;
  if (!cortado) txt.focus();
}

async function leerStream(r, p) {
  const lector = r.body.getReader(), dec = new TextDecoder();
  let resto = '', nodo = null, rev = null, riesgo = 'ninguno', fin = false, texto = '';
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    const partes = resto.split('\n\n');
    resto = partes.pop();
    for (const parte of partes) {
      const linea = parte.split('\n').find(l => l.startsWith('data: '));
      if (!linea) continue;
      let d; try { d = JSON.parse(linea.slice(6)); } catch (e) { continue; }
      if (d.tipo === 'riesgo') riesgo = d.nivel;
      else if (d.tipo === 'texto') {
        if (!nodo) { p.remove(); nodo = turno('assistant', ''); rev = revelador(nodo); }
        texto += d.t; rev.empujar(d.t);
      } else if (d.tipo === 'fin') fin = d.fin === true;
    }
  }
  p.remove();
  if (rev) await rev.terminar();
  if (!nodo) { turno('assistant', 'Se me cortó algo acá. Probá de nuevo.'); return; }
  mensajes.push({ role: 'assistant', content: texto });
  accesoMemoria();
  if (riesgo === 'alto') recursos();
  if (fin) cortar();
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

  // Siempre visible, incluso vacío: si no, borrar el apodo lo dejaba sin forma de volver a ponerlo.
  c.append(grupo('Cómo te digo', [
    entrada(memoria.apodo ?? '', () => { memoria.apodo = ''; guardar(); },
      n => { if (n !== memoria.apodo) { memoria.apodo = n; guardar(); } })]));
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

// Borrar todo pide confirmación en el mismo botón: sin diálogos, sin sustos.
const ROTULO_BORRAR = 'Borrar todo lo que recuerdo';
let confirmando = null;
$('#borrar-mem').onclick = () => {
  const b = $('#borrar-mem');
  if (!confirmando) {
    b.textContent = 'Tocá de nuevo para borrar todo';
    confirmando = setTimeout(() => { confirmando = null; b.textContent = ROTULO_BORRAR; }, 4000);
    return;
  }
  clearTimeout(confirmando); confirmando = null;
  memoria = { activa: memoria.activa, apodo: '', objetivos: [], estrategias: [], sensibles: [], resumenes: [] };
  guardarMemoria(); pintarMemoria(); pintarEntrada();
  b.textContent = ROTULO_BORRAR;
};

// ── onboarding ────────────────────────────────────────────────────────────
const obNombre = $('#ob-nombre'), obSeguir = $('#ob-seguir');
obNombre.addEventListener('input', () => {
  const v = obNombre.value.trim();
  obSeguir.disabled = v.length < 2;
  $('#ob-eco').textContent = v ? `Así te voy a llamar: ${capitalizar(v)}.` : 'Así te voy a llamar.';
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
