// Panel administrativo: autenticación (RF-01), catálogo (RF-02) y estados de pedidos (RF-06).
const $ = (id) => document.getElementById(id);
const ESTADOS = ['Pendiente', 'En Proceso', 'Completado'];
let token = sessionStorage.getItem('sgpc_token');
let categorias = [];
let productos = [];
let filtroEstado = '';

// Llamada autenticada; si la sesión expiró vuelve al inicio de sesión.
async function apiAdmin(url, opciones = {}) {
  try {
    return await api(url, { ...opciones, headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    if (e.status === 401) salir('Su sesión expiró. Inicie sesión de nuevo.');
    throw e;
  }
}

function mostrarPanel(nombre) {
  $('vistaLogin').classList.add('oculto');
  $('vistaPanel').classList.remove('oculto');
  $('btnSalir').classList.remove('oculto');
  $('usuarioActual').classList.remove('oculto');
  $('usuarioActual').textContent = nombre || '';
  cargarTodo();
}

function salir(mensaje) {
  token = null;
  sessionStorage.removeItem('sgpc_token');
  $('vistaPanel').classList.add('oculto');
  $('btnSalir').classList.add('oculto');
  $('usuarioActual').classList.add('oculto');
  $('vistaLogin').classList.remove('oculto');
  const m = $('msgLogin');
  m.className = mensaje ? 'mensaje error' : 'mensaje';
  m.textContent = mensaje || '';
}

$('formLogin').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const m = $('msgLogin');
  try {
    const r = await api('/api/auth/login', { method: 'POST', body: { correo: $('correo').value, clave: $('clave').value } });
    token = r.token;
    sessionStorage.setItem('sgpc_token', token);
    sessionStorage.setItem('sgpc_nombre', r.usuario.nombre);
    $('formLogin').reset();
    m.className = 'mensaje';
    mostrarPanel(r.usuario.nombre);
  } catch (e) {
    m.className = 'mensaje error';
    m.textContent = e.message;
  }
});
$('btnSalir').addEventListener('click', () => salir());

// Pestañas
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('activa', x === t));
  $('tab-pedidos').classList.toggle('oculto', t.dataset.tab !== 'pedidos');
  $('tab-productos').classList.toggle('oculto', t.dataset.tab !== 'productos');
}));

async function cargarTodo() {
  await Promise.all([cargarResumen(), cargarPedidos(), cargarProductos()]).catch(() => {});
}

async function cargarResumen() {
  const r = await apiAdmin('/api/admin/resumen');
  $('resumen').innerHTML = [
    ['Pendientes', r.pendientes], ['En proceso', r.en_proceso], ['Completados', r.completados],
    ['Productos activos', r.productos_activos], ['Ventas registradas', pesos(r.ventas)],
  ].map(([t, v]) => `<div class="resumen"><strong>${v}</strong><span>${t}</span></div>`).join('');
}

// ---------- Pedidos ----------
function pintarFiltroEstado() {
  $('filtroEstado').innerHTML = ['', ...ESTADOS].map((e) =>
    `<button type="button" class="chip ${e === filtroEstado ? 'activo' : ''}" data-e="${e}">${e || 'Todos'}</button>`).join('');
  $('filtroEstado').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
    filtroEstado = b.dataset.e; pintarFiltroEstado(); cargarPedidos();
  }));
}

async function cargarPedidos() {
  const url = '/api/admin/pedidos' + (filtroEstado ? `?estado=${encodeURIComponent(filtroEstado)}` : '');
  const pedidos = await apiAdmin(url);
  $('tablaPedidos').innerHTML = pedidos.length === 0
    ? '<tr><td colspan="7" class="vacio">No hay pedidos con este filtro.</td></tr>'
    : pedidos.map((p) => `<tr>
        <td><strong>${p.id_pedido}</strong></td>
        <td>${new Date(p.fecha_pedido).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</td>
        <td>${esc(p.nombre_cliente)}<div class="detalles">${esc(p.direccion_entrega)} · ${esc(p.telefono)}</div></td>
        <td class="detalles">${p.detalles.map((d) => `${d.cantidad} × ${esc(d.producto)}`).join('<br>')}</td>
        <td>${pesos(p.total)}</td>
        <td><span class="etiqueta e-${p.estado.replace(' ', '-')}">${esc(p.estado)}</span></td>
        <td><select data-pedido="${p.id_pedido}" aria-label="Estado del pedido ${p.id_pedido}">
          ${ESTADOS.map((e) => `<option ${e === p.estado ? 'selected' : ''}>${e}</option>`).join('')}
        </select></td>
      </tr>`).join('');
  $('tablaPedidos').querySelectorAll('select[data-pedido]').forEach((s) => s.addEventListener('change', async () => {
    try {
      await apiAdmin(`/api/admin/pedidos/${s.dataset.pedido}/estado`, { method: 'PATCH', body: { estado: s.value } });
      await Promise.all([cargarPedidos(), cargarResumen()]);
    } catch (e) { alertar(e.message); }
  }));
}
$('recargarPedidos').addEventListener('click', cargarTodo);

// ---------- Productos ----------
async function cargarProductos() {
  [categorias, productos] = await Promise.all([apiAdmin('/api/admin/categorias'), apiAdmin('/api/admin/productos')]);
  $('tablaProductos').innerHTML = productos.map((p) => `<tr>
      <td>${p.id_producto}</td>
      <td><strong>${esc(p.nombre)}</strong><div class="detalles">${esc(p.descripcion || '')}</div></td>
      <td>${esc(p.categoria)}</td>
      <td>${pesos(p.precio)}</td>
      <td><span class="etiqueta ${p.estado ? 'e-activo' : 'e-inactivo'}">${p.estado ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn btn-claro btn-peq" type="button" data-editar="${p.id_producto}">Editar</button>
        <button class="btn btn-peq ${p.estado ? 'btn-peligro' : 'btn-ok'}" type="button" data-estado="${p.id_producto}" data-valor="${!p.estado}">
          ${p.estado ? 'Desactivar' : 'Activar'}</button>
      </td>
    </tr>`).join('');
  $('tablaProductos').querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirProducto(Number(b.dataset.editar))));
  $('tablaProductos').querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await apiAdmin(`/api/admin/productos/${b.dataset.estado}/estado`, { method: 'PATCH', body: { estado: b.dataset.valor === 'true' } });
      await Promise.all([cargarProductos(), cargarResumen()]);
    } catch (e) { alertar(e.message); }
  }));
}

function abrirProducto(id) {
  const p = productos.find((x) => x.id_producto === id);
  $('tituloProducto').textContent = p ? `Editar producto #${p.id_producto}` : 'Nuevo producto';
  $('pCategoria').innerHTML = categorias.map((c) => `<option value="${c.id_categoria}">${esc(c.nombre)}</option>`).join('');
  $('pId').value = p ? p.id_producto : '';
  $('pNombre').value = p ? p.nombre : '';
  $('pCategoria').value = p ? p.id_categoria : (categorias[0]?.id_categoria ?? '');
  $('pPrecio').value = p ? p.precio : '';
  $('pDescripcion').value = p ? (p.descripcion || '') : '';
  $('pImagen').value = p ? (p.imagen || '') : '';
  $('msgProducto').className = 'mensaje';
  $('modalProducto').classList.add('visible');
  $('pNombre').focus();
}
$('nuevoProducto').addEventListener('click', () => abrirProducto(null));
$('cancelarProducto').addEventListener('click', () => $('modalProducto').classList.remove('visible'));

$('formProducto').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const id = $('pId').value;
  const datos = {
    nombre: $('pNombre').value, id_categoria: Number($('pCategoria').value), precio: $('pPrecio').value === '' ? '' : Number($('pPrecio').value),
    descripcion: $('pDescripcion').value.trim(), imagen: $('pImagen').value.trim(),
  };
  try {
    if (id) await apiAdmin(`/api/admin/productos/${id}`, { method: 'PUT', body: datos });
    else await apiAdmin('/api/admin/productos', { method: 'POST', body: datos });
    $('modalProducto').classList.remove('visible');
    await Promise.all([cargarProductos(), cargarResumen()]);
  } catch (e) {
    $('msgProducto').className = 'mensaje error';
    $('msgProducto').textContent = e.message;
  }
});

// ---------- Categorías ----------
$('nuevaCategoria').addEventListener('click', () => {
  $('formCategoria').reset();
  $('msgCategoria').className = 'mensaje';
  $('modalCategoria').classList.add('visible');
});
$('cancelarCategoria').addEventListener('click', () => $('modalCategoria').classList.remove('visible'));
$('formCategoria').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await apiAdmin('/api/admin/categorias', { method: 'POST', body: { nombre: $('cNombre').value, descripcion: $('cDescripcion').value } });
    $('modalCategoria').classList.remove('visible');
    await cargarProductos();
  } catch (e) {
    $('msgCategoria').className = 'mensaje error';
    $('msgCategoria').textContent = e.message;
  }
});

function alertar(texto) {
  const m = document.createElement('div');
  m.className = 'mensaje error';
  m.textContent = texto;
  $('vistaPanel').prepend(m);
  setTimeout(() => m.remove(), 4000);
}

pintarFiltroEstado();
if (token) mostrarPanel(sessionStorage.getItem('sgpc_nombre'));
