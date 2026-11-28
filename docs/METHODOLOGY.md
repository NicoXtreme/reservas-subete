# Scrumban del Grupo C – Reservas

El Grupo C combina la gestión visual del flujo de Kanban con la cadencia de sincronización, revisión y retrospectiva de Scrum. Cada tarea tiene un issue y una tarjeta en GitHub Projects. El tablero muestra quién trabaja en qué, qué necesita revisión y qué depende de otros equipos. [Tablero de Reservas](https://github.com/users/NicoXtreme/projects/1/views/1) · [Sección 8 del enunciado](GENERAL_REQUIREMENTS.md#8-metodología-y-trabajo-en-equipo)

## Equipo y responsabilidades

| Integrante | Responsabilidad |
| --- | --- |
| Nicolás Ortiz (`@NicoXtreme`) | Lidera Reservas y representa al Grupo C ante los demás equipos. Coordina arquitectura, seguridad, integraciones, contratos, Open-Meteo e infraestructura. |
| Daniel Gómez (`@xLufero99`) | Implementa el CRUD, la persistencia en PostgreSQL con Sequelize, las migraciones, los datos semilla y las pruebas del CRUD. |
| Daniel Barrera (`@Slendeff`) | Implementa las reglas de negocio y la orquestación del MID, incluidos costos, cancelaciones, concurrencia, compensaciones y pruebas. |

Los tres participan en las revisiones cruzadas, la integración y la documentación de sus aportes. Las responsabilidades del gateway centralizado se acuerdan entre los grupos del clúster. [Plan de desarrollo](DEVELOPMENT_PLAN.md)

## Tablero y políticas de flujo

| Columna | Cuándo usarla |
| --- | --- |
| **Por hacer** | Trabajo identificado y asignado que todavía no se ha iniciado. |
| **En progreso** | El responsable está trabajando en el entregable. |
| **En revisión** | El entregable está listo para revisión. Si incluye cambios del repositorio, el issue enlaza el PR cuando se abre y registra las verificaciones o aprobaciones pendientes. |
| **Hecho** | Se cumplen los criterios de aceptación y existe evidencia verificable. Si hubo cambios del repositorio, el PR quedó aprobado y fusionado. Un entregable administrativo puede cerrarse con evidencia verificable de la configuración realizada. |

- **WIP.** Máximo dos tareas **En progreso** por integrante, seis para el equipo y tres **En revisión** en total. Son límites manuales. Antes de mover una tarjeta, el equipo comprueba la capacidad y prioriza revisar o desbloquear trabajo activo.
- **Selección.** Ordenar por P0 — crítica, P1 — alta y P2 — normal. Dentro de una prioridad, favorecer el trabajo que desbloquea dependencias o reduce el mayor riesgo. Confirmar responsable, criterios, esfuerzo y capacidad antes de iniciar. Usar la iteración cuando haya un calendario acordado.
- **Bloqueos.** Marcar el campo `Bloqueada` y la etiqueta `blocked` cuando una tarea no pueda avanzar. Registrar la causa, el siguiente paso, quién puede desbloquearla y el issue relacionado. Usar dependencias nativas para prerrequisitos reales y referenciar el acuerdo o issue del clúster si el bloqueo es externo. Actualizar o retirar la marca cuando se resuelva. Las partes que puedan desarrollarse con contratos y mocks pueden avanzar.

## Flujo de trabajo y revisión

1. Vincular el trabajo a un issue real con responsable, dependencias y criterios de aceptación. Confirmar el estado y el WIP en el tablero.
2. Crear una rama por issue a partir de `main` actualizada. Usar el patrón `tipo/numero-descripcion`, por ejemplo `docs/16-scrumban-methodology`. Usar commits con un prefijo descriptivo, como `docs:`, `feat:` o `fix:`, y un asunto que explique el cambio.
3. Hacer commits en la rama del issue y ejecutar las verificaciones locales pertinentes. Abrir un PR hacia `main` y vincular el issue. Usar `Closes #16` cuando el PR resuelva ese issue por completo.
4. Ejecutar CI mediante el PR. Solicitar revisión a otro integrante. Registrar en el PR los resultados, las limitaciones y el alcance probado.
5. Resolver las observaciones y obtener como mínimo una aprobación de otro integrante. La revisión comprueba la calidad, la funcionalidad y los criterios de aceptación, con comentarios o validaciones que se puedan consultar.
6. Fusionar a `main` únicamente cuando se cumplan las verificaciones y las aprobaciones obligatorias. Confirmar el cierre del issue y moverlo a **Hecho** cuando la evidencia esté disponible.

El desarrollo se realiza en ramas por issue y queda prohibido el push directo a `main`. Todos los cambios del repositorio ingresan mediante PR. La configuración técnica de la protección está pendiente en [N16 #17](https://github.com/NicoXtreme/reservas-subete/issues/17). La política aplica desde ahora. Ningún integrante puede eludir las protecciones, incluido el líder.

### Responsables de revisión y fusión

- Nicolás es el revisor principal de los PR de Daniel Gómez y Daniel Barrera por su responsabilidad como líder del Grupo C.
- Los PR de Nicolás necesitan revisión y aprobación de Daniel Gómez o Daniel Barrera.
- Los tres participan activamente en revisiones cruzadas. Está prohibido aprobar un PR propio. Cada PR requiere como mínimo una aprobación de otro integrante.
- Nicolás es el responsable principal de fusionar a `main` después de comprobar el CI, las aprobaciones y las protecciones aplicables. La fusión se realiza de forma explícita.

## Ritmo y registro de reuniones

- Realizar sincronizaciones cortas de 10 a 15 minutos varias veces por semana. Revisar avances, bloqueos, dependencias y capacidad del tablero. [Registro de sincronizaciones](meetings/sync/README.md)
- Al cierre de cada semana, revisar entregables y evidencia frente a los criterios de aceptación. Hacer una retrospectiva para acordar qué mantener y qué mejorar. [Revisiones semanales](meetings/reviews/README.md) · [Retrospectivas semanales](meetings/retrospectives/README.md)
- Usar la [plantilla de acta](meetings/TEMPLATE.md) para reuniones efectivamente realizadas. Registrar participantes reales, acuerdos, responsables y referencias a issues. Conservar resultados y fechas tal como ocurrieron.

## Coordinación con el clúster y evidencias

Coordinar los contratos OpenAPI, las credenciales, los scopes, la cabecera interna y la configuración del gateway en los issues pertinentes del equipo y del clúster. Registrar quién acordó cada decisión y vincular su evidencia. Las actas, los issues y el repositorio pueden identificar variables o entornos, pero las credenciales se intercambian por un canal autorizado y quedan fuera de esos registros. [Guía de integración](INTEGRATION_GUIDE.md)

Cada integrante registra sus aportes con commits y PR propios, evidencia de pruebas pertinentes y revisiones reales a compañeros. Vincular esos artefactos desde el issue y documentar decisiones en las actas cuando correspondan. Los issues N01–N13 registran trabajo anterior al tablero con la etiqueta `retrospective` y enlaces a la evidencia disponible. Las revisiones o aprobaciones solo se atribuyen cuando existe registro verificable. [Issues históricos](https://github.com/NicoXtreme/reservas-subete/issues?q=is%3Aissue+label%3Aretrospective)
