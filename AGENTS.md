# Instrucciones para el agente de reservas-subete

Este repositorio pertenece al Grupo C (Reservas) del proyecto final de la Electiva de Desarrollo Web Backend de la Universidad Distrital Francisco José de Caldas. Súbete coordina viajes compartidos en carro entre estudiantes universitarios. El plazo es de siete días y se deben cumplir todos los requisitos obligatorios.

Nicolás Ortiz lidera el Grupo C, coordina el trabajo de Daniel Gómez y Daniel Barrera y representa a Reservas ante los líderes de los otros grupos. Es responsable de la arquitectura, la seguridad y las integraciones de Reservas, incluido el cliente HTTP del gateway, Open-Meteo y la coordinación de los contratos OpenAPI.

## Fuentes de contexto

- [Requisitos del clúster](docs/REQUIREMENTS.md) es la fuente oficial y tiene prioridad sobre los borradores. Consulta también el [enunciado general](docs/GENERAL_REQUIREMENTS.md).
- El [plan de desarrollo](docs/DEVELOPMENT_PLAN.md) reúne el alcance, las responsabilidades, los acuerdos pendientes y el cronograma.
- El [registro de progreso](docs/PROGRESS.md) indica lo que está disponible, lo que falta y la siguiente tarea.
- Los contratos de [CRUD](contracts/reservas-crud.yaml) y [MID](contracts/reservas-mid.yaml) son borradores. Revísalos a medida que se resuelvan las decisiones de integración.

## Límites de trabajo

- Responde en español y conserva la terminología, los nombres técnicos y el estilo de los comentarios del repositorio.
- Inspecciona los archivos antes de modificarlos. Trabaja únicamente dentro del repositorio y preserva el trabajo de los demás integrantes.
- Respeta el reparto del plan. Solicita autorización antes de intervenir en funcionalidades asignadas a otro integrante.
- Mantén el alcance funcional y técnico establecido por el profesor. Evita inventar requisitos, datos semilla o acuerdos entre grupos.
- Usa npm Workspaces, Node.js, TypeScript estricto, Express y las tecnologías acordadas. Sequelize es el ORM del proyecto. No incorpores Prisma ni dependencias innecesarias.
- Solo el CRUD accede directamente a PostgreSQL. El MID aplica las reglas de negocio y consume el CRUD y los servicios de otros grupos a través del gateway.
- El liderazgo y el reparto de la implementación del gateway centralizado están pendientes de acuerdo entre los tres grupos. Mantén su implementación fuera de este repositorio.
- Usa variables de entorno para configuración y credenciales. Mantén los secretos fuera de Git y de los mensajes.
- Ejecuta compilación y pruebas después de cada implementación. Registra los resultados reales y menciona las verificaciones que no se ejecutaron.
- Solicita autorización explícita antes de hacer commits, push, merges, cambios de rama o eliminar archivos.
- Al completar una tarea, actualiza `docs/PROGRESS.md` e informa qué archivos cambiaste, qué pruebas ejecutaste y qué decisiones siguen pendientes.
