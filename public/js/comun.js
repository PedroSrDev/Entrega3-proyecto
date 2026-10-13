// Funciones compartidas por la tienda y el panel.
const pesos = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

// Escapa texto antes de insertarlo como HTML (evita inyección de código en la página).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Color estable por texto (para la imagen por defecto de los productos).
function colorDe(texto) {
  const colores = ['#1f5f8b', '#2e8b57', '#b5651d', '#7b4fa3', '#c0392b', '#16808a', '#8a6d16'];
  let h = 0;
  for (const c of String(texto)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return colores[h % colores.length];
}

// Llamada a la API que devuelve JSON o lanza un error con el mensaje del servidor.
async function api(url, opciones = {}) {
  const resp = await fetch(url, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const e = new Error(datos.error || 'Ocurrió un error. Intente de nuevo.');
    e.status = resp.status;
    throw e;
  }
  return datos;
}
