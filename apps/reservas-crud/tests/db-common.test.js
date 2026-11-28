const fs = require("node:fs");
const path = require("node:path");

const nombresEntorno = [
  "DATABASE_URL",
  "DATABASE_URL_TEST",
  "NODE_ENV",
  "DB_NAME_TEST",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DB_SSL",
  "DB_SSL_CA",
  "DB_POOL_MAX",
  "DB_POOL_MIN",
  "DB_LOGGING"
];

const entornoOriginal = {};
for (const nombre of nombresEntorno) {
  entornoOriginal[nombre] = process.env[nombre];
}

const mockDotenvConfig = jest.fn(() => ({}));

jest.mock("dotenv", () => ({
  __esModule: true,
  default: { config: (...argumentos) => mockDotenvConfig(...argumentos) }
}));

const db = require("../dist/config/db-common");

function limpiarEntorno() {
  for (const nombre of nombresEntorno) {
    delete process.env[nombre];
  }
}

function entornoBase(cambios = {}) {
  limpiarEntorno();
  process.env.DB_HOST = "localhost";
  process.env.DB_PORT = "5432";
  process.env.DB_NAME = "reservas";
  process.env.DB_USER = "reservas";
  process.env.DB_PASSWORD = "clave-secreta-de-prueba";
  process.env.DB_NAME_TEST = "reservas_test";

  for (const [nombre, valor] of Object.entries(cambios)) {
    if (valor === undefined) {
      delete process.env[nombre];
    } else {
      process.env[nombre] = valor;
    }
  }
}

describe("Configuración compartida de reservas-crud", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    for (const nombre of nombresEntorno) {
      if (entornoOriginal[nombre] === undefined) {
        delete process.env[nombre];
      } else {
        process.env[nombre] = entornoOriginal[nombre];
      }
    }
  });

  test("RUTA_ENV apunta al .env de la raíz del repositorio", () => {
    expect(db.RUTA_ENV).toBe(path.resolve(__dirname, "../../../.env"));
  });

  test("cargarEntorno hace una sola llamada con ruta absoluta", () => {
    db.cargarEntorno();

    expect(mockDotenvConfig).toHaveBeenCalledTimes(1);
    expect(mockDotenvConfig).toHaveBeenCalledWith({ path: db.RUTA_ENV });
  });

  test("expone development, test y production como configuraciones distintas", () => {
    entornoBase({ DB_SSL: "true", DB_SSL_CA: "LINEA\\nCA" });

    let config;
    jest.isolateModules(() => {
      config = require("../config/config.js");
    });

    const development = config.development;
    const test = config.test;
    const production = config.production;

    expect(development).not.toBe(test);
    expect(test).not.toBe(production);
    expect(development.database).toBe("reservas");
    expect(test.database).toBe("reservas_test");
    expect(production.database).toBe("reservas");
    expect(test.dialectOptions.ssl).toEqual({
      require: true,
      rejectUnauthorized: true,
      ca: "LINEA\nCA"
    });
  });

  test("test usa DATABASE_URL_TEST y no cae a DATABASE_URL", () => {
    entornoBase({
      DATABASE_URL: "postgresql://usuario:clave@postgres:5432/reservas",
      DATABASE_URL_TEST: "postgresql://usuario:clave@postgres:5432/otra_test"
    });

    const configuracion = db.seleccionarConfiguracion(process.env, "test");

    expect(configuracion.url).toBe(process.env.DATABASE_URL_TEST);
    expect(configuracion.database).toBe("otra_test");
  });

  test("test usa DB_NAME_TEST cuando no hay DATABASE_URL_TEST", () => {
    entornoBase({ DATABASE_URL: "postgresql://usuario:clave@postgres:5432/reservas" });

    const configuracion = db.seleccionarConfiguracion(process.env, "test");

    expect(configuracion.url).toBeUndefined();
    expect(configuracion.database).toBe("reservas_test");
  });

  test("test falla si no hay DATABASE_URL_TEST ni DB_NAME_TEST", () => {
    entornoBase({ DB_NAME_TEST: undefined });

    expect(() => db.seleccionarConfiguracion(process.env, "test")).toThrow(
      "Faltan DATABASE_URL_TEST o DB_NAME_TEST cuando NODE_ENV=test."
    );
  });

  test("development ignora las variables de prueba aunque estén definidas", () => {
    entornoBase({
      DATABASE_URL_TEST: "postgresql://usuario:clave@postgres:5432/reservas_test"
    });

    const configuracion = db.seleccionarConfiguracion(process.env, "development");

    expect(configuracion.url).toBeUndefined();
    expect(configuracion.database).toBe("reservas");
  });

  test("la guardia permite reservas_test en los hosts autorizados", () => {
    for (const host of ["localhost", "127.0.0.1", "::1", "postgres"]) {
      entornoBase({ DB_HOST: host });
      const configuracion = db.seleccionarConfiguracion(process.env, "test");

      expect(() => db.verificarBaseSegura(configuracion, process.env)).not.toThrow();
    }
  });

  test("la guardia rechaza una base que no termina en _test", () => {
    entornoBase({ DB_NAME_TEST: "reservas" });
    const configuracion = db.seleccionarConfiguracion(process.env, "test");

    expect(() => db.verificarBaseSegura(configuracion, process.env)).toThrow("debe terminar en _test");
  });

  test("la guardia rechaza una base de pruebas igual a DB_NAME", () => {
    entornoBase({ DB_NAME: "reservas_test", DB_NAME_TEST: "reservas_test" });
    const configuracion = db.seleccionarConfiguracion(process.env, "test");

    expect(() => db.verificarBaseSegura(configuracion, process.env)).toThrow("no puede llamarse");
  });

  test("la guardia rechaza un host fuera de la lista blanca", () => {
    entornoBase({ DB_HOST: "produccion.example.com" });
    const configuracion = db.seleccionarConfiguracion(process.env, "test");

    expect(() => db.verificarBaseSegura(configuracion, process.env)).toThrow("no está permitido");
  });

  test("rechaza sslmode en DATABASE_URL y en DATABASE_URL_TEST", () => {
    entornoBase({ DATABASE_URL: "postgresql://usuario:clave@postgres:5432/reservas?sslmode=require" });
    expect(() => db.seleccionarConfiguracion(process.env, "development")).toThrow(
      "DATABASE_URL no debe incluir sslmode"
    );

    entornoBase({ DATABASE_URL_TEST: "postgresql://usuario:clave@postgres:5432/reservas_test?sslmode=require" });
    expect(() => db.seleccionarConfiguracion(process.env, "test")).toThrow(
      "DATABASE_URL_TEST no debe incluir sslmode"
    );
  });

  test("no hay configuración TLS que desactive la validación del certificado", () => {
    const configFuente = fs.readFileSync(path.resolve(__dirname, "../config/config.js"), "utf8");
    const dbFuente = fs.readFileSync(path.resolve(__dirname, "../src/config/db-common.ts"), "utf8");

    expect(configFuente).not.toContain("rejectUnauthorized: false");
    expect(dbFuente).not.toContain("rejectUnauthorized: false");
  });

  test("los scripts de migración usan --env y no NODE_ENV=", () => {
    const scripts = require("../package.json").scripts;
    const nombres = ["migrate:test", "migrate:undo", "migrate:undo:test", "migrate:undo:all"];

    for (const nombre of nombres) {
      expect(scripts[nombre]).toContain("--env");
      expect(scripts[nombre]).not.toContain("NODE_ENV=");
    }
  });
});
