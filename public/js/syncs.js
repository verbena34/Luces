// public/js/sync.js
export async function syncClock(socket, samples = 5) {
  const results = [];
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    const serverTs = await new Promise((res) => {
      socket.once("time:pong", ({ serverTs }) => res(serverTs));
      socket.emit("time:ping", t0);
    });
    const t1 = Date.now();
    const rtt = t1 - t0;
    const offset = serverTs - (t0 + rtt / 2); // (reloj servidor) - (reloj local)
    results.push({ rtt, offset });
    await new Promise(r => setTimeout(r, 60));
  }
  // nos quedamos con el de menor latencia (más fiable)
  results.sort((a,b)=>a.rtt-b.rtt);
  const best = results[0];
  _offset = best.offset; _rtt = best.rtt;
  return best;
}
let _offset = 0, _rtt = 0;
export function now() { return Date.now() + _offset; }         // tiempo estimado de servidor
export function lastRTT(){ return _rtt; }
