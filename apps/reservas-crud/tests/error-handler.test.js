const request = require("supertest");

jest.mock("../dist/models/Reserva", () => ({
  __esModule: true,
  Reserva: {
    findAndCountAll: jest.fn()
  }
}));

describe("app errores y gateway", () => {
  const originalSecret = process.env.GATEWAY_INTERNAL_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.GATEWAY_INTERNAL_SECRET;
    else process.env.GATEWAY_INTERNAL_SECRET = originalSecret;
    jest.resetModules();
  });

  function cargarApp(secret) {
    if (secret === undefined) delete process.env.GATEWAY_INTERNAL_SECRET;
    else process.env.GATEWAY_INTERNAL_SECRET = secret;
    jest.resetModules();
    const mod = require("../dist/app");
    return { app: mod.default, manejadorErrores: mod.manejadorErrores };
  }

  test("/health sigue público", async () => {
    const { app } = cargarApp(undefined);
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ service: "reservas-crud", status: "OK" });
  });

  test("gateway 401 no cambia", async () => {
    const { app } = cargarApp("secreto");
    const res = await request(app).get("/reservas");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      codigo: "cabecera_gateway_ausente",
      mensaje: "Se requiere la cabecera interna del gateway.",
      detalle: {}
    });
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain("stack");
  });

  test("gateway 403 no cambia", async () => {
    const { app } = cargarApp("secreto");
    const res = await request(app).get("/reservas").set("x-gateway-secret", "otro");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      codigo: "cabecera_gateway_invalida",
      mensaje: "La cabecera interna del gateway no es válida.",
      detalle: {}
    });
  });

  test("JSON malformado da 400 solicitud_invalida sin stack", async () => {
    const { app } = cargarApp("secreto");
    const res = await request(app)
      .post("/reservas")
      .set("x-gateway-secret", "secreto")
      .set("Content-Type", "application/json")
      .send("{malformed");
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("solicitud_invalida");
    expect(res.body.detalle.origen).toBe("body");
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain("stack");
    expect(JSON.stringify(res.body)).not.toContain("malformed");
  });

  test("error no controlado da 500 genérico y solo loguea nombre y code", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { app, manejadorErrores } = cargarApp("secreto");
    const error = Object.assign(new Error("detalle secreto stack interno"), {
      name: "DatabaseError",
      code: "42703"
    });
    app.post("/boom", (_req, _res) => {
      throw error;
    });
    app.use(manejadorErrores);
    const res = await request(app)
      .post("/boom")
      .set("x-gateway-secret", "secreto")
      .send({ secreto: "valor-sensible" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      codigo: "error_interno",
      mensaje: "Ocurrió un error interno en el servicio.",
      detalle: {}
    });
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain("stack");
    expect(JSON.stringify(res.body)).not.toContain("detalle secreto");
    const logPlano = JSON.stringify(spy.mock.calls);
    expect(logPlano).toContain("Error no controlado en reservas-crud");
    expect(logPlano).toContain("DatabaseError");
    expect(logPlano).toContain("42703");
    expect(logPlano).not.toContain("detalle secreto");
    expect(logPlano.toLowerCase()).not.toContain("stack");
    expect(logPlano).not.toContain("valor-sensible");
    spy.mockRestore();
  });

  test("body-parser 415 responde 400 solicitud_invalida", async () => {
    const { app, manejadorErrores } = cargarApp("secreto");
    app.post("/tipo-no-soportado", (_req, _res, next) => {
      next({ type: "charset.unsupported", status: 415 });
    });
    app.use(manejadorErrores);
    const res = await request(app)
      .post("/tipo-no-soportado")
      .set("x-gateway-secret", "secreto")
      .send("hola");
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("solicitud_invalida");
    expect(res.body.detalle.origen).toBe("body");
  });

  test("error con status 404 sin type da 500 gen?rico", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { app, manejadorErrores } = cargarApp("secreto");
    app.get("/no-body-parser", (_req, _res, next) => {
      next({ status: 404, message: "no encontrado" });
    });
    app.use(manejadorErrores);
    const res = await request(app).get("/no-body-parser").set("x-gateway-secret", "secreto");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      codigo: "error_interno",
      mensaje: "Ocurrió un error interno en el servicio.",
      detalle: {}
    });
    expect(JSON.stringify(res.body)).not.toContain("no encontrado");
    spy.mockRestore();
  });
});
