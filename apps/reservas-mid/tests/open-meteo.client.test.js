const { createServer } = require("node:http");
const { ZodError } = require("zod");
const {
  createOpenMeteoClient,
  createOpenMeteoClientFromEnv
} = require("../dist/clients/open-meteo.client");

const now = Date.parse("2026-11-23T09:00:00Z");
const hour = Date.parse("2026-11-23T11:00:00Z") / 1000;
const query = { longitud: -74.0645, latitud: 4.6486, salida: "2026-11-23T06:35:00-05:00" };
const validForecast = {
  disponible: true,
  temperatura: 18.5,
  probabilidadPrecipitacion: 75,
  codigoMeteorologico: 63,
  condicion: "Lluvia moderada",
  fechaHoraPronostico: "2026-11-23T11:00:00.000Z"
};

let server;
let baseUrl;
let requests;
let respond;
let clock;

function payload(hourly = {}) {
  return {
    hourly_units: { temperature_2m: "°C", precipitation_probability: "%" },
    hourly: {
      time: [hour - 3600, hour, hour + 3600],
      temperature_2m: [15, 18.5, 22],
      precipitation_probability: [0, 75, 90],
      weather_code: [0, 63, 97],
      ...hourly
    }
  };
}

function json(res, value, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

function client(overrides = {}) {
  return createOpenMeteoClient({ baseUrl, timeoutMs: 1000, ...overrides });
}

beforeEach(async () => {
  requests = [];
  respond = (_req, res) => json(res, payload());
  clock = jest.spyOn(Date, "now").mockReturnValue(now);
  server = createServer((req, res) => {
    requests.push(req);
    respond(req, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  clock.mockRestore();
  await new Promise((resolve) => server.close(resolve));
});

test("envía parámetros oficiales y selecciona la hora UTC que contiene la salida de Colombia", async () => {
  await expect(client().forecast(query)).resolves.toEqual(validForecast);
  expect(requests).toHaveLength(1);
  const request = new URL(requests[0].url, baseUrl);
  expect(requests[0].method).toBe("GET");
  expect(request.pathname).toBe("/v1/forecast");
  expect(Object.fromEntries(request.searchParams)).toEqual({
    latitude: "4.6486",
    longitude: "-74.0645",
    hourly: "temperature_2m,precipitation_probability,weather_code",
    temperature_unit: "celsius",
    timezone: "GMT",
    timeformat: "unixtime",
    forecast_days: "1"
  });
});

test.each([
  [0, "Cielo despejado"],
  [45, "Niebla"],
  [56, "Llovizna helada ligera"],
  [75, "Nevada intensa"],
  [82, "Chubascos violentos"],
  [97, "Tormenta eléctrica fuerte"],
  [99, "Tormenta eléctrica con granizo intenso"]
])("interpreta el código WMO %i", async (code, condition) => {
  respond = (_req, res) => json(res, payload({ weather_code: [1, code, 2] }));
  await expect(client().forecast(query)).resolves.toMatchObject({
    disponible: true, codigoMeteorologico: code, condicion: condition
  });
});

test("calcula el día de pronóstico en UTC cuando el offset cruza medianoche", async () => {
  await expect(client().forecast({ ...query, salida: "2026-11-23T23:30:00-05:00" }))
    .resolves.toMatchObject({ disponible: false, motivo: "sin_datos" });
  expect(new URL(requests[0].url, baseUrl).searchParams.get("forecast_days")).toBe("2");
});

test("conserva la precisión de la probabilidad porcentual del proveedor", async () => {
  respond = (_req, res) => json(res, payload({ precipitation_probability: [0, 33.3, 90] }));
  await expect(client().forecast(query)).resolves.toMatchObject({
    disponible: true, probabilidadPrecipitacion: 33.3
  });
});

test.each([
  { longitud: 181 }, { latitud: -91 }, { longitud: NaN }, { latitud: "4.6" },
  { salida: "2026-11-23T06:35:00" }, { salida: "2026-02-30T11:00:00Z" },
  { salida: "fecha-inválida" }
])("rechaza una entrada inválida sin contactar al proveedor (%p)", async (input) => {
  await expect(client().forecast({ ...query, ...input })).rejects.toBeInstanceOf(ZodError);
  expect(requests).toHaveLength(0);
});

test.each(["2026-11-22T23:59:00Z", "2026-12-09T00:00:00Z"])(
  "degrada sin consultar al proveedor si %s está fuera del horizonte", async (salida) => {
    await expect(client().forecast({ ...query, salida })).resolves.toMatchObject({
      disponible: false, motivo: "fuera_de_horizonte", mensaje: expect.any(String)
    });
    expect(requests).toHaveLength(0);
  }
);

test("solicita el último día permitido sin inventar una hora ausente", async () => {
  await expect(client().forecast({ ...query, salida: "2026-12-08T23:59:00Z" }))
    .resolves.toMatchObject({ disponible: false, motivo: "sin_datos" });
  expect(new URL(requests[0].url, baseUrl).searchParams.get("forecast_days")).toBe("16");
});

test("reutiliza el caché para distintas representaciones de la misma hora UTC", async () => {
  const weather = client();
  await weather.forecast(query);
  await expect(weather.forecast({ ...query, salida: "2026-11-23T11:59:00Z" }))
    .resolves.toEqual(validForecast);
  expect(requests).toHaveLength(1);
  await weather.forecast({ ...query, salida: "2026-11-23T12:00:00Z" });
  expect(requests).toHaveLength(2);
});

test("renueva el pronóstico al expirar el TTL", async () => {
  const weather = client({ cacheTtlSeconds: 1 });
  await weather.forecast(query);
  clock.mockReturnValue(now + 1000);
  await weather.forecast(query);
  expect(requests).toHaveLength(2);
});

test("desaloja la entrada menos usada cuando alcanza el límite", async () => {
  const weather = client({ cacheMaxEntries: 2 });
  const second = { ...query, longitud: -75 };
  const third = { ...query, latitud: 5 };
  await weather.forecast(query);
  await weather.forecast(second);
  await weather.forecast(query);
  await weather.forecast(third);
  await weather.forecast(query);
  expect(requests).toHaveLength(3);
  await weather.forecast(second);
  expect(requests).toHaveLength(4);
});

test("agrupa consultas concurrentes equivalentes en una llamada externa", async () => {
  const weather = client();
  await expect(Promise.all([weather.forecast(query), weather.forecast(query)]))
    .resolves.toEqual([validForecast, validForecast]);
  expect(requests).toHaveLength(1);
});

test("degrada por timeout con intentos acotados y sin almacenar el fallo", async () => {
  respond = () => {};
  const weather = client({ timeoutMs: 150, maxRetries: 1 });
  const startedAt = performance.now();
  await expect(weather.forecast(query)).resolves.toMatchObject({
    disponible: false, motivo: "timeout"
  });
  expect(performance.now() - startedAt).toBeLessThan(1000);
  expect(requests).toHaveLength(2);
  respond = (_req, res) => json(res, payload());
  await expect(weather.forecast(query)).resolves.toEqual(validForecast);
});

test("se recupera tras un 503 con un cuerpo que no es JSON", async () => {
  respond = (_req, res) => {
    if (requests.length === 1) {
      res.writeHead(503).end("Temporalmente fuera de servicio");
      return;
    }
    json(res, payload());
  };
  await expect(client().forecast(query)).resolves.toEqual(validForecast);
  expect(requests).toHaveLength(2);
});

test.each([[400, 1], [401, 1], [429, 1], [503, 3]])(
  "degrada ante HTTP %i tras %i intentos sin propagar datos internos", async (status, attempts) => {
    respond = (_req, res) => json(res, { reason: "detalle-interno-del-proveedor" }, status);
    await expect(client({ maxRetries: 2 }).forecast(query)).resolves.toEqual({
      disponible: false,
      motivo: "proveedor_no_disponible",
      mensaje: "No fue posible consultar el pronóstico meteorológico."
    });
    expect(requests).toHaveLength(attempts);
  }
);

test("degrada ante una interrupción de red y limita las llamadas", async () => {
  respond = (req) => req.socket.destroy();
  await expect(client().forecast(query)).resolves.toMatchObject({
    disponible: false, motivo: "proveedor_no_disponible"
  });
  expect(requests).toHaveLength(2);
});

test.each([
  ["JSON inválido", () => "{", "respuesta_invalida"],
  ["series ausentes", () => JSON.stringify({ hourly: {} }), "respuesta_invalida"],
  ["series desalineadas", () => JSON.stringify(payload({ weather_code: [63] })), "respuesta_invalida"],
  ["medición faltante", () => JSON.stringify(payload({ precipitation_probability: [0, null, 90] })), "sin_datos"],
  ["código desconocido", () => JSON.stringify(payload({ weather_code: [0, 101, 2] })), "respuesta_invalida"]
])("degrada sin reintentar ni guardar si recibe %s", async (_label, body, reason) => {
  respond = (_req, res) => res.writeHead(200, { "Content-Type": "application/json" }).end(body());
  const weather = client();
  await expect(weather.forecast(query)).resolves.toMatchObject({ disponible: false, motivo: reason });
  expect(requests).toHaveLength(1);
  respond = (_req, res) => json(res, payload());
  await expect(weather.forecast(query)).resolves.toEqual(validForecast);
  expect(requests).toHaveLength(2);
});

test("omite credenciales y cabeceras del gateway en la consulta al proveedor", async () => {
  const weather = createOpenMeteoClientFromEnv({
    OPEN_METEO_BASE_URL: baseUrl,
    OPEN_METEO_TIMEOUT_MS: "1000",
    GATEWAY_URL: "https://gateway.example.test",
    GATEWAY_CLIENT_ID: "mid-ficticio",
    GATEWAY_CLIENT_SECRET: "cliente-ficticio",
    GATEWAY_INTERNAL_SECRET: "interno-ficticio"
  });
  await weather.forecast(query);
  const [request] = requests;
  expect(request.headers.authorization).toBeUndefined();
  expect(request.headers.cookie).toBeUndefined();
  expect(request.headers["x-gateway-secret"]).toBeUndefined();
  expect(request.headers["user-agent"]).toBe("reservas-subete/1.0");
  expect(request.url).not.toMatch(/ficticio|apikey/);
});

test.each([
  { OPEN_METEO_TIMEOUT_MS: "10001" }, { OPEN_METEO_TIMEOUT_MS: "0" },
  { OPEN_METEO_MAX_RETRIES: "3" }, { OPEN_METEO_MAX_RETRIES: "" },
  { OPEN_METEO_CACHE_TTL_SECONDS: "0" }, { OPEN_METEO_CACHE_MAX_ENTRIES: "5001" },
  { OPEN_METEO_BASE_URL: "https://user:example@provider.example.test" }
])("rechaza configuración fuera de los límites (%p)", (env) => {
  expect(() => createOpenMeteoClientFromEnv({ OPEN_METEO_BASE_URL: baseUrl, ...env })).toThrow();
});
