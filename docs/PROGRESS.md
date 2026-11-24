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
- Cliente HTTP genérico del gateway en el MID. Solicita tokens con Client Credentials, reutiliza el token en memoria hasta poco antes de su vencimiento y comparte la renovación entre solicitudes concurrentes.
- Implementación del cliente independiente de Open-Meteo completa, con consulta horaria en UTC, caché local acotado y resultado tipado de indisponibilidad. La ficha del proveedor está en el README y el borrador OpenAPI declara la degradación.

## Pendiente de implementación

- Integración del cliente con el gateway real y con las operaciones específicas de Rutas, Reputación y Reservas CRUD.
- Persistencia en PostgreSQL con Sequelize, migraciones, datos semilla y endpoints del CRUD.
- Endpoints de negocio del MID, reglas de reserva y cancelación, concurrencia y recuperación ante fallos parciales.
- Integraciones reales a través del gateway y conexión de `GET /reservas/{id}/clima` con el cliente de Open-Meteo una vez disponibles los accesos a los CRUD de Reservas y Rutas.
- Pruebas de negocio e integración, Docker, pipeline de CI/CD, despliegue y validación de punta a punta.

La [sección 4 del enunciado general](GENERAL_REQUIREMENTS.md#4-reglas-de-arquitectura) confirma que toda comunicación entre servicios independientes pasa por el gateway, incluidas las llamadas del MID de Reservas a su propio CRUD. Las operaciones y los scopes para ese acceso siguen pendientes de acuerdo.

Las [decisiones de integración pendientes](DEVELOPMENT_PLAN.md#decisiones-pendientes) condicionan la revisión de los contratos. Consultar los [requisitos oficiales](REQUIREMENTS.md) al retomar el desarrollo.

## Siguiente tarea de Nicolás Ortiz

Confirmar con el clúster la URL y el contrato del endpoint de tokens, además del nombre definitivo de la cabecera interna. El cliente usa provisionalmente `POST /token` con cuerpo de formulario y respuesta `access_token` y `expires_in` en segundos. La ruta y el formato de envío se configuran por entorno. La fábrica admite un contrato alternativo para adaptar el envío y la lectura de la respuesta.

El cliente del gateway envía credenciales solo al endpoint de tokens y usa Bearer para las operaciones del gateway. Admite rutas con raíz en el origen configurado y desactiva redirecciones y proxies de entorno. La cabecera interna `x-gateway-secret` corresponde al tráfico del gateway hacia los servicios. El cliente de Open-Meteo consulta directamente al proveedor externo sin credenciales del clúster.

## Registro de tareas

| Tarea | Resultado | Verificación |
| --- | --- | --- |
| Crear documentación de contexto | Se añadieron `AGENTS.md`, `docs/DEVELOPMENT_PLAN.md` y `docs/PROGRESS.md`. | Revisión documental. Compilación y pruebas de aplicación sin ejecutar porque el cambio es documental. |
| Implementar el middleware de seguridad | CRUD y MID validan la cabecera interna con `timingSafeEqual` después de verificar la longitud en bytes. Las pruebas usan una ruta registrada solo en Jest. | `npm run build` terminó con código 0 en ambos workspaces. `npm test` terminó con código 0 y aprobó 16 de 16 pruebas con Jest y Supertest, 8 por aplicación. |
| Implementar el cliente HTTP y la gestión de tokens | Solo las lecturas seguras pueden repetirse tras un 401 o un 503. Ante un 401, las lecturas que usaron el mismo token comparten la renovación y cada una se repite como máximo una vez. Ante un 503, el máximo se configura con `GATEWAY_READ_RETRIES`. Las escrituras se envían una sola vez. El error `409 sin_cupos` conserva estado, código, mensaje y detalle cuando el cuerpo es seguro. | `npm run build` terminó correctamente en ambos workspaces. `npm test` aprobó 56 de 56 pruebas, incluidas 40 del cliente con un gateway HTTP simulado. |
| Implementar el cliente de Open-Meteo | Selecciona la hora UTC que contiene la salida, verifica el horizonte de 16 días y valida las series y unidades del proveedor. Implementa plazos por intento y para la consulta completa, reintentos transitorios y caché por instancia con deduplicación concurrente. El endpoint de clima queda pendiente. | `npm run build` compiló ambos workspaces. `npm test` aprobó 100 de 100 pruebas, incluidas 44 de clima con un proveedor HTTP simulado. |
