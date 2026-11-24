# Plan de desarrollo de Súbete · Grupo C

Proyecto final de la Electiva de Desarrollo Web Backend de la Universidad Distrital Francisco José de Caldas. Súbete permite compartir viajes en carro entre estudiantes universitarios. El Grupo A desarrolla Rutas y conductores con MongoDB o Cosmos DB con API de Mongo. El Grupo B desarrolla Pasajeros y reputación con PostgreSQL. El Grupo C desarrolla Reservas con PostgreSQL y es responsable de este repositorio.

El plazo es de siete días. El cronograma conserva todos los requisitos obligatorios y se rige por los [requisitos oficiales](REQUIREMENTS.md) y el [enunciado general](GENERAL_REQUIREMENTS.md).

## Arquitectura y tecnologías

- Monorepo con npm Workspaces, Node.js, TypeScript estricto y Express.
- `apps/reservas-crud` escucha localmente en el puerto `3001`. Es propietario de los datos de Reservas y el único servicio del Grupo C con acceso directo a PostgreSQL. Usa Sequelize como ORM.
- `apps/reservas-mid` escucha localmente en el puerto `3002`. Contiene las reglas de negocio y usa Axios para consumir su CRUD y los servicios de otros grupos a través del API Gateway.
- Zod para validaciones, Jest y Supertest para pruebas y OpenAPI 3.0.3 para contratos.
- Docker, GitHub Actions para CI/CD y despliegue en la nube.
- Se mantienen las tecnologías acordadas, incluido Sequelize. Prisma queda fuera del proyecto.

## Responsabilidades

| Integrante | Responsabilidades |
| --- | --- |
| Nicolás Ortiz | Arquitectura e integración, liderazgo del API Gateway del clúster, seguridad y middleware, cliente HTTP del gateway, gestión de JWT con Client Credentials, coordinación de scopes y credenciales, integración de Open-Meteo y coordinación de contratos OpenAPI. Apoya documentación, pruebas y despliegue. |
| Daniel Gómez | Configuración de PostgreSQL y Sequelize, modelo de reservas, migraciones, CRUD, validaciones, transiciones de estado, filtros y paginación, datos semilla y pruebas del CRUD. |
| Daniel Barrera | Reglas de negocio del MID, reserva de cupos, cancelaciones, cálculo de costos, penalizaciones, prevención de duplicados, concurrencia, compensaciones y pruebas del MID. |

Los tres participan en integración, revisión de pull requests, Docker, CI/CD, despliegue, documentación y sustentación. Cualquier intervención en funcionalidades asignadas a otro integrante requiere autorización previa.

## Reservas CRUD

La tabla `reservas` incluye al menos `id`, `ruta_id`, `pasajero_id`, `cupos`, `abordaje`, `descenso`, `costo`, `estado`, `penalizacion`, `creado_en` y `actualizado_en`. Se requieren diez reservas semilla en distintos estados con IDs de rutas y perfiles coherentes con las semillas de los otros grupos.

| Operación | Requisito |
| --- | --- |
| `GET /reservas` | Listar con filtros `usuarioId`, `rutaId` y `estado`, con paginación. |
| `GET /reservas/{id}` | Consultar una reserva. |
| `POST /reservas` | Crear una reserva en estado `pendiente`, según los requisitos oficiales. |
| `PATCH /reservas/{id}/estado` | Aplicar exclusivamente las transiciones válidas. |
| `DELETE /reservas/{id}` | Eliminar reservas `pendientes`. Responder 409 para otros estados. |

Las transiciones permitidas son `pendiente → confirmada`, `pendiente → cancelada`, `confirmada → completada` y `confirmada → cancelada`. Toda otra transición responde 409.

## Reservas MID

### `POST /reservas/reservar-cupo`

1. Consultar la ruta mediante el gateway. Responder 404 si no existe y 409 `ruta_cerrada` si no está abierta.
2. Consultar la reputación del pasajero. Responder 403 `usuario_bloqueado` si su insignia es `en_observacion`.
3. Validar que el pasajero no tenga una reserva activa para esa ruta. Responder 409 `reserva_duplicada`.
4. Descontar los cupos mediante Rutas. Si faltan cupos, responder 409 `sin_cupos` sin crear la reserva.
5. Calcular el costo con `costo = precioTotal * (distanciaDelTramo / distanciaDelTrazadoCompleto) / cuposTotales * cupos`.
6. Persistir la reserva confirmada mediante el CRUD. Si falla el guardado, compensar devolviendo los cupos descontados.
7. Responder 201 con la reserva y el desglose del costo.

### `POST /reservas/{id}/cancelar`

1. Consultar la reserva. Responder 404 si no existe y 409 si está cancelada o completada.
2. Consultar la hora de salida de la ruta.
3. Si faltan menos de 60 minutos (`CANCELACION_TARDIA_MIN`), aplicar una penalización del 50 % del costo.
4. Cambiar el estado a `cancelada` y devolver los cupos que correspondan.
5. Responder con el estado, la penalización y los cupos liberados.

### Concurrencia y recuperación

- Verificar mediante un script que dos solicitudes simultáneas por el último cupo producen exactamente una respuesta 201 y una 409.
- Impedir reservas activas duplicadas incluso con solicitudes concurrentes.
- Diseñar la recuperación ante fallos parciales de reserva o cancelación. Toda devolución debe corresponder a cupos efectivamente descontados y evitar devoluciones repetidas al recuperar una operación.

## Integración y seguridad

| Consumidor | Proveedor | Operación | Scope |
| --- | --- | --- | --- |
| MID Rutas | Pasajeros y reputación | `GET /perfiles/{id}/puntaje` | `perfiles:leer` |
| MID Reputación | Reservas | `GET /reservas?usuarioId&estado` y `GET /reservas/{id}` | `reservas:leer` |
| MID Reservas | Rutas | `GET /rutas/{id}` | `rutas:leer` |
| MID Reservas | Rutas | `PATCH /rutas/{id}/cupos` | `rutas:escribir` |
| MID Reservas | Pasajeros y reputación | `GET /perfiles/{id}/puntaje` | `perfiles:leer` |

La [sección 4 del enunciado general](GENERAL_REQUIREMENTS.md#4-reglas-de-arquitectura) exige que toda comunicación entre servicios independientes pase por el gateway. Esto incluye las llamadas del MID de Reservas a su propio CRUD. El gateway emite y valida JWT, controla scopes, enruta peticiones y agrega la cabecera secreta interna. Los servicios rechazan solicitudes de negocio sin una cabecera interna válida y mantienen `GET /health` accesible para comprobaciones de disponibilidad.

El formato común de error propuesto es `{ "codigo": "...", "mensaje": "...", "detalle": {} }`. Todas las coordenadas siguen el orden GeoJSON `[longitud, latitud]`.

## Open-Meteo

`GET /reservas/{id}/clima` consulta las condiciones previstas para la salida del viaje. La integración requiere timeout configurable, reintentos limitados, caché, degradación controlada, simulación del proveedor en las pruebas y documentación en el README y OpenAPI. Las operaciones de reserva y cancelación deben seguir disponibles durante fallos del proveedor climático.

## Decisiones pendientes

- Puertos y URLs de los grupos A y B.
- URL y contrato exacto del endpoint de autenticación del gateway.
- IDs de los datos semilla.
- Estructuras definitivas de las respuestas externas.
- Método de cálculo de la distancia entre abordaje y descenso.
- Representación geográfica definitiva de abordaje y descenso.
- Operación autorizada para persistir una reserva confirmada. El requisito oficial indica que `POST /reservas` crea reservas pendientes.
- Mecanismo para persistir la penalización al cancelar.
- Operaciones y scopes necesarios para que el MID de Reservas acceda a su propio CRUD mediante el gateway.
- Disponibilidad del identificador del conductor para validar calificaciones.
- Semántica del delta para reservas de varios cupos. La guía ejemplifica `-1` y `+1`.
- Nombre definitivo de la cabecera secreta del gateway.

Mantener estas decisiones abiertas hasta contar con una definición oficial o con el acuerdo de los equipos involucrados. Revisar los borradores [CRUD](../contracts/reservas-crud.yaml) y [MID](../contracts/reservas-mid.yaml) conforme se resuelvan.

## Cronograma de siete días

| Día | Trabajo previsto |
| --- | --- |
| 1 | Arquitectura, repositorio, contratos y acuerdos de integración. |
| 2 | Seguridad, JWT, cliente HTTP, modelo de datos y operaciones iniciales del CRUD. |
| 3 | Gateway, scopes, CRUD completo, datos semilla y lógica de reserva de cupos. |
| 4 | Open-Meteo, cancelaciones, penalizaciones, compensaciones y pruebas. |
| 5 | Integración de los tres grupos mediante el gateway. |
| 6 | Pruebas de concurrencia, Docker, CI/CD, despliegue y documentación. |
| 7 | Validación de punta a punta, evidencias, correcciones y preparación de la sustentación. |
