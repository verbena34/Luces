// public/js/join-audio.js — init síncrono con contexto inyectado + debug

let ctx = null;
let analyser = null;
let mediaEl = null;
let mediaSrc = null;
let socketRef = null;

// Acciones que podrían llegar antes de que armemos grafo
const pending = [];

function runWhenReady(fn) {
  if (ctx && analyser && mediaEl && mediaSrc) {
    try { fn(); } catch (e) { console.error(e); }
  } else {
    pending.push(fn);
  }
}

// ===== Debug helpers =====
function attachMediaDebug(el) {
  el.onplay = () => console.log("[join-audio] <audio> onplay, t=", el.currentTime);
  el.onpause = () => console.log("[join-audio] <audio> onpause");
  el.onended = () => console.log("[join-audio] <audio> onended");
  el.onwaiting = () => console.log("[join-audio] <audio> waiting (buffering)");
  el.onstalled = () => console.warn("[join-audio] <audio> stalled");
  el.onloadedmetadata = () => console.log("[join-audio] <audio> loadedmetadata, duration:", el.duration);
  el.oncanplay = () => console.log("[join-audio] <audio> canplay");
  el.onerror = () => console.error("[join-audio] <audio> onerror", el.error);
}

function debugBeep() {
  if (!ctx) { console.warn("[join-audio] ctx no inicializado"); return; }
  const gain = ctx.createGain();
  gain.gain.value = 0.05; // volumen bajito
  gain.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.type = "sine"; osc.frequency.value = 880;
  osc.connect(gain);
  const t0 = ctx.currentTime;
  osc.start(t0); osc.stop(t0 + 0.3);
  console.log("[join-audio] beep");
}

// ===== Controles (versión robusta con canplay/stalled) =====
function loadUrl(url, { autoplay = true, position = 0 } = {}) {
  runWhenReady(() => {
    try { mediaEl.pause(); } catch {}

    mediaEl.crossOrigin = "anonymous"; // CORS antes del src
    mediaEl.src = url;
    mediaEl.preload = "auto";
    mediaEl.load();
    console.log("[join-audio] loadUrl:", url, "autoplay:", autoplay, "pos:", position);

    const onCanPlay = () => {
      if (Number.isFinite(position) && position > 0) {
        try { mediaEl.currentTime = position; } catch {}
      }
      if (autoplay) {
        const p = mediaEl.play();
        if (p?.catch) p.catch(e => console.warn("[join-audio] play() bloqueado/falló:", e));
      }
      mediaEl.removeEventListener("canplay", onCanPlay);
    };
    mediaEl.addEventListener("canplay", onCanPlay);

    const onStalled = () => {
      console.warn("[join-audio] stalled → nudge reload");
      const t = mediaEl.currentTime || 0;
      mediaEl.load();
      mediaEl.addEventListener("canplay", () => {
        try { mediaEl.currentTime = t; } catch {}
        mediaEl.play().catch(()=>{});
      }, { once: true });
    };
    mediaEl.addEventListener("stalled", onStalled, { once: true });
  });
}

function play()  { runWhenReady(() => { mediaEl.play().catch(e => console.warn("play() err:", e)); }); }
function pause() { runWhenReady(() => { mediaEl.pause(); }); }
function seek(t) { runWhenReady(() => { try { mediaEl.currentTime = +t || 0; console.log("[join-audio] seek →", mediaEl.currentTime); } catch {} }); }
function setVolume(v) { runWhenReady(() => { mediaEl.volume = Math.max(0, Math.min(1, +v || 0)); console.log("[join-audio] volume →", mediaEl.volume); }); }

/**
 * Inicializa audio usando un AudioContext *ya creado* en el gesto de usuario.
 * IMPORTANTE: no usa async/await para mantener la pila síncrona del gesto.
 */
function init(socket, externalCtx) {
  socketRef = socket;

  // 1) Contexto (inyectado) — NO crear aquí uno nuevo
  if (!externalCtx) {
    console.error("[join-audio] Falta externalCtx. Crea el AudioContext en el gesto y pásalo a init().");
    return;
  }
  ctx = externalCtx;

  // 2) Elemento de audio + grafo WebAudio (todo síncrono)
  if (!mediaEl) {
    mediaEl = new Audio();
    mediaEl.preload = "auto";
    mediaEl.playsInline = true; // iOS
    mediaEl.muted = false;      // ya hubo gesto
    mediaEl.volume = 1.0;
    attachMediaDebug(mediaEl);
  }
  if (!mediaSrc) {
    mediaSrc = ctx.createMediaElementSource(mediaEl);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    mediaSrc.connect(analyser);
    analyser.connect(ctx.destination);
  }

  // 3) Drenar acciones pendientes
  while (pending.length) {
    const fn = pending.shift();
    try { fn(); } catch (e) { console.error(e); }
  }

  // 4) Suscripción de eventos (evitar duplicados si off existe)
  if (typeof socket.off === "function") {
    socket.off("music:load");
    socket.off("music:play");
    socket.off("music:pause");
    socket.off("music:seek");
    socket.off("music:volume");
    socket.off("music:state");
  }

  socket.on("music:load", ({ url, autoplay, position }) => {
    console.log("[join-audio] socket music:load", url, autoplay, position);
    loadUrl(url, { autoplay, position });
  });

  socket.on("music:play", () => {
    console.log("[join-audio] socket music:play");
    if (!mediaEl?.src) {
      console.warn("[join-audio] play sin src → pidiendo estado");
      socketRef.emit?.("music:requestState");
      return;
    }
    play();
  });

  socket.on("music:pause", () => {
    console.log("[join-audio] socket music:pause");
    pause();
  });

  socket.on("music:seek", ({ time }) => {
    console.log("[join-audio] socket music:seek", time);
    seek(time ?? 0);
  });

  socket.on("music:volume", ({ volume }) => {
    console.log("[join-audio] socket music:volume", volume);
    setVolume(volume ?? 1);
  });

  socket.on("music:state", ({ url, isPlaying, position = 0, volume = 1 }) => {
    console.log("[join-audio] socket music:state", { url, isPlaying, position, volume });
    setVolume(volume);
    if (url) {
      loadUrl(url, { autoplay: !!isPlaying, position });
    } else if (isPlaying) {
      socketRef.emit?.("music:requestState");
    }
  });

  // 5) Avisar al Panel y pedir estado actual
  socket.emit?.("music:ready");
  socket.emit?.("music:requestState");
  console.log("[join-audio] init OK, ctx.state:", ctx.state);
}

// ===== Export =====
export default {
  init,
  loadUrl, play, pause, seek, setVolume,
  getAnalyser() { return analyser; },
  getContext() { return ctx; },
  debugBeep, // prueba de salida directa
};
