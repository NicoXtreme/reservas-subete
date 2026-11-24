# Progreso de reservas-subete

## Línea base

La inspección anterior identificó `main` alineada con la referencia local `origin/main`, con el árbol limpio y el último commit `eac501e` (`docs: define OpenAPI contracts for reservations`). Al iniciar la documentación de contexto, Git mostraba `docs/REQUIREMENTS.md` y `docs/GENERAL_REQUIREMENTS.md` como archivos locales sin seguimiento.

## Disponible

- Monorepo con npm Workspaces y dependencias instaladas.
- Aplicaciones Express con TypeScript en `apps/reservas-crud` y `apps/reservas-mid`, cada una con `GET /health` implementado. Los puertos locales por defecto son `3001` y `3002`, respectivamente.
- Scripts npm para desarrollo, compilación y pruebas, archivo `.env.example` y README inicial.
- Borradores OpenAPI 3.0.3 en `contracts/reservas-crud.yaml` y `contracts/reservas-mid.yaml`.
- Contexto de trabajo registrado en [AGENTS.md](../AGENTS.md), el [plan de desarrollo](DEVELOPMENT_PLAN.md) y este registro.
- Middleware de seguridad en ambas aplicaciones. `GET /health` permanece público y las rutas de negocio se registran después del middleware.

## Pendiente de implementación

- Cliente HTTP del gateway y gestión de tokens JWT con Client Credentials.
- Persistencia en PostgreSQL con Sequelize, migraciones, datos semilla y endpoints del CRUD.
- Endpoints de negocio del MID, reglas de reserva y cancelación, concurrencia y recuperación ante fallos parciales.
- Integraciones reales a través del gateway e integración externa con Open-Meteo.
- Pruebas de negocio e integración, Docker, pipeline de CI/CD, despliegue y validación de punta a punta.

La [sección 4 del enunciado general](GENERAL_REQUIREMENTS.md#4-reglas-de-arquitectura) confirma que toda comunicación entre servicios independientes pasa por el gateway, incluidas las llamadas del MID de Reservas a su propio CRUD. Las operaciones y los scopes para ese acceso siguen pendientes de acuerdo.

Las [decisiones de integración pendientes](DEVELOPMENT_PLAN.md#decisiones-pendientes) condicionan la revisión de los contratos. Consultar los [requisitos oficiales](REQUIREMENTS.md) al retomar el desarrollo.

## Siguiente tarea de Nicolás Ortiz

Confirmar con el clúster el nombre definitivo de la cabecera interna. Por ahora se usa `x-gateway-secret` y se lee `GATEWAY_INTERNAL_SECRET` del entorno. El middleware responde 401 si falta la cabecera, 403 si el valor es incorrecto y 503 si se recibió la cabecera pero el secreto del servicio está ausente o en blanco.

## Registro de tareas

| Tarea | Resultado | Verificación |
| --- | --- | --- |
| Crear documentación de contexto | Se añadieron `AGENTS.md`, `docs/DEVELOPMENT_PLAN.md` y `docs/PROGRESS.md`. | Revisión documental. Compilación y pruebas de aplicación sin ejecutar porque el cambio es documental. |
| Implementar el middleware de seguridad | CRUD y MID validan la cabecera interna con `timingSafeEqual` después de verificar la longitud en bytes. Las pruebas usan una ruta registrada solo en Jest. | `npm run build` terminó con código 0 en ambos workspaces. `npm test` terminó con código 0 y aprobó 16 de 16 pruebas con Jest y Supertest, 8 por aplicación. |
