// public/js/errorHandler.js — módulo ES con export default

const errorHandler = (() => {
  let container = null;

  function ensureContainer() {
    if (container) return container;
    container = document.getElementById("error-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "error-container";
      container.style.cssText = `
        position:fixed; right:8px; bottom:8px; max-width:420px;
        font: 12px/1.4 system-ui, sans-serif; z-index:99999;
      `;
      document.body.appendChild(container);
    }
    return container;
  }

  function stringify(err) {
    if (err instanceof Error) {
      return `${err.message}\n${err.stack || ""}`;
    }
    try {
      return typeof err === "object" ? JSON.stringify(err) : String(err);
    } catch {
      return String(err);
    }
  }

  function renderToast(scope, err) {
    const $c = ensureContainer();
    const toast = document.createElement("div");
    toast.style.cssText = `
      background:#1f2937; color:#fff; padding:10px 12px; margin-top:8px;
      border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,.35);
      white-space:pre-wrap; word-break:break-word;
    `;
    toast.innerHTML =
      `<strong>⚠️ ${scope}</strong>\n<code style="font-family:ui-monospace,monospace">${escapeHtml(stringify(err)).slice(0, 800)}</code>`;
    $c.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function logError(scope, err) {
    console.error(`[${scope}]`, err);
    try {
      renderToast(scope, err);
      // Aquí podrías enviar métricas al servidor:
      // navigator.sendBeacon?.("/client-error", JSON.stringify({ scope, message: String(err?.message||err), stack: err?.stack||null }));
    } catch (e) {
      console.error("[errorHandler.renderToast failed]", e);
    }
  }

  // wrap: envuelve callbacks para capturar excepciones
  function wrap(fn, scope = "callback") {
    return (...args) => {
      try {
        return fn(...args);
      } catch (err) {
        logError(scope, err);
      }
    };
  }

  function init() {
    // listeners globales
    window.addEventListener("error", (ev) => {
      logError("window.onerror", ev.error || ev.message || ev);
    });
    window.addEventListener("unhandledrejection", (ev) => {
      logError("unhandledrejection", ev.reason || ev);
    });
  }

  return { init, logError, wrap };
})();

// Opcional: también cuélgalo en window para usos no-módulo
window.errorHandler = errorHandler;

export default errorHandler;
