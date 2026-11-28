import { Sequelize, type Options } from "sequelize";
import { cargarEntorno, dialectOptions, leerUrl } from "./db-common";

cargarEntorno();

type PoolOptions = NonNullable<Options["pool"]>;

function valorObligatorio(nombre: string): string {
  const valor = process.env[nombre]?.trim();

  if (!valor) {
    throw new Error(
      `Falta la variable de entorno obligatoria ${nombre}. Copia .env.example a .env y configura la conexión a PostgreSQL.`
    );
  }

  return valor;
}

function passwordObligatoria(): string {
  const valor = process.env.DB_PASSWORD;

  if (valor === undefined || valor === "") {
    throw new Error(
      "Falta la variable de entorno obligatoria DB_PASSWORD. Copia .env.example a .env y configura la conexión a PostgreSQL."
    );
  }

  return valor;
}

function enteroOpcional(nombre: string, porDefecto: number, minimo: number, maximo: number): number {
  const raw = process.env[nombre]?.trim();

  if (!raw) {
    return porDefecto;
  }

  const valor = Number(raw);

  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(`${nombre} debe ser un entero entre ${minimo} y ${maximo} (recibido: ${raw}).`);
  }

  return valor;
}

function puerto(): number {
  const raw = valorObligatorio("DB_PORT");
  const valor = Number(raw);

  if (!Number.isInteger(valor) || valor < 1 || valor > 65535) {
    throw new Error(`DB_PORT debe ser un entero entre 1 y 65535 (recibido: ${raw}).`);
  }

  return valor;
}

function dialecto(): "postgres" {
  const valor = (process.env.DB_DIALECT?.trim() || "postgres").toLowerCase();

  if (valor !== "postgres") {
    throw new Error(`DB_DIALECT debe ser postgres (recibido: ${valor}).`);
  }

  return "postgres";
}

function pool(): PoolOptions {
  const max = enteroOpcional("DB_POOL_MAX", 5, 1, 100);
  const min = enteroOpcional("DB_POOL_MIN", 0, 0, 100);

  if (min > max) {
    throw new Error("DB_POOL_MIN no puede ser mayor que DB_POOL_MAX.");
  }

  return { max, min };
}

function opcionesComunes(): Options {
  const ssl = dialectOptions();

  return {
    dialect: dialecto(),
    logging: process.env.DB_LOGGING?.trim().toLowerCase() === "true" ? console.log : false,
    pool: pool(),
    ...(ssl ? { dialectOptions: ssl } : {})
  };
}

function urlDatabase(): string | undefined {
  return leerUrl("DATABASE_URL");
}

function codigoDe(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const codigo = (error as { code?: unknown }).code;

    if (typeof codigo === "string") {
      return codigo;
    }
  }

  return "";
}

function mensajeSeguro(error: unknown): string {
  const codigo = codigoDe(error);
  const texto = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (codigo === "ECONNREFUSED" || texto.includes("connection refused") || texto.includes("conexión rechazada")) {
    return "Conexión rechazada: verifica que PostgreSQL esté activo y que DB_HOST/DB_PORT sean correctos.";
  }

  if (codigo === "28P01" || texto.includes("password authentication failed") || texto.includes("authentication failed")) {
    return "Credenciales inválidas: revisa DB_USER y DB_PASSWORD.";
  }

  if (codigo === "3D000" || (texto.includes("database ") && texto.includes("does not exist"))) {
    return "Base de datos inexistente: revisa DB_NAME.";
  }

  if (codigo === "ETIMEDOUT" || texto.includes("timeout") || texto.includes("timed out")) {
    return "Timeout de conexión: revisa la disponibilidad de PostgreSQL y DB_PORT.";
  }

  return `Error de conexión no identificado${codigo ? ` (código ${codigo})` : ""}: revisa la configuración de PostgreSQL.`;
}

const opciones = opcionesComunes();
const url = urlDatabase();

export const sequelize = url
  ? new Sequelize(url, opciones)
  : new Sequelize({
      ...opciones,
      host: valorObligatorio("DB_HOST"),
      port: puerto(),
      database: valorObligatorio("DB_NAME"),
      username: valorObligatorio("DB_USER"),
      password: passwordObligatoria()
    });

export async function testConnection(): Promise<void> {
  try {
    await sequelize.authenticate();
    console.log("Conexión a PostgreSQL establecida correctamente.");
  } catch (error) {
    const mensaje = mensajeSeguro(error);
    console.error(`No se pudo conectar a PostgreSQL. ${mensaje}`);
    throw new Error(mensaje);
  }
}
