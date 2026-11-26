# Contrato interno CRUD–MID del Grupo C

Referencia para [N19, issue #20](https://github.com/NicoXtreme/reservas-subete/issues/20). Los acuerdos de este documento guían el trabajo de Reservas. La especificación técnica y la coordinación con el clúster siguen abiertas.

## Acordado por el equipo

- `POST /reservas` conserva la creación de pendientes. El MID solicitará la persistencia de una reserva confirmada mediante una operación separada después de descontar cupos y calcular el costo.
- El MID consultará si existe una reserva activa del pasajero en esa ruta antes del descuento. PostgreSQL impedirá que escrituras concurrentes creen dos reservas activas para el mismo par pasajero–ruta.
- El CRUD guardará el estado y la penalización juntos al cancelar. Usará `idOperacion` para evitar escrituras duplicadas en las operaciones internas de confirmación y cancelación.
- Ante un rechazo definitivo del guardado, el MID compensará únicamente los cupos cuyo descuento esté comprobado. Ante un timeout o un resultado ambiguo, primero consultará qué ocurrió. Un `503` o una consulta sin resultado visible, por sí solos, no acreditan que el CRUD descartó la escritura.
- Al cancelar, el MID calcula la penalización y solo devuelve cupos efectivamente descontados. También debe evitar una segunda devolución si se repite la solicitud o se pierde una respuesta.
- N20 implementará un cliente tipado que use el gateway y pruebas con mocks. Todo tráfico MID → CRUD pasa por el gateway. El CRUD es el único servicio del Grupo C que accede a PostgreSQL.

## Estado en `main`

En la base revisada (`fc97f37`), ambos servicios tienen `/health` y middleware de protección. El MID tiene el cliente genérico del gateway. La conexión de persistencia, el modelo, las migraciones y los endpoints de negocio del CRUD aún no están integrados. Tampoco existe el cliente del CRUD propio. Las propuestas de conexión, modelo y migraciones de los PR #67, #68 y #69 quedan fuera de esta referencia mientras sigan sin fusionar.

## Matriz de operaciones

| Operación | Entrada y resultado esperado | Estado de especificación |
| --- | --- | --- |
| Consultar reserva | `GET /reservas/{id}`. Devuelve la reserva o `404` si no existe. | Ruta y respuesta de detalle en el borrador CRUD. |
| Consultar reservas activas | Buscar por pasajero y ruta antes del descuento. El listado existente usa `usuarioId`, `rutaId` y un filtro `estado`. Un fallo de consulta debe distinguirse de una lista vacía. | Acordar los estados activos exactos y cómo consultarlos usando o ampliando el listado. |
| Crear pendiente | `POST /reservas` recibe `CrearReserva` y devuelve una reserva pendiente. | Comportamiento oficial. Precisar el uso del `409` que figura en el borrador si la unicidad afecta las pendientes. |
| Persistir confirmada | Recibe los datos de reserva, el costo calculado por el MID e `idOperacion`. Devuelve la reserva confirmada o un rechazo de negocio. Una repetición de la misma operación no crea otra reserva. | Operación separada acordada. Ruta, método, códigos y respuesta a repeticiones por especificar. |
| Cambiar estado | `PATCH /reservas/{id}/estado` recibe `estado` y respeta las transiciones oficiales. | El borrador no permite guardar la penalización junto al estado. |
| Cancelar con penalización | Recibe la reserva objetivo, la penalización calculada e `idOperacion`. Guarda estado y penalización como un cambio atómico. | Garantía acordada. Forma de la operación, control de concurrencia y respuesta por especificar. |
| Consultar resultado de una escritura | Permite determinar si el CRUD aplicó o rechazó la operación antes de decidir una compensación. | Consulta previa acordada. Mecanismo, correlación y evidencia de rechazo definitivo por especificar. |

## Ejemplos JSON ilustrativos

Estos ejemplos muestran los datos que cruzarían el límite CRUD–MID. Los campos exactos, las rutas, los códigos de respuesta y la representación monetaria siguen sujetos a especificación.

**Solicitud de confirmación**

```json
{
  "idOperacion": "operacion-91",
  "ruta_id": "ruta-42",
  "pasajero_id": "pasajero-17",
  "cupos": 1,
  "abordaje": "Universidad",
  "descenso": "Chapinero",
  "costo": 4000
}
```

**Respuesta de confirmación**

```json
{
  "id": "reserva-91",
  "ruta_id": "ruta-42",
  "pasajero_id": "pasajero-17",
  "cupos": 1,
  "abordaje": "Universidad",
  "descenso": "Chapinero",
  "costo": 4000,
  "estado": "confirmada",
  "penalizacion": 0,
  "creado_en": "2026-11-26T14:00:00Z",
  "actualizado_en": "2026-11-26T14:00:00Z"
}
```

**Solicitud de cancelación para `reserva-91`**

```json
{
  "idOperacion": "operacion-92",
  "penalizacion": 2000
}
```

**Error de duplicado**

```json
{
  "codigo": "reserva_duplicada",
  "mensaje": "El pasajero ya tiene una reserva activa para esta ruta.",
  "detalle": {}
}
```

## Responsabilidades y pruebas

| Responsable | Alcance |
| --- | --- |
| Daniel Gómez | DG10 persiste costo y penalización. DG11 garantiza la unicidad concurrente en PostgreSQL. DG13 implementa las operaciones internas del CRUD, incluida la escritura atómica al cancelar y la protección contra escrituras duplicadas. |
| Daniel Barrera | DB09 orquesta la persistencia confirmada después de descontar cupos. DB10 distingue rechazo definitivo de resultado ambiguo y compensa cuando corresponde. DB14 orquesta la cancelación, la penalización y la devolución de cupos. |
| Nicolás Ortiz | N20 implementa el cliente tipado del CRUD sobre el transporte del gateway. Valida las respuestas y conserva los errores de negocio. Coordina el contrato con los dos responsables. |

Con mocks se podrán cubrir lecturas, errores de negocio, respuestas inválidas, solicitudes repetidas, timeout después de guardar y cancelaciones con una devolución ya aplicada. Las pruebas sobre PostgreSQL deberán verificar la unicidad concurrente y el guardado atómico. Los mocks del CRUD no demuestran que Rutas haya descontado o devuelto cupos.

## Diferencias con los OpenAPI y pendientes

- El borrador CRUD mantiene la creación pendiente y no define una operación para confirmar directamente. Su PATCH de estado solo recibe `estado`. La confirmación separada, el guardado conjunto de la penalización y la consulta del resultado de una escritura aún carecen de especificación OpenAPI. La sección 6.1 enumera `201` y `400` para la creación pendiente, mientras que el borrador también declara `409`. [Requisitos oficiales, §§6.1–6.2](REQUIREMENTS.md#6-grupo-reservas) · [OpenAPI CRUD](../contracts/reservas-crud.yaml)
- El borrador MID describe guardar una confirmada y registrar la penalización, pero deja abierta la operación del CRUD que los soportará. Los dos borradores dejan `detalle` opcional, mientras el cliente genérico requiere ese objeto para preservar el cuerpo de un error de negocio. El ejemplo anterior ilustra su presencia y el formato común definitivo sigue pendiente. [OpenAPI MID](../contracts/reservas-mid.yaml) · [Guía de integración](INTEGRATION_GUIDE.md)
- **Pendientes del Grupo C.** Definir las rutas y métodos internos nuevos, los estados activos exactos, las validaciones y la semántica de `400`, `404`, `409` y `503`. Especificar el ámbito, el esquema y la retención de `idOperacion`, el tratamiento de repeticiones con datos distintos, la consulta del resultado y la recuperación tras reinicios. Acordar precisión, redondeo y serialización de importes.
- **Pendientes de N18.** Confirmar publicación y enrutamiento en el gateway, URL, scopes, credenciales, contrato de tokens, cabecera interna y formato de errores del clúster. Contrastar con Rutas la representación geográfica, el cálculo de distancia y la semántica del descuento y la devolución al reservar varios cupos o recuperar resultados ambiguos. [Enunciado general, §4](GENERAL_REQUIREMENTS.md#4-reglas-de-arquitectura) · [N18, issue #19](https://github.com/NicoXtreme/reservas-subete/issues/19)
