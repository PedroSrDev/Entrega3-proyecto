// =====================================================================
// SGPC - Servidor web y API REST
// Requerimientos: RF-01 a RF-06 y RNF-01 a RNF-04 del plan del proyecto.
// =====================================================================
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, inicializar } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cambiar-esta-clave-en-produccion';
const ESTADOS_PEDIDO = ['Pendiente', 'En Proceso', 'Completado'];

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Envuelve los manejadores async para que los errores lleguen al manejador final.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Utilidades de validación
const texto = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
const entero = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

// ---------------------------------------------------------------------
// Salud del servicio (para verificar el despliegue)
// ---------------------------------------------------------------------
app.get('/api/salud', h(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ estado: 'ok', servicio: 'SGPC', fecha: new Date().toISOString() });
}));

// ---------------------------------------------------------------------
// RF-03 Consulta del catálogo (público)
// ---------------------------------------------------------------------
app.get('/api/categorias', h(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id_categoria, c.nombre, c.descripcion FROM categoria c
      WHERE c.estado = TRUE
        AND EXISTS (SELECT 1 FROM producto p WHERE p.id_categoria = c.id_categoria AND p.estado = TRUE)
      ORDER BY c.nombre`
  );
  res.json(rows);
}));

app.get('/api/productos', h(async (req, res) => {
  const params = [];
  let filtro = '';
  if (req.query.categoria) {
    if (!entero(req.query.categoria)) return res.status(400).json({ error: 'Categoría inválida.' });
    params.push(Number(req.query.categoria));
    filtro = 'AND p.id_categoria = $1';
  }
  // Consultas parametrizadas ($1) en todo el código: evita inyección SQL (RNF-03).
  const { rows } = await pool.query(
    `SELECT p.id_producto, p.nombre, p.descripcion, p.precio::float AS precio, p.imagen,
            p.id_categoria, c.nombre AS categoria
       FROM producto p JOIN categoria c ON c.id_categoria = p.id_categoria
      WHERE p.estado = TRUE AND c.estado = TRUE ${filtro}
      ORDER BY c.nombre, p.nombre`,
    params
  );
  res.json(rows);
}));

// ---------------------------------------------------------------------
// RF-05 Registro de pedido (público)
// El total se calcula en el servidor con los precios de la base de datos,
// nunca con valores enviados por el navegador.
// ---------------------------------------------------------------------
app.post('/api/pedidos', h(async (req, res) => {
  const { cliente, items } = req.body || {};
  const errores = [];
  if (!cliente || !texto(cliente.nombre, 150)) errores.push('El nombre es obligatorio.');
  if (!cliente || !texto(cliente.direccion, 255)) errores.push('La dirección de entrega es obligatoria.');
  if (!cliente || !/^[0-9+\s()-]{7,30}$/.test(String(cliente.telefono || '').trim())) errores.push('El teléfono no es válido.');
  if (!Array.isArray(items) || items.length === 0) errores.push('El carrito está vacío.');
  else if (items.some((i) => !entero(i.id_producto) || !entero(i.cantidad) || Number(i.cantidad) > 99)) {
    errores.push('Hay productos o cantidades inválidas.');
  }
  if (errores.length) return res.status(400).json({ error: errores.join(' ') });

  // Unificamos productos repetidos.
  const cantidades = new Map();
  for (const i of items) cantidades.set(Number(i.id_producto), (cantidades.get(Number(i.id_producto)) || 0) + Number(i.cantidad));
  const ids = [...cantidades.keys()];

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const { rows: productos } = await conn.query(
      'SELECT id_producto, nombre, precio FROM producto WHERE estado = TRUE AND id_producto = ANY($1::int[])',
      [ids]
    );
    if (productos.length !== ids.length) {
      await conn.query('ROLLBACK');
      return res.status(400).json({ error: 'Algún producto del carrito ya no está disponible.' });
    }
    const lineas = productos.map((p) => {
      const cantidad = cantidades.get(p.id_producto);
      const precio = Number(p.precio);
      return { id_producto: p.id_producto, nombre: p.nombre, cantidad, precio, subtotal: precio * cantidad };
    });
    const total = lineas.reduce((s, l) => s + l.subtotal, 0);

    const { rows: [pedido] } = await conn.query(
      `INSERT INTO pedido (nombre_cliente, direccion_entrega, telefono, total)
       VALUES ($1, $2, $3, $4) RETURNING id_pedido, estado, fecha_pedido, total::float AS total`,
      [cliente.nombre.trim(), cliente.direccion.trim(), String(cliente.telefono).trim(), total]
    );
    for (const l of lineas) {
      await conn.query(
        `INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [pedido.id_pedido, l.id_producto, l.cantidad, l.precio, l.subtotal]
      );
    }
    await conn.query('COMMIT');
    res.status(201).json({ ...pedido, detalles: lineas });
  } catch (e) {
    await conn.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}));

// ---------------------------------------------------------------------
// RF-01 Autenticación del administrador
// ---------------------------------------------------------------------
app.post('/api/auth/login', h(async (req, res) => {
  const { correo, clave } = req.body || {};
  if (!texto(correo, 150) || !texto(clave, 100)) {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
  }
  const { rows } = await pool.query(
    'SELECT id_usuario, nombre, correo, clave_hash, rol FROM usuario WHERE correo = $1 AND estado = TRUE',
    [correo.trim().toLowerCase()]
  );
  const usuario = rows[0];
  if (!usuario || !(await bcrypt.compare(clave, usuario.clave_hash))) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }
  const token = jwt.sign({ id: usuario.id_usuario, rol: usuario.rol }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, usuario: { nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol } });
}));

// Middleware: exige un token válido para las rutas /api/admin
function requiereAdmin(req, res, next) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !token) return res.status(401).json({ error: 'Debe iniciar sesión.' });
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'La sesión expiró. Inicie sesión de nuevo.' });
  }
}
app.use('/api/admin', requiereAdmin);

// ---------------------------------------------------------------------
// RF-02 Gestión del catálogo (administrador)
// ---------------------------------------------------------------------
function validarProducto(b) {
  const errores = [];
  if (!texto(b.nombre, 150)) errores.push('El nombre es obligatorio (máx. 150 caracteres).');
  if (!entero(b.id_categoria)) errores.push('Seleccione una categoría.');
  const precio = Number(b.precio);
  if (b.precio === '' || b.precio === null || b.precio === undefined || !Number.isFinite(precio) || precio < 0) {
    errores.push('El precio debe ser un número mayor o igual a 0.');
  }
  if (b.imagen && (typeof b.imagen !== 'string' || b.imagen.length > 500 || !/^https?:\/\//.test(b.imagen))) {
    errores.push('La imagen debe ser una URL que empiece por http:// o https://');
  }
  return errores;
}

app.get('/api/admin/categorias', h(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM categoria ORDER BY nombre');
  res.json(rows);
}));

app.post('/api/admin/categorias', h(async (req, res) => {
  const { nombre, descripcion } = req.body || {};
  if (!texto(nombre, 100)) return res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO categoria (nombre, descripcion) VALUES ($1, $2) RETURNING *',
      [nombre.trim(), descripcion ? String(descripcion).trim().slice(0, 255) : null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe una categoría con ese nombre.' });
    throw e;
  }
}));

app.get('/api/admin/productos', h(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id_producto, p.nombre, p.descripcion, p.precio::float AS precio, p.imagen, p.estado,
            p.id_categoria, c.nombre AS categoria
       FROM producto p JOIN categoria c ON c.id_categoria = p.id_categoria
      ORDER BY p.id_producto DESC`
  );
  res.json(rows);
}));

app.post('/api/admin/productos', h(async (req, res) => {
  const b = req.body || {};
  const errores = validarProducto(b);
  if (errores.length) return res.status(400).json({ error: errores.join(' ') });
  try {
    const { rows } = await pool.query(
      `INSERT INTO producto (id_categoria, nombre, descripcion, precio, imagen, estado)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_producto`,
      [Number(b.id_categoria), b.nombre.trim(), b.descripcion || null, Number(b.precio), b.imagen || null, b.estado !== false]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23503') return res.status(400).json({ error: 'La categoría no existe.' });
    throw e;
  }
}));

app.put('/api/admin/productos/:id', h(async (req, res) => {
  if (!entero(req.params.id)) return res.status(400).json({ error: 'Producto inválido.' });
  const b = req.body || {};
  const errores = validarProducto(b);
  if (errores.length) return res.status(400).json({ error: errores.join(' ') });
  const { rowCount } = await pool.query(
    `UPDATE producto SET id_categoria = $1, nombre = $2, descripcion = $3, precio = $4, imagen = $5
      WHERE id_producto = $6`,
    [Number(b.id_categoria), b.nombre.trim(), b.descripcion || null, Number(b.precio), b.imagen || null, Number(req.params.id)]
  );
  if (!rowCount) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.json({ ok: true });
}));

// Activar / desactivar (no se elimina para conservar el historial de pedidos)
app.patch('/api/admin/productos/:id/estado', h(async (req, res) => {
  if (!entero(req.params.id) || typeof req.body?.estado !== 'boolean') {
    return res.status(400).json({ error: 'Datos inválidos.' });
  }
  const { rowCount } = await pool.query(
    'UPDATE producto SET estado = $1 WHERE id_producto = $2', [req.body.estado, Number(req.params.id)]
  );
  if (!rowCount) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------
// RF-06 Control de estados de los pedidos (administrador)
// ---------------------------------------------------------------------
app.get('/api/admin/pedidos', h(async (req, res) => {
  const params = [];
  let filtro = '';
  if (req.query.estado) {
    if (!ESTADOS_PEDIDO.includes(req.query.estado)) return res.status(400).json({ error: 'Estado inválido.' });
    params.push(req.query.estado);
    filtro = 'WHERE p.estado = $1';
  }
  const { rows } = await pool.query(
    `SELECT p.id_pedido, p.nombre_cliente, p.direccion_entrega, p.telefono, p.fecha_pedido, p.estado,
            p.total::float AS total,
            COALESCE(json_agg(json_build_object(
              'producto', pr.nombre, 'cantidad', d.cantidad,
              'precio_unitario', d.precio_unitario::float, 'subtotal', d.subtotal::float
            ) ORDER BY d.id_detalle) FILTER (WHERE d.id_detalle IS NOT NULL), '[]') AS detalles
       FROM pedido p
       LEFT JOIN detalle_pedido d ON d.id_pedido = p.id_pedido
       LEFT JOIN producto pr ON pr.id_producto = d.id_producto
       ${filtro}
      GROUP BY p.id_pedido
      ORDER BY p.fecha_pedido DESC`,
    params
  );
  res.json(rows);
}));

app.patch('/api/admin/pedidos/:id/estado', h(async (req, res) => {
  const { estado } = req.body || {};
  if (!entero(req.params.id) || !ESTADOS_PEDIDO.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Valores permitidos: ${ESTADOS_PEDIDO.join(', ')}.` });
  }
  const { rowCount } = await pool.query(
    'UPDATE pedido SET estado = $1 WHERE id_pedido = $2', [estado, Number(req.params.id)]
  );
  if (!rowCount) return res.status(404).json({ error: 'Pedido no encontrado.' });
  res.json({ ok: true });
}));

app.get('/api/admin/resumen', h(async (req, res) => {
  const { rows: [r] } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM producto WHERE estado) AS productos_activos,
       (SELECT COUNT(*)::int FROM pedido WHERE estado = 'Pendiente') AS pendientes,
       (SELECT COUNT(*)::int FROM pedido WHERE estado = 'En Proceso') AS en_proceso,
       (SELECT COUNT(*)::int FROM pedido WHERE estado = 'Completado') AS completados,
       (SELECT COALESCE(SUM(total), 0)::float FROM pedido) AS ventas`
  );
  res.json(r);
}));

// Rutas de API inexistentes
app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));

// Manejador de errores: responde JSON y no expone detalles internos.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

inicializar()
  .then(() => app.listen(PORT, () => console.log(`SGPC escuchando en el puerto ${PORT}`)))
  .catch((e) => {
    console.error('No se pudo inicializar la base de datos:', e.message);
    process.exit(1);
  });
