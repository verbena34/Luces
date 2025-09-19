export function hexToRGB(hex){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? {
    r: parseInt(m[1],16),
    g: parseInt(m[2],16),
    b: parseInt(m[3],16)
  } : {r:0,g:0,b:0};
}

export function makeRunner(ctx, canvas){
  let raf = 0;
  function run(loop){
    cancelAnimationFrame(raf);
    const t0 = performance.now();
    const tick = (now)=>{ loop(now - t0); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  }
  function clear(){
    cancelAnimationFrame(raf);
    ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  return { run, clear };
}
