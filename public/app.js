const LLAVE_PREFS = 'amber.prefs.v1';
let prefs = (() => { try { return JSON.parse(localStorage.getItem(LLAVE_PREFS)) ?? {}; } catch (e) { return {}; } })();
const guardarPrefs = () => { try { localStorage.setItem(LLAVE_PREFS, JSON.stringify(prefs)); } catch (e) {} };

const TEMA = new URLSearchParams(location.search).get('tema');
if (TEMA === 'oscuro' || (TEMA !== 'claro' && prefs.oscuro)) document.documentElement.dataset.tema = 'oscuro';

// Vibración: existe en Android y en casi ningún iPhone. Si el navegador no la
// tiene, el interruptor no se ofrece en vez de ofrecerse y no hacer nada.
const HAY_VIBRACION = typeof navigator.vibrate === 'function';
const HAY_AVISOS = 'Notification' in window;
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
  // Dos temas le ponían género a quien los leía. Se guarda el texto del chip, así
  // que quien los eligió con un nombre anterior pasa al de ahora.
  const TEMA_VIEJO = {
    'La exigencia conmigo mismo': 'Exigirme demasiado', 'La exigencia que me pongo': 'Exigirme demasiado',
    'Dormir o estar cansado': 'Dormir mal o el cansancio', 'Dormir o el cansancio': 'Dormir mal o el cansancio',
  };
  if (memoria.temas?.some(t => TEMA_VIEJO[t])) { memoria.temas = [...new Set(memoria.temas.map(t => TEMA_VIEJO[t] ?? t))]; cambio = true; }
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
  if (id === 'conv') { ajustarColchon(); abrirConversacion(); $('#txt').focus(); seguir(false); }
  if (id === 'calma') empezarRespiracion(); else pararRespiracion();
  if (id === 'entrada') animarSaludo();
  if (id === 'mem') pintarMemoria();
  if (id === 'historia') pintarHistoria();
  if (id === 'pers') pintarPersonalizacion();
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
  // Cerrado no es lo mismo que roto: si no se puede pasar, decí por qué.
  if (b.getAttribute('aria-disabled') === 'true') { senalarDia(); return; }
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
}

// ── respirar ──────────────────────────────────────────────────────────────
// Seis respiraciones por minuto, con la exhalación más larga que la inhalación y
// sin retener el aire: es el ritmo donde la variabilidad cardíaca llega a su
// máximo, y retener o respirar "hondo" puede disparar sobrerrespiración en
// alguien con ansiedad. Nueve ciclos de diez segundos: los noventa de la home.
const TECNICAS = {
  // 6 por minuto: la frecuencia de resonancia, donde la variabilidad cardíaca
  // llega a su amplitud máxima. Es la de siempre.
  calmar: { rotulo: 'Calmarme', acomodo: 4000, inhala: 4000, inhala2: 0, suelta: 6000, ciclos: 9,
            sub: 'Seguí el círculo. No hace falta respirar hondo.' },
  // 5 por minuto, con la exhalación al doble de la inhalación: más lento y más
  // pesado del lado de soltar, que es el lado que baja la activación.
  dormir: { rotulo: 'Para dormir', acomodo: 5000, inhala: 4000, inhala2: 0, suelta: 8000, ciclos: 8,
            sub: 'Más lento que antes. Soltá el aire sin apuro.' },
  // El suspiro fisiológico: una inhalada, una segunda corta arriba, y una
  // exhalación larga. Es la técnica del ensayo que citamos, y la que más rápido
  // baja la activación cuando ya estás acelerado. Ciclos más cortos, menos tiempo.
  bajar: { rotulo: 'Bajar de golpe', acomodo: 3000, inhala: 3000, inhala2: 900, suelta: 6500, ciclos: 6,
           sub: 'Dos veces adentro, una larga afuera. Sirve cuando ya estás acelerado.' },
};
let RESP = TECNICAS[prefs.respirar] ?? TECNICAS.calmar;
const calma = $('#calma'), calmaT = $('#calma-t'), calmaS = $('#calma-s'), calmaAviso = $('#calma-aviso'),
      progreso = $('#calma-progreso'), botonSonido = $('#calma-sonido');
const orbeHalo = $('#calma-o1'), orbeCentro = $('#calma-o2'), orbeRastro = $('#calma-rastro'), calmaLuz = $('#calma-luz');
let resp = null, bloqueo = null;

function fase(nombre, ms) {
  calma.style.setProperty('--dur', ms + 'ms');
  calma.dataset.fase = nombre;
}
const avisarCalma = t => { calmaAviso.textContent = ''; setTimeout(() => { calmaAviso.textContent = t; }, 50); };

// Elegir técnica: se guarda, y si tocás una mientras ya está andando, el
// ejercicio arranca de nuevo con la nueva en vez de quedar a mitad de camino.
const tecnicasEl = $('#calma-tecnicas');
tecnicasEl.querySelectorAll('.calma-tec').forEach(b => {
  b.onclick = () => {
    prefs.respirar = b.dataset.tec;
    guardarPrefs();
    RESP = TECNICAS[prefs.respirar] ?? TECNICAS.calmar;
    pintarTecnicas();
    vibrar(10);
    avisarCalma(`${RESP.rotulo}. ${RESP.sub}`);
    desbloquearAudio();
    empezarRespiracion();
  };
});
function pintarTecnicas() {
  const cual = prefs.respirar ?? 'calmar';
  tecnicasEl.querySelectorAll('.calma-tec').forEach(b =>
    b.setAttribute('aria-checked', String(b.dataset.tec === cual)));
}

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

// ── sonido: una guía, no un ambiente ─────────────────────────────────────────
// Un tono que sube mientras inhalás y baja mientras soltás, y al soltar se apaga
// despacio: se puede hacer el ejercicio con los ojos cerrados, siguiendo solo el
// sonido. Se genera en el momento, sin archivos.
// Los navegadores no dejan que algo suene sin un toque de la persona: el audio se
// destraba en los toques que llevan a respirar, y si igual quedó trabado, el botón
// "Sumá sonido" es el que lo destraba.
const TONO = { calmar: [330, 494], dormir: [262, 392], bajar: [330, 440, 554] };
const VOLUMEN = { arriba: 0.13, abajo: 0.025 };
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
  if (!prefs.sonidoResp) return;
  const ctx = contextoAudio();
  if (!ctx) return;
  try { const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); b.connect(ctx.destination); b.start(0); } catch (e) {}
  ctx.resume?.().catch(() => {});
}
const audioSonando = () => !!(prefs.sonidoResp && audio && audio.state === 'running');

function crearVoz() {
  const ctx = contextoAudio();
  if (!ctx) return null;
  try {
    const [bajo] = TONO[prefs.respirar] ?? TONO.calmar;
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = bajo;
    // Una octava arriba y bajita: sin ella, el tono casi no se oye en el parlante de un celu.
    const osc2 = ctx.createOscillator(); osc2.type = 'triangle'; osc2.frequency.value = bajo * 2;
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    const filtro = ctx.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 1400;
    const vol = ctx.createGain(); vol.gain.value = 0.0001;
    osc.connect(filtro); osc2.connect(g2); g2.connect(filtro); filtro.connect(vol); vol.connect(ctx.destination);
    osc.start(); osc2.start();
    return { ctx, osc, osc2, vol, frec: bajo, volumen: 0.0001 };
  } catch (e) { return null; }
}
const curvaSeno = (a, b, n = 48) => Float32Array.from({ length: n }, (_, i) => a + (b - a) * (1 - Math.cos(Math.PI * i / (n - 1))) / 2);
function planear(param, desde, hasta, t, seg) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t); else param.cancelScheduledValues(t);
  param.setValueCurveAtTime(curvaSeno(desde, hasta), t + 0.01, Math.max(seg, 0.05));
}
// Lleva el tono y el volumen de la voz a donde va la fase.
function tono(nombre, ms, quieto = 0) {
  const v = resp?.voz;
  if (!v) return;
  const [bajo, alto, alto2] = TONO[prefs.respirar] ?? TONO.calmar;
  const seg = ms / 1000, mov = Math.max((ms - quieto) / 1000, 0.05);
  const [frec, volumen, dur, durVol] = {
    inhala:  [alto, VOLUMEN.arriba, mov, Math.min(0.6, mov)],
    inhala2: [alto2 ?? alto, VOLUMEN.arriba * 1.15, Math.min(0.3, mov), 0.2],
    suelta:  [bajo, VOLUMEN.abajo, seg, seg],
  }[nombre] ?? [bajo, 0.0001, seg, seg];
  try {
    const t = v.ctx.currentTime;
    planear(v.osc.frequency, v.frec, frec, t, dur);
    planear(v.osc2.frequency, v.frec * 2, frec * 2, t, dur);
    planear(v.vol.gain, v.volumen, volumen, t, durVol);
    v.frec = frec; v.volumen = volumen;
  } catch (e) {}
}
function callarVoz(ms) {
  const v = resp?.voz;
  if (!v) return;
  resp.voz = null;
  try { planear(v.vol.gain, v.volumen, 0.0001, v.ctx.currentTime, ms / 1000); } catch (e) {}
  setTimeout(() => { try { v.osc.stop(); v.osc2.stop(); v.vol.disconnect(); } catch (e) {} }, ms + 150);
}

function pintarSonido() {
  const sonando = audioSonando();
  botonSonido.setAttribute('aria-pressed', String(sonando));
  $('#calma-sonido-t').textContent = sonando ? 'Silenciar' : 'Sumá sonido';
}
botonSonido.onclick = () => {
  if (audioSonando()) {
    prefs.sonidoResp = false; guardarPrefs();
    callarVoz(500);
  } else {
    // Prenderlo, o destrabarlo si ya estaba prendido y el navegador lo frenó.
    prefs.sonidoResp = true; guardarPrefs();
    desbloquearAudio();
    if (resp && !resp.voz && (resp.timer || resp.pausada)) resp.voz = crearVoz();
    if (resp?.voz && calma.dataset.fase !== 'quieto') tono(calma.dataset.fase, 800);
  }
  pintarSonido();
};

// ── el ejercicio ─────────────────────────────────────────────────────────────
function empezarRespiracion() {
  clearTimeout(vueltaRespirar);
  pararRespiracion();
  resp = { ciclo: 0, timer: null, voz: null, pausada: false };
  delete calma.dataset.terminado;
  calma.style.setProperty('--brillo', 1);
  $('#salir-calma').textContent = 'Terminar';
  calmaT.textContent = 'Acomodate como estés.';
  calmaS.textContent = RESP.sub;
  progreso.style.transition = 'none'; progreso.style.width = '0';
  fase('quieto', 1200);
  pintarTecnicas();
  if (prefs.sonidoResp) resp.voz = crearVoz();
  pintarSonido();
  mantenerPantalla();
  avisarCalma('Noventa segundos de respiración. Acomodate como estés.');
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
  tono('inhala', RESP.inhala, quieto);
  vibrar(24);
  avisarCalma('Inhalá');
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
  tono('inhala2', RESP.inhala2, PICO_QUIETO);
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
  tono('suelta', RESP.suelta);
  vibrar(12);
  avisarCalma('Soltá');
  resp.timer = setTimeout(() => { resp.ciclo++; resp.ciclo < RESP.ciclos ? inhalar() : terminarRespiracion(); }, RESP.suelta);
}

function terminarRespiracion() {
  clearTimeout(resp.timer); resp.timer = null;
  fase('quieto', 2400);
  aquietarEscena(2400);
  callarVoz(2400);
  soltarPantalla();
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
const VUELTA_RESPIRAR = 'Acá estoy. Seguimos cuando quieras.';
const PIEDRA_CHICA = '<svg viewBox="6 5 70 90" aria-hidden="true"><path d="M28 9 C42 28 65 48 70.5 67 C72.5 73 71 82 67.5 86.5 L42.5 91 L14.5 85.5 C10.5 83 9.5 78 11 72.5 C16 50 22 26 28 9 Z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><path d="M22 74 C31 75.6 45 75.6 56 73.6" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>';
let respiracionDesdeCharla = false, vueltaRespirar = null, ofertaEl = null;
function ofrecerRespirar() {
  quitarOferta();
  const b = el('button', 'oferta-respirar');
  b.innerHTML = PIEDRA_CHICA;
  b.append(el('span', null, 'Respiramos noventa segundos'));
  b.onclick = () => {
    if (cortado) return;
    quitarOferta();
    respiracionDesdeCharla = true;
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
  callarVoz(400);
  soltarPantalla();
  resp = null;
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
    tono('quieto', 300); fase('quieto', 600); aquietarEscena(600);
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
  const apodo = memoria?.apodo;
  const saludo = saludoDeLaHora(d.getHours());
  escribirSaludo(memoria?.activa && apodo ? `${saludo}, ${capitalizar(apodo)}.` : `${saludo}.`);
  // Sin memoria previa no hay línea: el saludo queda solo. Se muestra el último,
  // que desde que existe el cierre es el de la conversación que acaba de pasar.
  const rs = memoria?.activa ? memoria.resumenes : null;
  const r = rs?.length ? textoResumen(rs[rs.length - 1]) : null;
  const sabe = $('#sabe');
  sabe.textContent = r ?? '';
  sabe.hidden = !r;
  pintarDia();
}

// ── cómo estuvo el día ────────────────────────────────────────────────────
// Cinco puntos, sin números a la vista: poner "3/5" convierte un día en una nota.
// Arranca sin tocar, porque un valor por defecto ya sería una respuesta puesta
// en la boca de alguien que todavía no dijo nada.
const DIA_PALABRA = { 1:'Muy difícil', 2:'Difícil', 3:'Ni bien ni mal', 4:'Bien', 5:'Muy bien' };
const hoyISO = () => new Date().toLocaleDateString('sv');   // sv da AAAA-MM-DD

const diaCaja = $('#dia-caja'), diaInput = $('#dia'), diaValor = $('#dia-v');
const diaBarra = $('#dia-barra'), diaGuardar = $('#dia-guardar');

const diaDeHoy = () => (memoria?.dia?.fecha === hoyISO() ? memoria.dia : null);

// Contestada, la barra deja de ser un control y pasa a ser una respuesta dada.
// No desaparece: un día no termina cuando abrís la app. Quien puso "bien" a las
// seis puede estar destrozado a las once, y la home no puede quedar mintiendo.
let diaEditando = false;

// "Prefiero no decir" también es una respuesta: abre la puerta, pero se guarda
// sin valor, así Amber no abre preguntando por un día que no le contaron.
function pintarDia() {
  const d = diaDeHoy();
  diaCaja.classList.toggle('sin-tocar', !d);
  diaCaja.classList.remove('tocada');
  diaCaja.classList.toggle('sin-decir', !!d && !d.valor);
  diaCaja.classList.toggle('cerrada', !!d && !diaEditando);
  diaGuardar.hidden = true;
  moverPiedra(d?.valor || 3);
  diaValor.textContent = !d ? 'Movela' : d.valor ? DIA_PALABRA[d.valor] : 'Prefiero no decir';
  puertaChat();
}

// El pulgar es la piedra: se dibuja aparte y sigue al control nativo, que queda encima.
function moverPiedra(v) {
  diaInput.value = v;
  diaBarra.style.setProperty('--pct', `${(v - 1) * 25}%`);
  diaInput.setAttribute('aria-valuetext', DIA_PALABRA[v]);
}

$('#dia-cambiar').onclick = () => {
  diaEditando = true;
  pintarDia();
  diaInput.focus({ preventScroll: true });
  anunciar('Podés volver a marcar cómo estuvo tu día.');
};

// Hablar espera a que la barra se haya movido. Respirar y los teléfonos NO
// esperan a nada: quien está mal a las tres de la mañana no puede toparse con
// un formulario antes de pedir ayuda.
function puertaChat() {
  const abierta = !!diaDeHoy();
  const b = $('#ir-hablar');
  b.setAttribute('aria-disabled', String(!abierta));
  b.querySelector('.acceso-s').textContent = abierta
    ? 'Contame lo que quieras'
    : 'Antes, movés la barra de abajo';
}

function senalarDia() {
  diaCaja.classList.remove('pide');
  void diaCaja.offsetWidth;              // reinicia la animación si ya venía corriendo
  diaCaja.classList.add('pide');
  anunciar('Para empezar a hablar, primero marcá cómo estuvo tu día en la barra.');
  diaInput.focus({ preventScroll: true });
  mostrar(diaCaja);
}

// En un celu bajo la home se desplaza: lo que se señala o se enciende tiene que quedar
// a la vista, no abajo del borde.
const mostrar = (nodo) => nodo.scrollIntoView({ block: 'nearest',
  behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

// Mover la barra no guarda: guarda la flecha que aparece al moverla. Así se puede
// ir y venir hasta encontrar la palabra.
diaInput.addEventListener('input', () => {
  const v = Number(diaInput.value);
  moverPiedra(v);
  diaCaja.classList.remove('sin-tocar', 'sin-decir');
  diaCaja.classList.add('tocada');
  diaValor.textContent = DIA_PALABRA[v];
  diaGuardar.hidden = false;
});
// El servidor corre en UTC; el "hoy" lo decide el reloj de quien escribe.
// Una puntuación de anteayer no le sirve a Amber para nada, así que no viaja.
function memoriaParaEnviar() {
  if (!memoria) return memoria;
  if (memoria.dia?.fecha === hoyISO()) return memoria;
  const { dia, ...resto } = memoria;
  return resto;
}

// Guardar el día no te mete en el chat: abre la puerta y te deja elegir entre hablar
// y respirar. Quien marcó "muy difícil" puede necesitar respirar antes de contar nada.
function guardarDia(valor) {
  if (!memoria) return;
  memoria.dia = { valor, fecha: hoyISO() };
  guardarMemoria();
  diaEditando = false;
  pintarDia();
  vibrar(12);
  // La pregunta con la que Amber abre depende del día. Si cambió y todavía no
  // hablaron, se rehace; si ya hablaron, el pasado no se reescribe.
  if (!mensajes.length) { conversacionAbierta = false; aperturasEl = null; accesoMostrado = false; hilo.innerHTML = ''; }
  const anotado = valor
    ? `Tu día quedó anotado como ${DIA_PALABRA[valor].toLowerCase()}.`
    : 'Listo, no hace falta decir cómo estuvo tu día.';
  anunciar(`${anotado} Ya podés hablar o respirar.`);
  $('#ir-hablar').focus({ preventScroll: true });
  mostrar($('#ir-hablar'));
}
diaGuardar.onclick = () => guardarDia(Number(diaInput.value));
$('#dia-no-decir').onclick = () => guardarDia(null);

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

// Nadie tiene que enfrentarse a una caja vacía: Amber abre, y deja tres puertas
// de entrada para el que no sabe cómo arrancar. Se van con el primer mensaje.
const APERTURA = 'Estoy acá. Contame lo que quieras, no hace falta que tenga sentido.';
const APERTURAS = ['No sé por dónde empezar', 'Tuve un día horrible', 'No puedo dormir'];

// Si movió la barra, Amber no abre con una frase de bienvenida: abre por donde
// el otro ya dijo que viene. La salida de "prefiero no hablar de eso" está
// siempre a mano, porque obligar a alguien a explicar un día malo es pedirle
// justo lo que no puede.
const APERTURA_DIA = {
  1: { texto: 'Un día muy difícil. No hace falta contarlo ordenado: estoy acá para lo que quieras decir.',
       opciones: ['No sé por dónde empezar', 'Fue todo el día', 'Prefiero no entrar en eso'] },
  2: { texto: 'Uf, un día difícil. ¿Qué fue lo que más te pesó?',
       opciones: ['No sé por dónde empezar', 'Una cosa puntual', 'Prefiero no entrar en eso'] },
  3: { texto: 'Ni bien ni mal. Esos días a veces son los más difíciles de nombrar, así que contalo como te salga.',
       opciones: ['Fue un día raro', 'No pasó nada en especial', 'No sé por dónde empezar'] },
  4: { texto: 'Qué bueno que el día estuvo bien. ¿Qué fue lo que lo hizo bueno?',
       opciones: ['Pasó algo bueno', 'Fue tranquilo nomás', 'No sé por dónde empezar'] },
  5: { texto: 'Un día muy bueno, eso merece contarse. ¿Qué pasó?',
       opciones: ['Pasó algo bueno', 'Fue un buen día nomás', 'No sé por dónde empezar'] },
};
const aperturaDeHoy = () => {
  const d = diaDeHoy();
  return d?.valor ? APERTURA_DIA[d.valor] : { texto: APERTURA, opciones: APERTURAS };
};
let aperturasEl = null, conversacionAbierta = false, aperturaMostrada = '';
function abrirConversacion() {
  if (conversacionAbierta || mensajes.length) return;
  conversacionAbierta = true;
  const { texto, opciones } = aperturaDeHoy();
  aperturaMostrada = texto;
  turno('assistant', texto);
  const c = el('div', 'aperturas');
  for (const t of opciones) {
    const b = el('button', 'apertura', t);
    b.onclick = () => mandar(t);
    c.append(b);
  }
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
txt.addEventListener('input', () => escribir(txt.value));
txt.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !ocupado) { e.preventDefault(); mandar(); }
});
enviar.onclick = () => mandar();

// ── voz ───────────────────────────────────────────────────────────────────
// La voz entra, no sale: el usuario puede hablar, Amber nunca contesta hablando.
// A las tres de la mañana escribir cuesta; decirlo en voz alta, menos. Pero lo
// dictado NO se manda solo: cae en el campo de siempre y queda editable. Nadie
// manda sin leer lo que dijo, menos todavía si lo dijo llorando.
const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
const micro = $('#micro'), escucha = $('#escucha'), reloj = $('#reloj');

let rec = null, grabando = false, dictado = '', desde = 0, tic = null, cerrando = false;

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
  grabando = true; cerrando = false;

  rec = new Reconocimiento();
  rec.lang = 'es-AR';
  rec.continuous = true;
  rec.interimResults = true;

  // Cada pausa cierra un segmento. Unirlos con un espacio pegaba dos cosas dichas
  // por separado en un párrafo corrido sin puntuación: van en renglones distintos.
  rec.onresult = e => {
    let tanteo = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i], frase = r[0].transcript.trim();
      if (!frase) continue;
      if (r.isFinal) dictado += (dictado ? '\n' : '') + frase;
      else tanteo += (tanteo ? ' ' : '') + frase;
    }
    escribir(dictado + (tanteo ? (dictado ? '\n' : '') + tanteo : ''), true);
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
  txt.readOnly = true;              // mientras el micrófono escribe, los dedos no pelean
  txt.placeholder = 'Te escucho';
  anunciar('Micrófono abierto. Te escucho.');
}

function pararVoz() {
  if (!grabando) return;
  cerrando = true;
  try { rec.stop(); } catch (e) { cerrarVoz(); }
}

function cerrarVoz() {
  if (!grabando) return;
  grabando = false; cerrando = false;
  clearInterval(tic); tic = null;
  escucha.hidden = true;
  micro.classList.remove('on');
  micro.setAttribute('aria-label', 'Hablar');
  txt.readOnly = false;
  if (!cortado) txt.placeholder = 'Escribí lo que quieras';
  escribir(dictado.trim(), true);   // se cae lo tanteado, queda lo firme
  anunciar('Micrófono cerrado. Podés revisar el texto antes de mandarlo.');
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

let ocupado = false, cortado = false;
function cortar(nota) {
  cortado = true;
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
const MINIMO_PARA_CERRAR = 3;   // ofrecer cerrar algo que no empezó no tiene sentido

function verCerrar() {
  if (cortado) return;
  cerrarBtn.hidden = mensajes.filter(m => m.role === 'user').length < MINIMO_PARA_CERRAR;
}

// ── historia ──────────────────────────────────────────────────────────────
// Las conversaciones quedan en este teléfono y en ningún otro lado. Veinte:
// más atrás nadie vuelve, y el navegador tiene un techo de espacio.
const LLAVE_HIST = 'amber.historia.v1';
const cargarHistoria = () => { try { return JSON.parse(localStorage.getItem(LLAVE_HIST)) ?? []; } catch (e) { return []; } };
const guardarHistoria = (h) => { try { localStorage.setItem(LLAVE_HIST, JSON.stringify(h.slice(-20))); } catch (e) {} };

function archivarCharla(resumen) {
  if (!mensajes.length) return;
  const h = cargarHistoria();
  h.push({
    f: new Date().toISOString(),
    dia: diaDeHoy()?.valor ?? null,
    r: resumen ?? '',
    // La apertura la muestra la app, no el modelo: si no se guarda, la charla
    // vieja empieza con una respuesta a una pregunta que no está.
    m: [{ r: 'assistant', c: aperturaMostrada }, ...mensajes.map(x => ({ r: x.role, c: x.content }))],
  });
  guardarHistoria(h);
}

function pintarHistoria() {
  const c = $('#historia-cuerpo'); c.innerHTML = '';
  const h = cargarHistoria().reverse();
  if (!h.length) {
    // El subtítulo de arriba ya dice qué es esta pantalla; repetirlo no ayuda.
    // Lo que falta acá es por dónde se empieza.
    const puerta = el('div', 'vacio-puerta');
    puerta.append(el('div', 'vacio', 'Todavía nada. Acá va quedando cada conversación que cierres.'));
    const b = el('button', 'btn btn-2', 'Ir a hablar');
    b.onclick = () => ir('entrada');
    puerta.append(b);
    c.append(puerta);
    return;
  }
  const lista = el('div', 'grupo');
  lista.style.gap = '10px';
  h.forEach((ch, i) => {
    const b = el('button', 'charla-f');
    const cuando = el('div', 'charla-cuando');
    if (ch.dia) { const p = el('i', 'punto-dia'); p.style.opacity = 0.3 + ch.dia * 0.14; cuando.append(p); }
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

function fechaLarga(iso) {
  const d = new Date(iso);
  return `${capitalizar(DIAS[d.getDay()])} ${d.getDate()} de ${MESES[d.getMonth()]}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function abrirCharla(i) {
  const ch = cargarHistoria()[i];
  if (!ch) return;
  $('#charla-fecha').textContent = fechaLarga(ch.f);
  $('#charla-dia').textContent = ch.dia ? `Ese día lo marcaste como ${DIA_PALABRA[ch.dia].toLowerCase()}.` : '';
  $('#charla-dia').hidden = !ch.dia;
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

function guardarResumen(t) {
  if (!memoria || !t) return;
  // Ocho alcanzan: más atrás deja de ser memoria y pasa a ser archivo.
  memoria.resumenes = [...(memoria.resumenes ?? []), { t, f: hoyISO() }].slice(-8);
  guardarMemoria();
  pintarEntrada();
}

cerrarBtn.onclick = async () => {
  if (ocupado || cortado) return;
  ocupado = true;
  cerrarBtn.disabled = true;
  quitarAperturas();
  quitarOferta();
  const p = puntos();
  let despedida = 'Lo dejamos acá por hoy. Cuando quieras seguir, estoy.';
  try {
    const r = await fetch('/api/cierre', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mensajes }),
    });
    const d = await r.json();
    if (d.despedida) despedida = d.despedida;
    guardarResumen(d.resumen);
    archivarCharla(d.resumen);
  } catch (e) { console.error(e); archivarCharla(''); }
  p.remove();
  turno('assistant', despedida);
  anunciar(despedida);
  cortar('Cerraste la charla de hoy.');
  const volver = el('button', 'volver-inicio', 'Volver al inicio');
  volver.onclick = () => ir('entrada');
  hilo.appendChild(volver); seguir(true);
  ocupado = false;
};

async function mandar(textoDirecto) {
  const t = (textoDirecto ?? txt.value).trim();
  if (!t || ocupado || cortado) return;
  ocupado = true;
  if (grabando) { dictado = ''; pararVoz(); }
  quitarAperturas();
  quitarOferta();
  $('#ver-ayuda').hidden = true;   // mientras se escribe no ocupa el lugar de escribir
  if (textoDirecto == null) { txt.value = ''; txt.style.height = 'auto'; enviar.classList.remove('listo'); }
  ajustarColchon();
  anclarArriba(turno('user', t));
  mensajes.push({ role: 'user', content: t });
  const p = puntos();
  try {
    const r = await fetch('/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      // El saludo con el que abrió la conversación va primero: sin él, Amber contesta
      // a una pregunta que no ve.
      body: JSON.stringify({ mensajes: aperturaMostrada ? [{ role: 'assistant', content: aperturaMostrada }, ...mensajes] : mensajes,
                             memoria: memoriaParaEnviar(), ambiguos }),
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
  // Vuelve la puerta a los teléfonos. Se esconde mientras se manda, no para siempre:
  // adentro de la conversación no hay otra salida a los recursos, y dejarla oculta
  // la hacía depender de que el clasificador acierte, que es justo lo que no queremos.
  $('#ver-ayuda').hidden = false;
  if (!cortado) txt.focus();
}

async function leerStream(r, p) {
  const lector = r.body.getReader(), dec = new TextDecoder();
  let resto = '', nodo = null, rev = null, riesgo = 'ninguno', fin = false, crudo = '', mostrado = '';
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
      if (d.tipo === 'riesgo') { riesgo = d.nivel; if (d.ambiguo) ambiguos++; }
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
  const texto = sinMarca(crudo, true);
  if (texto.length > mostrado.length) {
    if (!nodo) { nodo = turno('assistant', ''); rev = revelador(nodo); }
    rev.empujar(texto.slice(mostrado.length));
  }
  if (rev) await rev.terminar();
  if (!nodo) { turno('assistant', 'Se me cortó algo acá. Probá de nuevo.'); return; }
  mensajes.push({ role: 'assistant', content: texto });
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

const VACIO = {
  datos:       'Todavía nada. Acá va quedando lo que me contás mientras hablamos: gente, lo que hacés, lo que está pasando.',
  objetivos:   'Todavía nada. Acá va apareciendo lo que venís trabajando.',
  estrategias: 'Todavía nada. Acá guardo lo que te haya servido alguna vez.',
  sensibles:   'Todavía nada. Acá van los temas que no traigo yo.',
  resumenes:   'Todavía nada. Cada vez que cerrás una conversación queda una línea acá.',
};

const ESTILOS = [
  ['escuchar', 'Que te escuche', 'Sin devoluciones, sin que opine.'],
  ['devolver', 'Que te devuelva lo que veo', 'Aunque a veces incomode.'],
];

function pintarMemoria() {
  const c = $('#mem-cuerpo'); c.innerHTML = '';
  const guardar = () => { guardarMemoria(); pintarMemoria(); pintarEntrada(); };
  const lista = (clave) => (memoria[clave] ??= []).map((v, i) =>
    entrada(v,
      () => { memoria[clave].splice(i, 1); guardar(); },
      (nuevo) => { if (nuevo && nuevo !== v) { memoria[clave][i] = nuevo; guardar(); } },
      clave === 'sensibles' ? 'No lo saco yo. Lo traés vos cuando querés.' : null));

  // Siempre visible, incluso vacío: si no, borrar el apodo lo dejaba sin forma de volver a ponerlo.
  c.append(grupo('Cómo te digo', [
    entrada(memoria.apodo ?? '', () => { memoria.apodo = ''; guardar(); },
      n => { if (n !== memoria.apodo) { memoria.apodo = n; guardar(); } })]));
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

  c.append(grupo('Personas y situaciones',  conVacio('datos', lista('datos'))));
  c.append(grupo('Lo que venís trabajando', conVacio('objetivos', lista('objetivos'))));
  c.append(grupo('Lo que te ayuda',         conVacio('estrategias', lista('estrategias'))));
  c.append(grupo('Temas sensibles',         conVacio('sensibles', lista('sensibles'))));
  c.append(grupo('Lo que me contaste', conVacio('resumenes', (memoria.resumenes ?? []).map((v, i) =>
    entrada(textoResumen(v),
      () => { memoria.resumenes.splice(i, 1); guardar(); },
      (nuevo) => {
        if (!nuevo || nuevo === textoResumen(v)) return;
        // Si lo editás a mano queda como lo escribiste, con la fecha que ya tenía.
        memoria.resumenes[i] = typeof v === 'string' ? nuevo : { ...v, t: nuevo };
        guardar();
      })).reverse())));

}

// Cerrar sesión borra todo lo guardado y vuelve al principio. Recarga en vez de
// resetear diez variables a mano: es la única forma de garantizar que no queda
// nada del usuario anterior dando vueltas en memoria.
const ROTULO_SALIR = 'Cerrar sesión';
let confirmandoSalir = null;
$('#cerrar-sesion').onclick = () => {
  const b = $('#cerrar-sesion');
  if (!confirmandoSalir) {
    b.textContent = 'Tocá de nuevo para cerrar sesión';
    confirmandoSalir = setTimeout(() => { confirmandoSalir = null; b.textContent = ROTULO_SALIR; }, 4000);
    return;
  }
  clearTimeout(confirmandoSalir); confirmandoSalir = null;
  try { for (const k of [LLAVE, 'amber.memoria.v1', LLAVE_HIST, LLAVE_PREFS]) localStorage.removeItem(k); } catch (e) {}
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
  memoria = { activa: true, apodo: '', estilo: null, datos: [], objetivos: [], estrategias: [], sensibles: [], resumenes: [] };
  guardarMemoria(); pintarMemoria(); pintarEntrada();
  b.textContent = ROTULO_BORRAR;
};

// ── personalización ───────────────────────────────────────────────────────
function pintarPersonalizacion() {
  const c = $('#pers-cuerpo'); c.innerHTML = '';
  const o = el('div', 'opciones');
  o.style.paddingTop = '8px';
  o.setAttribute('role', 'radiogroup');
  for (const [k, t, d] of ESTILOS) {
    const b = el('button', 'opcion');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(memoria?.estilo === k));
    b.append(el('span', 'opcion-t', t), el('span', 'opcion-s', d));
    // Volver a tocar la elegida la apaga: se puede volver a la voz de siempre.
    b.onclick = () => {
      if (!memoria) return;
      memoria.estilo = memoria.estilo === k ? null : k;
      guardarMemoria(); vibrar(10); pintarPersonalizacion();
    };
    o.append(b);
  }
  c.append(o);
  const nota = el('div', 'vacio', memoria?.estilo
    ? 'Tocá la elegida de nuevo para volver a mi voz de siempre.'
    : 'Sin elegir ninguna, hablo como hablo siempre.');
  nota.style.paddingTop = '14px';
  c.append(nota);
}

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

  caja.append(filaPref('Avisos',
    !HAY_AVISOS ? 'Este navegador no los permite.'
    : Notification.permission === 'denied' ? 'Los bloqueaste en el navegador. Se destraba desde ahí.'
    : 'Permiso para avisarte. El recordatorio de todas las noches llega con la app.',
    !!prefs.avisos && HAY_AVISOS && Notification.permission === 'granted',
    async () => {
      if (prefs.avisos) { prefs.avisos = false; guardarPrefs(); pintarPreferencias(); return; }
      const r = await Notification.requestPermission();
      prefs.avisos = r === 'granted';
      guardarPrefs(); vibrar(10); pintarPreferencias();
      if (prefs.avisos) new Notification('Amber', { body: 'Listo. Te voy a avisar por acá.' });
    },
    HAY_AVISOS && Notification.permission !== 'denied'));

  c.append(caja);
}

// ── sobre amber ───────────────────────────────────────────────────────────
const ABOUT = [
  ['Qué es', 'Amber es una inteligencia artificial para hablar de lo que te pasa, a la hora que sea. No hay turno, no hay que explicar de nuevo quién sos.'],
  ['Qué no es', '<strong>No es terapia y no reemplaza a un profesional.</strong> No diagnostica, no receta y no es un servicio de emergencia. Si estás en riesgo, los teléfonos están en el menú, en "Si necesitás ayuda ahora".'],
  ['Quién la hace', 'Dos estudiantes argentinos. Está en desarrollo: lo que ves es un prototipo.'],
  ['Qué pasa con lo que contás', '<strong>No hay cuenta, no hay servidor y nadie puede leer tus conversaciones.</strong> Lo que Amber recuerda y las charlas que cerrás viven en este teléfono, en el navegador, y de acá no salen. Lo que escribís viaja a la API de Anthropic para que Amber pueda contestarte, y no se usa para entrenar modelos. Si borrás los datos del navegador, no queda nada en ningún lado: tampoco nosotros podemos recuperarlo.'],
  ['Por qué se respira así', 'La de siempre son nueve ciclos de cuatro segundos adentro y seis afuera: seis respiraciones por minuto. Ese ritmo no es arbitrario. Alrededor de esa frecuencia —entre 4,5 y 7 por minuto, según la persona— es donde la variabilidad de la frecuencia cardíaca alcanza su amplitud máxima, lo que se conoce como frecuencia de resonancia. Y de todo lo que se puede cambiar en una respiración, alargar la exhalación más que la inhalación es lo que más se asoció a mejoras en el ánimo en un ensayo aleatorizado de Stanford, publicado en <em>Cell Reports Medicine</em> en 2023 (Balban y otros). Ese trabajo probó una técnica distinta a la nuestra, así que lo que tomamos de ahí es el principio, no el protocolo. Tampoco te pedimos que respires hondo ni que retengas el aire arriba: en alguien con ansiedad, eso puede empujar a sobrerrespirar. Las otras dos salen del mismo principio: <strong>Para dormir</strong> baja a cinco por minuto con la exhalación al doble de la inhalación, y <strong>Bajar de golpe</strong> es el suspiro fisiológico —una inhalada, una segunda corta arriba, y una exhalación larga—, que es justamente la técnica que ganó en ese ensayo.'],
  ['Cómo borrarlo', 'Desde "Lo que recuerdo" borrás lo que Amber sabe de vos. Desde "Historia" borrás las conversaciones. "Cerrar sesión" borra todo junto y no se puede deshacer.'],
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
obGenSeguir.onclick = () => ir('ob2b');

// El estilo no es una preferencia cosmética: la voz es el producto. Se elige
// una vez, se guarda con todo lo demás y se cambia desde la memoria.
let estiloOnboarding = null;
const obRegSeguir = $('#ob-reg-seguir');

document.querySelectorAll('#ob2b .opcion').forEach(b => {
  b.onclick = () => {
    estiloOnboarding = b.dataset.estilo;
    document.querySelectorAll('#ob2b .opcion').forEach(o =>
      o.setAttribute('aria-checked', String(o === b)));
    obRegSeguir.disabled = false;
  };
});
obRegSeguir.onclick = () => ir('ob2c');
// Nadie tiene que contestar para poder entrar. Sin elegir, Amber usa su voz de siempre.
$('#ob-reg-saltar').onclick = () => { estiloOnboarding = null; ir('ob2c'); };

// Temas: hasta tres, para no tener que explicar de nuevo de qué se trata. Se guarda
// el texto tal cual se ve. Con tres elegidos los demás se apagan.
let temasOnboarding = [];
const chipsTemas = [...document.querySelectorAll('#ob2c .chip')], obTemasSeguir = $('#ob-temas-seguir');
chipsTemas.forEach(b => {
  b.onclick = () => {
    const t = b.textContent.trim();
    temasOnboarding = temasOnboarding.includes(t) ? temasOnboarding.filter(x => x !== t) : [...temasOnboarding, t].slice(0, 3);
    chipsTemas.forEach(c => {
      const elegido = temasOnboarding.includes(c.textContent.trim());
      c.setAttribute('aria-pressed', String(elegido));
      c.disabled = !elegido && temasOnboarding.length >= 3;
    });
    obTemasSeguir.disabled = !temasOnboarding.length;
    vibrar(10);
  };
});
obTemasSeguir.onclick = () => ir('ob3');
$('#ob-temas-saltar').onclick = () => { temasOnboarding = []; ir('ob3'); };

const obCheck = $('#ob-check'), obEntrar = $('#ob-entrar');
obCheck.addEventListener('change', () => { obEntrar.disabled = !obCheck.checked; });
obEntrar.onclick = () => {
  memoria = { activa: true, apodo: apodoOnboarding, genero: generoOnboarding, estilo: estiloOnboarding,
              temas: temasOnboarding, datos: [], objetivos: [], estrategias: [], sensibles: [], resumenes: [] };
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
addEventListener('resize', () => { ajustarMarco(); ajustarColchon(); });
ajustarMarco();
ajustarColchon();
