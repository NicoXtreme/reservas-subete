const request = require("supertest");
const express = require("express");

jest.mock("../dist/models/Reserva", () => ({
  __esModule: true,
  Reserva: {
    findAndCountAll: jest.fn()
  }
}));

process.env.GATEWAY_INTERNAL_SECRET = "test-secret";

const {
  validarCuerpo,
  validarParametros,
  validarConsulta
} = require("../dist/middlewares/validation.middleware");
const {
  crearReservaSchema,
  actualizarEstadoReservaSchema,
  reservaIdParamSchema,
  listarReservasQuerySchema,
  transicionPermitida,
  ESTADOS_RESERVA
} = require("../dist/validators");
const app = require("../dist/app").default;

function crearAppPrueba() {
  const testApp = express();
  testApp.use(express.json());
  testApp.post("/prueba/crear", validarCuerpo(crearReservaSchema), (req, res) => {
    res.status(200).json(res.locals.validated.body);
  });
  testApp.patch("/prueba/:id/estado", validarParametros(reservaIdParamSchema), validarCuerpo(actualizarEstadoReservaSchema), (req, res) => {
    res.status(200).json(res.locals.validated);
  });
  testApp.get("/prueba/reservas", validarConsulta(listarReservasQuerySchema), (req, res) => {
    res.status(200).json(res.locals.validated.query);
  });
  testApp.get("/prueba/:id", validarParametros(reservaIdParamSchema), (req, res) => {
    res.status(200).json(res.locals.validated.params);
  });
  return testApp;
}

function expectSolicitudInvalida(res, origen) {
  expect(res.status).toBe(400);
  expect(res.body.codigo).toBe("solicitud_invalida");
  expect(typeof res.body.mensaje).toBe("string");
  expect(res.body.detalle.origen).toBe(origen);
  expect(Array.isArray(res.body.detalle.errores)).toBe(true);
  expect(res.body.detalle.errores.length).toBeGreaterThan(0);
  for (const e of res.body.detalle.errores) {
    expect(typeof e.campo).toBe("string");
    expect(typeof e.motivo).toBe("string");
    expect(e.campo.length).toBeLessThanOrEqual(100);
  }
  expect(JSON.stringify(res.body).toLowerCase()).not.toContain("stack");
}

function expectSinEco(res, valor) {
  if (valor === undefined || valor === null) return;
  const texto = JSON.stringify(res.body);
  expect(texto).not.toContain(String(valor));
}

describe("validadores CRUD reservas", () => {
  const testApp = crearAppPrueba();
  const bodyValido = {
    ruta_id: "ruta-0001",
    pasajero_id: "usr-12",
    cupos: 1,
    abordaje: "Universidad",
    descenso: "Chapinero",
    costo: 4000
  };

  test("acepta cuerpo de creación válido y tipado esperado", async () => {
    const res = await request(testApp).post("/prueba/crear").send(bodyValido);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(bodyValido);
    expect(res.body).not.toHaveProperty("estado");
    expect(res.body).not.toHaveProperty("penalizacion");
    expect(res.body).not.toHaveProperty("creado_en");
  });

  test.each([
    ["cupos 0", { cupos: 0 }, "cupos"],
    ["cupos 1.5", { cupos: 1.5 }, "cupos"],
    ["cupos 2147483648", { cupos: 2147483648 }, "cupos"],
    ["costo -1", { costo: -1 }, "costo"],
    ["costo 25.555", { costo: 25.555 }, "costo"],
    ["costo 100000000", { costo: 100000000 }, "costo"],
    ["costo abc", { costo: "abc" }, "costo"],
    ["costo null", { costo: null }, "costo"]
  ])("rechaza creación inválida: %s", async (_nombre, cambio, campo) => {
    const payload = { ...bodyValido, ...cambio };
    const res = await request(testApp).post("/prueba/crear").send(payload);
    expectSolicitudInvalida(res, "body");
    expect(res.body.detalle.errores.some((e) => e.campo === campo)).toBe(true);
    const valor = Object.values(cambio)[0];
    if (typeof valor === "string" && valor !== "") expectSinEco(res, valor);
  });

  test("acepta cupos 1 y costos con 2 decimales válidos", async () => {
    for (const costo of [99999999.99, 1234567.89, 0.07, 1.15, 4.35, 0.01]) {
      const res = await request(testApp).post("/prueba/crear").send({ ...bodyValido, cupos: 1, costo });
      expect(res.status).toBe(200);
      expect(res.body.costo).toBe(costo);
    }
  });

  test.each([
    ["campo extra", { extra: "x" }],
    ["id prohibido", { id: "res-1" }],
    ["estado prohibido", { estado: "pendiente" }],
    ["penalizacion prohibida", { penalizacion: 0 }],
    ["creado_en prohibido", { creado_en: "2026-01-01T00:00:00Z" }],
    ["actualizado_en prohibido", { actualizado_en: "2026-01-01T00:00:00Z" }]
  ])("rechaza campo no permitido en creaci?n: %s", async (_n, extra) => {
    const res = await request(testApp).post("/prueba/crear").send({ ...bodyValido, ...extra });
    expectSolicitudInvalida(res, "body");
    expect(res.body.detalle.errores[0].motivo).toBe("Campos no permitidos.");
    const clave = Object.keys(extra)[0];
    if (clave !== "id") expect(JSON.stringify(res.body)).not.toContain(clave);
  });

  test.each([
    ["id con espacio", "/prueba/id%20malo", "params"],
    ["id vacío", "/prueba/%20", "params"],
    ["id de 101 caracteres", `/prueba/${"a".repeat(101)}`, "params"],
    ["id con control char", "/prueba/id%00malo", "params"]
  ])("rechaza id de ruta inválido: %s", async (_n, url, origen) => {
    const res = await request(testApp).get(url);
    expectSolicitudInvalida(res, origen);
  });

  test("rechaza caracteres de control en abordaje y descenso", async () => {
    for (const campo of ["abordaje", "descenso"]) {
      const res = await request(testApp).post("/prueba/crear").send({ ...bodyValido, [campo]: "Lugar\u0000malo" });
      expectSolicitudInvalida(res, "body");
    }
  });

  test("acepta id de ruta v?lido", async () => {
    const res = await request(testApp).get("/prueba/res-0001");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "res-0001" });
  });

  test("acepta PATCH estado válido", async () => {
    const res = await request(testApp).patch("/prueba/res-1/estado").send({ estado: "confirmada" });
    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ estado: "confirmada" });
    expect(res.body.params).toEqual({ id: "res-1" });
  });

  test("rechaza PATCH estado con campo extra o inválido", async () => {
    let res = await request(testApp).patch("/prueba/res-1/estado").send({ estado: "confirmada", extra: 1 });
    expectSolicitudInvalida(res, "body");
    res = await request(testApp).patch("/prueba/res-1/estado").send({ estado: "invalido" });
    expectSolicitudInvalida(res, "body");
  });

  test("acepta consulta válida con defaults", async () => {
    const res = await request(testApp).get("/prueba/reservas");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ page: 1, limit: 10 });
  });

  test("acepta consulta válida con filtros", async () => {
    const res = await request(testApp).get("/prueba/reservas?usuarioId=usr-1&rutaId=ruta-1&estado=pendiente&page=2&limit=50");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ usuarioId: "usr-1", rutaId: "ruta-1", estado: "pendiente", page: 2, limit: 50 });
  });

  test.each([
    ["/prueba/reservas?estado=a&estado=b"],
    ["/prueba/reservas?a[b]=c"],
    ["/prueba/reservas?page=0"],
    ["/prueba/reservas?page=1.5"],
    ["/prueba/reservas?limit=101"],
    ["/prueba/reservas?estado="],
    ["/prueba/reservas?usuarioId="],
    ["/prueba/reservas?usuarioId=bad%20id"]
  ])("rechaza consulta inválida: %s", async (url) => {
    const res = await request(testApp).get(url);
    expectSolicitudInvalida(res, "query");
  });

  test("JSON malformado responde 400 sin stack", async () => {
    const prev = process.env.GATEWAY_INTERNAL_SECRET;
    process.env.GATEWAY_INTERNAL_SECRET = "secreto-prueba";
    jest.resetModules();
    const freshApp = require("../dist/app").default;
    const res = await request(freshApp)
      .post("/reservas")
      .set("x-gateway-secret", "secreto-prueba")
      .set("Content-Type", "application/json")
      .send("{malformed");
    if (prev === undefined) delete process.env.GATEWAY_INTERNAL_SECRET;
    else process.env.GATEWAY_INTERNAL_SECRET = prev;
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe("solicitud_invalida");
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain("stack");
  });
});

describe("transicionPermitida", () => {
  const estados = ["pendiente", "confirmada", "cancelada", "completada"];
  const esperadas = {
    "pendiente->confirmada": true,
    "pendiente->cancelada": true,
    "pendiente->pendiente": false,
    "pendiente->completada": false,
    "confirmada->completada": true,
    "confirmada->cancelada": true,
    "confirmada->pendiente": false,
    "confirmada->confirmada": false,
    "cancelada->pendiente": false,
    "cancelada->confirmada": false,
    "cancelada->cancelada": false,
    "cancelada->completada": false,
    "completada->pendiente": false,
    "completada->confirmada": false,
    "completada->cancelada": false,
    "completada->completada": false
  };

  test("cubre las 16 transiciones", () => {
    const casos = [];
    for (const actual of estados) {
      for (const nuevo of estados) {
        casos.push(`${actual}->${nuevo}`);
      }
    }
    expect(casos).toHaveLength(16);
    for (const caso of casos) {
      const [actual, nuevo] = caso.split("->");
      expect(transicionPermitida(actual, nuevo)).toBe(esperadas[caso]);
    }
  });

  test("exporta ESTADOS_RESERVA", () => {
    expect(ESTADOS_RESERVA).toEqual(["pendiente", "confirmada", "cancelada", "completada"]);
  });
});
