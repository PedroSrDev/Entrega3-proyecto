-- =====================================================================
-- SGPC - Sistema de Gestión de Pedidos y Catálogo en Línea
-- Esquema de base de datos PostgreSQL (según el diccionario de datos)
-- Se puede ejecutar varias veces: solo crea lo que no exista.
-- =====================================================================

CREATE TABLE IF NOT EXISTS usuario (
    id_usuario  SERIAL PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    correo      VARCHAR(150) NOT NULL UNIQUE,
    clave_hash  VARCHAR(255) NOT NULL,          -- hash bcrypt, nunca la clave en texto plano
    rol         VARCHAR(30)  NOT NULL DEFAULT 'Administrador',
    estado      BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS categoria (
    id_categoria SERIAL PRIMARY KEY,
    nombre       VARCHAR(100) NOT NULL UNIQUE,
    descripcion  VARCHAR(255),
    estado       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS producto (
    id_producto  SERIAL PRIMARY KEY,
    id_categoria INTEGER NOT NULL REFERENCES categoria(id_categoria),
    nombre       VARCHAR(150) NOT NULL,
    descripcion  TEXT,
    precio       DECIMAL(12,2) NOT NULL CHECK (precio >= 0),
    imagen       VARCHAR(500),
    estado       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS pedido (
    id_pedido         SERIAL PRIMARY KEY,
    nombre_cliente    VARCHAR(150) NOT NULL,
    direccion_entrega VARCHAR(255) NOT NULL,
    telefono          VARCHAR(30)  NOT NULL,
    fecha_pedido      TIMESTAMP    NOT NULL DEFAULT NOW(),
    estado            VARCHAR(20)  NOT NULL DEFAULT 'Pendiente'
                      CHECK (estado IN ('Pendiente', 'En Proceso', 'Completado')),
    total             DECIMAL(12,2) NOT NULL CHECK (total >= 0)
);

CREATE TABLE IF NOT EXISTS detalle_pedido (
    id_detalle      SERIAL PRIMARY KEY,
    id_pedido       INTEGER NOT NULL REFERENCES pedido(id_pedido) ON DELETE CASCADE,
    id_producto     INTEGER NOT NULL REFERENCES producto(id_producto),
    cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario DECIMAL(12,2) NOT NULL CHECK (precio_unitario >= 0),
    subtotal        DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX IF NOT EXISTS idx_producto_categoria ON producto(id_categoria);
CREATE INDEX IF NOT EXISTS idx_detalle_pedido ON detalle_pedido(id_pedido);
CREATE INDEX IF NOT EXISTS idx_pedido_estado ON pedido(estado);
