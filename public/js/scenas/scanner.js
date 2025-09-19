// public/js/scenas/scanner.js
import { makeRunner, hexToRGB } from "./base.js";

/**
 * Scanner — barra que recorre la pantalla con un pequeño brillo lateral.
 */
export function sceneScanner(ctx, canvas){
  const { run } = makeRunner(ctx, canvas);

  return ({ color="#00c8ff", speed=1, intensity=1 }) => {
    const rgb = hexToRGB(color);

    run((t) => {
      const w = canvas.width, h = canvas.height;

      // posición de la barra en [0..1]
      const pos = (Math.sin(t * 0.003 * speed) * 0.5 + 0.5);
      const x = Math.floor(pos * w);

      // ancho de la barra central y halo
      const barW = Math.max(8, Math.round(w * 0.06));
      const halo = Math.max(6, Math.round(barW * 0.35));

      ctx.clearRect(0,0,w,h);

      // halo (decreciente hacia los lados)
      for (let i = halo; i >= 1; i--) {
        const alpha = (i / halo) * 0.25 * intensity; // halo suave
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
        ctx.fillRect(x - Math.floor(barW/2) - i, 0, i*2 + barW, h);
      }

      // barra principal
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.min(1, 0.85*intensity)})`;
      ctx.fillRect(x - Math.floor(barW/2), 0, barW, h);
    });
  };
}
