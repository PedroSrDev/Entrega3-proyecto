// Conexión a PostgreSQL e inicialización de la base de datos.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const connectionString = process.env.DATABASE_URL || 'postgres://sgpc:sgpc@localhost:5432/sgpc';

// En la nube (Render, Neon, etc.) la conexión exige SSL; en local no.
const usarSSL = process.env.DB_SSL === 'true' ||
  (!!process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) && process.env.DB_SSL !== 'false');

const pool = new Pool({
  connectionString,
  ssl: usarSSL ? { rejectUnauthorized: false } : false,
  max: 5,
});

// Datos iniciales para que el catálogo no arranque vacío.
const CATEGORIAS = [
  ['Bebidas', 'Jugos, gaseosas, café y agua'],
  ['Panadería', 'Pan fresco, pasteles y galletas'],
  ['Lácteos', 'Leche, yogur y quesos'],
  ['Snacks', 'Pasabocas y dulces'],
];

const PRODUCTOS = [
  ['Bebidas', 'Jugo de mango 500 ml', 'Jugo natural de mango, sin conservantes.', 4500],
  ['Bebidas', 'Café molido 250 g', 'Café colombiano de tueste medio.', 12900],
  ['Bebidas', 'Agua sin gas 600 ml', 'Agua potable en botella.', 2200],
  ['Panadería', 'Pan campesino', 'Pan artesanal horneado cada mañana.', 6000],
  ['Panadería', 'Croissant de mantequilla', 'Croissant hojaldrado individual.', 3800],
  ['Panadería', 'Galletas de avena x6', 'Galletas caseras de avena y canela.', 7500],
  ['Lácteos', 'Yogur griego 150 g', 'Yogur griego natural, alto en proteína.', 3900],
  ['Lácteos', 'Queso campesino 500 g', 'Queso fresco de la región.', 11800],
  ['Snacks', 'Maní salado 100 g', 'Maní tostado con sal.', 3200],
  ['Snacks', 'Chocolatina 40 g', 'Chocolate de leche.', 2500],
];

async function inicializar() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);

  // Usuario administrador inicial (solo si no hay ninguno).
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM usuario');
  if (rows[0].n === 0) {
    const correo = (process.env.ADMIN_EMAIL || 'admin@sgpc.com').trim().toLowerCase();
    const clave = process.env.ADMIN_PASSWORD || 'Admin123*';
    const hash = await bcrypt.hash(clave, 10);
    await pool.query(
      'INSERT INTO usuario (nombre, correo, clave_hash, rol) VALUES ($1, $2, $3, $4)',
      ['Administrador SGPC', correo, hash, 'Administrador']
    );
    console.log(`Administrador inicial creado: ${correo}`);
  }

  // Catálogo de ejemplo (solo si no hay categorías).
  const cats = await pool.query('SELECT COUNT(*)::int AS n FROM categoria');
  if (cats.rows[0].n === 0) {
    const ids = {};
    for (const [nombre, descripcion] of CATEGORIAS) {
      const r = await pool.query(
        'INSERT INTO categoria (nombre, descripcion) VALUES ($1, $2) RETURNING id_categoria',
        [nombre, descripcion]
      );
      ids[nombre] = r.rows[0].id_categoria;
    }
    for (const [cat, nombre, descripcion, precio] of PRODUCTOS) {
      await pool.query(
        'INSERT INTO producto (id_categoria, nombre, descripcion, precio) VALUES ($1, $2, $3, $4)',
        [ids[cat], nombre, descripcion, precio]
      );
    }
    console.log('Catálogo de ejemplo cargado.');
  }
}

module.exports = { pool, inicializar };
