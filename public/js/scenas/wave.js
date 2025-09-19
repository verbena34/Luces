// js/scenas/wave.js
import { makeRunner, hexToRGB } from "./base.js";

/**
 * Wave — columnas que “respiran” con una onda que se desplaza horizontalmente.
 * - color: color base de la onda
 * - speed: 0.2–3 aprox (velocidad del barrido)
 * - intensity: 0–1 (amplitud/alto de la luz)
 */
export function sceneWave(ctx, canvas){
  const { run } = makeRunner(ctx, canvas);

  return ({ color="#00c8ff", speed=1, intensity=1 }) => {
    const rgb = hexToRGB(color);

    run((t) => {
      const w = canvas.width;
      const h = canvas.height;

      // más columnas = onda más fina (ajusta a gusto)
      const cols = 32;
      const colW = w / cols;

      ctx.clearRect(0, 0, w, h);

      // fase global: controla el desplazamiento de la onda
      const phaseGlobal = t * 0.004 * speed;

      for (let i = 0; i < cols; i++) {
        // desfase por columna
        const phase = phaseGlobal + (i / cols) * Math.PI * 2;

        // seno normalizado [0..1] y escalado por intensidad
        const s = (Math.sin(phase) * 0.5 + 0.5) * intensity;

        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${s})`;
        // +1 para evitar gaps entre columnas por redondeo
        ctx.fillRect(Math.floor(i * colW), 0, Math.ceil(colW) + 1, h);
      }
    });
  };
}
