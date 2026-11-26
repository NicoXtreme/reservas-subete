const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config();

function obligatorio(nombre) {
  const valor = process.env[nombre]?.trim();

  if (!valor) {
    throw new Error(`Falta la variable de entorno obligatoria ${nombre} para ejecutar las migraciones.`);
  }

  return valor;
}

function puerto() {
  const valor = Number(obligatorio("DB_PORT"));

  if (!Number.isInteger(valor) || valor < 1 || valor > 65535) {
    throw new Error("DB_PORT debe ser un entero entre 1 y 65535 para ejecutar las migraciones.");
  }

  return valor;
}

function comun() {
  const ssl = (process.env.DB_SSL?.trim().toLowerCase() || "false") === "true";

  return {
    dialect: "postgres",
    logging: process.env.DB_LOGGING?.trim().toLowerCase() === "true" ? console.log : false,
    ...(ssl ? { dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } } : {})
  };
}

const url = process.env.DATABASE_URL?.trim();

const configuracion = url
  ? { ...comun(), url }
  : {
      ...comun(),
      host: obligatorio("DB_HOST"),
      port: puerto(),
      database: obligatorio("DB_NAME"),
      username: obligatorio("DB_USER"),
      password: obligatorio("DB_PASSWORD")
    };

module.exports = {
  development: configuracion,
  test: configuracion,
  production: configuracion
};
