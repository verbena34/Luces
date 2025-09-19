// public/js/admin.js — robustez + métricas + preview (usando módulos de escenas)

// ---------- IMPORTA MANEJADOR DE ERRORES ----------
import reportError from "./errorHandler.js";  // <- relativo, MISMO directorio
// ---------- IMPORTA ESCENAS DESDE MÓDULOS ----------
import { scenePulse } from "/js/scenas/pulse.js";
import { sceneRainbow } from "/js/scenas/rainbow.js";
import { sceneScanner } from "/js/scenas/scanner.js";
import { sceneSolid } from "/js/scenas/solid.js";
import { sceneStrobe } from "/js/scenas/strobe.js";
import { sceneText } from "/js/scenas/text.js";
import { sceneWave } from "/js/scenas/wave.js";
import { sceneWaveDual } from "/js/scenas/waveDual.js";

// ---------- IMPORTA MÓDULO DE MÚSICA ----------
import musicModule from "/js/music.js";

// ---------- FLAG: desactivar wiring legacy del panel de música ----------
const USE_LEGACY_MUSIC_WIRING = false;

// ---------- PERSISTENCIA DE CONFIGURACIÓN ----------
const STORAGE_KEY = 'lightshow_admin_config';

function saveConfig() {
  try {
    const config = {
      // Configuración de escena
      currentScene: $("sceneSelect")?.value || "",
      sceneColor: $("colorPicker")?.value || "#5ac8ff",
      sceneSpeed: $("speedSlider")?.value || "1",
      sceneIntensity: $("intensitySlider")?.value || "1",
      
      // Configuración de texto (si existe)
      textInput: $("textInput")?.value || "",
      textFg: $("textFg")?.value || "#ffffff", 
      textBg: $("textBg")?.value || "#000000",
      textBgAlpha: $("textBgAlpha")?.value || "0.8",
      textAlign: $("textAlign")?.value || "center",
      textAnim: $("textAnim")?.value || "none",
      
      // Panel de música abierto/cerrado
      musicPanelVisible: $("music-panel")?.classList.contains("visible") || false,
      
      // Timestamp de guardado
      savedAt: Date.now()
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    console.log("[CONFIG] Configuración guardada:", config);
  } catch (err) {
    console.warn("[CONFIG] Error guardando configuración:", err);
  }
}

function loadConfig() {
  try {
    const configStr = localStorage.getItem(STORAGE_KEY);
    if (!configStr) return;
    
    const config = JSON.parse(configStr);
    console.log("[CONFIG] Restaurando configuración:", config);
    
    // Restaurar configuración de escena
    if (config.currentScene && $("sceneSelect")) {
      $("sceneSelect").value = config.currentScene;
    }
    if (config.sceneColor && $("colorPicker")) {
      $("colorPicker").value = config.sceneColor;
    }
    if (config.sceneSpeed && $("speedSlider")) {
      $("speedSlider").value = config.sceneSpeed;
      // Actualizar display si existe
      const speedDisplay = document.querySelector("#speedSlider + .slider-value");
      if (speedDisplay) speedDisplay.textContent = `${config.sceneSpeed}x`;
    }
    if (config.sceneIntensity && $("intensitySlider")) {
      $("intensitySlider").value = config.sceneIntensity;
      // Actualizar display si existe
      const intensityDisplay = document.querySelector("#intensitySlider + .slider-value");
      if (intensityDisplay) intensityDisplay.textContent = `${Math.round(config.sceneIntensity * 100)}%`;
    }
    
    // Restaurar configuración de texto
    if (config.textInput && $("textInput")) {
      $("textInput").value = config.textInput;
    }
    if (config.textFg && $("textFg")) {
      $("textFg").value = config.textFg;
    }
    if (config.textBg && $("textBg")) {
      $("textBg").value = config.textBg;
    }
    if (config.textBgAlpha && $("textBgAlpha")) {
      $("textBgAlpha").value = config.textBgAlpha;
    }
    if (config.textAlign && $("textAlign")) {
      $("textAlign").value = config.textAlign;
    }
    if (config.textAnim && $("textAnim")) {
      $("textAnim").value = config.textAnim;
    }
    
    // Restaurar estado del panel de música
    if (config.musicPanelVisible && $("music-panel")) {
      $("music-panel").classList.add("visible");
      const toggleBtn = $("toggle-music-panel");
      if (toggleBtn) toggleBtn.textContent = "🎵 Cerrar panel de música";
    }
    
  } catch (err) {
    console.warn("[CONFIG] Error cargando configuración:", err);
  }
}

// Guardar configuración automáticamente cuando cambia algo
function setupAutoSave() {
  const inputsToWatch = [
    "sceneSelect", "colorPicker", "speedSlider", "intensitySlider",
    "textInput", "textFg", "textBg", "textBgAlpha", "textAlign", "textAnim"
  ];
  
  inputsToWatch.forEach(id => {
    const element = $(id);
    if (element) {
      element.addEventListener("input", () => {
        // Debounce para evitar demasiados saves
        clearTimeout(element._saveTimeout);
        element._saveTimeout = setTimeout(saveConfig, 500);
      });
      
      element.addEventListener("change", saveConfig);
    }
  });
}

// ---------- helpers ----------
function $(id) {
  const element = document.getElementById(id);
  if (!element && id !== "stats" && id !== "latency") { // Estos IDs podrían ser opcionales
    errorHandler.logError("DOM", `Elemento con ID '${id}' no encontrado en el DOM`);
  }
  return element;
}

function getParam(name, def = "") {
  try {
    const u = new URL(location.href);
    return u.searchParams.get(name) ?? def;
  } catch (err) {
    errorHandler.logError("URL parsing", err);
    return def;
  }
}

function setDisabled(disabled) {
  ["play", "stop", "resetAll", "testFlash"].forEach((id) => {
    const el = $(id);
    if (el) {
      el.disabled = !!disabled;
    }
  });
}

const connEl = $("connStatus");
function setConnStatus(txt, emoji = "🔌") {
  if (connEl) connEl.textContent = `${emoji} ${txt}`;
}

// ---------- socket & evento ----------
try {
  // Inicializar el manejador de errores primero
  errorHandler.init();

  const eventId = window.__EVENT_ID__ || getParam("e", "");
  const adminKey = window.__ADMIN_KEY__ || getParam("k", "");
  if (!eventId) {
    errorHandler.logError("Parámetro faltante", "No se encontró el ID del evento (parámetro 'e')");
    location.href = "/";
    throw new Error("Falta ?e=");
  }

  // Pass admin key in the query string for validation
  const socket = io({ query: { k: adminKey } });

  // IMPORTANTE: re-entrar a la sala SIEMPRE que (re)conecte
  socket.on("connect", errorHandler.wrap(() => {
    socket.emit("role", { role: "admin", eventId });
    setConnStatus("Conectado", "🟢");
    setDisabled(false);
    console.log("Socket conectado, ID:", socket.id);
  }));

  socket.on("connect_error", errorHandler.wrap((err) => {
    errorHandler.logError("Socket connect error", err);
    setConnStatus("Error de conexión", "⚠️");
    setDisabled(true);
  }));

  socket.on("disconnect", errorHandler.wrap((reason) => {
    console.log("Socket desconectado, razón:", reason);
    setConnStatus("Desconectado", "🔴");
    setDisabled(true);
  }));

  socket.io.on("reconnect_attempt", errorHandler.wrap(() => {
    setConnStatus("Reconectando…", "🟡");
    setDisabled(true);
  }));

  socket.io.on("error", errorHandler.wrap((err) => {
    errorHandler.logError("Socket error", err);
    setConnStatus("Error", "⚠️");
  }));

  // ---------- Link + QR + copiar ----------
  const joinUrl = `${location.origin}/join.html?e=${encodeURIComponent(eventId)}`;
  if ($("joinUrl")) $("joinUrl").textContent = joinUrl;

  // Crear QR code si existe la librería y el elemento
  if ($("qr")) {
    try {
      if (typeof QRious === 'undefined') {
        throw new Error("La librería QRious no está disponible");
      }
      new QRious({ element: $("qr"), value: joinUrl, size: 220 });
    } catch (err) {
      errorHandler.logError("QR Generation", err);
      // Mensaje de fallback
      if ($("qr")) $("qr").outerHTML = `<div style="border:1px dashed #ccc;padding:20px;text-align:center">QR code no disponible</div>`;
    }
  }

  if ($("copyLink"))
    $("copyLink").onclick = errorHandler.wrap(async () => {
      try {
        await navigator.clipboard.writeText(joinUrl);
        $("copyLink").textContent = "✅ Copiado";
        setTimeout(() => ($("copyLink").textContent = "📋 Copiar"), 1200);
      } catch (err) {
        errorHandler.logError("Clipboard API", err);
        // Fallback: seleccionar texto
        const textArea = document.createElement("textarea");
        textArea.value = joinUrl;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          $("copyLink").textContent = "✅ Copiado";
        } catch (e) {
          $("copyLink").textContent = "❌ Error";
        }
        document.body.removeChild(textArea);
        setTimeout(() => ($("copyLink").textContent = "📋 Copiar"), 1200);
      }
    });

  // ---------- PREVIEW (canvas) ----------
  const pCanvas = $("preview");
  if (!pCanvas) {
    throw new Error("No se encontró el canvas de previsualización con ID 'preview'");
  }

  const pCtx = pCanvas.getContext("2d");
  let raf = 0;

  function run(loop) {
    cancelAnimationFrame(raf);
    const t0 = performance.now();
    const tick = (now) => {
      try {
        loop(now - t0);
        raf = requestAnimationFrame(tick);
      } catch (err) {
        errorHandler.logError("Animation loop", err);
        cancelAnimationFrame(raf);
      }
    };
    raf = requestAnimationFrame(tick);
  }

  function clear() {
    cancelAnimationFrame(raf);
    if (pCtx) pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
  }

  // ---------- escenas (preview local usando módulos) ----------
  const PREVIEW = {};

  try {
    PREVIEW.solid = sceneSolid(pCtx, pCanvas);
    PREVIEW.pulse = scenePulse(pCtx, pCanvas);
    PREVIEW.strobe = sceneStrobe(pCtx, pCanvas);
    PREVIEW.wave = sceneWave(pCtx, pCanvas);
    PREVIEW.rainbow = sceneRainbow(pCtx, pCanvas);
    PREVIEW.waveDual = sceneWaveDual(pCtx, pCanvas);
    PREVIEW.scanner = sceneScanner(pCtx, pCanvas);
    PREVIEW.text = sceneText(pCtx, pCanvas);
  } catch (err) {
    errorHandler.logError("Scene module initialization", err);
  }

  // ---------- selección de escena (botones) ----------
  const group = document.getElementById("sceneGroup");
  let currentScene = group?.querySelector(".scene-btn.active")?.dataset.scene || "solid";

  // Function to toggle visibility of scene-specific controls
  function toggleControlPanels() {
    try {
      const isTextScene = currentScene === "text";
      const standardControls = $("standard-controls");
      const textControls = $("text-controls");

      if (standardControls) standardControls.style.display = isTextScene ? "none" : "block";
      if (textControls) textControls.style.display = isTextScene ? "block" : "none";
    } catch (err) {
      errorHandler.logError("Control panel toggle", err);
    }
  }

  function setActive(btn) {
    try {
      if (!group) {
        errorHandler.logError("Scene selection", "Grupo de escenas no encontrado");
        return;
      }

      group.querySelectorAll(".scene-btn").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      currentScene = btn.dataset.scene;
      toggleControlPanels();
      renderPreview(currentPayload());
    } catch (err) {
      errorHandler.logError("Scene activation", err);
    }
  }

  if (group) {
    group.addEventListener("click", errorHandler.wrap((e) => {
      const btn = e.target.closest(".scene-btn");
      if (!btn) return;
      setActive(btn);
    }));
  } else {
    errorHandler.logError("DOM", "Elemento sceneGroup no encontrado");
  }

  // ---------- payload + preview ----------
  function currentPayload() {
    try {
      // Base payload for all scenes
      const payload = {
        name: currentScene,
        speed: parseFloat($("speed")?.value || 1),
        intensity: parseFloat($("intensity")?.value || 1),
      };

      // Standard scene payload
      if (currentScene !== "text") {
        payload.color = $("color")?.value || "#00c8ff";
      }
      // Text scene payload
      else {
        payload.text = ($("textMsg")?.value || "").slice(0, 120).trim();
        payload.fg = $("textFg")?.value || "#ffffff";
        payload.bg = $("textBg")?.value || "#000000";
        payload.bgAlpha = parseFloat($("textBgAlpha")?.value || 0.8);
        payload.align = $("textAlign")?.value || "center";
        payload.anim = $("textAnim")?.value || "fade";
      }

      return payload;
    } catch (err) {
      errorHandler.logError("Payload generation", err);
      return { name: "solid", color: "#ff0000" };
    }
  }

  function renderPreview(p) {
    try {
      if (!p || !p.name) {
        errorHandler.logError("Preview rendering", "Payload incompleto");
        return;
      }

      const sceneRenderer = PREVIEW[p.name] || PREVIEW.solid;
      if (typeof sceneRenderer !== 'function') {
        errorHandler.logError("Preview rendering", `Escena '${p.name}' no disponible o no es una función`);
        return;
      }

      sceneRenderer(p);
    } catch (err) {
      errorHandler.logError("Preview rendering", err);
    }
  }

  // Auto-preview for standard controls
  ["color", "speed", "intensity"].forEach((id) => {
    const el = $(id);
    if (el) {
      el.addEventListener("input", errorHandler.wrap(() => renderPreview(currentPayload())));
    }
  });

  // Auto-preview for text controls
  ["textMsg", "textFg", "textBg", "textBgAlpha", "textAlign", "textAnim"].forEach((id) => {
    const el = $(id);
    if (el) {
      el.addEventListener("input", errorHandler.wrap(() => renderPreview(currentPayload())));
    }
  });

  // ---------- Play / Stop ----------
  function nextT0() {
    const lead = $("countIn")?.checked ? 3000 : 800; // margen futuro
    return Date.now() + lead;
  }

  if ($("play")) {
    $("play").onclick = errorHandler.wrap(() => {
      if (socket.disconnected) {
        errorHandler.logError("Socket action", "Intentando emitir con socket desconectado");
        return;
      }
      const p = { ...currentPayload(), t0: nextT0() };
      renderPreview(p);
      socket.emit("scene:play", p);
    });
  }

  if ($("stop")) {
    $("stop").onclick = errorHandler.wrap(() => {
      clear();
      if (!socket.disconnected) socket.emit("scene:stop");
    });
  }

  // --- Reset rápido: manda stop global
  if ($("resetAll")) {
    $("resetAll").onclick = errorHandler.wrap(() => {
      clear();
      if (!socket.disconnected) socket.emit("scene:stop");
    });
  }

  // --- Test flash: blanco breve para verificar sincronía
  if ($("testFlash")) {
    $("testFlash").onclick = errorHandler.wrap(async () => {
      if (socket.disconnected) {
        errorHandler.logError("Socket action", "Intentando emitir con socket desconectado");
        return;
      }
      const back = { ...currentPayload() }; // escena actual para restaurar
      const flash = { name: "solid", color: "#ffffff", speed: 1, intensity: 1, t0: Date.now() + 400 };
      renderPreview(flash);
      socket.emit("scene:play", flash);
      setTimeout(() => {
        const p = { ...back, t0: Date.now() + 400 };
        renderPreview(p);
        socket.emit("scene:play", p);
      }, 250);
    });
  }

  // ---------- Stats de sala ----------
  socket.on("room:stats", errorHandler.wrap(({ viewers, admins }) => {
    const el = document.getElementById("stats");
    if (el) el.textContent = `${viewers} viewers · ${admins} admins`;
  }));

  socket.emit("room:who");
  setInterval(() => socket.emit("room:who"), 8000);

  // ---------- Métricas: latencia (RTT) ----------
  const latEl = $("latency");
  async function pingSamples(n = 5) {
    const samples = [];
    for (let i = 0; i < n; i++) {
      try {
        const t0 = Date.now();
        await new Promise((res, rej) => {
          const timeout = setTimeout(() => rej(new Error("Timeout esperando pong")), 3000);
          socket.once("time:pong", () => {
            clearTimeout(timeout);
            res();
          });
          socket.emit("time:ping", t0);
        });
        const rtt = Date.now() - t0;
        samples.push(rtt);
        await new Promise((r) => setTimeout(r, 120));
      } catch (err) {
        errorHandler.logError("Latency sampling", err);
      }
    }

    if (samples.length === 0) {
      throw new Error("No se pudieron obtener muestras de latencia");
    }

    samples.sort((a, b) => a - b);
    return samples[0]; // mejor (menor) RTT
  }

  async function refreshLatency() {
    if (socket.disconnected) {
      if (latEl) latEl.textContent = "— ms";
      return;
    }
    try {
      const best = await pingSamples(5);
      if (latEl) latEl.textContent = `${best} ms`;
    } catch (err) {
      errorHandler.logError("Latency refresh", err);
      if (latEl) latEl.textContent = "— ms";
    }
  }

  refreshLatency();
  setInterval(refreshLatency, 5000);

  // ---------- Preview inicial ----------
  renderPreview(currentPayload());

  // ---------- Estado inicial UI ----------
  setDisabled(socket.disconnected);
  setConnStatus(socket.connected ? "Conectado" : "Desconectado", socket.connected ? "🟢" : "🔴");

  // Initialize controls visibility based on the current scene
  toggleControlPanels();

  // ---------- Initialize Music Module ----------
  document.addEventListener("DOMContentLoaded", errorHandler.wrap(() => {
    try {
      // Initialize the music module once the DOM is fully loaded
      musicModule.init(socket);
      
      // ======== INICIALIZAR PERSISTENCIA DE CONFIGURACIÓN ========
      console.log("[CONFIG] Inicializando sistema de persistencia");
      loadConfig();        // Cargar configuración guardada
      setupAutoSave();     // Configurar guardado automático
      
      // Guardar configuración al cerrar/refrescar la página
      window.addEventListener("beforeunload", saveConfig);
      
      // Guardar configuración periódicamente (cada 30 segundos)
      setInterval(saveConfig, 30000);

      // ======== PANEL DE MÚSICA (Admin → Server → Join) ========
      // 🔇 Desactivado: dejamos que /js/music.js maneje todo.
      if (USE_LEGACY_MUSIC_WIRING) {
        (() => {
          // (Bloque legacy desactivado)
        })();
      }

      // Add custom event listeners for scene integration
      document.addEventListener("localScenePlay", errorHandler.wrap((e) => {
        const payload = e.detail;
        renderPreview(payload);
        socket.emit("scene:play", payload);
      }));

      document.addEventListener("localFlash", errorHandler.wrap((e) => {
        const payload = e.detail;

        // Store current scene to restore
        const currentState = { ...currentPayload() };

        // Render and emit flash
        renderPreview(payload);
        socket.emit("scene:play", payload);

        // If a duration is specified, restore after that time
        if (payload.duration) {
          setTimeout(() => {
            const restorePayload = { ...currentState, t0: Date.now() + 100 };
            renderPreview(restorePayload);
            socket.emit("scene:play", restorePayload);
          }, payload.duration);
        }
      }));

      // Toggle music panel visibility
      const musicToggleBtn = document.getElementById("toggle-music-panel");
      const musicPanel = document.getElementById("music-panel");

      if (musicToggleBtn && musicPanel) {
        musicToggleBtn.addEventListener("click", () => {
          const isVisible = musicPanel.classList.contains("visible");

          if (isVisible) {
            musicPanel.classList.remove("visible");
            musicToggleBtn.textContent = "🎵 Abrir panel de música";
          } else {
            musicPanel.classList.add("visible");
            musicToggleBtn.textContent = "🎵 Cerrar panel de música";
          }
          
          // Guardar configuración después del toggle
          saveConfig();
        });
      } else {
        if (!musicToggleBtn) errorHandler.logError("DOM", "Elemento toggle-music-panel no encontrado");
        if (!musicPanel) errorHandler.logError("DOM", "Elemento music-panel no encontrado");
      }
    } catch (err) {
      errorHandler.logError("Music module initialization", err);
    }
  }));

} catch (err) {
  // Asegurarse de que errorHandler esté inicializado incluso si hay un error inicial
  try {
    if (typeof errorHandler.init === 'function' && !document.getElementById('error-container')) {
      errorHandler.init();
    }
    errorHandler.logError("Initialización", err);
  } catch (initErr) {
    console.error("Error crítico en manejo de errores:", initErr);
    console.error("Error original:", err);
    // Fallback extremo
    alert(`Error crítico: ${err.message || err}`);
  }
}
