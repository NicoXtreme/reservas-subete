const mockTestConnection = jest.fn();
const mockListen = jest.fn();
const mockOrden = [];

jest.mock("../dist/config/database", () => ({
  testConnection: (...args) => mockTestConnection(...args)
}));

jest.mock("../dist/app", () => ({
  __esModule: true,
  default: { listen: (...args) => mockListen(...args) }
}));

describe("Arranque de reservas-crud", () => {
  const puertoOriginal = process.env.CRUD_PORT;
  let logSpy;
  let errorSpy;
  let exitSpy;

  beforeEach(() => {
    jest.resetModules();
    process.env.CRUD_PORT = "4321";
    mockOrden.length = 0;
    mockTestConnection.mockReset();
    mockListen.mockReset();
    mockTestConnection.mockImplementation(async () => {
      mockOrden.push("testConnection");
    });
    mockListen.mockImplementation((_port, callback) => {
      mockOrden.push("listen");
      callback();
    });
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();

    if (puertoOriginal === undefined) {
      delete process.env.CRUD_PORT;
    } else {
      process.env.CRUD_PORT = puertoOriginal;
    }
  });

  test("verifica la conexión antes de abrir el puerto", async () => {
    const { startServer } = require("../dist/server");

    await startServer();

    expect(mockOrden).toEqual(["testConnection", "listen"]);
    expect(mockListen).toHaveBeenCalledWith(4321, expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith("Reservas CRUD running on port 4321");
  });

  test("no escucha peticiones y termina con código 1 si falla la conexión", async () => {
    mockTestConnection.mockRejectedValue(new Error("Fallo de conexión"));

    const { ejecutarServidor } = require("../dist/server");
    ejecutarServidor();
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockListen).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith("Reservas CRUD no pudo iniciar. Fallo de conexión");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
