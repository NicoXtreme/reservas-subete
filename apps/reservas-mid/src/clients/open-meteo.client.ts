import axios from "axios";
import { z } from "zod";

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const maxForecastDays = 16;

const configuration = z.object({
  baseUrl: z.string().url().default("https://api.open-meteo.com"),
  timeoutMs: z.number().int().min(1).max(10_000).default(3000),
  maxRetries: z.number().int().min(0).max(2).default(1),
  cacheTtlSeconds: z.number().int().min(1).max(3600).default(900),
  cacheMaxEntries: z.number().int().min(1).max(5000).default(500)
});

const weatherQuery = z.object({
  longitud: z.number().finite().min(-180).max(180),
  latitud: z.number().finite().min(-90).max(90),
  salida: z.string().datetime({ offset: true })
    .refine((value) => Number.isFinite(Date.parse(value)), "Fecha no válida.")
});

const hourlyForecast = z.object({
  hourly_units: z.object({
    temperature_2m: z.literal("°C"),
    precipitation_probability: z.literal("%")
  }),
  hourly: z.object({
    time: z.array(z.number().int()).max(maxForecastDays * 24),
    temperature_2m: z.array(z.number().finite().nullable()).max(maxForecastDays * 24),
    precipitation_probability: z.array(z.number().min(0).max(100).nullable()).max(maxForecastDays * 24),
    weather_code: z.array(z.number().int().nullable()).max(maxForecastDays * 24)
  })
});

const weatherConditions: Readonly<Partial<Record<number, string>>> = {
  0: "Cielo despejado",
  1: "Mayormente despejado",
  2: "Parcialmente nublado",
  3: "Cubierto",
  45: "Niebla",
  48: "Niebla con escarcha",
  51: "Llovizna ligera",
  53: "Llovizna moderada",
  55: "Llovizna intensa",
  56: "Llovizna helada ligera",
  57: "Llovizna helada intensa",
  61: "Lluvia ligera",
  63: "Lluvia moderada",
  65: "Lluvia intensa",
  66: "Lluvia helada ligera",
  67: "Lluvia helada intensa",
  71: "Nevada ligera",
  73: "Nevada moderada",
  75: "Nevada intensa",
  77: "Granos de nieve",
  80: "Chubascos ligeros",
  81: "Chubascos moderados",
  82: "Chubascos violentos",
  85: "Chubascos de nieve ligeros",
  86: "Chubascos de nieve intensos",
  95: "Tormenta eléctrica",
  96: "Tormenta eléctrica con granizo ligero",
  97: "Tormenta eléctrica fuerte",
  99: "Tormenta eléctrica con granizo intenso"
};

const unavailableMessages = {
  fuera_de_horizonte: "La salida está fuera del horizonte de pronóstico.",
  sin_datos: "No hay datos meteorológicos completos para la hora de salida.",
  respuesta_invalida: "El proveedor devolvió un pronóstico inválido.",
  timeout: "Se agotó el tiempo de espera del pronóstico.",
  proveedor_no_disponible: "No fue posible consultar el pronóstico meteorológico."
};

type UnavailableReason = keyof typeof unavailableMessages;
type AvailableForecast = Readonly<{
  disponible: true;
  temperatura: number;
  probabilidadPrecipitacion: number;
  codigoMeteorologico: number;
  condicion: string;
  fechaHoraPronostico: string;
  mensaje?: string;
}>;

export type OpenMeteoForecast = AvailableForecast | {
  disponible: false;
  motivo: UnavailableReason;
  mensaje: string;
};

function unavailable(motivo: UnavailableReason): OpenMeteoForecast {
  return { disponible: false, motivo, mensaje: unavailableMessages[motivo] };
}

function selectForecast(body: unknown, forecastHour: number): OpenMeteoForecast {
  const parsed = hourlyForecast.safeParse(body);
  if (!parsed.success) return unavailable("respuesta_invalida");

  const { time, temperature_2m, precipitation_probability, weather_code } = parsed.data.hourly;
  if ([temperature_2m, precipitation_probability, weather_code].some((series) => series.length !== time.length) ||
      time.some((value, index) => value % (hourMs / 1000) !== 0 ||
        (index > 0 && value <= time[index - 1]))) {
    return unavailable("respuesta_invalida");
  }

  const index = time.indexOf(forecastHour / 1000);
  if (index === -1) return unavailable("sin_datos");
  const temperatura = temperature_2m[index];
  const probabilidadPrecipitacion = precipitation_probability[index];
  const codigoMeteorologico = weather_code[index];
  if (temperatura === null || probabilidadPrecipitacion === null || codigoMeteorologico === null) {
    return unavailable("sin_datos");
  }
  const condicion = weatherConditions[codigoMeteorologico];
  if (!condicion) return unavailable("respuesta_invalida");

  return Object.freeze({
    disponible: true,
    temperatura,
    probabilidadPrecipitacion,
    codigoMeteorologico,
    condicion,
    fechaHoraPronostico: new Date(forecastHour).toISOString()
  });
}

function parseForecast(data: string, forecastHour: number): OpenMeteoForecast {
  try {
    return selectForecast(JSON.parse(data), forecastHour);
  } catch (error) {
    if (error instanceof SyntaxError) return unavailable("respuesta_invalida");
    throw error;
  }
}

const transientStatuses = new Set([408, 500, 502, 503, 504]);
const transientCodes = new Set(["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "EPIPE", "ETIMEDOUT"]);

export function createOpenMeteoClient(options: z.input<typeof configuration> = {}) {
  const { baseUrl, timeoutMs, maxRetries, cacheTtlSeconds, cacheMaxEntries } = configuration.parse(options);
  const origin = new URL(baseUrl);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("OPEN_METEO_BASE_URL debe ser un origen HTTP(S) sin credenciales.");
  }

  const http = axios.create({
    adapter: "http",
    timeout: timeoutMs,
    maxRedirects: 0,
    proxy: false,
    maxContentLength: 256 * 1024,
    responseType: "text",
    headers: {
      "User-Agent": "reservas-subete/1.0",
      Authorization: false,
      Cookie: false,
      "x-gateway-secret": false
    }
  });
  const forecastUrl = new URL("/v1/forecast", origin).href;
  const cache = new Map<string, { expiresAt: number; forecast: AvailableForecast }>();
  const inFlight = new Map<string, Promise<OpenMeteoForecast>>();

  async function fetchForecast(
    longitude: number, latitude: number, forecastHour: number, forecastDays: number
  ): Promise<OpenMeteoForecast> {
    const deadline = AbortSignal.timeout(timeoutMs * (maxRetries + 1));
    for (let attempt = 0; ; attempt++) {
      if (deadline.aborted) return unavailable("timeout");
      const attemptDeadline = AbortSignal.timeout(timeoutMs);
      try {
        const { data } = await http.get<string>(forecastUrl, {
          signal: AbortSignal.any([deadline, attemptDeadline]),
          params: {
            latitude,
            longitude,
            hourly: "temperature_2m,precipitation_probability,weather_code",
            temperature_unit: "celsius",
            timezone: "GMT",
            timeformat: "unixtime",
            forecast_days: forecastDays
          }
        });
        return parseForecast(data, forecastHour);
      } catch (error) {
        const code = axios.isAxiosError(error) ? error.code : undefined;
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (deadline.aborted) return unavailable("timeout");
        const timedOut = attemptDeadline.aborted || code === "ECONNABORTED" || code === "ETIMEDOUT";
        const retryable = timedOut || (status !== undefined && transientStatuses.has(status)) ||
          (status === undefined && code !== undefined && transientCodes.has(code));
        if (retryable && attempt < maxRetries) continue;
        if (timedOut) return unavailable("timeout");
        if (code === "ERR_BAD_RESPONSE" && status === undefined) return unavailable("respuesta_invalida");
        return unavailable("proveedor_no_disponible");
      }
    }
  }

  return {
    async forecast(input: z.input<typeof weatherQuery>): Promise<OpenMeteoForecast> {
      const { longitud, latitud, salida } = weatherQuery.parse(input);
      const now = Date.now();
      const forecastHour = Math.floor(Date.parse(salida) / hourMs) * hourMs;
      const today = Math.floor(now / dayMs) * dayMs;
      const forecastDays = Math.floor((forecastHour - today) / dayMs) + 1;
      if (forecastDays < 1 || forecastDays > maxForecastDays) return unavailable("fuera_de_horizonte");

      const key = JSON.stringify([longitud, latitud, forecastHour]);
      const cached = cache.get(key);
      if (cached) {
        cache.delete(key);
        if (cached.expiresAt > now) {
          cache.set(key, cached);
          return cached.forecast;
        }
      }

      const pending = inFlight.get(key);
      if (pending) return pending;

      const request = fetchForecast(longitud, latitud, forecastHour, forecastDays)
        .then((forecast) => {
          if (forecast.disponible) {
            if (cache.size === cacheMaxEntries) {
              const oldest = cache.keys().next();
              if (!oldest.done) cache.delete(oldest.value);
            }
            cache.set(key, { forecast, expiresAt: Date.now() + cacheTtlSeconds * 1000 });
          }
          return forecast;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, request);
      return request;
    }
  };
}

export function createOpenMeteoClientFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const readInteger = (value: string | undefined) =>
    value === undefined ? undefined : /^\d+$/.test(value) ? Number(value) : NaN;

  return createOpenMeteoClient({
    baseUrl: env.OPEN_METEO_BASE_URL,
    timeoutMs: readInteger(env.OPEN_METEO_TIMEOUT_MS),
    maxRetries: readInteger(env.OPEN_METEO_MAX_RETRIES),
    cacheTtlSeconds: readInteger(env.OPEN_METEO_CACHE_TTL_SECONDS),
    cacheMaxEntries: readInteger(env.OPEN_METEO_CACHE_MAX_ENTRIES)
  });
}
