// public/js/join.js (ES module)

import joinAudio from "/js/join-audio.js"; // ← módulo de audio

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");

// ========= utils =========
function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
addEventListener("resize", fitCanvas);

function clearScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ========= color helpers =========
function hexToRGB(hex) {
  try {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return [0, 200, 255];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  } catch { return [0, 200, 255]; }
}

function rgbToHsl(r,g,b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){h=s=0;}
  else{
    const d=max-min;
    s=l>0.5? d/(2-max-min): d/(max+min);
    switch(max){
      case r: h=(g-b)/d+(g<b?6:0); break;
      case g: h=(b-r)/d+2; break;
      case b: h=(r-g)/d+4; break;
    }
    h/=6;
  }
  return [h,s,l];
}
function hslToRgb(h,s,l){
  function f(p,q,t){ if(t<0)t+=1; if(t>1)t-=1;
    if(t<1/6)return p+(q-p)*6*t;
    if(t<1/2)return q;
    if(t<2/3)return p+(q-p)*(2/3-t)*6;
    return p;
  }
  let r,g,b;
  if(s===0){ r=g=b=l; }
  else{
    const q=l<0.5? l*(1+s): l+s-l*s;
    const p=2*l-q;
    r=f(p,q,h+1/3); g=f(p,q,h); b=f(p,q,h-1/3);
  }
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
}
function complementHex(hex){
  const [r,g,b]=hexToRGB(hex);
  const [h,s,l]=rgbToHsl(r,g,b);
  return hslToRgb((h+0.5)%1, s, l);
}
function lerp(a,b,t){ return a+(b-a)*t; }
function lerpRGB(c1,c2,t){ return [
  Math.round(lerp(c1[0],c2[0],t)),
  Math.round(lerp(c1[1],c2[1],t)),
  Math.round(lerp(c1[2],c2[2],t)),
];}

// ========= renderers (factories que devuelven un draw(ts)) =========
const FACTORY = {
  solid: (p) => {
    const [r,g,b] = hexToRGB(p.color || "#ff0000");
    return () => {
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
  },

  pulse: (p) => {
    const [r,g,b] = hexToRGB(p.color || "#00c8ff");
    const speed = p.speed || 1, intensity = p.intensity ?? 1;
    return (ts) => {
      const t = ts * 0.002 * speed;
      const amp = (Math.sin(t * Math.PI) * 0.5 + 0.5) * intensity;
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, 0.2 + 0.8*amp)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
  },

  rainbow: (p) => {
    const speed = p.speed || 1;
    return (ts) => {
      const t = ts * 0.03 * speed;
      const grad = ctx.createLinearGradient(0,0,canvas.width,0);
      for (let i=0; i<=6; i++) {
        const hue = (t + i*60) % 360;
        grad.addColorStop(i/6, `hsl(${hue},100%,50%)`);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,canvas.width,canvas.height);
    };
  },

  // --- Wave (como admin: 32 columnas, fase ts*0.004*speed) ---
  wave: (p) => {
    const [r,g,b] = hexToRGB(p.color || "#00c8ff");
    const speed = p.speed || 1;
    const intensity = p.intensity ?? 1;
    const cols = 32;

    return (ts) => {
      const w = canvas.width, h = canvas.height;
      const colW = w / cols;

      ctx.clearRect(0,0,w,h);

      const phaseGlobal = ts * 0.004 * speed;

      for (let i = 0; i < cols; i++) {
        const phase = phaseGlobal + (i / cols) * Math.PI * 2;
        const s = (Math.sin(phase) * 0.5 + 0.5) * intensity;
        ctx.fillStyle = `rgba(${r},${g},${b},${s})`;
        ctx.fillRect(Math.floor(i * colW), 0, Math.ceil(colW) + 1, h);
      }
    };
  },

  // --- Wave Dual (como admin: 36 columnas, A→ y B← con alpha) ---
  waveDual: (p) => {
    const [ar,ag,ab] = hexToRGB(p.color || "#00c8ff");
    const br = 255 - ar, bg = 255 - ag, bb = 255 - ab; // complemento RGB
    const speed = p.speed || 1;
    const intensity = p.intensity ?? 1;
    const cols = 36;

    return (ts) => {
      const w = canvas.width, h = canvas.height;
      const colW = w / cols;

      ctx.clearRect(0,0,w,h);

      const g = ts * 0.004 * speed;

      for (let i = 0; i < cols; i++) {
        const phase = (i / cols) * Math.PI * 2;

        // Onda A → (fase +)
        const sA = (Math.sin(g + phase) * 0.5 + 0.5) * intensity;
        ctx.fillStyle = `rgba(${ar},${ag},${ab},${sA})`;
        ctx.fillRect(Math.floor(i * colW), 0, Math.ceil(colW) + 1, h);

        // Onda B ← (fase -)
        const sB = (Math.sin(-g + phase) * 0.5 + 0.5) * intensity;
        ctx.fillStyle = `rgba(${br},${bg},${bb},${sB})`;
        ctx.fillRect(Math.floor(i * colW), 0, Math.ceil(colW) + 1, h);
      }
    };
  },

  strobe: (p) => {
    const [r,g,b] = hexToRGB(p.color || "#ffffff");
    const speed = p.speed || 1;
    return (ts) => {
      const t = Math.floor(ts * 0.01 * speed);
      ctx.fillStyle = (t % 2 === 0) ? `rgb(${r},${g},${b})` : "#000";
      ctx.fillRect(0,0,canvas.width,canvas.height);
    };
  },

  // --- Scanner: haz que rebota izq↔der (misma fase que admin: ts*0.004*speed) ---
  scanner: (p) => {
    const [r,g,b] = hexToRGB(p.color || "#00c8ff");
    const speed = p.speed || 1;
    const intensity = p.intensity ?? 1;

    const cols = 36;    // igual que admin
    const spread = 4;   // grosor del haz en columnas

    return (ts) => {
      const w = canvas.width, h = canvas.height;
      const colW = w / cols;

      ctx.clearRect(0,0,w,h);

      const ph = ts * 0.004 * speed;
      const center = (Math.sin(ph) * 0.5 + 0.5) * (cols - 1); // 0..cols-1

      for (let i = 0; i < cols; i++) {
        const d = Math.abs(i - center);
        const fall = Math.max(0, 1 - d / spread);
        const a = Math.min(1, (fall * fall) * intensity);
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.fillRect(Math.floor(i * colW), 0, Math.ceil(colW) + 1, h);
      }
    };
  },

  // --- TEXT: centrado óptico usando métricas reales + animaciones ---
  text: (p) => {
    const msg = (p.text || "").trim() || "LightShow";
    const [br,bg,bb] = hexToRGB(p.bg || "#000000");
    const [fr,fgc,fb] = hexToRGB(p.fg || "#ffffff");
    const bgAlpha = Number.isFinite(p.bgAlpha) ? p.bgAlpha : 0.8;
    const speed = p.speed || 1;
    const align = (p.align || "center");

    function computeFont(text) {
      const maxPx = Math.min(canvas.width, canvas.height) * 0.22;
      let size = maxPx;
      ctx.font = `700 ${size}px system-ui, Arial, sans-serif`;
      let w = ctx.measureText(text).width;
      const target = canvas.width * 0.85;
      while (w > target && size > 18) {
        size -= 2;
        ctx.font = `700 ${size}px system-ui, Arial, sans-serif`;
        w = ctx.measureText(text).width;
      }
      return size;
    }

    let typedCount = 0;

    return (ts) => {
      const w = canvas.width, h = canvas.height;
      ctx.fillStyle = `rgba(${br},${bg},${bb},${bgAlpha})`;
      ctx.fillRect(0,0,w,h);

      const anim = (p.anim || "none");
      const baseSize = computeFont(msg);

      ctx.font = `700 ${baseSize}px system-ui, Arial, sans-serif`;
      const mt = ctx.measureText(msg);
      const ascent  = mt.actualBoundingBoxAscent  ?? baseSize * 0.8;
      const descent = mt.actualBoundingBoxDescent ?? baseSize * 0.2;
      const textHeight = ascent + descent;

      // Y según alineación
      let centerY;
      if (align === "top") {
        centerY = textHeight / 2 + baseSize * 0.25;
      } else if (align === "bottom") {
        centerY = h - textHeight / 2 - baseSize * 0.25;
      } else {
        centerY = h / 2; // centro exacto del canvas
      }

      let alpha = 1, offsetX = 0, scale = 1;
      let textToDraw = msg;

      if (anim === "fade") {
        alpha = 0.35 + 0.65 * (Math.sin(ts * 0.004 * speed) * 0.5 + 0.5);
      } else if (anim === "slide") {
        offsetX = Math.sin(ts * 0.003 * speed) * w * 0.08;
      } else if (anim === "zoom") {
        scale = 1 + Math.sin(ts * 0.0028 * speed) * 0.12;
      } else if (anim === "type") {
        const cps = 12 * speed;
        typedCount = Math.min(msg.length, Math.floor((ts/1000) * cps));
        textToDraw = msg.slice(0, typedCount);
      } else if (anim === "ticker") {
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const textWidth = ctx.measureText(msg).width;
        const x = w - ((ts * 0.15 * speed) % (textWidth + w));
        ctx.fillStyle = `rgba(${fr},${fgc},${fb},1)`;
        ctx.fillText(msg, x, h/2);
        return;
      }

      // Dibujo centrado real
      ctx.save();
      ctx.translate(w/2 + offsetX, centerY);
      ctx.scale(scale, scale);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(${fr},${fgc},${fb},${alpha})`;
      ctx.fillText(textToDraw, 0, 0);
      ctx.restore();
    };
  },
};

// ======== loop global de animación (controlado) ========
let rafId = 0;
let startT = 0;
let draw = null;

function frame(now) {
  if (!startT) startT = now;
  const ts = now - startT; // ms desde que iniciamos la escena
  if (draw) draw(ts);
  rafId = requestAnimationFrame(frame);
}

function renderScene(payload) {
  cancelAnimationFrame(rafId);
  startT = 0;
  clearScene();

  const name = payload?.name || "solid";
  const factory = FACTORY[name] || FACTORY.solid;
  draw = factory(payload);

  rafId = requestAnimationFrame(frame);
}

// ========= socket.io =========
const socket = io();

// Utility function to sanitize and slugify event IDs (same as server)
function slugifyId(raw) {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '') || 'default';
}

function getEventId() {
  // 1. Check for explicit window variable (highest priority)
  if (window.__EVENT_ID__) return slugifyId(window.__EVENT_ID__);

  // 2. Check query parameters ?e=...
  const u = new URL(location.href);
  let e = u.searchParams.get('e');
  if (e) return slugifyId(e);

  // 3. Check path segments: /join/<id>, /party/<id>, or root short /<id>
  const path = location.pathname;
  let match = 
    path.match(/^\/(?:join|party)(?:\.html)?\/([^\/?#]+)/i) || // /join/<id> or /party/<id>
    path.match(/^\/([^\/?#]+)$/i); // root short /<id>
  
  if (match && match[1]) {
    return slugifyId(decodeURIComponent(match[1]));
  }

  // 4. Hash fallback: #e=<id> or #<id>
  const hash = (location.hash || '').replace(/^#/, '');
  if (hash) {
    const hashValue = hash.startsWith('e=') ? hash.slice(2) : hash;
    return slugifyId(hashValue);
  }

  // 5. Default fallback
  return 'default';
}

socket.on("connect", () => {
  const eventId = getEventId();
  console.log('[join] eventId:', eventId);
  socket.emit("role", { role: "viewer", eventId });
  logDebug(`Conectado como viewer a sala: ${eventId}`);
});

socket.on("scene:play", (p) => {
  logDebug(`scene:play → ${p?.name || "?"}`);
  renderScene(p);
});

socket.on("scene:stop", () => {
  logDebug("scene:stop");
  cancelAnimationFrame(rafId);
  clearScene();
});

// stats (opcional)
socket.on("room:stats", ({ viewers, admins }) => {
  document.getElementById("stats-container").style.display = "block";
  document.getElementById("viewers-count").textContent = viewers;
  document.getElementById("admins-count").textContent = admins;
});

// ========= música =========
// ⚠️ IMPORTANTE: ya NO llamamos joinAudio.init(socket) aquí.
// Lo haremos tras un gesto del usuario para cumplir la política de autoplay.

// ========= debug panel =========
const debugOut = document.getElementById("debug-output");
function logDebug(msg) {
  if (!debugOut) return;
  const t = new Date().toLocaleTimeString();
  debugOut.textContent = `[${t}] ${msg}`;
}

// ========= Pantalla de Bienvenida Premium =========
function createWelcomeScreen() {
  const welcome = document.createElement("div");
  welcome.id = "welcome-screen";
  welcome.style.cssText = `
    position: fixed;
    inset: 0;
    background: linear-gradient(135deg, #0f1419 0%, #1a1f2e 50%, #0f1419 100%);
    background-attachment: fixed;
    color: #eaf1fb;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: hidden;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  `;
  
  welcome.innerHTML = `
    <div class="welcome-container" style="
      text-align: center;
      max-width: 480px;
      padding: 48px 24px;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      position: relative;
      overflow: hidden;
      animation: welcomeFadeIn 0.8s ease-out;
    ">
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, #3bbcff, transparent);
        opacity: 0.5;
      "></div>
      
      <div class="welcome-icon" style="
        width: 80px;
        height: 80px;
        margin: 0 auto 24px;
        background: linear-gradient(135deg, #3bbcff 0%, #1fa1e6 100%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 36px;
        animation: welcomePulse 2s ease-in-out infinite;
        box-shadow: 0 0 20px rgba(59, 188, 255, 0.3);
      ">
        🎆
      </div>
      
      <h1 style="
        font-size: clamp(28px, 6vw, 42px);
        font-weight: 700;
        margin: 0 0 12px;
        background: linear-gradient(135deg, #eaf1fb, #3bbcff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        line-height: 1.2;
      ">
        Bienvenido a LightShow
      </h1>
      
      <p style="
        font-size: clamp(16px, 3vw, 20px);
        color: #a8b5c8;
        margin: 0 0 8px;
        font-weight: 500;
      " id="event-name-display">
        Evento: <span style="color: #3bbcff; font-weight: 600;">Cargando...</span>
      </p>
      
      <p style="
        font-size: clamp(14px, 2.5vw, 16px);
        color: #6b7688;
        margin: 0 0 32px;
        line-height: 1.5;
      ">
        Prepárate para una experiencia visual y sonora única.<br>
        Conecta tus auriculares para la mejor experiencia.
      </p>
      
      <button id="join-btn" style="
        background: linear-gradient(135deg, #3bbcff 0%, #1fa1e6 100%);
        border: none;
        border-radius: 16px;
        color: #0a0d13;
        cursor: pointer;
        font-family: inherit;
        font-size: clamp(16px, 3vw, 18px);
        font-weight: 700;
        min-height: 56px;
        padding: 16px 32px;
        position: relative;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        outline: none;
        overflow: hidden;
        box-shadow: 0 4px 16px rgba(59, 188, 255, 0.3);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      " onmouseover="this.style.transform='translateY(-2px) scale(1.05)'; this.style.boxShadow='0 8px 24px rgba(59, 188, 255, 0.4)'" 
         onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 4px 16px rgba(59, 188, 255, 0.3)'"
         onmousedown="this.style.transform='translateY(0) scale(0.98)'"
         onmouseup="this.style.transform='translateY(-2px) scale(1.05)'">
        🎵 Comenzar Experiencia
      </button>
      
      <div style="
        margin-top: 24px;
        padding: 16px;
        background: rgba(59, 188, 255, 0.1);
        border: 1px solid rgba(59, 188, 255, 0.2);
        border-radius: 12px;
        font-size: clamp(12px, 2vw, 14px);
        color: #a8b5c8;
        line-height: 1.4;
      ">
        💡 <strong>Consejo:</strong> Usa pantalla completa y auriculares para la mejor experiencia inmersiva
      </div>
    </div>
    
    <div style="
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      font-size: clamp(12px, 2vw, 14px);
      color: #6b7688;
      text-align: center;
      opacity: 0.7;
    ">
      <span class="status-dot" style="
        display: inline-block;
        width: 8px;
        height: 8px;
        background: #2be39a;
        border-radius: 50%;
        margin-right: 8px;
        animation: welcomePulse 2s ease-in-out infinite;
      "></span>
      Conectando al evento...
    </div>
  `;
  
  // Agregar estilos de animación
  const style = document.createElement('style');
  style.textContent = `
    @keyframes welcomeFadeIn {
      from { 
        opacity: 0; 
        transform: translateY(30px) scale(0.95); 
      }
      to { 
        opacity: 1; 
        transform: translateY(0) scale(1); 
      }
    }
    
    @keyframes welcomePulse {
      0%, 100% { 
        opacity: 1; 
        transform: scale(1); 
      }
      50% { 
        opacity: 0.7; 
        transform: scale(1.1); 
      }
    }
    
    #join-btn::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
      transition: left 0.6s;
    }
    
    #join-btn:hover::before {
      left: 100%;
    }
    
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(welcome);
  
  // Actualizar el nombre del evento cuando esté disponible
  const eventId = getEventId();
  const eventNameDisplay = welcome.querySelector('#event-name-display');
  if (eventId && eventId !== 'default') {
    const eventName = eventId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    eventNameDisplay.innerHTML = `Evento: <span style="color: #3bbcff; font-weight: 600;">${eventName}</span>`;
  }
  
  return welcome;
}

const welcomeScreen = createWelcomeScreen();
const joinBtn = welcomeScreen.querySelector("#join-btn");

// === Crear/inyectar AudioContext en el gesto (SOLO click, sin awaits) ===
let injectedCtx = null;

function handleUserGesture(ev) {
  try {
    // 1) Crear el AudioContext exactamente dentro del gesto
    if (!injectedCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      injectedCtx = new AC({ latencyHint: "interactive" });
    }

    // 2) Intentar reanudar (no esperamos la promesa)
    try { injectedCtx.resume && injectedCtx.resume(); } catch {}

    // 3) Ping silencioso para “fijar” la salida
    try {
      const gain = injectedCtx.createGain();
      gain.gain.value = 0.0;
      gain.connect(injectedCtx.destination);
      const osc = injectedCtx.createOscillator();
      osc.type = "sine"; osc.frequency.value = 440;
      osc.connect(gain);
      const t0 = injectedCtx.currentTime;
      osc.start(t0); osc.stop(t0 + 0.02);
    } catch {}

    // 4) Inicializar audio con este contexto (síncrono)
    joinAudio.init(socket, injectedCtx);
  } catch (e) {
    console.error("Error inicializando audio:", e);
  } finally {
    // Animar salida de la pantalla de bienvenida
    welcomeScreen.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
    welcomeScreen.style.opacity = '0';
    welcomeScreen.style.transform = 'scale(0.95)';
    
    setTimeout(() => {
      if (welcomeScreen.parentNode) {
        welcomeScreen.parentNode.removeChild(welcomeScreen);
      }
    }, 500);
    
    // Solo botón: eliminamos fallbacks globales para evitar dobles disparos
    joinBtn.removeEventListener("click", handleUserGesture);
  }
}

joinBtn.addEventListener("click", handleUserGesture, { once: true });
// (Quitamos pointerdown/keydown globales para máxima confiabilidad)
