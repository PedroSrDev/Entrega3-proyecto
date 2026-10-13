# SGPC – Sistema de Gestión de Pedidos y Catálogo en Línea

Prototipo web del proyecto de Gerencia de Proyectos Informáticos (Politécnico Grancolombiano, 2026).

- **Tienda pública** (`/`): catálogo por categorías, búsqueda, carrito y registro de pedidos (RF-03, RF-04, RF-05).
- **Panel administrativo** (`/admin/`): inicio de sesión, gestión de productos y categorías, y control de estados de los pedidos (RF-01, RF-02, RF-06).
- **Tecnologías:** Node.js 18+, Express, PostgreSQL, HTML/CSS/JavaScript. Contraseñas con bcrypt, sesiones con JWT y consultas parametrizadas (RNF-03).

## Publicar en Render (recomendado)

1. Sube esta carpeta a un repositorio de GitHub (sin `node_modules`).
2. En [render.com](https://render.com) → **New → Blueprint** → elige el repositorio. Render lee `render.yaml` y crea la base de datos PostgreSQL y el servicio web.
3. Cuando lo pida, escribe la contraseña del administrador en `ADMIN_PASSWORD`.
4. Al terminar, abre la URL `https://sgpc-xxxx.onrender.com`. La ruta `/api/salud` debe responder `{"estado":"ok"}`.

Al primer arranque se crean las tablas, el usuario administrador (`admin@sgpc.com`) y un catálogo de ejemplo.

> En el plan gratuito el servicio se suspende tras 15 minutos sin uso; la primera visita después tarda unos 50 segundos en despertar.

## Ejecutar en local

```bash
npm install
# Base de datos PostgreSQL local; por defecto usa postgres://sgpc:sgpc@localhost:5432/sgpc
set DATABASE_URL=postgres://usuario:clave@localhost:5432/sgpc   # Windows (en Linux/Mac: export)
npm start
```

Abrir http://localhost:3000 y http://localhost:3000/admin/

## Variables de entorno

| Variable | Uso | Valor por defecto |
|---|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL | `postgres://sgpc:sgpc@localhost:5432/sgpc` |
| `JWT_SECRET` | Firma de las sesiones | (cambiar en producción) |
| `ADMIN_EMAIL` | Correo del administrador inicial | `admin@sgpc.com` |
| `ADMIN_PASSWORD` | Contraseña del administrador inicial | `Admin123*` |
| `PORT` | Puerto HTTP | `3000` |

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/salud` | Estado del servicio |
| GET | `/api/categorias` | Categorías con productos activos |
| GET | `/api/productos?categoria=id` | Productos activos |
| POST | `/api/pedidos` | Registrar pedido `{cliente:{nombre,direccion,telefono}, items:[{id_producto,cantidad}]}` |
| POST | `/api/auth/login` | Iniciar sesión `{correo, clave}` → token |
| GET/POST | `/api/admin/categorias` | Listar / crear categorías * |
| GET/POST | `/api/admin/productos` | Listar / crear productos * |
| PUT | `/api/admin/productos/:id` | Editar producto * |
| PATCH | `/api/admin/productos/:id/estado` | Activar / desactivar `{estado: true|false}` * |
| GET | `/api/admin/pedidos?estado=` | Listar pedidos con detalle * |
| PATCH | `/api/admin/pedidos/:id/estado` | Cambiar estado `{estado: "Pendiente"|"En Proceso"|"Completado"}` * |
| GET | `/api/admin/resumen` | Indicadores del panel * |

\* Requieren el encabezado `Authorization: Bearer <token>`.
