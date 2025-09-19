// public/js/scenas/pulse.js
import { makeRunner, hexToRGB } from "./base.js";

/**
 * Pulse — “respiración” claramente visible.
 * - Nunca baja de 35% de brillo para que siempre se perciba.
 * - speed ≈ 0.3–1.0 Hz perceptible (derivado de tu slider 0.2–3).
 */
export function scenePulse(ctx, canvas){
  const { run } = makeRunner(ctx, canvas);

  return ({ color="#00c8ff", speed=1, intensity=1 }) => {
    const rgb = hexToRGB(color);
    const freq = 0.3 + 0.7 * speed;   // Hz visibles
    const minA = 0.35;                 // 35% mínimo
    const range = 1 - minA;

    run((tMs) => {
      const t = tMs / 1000; // a segundos
      // coseno para easing suave (0..1)
      const base = (1 - Math.cos(2 * Math.PI * freq * t)) * 0.5;
      const a = (minA + range * base) * Math.max(0, Math.min(1, intensity));

      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });
  };
}
