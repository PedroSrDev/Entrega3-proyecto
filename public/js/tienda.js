// Tienda pública: catálogo (RF-03), carrito (RF-04) y registro de pedido (RF-05).
const $ = (id) => document.getElementById(id);
let productos = [];
let categoriaActiva = null;

// El carrito se guarda en el navegador para no perderlo al recargar la página.
let carrito = [];
try { carrito = JSON.parse(localStorage.getItem('sgpc_carrito')) || []; } catch { carrito = []; }
const guardar = () => { try { localStorage.setItem('sgpc_carrito', JSON.stringify(carrito)); } catch {} };

async function cargar() {
  try {
    const [cats, prods] = await Promise.all([api('/api/categorias'), api('/api/productos')]);
    productos = prods;
    // Quita del carrito productos que ya no estén activos.
    carrito = carrito.filter((i) => productos.some((p) => p.id_producto === i.id_producto));
    pintarCategorias(cats);
    pintarCatalogo();
    pintarCarrito();
  } catch (e) {
    $('catalogo').innerHTML = `<p class="vacio">No se pudo cargar el catálogo: ${esc(e.message)}</p>`;
  }
}

function pintarCategorias(cats) {
  const chips = [{ id_categoria: null, nombre: 'Todas' }, ...cats];
  $('categorias').innerHTML = chips.map((c) =>
    `<button type="button" class="chip ${c.id_categoria === categoriaActiva ? 'activo' : ''}" data-id="${c.id_categoria ?? ''}">${esc(c.nombre)}</button>`
  ).join('');
  $('categorias').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
    categoriaActiva = b.dataset.id ? Number(b.dataset.id) : null;
    pintarCategorias(cats);
    pintarCatalogo();
  }));
}

function pintarCatalogo() {
  const texto = $('buscar').value.toLowerCase().trim();
  const lista = productos.filter((p) =>
    (categoriaActiva === null || p.id_categoria === categoriaActiva) &&
    (p.nombre.toLowerCase().includes(texto) || (p.descripcion || '').toLowerCase().includes(texto))
  );
  $('sinProductos').classList.toggle('oculto', lista.length > 0);
  $('catalogo').innerHTML = lista.map((p) => {
    const img = p.imagen
      ? `<div class="img" style="background-image:url('${esc(p.imagen)}')"></div>`
      : `<div class="img" style="background:${colorDe(p.categoria)}">${esc(p.nombre.charAt(0))}</div>`;
    return `<article class="producto">
      ${img}
      <div class="cuerpo">
        <span class="cat">${esc(p.categoria)}</span>
        <h3>${esc(p.nombre)}</h3>
        <p>${esc(p.descripcion || '')}</p>
        <div class="pie">
          <span class="precio">${pesos(p.precio)}</span>
          <button class="btn btn-peq" type="button" data-agregar="${p.id_producto}">Agregar</button>
        </div>
      </div>
    </article>`;
  }).join('');
  $('catalogo').querySelectorAll('[data-agregar]').forEach((b) =>
    b.addEventListener('click', () => agregar(Number(b.dataset.agregar), b)));
}

function agregar(id, boton) {
  const item = carrito.find((i) => i.id_producto === id);
  if (item) item.cantidad = Math.min(99, item.cantidad + 1);
  else carrito.push({ id_producto: id, cantidad: 1 });
  guardar();
  pintarCarrito();
  if (boton) { boton.textContent = '✓ Agregado'; setTimeout(() => (boton.textContent = 'Agregar'), 900); }
}

function cambiarCantidad(id, delta) {
  const item = carrito.find((i) => i.id_producto === id);
  if (!item) return;
  item.cantidad += delta;
  if (item.cantidad <= 0) carrito = carrito.filter((i) => i.id_producto !== id);
  if (item.cantidad > 99) item.cantidad = 99;
  guardar();
  pintarCarrito();
}

// Calcula subtotales y total del carrito (los valores definitivos los calcula el servidor).
function lineasCarrito() {
  return carrito.map((i) => {
    const p = productos.find((x) => x.id_producto === i.id_producto);
    return { ...i, nombre: p.nombre, precio: p.precio, subtotal: p.precio * i.cantidad };
  });
}

function pintarCarrito() {
  const lineas = lineasCarrito();
  const total = lineas.reduce((s, l) => s + l.subtotal, 0);
  $('contador').textContent = lineas.reduce((s, l) => s + l.cantidad, 0);
  $('totalCarrito').textContent = pesos(total);
  $('btnPedido').disabled = lineas.length === 0;
  $('itemsCarrito').innerHTML = lineas.length === 0
    ? '<p class="vacio">Tu carrito está vacío.</p>'
    : lineas.map((l) => `<div class="item">
        <div>
          <div class="nombre">${esc(l.nombre)}</div>
          <div class="sub">${pesos(l.precio)} c/u · Subtotal ${pesos(l.subtotal)}</div>
        </div>
        <div class="cantidad">
          <button type="button" data-menos="${l.id_producto}" aria-label="Quitar uno">−</button>
          <span>${l.cantidad}</span>
          <button type="button" data-mas="${l.id_producto}" aria-label="Agregar uno">+</button>
        </div>
      </div>`).join('');
  $('itemsCarrito').querySelectorAll('[data-menos]').forEach((b) => b.addEventListener('click', () => cambiarCantidad(Number(b.dataset.menos), -1)));
  $('itemsCarrito').querySelectorAll('[data-mas]').forEach((b) => b.addEventListener('click', () => cambiarCantidad(Number(b.dataset.mas), 1)));
}

const abrirCarrito = (si) => { $('carrito').classList.toggle('abierto', si); $('velo').classList.toggle('visible', si); };

$('btnCarrito').addEventListener('click', () => abrirCarrito(true));
$('cerrarCarrito').addEventListener('click', () => abrirCarrito(false));
$('velo').addEventListener('click', () => abrirCarrito(false));
$('buscar').addEventListener('input', pintarCatalogo);

$('btnPedido').addEventListener('click', () => {
  abrirCarrito(false);
  const total = lineasCarrito().reduce((s, l) => s + l.subtotal, 0);
  $('resumenPedido').textContent = `Total a pagar contra entrega: ${pesos(total)}`;
  $('msgPedido').className = 'mensaje';
  $('modalPedido').classList.add('visible');
  $('nombre').focus();
});
$('cancelarPedido').addEventListener('click', () => $('modalPedido').classList.remove('visible'));
$('cerrarOk').addEventListener('click', () => $('modalOk').classList.remove('visible'));

$('formPedido').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const cliente = { nombre: $('nombre').value, direccion: $('direccion').value, telefono: $('telefono').value };
  const msg = $('msgPedido');
  // Validación en el navegador (el servidor vuelve a validar).
  const faltan = [];
  if (cliente.nombre.trim().length < 3) faltan.push('nombre');
  if (cliente.direccion.trim().length < 5) faltan.push('dirección');
  if (!/^[0-9+\s()-]{7,30}$/.test(cliente.telefono.trim())) faltan.push('teléfono válido');
  if (faltan.length) { msg.className = 'mensaje error'; msg.textContent = `Revisa: ${faltan.join(', ')}.`; return; }

  $('confirmarPedido').disabled = true;
  try {
    const pedido = await api('/api/pedidos', { method: 'POST', body: { cliente, items: carrito } });
    carrito = [];
    guardar();
    pintarCarrito();
    $('formPedido').reset();
    $('modalPedido').classList.remove('visible');
    $('textoOk').innerHTML = `Tu pedido <strong>N.° ${pedido.id_pedido}</strong> quedó en estado <strong>${esc(pedido.estado)}</strong>.<br>
      Total: <strong>${pesos(pedido.total)}</strong>. Te contactaremos al ${esc(cliente.telefono)} para coordinar la entrega.`;
    $('modalOk').classList.add('visible');
  } catch (e) {
    msg.className = 'mensaje error';
    msg.textContent = e.message;
  } finally {
    $('confirmarPedido').disabled = false;
  }
});

cargar();
