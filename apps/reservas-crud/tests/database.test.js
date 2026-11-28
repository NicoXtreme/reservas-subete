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
  "DB_DIALECT",
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

const mockAuthenticate = jest.fn();
const mockConstructorCalls = [];
const mockConfigDotenv = jest.fn(() => ({}));

jest.mock("dotenv", () => ({
  __esModule: true,
  default: { config: (...argumentos) => mockConfigDotenv(...argumentos) }
}));

jest.mock("sequelize", () => ({
  Sequelize: jest.fn().mockImplementation((...args) => {
    mockConstructorCalls.push(args);
    return { authenticate: mockAuthenticate };
  })
}));

function limpiarEntorno() {
  for (const nombre of nombresEntorno) {
    delete process.env[nombre];
  }
}

function entornoDirecto(cambios = {}) {
  limpiarEntorno();
  process.env.DB_HOST = "127.0.0.1";
  process.env.DB_PORT = "5432";
  process.env.DB_NAME = "reservas";
  process.env.DB_USER = "reservas";
  process.env.DB_PASSWORD = "clave-secreta-de-prueba";

  for (const [nombre, valor] of Object.entries(cambios)) {
    if (valor === undefined) {
      delete process.env[nombre];
    } else {
      process.env[nombre] = valor;
    }
  }
}

function cargarModulo() {
  let modulo;

  jest.isolateModules(() => {
    modulo = require("../dist/config/database");
  });

  return modulo;
}

describe("Configuración de PostgreSQL en reservas-crud", () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockReset();
    mockConstructorCalls.length = 0;
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();

    for (const nombre of nombresEntorno) {
      if (entornoOriginal[nombre] === undefined) {
        delete process.env[nombre];
      } else {
        process.env[nombre] = entornoOriginal[nombre];
      }
    }
  });

  test("falla con mensaje claro si falta DB_HOST", () => {
    limpiarEntorno();

    expect(() => cargarModulo()).toThrow(
      "Falta la variable de entorno obligatoria DB_HOST. Copia .env.example a .env"
    );
  });

  test("falla con mensaje claro si falta DB_PASSWORD", () => {
    entornoDirecto({ DB_PASSWORD: undefined });

    expect(() => cargarModulo()).toThrow(
      "Falta la variable de entorno obligatoria DB_PASSWORD. Copia .env.example a .env"
    );
  });

  test("conserva los espacios de DB_PASSWORD", () => {
    entornoDirecto({ DB_PASSWORD: "  clave con espacios  " });

    cargarModulo();

    expect(mockConstructorCalls[0][0].password).toBe("  clave con espacios  ");
  });

  test("carga .env desde la raíz del repositorio sin depender del directorio actual", () => {
    entornoDirecto();

    cargarModulo();

    expect(mockConfigDotenv).toHaveBeenCalledWith({ path: path.resolve(__dirname, "../../../.env") });
  });

  test("rechaza un DB_PORT fuera de rango", () => {
    entornoDirecto({ DB_PORT: "70000" });

    expect(() => cargarModulo()).toThrow("DB_PORT debe ser un entero entre 1 y 65535");
  });

  test("rechaza un dialecto distinto de postgres", () => {
    entornoDirecto({ DB_DIALECT: "mysql" });

    expect(() => cargarModulo()).toThrow("DB_DIALECT debe ser postgres");
  });

  test("rechaza un pool con mínimo mayor que máximo", () => {
    entornoDirecto({ DB_POOL_MIN: "10", DB_POOL_MAX: "2" });

    expect(() => cargarModulo()).toThrow("DB_POOL_MIN no puede ser mayor que DB_POOL_MAX.");
  });

  test("construye Sequelize desde DB_* con pool y logging desactivado", () => {
    entornoDirecto({ DB_POOL_MAX: "7", DB_POOL_MIN: "1", DB_LOGGING: "false" });

    cargarModulo();

    expect(mockConstructorCalls).toHaveLength(1);
    const opciones = mockConstructorCalls[0][0];
    expect(opciones).toEqual(expect.objectContaining({
      dialect: "postgres",
      host: "127.0.0.1",
      port: 5432,
      database: "reservas",
      username: "reservas",
      password: "clave-secreta-de-prueba",
      logging: false,
      pool: { max: 7, min: 1 }
    }));
    expect(opciones).not.toHaveProperty("dialectOptions");
  });

  test("configura SSL estricto cuando DB_SSL=true", () => {
    entornoDirecto({ DB_SSL: "true" });

    cargarModulo();

    expect(mockConstructorCalls[0][0].dialectOptions).toEqual({
      ssl: { require: true, rejectUnauthorized: true }
    });
  });

  test("convierte los saltos de línea literales de DB_SSL_CA en el PEM", () => {
    entornoDirecto({
      DB_SSL: "true",
      DB_SSL_CA: "-----BEGIN CERTIFICATE-----\\nLINEA\\n-----END CERTIFICATE-----"
    });

    cargarModulo();

    expect(mockConstructorCalls[0][0].dialectOptions).toEqual({
      ssl: {
        require: true,
        rejectUnauthorized: true,
        ca: "-----BEGIN CERTIFICATE-----\nLINEA\n-----END CERTIFICATE-----"
      }
    });
  });

  test("usa DATABASE_URL sin exigir DB_*", () => {
    limpiarEntorno();
    process.env.DATABASE_URL = "postgresql://usuario:clave-secreta@postgres:5432/reservas";

    cargarModulo();

    expect(mockConstructorCalls).toHaveLength(1);
    expect(mockConstructorCalls[0][0]).toBe(process.env.DATABASE_URL);
    expect(mockConstructorCalls[0][1]).toEqual(expect.objectContaining({
      dialect: "postgres",
      logging: false,
      pool: { max: 5, min: 0 }
    }));
  });

  test("usa DATABASE_URL sin recortar espacios", () => {
    limpiarEntorno();
    const url = "  postgresql://usuario:clave-secreta@postgres:5432/reservas  ";
    process.env.DATABASE_URL = url;

    cargarModulo();

    expect(mockConstructorCalls[0][0]).toBe(url);
  });

  test("usa DB_* cuando DATABASE_URL solo contiene espacios", () => {
    entornoDirecto({ DATABASE_URL: "   " });

    cargarModulo();

    expect(mockConstructorCalls[0][0]).toEqual(expect.objectContaining({
      host: "127.0.0.1",
      database: "reservas",
      username: "reservas"
    }));
  });

  test("rechaza una DATABASE_URL con protocolo distinto de PostgreSQL", () => {
    limpiarEntorno();
    process.env.DATABASE_URL = "mysql://usuario:clave@host:3306/reservas";

    expect(() => cargarModulo()).toThrow("DATABASE_URL debe usar postgres: o postgresql:");
  });

  test("registra el éxito de authenticate", async () => {
    entornoDirecto();
    mockAuthenticate.mockResolvedValue(undefined);

    const { testConnection } = cargarModulo();
    await expect(testConnection()).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith("Conexión a PostgreSQL establecida correctamente.");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  const casosDeError = [
    {
      nombre: "conexión rechazada",
      error: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }),
      esperado: "Conexión rechazada"
    },
    {
      nombre: "credenciales inválidas",
      error: Object.assign(new Error('password authentication failed for user "reservas"; password=clave-secreta-de-prueba'), { code: "28P01" }),
      esperado: "Credenciales inválidas"
    },
    {
      nombre: "base de datos inexistente",
      error: Object.assign(new Error('database "reservas" does not exist'), { code: "3D000" }),
      esperado: "Base de datos inexistente"
    },
    {
      nombre: "timeout",
      error: Object.assign(new Error("connection timeout after 3000 ms"), { code: "ETIMEDOUT" }),
      esperado: "Timeout de conexión"
    }
  ];

  test.each(casosDeError)("maneja $nombre sin exponer la contraseña", async ({ error, esperado }) => {
    entornoDirecto();
    mockAuthenticate.mockRejectedValue(error);

    const { testConnection } = cargarModulo();
    await expect(testConnection()).rejects.toThrow(esperado);

    const salida = errorSpy.mock.calls.map((args) => args.join(" ")).join(" ");
    expect(salida).toContain(esperado);
    expect(salida).not.toContain("clave-secreta-de-prueba");
  });
});
