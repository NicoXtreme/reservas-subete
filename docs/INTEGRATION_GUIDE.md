# Guía de integración del Grupo C

Los ejemplos de TypeScript usan imports relativos a `apps/reservas-mid/src/`. Las fábricas que terminan en `FromEnv` leen `process.env` por defecto. Carga la configuración antes de llamarlas, como hacen los puntos de entrada con `dotenv`.

## Requisitos confirmados y acuerdos provisionales

| Confirmado por el enunciado | Implementación o acuerdo pendiente |
| --- | --- |
| Toda comunicación interna entre servicios independientes pasa por el gateway, incluido el acceso del MID a su propio CRUD. El gateway emite y valida tokens, controla los scopes y agrega la cabecera interna. Los servicios protegen las rutas de negocio y mantienen `GET /health` accesible. | Confirmar el origen del gateway, el contrato de tokens y el nombre definitivo de la cabecera. El liderazgo y el reparto de la implementación del gateway corresponden a un acuerdo del clúster. |
| El MID consume `GET /rutas/{id}` con `rutas:leer` y `PATCH /rutas/{id}/cupos` con `rutas:escribir`, ambos del CRUD de Rutas. Consume `GET /perfiles/{id}/puntaje` del MID de Reputación con `perfiles:leer`. GeoJSON usa longitud, latitud. | Los esquemas locales siguen las secciones 4.1 y 5.2. Se deben contrastar con los OpenAPI definitivos de Rutas y Reputación, especialmente la respuesta de PATCH y la semántica de varios cupos. |
| El MID consume una API de terceros con timeout, reintentos limitados, caché y degradación declarada. | El Grupo C eligió Open-Meteo y lo consulta directamente. El cliente está disponible. La integración de `GET /reservas/{id}/clima` queda pendiente. |

La guía toma como referencia el [enunciado general](GENERAL_REQUIREMENTS.md), los [requisitos de Súbete](REQUIREMENTS.md) y el [plan de desarrollo](DEVELOPMENT_PLAN.md).

## Middleware de seguridad

El middleware está en `src/middlewares/gateway.middleware.ts` de [reservas-crud](../apps/reservas-crud/src/middlewares/gateway.middleware.ts) y [reservas-mid](../apps/reservas-mid/src/middlewares/gateway.middleware.ts). Ambos archivos exportan `gatewayMiddleware: RequestHandler`, que recibe `req`, `res` y `next` de Express. Lee `GATEWAY_INTERNAL_SECRET` en cada solicitud y compara la cabecera provisional `x-gateway-secret` en UTF-8 con `timingSafeEqual` después de comprobar la longitud. Una coincidencia llama a `next()`.

| Condición, en orden de evaluación | Resultado |
| --- | --- |
| Cabecera ausente | 401, `cabecera_gateway_ausente` |
| Cabecera presente y secreto del servidor ausente o en blanco | 503, `servicio_no_disponible` |
| Cabecera presente con longitud o valor incorrectos | 403, `cabecera_gateway_invalida` |

Las respuestas de error tienen `codigo`, `mensaje` y `detalle: {}`. La cabecera se usa en las llamadas del gateway hacia Reservas. El middleware no registra el secreto. Ambas aplicaciones ya lo montan entre `GET /health` y el procesamiento de JSON. Las futuras rutas protegidas se registran después de ese punto. El middleware es síncrono y no usa caché ni reintentos.

```ts
import express from "express";
import { gatewayMiddleware } from "./middlewares/gateway.middleware";

const app = express();
app.get("/health", (_req, res) => {
  res.status(200).json({ service: "reservas-mid", status: "OK" });
});
app.use(gatewayMiddleware);
app.use(express.json());
```

## Cliente HTTP del gateway

[gateway.client.ts](../apps/reservas-mid/src/clients/gateway.client.ts) centraliza las solicitudes salientes al gateway y obtiene tokens mediante Client Credentials.

| Exportación | Firma o propiedades |
| --- | --- |
| `createGatewayClient` | `createGatewayClient(options: GatewayOptions)` devuelve un objeto con `request`. |
| `createGatewayClientFromEnv` | `createGatewayClientFromEnv(env: NodeJS.ProcessEnv = process.env)` devuelve el mismo tipo de cliente. |
| `GatewayError` | Clase con `status: number`, `stage: "token" \| "request"`, `codigo?: string`, `mensaje?: string` y `detalle?: Record<string, unknown>`. |

El método devuelto tiene la firma `request<T = unknown>(request: GatewayRequest): Promise<T>`. Recibe `method` (`GET`, `HEAD`, `OPTIONS`, `POST`, `PUT`, `PATCH` o `DELETE`), `path: string`, `params?: Record<string, string \| number \| boolean>` y `data?: unknown`. Devuelve el cuerpo de Axios. El parámetro genérico expresa el tipo esperado y la validación en tiempo de ejecución queda en los clientes específicos.

`GatewayOptions` y `GatewayRequest` son tipos internos. Las opciones de la fábrica son `url`, `tokenPath`, `clientId` y `clientSecret` de tipo `string`, `timeoutMs` y `readRetries` de tipo `number`, y un `tokenContract` opcional. Este último permite configurar `encode(clientId: string, clientSecret: string): { body: string; contentType: string }` y `decode(body: unknown): { accessToken: string; expiresInSeconds: number }`. La solicitud de tokens se hace por POST.

| Variable | Uso y valor inicial |
| --- | --- |
| `GATEWAY_URL` | Obligatoria. Origen HTTP(S) sin ruta base, consulta, fragmento ni credenciales. |
| `GATEWAY_CLIENT_ID`, `GATEWAY_CLIENT_SECRET` | Obligatorios. Identidad y secreto Client Credentials. |
| `GATEWAY_TOKEN_PATH` | Ruta provisional, `/token` por defecto. |
| `GATEWAY_TOKEN_FORMAT` | `form` por defecto o `json`. Ambas opciones envían `grant_type`, `client_id` y `client_secret` y esperan `access_token` y `expires_in` en segundos. |
| `GATEWAY_TIMEOUT_MS` | 3000 ms por defecto, por intento. Admite enteros de 1 a 2147483647. |
| `GATEWAY_READ_RETRIES` | 1 por defecto. Máximo configurable de 0 a 3 reintentos adicionales por 503 para lecturas seguras. |

Las operaciones usan `Authorization: Bearer`. El cliente solo acepta rutas con raíz en el origen configurado, desactiva las redirecciones y los proxies de entorno, y omite `GATEWAY_INTERNAL_SECRET` de sus solicitudes. La ruta y el cuerpo del token son provisionales hasta cerrar el contrato con el clúster.

Cada instancia guarda solo el token en memoria. Las primeras solicitudes concurrentes comparten su obtención. El vencimiento efectivo se adelanta el menor valor entre 5 segundos y el 10 % de la vigencia. Un 401 invalida el token en caché si coincide con el que falló. Solo `GET`, `HEAD` y `OPTIONS` pueden renovar y repetir una vez ante 401 y reintentar por 503. Las lecturas concurrentes que reciben 401 para el mismo token comparten la renovación. Las escrituras se envían una sola vez. El POST de autenticación tampoco se repite automáticamente. El timeout se aplica por intento y el cliente carece de un plazo global para toda la secuencia.

Los errores de configuración o rutas inválidas generan un `Error`. Las respuestas HTTP de error conservan su estado en `GatewayError`. Los fallos de transporte, el timeout y las redirecciones bloqueadas se traducen a 503. Un fallo al obtener o interpretar el token tiene etapa `token`. Para un error de operación 4xx distinto de 401 y 403, `codigo`, `mensaje` y `detalle` solo se conservan si el cuerpo cumple el esquema y pasa los filtros de tamaño y contenido sensible. Usa `error.mensaje` para el mensaje de negocio y `error.message` para el mensaje genérico.

### Compartir una instancia

Crea el gateway una vez por configuración del MID e inyéctalo en los clientes específicos. Ambos usan el mismo almacén de tokens por medio de `GatewayTransport`, exportado por [gateway-resource.ts](../apps/reservas-mid/src/clients/gateway-resource.ts). Crear instancias separadas crea cachés y renovaciones independientes.

```ts
import { createGatewayClientFromEnv } from "./clients/gateway.client";
import { resourceId } from "./clients/gateway-resource";
import { createRutasClient } from "./clients/rutas.client";
import { createReputacionClient } from "./clients/reputacion.client";

const gateway = createGatewayClientFromEnv();
const rutas = createRutasClient(gateway);
const reputacion = createReputacionClient(gateway);

export async function consultarDatos(rutaId: string, perfilId: string) {
  const [ruta, puntaje] = await Promise.all([
    rutas.obtenerRuta(rutaId),
    reputacion.obtenerPuntaje(perfilId)
  ]);
  return { ruta, puntaje };
}

export function solicitarDetalleCrudo(rutaId: string) {
  const id = encodeURIComponent(resourceId.parse(rutaId));
  return gateway.request({ method: "GET", path: `/rutas/${id}` });
}
```

## Cliente de Rutas

[rutas.client.ts](../apps/reservas-mid/src/clients/rutas.client.ts) exporta `createRutasClient(gateway: GatewayTransport)` y los tipos `Ruta` y `ActualizacionCupos`. Usa las variables de la instancia del gateway que reciba.

| Método | Parámetros y resultado |
| --- | --- |
| `obtenerRuta(rutaId: string): Promise<Ruta>` | `GET /rutas/{id}`. `Ruta` contiene `id`, `conductorId` y `salida` como cadenas, `origen` y `destino` con `nombre` y un GeoJSON `Point` en `punto`, `trazado` como GeoJSON `LineString`, `cuposTotales`, `cuposDisponibles` y `precioTotal` numéricos, y `estado` igual a `abierta`, `llena` o `cerrada`. |
| `actualizarCupos(rutaId: string, delta: number): Promise<ActualizacionCupos>` | `PATCH /rutas/{id}/cupos` con cuerpo `{ delta }`. Solo admite `-1` y `1`. La respuesta validada expone `cuposDisponibles: number` y `estado` con los mismos valores que `Ruta`. |

Los dos métodos validan y codifican el identificador. La geometría usa pares `[longitud, latitud]` y el trazado requiere al menos dos coordenadas. `salida` conserva la cadena ISO original con zona explícita. Los parámetros inválidos producen `ZodError` antes de llamar al gateway. Los errores del gateway se propagan, incluido `404` y `409 sin_cupos`. Una respuesta exitosa incompatible se convierte en `GatewayError` 502 con `codigo: "respuesta_dependencia_incompatible"`. El cliente no tiene caché propio y delega las políticas de lectura al gateway. PATCH no se reenvía si la respuesta es incompatible. En ese caso, el 502 por sí solo no determina si el servicio aplicó la escritura.

La forma de la respuesta de PATCH y los deltas para varios cupos siguen pendientes de confirmación con el Grupo A. La firma acepta `number` y la validación limita el valor en tiempo de ejecución.

```ts
import { createGatewayClientFromEnv, GatewayError } from "./clients/gateway.client";
import { createRutasClient } from "./clients/rutas.client";

const rutas = createRutasClient(createGatewayClientFromEnv());

export async function consultarRuta(rutaId: string) {
  return rutas.obtenerRuta(rutaId);
}

export async function descontarUnCupo(rutaId: string) {
  return rutas.actualizarCupos(rutaId, -1);
}

export function identificarError(error: unknown) {
  if (!(error instanceof GatewayError)) return undefined;
  if (error.stage === "token") return "autenticación con el gateway";
  if (error.status === 404) return "recurso no encontrado";
  if (error.status === 409 && error.codigo === "sin_cupos") return "sin cupos disponibles";
  if (error.status === 502 && error.codigo === "respuesta_dependencia_incompatible") {
    return "respuesta incompatible con el esquema del cliente";
  }
  if (error.status === 502) return "HTTP 502 recibido del gateway";
  if (error.status === 503) return "servicio no disponible";
  return undefined;
}
```

## Cliente de Reputación

[reputacion.client.ts](../apps/reservas-mid/src/clients/reputacion.client.ts) exporta `createReputacionClient(gateway: GatewayTransport)` y el tipo `PuntajeReputacion`. Usa las variables de la instancia de gateway inyectada y carece de configuración propia.

`obtenerPuntaje(perfilId: string): Promise<PuntajeReputacion>` llama a `GET /perfiles/{id}/puntaje`. El resultado contiene `puntaje: number` entre 0 y 5, `insignia` igual a `nuevo`, `confiable`, `en_observacion` o `regular`, `viajesCompletados: number` y `totalCalificaciones: number` como enteros no negativos, y `tasaCancelacion: number` entre 0 y 1. El identificador se valida y codifica antes de llamar al gateway.

Un identificador inválido produce `ZodError`. Los errores de gateway como 404 y 503 se propagan. Un resultado incompatible produce el 502 controlado descrito en Rutas. Este cliente carece de caché propio y delega los reintentos al transporte. Se debe contrastar el esquema local con el OpenAPI definitivo del Grupo B.

```ts
import { createGatewayClientFromEnv } from "./clients/gateway.client";
import { createReputacionClient } from "./clients/reputacion.client";

const reputacion = createReputacionClient(createGatewayClientFromEnv());

export async function consultarInsignia(perfilId: string) {
  const puntaje = await reputacion.obtenerPuntaje(perfilId);
  const enObservacion = puntaje.insignia === "en_observacion";
  return { puntaje, enObservacion };
}
```

La comparación identifica la insignia recibida. La decisión de bloquear al pasajero corresponde a la lógica de negocio del MID.

## Cliente de Open-Meteo

[open-meteo.client.ts](../apps/reservas-mid/src/clients/open-meteo.client.ts) exporta `createOpenMeteoClient(options = {})`, `createOpenMeteoClientFromEnv(env: NodeJS.ProcessEnv = process.env)` y el tipo `OpenMeteoForecast`. La primera fábrica recibe opciones opcionales `baseUrl: string`, `timeoutMs: number`, `maxRetries: number`, `cacheTtlSeconds: number` y `cacheMaxEntries: number`. Ambas devuelven un cliente con el método `forecast(input): Promise<OpenMeteoForecast>`. El parámetro tiene la forma `{ longitud: number; latitud: number; salida: string }`.

| Variable | Valor inicial y límite |
| --- | --- |
| `OPEN_METEO_BASE_URL` | `https://api.open-meteo.com`, origen HTTP(S) sin credenciales, ruta base, consulta ni fragmento. |
| `OPEN_METEO_TIMEOUT_MS` | 3000 ms por intento. Rango 1 a 10000. |
| `OPEN_METEO_MAX_RETRIES` | 1 reintento adicional. Rango 0 a 2. |
| `OPEN_METEO_CACHE_TTL_SECONDS` | 900 segundos. Rango 1 a 3600. |
| `OPEN_METEO_CACHE_MAX_ENTRIES` | 500 entradas. Rango 1 a 5000. |

Las variables numéricas del entorno deben contener dígitos. El cliente valida longitud y latitud y exige una fecha ISO con zona explícita. Consulta `GET /v1/forecast` directamente y sin credenciales del gateway. Selecciona la marca horaria UTC que contiene `salida`, con un horizonte máximo de 16 días desde el inicio del día UTC actual.

| Resultado | Campos del tipo |
| --- | --- |
| `disponible: true` | `temperatura` en °C, `probabilidadPrecipitacion` porcentual, `codigoMeteorologico` numérico, `condicion` y `fechaHoraPronostico` ISO en UTC. El tipo admite `mensaje?: string`. |
| `disponible: false` | `motivo`: `fuera_de_horizonte`, `sin_datos`, `respuesta_invalida`, `timeout` o `proveedor_no_disponible`. Incluye `mensaje: string`. |

Una entrada inválida se rechaza con `ZodError`. La fábrica también valida la configuración al inicializarse. Los fallos del proveedor se representan como resultados de indisponibilidad. El plazo total es `timeoutMs * (maxRetries + 1)`. Se reintentan timeouts, errores de red transitorios contemplados en el cliente y HTTP 408, 500, 502, 503 y 504. El caché guarda solo resultados disponibles por coordenadas y hora UTC, aplica TTL y límite de entradas, desaloja la menos recientemente usada y agrupa consultas simultáneas de la misma clave. El caché es local a la instancia.

```ts
import { createOpenMeteoClientFromEnv } from "./clients/open-meteo.client";
import type { Ruta } from "./clients/rutas.client";

const clima = createOpenMeteoClientFromEnv();

export async function consultarPronosticoEnOrigen(ruta: Ruta) {
  const [longitud, latitud] = ruta.origen.punto.coordinates;
  const resultado = await clima.forecast({ longitud, latitud, salida: ruta.salida });
  if (!resultado.disponible) return resultado.motivo;
  return resultado.fechaHoraPronostico;
}
```

El ejemplo ilustra la consulta para el origen de una ruta. Falta conectar el endpoint de clima con los datos de Reservas y Rutas y confirmar las operaciones de acceso. El borrador del MID prevé HTTP 200 para `disponible: false`. El cliente devuelve datos y la futura capa HTTP construirá la respuesta del endpoint. [Contrato MID](../contracts/reservas-mid.yaml)

## Coordinación pendiente con Daniel Gómez

El MID accederá al CRUD propio mediante el gateway. El borrador del CRUD y las reglas oficiales permiten identificar las necesidades, pero hacen falta acuerdos sobre las operaciones autorizadas, sus contratos y los scopes antes de crear el cliente interno. [Borrador del CRUD](../contracts/reservas-crud.yaml) · [Requisitos de Reservas](REQUIREMENTS.md#6-grupo-reservas)

| Necesidad del MID | Decisión pendiente |
| --- | --- |
| Consultar una reserva para cancelación o clima | Confirmar la operación de detalle, los campos requeridos y el scope de acceso interno. |
| Detectar una reserva activa del mismo pasajero en una ruta | Confirmar la consulta, los filtros y la garantía disponible ante solicitudes concurrentes. |
| Persistir una reserva confirmada después de descontar cupos | Acordar el flujo autorizado. Los requisitos indican que `POST /reservas` crea una reserva pendiente. |
| Cancelar y registrar una penalización cuando corresponda | Acordar cómo persistir el cambio de estado junto con la penalización y cómo informar los conflictos. |

También queda por confirmar qué rutas y métodos publicará el gateway para el CRUD propio, los scopes de lectura y escritura y los formatos de error definitivos. La implementación del CRUD corresponde a Daniel Gómez. Las reglas del MID corresponden a Daniel Barrera.
