// home.js — genera enlaces y QR para el evento (updated for admin key)
const $ = (id) => document.getElementById(id);

function slugify(str){
  return (str || "")
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // quita acentos
    .replace(/[^a-zA-Z0-9]+/g, "-")                   // separadores
    .replace(/^-+|-+$/g, "")                          // bordes
    .toLowerCase()
    .slice(0, 40) || `event-${Math.random().toString(36).slice(2,8)}`;
}

function buildUrls(eventId){
  const base = location.origin;
  const adminKey = "lightshow2025"; // Default admin key - should match server
  
  // Generate canonical pretty URLs with /join/<slug> format
  const publicUrl = `${base}/join/${encodeURIComponent(eventId)}`;
  const adminUrl  = `${base}/admin.html?e=${encodeURIComponent(eventId)}&k=${encodeURIComponent(adminKey)}`;
  
  // Optional: show compatibility format as well
  const publicUrlCompat = `${base}/join.html?e=${encodeURIComponent(eventId)}`;
  
  return { publicUrl, adminUrl, publicUrlCompat };
}

const qr = new QRious({ element: $("qr"), value: "", size: 220 });

$("create").onclick = () => {
  const raw = $("eventName").value.trim();
  const eventId = slugify(raw);
  $("eventName").value = eventId; // normalizado visible

  const { publicUrl, adminUrl } = buildUrls(eventId);
  $("publicUrl").textContent = publicUrl;
  $("adminUrl").textContent  = adminUrl;

  qr.value = publicUrl;

  // habilita botones
  $("goAdmin").disabled = false;
  $("copyPublic").disabled = false;
  $("copyAdmin").disabled = false;

  // guarda por si quieres persistir en localStorage (opcional)
  try {
    localStorage.setItem("lastEventId", eventId);
  } catch {}
};

$("goAdmin").onclick = () => {
  const eventId = $("eventName").value.trim();
  if (!eventId) return;
  const { adminUrl } = buildUrls(eventId);
  location.href = adminUrl;
};

$("copyPublic").onclick = async () => {
  const url = $("publicUrl").textContent;
  if (!url || url === "—") return;
  try { await navigator.clipboard.writeText(url); $("copyPublic").textContent = "✅ Copiado"; setTimeout(()=>$("copyPublic").textContent="📋 Copiar público", 1200); } catch {}
};
$("copyAdmin").onclick = async () => {
  const url = $("adminUrl").textContent;
  if (!url || url === "—") return;
  try { await navigator.clipboard.writeText(url); $("copyAdmin").textContent = "✅ Copiado"; setTimeout(()=>$("copyAdmin").textContent="📋 Copiar admin", 1200); } catch {}
};

// autocompleta con el último usado (opcional)
try {
  const last = localStorage.getItem("lastEventId");
  if (last && !$("eventName").value) $("eventName").value = last;
} catch {}
