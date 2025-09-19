import { makeRunner } from "./base.js";

export function sceneRainbow(ctx, canvas){
  const { run } = makeRunner(ctx, canvas);
  return ({ speed=1, intensity=1 }) => {
    run((t)=> {
      const w = canvas.width, h = canvas.height;
      const grd = ctx.createLinearGradient(0,0,w,h);
      const base = (t*0.0002*speed)%1, stops = 6;
      for(let i=0;i<=stops;i++){
        const p=(i/stops+base)%1, hue=Math.floor(p*360);
        grd.addColorStop(i/stops, `hsla(${hue},100%,50%,${intensity})`);
      }
      ctx.fillStyle = grd;
      ctx.fillRect(0,0,w,h);
    });
  };
}
