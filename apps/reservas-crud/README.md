# reservas-crud

API CRUD de reservas (Express + TypeScript + Sequelize). Valida la cabecera interna del gateway en rutas de negocio.

## Validadores (DG04)

- `src/validators/reserva.validators.ts`: esquemas Zod (`.strict()`) para creación, PATCH de estado, id de ruta y consulta de listado. Exporta `transicionPermitida` (tabla 6.1) sin conectarla a endpoints.
- `src/middlewares/validation.middleware.ts`: `validarCuerpo`, `validarParametros`, `validarConsulta`; datos validados en `res.locals.validated` (no en `req.body`/`req.query`).
- Errores 400: `{ codigo: "solicitud_invalida", mensaje, detalle: { origen, errores: [{ campo, motivo }] } }` con `origen` `body|params|query`, sin eco de valores ni stack. Errores no controlados: 500 `error_interno`.

## Listado de reservas (DG05)

- `GET /reservas` pasa por `gatewayMiddleware`, valida la consulta con `validarConsulta(listarReservasQuerySchema)` y lee solo `res.locals.validated.query`.
- Filtros opcionales: `usuarioId` → `pasajero_id`, `rutaId` → `ruta_id` y `estado` con igualdad exacta. Defaults: `page=1`, `limit=10`; `offset = (page - 1) * limit`.
- Respuesta 200: `{ data, pagination: { page, limit, total, totalPages } }`. El contrato no define orden ni cabeceras; se usa `creado_en DESC, id ASC` como desempate.
- El serializador usa `get({ plain: true })`, expone propiedades snake_case, convierte fechas `Date` a ISO y deja `costo`/`penalizacion` como `number`.
- `usuarioId` es opcional en el contrato; los consumidores del CRUD (el MID) deben enviarlo siempre para consultar las reservas de un pasajero.
- No hay índices en `pasajero_id`, `ruta_id` ni `estado`; crearlos queda como tarea aparte.

## Scripts

- `npm run build -w reservas-crud`
- `npm test -w reservas-crud`