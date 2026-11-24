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

## Desarrollo con Docker Compose

Desde la raíz del repositorio, copia `.env.example` a `.env` si aún no existe. Usa `cp .env.example .env` en Bash o `Copy-Item .env.example .env` en PowerShell. Define una contraseña local para `POSTGRES_PASSWORD` y un valor independiente para `GATEWAY_INTERNAL_SECRET`. Puedes generar cada valor con `node -p "require('node:crypto').randomBytes(24).toString('hex')"`. Mantén esos valores en `.env`.

Compose arma la URL del CRUD con `postgres:5432`, `POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD`. Usa letras, números o caracteres sin escape en URL para esos tres valores. La inicialización del usuario y de la base solo ocurre con un volumen vacío. Para ejecutar el CRUD en el host con npm, `DATABASE_URL` debe apuntar a una base alcanzable desde el host, como `postgresql://USUARIO:CLAVE@127.0.0.1:5432/BASE` si tienes una instancia local. El nombre `postgres` es propio de la red de Compose. Para inspeccionar la base de Compose desde el host, usa `docker compose exec postgres psql -U reservas -d reservas` y ajusta usuario y base si cambiaste sus valores. PostgreSQL no publica ningún puerto al host.

Los puertos publicados son `127.0.0.1:3001` y `127.0.0.1:3002` por defecto. `CRUD_PORT` y `MID_PORT` cambian los puertos del host en Compose y los puertos de escucha cuando se ejecuta con npm. Dentro de los contenedores se usan siempre 3001 y 3002. La red privada de PostgreSQL se comparte solo con el CRUD. El CRUD y el MID están en redes de aplicación distintas.

### Conexión al gateway del clúster

- **Gateway en el host.** Usa `GATEWAY_URL=http://host.docker.internal:PUERTO` en Compose y configura el gateway para escuchar en una interfaz alcanzable desde Docker. El gateway puede llegar a las APIs por los puertos publicados en el host. Si ejecutas el MID con npm desde el host, usa el origen que corresponda, por ejemplo `http://127.0.0.1:PUERTO`.
- **Gateway en otro contenedor.** Conecta únicamente el contenedor del gateway a ambas redes de aplicación del proyecto, por ejemplo con `docker network connect reservas-subete_crud CONTENEDOR_GATEWAY` y `docker network connect reservas-subete_mid CONTENEDOR_GATEWAY`, usando los nombres reales que muestra `docker network ls`. Usa el nombre o alias de ese contenedor y su puerto interno en `GATEWAY_URL`. El gateway puede dirigir tráfico a `http://reservas-crud:3001` y `http://reservas-mid:3002` en sus redes respectivas.
- **Gateway remoto.** Usa el origen HTTPS accesible desde el MID. Para que el gateway remoto pueda enrutar hacia Reservas, necesita direcciones de las APIs alcanzables desde su entorno. Los puertos publicados en loopback solo sirven para el desarrollo local.

Al probar integraciones, configura `GATEWAY_CLIENT_ID`, `GATEWAY_CLIENT_SECRET` y el contrato de tokens acordado. El gateway debe usar el secreto interno que corresponda a las APIs de Reservas.

### Construir, iniciar y verificar

```sh
docker compose config --quiet
docker compose build reservas-crud reservas-mid
docker compose up -d --wait
docker compose ps
docker compose logs --tail=100 reservas-crud reservas-mid postgres
curl -i http://127.0.0.1:3001/health
curl -i http://127.0.0.1:3002/health
curl -i http://127.0.0.1:3001/reservas
curl -i http://127.0.0.1:3002/reservas
docker compose exec -T postgres pg_isready -h 127.0.0.1 -U reservas -d reservas
docker compose exec -T postgres psql -U reservas -d reservas -c "SELECT 1;"
```

Usa `curl.exe` en Windows si PowerShell ya reserva el nombre `curl`. Ajusta los puertos, usuario y base en los comandos si cambiaste sus valores. `/health` debe responder 200. Una solicitud a `/reservas` sin la cabecera interna debe responder 401 porque atraviesa el middleware, incluso mientras la ruta de negocio todavía no está implementada. `pg_isready` y `SELECT 1` comprueban la disponibilidad de PostgreSQL. Los chequeos HTTP comprueban la disponibilidad de Express. La conexión efectiva del CRUD, las migraciones y los seeders se incorporarán con la implementación de persistencia.

### Detener y conservar los datos

- `docker compose stop` detiene los contenedores y permite reiniciarlos con `docker compose start`.
- `docker compose down` retira los contenedores y las redes y conserva el volumen de PostgreSQL. Desconecta primero el contenedor externo del gateway de las redes de este proyecto, si lo conectaste.
- `docker compose down --volumes` elimina también el volumen y sus datos. Úsalo solo si quieres reiniciar la base desde cero.

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
