// public/js/scenas/strobe.js
import { makeRunner, hexToRGB } from "./base.js";

/**
 * Strobe — flash estroboscópico fuerte.
 * - Frecuencia real de 6–18 Hz (según speed).
 * - Duty cycle corto (18%) para flash marcado.
 * - Incluso “off” deja 5% para que nunca parezca muerto.
 */
export function sceneStrobe(ctx, canvas){
  const { run } = makeRunner(ctx, canvas);

  return ({ color="#ffffff", speed=1, intensity=1 }) => {
    const rgb = hexToRGB(color);

    const freq = 6 + 4 * speed; // 6–18 Hz
    const periodMs = 1000 / freq;
    const onFrac = 0.18;        // 18% encendido
    const onMs = periodMs * onFrac;

    run((tMs) => {
      const phase = tMs % periodMs;
      const on = phase < onMs;

      // 5% cuando está “off” para que siempre se vea algo
      const a = (on ? 1.0 : 0.05) * Math.max(0, Math.min(1, intensity));

      // fondo negro para máximo contraste
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // flash
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });
  };
}
