const LLAVE_PREFS = 'amber.prefs.v1';
let prefs = (() => { try { return JSON.parse(localStorage.getItem(LLAVE_PREFS)) ?? {}; } catch (e) { return {}; } })();
const guardarPrefs = () => { try { localStorage.setItem(LLAVE_PREFS, JSON.stringify(prefs)); } catch (e) {} };

const TEMA = new URLSearchParams(location.search).get('tema');
if (TEMA === 'oscuro' || (TEMA !== 'claro' && prefs.oscuro)) document.documentElement.dataset.tema = 'oscuro';

// Vibración: existe en Android y en casi ningún iPhone. Si el navegador no la
// tiene, el interruptor no se ofrece en vez de ofrecerse y no hacer nada.
const HAY_VIBRACION = typeof navigator.vibrate === 'function';
// Los avisos se sacaron: un lugar al que vas no te busca. Si alguien los había
// prendido, se apagan.
if ('avisos' in prefs) { delete prefs.avisos; guardarPrefs(); }
// "Bajar de golpe" ya no existe: la respiración es una sola, corta o prolongada.
if (prefs.respirar && !['calmar', 'dormir'].includes(prefs.respirar)) { delete prefs.respirar; guardarPrefs(); }
const vibrar = (ms) => { if (prefs.vibrar && HAY_VIBRACION) { try { navigator.vibrate(ms); } catch (e) {} } };

const $ = s => document.querySelector(s);
const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };

const SEMILLA = {
  "activa": true,
  "apodo": "Nico",
  "genero": "m",
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
  "ultimoTema": "lo de si seguís en la carrera",
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
  // La llave de la charla en curso se escribe literal porque se declara más abajo,
  // junto al resto de lo que hace a la conversación.
  try { for (const k of ['amber.memoria.v1', LLAVE, 'amber.charla_en_curso.v1']) localStorage.removeItem(k); } catch (e) {}
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
// El interruptor de apagarla ya no existe. Si alguien la dejó apagada antes, se
// vuelve a prender: si no, quedaría sin memoria y sin forma de recuperarla.
if (memoria && !memoria.activa) { memoria.activa = true; guardarMemoria(); }
// Las memorias guardadas antes del onboarding nuevo tenían el género escrito entero
// y el estilo con otro nombre ("registro"). Se pasan una vez a los valores de ahora.
if (memoria) {
  const GENERO_VIEJO = { masculino: 'm', femenino: 'f' };
  let cambio = false;
  if (GENERO_VIEJO[memoria.genero]) { memoria.genero = GENERO_VIEJO[memoria.genero]; cambio = true; }
  if ('registro' in memoria) { memoria.estilo ??= memoria.registro; delete memoria.registro; cambio = true; }
  if (!Array.isArray(memoria.datos)) { memoria.datos = []; cambio = true; }
  // El tono, los temas del onboarding y la barra del día se sacaron (pirámide del
  // 12/11): Lola no elige nada ni se puntúa. Lo que quedó guardado de antes se borra.
  for (const k of ['estilo', 'temas', 'dia']) if (k in memoria) { delete memoria[k]; cambio = true; }
  if (cambio) guardarMemoria();
}
let mensajes = [];   // historial que va a la API
let ambiguos = 0;    // frases de hacerse daño dichas de bronca en esta conversación
let apodoOnboarding = '';

const capitalizar = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const minuscula   = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : '';

// El resumen se guarda sin fecha adentro y el tiempo se calcula al mostrarlo:
// así "hoy" no queda escrito para siempre en algo que pasó hace tres semanas.
function cuando(f) {
  const dias = Math.round((Date.parse(hoyISO()) - Date.parse(f)) / 86400000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7)  return `Hace ${dias} días`;
  if (dias < 14) return 'La semana pasada';
  return `Hace ${Math.floor(dias / 7)} semanas`;
}
// Los resúmenes viejos son texto suelto; los nuevos traen fecha. Conviven.
const textoResumen = r => (typeof r === 'string' ? r : `${cuando(r.f)}, ${minuscula(r.t)}`);

// ── navegación ────────────────────────────────────────────────────────────
let pantallaPrevia = 'entrada';
function ir(id) {
  const actual = document.querySelector('.p.on');
  if (actual && actual.id !== id) pantallaPrevia = actual.id;
  document.querySelectorAll('.p').forEach(p => p.classList.toggle('on', p.id === id));
  if (id !== 'conv') pararVoz?.();
  // Volver al chat después de "Terminé" abre una charla nueva, que arranca retomando
  // el tema de la última vez. La que se cerró ya quedó guardada en la historia.
  if (id === 'conv') { ajustarColchon(); if (cerrada) empezarDeNuevo(); if (!mensajes.length) climaInicial(); else $('#conv').dataset.hora = esDeNoche() ? 'noche' : 'dia'; abrirConversacion(); $('#txt').focus(); seguir(false); }
  if (id === 'calma') empezarRespiracion(); else pararRespiracion();
  if (id === 'entrada') animarSaludo();
  if (id === 'mem') pintarMemoria();
  if (id === 'historia') pintarHistoria();
  if (id === 'pensamientos') pintarPensamientos();
  if (id === 'resumen') pintarResumen();
  if (id === 'actividades') pintarActividades();
  if (id === 'prefs') pintarPreferencias();
  if (id === 'about') pintarAbout();
  if (id === 'ayuda') pintarAyuda();
  if (id === 'ob2') $('#ob-nombre').focus();
}
// Mientras el dedo está apoyado, la fila se prende en violeta. Tiene que pasar
// en pointerdown: para cuando llega el click la pantalla ya cambió.
document.addEventListener('pointerdown', e => {
  const f = e.target.closest('.fila-menu');
  if (!f) return;
  f.classList.add('tocada');
  const soltar = () => f.classList.remove('tocada');
  addEventListener('pointerup', soltar, { once: true });
  addEventListener('pointercancel', soltar, { once: true });
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ir]');
  if (!b) return;
  if (b.dataset.ir === 'calma') desbloquearAudio();
  ir(b.dataset.ir);
});
$('#salir-calma').onclick = () => { if (!volverDeRespirar()) ir(mensajes.length ? 'conv' : 'entrada'); };
$('#salir-mem').onclick   = () => ir('menu');
$('#salir-menu').onclick  = () => ir(mensajes.length && !cortado ? 'conv' : 'entrada');
$('#salir-ayuda').onclick = () => ir(pantallaPrevia === 'ayuda' ? 'conv' : pantallaPrevia);
$('#ver-ayuda').onclick   = () => ir('ayuda');

function pintarAyuda() {
  const c = $('#ayuda-cuerpo'); c.innerHTML = '';
  c.append(tarjetasRecursos());
  c.append(directorio());
}

// ── directorio de profesionales ───────────────────────────────────────────
// Vive en la capa de ayuda, junto al 135. Listar psicólogos no ayuda a ordenar lo
// que te pasa, así que no es una funcionalidad aparte: Amber lista y el contacto pasa
// afuera de la app, sin trámite y sin comisión. Mientras no esté el listado propio,
// van los caminos que existen para cualquiera.
const CAMINOS = [
  ['Tu obra social o prepaga', 'Tiene una cartilla de salud mental. Es el camino más directo si tenés cobertura.'],
  ['El hospital público de tu zona', 'Los servicios de salud mental atienden sin costo. Puede haber lista de espera.'],
  ['Las facultades de psicología', 'Algunas tienen servicios de atención con aranceles bajos.'],
];
function directorio() {
  const g = el('div', 'grupo');
  g.style.marginTop = '28px';
  g.append(el('h3', 'dir-t', 'Si querés empezar con un psicólogo'));
  const t = el('div', 'tarj');
  CAMINOS.forEach(([titulo, texto], i) => {
    if (i) t.append(el('div', 'div'));
    const f = el('div', 'dir-f');
    f.append(el('div', 'dir-n', titulo), el('div', 'rec-d', texto));
    t.append(f);
  });
  g.append(t);
  g.append(el('div', 'vacio', 'El listado de profesionales que recomienda Amber se suma cuando estén los primeros. El contacto siempre es directo con ellos, por fuera de la app.'));
  return g;
}

// ── respirar ──────────────────────────────────────────────────────────────
// Seis respiraciones por minuto, con la exhalación más larga que la inhalación y
// sin retener el aire: es el ritmo donde la variabilidad cardíaca llega a su
// máximo, y retener o respirar "hondo" puede disparar sobrerrespiración en
// alguien con ansiedad. Nueve ciclos de diez segundos: los noventa de la home.
// Una sola respiración en dos versiones (pirámide del 12/11): la corta, de noventa
// segundos, y la prolongada, de unos cinco minutos, que es la que la home ofrece de noche.
const TECNICAS = {
  // 6 por minuto: la frecuencia de resonancia, donde la variabilidad cardíaca
  // llega a su amplitud máxima. Nueve ciclos de diez segundos: noventa segundos.
  calmar: { rotulo: 'Corta', acomodo: 4000, inhala: 4000, inhala2: 0, suelta: 6000, ciclos: 9,
            sub: 'Seguí el círculo. No hace falta respirar hondo.',
            anuncio: 'Noventa segundos de respiración.' },
  // 5 por minuto, con la exhalación al doble de la inhalación: más lento y más
  // pesado del lado de soltar, que es el lado que baja la activación. Veinticinco
  // ciclos de doce segundos: cinco minutos.
  dormir: { rotulo: 'Prolongada', acomodo: 5000, inhala: 4000, inhala2: 0, suelta: 8000, ciclos: 25,
            sub: 'Más lento. Soltá el aire sin apuro.',
            anuncio: 'Cinco minutos de respiración.' },
};
let RESP = TECNICAS[prefs.respirar] ?? TECNICAS.calmar;
const calma = $('#calma'), calmaT = $('#calma-t'), calmaS = $('#calma-s'), calmaAviso = $('#calma-aviso'),
      progreso = $('#calma-progreso'), botonSonido = $('#calma-sonido');
const orbeHalo = $('#calma-o1'), orbeCentro = $('#calma-o2'), orbeRastro = $('#calma-rastro'), calmaLuz = $('#calma-luz');
let resp = null, bloqueo = null;

// ── la prolongada es una meditación guiada ───────────────────────────────────
// Cinco minutos: veinticinco vueltas de doce segundos. La guía va por vuelta y no por
// reloj, así una pausa (la app en segundo plano) no la desfasa. Las primeras tres
// vueltas marcan el ritmo con la marea; después la respiración va sola y la palabra
// del centro se apaga. Sin nombres de técnicas, sin promesas, sin "estoy acá".
const GUIA_PROLONGADA = {
  0:  'Seguí la marea. Inhalá cuando sube, soltá cuando baja.',
  3:  'Ahora dejá que la respiración vaya sola. No hace falta hacerla bien.',
  6:  'La frente.',
  7:  'La mandíbula, si está apretada.',
  8:  'Los hombros.',
  9:  'Las manos.',
  10: 'La panza, que sube y baja.',
  12: 'Van a aparecer pensamientos. Está bien. No hace falta seguirlos ni echarlos.',
  15: 'Si te fuiste lejos, volvé a la respiración. Volver es todo lo que hay que hacer.',
  17: '',
  21: 'Empezá a notar los sonidos de alrededor.',
  23: 'Mové un poco los dedos.',
};
const VUELTA_LIBRE = 3;
const calmaGuia = $('#calma-guia');
let guiaTimer = null;
function guiar(texto) {
  clearTimeout(guiaTimer);
  calmaGuia.classList.remove('on');
  guiaTimer = setTimeout(() => {
    calmaGuia.textContent = texto;
    if (texto) { calmaGuia.classList.add('on'); avisarCalma(texto); }
  }, 700);
}
function guiaDeLaVuelta(ciclo) {
  if (calma.dataset.tec !== 'dormir') return;
  if (ciclo >= VUELTA_LIBRE) calma.dataset.libre = ''; else delete calma.dataset.libre;
  if (ciclo in GUIA_PROLONGADA) guiar(GUIA_PROLONGADA[ciclo]);
}
function callarGuia() { clearTimeout(guiaTimer); calmaGuia.classList.remove('on'); calmaGuia.textContent = ''; delete calma.dataset.libre; }

// La cuenta de segundos de cada fase. Solo se ve en la corta: en la prolongada,
// que es para soltar y muchas veces con los ojos cerrados, los números sobran.
const calmaCuenta = $('#calma-cuenta'), calmaCiclo = $('#calma-ciclo');
let cuentaTimer = null;
function contar(ms) {
  clearInterval(cuentaTimer);
  let n = Math.round(ms / 1000);
  calmaCuenta.textContent = n > 0 ? n : '';
  if (n <= 1) return;
  cuentaTimer = setInterval(() => { n--; calmaCuenta.textContent = n > 0 ? n : ''; if (n <= 1) clearInterval(cuentaTimer); }, 1000);
}
function fase(nombre, ms) {
  calma.style.setProperty('--dur', ms + 'ms');
  calma.dataset.fase = nombre;
  if (nombre === 'inhala' || nombre === 'suelta') contar(ms);
  else { clearInterval(cuentaTimer); calmaCuenta.textContent = ''; }
}
const avisarCalma = t => { calmaAviso.textContent = ''; setTimeout(() => { calmaAviso.textContent = t; }, 50); };

// Elegir técnica: se guarda, y si tocás una mientras ya está andando, el
// ejercicio arranca de nuevo con la nueva en vez de quedar a mitad de camino.
const tecnicasEl = $('#calma-tecnicas');
function elegirRespiracion(tec) {
  prefs.respirar = TECNICAS[tec] ? tec : 'calmar';
  guardarPrefs();
  RESP = TECNICAS[prefs.respirar];
}
tecnicasEl.querySelectorAll('.calma-tec').forEach(b => {
  b.onclick = () => {
    elegirRespiracion(b.dataset.tec);
    pintarTecnicas();
    vibrar(10);
    avisarCalma(`${RESP.rotulo}. ${RESP.sub}`);
    desbloquearAudio();
    empezarRespiracion();
  };
});
function pintarTecnicas(deslizar = true) {
  const cual = prefs.respirar ?? 'calmar';
  let activa = null;
  tecnicasEl.querySelectorAll('.calma-tec').forEach(b => {
    const es = b.dataset.tec === cual;
    b.setAttribute('aria-checked', String(es));
    if (es) activa = b;
  });
  // La línea va debajo de la palabra elegida, de su mismo ancho. Al tocar otra se
  // desliza; al entrar a la pantalla, aparece ya en su lugar.
  const linea = $('#calma-tec-linea');
  if (!activa || !activa.offsetWidth) return;
  linea.classList.toggle('sin-transicion', !deslizar);
  linea.style.setProperty('--x', `${activa.offsetLeft}px`);
  linea.style.setProperty('--ancho', `${activa.offsetWidth}px`);
  if (!deslizar) { void linea.offsetWidth; linea.classList.remove('sin-transicion'); }
}
// Las palabras cambian de ancho cuando termina de cargar la tipografía o si cambia la pantalla.
document.fonts?.ready.then(() => pintarTecnicas(false));
addEventListener('resize', () => pintarTecnicas(false));

// ── cómo se mueve ─────────────────────────────────────────────────────────────
// Las tres técnicas tienen el mismo color: se reconocen por el movimiento.
// Calmarme es la referencia, una expansión pareja y redonda. Para dormir llega más
// lejos y más pesada. Bajar de golpe tiene el doble pulso del suspiro: sube, salta
// corto y marcado, y recién ahí suelta.
const SENO = 'cubic-bezier(.37,0,.63,1)';   // arranca y frena despacio, como el aire
const MOVIMIENTO = {
  calmar: { pico: 1.37, curva: SENO, suelta: SENO },
  dormir: { pico: 1.55, curva: 'cubic-bezier(.65,0,.35,1)', suelta: 'cubic-bezier(.45,0,.55,1)' },
  bajar:  { pico: 1.25, pico2: 1.45, curva: SENO, salto: 'cubic-bezier(.16,1,.3,1)', suelta: SENO },
};
// Unos milisegundos quieto arriba marcan el cambio de fase. No es retener el aire:
// sale del tiempo de la inhalación, y el ejercicio dura lo mismo.
const PICO_QUIETO = 300;
const LUZ_PICO = 0.16;                      // cuánto se aclara la escena al inhalar
const HALO = { quieto: 0.45, arriba: 0.9, abajo: 0.4 };
const menosMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const movimiento = () => MOVIMIENTO[prefs.respirar] ?? MOVIMIENTO.calmar;
// El resplandor se apaga de a poco: pleno en el primer ciclo, al 60% en el último.
const brilloDelCiclo = () => 1 - 0.4 * (resp ? resp.ciclo / Math.max(1, RESP.ciclos - 1) : 0);

function valorActual(nodo, prop) {
  const cs = getComputedStyle(nodo);
  if (prop === 'opacity') return parseFloat(cs.opacity);
  const m = cs.transform.match(/matrix\(([-\d.e]+)/);
  return m ? parseFloat(m[1]) : 1;
}
// Lleva un nodo desde donde está ahora hasta sus destinos, con la curva dada, y lo
// deja quieto los últimos `quieto` ms. Una sola animación por nodo, así nada se pisa.
function llevar(nodo, destinos, ms, curva, quieto = 0) {
  const desde = Object.fromEntries(Object.keys(destinos).map(k => [k, valorActual(nodo, k)]));
  nodo.getAnimations().forEach(a => a.cancel());
  const cuadro = (vals, extra) => ({
    ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, k === 'transform' ? `scale(${v})` : String(v)])), ...extra });
  const llega = ms > quieto ? (ms - quieto) / ms : 1;
  const cuadros = [cuadro(desde, { easing: curva }), cuadro(destinos, { offset: llega })];
  if (llega < 1) cuadros.push(cuadro(destinos, {}));
  nodo.animate(cuadros, { duration: Math.max(ms, 1), fill: 'forwards' });
}
function moverOrbe(escala, halo, ms, curva, quieto = 0) {
  // Con movimiento reducido la guía sigue, con un recorrido corto.
  const e = menosMovimiento() ? 1 + (escala - 1) * 0.35 : escala;
  llevar(orbeCentro, { transform: e }, ms, curva, quieto);
  llevar(orbeHalo, { transform: e, opacity: halo }, ms, curva, quieto);
}
function aclarar(opacidad, ms, curva) {
  llevar(calmaLuz, { opacity: menosMovimiento() ? 0 : opacidad }, ms, curva);
}
// Al achicarse, el orbe deja medio segundo un anillo tenue donde estaba.
function dejarRastro() {
  if (menosMovimiento()) return;
  const e = valorActual(orbeCentro, 'transform');
  orbeRastro.getAnimations().forEach(a => a.cancel());
  orbeRastro.animate([{ transform: `scale(${e})`, opacity: 0.4 * brilloDelCiclo() },
                      { transform: `scale(${e * 1.05})`, opacity: 0 }],
    { duration: 500, easing: 'ease-out', fill: 'forwards' });
}
function aquietarEscena(ms) {
  moverOrbe(1, HALO.quieto, ms, SENO);
  aclarar(0, ms, SENO);
}

// ── sonido: una ola ──────────────────────────────────────────────────────────
// Ruido marrón, que es el que más se parece a agua y a viento, pasado por un filtro y
// una reverb. La regla es que cambie mucho el volumen y poco el brillo: al inhalar la
// ola sube despacio, al soltar se retira más lento todavía, y entre ciclos queda un
// mar de fondo bajito, sin silencios. Si el filtro barriera mucho, el ruido gemiría.
// Se genera en el momento, sin archivos.
// Los navegadores no dejan que algo suene sin un toque de la persona: el audio se
// destraba en los toques que llevan a respirar, y si igual quedó trabado, el botón
// "Sumá sonido" es el que lo destraba.
const OLA = {
  fondo: 0.038, arriba: 0.21,  arriba2: 0.24,    // volumen: el techo más bajo que la ola de antes, para que no raspe
  filtroAbajo: 700, filtroArriba: 1200,           // brillo: se mueve poco
  cola: 2.6,                                      // segundos de reverb
};
const HAY_AUDIO = !!(window.AudioContext || window.webkitAudioContext);
if (!HAY_AUDIO) botonSonido.hidden = true;
let audio = null;

function contextoAudio() {
  if (!HAY_AUDIO) return null;
  if (!audio || audio.state === 'closed') {
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); audio.onstatechange = pintarSonido; }
    catch (e) { audio = null; }
  }
  return audio;
}
// Solo desde un toque. Además del resume suena algo vacío: hay iPhone que no
// destraban el audio hasta que algo suena de verdad.
function desbloquearAudio() {
  if (!sonidoElegido()) return;
  const ctx = contextoAudio();
  if (!ctx) return;
  try { const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); b.connect(ctx.destination); b.start(0); } catch (e) {}
  ctx.resume?.().catch(() => {});
}
// Prendido salvo que la persona lo haya silenciado alguna vez: eso se recuerda.
const sonidoElegido = () => prefs.sonidoResp !== false;
const audioSonando = () => !!(sonidoElegido() && audio && audio.state === 'running');

// La cola de la reverb: ruido que se apaga solo en `seg` segundos, distinto en cada
// oído. Es lo que convierte el ruido en espacio.
function colaReverb(ctx, seg) {
  const n = Math.floor(ctx.sampleRate * seg), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
  }
  return buf;
}
// Arma la ola en el contexto que le den (el de la app, o uno fuera de línea para medirla).
function armarOla(ctx) {
  const n = ctx.sampleRate * 8, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  let marron = 0, pico = 0;
  for (let i = 0; i < n; i++) { marron = (marron + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = marron; pico = Math.max(pico, Math.abs(marron)); }
  for (let i = 0; i < n; i++) d[i] *= 0.8 / pico;              // normalizado: el pico del ruido queda en 0,8
  const borde = Math.floor(ctx.sampleRate * 0.05);              // sin clic al dar la vuelta el loop
  for (let i = 0; i < borde; i++) { const k = i / borde; d[i] *= k; d[n - 1 - i] *= k; }
  const fuente = ctx.createBufferSource(); fuente.buffer = buf; fuente.loop = true;
  const filtro = ctx.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = OLA.filtroAbajo; filtro.Q.value = 0.5;
  const vol = ctx.createGain(); vol.gain.value = 0.0001;
  const seco = ctx.createGain(); seco.gain.value = 0.75;
  const reverb = ctx.createConvolver(); reverb.buffer = colaReverb(ctx, OLA.cola);
  const mojado = ctx.createGain(); mojado.gain.value = 0.55;
  fuente.connect(filtro); filtro.connect(vol);
  vol.connect(seco); seco.connect(ctx.destination);
  vol.connect(reverb); reverb.connect(mojado); mojado.connect(ctx.destination);
  fuente.start();
  return { ctx, fuente, filtro, vol, brillo: OLA.filtroAbajo, volumen: 0.0001 };
}
function crearOla() {
  const ctx = contextoAudio();
  if (!ctx) return null;
  try {
    const o = armarOla(ctx);
    // Suena desde el primer momento: sin fundido de entrada, solo lo justo para que
    // no haga clic.
    programarOla(o, 'fondo', ctx.currentTime, 40);
    return o;
  } catch (e) { return null; }
}
const curvaSeno = (a, b, n = 48) => Float32Array.from({ length: n }, (_, i) => a + (b - a) * (1 - Math.cos(Math.PI * i / (n - 1))) / 2);
function planear(param, desde, hasta, t, seg) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t); else param.cancelScheduledValues(t);
  param.setValueCurveAtTime(curvaSeno(desde, hasta), t + 0.01, Math.max(seg, 0.05));
}
// Lleva la ola a donde va la fase, empezando en el tiempo t del contexto.
function programarOla(o, nombre, t, ms, quieto = 0) {
  const seg = ms / 1000, mov = Math.max((ms - quieto) / 1000, 0.05);
  const [volumen, brillo, dur] = {
    inhala:  [OLA.arriba, OLA.filtroArriba, mov],                      // sube con curva suave
    inhala2: [OLA.arriba2, OLA.filtroArriba, Math.min(0.35, mov)],     // el segundo impulso, cortito
    suelta:  [OLA.fondo, OLA.filtroAbajo, seg],                        // se retira durante toda la exhalación
    fondo:   [OLA.fondo, OLA.filtroAbajo, seg],
  }[nombre] ?? [OLA.fondo, OLA.filtroAbajo, seg];
  planear(o.vol.gain, o.volumen, volumen, t, dur);
  planear(o.filtro.frequency, o.brillo, brillo, t, dur);
  o.volumen = volumen; o.brillo = brillo;
}
function ola(nombre, ms, quieto = 0) {
  const o = resp?.ola;
  if (!o) return;
  try { programarOla(o, nombre, o.ctx.currentTime, ms, quieto); } catch (e) {}
}
function callarOla(ms) {
  const o = resp?.ola;
  if (!o) return;
  resp.ola = null;
  try { planear(o.vol.gain, o.volumen, 0.0001, o.ctx.currentTime, ms / 1000); } catch (e) {}
  // La reverb sigue sonando un poco después de que la ola se calló: se corta cuando terminó.
  setTimeout(() => { try { o.fuente.stop(); o.vol.disconnect(); } catch (e) {} }, ms + OLA.cola * 1000 + 200);
}

function pintarSonido() {
  const sonando = audioSonando();
  botonSonido.setAttribute('aria-pressed', String(sonando));
  $('#calma-sonido-t').textContent = sonando ? 'Silenciar' : 'Sumá sonido';
}
botonSonido.onclick = () => {
  if (audioSonando()) {
    prefs.sonidoResp = false; guardarPrefs();
    callarOla(500);
  } else {
    // Prenderlo, o destrabarlo si ya estaba prendido y el navegador lo frenó.
    prefs.sonidoResp = true; guardarPrefs();
    desbloquearAudio();
    if (resp && !resp.ola && (resp.timer || resp.pausada)) resp.ola = crearOla();
    if (resp?.ola && calma.dataset.fase !== 'quieto') ola(calma.dataset.fase, 800);
  }
  pintarSonido();
};

// ── el ejercicio ─────────────────────────────────────────────────────────────
function empezarRespiracion() {
  clearTimeout(vueltaRespirar);
  pararRespiracion();
  resp = { ciclo: 0, timer: null, ola: null, pausada: false };
  delete calma.dataset.terminado;
  // Cada una tiene su escena: la corta es un círculo con anillo y cuenta; la
  // prolongada, un cielo de noche con una marea.
  calma.dataset.tec = prefs.respirar ?? 'calmar';
  calmaCiclo.textContent = '';
  callarGuia();
  calma.style.setProperty('--brillo', 1);
  $('#salir-calma').textContent = 'Terminar';
  calmaT.textContent = 'Acomodate como estés.';
  calmaS.textContent = RESP.sub;
  progreso.style.transition = 'none'; progreso.style.width = '0';
  fase('quieto', 1200);
  // Al entrar, la línea aparece en su lugar; si se eligió otra técnica, sigue deslizándose.
  pintarTecnicas(!!$('#calma-tec-linea').style.getPropertyValue('--x'));
  if (sonidoElegido()) resp.ola = crearOla();
  pintarSonido();
  mantenerPantalla();
  avisarCalma(`${RESP.anuncio} Acomodate como estés.`);
  resp.timer = setTimeout(inhalar, RESP.acomodo);
}

function inhalar() {
  if (!resp) return;
  const m = movimiento(), b = brilloDelCiclo();
  calma.style.setProperty('--brillo', b);
  // En Bajar de golpe no hay quietud entre las dos inhaladas: el salto sale enseguida.
  const quieto = RESP.inhala2 ? 0 : PICO_QUIETO;
  fase('inhala', RESP.inhala);
  moverOrbe(m.pico, HALO.arriba * b, RESP.inhala, m.curva, quieto);
  aclarar(LUZ_PICO * b, RESP.inhala, m.curva);
  ola('inhala', RESP.inhala, quieto);
  vibrar(24);
  if (!calma.hasAttribute('data-libre')) avisarCalma('Inhalá');
  calmaCiclo.textContent = `${resp.ciclo + 1} de ${RESP.ciclos}`;
  guiaDeLaVuelta(resp.ciclo);
  progreso.style.transition = `width ${RESP.inhala + RESP.inhala2 + RESP.suelta}ms linear`;
  progreso.style.width = `${(resp.ciclo + 1) / RESP.ciclos * 100}%`;
  resp.timer = setTimeout(RESP.inhala2 ? inhalarDeNuevo : soltar, RESP.inhala);
}

// La segunda inhalada del suspiro fisiológico: un salto corto y marcado arriba de la primera.
function inhalarDeNuevo() {
  if (!resp) return;
  const m = movimiento(), b = brilloDelCiclo();
  fase('inhala2', RESP.inhala2);
  moverOrbe(m.pico2 ?? m.pico, HALO.arriba * b, RESP.inhala2, m.salto ?? m.curva, PICO_QUIETO);
  ola('inhala2', RESP.inhala2, PICO_QUIETO);
  vibrar(10);
  resp.timer = setTimeout(soltar, RESP.inhala2);
}

function soltar() {
  if (!resp) return;
  const m = movimiento(), b = brilloDelCiclo();
  fase('suelta', RESP.suelta);
  dejarRastro();
  moverOrbe(1, HALO.abajo * b, RESP.suelta, m.suelta);
  aclarar(0, RESP.suelta, m.suelta);
  ola('suelta', RESP.suelta);
  vibrar(12);
  if (!calma.hasAttribute('data-libre')) avisarCalma('Soltá');
  resp.timer = setTimeout(() => { resp.ciclo++; resp.ciclo < RESP.ciclos ? inhalar() : terminarRespiracion(); }, RESP.suelta);
}

function terminarRespiracion() {
  clearTimeout(resp.timer); resp.timer = null;
  fase('quieto', 2400);
  aquietarEscena(2400);
  callarOla(2400);
  soltarPantalla();
  calmaCiclo.textContent = '';
  callarGuia();
  calmaT.textContent = 'Ya está.';
  calmaS.textContent = 'Quedate un momento así. Si querés, seguimos un rato más.';
  calma.dataset.terminado = '';
  $('#salir-calma').textContent = 'Volver';
  avisarCalma('Terminó. Podés seguir un rato más o volver.');
  // Si se entró desde la oferta de Amber, el "Ya está" se ve un momento y se
  // vuelve sola a la conversación.
  if (respiracionDesdeCharla) vueltaRespirar = setTimeout(volverDeRespirar, 2400);
}

// Amber puede proponer respirar: termina su mensaje con [RESPIRAR]. El marcador no se
// muestra; abajo del mensaje queda un botón. No arranca sola: cambiarle la pantalla a
// alguien en un mal momento le saca el control, y además el sonido solo puede
// arrancar con un toque. Al volver, termine o salga antes, Amber ya dejó escrito que
// sigue ahí: nunca se vuelve a una charla que quedó muda.
const MARCA_RESPIRAR = '[RESPIRAR]';
// Amber no se personifica: ni "acá estoy" ni "estoy". Lo que retoma es el lugar.
const VUELTA_RESPIRAR = 'Seguimos cuando quieras.';
const PIEDRA_CHICA = '<svg viewBox="6 5 70 90" aria-hidden="true"><path d="M28 9 C42 28 65 48 70.5 67 C72.5 73 71 82 67.5 86.5 L42.5 91 L14.5 85.5 C10.5 83 9.5 78 11 72.5 C16 50 22 26 28 9 Z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><path d="M22 74 C31 75.6 45 75.6 56 73.6" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>';
let respiracionDesdeCharla = false, vueltaRespirar = null, ofertaEl = null;
function ofrecerRespirar() {
  quitarOferta();
  const b = el('button', 'oferta-respirar');
  b.innerHTML = PIEDRA_CHICA;
  b.append(el('span', null, 'Noventa segundos de respiración'));
  b.onclick = () => {
    if (cortado) return;
    quitarOferta();
    respiracionDesdeCharla = true;
    elegirRespiracion('calmar');
    desbloquearAudio();
    ir('calma');
  };
  hilo.appendChild(b); seguir(true);
  ofertaEl = b;
}
function quitarOferta() { ofertaEl?.remove(); ofertaEl = null; }
function volverDeRespirar() {
  if (!respiracionDesdeCharla) return false;
  respiracionDesdeCharla = false;
  clearTimeout(vueltaRespirar);
  ir('conv');
  turno('assistant', VUELTA_RESPIRAR);
  mensajes.push({ role: 'assistant', content: VUELTA_RESPIRAR });
  guardarCharlaEnCurso();
  anunciar(VUELTA_RESPIRAR);
  return true;
}
// Lo que se puede mostrar de lo que llegó: sin el marcador y, mientras sigue
// llegando, sin la cola que todavía podría ser uno ("[RES" llega antes que
// "PIRAR]") ni los renglones en blanco que lo preceden.
function sinMarca(crudo, terminado) {
  let v = crudo.replace(/\s*\[RESPIRAR\][ \t]*/g, '');
  if (terminado) return v.trimEnd();
  const i = v.lastIndexOf('[');
  if (i > -1 && MARCA_RESPIRAR.startsWith(v.slice(i))) v = v.slice(0, i);
  return v.replace(/\s+$/, '');
}

function pararRespiracion() {
  if (!resp) return;
  clearTimeout(resp.timer);
  callarOla(400);
  soltarPantalla();
  resp = null;
  callarGuia();
  fase('quieto', 600);
  for (const n of [orbeCentro, orbeHalo, orbeRastro, calmaLuz]) n.getAnimations().forEach(a => a.cancel());
  delete calma.dataset.terminado;
}

// Si la app pasa a segundo plano, el navegador frena los relojes y la guía se
// desfasa. Se pausa, y al volver retoma desde una inhalación.
document.addEventListener('visibilitychange', () => {
  if (!resp || (!resp.timer && !resp.pausada)) return;
  if (document.hidden) {
    clearTimeout(resp.timer); resp.timer = null; resp.pausada = true;
    progreso.style.transition = 'none'; progreso.style.width = getComputedStyle(progreso).width;
    ola('fondo', 600); fase('quieto', 600); aquietarEscena(600);
  } else if (resp.pausada) {
    resp.pausada = false; mantenerPantalla();
    // Sin un toque, el navegador puede no dejar que vuelva a sonar: si pasa, el botón
    // vuelve a decir "Sumá sonido".
    audio?.resume?.().catch(() => {});
    resp.timer = setTimeout(inhalar, 1200);
  }
});

async function mantenerPantalla() {
  try { bloqueo = await navigator.wakeLock?.request('screen') ?? null; } catch (e) { bloqueo = null; }
}
function soltarPantalla() { bloqueo?.release?.().catch(() => {}); bloqueo = null; }

$('#calma-otro').onclick = () => { desbloquearAudio(); empezarRespiracion(); };

// ── entrada ───────────────────────────────────────────────────────────────
const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
// A las tres de la mañana todavía es "buenas noches": el día cambia cuando te
// levantás, no cuando lo dice el reloj.
function saludoDeLaHora(h) {
  if (h >= 5 && h < 12) return 'Buen día';
  if (h >= 12 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

// El saludo se arma letra por letra para poder escribirlo de a poco. El lector de
// pantalla lee la frase entera, no las letras sueltas.
function escribirSaludo(texto) {
  const h = $('#saludo');
  if (h.dataset.texto === texto) return;
  pararTecleo();
  h.dataset.texto = texto;
  h.setAttribute('aria-label', texto);
  h.textContent = '';
  texto.split(' ').forEach((palabra, k) => {
    if (k) h.append(' ');
    const p = el('span', 'sal-p'); p.setAttribute('aria-hidden', 'true');
    for (const letra of palabra) p.append(el('span', 'sal-l', letra));
    h.append(p);
  });
}
// Se anima al abrir la app y cuando el saludo cambió, no cada vez que se vuelve a la
// home: repetido todo el tiempo deja de ser un detalle y pasa a ser una espera. Al
// abrir espera al splash, que si no lo taparía.
//
// Es una máquina de escribir: cada letra aparece de golpe, sin fundido, con el
// cursor adelante. Arranca despacio y agarra ritmo, como quien empieza a escribir:
// entre tecla y tecla pasan unos 200 ms al principio y 45 ms al final. Encima va
// lo que tiene una mano: cada tecla un poco irregular, y una pausa después de la
// coma. Mientras escribe el cursor queda fijo; cuando termina parpadea, como en
// cualquier editor, y se va. Las letras ocupan su lugar desde el principio,
// invisibles, así el renglón no salta mientras se escribe.
let saludoAnimado = null, tecleo = null;
const TECLA = { primera: 200, ultima: 45, coma: 280, espera: 520, parpadeos: 3 };
function pararTecleo() {
  clearTimeout(tecleo);
  const h = $('#saludo');
  h.classList.remove('escribiendo', 'tecleando', 'escrito');
  h.querySelectorAll('.va, .sal-cursor, .sal-cursor-antes').forEach(l => l.classList.remove('va', 'sal-cursor', 'sal-cursor-antes'));
}
function animarSaludo() {
  const h = $('#saludo');
  if (h.dataset.texto === saludoAnimado) return;
  saludoAnimado = h.dataset.texto;
  pararTecleo();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Cada paso es una tecla. El espacio también se teclea: el cursor pasa al
  // principio de la palabra que sigue, aunque esa palabra baje de renglón.
  const pasos = [];
  h.querySelectorAll('.sal-p').forEach((p, w) => {
    const letras = [...p.children];
    if (w) pasos.push({ antes: letras[0] });
    for (const l of letras) pasos.push({ letra: l });
  });
  const cursor = (l, antes) => {
    h.querySelector('.sal-cursor, .sal-cursor-antes')?.classList.remove('sal-cursor', 'sal-cursor-antes');
    l.classList.add(antes ? 'sal-cursor-antes' : 'sal-cursor');
  };
  h.classList.add('escribiendo');
  cursor(pasos[0].letra, true);

  let k = 0;
  const tecla = () => {
    const paso = pasos[k];
    h.classList.add('tecleando');
    if (paso.letra) { paso.letra.classList.add('va'); cursor(paso.letra); }
    else cursor(paso.antes, true);
    if (++k === pasos.length) {
      h.classList.remove('tecleando');
      h.classList.add('escrito');
      tecleo = setTimeout(pararTecleo, TECLA.parpadeos * 1060);
      return;
    }
    const p = k / (pasos.length - 1);
    const ritmo = TECLA.ultima + (TECLA.primera - TECLA.ultima) * (1 - p) ** 2;
    const pausa = paso.letra?.textContent === ',' ? TECLA.coma : 0;
    tecleo = setTimeout(tecla, ritmo * (0.75 + Math.random() * 0.5) + pausa);
  };
  tecleo = setTimeout(tecla, Math.max(120, 1250 - performance.now()) + TECLA.espera);
}

function pintarEntrada() {
  const d = new Date();
  // La hora ya está arriba en la barra del teléfono, y repetirla acá convertía
  // el encabezado en un reloj. Lo que importa es qué día es.
  $('#fecha').textContent = `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  // El reconocimiento del espacio es el nombre: que el lugar sepa quién entró. El
  // tema de la última vez no va acá, va al entrar al chat: son dos momentos
  // distintos, para no dar dos bienvenidas seguidas.
  const apodo = memoria?.activa ? memoria.apodo : '';
  escribirSaludo(apodo ? `Hola, ${capitalizar(apodo)}.` : 'Hola.');
  pintarActividad();
}

// ── la actividad de la home ────────────────────────────────────────────────
// Cambia según la hora, no según el día: una actividad nueva cada día empuja al uso
// diario, y el uso que buscamos es episódico. De noche, la prolongada para dormir;
// el resto del día, la corta de noventa segundos.
const esDeNoche = (h = new Date().getHours()) => h >= 22 || h < 6;
function pintarActividad() {
  const noche = esDeNoche();
  $('#resp-t').textContent = noche ? 'Respirar para dormir' : 'Respirar';
  $('#resp-s').textContent = noche ? 'Cinco minutos' : 'Noventa segundos';
}
$('#ir-respirar').onclick = () => {
  elegirRespiracion(esDeNoche() ? 'dormir' : 'calmar');
  desbloquearAudio();
  ir('calma');
};
const hoyISO = () => new Date().toLocaleDateString('sv');   // sv da AAAA-MM-DD

// Lo que va al servidor: sin restos de lo que se sacó (tono, temas, día), por si
// quedaron en una memoria vieja.
function memoriaParaEnviar() {
  if (!memoria) return memoria;
  const { dia, estilo, temas, registro, ...resto } = memoria;
  return resto;
}

// ── conversación ──────────────────────────────────────────────────────────
const hilo = $('#hilo'), bajar = $('#bajar'), aviso = $('#aviso');
// Un solo canal de anuncios: dos zonas vivas compitiendo se pisan entre ellas.
const anunciar = t => { aviso.textContent = ''; setTimeout(() => { aviso.textContent = t; }, 60); };

// Colchón al pie: sin él, el último mensaje no puede subir al tope de la pantalla.
const COLCHON_MIN = 160;
function ajustarColchon() { hilo.style.paddingBottom = Math.max(0, hilo.clientHeight - COLCHON_MIN) + 'px'; }
const colchon = () => parseFloat(hilo.style.paddingBottom) || 0;
const finReal = () => hilo.scrollHeight - colchon();
const distanciaAlFin = () => finReal() - (hilo.scrollTop + hilo.clientHeight);

let auto = true;
hilo.addEventListener('scroll', () => {
  auto = distanciaAlFin() <= 120;
  bajar.hidden = auto;
});

// Sigue al texto que crece, pero nunca scrollea para arriba: eso desharía el anclado.
function seguir(suave) {
  if (!auto) return;
  const objetivo = finReal() - hilo.clientHeight;
  if (objetivo > hilo.scrollTop) hilo.scrollTo({ top: objetivo, behavior: suave ? 'smooth' : 'auto' });
}
// Al enviar, tu mensaje sube al tope y la respuesta crece abajo: el vacío del medio deja de existir.
function anclarArriba(nodo) {
  auto = true; bajar.hidden = true;
  hilo.scrollTo({ top: Math.max(0, nodo.offsetTop - 8), behavior: 'smooth' });
}
bajar.onclick = () => {
  auto = true; bajar.hidden = true;
  hilo.scrollTo({ top: finReal() - hilo.clientHeight, behavior: 'smooth' });
};

function turno(quien, texto) {
  const n = el('div', quien === 'user' ? 'yo' : 'am');
  // Lo que se mandó en tandas (renglones, pausas al dictar) no se pega en un párrafo corrido.
  if (quien === 'user') for (const l of texto.split(/\n+/).map(x => x.trim()).filter(Boolean)) n.append(el('p', null, l));
  else n.textContent = texto;
  hilo.appendChild(n);
  if (quien !== 'user') seguir(true);
  return n;
}
// El acceso a la memoria aparece donde nace la pregunta: justo después de que
// Amber demuestra por primera vez que se acuerda. Una vez por conversación.
let accesoMostrado = false;
function accesoMemoria() {
  if (accesoMostrado || !memoria || !memoria.activa) return;
  const hay = (memoria.datos?.length || memoria.objetivos?.length || memoria.estrategias?.length ||
               memoria.sensibles?.length || memoria.resumenes?.length);
  if (!hay) return;
  accesoMostrado = true;
  const b = el('button', 'acceso-mem', 'Lo que recuerdo de vos');
  b.onclick = () => ir('mem');
  hilo.appendChild(b); seguir(true);
}

function puntos() {
  const n = el('div', 'puntos');
  n.innerHTML = '<i class="pt"></i>';
  hilo.appendChild(n); seguir(true); return n;
}

// Al entrar al chat, Amber retoma el tema de la última vez y nombra el hecho, nunca
// cómo se sentía: "lo de tu ex" sí, "estabas dolida" no. Lola no elige nada ni hace
// trámites: si hoy es otra cosa, arranca por ahí. Sin historia, el chat arranca en
// blanco, con una línea chica y opcional para quien no sabe por dónde empezar.
const PISTA_RETOME = 'Si hoy es otra cosa, arrancá por ahí.';
const PISTA_BLANCO = 'Si no sabés por dónde empezar, contá qué pasó, sin ordenarlo.';
const aperturaDeHoy = () => {
  const tema = memoria?.activa ? memoria.ultimoTema?.trim() : '';
  return tema ? { texto: `¿Cómo venís con ${minuscula(tema)}?`, pista: PISTA_RETOME }
              : { texto: '', pista: PISTA_BLANCO };
};
let aperturasEl = null, conversacionAbierta = false, aperturaMostrada = '';
function abrirConversacion() {
  if (conversacionAbierta) return;
  conversacionAbierta = true;
  // Lo que venía de antes de recargar vuelve a la pantalla tal cual, sin saludar
  // de nuevo ni volver a ofrecer por dónde empezar.
  if (mensajes.length) {
    if (aperturaMostrada) turno('assistant', aperturaMostrada);
    for (const m of mensajes) turno(m.role, m.content);
    verCerrar();
    seguir(false);
    return;
  }
  const { texto, pista } = aperturaDeHoy();
  aperturaMostrada = texto;
  if (texto) turno('assistant', texto);
  const c = el('div', 'pista', pista);
  hilo.appendChild(c); seguir(true);
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
  hilo.appendChild(tarjetasRecursos()); seguir(true);
}

const txt = $('#txt'), enviar = $('#enviar');
// Los dedos y la voz escriben en el mismo lugar y por la misma puerta.
function escribir(v, seguirElFinal) {
  // Nunca reasignar el mismo texto: en algunos navegadores eso manda el cursor
  // al final, y escribir en el medio de una frase se vuelve imposible.
  if (txt.value !== v) txt.value = v;
  txt.style.height = 'auto'; txt.style.height = Math.min(txt.scrollHeight, 96) + 'px';
  enviar.classList.toggle('listo', txt.value.trim().length > 0);
  // Escribiendo con los dedos, el navegador sigue al cursor. Dictando no hay
  // cursor que seguir: pasados los 96px lo último dicho quedaba abajo del borde
  // y se perdía el hilo de lo que el micrófono venía agarrando.
  if (seguirElFinal) txt.scrollTop = txt.scrollHeight;
}
// Escribir con los dedos cierra el micrófono. Los dos escriben en el mismo campo:
// si siguen a la vez, lo que llega de la voz pisa lo que estás tecleando. Lo que
// se venía dictando queda donde está y la tecla que apretaste, también.
txt.addEventListener('input', () => { tocarActividad(); if (grabando) pararVoz(true); escribir(txt.value); });
txt.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !ocupado) { e.preventDefault(); mandar(); }
});
enviar.onclick = () => mandar();

// ── voz ───────────────────────────────────────────────────────────────────
// La voz entra, no sale: el usuario puede hablar, Amber nunca contesta hablando.
// A las tres de la mañana escribir cuesta; decirlo en voz alta, menos. Pero lo
// dictado NO se manda solo: cae en el campo de siempre y queda editable. Nadie
// manda sin leer lo que dijo, menos todavía si lo dijo llorando.
// Sin micrófono en la v1: el dictado del navegador manda el audio a un servidor
// ajeno (en Chrome, a Google), y eso rompe "todo vive en el teléfono". La voz
// quedó para la v2. El código queda para cuando vuelva.
const Reconocimiento = null;
const micro = $('#micro'), escucha = $('#escucha'), reloj = $('#reloj');

let rec = null, grabando = false, dictado = '', desde = 0, tic = null, cerrando = false;
// Cuando el micrófono se cierra porque volviste a escribir, el campo ya tiene lo
// bueno y no hay que pisarlo. La sesión es para no cerrar de prepo un micrófono
// que se abrió después: cada apertura es una sesión nueva.
let sinPisar = false, sesionVoz = 0;

// Una pausa corta es respirar en medio de una frase; recién un silencio largo es
// otra cosa. Se mide desde que cerró el segmento anterior hasta que volvió a
// sonar la voz, que es cuando llega el primer tanteo del segmento siguiente.
const PAUSA_RENGLON = 2500;
let ultimoFinal = 0, retomo = 0;
const union = () => !dictado ? '' : (retomo && retomo - ultimoFinal > PAUSA_RENGLON ? '\n' : ' ');

// Sin soporte del navegador el botón no existe: mejor que exista y falle.
if (!Reconocimiento) micro.hidden = true;

function pintarReloj() {
  const s = Math.max(0, Math.floor((Date.now() - desde) / 1000));
  reloj.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function abrirVoz() {
  if (grabando || cortado || ocupado || !Reconocimiento) return;
  // Lo que ya estaba escrito no se pisa: la voz sigue desde ahí.
  dictado = txt.value.trim();
  ultimoFinal = Date.now(); retomo = 0;
  grabando = true; cerrando = false; sinPisar = false; sesionVoz++;

  rec = new Reconocimiento();
  rec.lang = 'es-AR';
  rec.continuous = true;
  rec.interimResults = true;

  // El reconocimiento cierra un segmento en cada pausa, también en las de tomar
  // aire. Si cada una empieza renglón, lo dictado llega partido en pedazos sueltos:
  // solo el silencio largo corta, lo demás se pega con un espacio.
  rec.onresult = e => {
    if (cerrando) return;   // lo que llega tarde no vuelve a escribir un campo ya cerrado
    let tanteo = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i], frase = r[0].transcript.trim();
      if (!frase) continue;
      if (r.isFinal) { dictado += union() + frase; ultimoFinal = Date.now(); retomo = 0; }
      else { retomo ||= Date.now(); tanteo += (tanteo ? ' ' : '') + frase; }
    }
    escribir(dictado + (tanteo ? union() + tanteo : ''), true);
  };

  // El navegador corta solo después de un silencio. Acá el silencio es parte de
  // hablar: alguien que llora se calla diez segundos. Mientras no toques parar,
  // sigue escuchando.
  rec.onend = () => {
    if (grabando && !cerrando) { try { rec.start(); return; } catch (e) {} }
    cerrarVoz();
  };

  rec.onerror = e => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;  // un silencio no es un error
    cerrando = true;
    const permiso = e.error === 'not-allowed' || e.error === 'service-not-allowed';
    cerrarVoz();
    if (permiso) txt.placeholder = 'Para hablar necesito permiso del micrófono.';
  };

  try { rec.start(); } catch (e) { grabando = false; return; }

  desde = Date.now(); pintarReloj();
  tic = setInterval(pintarReloj, 1000);
  escucha.hidden = false;
  micro.classList.add('on');
  micro.setAttribute('aria-label', 'Dejar de hablar');
  // El campo NO se bloquea. Antes quedaba de solo lectura mientras escuchaba, y
  // si el micrófono no cerraba (la app pasa a segundo plano, el navegador no
  // avisa) no se podía escribir más: la charla quedaba trabada.
  txt.placeholder = 'Te escucho';
  anunciar('Micrófono abierto. Te escucho.');
}

// dejarTexto: se cierra porque el campo ya tiene lo que corresponde (lo que
// estás tecleando, o el mensaje que se está mandando) y no hay que tocarlo.
function pararVoz(dejarTexto) {
  if (!grabando) return;
  cerrando = true; sinPisar = !!dejarTexto;
  const sesion = sesionVoz;
  try { rec.stop(); } catch (e) { cerrarVoz(); }
  // Si el navegador no avisa que cerró, el micrófono queda prendido para siempre
  // y ni siquiera se puede volver a abrir. Pasado un segundo se cierra igual.
  setTimeout(() => { if (grabando && sesion === sesionVoz) cerrarVoz(); }, 1200);
}

function cerrarVoz() {
  if (!grabando) return;
  grabando = false; cerrando = false;
  clearInterval(tic); tic = null;
  escucha.hidden = true;
  micro.classList.remove('on');
  micro.setAttribute('aria-label', 'Hablar');
  if (!cortado) txt.placeholder = 'Escribí lo que quieras';
  anunciar('Micrófono cerrado. Podés revisar el texto antes de mandarlo.');
  if (sinPisar) { sinPisar = false; return; }
  escribir(dictado.trim(), true);   // se cae lo tanteado, queda lo firme
  txt.focus();
  // El cursor queda donde terminó de dictar, que es desde donde se sigue.
  txt.setSelectionRange(txt.value.length, txt.value.length);
  txt.scrollTop = txt.scrollHeight;
}

micro.onclick = () => grabando ? pararVoz() : abrirVoz();

// El texto se revela de a palabras enteras, nunca letra por letra, a ~14 por
// segundo: más lento que el modelo, pero sin hacer esperar. A 7 por segundo una
// respuesta corta tardaba tres segundos en terminar de aparecer.
const MS_POR_PALABRA = 70;
function revelador(nodo) {
  let pendiente = '', abierto = true, avisar = null;
  const id = setInterval(() => {
    if (pendiente) {
      // Sin un espacio después de texto, la palabra todavía está llegando entera.
      if (!/\S\s/.test(pendiente) && abierto) return;
      const veces = pendiente.length > 160 ? 3 : pendiente.length > 80 ? 2 : 1;
      for (let i = 0; i < veces && pendiente; i++) {
        const trozo = pendiente.match(/^\s*\S+\s*/)?.[0] ?? pendiente;
        nodo.textContent += trozo;
        pendiente = pendiente.slice(trozo.length);
      }
      seguir(false);
    } else if (!abierto) { clearInterval(id); avisar?.(); }
  }, MS_POR_PALABRA);
  return {
    empujar: t => { pendiente += t; },
    terminar: () => new Promise(r => { abierto = false; avisar = r; }),
  };
}

let ocupado = false, cortado = false, cerrada = false;
// cortar() es el final duro: se llegó al tope de mensajes y la salida es recargar.
// Cerrar por hoy ya no pasa por acá, porque después de cerrar se puede seguir
// hablando. Acá se archiva antes de soltar: si no, al recargar volvería la misma
// conversación pasada de largo y se cortaría de nuevo en el primer mensaje.
function cortar(nota) {
  cortado = true;
  if (mensajes.length) { const ch = charlaViva(); olvidarCharla(); cerrarEnSilencio(ch); }
  pararVoz();
  micro.hidden = true;
  txt.disabled = true;
  txt.placeholder = nota ?? 'Por hoy llegamos hasta acá.';
  enviar.classList.remove('listo');
  $('#cerrar-hoy').hidden = true;
}

// ── cerrar por hoy ────────────────────────────────────────────────────────
// Una conversación que no termina nunca no deja nada: queda abierta y se
// disuelve. Cerrarla a propósito es lo que produce el resumen que la próxima
// vez hace que Amber sepa de dónde venís.
const cerrarBtn = $('#cerrar-hoy');
const MINIMO_PARA_CERRAR = 1;   // cualquier charla se puede cerrar, hasta la de un mensaje
// Resumir dos mensajes sobre nada llena "Lo que me contaste" de ruido y gasta una
// llamada. Abajo de cuatro, la charla se guarda igual pero sin resumen.
const MINIMO_PARA_RESUMEN = 4;
// Sin "estoy": Amber no se personifica. La puerta queda abierta porque el hilo sigue.
const DESPEDIDA = 'Lo dejamos acá por hoy. Cuando vuelvas, seguimos desde acá.';

const mensajesDeLaPersona = () => mensajes.filter(m => m.role === 'user').length;

function verCerrar() {
  if (cortado || cerrada) return;
  cerrarBtn.hidden = mensajesDeLaPersona() < MINIMO_PARA_CERRAR;
}

// ── historia ──────────────────────────────────────────────────────────────
// Las conversaciones quedan en este teléfono y en ningún otro lado. Sesenta son
// unos dos meses hablando todos los días: más atrás nadie vuelve, y el navegador
// tiene un techo de espacio.
const LLAVE_HIST = 'amber.historia.v1';
const TOPE_HISTORIA = 60;
const cargarHistoria = () => { try { return JSON.parse(localStorage.getItem(LLAVE_HIST)) ?? []; } catch (e) { return []; } };
const guardarHistoria = (h) => { try { localStorage.setItem(LLAVE_HIST, JSON.stringify(h.slice(-TOPE_HISTORIA))); } catch (e) {} };

// La fecha de la charla es la de su primer mensaje, no la del momento en que se
// archiva: una conversación de anoche que se guarda sola a la mañana siguiente
// tiene que quedar anotada anoche.
function guardarEnHistoria({ f, dia, resumen, apertura, m }) {
  if (!m?.length) return;
  const h = cargarHistoria();
  h.push({
    f, dia: dia ?? null, r: resumen ?? '',
    // La apertura la muestra la app, no el modelo: si no se guarda, la charla
    // vieja empieza con una respuesta a una pregunta que no está.
    m: apertura ? [{ r: 'assistant', c: apertura }, ...m] : [...m],
  });
  guardarHistoria(h);
}

// El resumen de una charla archivada en silencio llega después que la charla: se
// guarda primero lo que se dijo, que es lo que no se puede volver a pedir.
function ponerResumen(f, resumen) {
  if (!resumen) return;
  const h = cargarHistoria();
  const ch = h.find(x => x.f === f);
  if (!ch) return;
  ch.r = resumen;
  guardarHistoria(h);
}

// ── la charla en curso ────────────────────────────────────────────────────
// Vivía solo en memoria del navegador: recargar, cerrar la pestaña o que el
// teléfono descarte la página se llevaba la conversación entera, sin resumen y
// sin rastro. Ahora se guarda después de cada mensaje y vuelve como estaba.
const LLAVE_CHARLA = 'amber.charla_en_curso.v1';

// El día de Amber corta a las cuatro de la mañana y no a medianoche: quien
// escribe a las tres está terminando el día anterior, no empezando el siguiente.
const CORTE_DIA = 4;
function diaAmber(f) {
  const d = new Date(f);
  d.setHours(d.getHours() - CORTE_DIA);
  return d.toLocaleDateString('sv');
}

let inicioCharla = '', diaCharla = null;
// La sesión se cierra sola después de una hora sin actividad (pirámide del 12/11):
// el cierre es mutuo, pero la decisión está del lado de ella. Si no dice que
// terminó, pasada la hora se guarda sola y la próxima vez Amber retoma el tema.
const HORA_SIN_ACTIVIDAD = 60 * 60 * 1000;
let ultimaActividad = Date.now();
const tocarActividad = () => { ultimaActividad = Date.now(); };
const cargarCharla = () => { try { return JSON.parse(localStorage.getItem(LLAVE_CHARLA)); } catch (e) { return null; } };
const olvidarCharla = () => { try { localStorage.removeItem(LLAVE_CHARLA); } catch (e) {} };
const charlaViva = () => ({ inicio: inicioCharla || new Date().toISOString(), dia: diaCharla,
  apertura: aperturaMostrada, m: mensajes.map(x => ({ r: x.role, c: x.content })) });

function guardarCharlaEnCurso() {
  if (!mensajes.length) return olvidarCharla();
  inicioCharla ||= new Date().toISOString();
  // El día se marca en la home y puede marcarse después de haber empezado a
  // hablar. Una vez que la charla lo tiene, no se lo saca.
  try {
    localStorage.setItem(LLAVE_CHARLA, JSON.stringify({
      inicio: inicioCharla, dia: diaCharla, apertura: aperturaMostrada,
      amb: ambiguos,   // lo dicho de bronca cuenta igual después de recargar
      ult: ultimaActividad,
      m: mensajes.map(x => ({ r: x.role, c: x.content })),
    }));
  } catch (e) {}
}

// Al cerrarse por cambio de día no hay despedida: la persona no cerró nada, y
// una despedida escrita por el sistema la esperaría al otro día como si Amber se
// hubiera ido sola. Se archiva primero y el resumen se pide después: lo que no se
// puede volver a pedir es lo que se dijo.
async function cerrarEnSilencio(ch) {
  guardarEnHistoria({ f: ch.inicio, dia: ch.dia, resumen: '', apertura: ch.apertura, m: ch.m });
  if (ch.m.filter(x => x.r === 'user').length < MINIMO_PARA_RESUMEN) return;
  const d = await pedirCierre(ch.m.map(x => ({ role: x.r, content: x.c })));
  guardarTema(d);
  if (!d?.resumen) return;
  ponerResumen(ch.inicio, d.resumen);
  guardarResumen(d.resumen, diaAmber(ch.inicio));
}

// El tema con el que Amber retoma la próxima vez. Viene del cierre y es un hecho
// ("lo de tu ex"), nunca un sentimiento. Si el cierre devolvió vacío (hubo riesgo,
// o no quedó nada concreto), se borra: mejor arrancar en blanco que retomar algo viejo.
function guardarTema(d) {
  if (!memoria || !d) return;
  memoria.ultimoTema = typeof d.tema === 'string' ? d.tema.trim() : '';
  guardarMemoria();
}

// Al abrir: lo de hoy sigue, lo de ayer se guarda solo.
const charlaGuardada = cargarCharla();
if (charlaGuardada?.m?.length) {
  const ult = charlaGuardada.ult ?? Date.parse(charlaGuardada.inicio);
  if (diaAmber(charlaGuardada.inicio) === diaAmber(Date.now()) && Date.now() - ult < HORA_SIN_ACTIVIDAD) {
    mensajes = charlaGuardada.m.map(x => ({ role: x.r, content: x.c }));
    aperturaMostrada = charlaGuardada.apertura ?? '';
    inicioCharla = charlaGuardada.inicio;
    diaCharla = charlaGuardada.dia ?? null;
    ambiguos = charlaGuardada.amb ?? 0;
    ultimaActividad = ult;
  } else {
    olvidarCharla();
    cerrarEnSilencio(charlaGuardada);
  }
}

function pintarHistoria() {
  const c = $('#historia-cuerpo'); c.innerHTML = '';
  const h = cargarHistoria().reverse();
  if (!h.length) {
    // El subtítulo de arriba ya dice qué es esta pantalla; repetirlo no ayuda.
    // Lo que falta acá es por dónde se empieza.
    const puerta = el('div', 'vacio-puerta');
    puerta.append(el('div', 'vacio', 'Todavía nada. Cada conversación queda acá cuando termina el día o cuando la cerrás.'));
    const b = el('button', 'btn btn-2', 'Ir a hablar');
    b.onclick = () => ir('entrada');
    puerta.append(b);
    c.append(puerta);
    return;
  }
  c.append(resumenDelMes(h));
  const lista = el('div', 'grupo');
  lista.style.gap = '10px';
  h.forEach((ch, i) => {
    const b = el('button', 'charla-f');
    const cuando = el('div', 'charla-cuando');
    cuando.append(el('span', 'charla-c', fechaLarga(ch.f)));
    b.append(cuando, el('div', 'charla-r', ch.r || 'Sin resumen.'));
    b.onclick = () => abrirCharla(h.length - 1 - i);
    lista.append(b);
  });
  c.append(lista);

  const borrar = el('button', 'link', 'Borrar la historia');
  borrar.style.marginTop = '8px';
  let confirmandoHist = null;
  borrar.onclick = () => {
    if (!confirmandoHist) {
      borrar.textContent = 'Tocá de nuevo para borrar la historia';
      confirmandoHist = setTimeout(() => { confirmandoHist = null; borrar.textContent = 'Borrar la historia'; }, 4000);
      return;
    }
    clearTimeout(confirmandoHist);
    try { localStorage.removeItem(LLAVE_HIST); } catch (e) {}
    pintarHistoria();
  };
  c.append(borrar);
}

// ── resumen del mes ───────────────────────────────────────────────────────
// Sin ninguna valoración ni comparación entre meses: un mes "peor" que el anterior es
// el gráfico de ánimo disfrazado. Solo los temas de cada charla, en orden.
function resumenDelMes(h) {
  const hoy = new Date();
  const delMes = h.filter(ch => { const d = new Date(ch.f); return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear() && ch.r; })
                  .reverse();
  const frag = document.createDocumentFragment();
  if (delMes.length < 3) return frag;   // con pocas, repetiría la lista de abajo
  const g = el('div', 'grupo mes');
  g.append(el('div', 'rot', `${capitalizar(MESES[hoy.getMonth()])}, en pocas líneas`));
  const t = el('div', 'tarj mes-tarj');
  const ul = el('ul', 'mes-lista');
  for (const ch of delMes) ul.append(el('li', null, ch.r));
  t.append(ul);
  g.append(t);
  frag.append(g);
  return frag;
}

function fechaLarga(iso) {
  const d = new Date(iso);
  return `${capitalizar(DIAS[d.getDay()])} ${d.getDate()} de ${MESES[d.getMonth()]}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function abrirCharla(i) {
  const ch = cargarHistoria()[i];
  if (!ch) return;
  $('#charla-fecha').textContent = fechaLarga(ch.f);
  $('#charla-dia').textContent = '';
  $('#charla-dia').hidden = true;
  const c = $('#charla-cuerpo'); c.innerHTML = '';
  const hilo2 = el('div');
  hilo2.style.cssText = 'display:flex;flex-direction:column;gap:24px;padding-top:8px';
  for (const m of ch.m) {
    if (!m.c) continue;
    hilo2.append(el('div', m.r === 'user' ? 'yo' : 'am', m.c));
  }
  c.append(hilo2);
  ir('charla');
}

// ── memoria que se arma mientras hablás ─────────────────────────────────────
// Después de cada respuesta, aparte y sin esperarla, se lee el último intercambio y
// se anota lo que valga la pena: gente, lo que hace, lo que le sirve, lo que le duele.
// El mensaje siguiente ya lo lleva. Solo agrega o corrige: borrar lo borra la persona.
const TOPE_LISTA = { datos: 20, objetivos: 6, estrategias: 8, sensibles: 8 };
const mismoTexto = (a, b) => typeof a === 'string' && typeof b === 'string'
  && a.trim().toLowerCase() === b.trim().toLowerCase();

async function aprenderDeLaCharla() {
  if (!memoria?.activa) return;
  const ultimo = [...mensajes].reverse().find(m => m.role === 'user');
  // "mal" o "jaja sí" no traen nada que guardar: no vale una llamada.
  if (!ultimo || ultimo.content.trim().split(/\s+/).length < 3) return;
  try {
    const r = await fetch('/api/memoria', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ memoria: memoriaParaEnviar(), mensajes: mensajes.slice(-4) }),
    });
    if (!r.ok) return;
    const { agregar = {}, reemplazar = [] } = await r.json();
    if (!anotarEnMemoria(agregar, reemplazar)) return;
    guardarMemoria();
    if (document.querySelector('.p.on')?.id === 'mem') pintarMemoria();
  } catch (e) { console.error(e); }
}

function anotarEnMemoria(agregar, reemplazar) {
  if (!memoria) return false;
  let cambio = false;
  for (const { lista, viejo, nuevo } of Array.isArray(reemplazar) ? reemplazar : []) {
    const xs = memoria[lista];
    if (!(lista in TOPE_LISTA) || !Array.isArray(xs) || xs.some(x => mismoTexto(x, nuevo))) continue;
    const i = xs.findIndex(x => mismoTexto(x, viejo));
    if (i > -1) { xs[i] = nuevo.trim(); cambio = true; }
  }
  for (const [lista, tope] of Object.entries(TOPE_LISTA)) {
    const nuevos = Array.isArray(agregar[lista]) ? agregar[lista] : [];
    const xs = (memoria[lista] ??= []);
    for (const t of nuevos) {
      if (typeof t !== 'string' || !t.trim() || xs.some(x => mismoTexto(x, t))) continue;
      xs.push(t.trim()); cambio = true;
    }
    // Más allá del tope, lo más viejo deja lugar a lo nuevo.
    if (xs.length > tope) { memoria[lista] = xs.slice(-tope); cambio = true; }
  }
  return cambio;
}

// Quince: con una charla por día son dos semanas. Al prompt van solo los últimos
// ocho; los demás quedan para la pantalla de memoria.
const TOPE_RESUMENES = 15;
function guardarResumen(t, fecha = hoyISO()) {
  if (!memoria || !t) return;
  memoria.resumenes = [...(memoria.resumenes ?? []), { t, f: fecha }].slice(-TOPE_RESUMENES);
  guardarMemoria();
  pintarEntrada();
}

// La misma llamada sirve para cerrar a propósito y para archivar en silencio: lo
// que cambia es qué se hace con la despedida. Si falla, no se pierde nada de lo
// hablado, que ya está guardado.
async function pedirCierre(msgs) {
  try {
    const r = await fetch('/api/cierre', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      // El género va con la charla: sin él, el resumen le pone uno por su cuenta y
      // ese "estuviste agotado" vuelve después en la home y en cada prompt.
      body: JSON.stringify({ mensajes: msgs, genero: memoria?.genero ?? null }),
    });
    return r.ok ? await r.json() : null;
  } catch (e) { console.error(e); return null; }
}

// Lo que la persona ya vivió se guarda antes que nada; el resumen es lo que
// puede fallar y lo que puede faltar.
function archivarCharla(resumen) {
  if (!mensajes.length) return;
  guardarEnHistoria({
    f: inicioCharla || new Date().toISOString(), dia: diaCharla, resumen,
    apertura: aperturaMostrada, m: mensajes.map(x => ({ r: x.role, c: x.content })),
  });
  olvidarCharla();
}

cerrarBtn.onclick = async () => {
  if (ocupado || cortado || cerrada) return;
  ocupado = true;
  cerrarBtn.disabled = true;
  quitarAperturas();
  quitarOferta();
  quitarFalla();
  let despedida = DESPEDIDA;
  if (mensajesDeLaPersona() >= MINIMO_PARA_RESUMEN) {
    const p = puntos();
    const d = await pedirCierre(mensajes);
    p.remove();
    if (d?.despedida) despedida = d.despedida;
    archivarCharla(d?.resumen ?? '');
    guardarTema(d);
    guardarResumen(d?.resumen);
  } else {
    archivarCharla('');   // dos mensajes sobre nada no dan un resumen que valga una llamada
  }
  turno('assistant', despedida);
  anunciar(despedida);
  terminarCharla();
  ocupado = false;
};

// Cerrar ya no deja la pestaña muerta. El campo sigue vivo: si escribís algo más,
// arranca una conversación nueva y limpia. La que cerraste ya quedó guardada.
function terminarCharla() {
  cerrada = true;
  pararVoz();
  cerrarBtn.hidden = true;
  cerrarBtn.disabled = false;
  txt.placeholder = 'Hasta cuando quieras volver.';
}

// Una hora sin actividad: la charla se guarda sola, sin despedida escrita por el
// sistema, y la pantalla queda lista para empezar otra.
function cerrarPorInactividad() {
  if (!mensajes.length || ocupado || cortado) return;
  const ch = charlaViva();
  olvidarCharla();
  pararVoz();
  cerrada = false;
  mensajes = []; ambiguos = 0;
  inicioCharla = ''; diaCharla = null; aperturaMostrada = '';
  conversacionAbierta = false; aperturasEl = null; accesoMostrado = false;
  ofertaEl = null; fallaEl = null;
  hilo.innerHTML = '';
  cerrarBtn.hidden = true;
  cerrarEnSilencio(ch);
  if (document.querySelector('.p.on')?.id === 'conv') ir('entrada');
}
const revisarInactividad = () => { if (Date.now() - ultimaActividad >= HORA_SIN_ACTIVIDAD) cerrarPorInactividad(); };
setInterval(revisarInactividad, 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarInactividad(); });

function empezarDeNuevo() {
  cerrada = false;
  mensajes = []; ambiguos = 0;
  inicioCharla = ''; diaCharla = null;
  conversacionAbierta = false; aperturasEl = null; accesoMostrado = false;
  ofertaEl = null; fallaEl = null;
  hilo.innerHTML = '';
  olvidarCharla();
  txt.placeholder = 'Escribí lo que quieras';
  abrirConversacion();
}

// La respuesta no llegó (se cayó la conexión, la función se cortó, volvió vacía). Lo
// que se mandó vuelve al campo y se saca de la charla y de lo guardado, para que no
// quede huérfano; abajo queda a mano volver a intentarlo. Antes había que volver a
// escribirlo, y la copia sin respuesta seguía en el historial.
let fallaEl = null;
function quitarFalla() { fallaEl?.remove(); fallaEl = null; }
function noLlego(mio, propio, t) {
  propio.remove();
  if (mensajes.at(-1) === mio) { mensajes.pop(); guardarCharlaEnCurso(); }
  if (!txt.value.trim()) escribir(t);   // si mientras tanto escribió otra cosa, eso queda
  quitarFalla();
  fallaEl = el('div', 'falla');
  fallaEl.append(el('div', 'am', 'Se me cortó algo acá.'));
  const b = el('button', 'apertura', 'Reintentar');
  b.onclick = () => mandar(txt.value.trim() ? undefined : t);
  fallaEl.append(b);
  hilo.appendChild(fallaEl); seguir(true);
  anunciar('Se me cortó algo acá. Tu mensaje volvió al campo: podés reintentar.');
}

async function mandar(textoDirecto) {
  const t = (textoDirecto ?? txt.value).trim();
  if (!t || ocupado || cortado) return;
  if (cerrada) empezarDeNuevo();   // escribir después de cerrar abre una charla nueva
  ocupado = true;
  tocarActividad();
  if (grabando) pararVoz(true);   // se manda lo que está a la vista, no lo que quedó en el aire
  quitarAperturas();
  quitarOferta();
  quitarFalla();
  $('#ver-ayuda').hidden = true;   // mientras se escribe no ocupa el lugar de escribir
  if (textoDirecto == null) { txt.value = ''; txt.style.height = 'auto'; enviar.classList.remove('listo'); }
  ajustarColchon();
  const propio = turno('user', t);
  anclarArriba(propio);
  const mio = { role: 'user', content: t };
  mensajes.push(mio);
  guardarCharlaEnCurso();
  const p = puntos();
  try {
    const r = await fetch('/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      // El saludo con el que abrió la conversación va primero: sin él, Amber contesta
      // a una pregunta que no ve.
      body: JSON.stringify({ mensajes: aperturaMostrada ? [{ role: 'assistant', content: aperturaMostrada }, ...mensajes] : mensajes,
                             memoria: memoriaParaEnviar(), ambiguos }),
    });
    if (!(r.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error ?? `HTTP ${r.status}`);
    }
    await leerStream(r, p);
  } catch (e) {
    console.error(e);
    p.remove();
    noLlego(mio, propio, t);
  }
  ocupado = false;
  // Vuelve la puerta a los teléfonos. Se esconde mientras se manda, no para siempre:
  // adentro de la conversación no hay otra salida a los recursos, y dejarla oculta
  // la hacía depender de que el clasificador acierte, que es justo lo que no queremos.
  $('#ver-ayuda').hidden = false;
  if (!cortado) txt.focus();
}

// ── la interfaz que responde al momento ──────────────────────────────────
// La luz y la densidad cambian según cómo viene la cosa. Acompañamiento hecho de
// producto, no de palabras. Lo marca la señal del clasificador, que ya llega con cada
// respuesta: con "atencion" o "ambiguo" el lugar se aquieta y se hace más espacioso;
// con "alto", más todavía, y queda lo esencial. Vuelve de a poco: hacen falta dos
// respuestas tranquilas seguidas. De noche, la luz baja un poco siempre.
let calmasSeguidas = 0;
function ponerClima(nivel) {
  const conv = $('#conv');
  if (nivel === 'alto') { conv.dataset.clima = 'quieto'; calmasSeguidas = 0; }
  else if (nivel === 'atencion' || nivel === 'ambiguo') { if (conv.dataset.clima !== 'quieto') conv.dataset.clima = 'denso'; calmasSeguidas = 0; }
  else if (conv.dataset.clima && ++calmasSeguidas >= 2) { delete conv.dataset.clima; calmasSeguidas = 0; }
}
function climaInicial() {
  const conv = $('#conv');
  delete conv.dataset.clima; calmasSeguidas = 0;
  conv.dataset.hora = esDeNoche() ? 'noche' : 'dia';
}

async function leerStream(r, p) {
  const lector = r.body.getReader(), dec = new TextDecoder();
  let resto = '', nodo = null, rev = null, riesgo = 'ninguno', ambiguo = false, fin = false, crudo = '', mostrado = '', texto = '';
  try {
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
        if (d.tipo === 'riesgo') { riesgo = d.nivel; ambiguo = !!d.ambiguo; ponerClima(riesgo); }
        else if (d.tipo === 'texto') {
          crudo += d.t;
          const visible = sinMarca(crudo, false);
          if (visible.length > mostrado.length) {
            if (!nodo) { p.remove(); nodo = turno('assistant', ''); rev = revelador(nodo); }
            rev.empujar(visible.slice(mostrado.length)); mostrado = visible;
          }
        } else if (d.tipo === 'fin') fin = d.fin === true;
      }
    }
    p.remove();
    texto = sinMarca(crudo, true);
    if (texto.length > mostrado.length) {
      if (!nodo) { nodo = turno('assistant', ''); rev = revelador(nodo); }
      rev.empujar(texto.slice(mostrado.length));
    }
    if (rev) await rev.terminar();
    // Llegó el final sin una palabra: la función se cortó del lado del servidor. Es lo
    // mismo que si no hubiera llegado nada, y mandar() devuelve el mensaje al campo.
    if (!nodo) throw new Error('respuesta vacía');
  } catch (e) {
    // Lo que llegó a medias no sirve suelto: se saca, y la persona reintenta.
    nodo?.remove();
    throw e;
  } finally {
    // El revelador es un reloj de 70 ms. Si el stream se cortaba antes de terminar,
    // nadie lo apagaba y quedaba corriendo para siempre, uno más por cada corte.
    rev?.terminar();
  }
  // La frase de bronca se cuenta recién cuando la respuesta llegó entera: si se corta y
  // se reintenta, el servidor la vuelve a ver y no hay que contarla dos veces.
  if (ambiguo) ambiguos++;
  tocarActividad();
  mensajes.push({ role: 'assistant', content: texto });
  guardarCharlaEnCurso();
  aprenderDeLaCharla();
  anunciar(texto);
  accesoMemoria();
  verCerrar();
  if (riesgo === 'alto') recursos();
  if (fin) cortar();
  else if (crudo.includes(MARCA_RESPIRAR)) ofrecerRespirar();
}

// ── memoria ───────────────────────────────────────────────────────────────
const LAPIZ = '<svg width="18" height="18" viewBox="0 0 24 24" stroke="#9B9189"><path d="M4 20h4l10-10-4-4L4 16v4z"/></svg>';
const CRUZ  = '<svg width="18" height="18" viewBox="0 0 24 24" stroke="#6E675E"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>';

// Los rótulos de cada grupo, en un solo lugar: son el título que se ve y el nombre que
// el lector de pantalla le da a cada entrada y a sus botones.
const ROTULOS = {
  apodo: 'Cómo te digo', datos: 'Personas y situaciones', objetivos: 'Los temas de estos días',
  estrategias: 'Lo que te ayuda', sensibles: 'Temas sensibles', resumenes: 'Lo que me contaste',
};

function entrada(texto, alBorrar, alEditar, nota, rotulo) {
  const f = el('div', 'ent');
  const izq = el('div'); izq.style.cssText = 'display:flex;flex-direction:column;gap:6px;flex-grow:1';
  const s = el('span', null, texto);
  s.contentEditable = 'plaintext-only';
  s.setAttribute('role', 'textbox');
  s.setAttribute('aria-label', rotulo ?? 'Texto');
  s.addEventListener('blur', () => alEditar(s.textContent.trim()));
  izq.append(s);
  if (nota) izq.append(el('div', 'nota', nota));
  const acc = el('div', 'acc');
  // El lápiz y la cruz son solo un dibujo: sin nombre se anuncian como "botón".
  const que = texto ? `: ${texto}` : '';
  const bl = el('button'); bl.innerHTML = LAPIZ; bl.setAttribute('aria-label', `Editar${que}`); bl.onclick = () => s.focus();
  const bc = el('button'); bc.innerHTML = CRUZ;  bc.setAttribute('aria-label', `Borrar${que}`); bc.onclick = alBorrar;
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

const VACIO = {
  datos:       'Todavía nada. Acá va quedando lo que me contás mientras hablamos: gente, lo que hacés, lo que está pasando.',
  objetivos:   'Todavía nada. Acá van apareciendo los temas de estos días.',
  estrategias: 'Todavía nada. Acá guardo lo que te haya servido alguna vez.',
  sensibles:   'Todavía nada. Acá van los temas que no traigo yo.',
  resumenes:   'Todavía nada. Cada conversación deja una línea acá cuando termina el día o cuando la cerrás.',
};

function pintarMemoria() {
  const c = $('#mem-cuerpo'); c.innerHTML = '';
  const guardar = () => { guardarMemoria(); pintarMemoria(); pintarEntrada(); };
  const lista = (clave) => (memoria[clave] ??= []).map((v, i) =>
    entrada(v,
      () => { memoria[clave].splice(i, 1); guardar(); },
      (nuevo) => { if (nuevo && nuevo !== v) { memoria[clave][i] = nuevo; guardar(); } },
      clave === 'sensibles' ? 'No lo saco yo. Lo traés vos cuando querés.' : null,
      ROTULOS[clave]));

  // Siempre visible, incluso vacío: si no, borrar el apodo lo dejaba sin forma de volver a ponerlo.
  c.append(grupo(ROTULOS.apodo, [
    entrada(memoria.apodo ?? '', () => { memoria.apodo = ''; guardar(); },
      n => { if (n !== memoria.apodo) { memoria.apodo = n; guardar(); } }, null, ROTULOS.apodo)]));
  const GENEROS = [['m', 'En masculino'], ['f', 'En femenino'], ['neutro', 'Prefiero no decirlo']];
  const og = el('div', 'opciones');
  og.style.padding = '12px';
  og.setAttribute('role', 'radiogroup');
  for (const [k, t] of GENEROS) {
    const b = el('button', 'opcion');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String((memoria.genero ?? null) === k));
    b.append(el('span', 'opcion-t', t));
    b.onclick = () => { memoria.genero = k; vibrar(10); guardar(); };
    og.append(b);
  }
  c.append(grupo('Cómo te nombro', [og]));

  // Los grupos vacíos se muestran igual, con una línea que dice qué va adentro.
  // Esconderlos dejaba la pantalla casi en blanco los primeros días y no se
  // entendía qué es lo que Amber llega a tener presente cuando hablan.
  const conVacio = (clave, hijos) => (hijos.length ? hijos : [el('div', 'vacio', VACIO[clave])]);

  c.append(grupo(ROTULOS.datos,       conVacio('datos', lista('datos'))));
  c.append(grupo(ROTULOS.objetivos,   conVacio('objetivos', lista('objetivos'))));
  c.append(grupo(ROTULOS.estrategias, conVacio('estrategias', lista('estrategias'))));
  c.append(grupo(ROTULOS.sensibles,   conVacio('sensibles', lista('sensibles'))));
  c.append(grupo(ROTULOS.resumenes, conVacio('resumenes', (memoria.resumenes ?? []).map((v, i) =>
    entrada(textoResumen(v),
      () => { memoria.resumenes.splice(i, 1); guardar(); },
      (nuevo) => {
        if (!nuevo || nuevo === textoResumen(v)) return;
        // Si lo editás a mano queda como lo escribiste, con la fecha que ya tenía.
        memoria.resumenes[i] = typeof v === 'string' ? nuevo : { ...v, t: nuevo };
        guardar();
      }, null, ROTULOS.resumenes)).reverse())));

}

// Cerrar sesión borra todo lo guardado y vuelve al principio. Recarga en vez de
// resetear diez variables a mano: es la única forma de garantizar que no queda
// nada del usuario anterior dando vueltas en memoria.
const ROTULO_SALIR = 'Borrar todo';
let confirmandoSalir = null;
$('#cerrar-sesion').onclick = () => {
  const b = $('#cerrar-sesion');
  if (!confirmandoSalir) {
    b.textContent = 'Tocá de nuevo: se borra todo y no se puede deshacer';
    confirmandoSalir = setTimeout(() => { confirmandoSalir = null; b.textContent = ROTULO_SALIR; }, 4000);
    return;
  }
  clearTimeout(confirmandoSalir); confirmandoSalir = null;
  try { for (const k of [LLAVE, 'amber.memoria.v1', LLAVE_HIST, LLAVE_PREFS, LLAVE_CHARLA]) localStorage.removeItem(k); } catch (e) {}
  location.href = location.pathname;
};

// Borrar todo pide confirmación en el mismo botón: sin diálogos, sin sustos.
const ROTULO_BORRAR = 'Borrar memoria';
let confirmando = null;
$('#borrar-mem').onclick = () => {
  const b = $('#borrar-mem');
  if (!confirmando) {
    b.textContent = 'Tocá de nuevo para borrar la memoria';
    confirmando = setTimeout(() => { confirmando = null; b.textContent = ROTULO_BORRAR; }, 4000);
    return;
  }
  clearTimeout(confirmando); confirmando = null;
  memoria = { activa: true, apodo: '', genero: memoria?.genero ?? null, ultimoTema: '', datos: [], objetivos: [], estrategias: [], sensibles: [], resumenes: [] };
  guardarMemoria(); pintarMemoria(); pintarEntrada();
  b.textContent = ROTULO_BORRAR;
};

// ── preferencias ──────────────────────────────────────────────────────────
function filaPref(titulo, detalle, encendida, alTocar, disponible = true) {
  const f = el('div', 'pref');
  const t = el('div', 'pref-txt');
  t.append(el('div', 'pref-t', titulo), el('div', 'pref-s', detalle));
  const ll = el('button', 'llave');
  ll.setAttribute('role', 'switch');
  ll.setAttribute('aria-checked', String(!!encendida));
  ll.setAttribute('aria-label', titulo);
  ll.disabled = !disponible;
  ll.onclick = alTocar;
  f.append(t, ll);
  return f;
}

function pintarPreferencias() {
  const c = $('#prefs-cuerpo'); c.innerHTML = '';
  const caja = el('div');
  caja.style.paddingTop = '8px';

  caja.append(filaPref('Modo oscuro', 'El mismo violeta, sobre negro.', !!prefs.oscuro, () => {
    prefs.oscuro = !prefs.oscuro; guardarPrefs(); vibrar(10);
    if (prefs.oscuro) document.documentElement.dataset.tema = 'oscuro';
    else delete document.documentElement.dataset.tema;
    pintarPreferencias();
  }));

  caja.append(filaPref('Vibración',
    HAY_VIBRACION ? 'Un toque corto cuando algo queda registrado.'
                  : 'Este navegador no la tiene. En Android sí funciona.',
    !!prefs.vibrar && HAY_VIBRACION,
    () => { prefs.vibrar = !prefs.vibrar; guardarPrefs(); vibrar(18); pintarPreferencias(); },
    HAY_VIBRACION));

  caja.append(filaPref('Bloqueo con PIN',
    HAY_CRIPTO ? 'Cuatro números para abrir la app. Si alguien agarra el teléfono, no entra.'
               : 'Este navegador no lo permite.',
    !!prefs.pin,
    () => pedirPin(prefs.pin ? 'quitar' : 'crear'),
    HAY_CRIPTO));

  c.append(caja);

  const datos = el('div', 'grupo');
  datos.style.marginTop = '28px';
  datos.append(el('div', 'rot', 'Lo tuyo'));
  datos.append(el('div', 'vacio', 'Un archivo con lo que Amber recuerda y las conversaciones guardadas. Queda en tu teléfono; después hacés con él lo que quieras.'));
  const b = el('button', 'btn btn-2', 'Exportar');
  b.style.marginTop = '12px';
  b.onclick = exportar;
  datos.append(b);
  datos.append(el('div', 'vacio', 'Para borrar todo: "Borrar todo", al final del menú.'));
  c.append(datos);
}

// ── exportar ──────────────────────────────────────────────────────────────
// Borrar y exportar son lo que hace creíble la promesa de privacidad: lo tuyo es tuyo
// y te lo podés llevar. Un .txt legible, no un formato que hay que saber abrir.
function textoExportado() {
  const l = [`Amber — lo tuyo, exportado el ${fechaLarga(new Date().toISOString())}`, ''];
  if (memoria) {
    l.push('LO QUE RECUERDO', '');
    if (memoria.apodo) l.push(`${ROTULOS.apodo}: ${memoria.apodo}`);
    for (const k of ['datos', 'objetivos', 'estrategias', 'sensibles']) {
      if (memoria[k]?.length) { l.push('', `${ROTULOS[k]}:`); for (const x of memoria[k]) l.push(`- ${x}`); }
    }
    if (memoria.resumenes?.length) { l.push('', `${ROTULOS.resumenes}:`); for (const r of memoria.resumenes) l.push(`- ${textoResumen(r)}`); }
    l.push('');
  }
  const h = cargarHistoria();
  const todas = mensajes.length ? [...h, { f: inicioCharla || new Date().toISOString(), r: '', m: mensajes.map(x => ({ r: x.role, c: x.content })) }] : h;
  if (todas.length) {
    l.push('CONVERSACIONES');
    for (const ch of todas) {
      l.push('', `— ${fechaLarga(ch.f)}`);
      if (ch.r) l.push(`(${ch.r})`);
      for (const m of ch.m ?? []) if (m.c) l.push(`${m.r === 'user' ? 'Vos' : 'Amber'}: ${m.c}`);
    }
  }
  return l.join('\n');
}
function exportar() {
  const blob = new Blob([textoExportado()], { type: 'text/plain;charset=utf-8' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = `amber-${hoyISO()}.txt`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  vibrar(12);
  anunciar('Listo. El archivo quedó en tu teléfono.');
}

// ── bloqueo con PIN ───────────────────────────────────────────────────────
// Opcional y apagado por defecto. La amenaza real a la privacidad es alguien que
// agarra el teléfono. El PIN no se guarda: se guarda su huella. La ayuda nunca se
// bloquea: la pantalla del PIN tiene la salida a una persona.
const HAY_CRIPTO = !!window.crypto?.subtle;
const SAL_PIN = 'amber.pin.v1';
async function huella(pin) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SAL_PIN + pin));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const pinEl = $('#pin'), pinNota = $('#pin-nota');
document.querySelector('.pin-puntos').onclick = () => pinEl.focus();
let modoPin = null, pinPrimero = '', destinoPin = 'entrada', confirmandoOlvido = null;
const TEXTOS_PIN = {
  abrir:     ['Tu PIN', ''],
  crear:     ['Elegí un PIN', 'Cuatro números. Si te lo olvidás, la única forma de entrar es borrar todo.'],
  confirmar: ['Repetilo', 'Para estar seguros de que es ese.'],
  quitar:    ['Tu PIN actual', 'Para sacar el bloqueo.'],
};
function pedirPin(modo, destino) {
  modoPin = modo;
  if (destino) destinoPin = destino;
  $('#pin-titulo').textContent = TEXTOS_PIN[modo][0];
  $('#pin-sub').textContent = TEXTOS_PIN[modo][1];
  $('#pin-cancelar').hidden = modo === 'abrir';
  $('#pin-olvide').hidden = modo !== 'abrir';
  $('#pin-olvide').textContent = 'Me olvidé el PIN';
  pinEl.value = ''; pintarPuntos(); pinNota.textContent = '';
  ir('bloqueo');
  setTimeout(() => pinEl.focus(), 250);
}
function pintarPuntos() {
  document.querySelectorAll('.pin-puntos i').forEach((p, i) => p.classList.toggle('lleno', i < pinEl.value.length));
}
pinEl.addEventListener('input', async () => {
  pinEl.value = pinEl.value.replace(/\D/g, '').slice(0, 4);
  pintarPuntos();
  if (pinEl.value.length < 4) return;
  const h = await huella(pinEl.value);
  pinEl.value = '';
  if (modoPin === 'crear') { pinPrimero = h; pedirPin('confirmar'); return; }
  if (modoPin === 'confirmar') {
    if (h !== pinPrimero) { pedirPin('crear'); pinNota.textContent = 'No coinciden. Elegilo de nuevo.'; return; }
    prefs.pin = h; guardarPrefs(); vibrar(12); ir('prefs'); return;
  }
  if (h !== prefs.pin) { pintarPuntos(); pinNota.textContent = 'No es ese.'; vibrar(30); return; }
  if (modoPin === 'quitar') { delete prefs.pin; guardarPrefs(); ir('prefs'); return; }
  bloqueado = false;
  if (memoria) pintarEntrada();
  ir(destinoPin);
});
$('#pin-cancelar').onclick = () => ir('prefs');
$('#pin-olvide').onclick = () => {
  const b = $('#pin-olvide');
  if (!confirmandoOlvido) {
    b.textContent = 'Tocá de nuevo para borrar todo y empezar de cero';
    confirmandoOlvido = setTimeout(() => { confirmandoOlvido = null; b.textContent = 'Me olvidé el PIN'; }, 4000);
    return;
  }
  try { for (const k of [LLAVE, 'amber.memoria.v1', LLAVE_HIST, LLAVE_PREFS, LLAVE_CHARLA]) localStorage.removeItem(k); } catch (e) {}
  location.href = location.pathname;
};
// Si la app estuvo más de un minuto en segundo plano, al volver pide el PIN de nuevo.
let bloqueado = false, ocultaDesde = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { ocultaDesde = Date.now(); return; }
  const actual = document.querySelector('.p.on')?.id;
  if (!prefs.pin || bloqueado || !ocultaDesde || Date.now() - ocultaDesde < 60 * 1000) return;
  if (['bloqueo', 'ayuda'].includes(actual)) return;
  bloqueado = true;
  pedirPin('abrir', actual === 'calma' ? 'entrada' : actual);
});

// ── sobre amber ───────────────────────────────────────────────────────────
const ABOUT = [
  ['Qué es', 'Amber es un lugar para ordenar lo que te pasa sin hacerlo solo. Escribís lo que te pasa, Amber te lo devuelve ordenado, y la próxima vez retoma donde quedaron. Funciona con inteligencia artificial.'],
  ['Qué no es', '<strong>No es terapia y no reemplaza a un profesional.</strong> No diagnostica, no receta y no es un servicio de emergencia. Si estás en riesgo, los teléfonos están en el menú, en "Si necesitás ayuda ahora".'],
  ['Quién la hace', 'Dos estudiantes argentinos. Está en desarrollo: lo que ves es un prototipo.'],
  ['Qué pasa con lo que contás', '<strong>No hay cuenta, no hay servidor y nadie puede leer tus conversaciones.</strong> Lo que Amber recuerda y las conversaciones de otros días viven en este teléfono, en el navegador, y de acá no salen. Lo que escribís viaja a la API de Anthropic para que Amber pueda contestarte; según sus condiciones, lo que llega por esa vía no se usa para entrenar modelos. El resumen para tu psicólogo también se arma ahí, y lo mandás vos. Si borrás los datos del navegador, no queda nada en ningún lado: tampoco nosotros podemos recuperarlo.'],
  ['Por qué se respira así', 'Hay una sola respiración, en dos versiones. La corta son nueve ciclos de cuatro segundos adentro y seis afuera: seis respiraciones por minuto, noventa segundos. Ese ritmo no es arbitrario: alrededor de esa frecuencia —entre 4,5 y 7 por minuto, según la persona— es donde la variabilidad de la frecuencia cardíaca alcanza su amplitud máxima, lo que se conoce como frecuencia de resonancia. Y de todo lo que se puede cambiar en una respiración, alargar la exhalación más que la inhalación es lo que más se asoció a mejoras en el ánimo en un ensayo aleatorizado de Stanford, publicado en <em>Cell Reports Medicine</em> en 2023 (Balban y otros). Ese trabajo probó una técnica distinta a la nuestra, así que lo que tomamos de ahí es el principio, no el protocolo. La <strong>prolongada</strong> sale del mismo principio: baja a cinco por minuto, con la exhalación al doble de la inhalación, durante cinco minutos. Es la que aparece de noche. Tampoco te pedimos que respires hondo ni que retengas el aire arriba: en alguien con ansiedad, eso puede empujar a sobrerrespirar.'],
  ['Cómo borrarlo', 'Desde "Lo que recuerdo" borrás lo que Amber sabe de vos. Desde "Historia" borrás las conversaciones. "Borrar todo", al final del menú, borra todo junto y no se puede deshacer.'],
  ['Edad', 'Amber es para mayores de 18.'],
];

function pintarAbout() {
  const c = $('#about-cuerpo'); c.innerHTML = '';
  const t = el('div', 'texto-largo');
  t.style.paddingTop = '8px';
  for (const [titulo, cuerpo] of ABOUT) {
    const b = el('div');
    b.append(el('h3', null, titulo));
    const p = el('p'); p.innerHTML = cuerpo; b.append(p);
    t.append(b);
  }
  const pie = el('p');
  pie.style.cssText = 'font-size:13px;color:var(--gris2);padding-top:4px';
  pie.textContent = 'Datos de salud son datos sensibles según la Ley 25.326. Los términos definitivos están en preparación.';
  t.append(pie);
  c.append(t);
}

// ── pensamientos ──────────────────────────────────────────────────────────
// Solo lectura, sin interacción entre usuarios y solo de matriculados (pirámide del
// 12/11). Se llaman pensamientos, no consejos: si un texto dice "hacé", "intentá" o
// "probá", no sale. Hasta que se sumen los profesionales, lo que hay es de ejemplo y
// lo dice: no se inventa un nombre ni una matrícula.
// En pantalla se llama Foro mientras se elige el nombre definitivo. Cada posteo
// tiene autor con foto, como en una red social, pero no hay nada para tocar:
// ni responder, ni me gusta, ni seguir. Más adelante, tocar el autor abre su perfil.
// Quienes escriben: se arranca con cinco o seis matriculados fijos (pirámide del
// 12/11). Hasta que estén, hay tres de ejemplo y los lugares que faltan dicen
// "Pronto". Cada uno tiene su tono de violeta, así se reconocen en la lista.
const AUTORES = [
  { tono: ['#9B80EE', '#5733BC'] },
  { tono: ['#B49CF5', '#7C5CE3'] },
  { tono: ['#7E62D8', '#3B2A86'] },
];
const LUGARES_AUTORES = 6;
const PENSAMIENTOS = [
  { autor: 0, tema: 'Separaciones', cuando: 'hace 2 h', t: 'Muchas veces lo que más pesa de una separación no es la persona que se fue, sino la versión de uno que existía con ella. Eso también se extraña, y tiene sentido que se extrañe.' },
  { autor: 1, tema: 'Amistades', cuando: 'ayer', t: 'Contarle siempre lo mismo a la misma amiga no es ser una carga. A veces es la forma que encontramos de ir entendiendo algo de a poco, en voz alta.' },
  { autor: 2, tema: 'Los tiempos', cuando: 'hace 3 días', t: 'Que algo te siga afectando después de un tiempo no quiere decir que estés haciendo algo mal. Los tiempos de cada uno no se eligen.' },
  { autor: 0, tema: 'Lo que no se dice', cuando: 'hace 5 días', t: 'Hay cosas que no contamos porque todavía no tienen palabras. No es que no queramos decirlas: es que recién se están armando.' },
];
const SVG = 'http://www.w3.org/2000/svg';
function svgDe(viewBox, paths, clase) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', viewBox); s.setAttribute('aria-hidden', 'true');
  if (clase) s.setAttribute('class', clase);
  for (const d of paths) { const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', d); s.append(p); }
  return s;
}
// La foto: hasta que haya profesionales reales, una silueta sobre su tono de violeta.
function fotoDe(autor, clase) {
  const f = el('div', clase);
  f.style.background = `linear-gradient(150deg,${autor.tono[0]} 0%,${autor.tono[1]} 100%)`;
  f.append(svgDe('0 0 40 40', ['M20 21a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M7 37c1.6-7 6.8-11 13-11s11.4 4 13 11z']));
  return f;
}
function selloMatriculado() {
  const s = svgDe('0 0 24 24', ['M12 2.5l2.4 1.8 3-.1.9 2.8 2.4 1.8-.9 2.9.9 2.9-2.4 1.8-.9 2.8-3-.1L12 21.5l-2.4-1.8-3 .1-.9-2.8-2.4-1.8.9-2.9-.9-2.9 2.4-1.8.9-2.8 3 .1z', 'M8.3 12.2l2.5 2.5 4.9-5'], 'posteo-sello');
  s.setAttribute('aria-label', 'Matriculado'); s.removeAttribute('aria-hidden'); s.setAttribute('role', 'img');
  return s;
}
function pintarPensamientos() {
  const c = $('#pensamientos-cuerpo'); c.innerHTML = '';

  // Arriba, quiénes escriben: una fila de fotos, como las historias de una red
  // social. Todavía no se tocan; cuando haya perfiles, cada foto abre el suyo.
  const quienes = el('section', 'foro-autores');
  quienes.setAttribute('aria-label', 'Quiénes escriben');
  quienes.append(el('div', 'foro-rotulo', 'Quiénes escriben'));
  const fila = el('div', 'foro-autores-fila');
  for (let i = 0; i < LUGARES_AUTORES; i++) {
    const a = AUTORES[i];
    const lugar = el('div', 'autor' + (a ? '' : ' autor-pronto'));
    if (a) { const anillo = el('div', 'autor-anillo'); anillo.append(fotoDe(a, 'autor-foto')); lugar.append(anillo, el('span', 'autor-n', 'Ejemplo ' + (i + 1))); }
    else { lugar.append(el('div', 'autor-anillo'), el('span', 'autor-n', 'Pronto')); }
    fila.append(lugar);
  }
  quienes.append(fila);
  c.append(quienes);

  c.append(el('div', 'foro-aviso', 'Por ahora son textos de ejemplo, hasta que se sumen los primeros profesionales.'));

  const lista = el('div', 'foro');
  for (const p of PENSAMIENTOS) {
    const autor = AUTORES[p.autor];
    const a = el('article', 'posteo');
    const cab = el('div', 'posteo-cab');
    const quien = el('div', 'posteo-quien');
    const linea1 = el('div', 'posteo-l1');
    linea1.append(el('span', 'posteo-nombre', 'Nombre Apellido'), selloMatriculado());
    quien.append(linea1, el('div', 'posteo-mat', 'Lic. en Psicología · M.N. 00000'));
    cab.append(fotoDe(autor, 'posteo-foto'), quien, el('span', 'posteo-cuando', p.cuando));
    // El texto es lo principal: grande, en la letra de Amber, como una reflexión.
    a.append(cab, el('p', 'posteo-t', p.t), el('span', 'posteo-tema', p.tema));
    lista.append(a);
  }
  c.append(lista);
  c.append(el('div', 'foro-fin', 'Eso es todo por ahora.'));
}

// ── feedback ──────────────────────────────────────────────────────────────
// Lo único de la app que viaja a un servidor nuestro, y por eso la pantalla lo dice
// antes de escribir: es para fallas o ideas, no para contar lo que te pasa.
let tipoFb = 'general';
const fbTxt = $('#fb-txt'), fbMandar = $('#fb-mandar'), fbNota = $('#fb-nota');
document.querySelectorAll('#feedback .opcion').forEach(b => {
  b.onclick = () => {
    tipoFb = b.dataset.fb;
    document.querySelectorAll('#feedback .opcion').forEach(o => o.setAttribute('aria-checked', String(o === b)));
    vibrar(10);
  };
});
fbTxt.addEventListener('input', () => { fbMandar.disabled = !fbTxt.value.trim(); fbNota.textContent = ''; });
fbMandar.onclick = async () => {
  fbMandar.disabled = true; fbMandar.textContent = 'Mandando…';
  try {
    const r = await fetch('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: tipoFb, texto: fbTxt.value.trim() }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    fbTxt.value = '';
    fbNota.textContent = 'Llegó. Gracias.';
  } catch (e) {
    console.error(e);
    fbNota.textContent = 'No se pudo mandar. Probá de nuevo en un rato.';
    fbMandar.disabled = false;
  }
  fbMandar.textContent = 'Mandar';
};

// ── actividades ───────────────────────────────────────────────────────────
// Opcionales, para escribir, sin técnicas con nombre clínico (art. 2 de la Ley
// 23.277) y sin decirle a nadie qué hacer. Ninguna viaja a ningún lado ni se guarda:
// al soltarla se borra, y si salís sin soltarla, también.
const ACTIVIDADES = [
  { id: 'carta', titulo: 'Una carta que no vas a mandar',
    resumen: 'A una persona, a vos de antes, a algo que pasó.',
    intro: 'A quien sea: una persona, vos de antes, algo que pasó. No se manda y no la lee nadie.',
    campos: [{ placeholder: 'Empezá por donde te salga.' }], soltar: 'Soltarla' },
  { id: 'vaciar', titulo: 'Vaciar la cabeza',
    resumen: 'Todo lo que da vueltas, un renglón por cosa.',
    intro: 'Todo lo que está dando vueltas, un renglón por cosa, sin orden y sin explicar nada. Sirve sobre todo de noche.',
    campos: [{ placeholder: 'Lo primero que aparezca.' }], soltar: 'Soltarlo' },
  { id: 'sesupone', titulo: 'Lo que sé y lo que estoy suponiendo',
    resumen: 'Separar lo que pasó de lo que te imaginás.',
    intro: 'Algo que te esté pasando, partido en dos. Por ejemplo: "sé que no me contestó" y "supongo que está enojada".',
    campos: [{ rotulo: 'Lo que sé', placeholder: 'Lo que pasó, tal cual.' },
             { rotulo: 'Lo que estoy suponiendo', placeholder: 'Lo que te imaginás o temés.' }], soltar: 'Soltarlo' },
  { id: 'depende', titulo: 'Lo que depende de mí',
    resumen: 'Una preocupación, partida en dos.',
    intro: 'Algo que te preocupe, partido en lo que está en tus manos y lo que no.',
    campos: [{ rotulo: 'Depende de mí', placeholder: 'Lo que está en tus manos.' },
             { rotulo: 'No depende de mí', placeholder: 'Lo que no.' }], soltar: 'Soltarlo' },
];
function pintarActividades() {
  const c = $('#actividades-cuerpo'); c.innerHTML = '';
  const lista = el('nav', 'lista');
  lista.style.paddingTop = '16px';
  lista.setAttribute('aria-label', 'Actividades');
  for (const a of ACTIVIDADES) {
    const b = el('button', 'fila-menu');
    b.append(el('span', 'fila-t', a.titulo), el('span', 'fila-s', a.resumen));
    b.onclick = () => abrirActividad(a);
    lista.append(b);
  }
  c.append(lista);
}
const actSoltar = $('#act-soltar'), actNota = $('#act-nota'), actCampos = $('#act-campos');
function abrirActividad(a) {
  $('#act-titulo').textContent = a.titulo;
  $('#act-intro').textContent = a.intro;
  actSoltar.textContent = a.soltar; actSoltar.disabled = true; actNota.textContent = '';
  actCampos.innerHTML = '';
  actCampos.classList.toggle('dos', a.campos.length > 1);
  for (const f of a.campos) {
    const caja = el('label', 'act-campo');
    if (f.rotulo) caja.append(el('span', 'act-rotulo', f.rotulo));
    const t = el('textarea', 'carta-txt');
    t.placeholder = f.placeholder;
    t.setAttribute('aria-label', f.rotulo ?? a.titulo);
    t.addEventListener('input', () => {
      actSoltar.disabled = ![...actCampos.querySelectorAll('textarea')].some(x => x.value.trim());
      actNota.textContent = '';
    });
    caja.append(t);
    actCampos.append(caja);
  }
  ir('actividad');
  setTimeout(() => actCampos.querySelector('textarea')?.focus(), 300);
}
actSoltar.onclick = () => {
  const ts = [...actCampos.querySelectorAll('textarea')];
  ts.forEach(t => t.classList.add('soltando'));
  vibrar(12);
  setTimeout(() => {
    ts.forEach(t => { t.value = ''; t.classList.remove('soltando'); });
    actSoltar.disabled = true;
    actNota.textContent = 'Listo. No quedó guardado en ningún lado.';
  }, 900);
};
// Salir de una actividad sin soltarla también la borra: nada queda escrito.
document.addEventListener('click', e => {
  if (e.target.closest('#actividad [data-ir]')) actCampos.querySelectorAll('textarea').forEach(t => { t.value = ''; });
}, true);

// ── resumen para el psicólogo ──────────────────────────────────────────────
// Lo arma Amber con todas las charlas guardadas, cuando Lola lo pide. Ella lo lee,
// lo edita y lo manda: Amber no tiene canal con nadie. Lo que se arma no se guarda.
const TOPE_RESUMEN = { charlas: 30, porMensaje: 1200, total: 60000 };
function charlasParaResumir() {
  const todas = [...cargarHistoria()];
  if (mensajes.length) todas.push({ f: inicioCharla || new Date().toISOString(), m: mensajes.map(x => ({ r: x.role, c: x.content })) });
  let total = 0;
  const out = [];
  for (const ch of todas.slice(-TOPE_RESUMEN.charlas).reverse()) {
    const m = (ch.m ?? []).filter(x => x.c).map(x => ({ r: x.r, c: String(x.c).slice(0, TOPE_RESUMEN.porMensaje) }));
    const largo = m.reduce((n, x) => n + x.c.length, 0);
    if (total + largo > TOPE_RESUMEN.total) break;
    total += largo;
    out.unshift({ f: ch.f, m });
  }
  return out;
}
function pintarResumen(borrador) {
  const c = $('#resumen-cuerpo'); c.innerHTML = '';
  const charlas = charlasParaResumir();
  if (!charlas.length) {
    c.append(el('div', 'vacio', 'Todavía no hay conversaciones para resumir. Cuando hablen, acá se puede armar.'));
    return;
  }
  if (borrador == null) {
    c.append(el('div', 'vacio', `Se arma con ${charlas.length === 1 ? 'la conversación guardada' : `las ${charlas.length} conversaciones guardadas`}. Para armarlo, viajan a la API de Anthropic, igual que cuando hablás.`));
    const b = el('button', 'btn btn-1', 'Armar el resumen');
    b.style.marginTop = '20px';
    b.onclick = async () => {
      b.disabled = true; b.textContent = 'Armándolo…';
      try {
        const r = await fetch('/api/resumen', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ charlas, genero: memoria?.genero ?? null }),
        });
        const d = r.ok ? await r.json() : null;
        if (!d?.resumen) throw new Error('vacío');
        pintarResumen(d.resumen);
      } catch (e) {
        console.error(e);
        b.disabled = false; b.textContent = 'Armar el resumen';
        anunciar('No se pudo armar. Probá de nuevo en un rato.');
        b.insertAdjacentElement('afterend', el('div', 'vacio', 'No se pudo armar. Probá de nuevo en un rato.'));
      }
    };
    c.append(b);
    return;
  }
  const area = el('textarea', 'resumen-txt');
  area.value = borrador;
  area.setAttribute('aria-label', 'Resumen para tu psicólogo, editable');
  c.append(el('div', 'vacio', 'Es un borrador: cambiá lo que quieras antes de mandarlo.'), area);
  const acciones = el('div', 'resumen-acciones');
  const copiar = el('button', 'btn btn-1', 'Copiar');
  copiar.onclick = async () => {
    try { await navigator.clipboard.writeText(area.value); copiar.textContent = 'Copiado'; }
    catch (e) { area.select(); copiar.textContent = 'Seleccionado: copialo'; }
    setTimeout(() => { copiar.textContent = 'Copiar'; }, 2500);
  };
  acciones.append(copiar);
  if (navigator.share) {
    const compartir = el('button', 'btn btn-2', 'Mandarlo');
    compartir.onclick = () => navigator.share({ text: area.value }).catch(() => {});
    acciones.append(compartir);
  }
  const otra = el('button', 'link', 'Volver a armarlo');
  otra.onclick = () => pintarResumen();
  c.append(acciones, otra);
}

// ── onboarding ────────────────────────────────────────────────────────────
const obNombre = $('#ob-nombre'), obSeguir = $('#ob-seguir');
obNombre.addEventListener('input', () => {
  const v = obNombre.value.trim();
  obSeguir.disabled = v.length < 2;
  $('#ob-eco').textContent = v ? `Así te voy a llamar: ${capitalizar(v)}.` : 'Así te voy a llamar.';
});
obSeguir.onclick = () => {
  apodoOnboarding = obNombre.value.trim();
  ir('ob2a');
};

// En castellano no hay forma de escribir "cansado" sin elegir. Sin preguntarlo,
// Amber esquiva el género en cada frase, y en las respuestas de crisis se le
// escapaba igual ("no podés sola con esto"). Se pregunta una vez.
let generoOnboarding = null;
const obGenSeguir = $('#ob-gen-seguir');
document.querySelectorAll('#ob2a .opcion').forEach(b => {
  b.onclick = () => {
    generoOnboarding = b.dataset.genero;
    document.querySelectorAll('#ob2a .opcion').forEach(o =>
      o.setAttribute('aria-checked', String(o === b)));
    obGenSeguir.disabled = false;
    vibrar(10);
  };
});
obGenSeguir.onclick = () => ir('ob3');

const obCheck = $('#ob-check'), obEntrar = $('#ob-entrar');
obCheck.addEventListener('change', () => { obEntrar.disabled = !obCheck.checked; });
obEntrar.onclick = () => {
  memoria = { activa: true, apodo: apodoOnboarding, genero: generoOnboarding, ultimoTema: '',
              datos: [], objetivos: [], estrategias: [], sensibles: [], resumenes: [] };
  guardarMemoria();
  pintarEntrada();
  ir('entrada');
};

// ── arranque ──────────────────────────────────────────────────────────────
if (memoria && prefs.pin && HAY_CRIPTO) { bloqueado = true; pedirPin('abrir', 'entrada'); }
else if (memoria) { pintarEntrada(); ir('entrada'); } else { ir('ob1'); }


// El marco mide 884px de alto: en una laptop no entra. En vez de esconderlo,
// lo achicamos para que entre siempre. En celular no se escala, va a pantalla completa.
function ajustarMarco() {
  const m = document.getElementById('marco');
  if (!m) return;
  if (window.innerWidth <= 520) { m.style.transform = ''; return; }
  const s = Math.min(1, (window.innerHeight - 32) / 884, (window.innerWidth - 32) / 430);
  m.style.transform = `scale(${s.toFixed(4)})`;
}
addEventListener('resize', () => { ajustarMarco(); ajustarColchon(); });
ajustarMarco();
ajustarColchon();
