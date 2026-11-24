# Subete - Grupo C: Reservas

Backend encargado de gestionar las reservas de viajes compartidos
entre estudiantes.

## Tecnologías

- Node.js
- Express
- TypeScript
- PostgreSQL
- Sequelize
- JWT
- Zod
- Axios
- OpenAPI
- Docker
- GitHub Actions

## Arquitectura

El proyecto contiene dos aplicaciones:

### Reservas CRUD

Responsable de la persistencia y las operaciones CRUD
sobre las reservas.

### Reservas MID

Responsable de las reglas de negocio, creación y cancelación
de reservas e integración con otros servicios.

## API externa de clima

**Open-Meteo Weather Forecast API** permite advertir al pasajero sobre las condiciones previstas en el punto y la hora de salida. Se eligió por su cobertura global, pronóstico horario y acceso gratuito para el uso académico no comercial. El MID consulta directamente `GET /v1/forecast` e identifica la aplicación con el encabezado `User-Agent: reservas-subete/1.0`. El servicio gratuito funciona sin API key. [Documentación de pronósticos](https://open-meteo.com/en/docs) · [Planes de Open-Meteo](https://open-meteo.com/en/pricing)

El cliente envía las coordenadas WGS84 por separado como `longitude` y `latitude`. Solicita `temperature_2m` en °C, `precipitation_probability` en porcentaje y `weather_code` según la tabla WMO. Usa `temperature_unit=celsius`, `timezone=GMT`, `timeformat=unixtime` y los `forecast_days` necesarios para cubrir la fecha solicitada. Lee las series de `hourly` por índice y comprueba sus unidades en `hourly_units`. [Parámetros, respuesta y códigos WMO](https://open-meteo.com/en/docs)

La salida debe indicar `Z` o un offset explícito, como `-05:00` para Colombia. Se selecciona la hora UTC que contiene la salida, redondeando hacia abajo. Una salida a las `06:35-05:00` selecciona las `11:00Z`. La probabilidad de precipitación describe la hora anterior a la marca seleccionada, según la definición del proveedor. El horizonte empieza a las 00:00 UTC del día de consulta y comprende hasta 16 días, contando ese día. Si la serie no contiene la hora exacta o alguna medición requerida, se informa la falta de datos. [Horizonte y definición de variables horarias](https://open-meteo.com/en/docs)

| Variable | Valor inicial | Límite o formato |
| --- | --- | --- |
| `OPEN_METEO_BASE_URL` | `https://api.open-meteo.com` | Origen HTTP(S) sin credenciales |
| `OPEN_METEO_TIMEOUT_MS` | `3000` | 1 a 10 000 ms por intento |
| `OPEN_METEO_MAX_RETRIES` | `1` | 0 a 2 reintentos adicionales |
| `OPEN_METEO_CACHE_TTL_SECONDS` | `900` | 1 a 3600 segundos |
| `OPEN_METEO_CACHE_MAX_ENTRIES` | `500` | 1 a 5000 entradas |

El plazo de la consulta completa es el timeout por intento multiplicado por el máximo de intentos, 6 segundos con los valores iniciales. Se reintentan timeouts, fallos transitorios de conexión y HTTP 408, 500, 502, 503 y 504. Los rechazos permanentes, el límite de cuota HTTP 429 y las respuestas inválidas se manejan sin reintentos.

El caché en memoria es local a cada instancia del MID. Usa longitud, latitud y hora UTC como clave, agrupa solicitudes concurrentes equivalentes y guarda únicamente pronósticos válidos. Al llenarse, desaloja la entrada cuyo acceso fue menos reciente.

Una entrada inválida produce un error de validación. Ante fallos externos, datos incompletos o una salida fuera del horizonte, el cliente devuelve `disponible: false` con un motivo y un mensaje. El contrato de clima prevé HTTP 200 para ese resultado. Las operaciones de reserva y cancelación son independientes de esta consulta.

El plan gratuito admite exclusivamente uso no comercial. Los términos fijan límites de 600 llamadas por minuto, 5000 por hora, 10 000 por día y 300 000 por mes. El proveedor indica que consultas de más de dos semanas pueden computar como más de una llamada. Los datos se ofrecen bajo CC BY 4.0. Al mostrarlos, incluir una atribución como [Datos meteorológicos de Open-Meteo](https://open-meteo.com/) junto al pronóstico, enlazar la licencia e indicar las modificaciones, como la traducción de los códigos a español. [Términos y privacidad](https://open-meteo.com/en/terms) · [Cómputo de llamadas y planes](https://open-meteo.com/en/pricing) · [Licencia CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Estructura

- apps/reservas-crud
- apps/reservas-mid
- contracts
- docs

## Integrantes

- Nicolás Ortiz
- Daniel Gómez
- Daniel Barrera
