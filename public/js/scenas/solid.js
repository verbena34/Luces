import { makeRunner } from "./base.js";

export function sceneSolid(ctx, canvas){
  const { run } = makeRunner(ctx, canvas);
  return ({ color="#000000", intensity=1 }) => {
    run(()=> {
      ctx.fillStyle = color;
      ctx.globalAlpha = intensity;
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.globalAlpha = 1;
    });
  };
}
