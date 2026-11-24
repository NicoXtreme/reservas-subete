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
- Clientes tipados de Rutas y Reputación en el MID. Usan el cliente inyectado del gateway para consultar rutas y puntajes y actualizar cupos. Zod valida los parámetros y las respuestas.
- Implementación del cliente independiente de Open-Meteo completa, con consulta horaria en UTC, caché local acotado y resultado tipado de indisponibilidad. La ficha del proveedor está en el README y el borrador OpenAPI declara la degradación.
- Dockerfiles multietapa para el CRUD y el MID y configuración local de Docker Compose con PostgreSQL 16 y volumen persistente. PostgreSQL queda en una red privada compartida solo con el CRUD.
- Workflow de integración continua para pull requests dirigidos a `main` y ejecuciones manuales. Valida la compilación, las pruebas, los contratos OpenAPI y el stack Docker con credenciales desechables.

## Pendiente de implementación

- Verificación de los clientes de Rutas y Reputación con el gateway real y sus OpenAPI definitivos. El cliente del CRUD propio queda pendiente de acordar con Daniel Gómez.
- Persistencia en PostgreSQL con Sequelize, migraciones, datos semilla y endpoints del CRUD.
- Endpoints de negocio del MID, reglas de reserva y cancelación, concurrencia y recuperación ante fallos parciales.
- Integraciones reales a través del gateway y conexión de `GET /reservas/{id}/clima` con el cliente de Open-Meteo una vez disponibles los accesos a los CRUD de Reservas y Rutas.
- Pruebas de negocio e integración, primera ejecución de CI en GitHub Actions, protección de `main`, pipeline de despliegue y validación de punta a punta.

La [sección 4 del enunciado general](GENERAL_REQUIREMENTS.md#4-reglas-de-arquitectura) confirma que toda comunicación entre servicios independientes pasa por el gateway, incluidas las llamadas del MID de Reservas a su propio CRUD. Las operaciones y los scopes para ese acceso siguen pendientes de acuerdo.

Las [decisiones de integración pendientes](DEVELOPMENT_PLAN.md#decisiones-pendientes) condicionan la revisión de los contratos. Consultar los [requisitos oficiales](REQUIREMENTS.md) al retomar el desarrollo.

Los esquemas iniciales de Rutas y Reputación se basan en las secciones 4.1 y 5.2 de los requisitos oficiales. El cliente acepta `delta: -1` y `delta: 1` y espera provisionalmente `cuposDisponibles` y `estado` en la respuesta de PATCH. Está pendiente contrastar esa respuesta, los demás esquemas y el manejo de varios cupos con los OpenAPI definitivos de los grupos A y B.

## Siguiente tarea de Nicolás Ortiz

Como líder del Grupo C, Nicolás coordina a Daniel Gómez y Daniel Barrera, representa a Reservas ante los líderes de los otros grupos y está a cargo de la arquitectura, la seguridad, el cliente HTTP del gateway, Open-Meteo, los contratos OpenAPI y la coordinación de integraciones de Reservas.

Los tres grupos tienen pendiente acordar quién liderará el gateway centralizado y cómo se distribuirá su implementación. El gateway se implementará fuera de `reservas-subete`.

Nicolás debe confirmar con el clúster la URL y el contrato del endpoint de tokens, además del nombre definitivo de la cabecera interna. El cliente usa provisionalmente `POST /token` con cuerpo de formulario y respuesta `access_token` y `expires_in` en segundos. La ruta y el formato de envío se configuran por entorno. La fábrica admite un contrato alternativo para adaptar el envío y la lectura de la respuesta.

El cliente del gateway envía credenciales solo al endpoint de tokens y usa Bearer para las operaciones del gateway. Admite rutas con raíz en el origen configurado y desactiva redirecciones y proxies de entorno. La cabecera interna `x-gateway-secret` corresponde al tráfico del gateway hacia los servicios. El cliente de Open-Meteo consulta directamente al proveedor externo sin credenciales del clúster.

## Registro de tareas

| Tarea | Resultado | Verificación |
| --- | --- | --- |
| Crear documentación de contexto | Se añadieron `AGENTS.md`, `docs/DEVELOPMENT_PLAN.md` y `docs/PROGRESS.md`. | Revisión documental. Compilación y pruebas de aplicación sin ejecutar porque el cambio es documental. |
| Implementar el middleware de seguridad | CRUD y MID validan la cabecera interna con `timingSafeEqual` después de verificar la longitud en bytes. Las pruebas usan una ruta registrada solo en Jest. | `npm run build` terminó con código 0 en ambos workspaces. `npm test` terminó con código 0 y aprobó 16 de 16 pruebas con Jest y Supertest, 8 por aplicación. |
| Implementar el cliente HTTP y la gestión de tokens | Solo las lecturas seguras pueden repetirse tras un 401 o un 503. Ante un 401, las lecturas que usaron el mismo token comparten la renovación y cada una se repite como máximo una vez. Ante un 503, el máximo se configura con `GATEWAY_READ_RETRIES`. Las escrituras se envían una sola vez. El error `409 sin_cupos` conserva estado, código, mensaje y detalle cuando el cuerpo es seguro. | `npm run build` terminó correctamente en ambos workspaces. `npm test` aprobó 56 de 56 pruebas, incluidas 40 del cliente con un gateway HTTP simulado. |
| Implementar el cliente de Open-Meteo | Selecciona la hora UTC que contiene la salida, verifica el horizonte de 16 días y valida las series y unidades del proveedor. Implementa plazos por intento y para la consulta completa, reintentos transitorios y caché por instancia con deduplicación concurrente. El endpoint de clima queda pendiente. | `npm run build` compiló ambos workspaces. `npm test` aprobó 100 de 100 pruebas, incluidas 44 de clima con un proveedor HTTP simulado. |
| Corregir la organización del proyecto | Nicolás lidera el Grupo C. La designación del líder del gateway centralizado y el reparto de su implementación siguen pendientes entre los tres grupos. | Revisión documental y `git diff --check`. |
| Implementar los clientes de Rutas y Reputación | Los clientes codifican los identificadores, usan exclusivamente el gateway y preservan sus errores, incluido `409 sin_cupos`. Una respuesta exitosa incompatible se reporta como 502. PATCH se envía una sola vez, incluso si la respuesta no se puede interpretar. | `npm run build` compiló ambos workspaces. `npm test` aprobó 156 de 156 pruebas, incluidas 56 nuevas con el transporte del gateway simulado. |
| Preparar la infraestructura Docker | Imágenes de Node.js 22 y Compose con redes separadas para las APIs y PostgreSQL. El CRUD espera el healthcheck de PostgreSQL. La integración de la aplicación con la base, las migraciones y los seeders siguen pendientes. | `npm run build` compiló ambos workspaces, `npm test` aprobó 156 de 156 pruebas, `git diff --check` terminó sin errores y `docker compose config --quiet` validó Compose. El motor Linux de Docker Desktop no estaba accesible. Quedan pendientes la construcción de imágenes y las comprobaciones con contenedores en ejecución. |
| Verificar la infraestructura Docker en ejecución | Se construyeron ambas imágenes y se arrancó un proyecto de prueba aislado con credenciales locales. Se añadió `init: true` a las dos APIs tras observar una salida 137 al detenerlas. En la repetición ambas terminaron por SIGTERM (143), PostgreSQL salió con 0 y el volumen se conservó. | Docker Engine 28.5.1. Compose válido, 3 de 3 contenedores sanos, ambos `GET /health` con 200 y ambos `GET /reservas` sin cabecera con 401. Las APIs ejecutaron Node con UID efectivo 1000. PostgreSQL 16.11 aceptó conexiones según `pg_isready`. El puerto interno fue alcanzable desde el CRUD y quedó bloqueado desde el MID, sin publicación al host. Los logs no mostraron fallos de arranque. `npm run build`, 156 de 156 pruebas con `npm test` y `git diff --check` completados. |
| Preparar la integración continua | Se añadieron dos jobs secuenciales para compilar y probar el monorepo, validar OpenAPI, construir las imágenes y probar el stack. Se acordó omitir el disparador `push` conforme al enunciado general. GitHub Actions y la protección de rama se verificarán después de publicar el workflow. | Compilación local correcta, 156 de 156 pruebas aprobadas, `git diff --check` y actionlint 1.7.12 sin errores. Redocly validó ambos contratos con 10 advertencias de `localhost` y `operationId`. Al reproducir localmente el job de Docker, los tres contenedores quedaron sanos, ambas APIs dieron 200 en `/health` y 401 sin cabecera interna, y se eliminaron los contenedores y volúmenes del proyecto temporal. |

La validación de Docker comprueba el arranque y la conectividad de red. La conexión efectiva del CRUD con la base de datos, las migraciones y los seeders siguen pendientes. Durante la construcción, `npm ci` informó vulnerabilidades en las dependencias de producción ya fijadas en el lockfile (3 en CRUD y 1 en MID). El lockfile se conservó.

La revisión final con `npm audit --omit=dev` reportó tres entradas únicas, dos moderadas y una alta. Quedan pendientes en una tarea independiente:

- `zod@3.25.76` es directa en ambas aplicaciones. El aviso de severidad alta afecta la disponibilidad durante la validación de colecciones. El MID valida colecciones recibidas del gateway y de Open-Meteo. La primera versión corregida es 4.6.6, fuera del rango 3.x actual. [Aviso de Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- `sequelize@6.37.8` es directa en el CRUD y `uuid@8.3.2` es su dependencia transitiva. Ambas entradas son moderadas y corresponden al mismo aviso de integridad en `uuid`. Las versiones compatibles consultadas de Sequelize conservan `uuid@^8.3.2`, y la corrección aplicable más cercana es `uuid@11.1.1`. El CRUD actual todavía carece de persistencia, así que la exposición debe evaluarse al integrarla. [Aviso de uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq)

La auditoría se ejecutó en modo de consulta. Los manifiestos y el lockfile se conservaron.
