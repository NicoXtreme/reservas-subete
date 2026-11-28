import path from "node:path";
import dotenv from "dotenv";
import { type Options } from "sequelize";

export const RUTA_ENV = path.resolve(__dirname, "../../../../.env");

export const HOSTS_PERMITIDOS = ["localhost", "127.0.0.1", "::1", "postgres"] as const;

export interface ConfiguracionDb {
  dialect: "postgres";
  logging: false | typeof console.log;
  dialectOptions?: Options["dialectOptions"];
  pool?: NonNullable<Options["pool"]>;
  url?: string;
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
}

export function cargarEntorno(ruta: string = RUTA_ENV): void {
  dotenv.config({ path: ruta });
}

function obligatorio(nombre: string, entorno: NodeJS.ProcessEnv, mensaje: string): string {
  const valor = entorno[nombre]?.trim();

  if (!valor) {
    throw new Error(`Falta la variable de entorno obligatoria ${nombre} ${mensaje}`);
  }

  return valor;
}

function obligatorioSinRecorte(nombre: string, entorno: NodeJS.ProcessEnv, mensaje: string): string {
  const valor = entorno[nombre];

  if (valor === undefined || valor === "") {
    throw new Error(`Falta la variable de entorno obligatoria ${nombre} ${mensaje}`);
  }

  return valor;
}

function enteroOpcional(
  nombre: string,
  entorno: NodeJS.ProcessEnv,
  porDefecto: number,
  minimo: number,
  maximo: number
): number {
  const raw = entorno[nombre]?.trim();

  if (!raw) {
    return porDefecto;
  }

  const valor = Number(raw);

  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(`${nombre} debe ser un entero entre ${minimo} y ${maximo} (recibido: ${raw}).`);
  }

  return valor;
}

function puerto(entorno: NodeJS.ProcessEnv, mensaje: string): number {
  const valor = Number(obligatorio("DB_PORT", entorno, mensaje));

  if (!Number.isInteger(valor) || valor < 1 || valor > 65535) {
    throw new Error(`DB_PORT debe ser un entero entre 1 y 65535 para ejecutar las migraciones.`);
  }

  return valor;
}

function normalizarHost(host: string): string {
  return host.replace(/^\[|\]$/g, "").toLowerCase();
}

export function dialectOptions(entorno: NodeJS.ProcessEnv = process.env): Options["dialectOptions"] {
  const habilitado = (entorno.DB_SSL?.trim().toLowerCase() || "false") === "true";

  if (!habilitado) {
    return undefined;
  }

  const ca = entorno.DB_SSL_CA;

  return {
    ssl: {
      require: true,
      rejectUnauthorized: true,
      ...(ca ? { ca: ca.replace(/\\n/g, "\n") } : {})
    }
  };
}

function configuracionComun(entorno: NodeJS.ProcessEnv): Omit<ConfiguracionDb, "database"> {
  const ssl = dialectOptions(entorno);
  const max = enteroOpcional("DB_POOL_MAX", entorno, 5, 1, 100);
  const min = enteroOpcional("DB_POOL_MIN", entorno, 0, 0, 100);

  if (min > max) {
    throw new Error("DB_POOL_MIN no puede ser mayor que DB_POOL_MAX.");
  }

  return {
    dialect: "postgres",
    logging: entorno.DB_LOGGING?.trim().toLowerCase() === "true" ? console.log : false,
    pool: { max, min },
    ...(ssl ? { dialectOptions: ssl } : {})
  };
}

export function leerUrl(
  nombre: "DATABASE_URL" | "DATABASE_URL_TEST",
  entorno: NodeJS.ProcessEnv = process.env
): string | undefined {
  const raw = entorno[nombre];

  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${nombre} no es una URL válida. Usa postgresql://usuario:clave@host:5432/base.`);
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${nombre} debe usar postgres: o postgresql: (recibido: ${url.protocol}).`);
  }

  if (url.searchParams.has("sslmode")) {
    throw new Error(`${nombre} no debe incluir sslmode; configura TLS con DB_SSL y DB_SSL_CA.`);
  }

  return raw;
}

function datosDeUrl(url: URL): { database: string; host: string; port?: number } {
  const database = decodeURIComponent(url.pathname.slice(1));
  const host = normalizarHost(url.hostname);
  const puertoUrl = url.port ? Number(url.port) : undefined;

  return {
    database,
    host,
    ...(puertoUrl ? { port: puertoUrl } : {})
  };
}

export function seleccionarConfiguracion(
  entorno: NodeJS.ProcessEnv = process.env,
  entornoAplicacion: string = entorno.NODE_ENV ?? "development"
): ConfiguracionDb {
  const mensaje = "para ejecutar las migraciones.";
  const comun = configuracionComun(entorno);

  if (entornoAplicacion === "test") {
    const urlTest = leerUrl("DATABASE_URL_TEST", entorno);

    if (urlTest) {
      return { ...comun, url: urlTest, ...datosDeUrl(new URL(urlTest)) };
    }

    const nombreTest = entorno.DB_NAME_TEST?.trim();

    if (!nombreTest) {
      throw new Error("Faltan DATABASE_URL_TEST o DB_NAME_TEST cuando NODE_ENV=test.");
    }

    return {
      ...comun,
      host: obligatorio("DB_HOST", entorno, mensaje),
      port: puerto(entorno, mensaje),
      database: nombreTest,
      username: obligatorio("DB_USER", entorno, mensaje),
      password: obligatorioSinRecorte("DB_PASSWORD", entorno, mensaje)
    };
  }

  const url = leerUrl("DATABASE_URL", entorno);

  if (url) {
    return { ...comun, url, ...datosDeUrl(new URL(url)) };
  }

  return {
    ...comun,
    host: obligatorio("DB_HOST", entorno, mensaje),
    port: puerto(entorno, mensaje),
    database: obligatorio("DB_NAME", entorno, mensaje),
    username: obligatorio("DB_USER", entorno, mensaje),
    password: obligatorioSinRecorte("DB_PASSWORD", entorno, mensaje)
  };
}

export function verificarBaseSegura(
  configuracion: ConfiguracionDb,
  entorno: NodeJS.ProcessEnv = process.env
): void {
  const nombre = configuracion.database;

  if (!nombre.endsWith("_test")) {
    throw new Error(`Operación destructiva bloqueada: la base "${nombre}" debe terminar en _test.`);
  }

  const nombreProduccion = entorno.DB_NAME?.trim();

  if (nombreProduccion && nombre === nombreProduccion) {
    throw new Error(`Operación destructiva bloqueada: la base de pruebas no puede llamarse "${nombre}".`);
  }

  const host = configuracion.host ??
    (configuracion.url ? normalizarHost(new URL(configuracion.url).hostname) : undefined);

  if (!host || !HOSTS_PERMITIDOS.includes(host as (typeof HOSTS_PERMITIDOS)[number])) {
    throw new Error(`Operación destructiva bloqueada: el host "${host ?? "desconocido"}" no está permitido.`);
  }
}
