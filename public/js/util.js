// public/js/util.js
export function getParam(name, def = "") {
  const u = new URL(location.href);
  return u.searchParams.get(name) ?? def;
}
export function slugify(text) {
  return (text || "")
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
}
export function randomId(len = 6) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
