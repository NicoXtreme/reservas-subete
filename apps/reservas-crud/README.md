# reservas-crud

API CRUD de reservas (Express + TypeScript + Sequelize). Valida la cabecera interna del gateway en rutas de negocio.

## Validadores (DG04)

- `src/validators/reserva.validators.ts`: esquemas Zod (`.strict()`) para creación, PATCH de estado, id de ruta y consulta de listado. Exporta `transicionPermitida` (tabla 6.1) sin conectarla a endpoints.
- `src/middlewares/validation.middleware.ts`: `validarCuerpo`, `validarParametros`, `validarConsulta`; datos validados en `res.locals.validated` (no en `req.body`/`req.query`).
- Errores 400: `{ codigo: "solicitud_invalida", mensaje, detalle: { origen, errores: [{ campo, motivo }] } }` con `origen` `body|params|query`, sin eco de valores ni stack. Errores no controlados: 500 `error_interno`.

## Scripts

- `npm run build -w reservas-crud`
- `npm test -w reservas-crud`