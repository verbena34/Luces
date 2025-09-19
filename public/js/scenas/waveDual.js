// public/js/scenas/waveDual.js
import { makeRunner, hexToRGB } from "./base.js";

/**
 * WaveDual — dos ondas que se cruzan (A→ y B←).
 * - Color A = color del payload
 * - Color B = complemento (invertido) del color A
 */
export function sceneWaveDual(ctx, canvas){
  const { run } = makeRunner(ctx, canvas);

  return ({ color="#00c8ff", speed=1, intensity=1 }) => {
    const a = hexToRGB(color);
    const b = { r: 255 - a.r, g: 255 - a.g, b: 255 - a.b }; // complemento

    run((t) => {
      const w = canvas.width, h = canvas.height;
      const cols = 36;
      const colW = w / cols;

      ctx.clearRect(0,0,w,h);

      // fases opuestas
      const g = t * 0.004 * speed;
      for (let i=0; i<cols; i++){
        const phase = (i/cols) * Math.PI * 2;

        // onda A → (seno “a la derecha”)
        const sA = (Math.sin(g + phase) * 0.5 + 0.5) * intensity;
        ctx.fillStyle = `rgba(${a.r},${a.g},${a.b},${sA})`;
        ctx.fillRect(Math.floor(i*colW), 0, Math.ceil(colW)+1, h);

        // onda B ← (seno “a la izquierda”)
        const sB = (Math.sin(-g + phase) * 0.5 + 0.5) * intensity;
        ctx.fillStyle = `rgba(${b.r},${b.g},${b.b},${sB})`;
        ctx.fillRect(Math.floor(i*colW), 0, Math.ceil(colW)+1, h);
      }
    });
  };
}
