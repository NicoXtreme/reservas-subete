process.env.DATABASE_URL = "postgresql://usuario:clave-secreta@127.0.0.1:5432/reservas_prueba";
process.env.GATEWAY_INTERNAL_SECRET = "secreto-prueba";

const request = require("supertest");
const { Reserva } = require("../dist/models/Reserva");
const app = require("../dist/app").default;

const SECRETO = "secreto-prueba";
const ORDEN = [["creado_en", "DESC"], ["id", "ASC"]];

function instanciaReserva(overrides = {}) {
  return Reserva.build({
    id: "res-1",
    ruta_id: "ruta-1",
    pasajero_id: "usr-1",
    cupos: 1,
    abordaje: "Universidad",
    descenso: "Chapinero",
    costo: "25.50",
    estado: "pendiente",
    penalizacion: "0.00",
    creado_en: new Date("2026-01-02T03:04:05.000Z"),
    actualizado_en: new Date("2026-01-03T04:05:06.000Z"),
    ...overrides
  }, { raw: true, isNewRecord: false });
}

function cuerpoReserva(overrides = {}) {
  return {
    id: "res-1",
    ruta_id: "ruta-1",
    pasajero_id: "usr-1",
    cupos: 1,
    abordaje: "Universidad",
    descenso: "Chapinero",
    costo: 25.5,
    estado: "pendiente",
    penalizacion: 0,
    creado_en: "2026-01-02T03:04:05.000Z",
    actualizado_en: "2026-01-03T04:05:06.000Z",
    ...overrides
  };
}

describe("GET /reservas", () => {
  let spy;

  function get(query = "") {
    return request(app).get(`/reservas${query}`).set("x-gateway-secret", SECRETO);
  }

  function llamada() {
    return spy.mock.calls[0][0];
  }

  beforeEach(() => {
    spy = jest.spyOn(Reserva, "findAndCountAll").mockResolvedValue({ rows: [], count: 0 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("sin filtros usa defaults, orden determinista y nunca raw", async () => {
    spy.mockResolvedValue({ rows: [instanciaReserva()], count: 1 });

    const res = await get().expect(200);

    expect(res.body).toEqual({
      data: [cuerpoReserva()],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
    });
    expect(llamada()).toEqual({
      where: {},
      limit: 10,
      offset: 0,
      order: ORDEN
    });
    expect(llamada()).not.toHaveProperty("raw");
  });

  test.each([
    ["?usuarioId=usr-9", { pasajero_id: "usr-9" }],
    ["?rutaId=ruta-9", { ruta_id: "ruta-9" }],
    ["?estado=confirmada", { estado: "confirmada" }],
    [
      "?usuarioId=usr-9&rutaId=ruta-9&estado=confirmada",
      { pasajero_id: "usr-9", ruta_id: "ruta-9", estado: "confirmada" }
    ]
  ])("construye el where explícito para %s", async (query, where) => {
    const res = await get(query).expect(200);

    expect(res.status).toBe(200);
    expect(llamada().where).toEqual(where);
    expect(Object.keys(llamada().where)).toEqual(Object.keys(where));
    expect(llamada().where).not.toHaveProperty("usuarioId");
    expect(llamada().where).not.toHaveProperty("rutaId");
    expect(llamada().where).not.toHaveProperty("page");
    expect(llamada().where).not.toHaveProperty("limit");
  });

  test("convierte page y limit en offset", async () => {
    const res = await get("?page=3&limit=25").expect(200);

    expect(llamada()).toEqual(expect.objectContaining({ limit: 25, offset: 50 }));
    expect(res.body.pagination).toEqual({ page: 3, limit: 25, total: 0, totalPages: 0 });
  });

  test("página fuera de rango responde 200 con lista vacía y total real", async () => {
    spy.mockResolvedValue({ rows: [], count: 23 });

    const res = await get("?page=99&limit=10").expect(200);

    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({ page: 99, limit: 10, total: 23, totalPages: 3 });
    expect(llamada().offset).toBe(980);
  });

  test("lista vacía con total cero", async () => {
    const res = await get().expect(200);

    expect(res.body).toEqual({
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 }
    });
  });

  test("expone costo y penalizacion como number aunque el modelo guarde cadenas DECIMAL", async () => {
    spy.mockResolvedValue({
      rows: [instanciaReserva({ costo: "25.50", penalizacion: "10.25" })],
      count: 1
    });

    const res = await get().expect(200);

    expect(res.body.data[0].costo).toBe(25.5);
    expect(res.body.data[0].penalizacion).toBe(10.25);
    expect(typeof res.body.data[0].costo).toBe("number");
    expect(typeof res.body.data[0].penalizacion).toBe("number");
    expect(JSON.stringify(res.body)).not.toContain('"25.50"');
    expect(JSON.stringify(res.body)).not.toContain('"10.25"');
  });

  test("serializa fechas Date a ISO y conserva las que ya son string", async () => {
    spy.mockResolvedValue({
      rows: [instanciaReserva({ actualizado_en: "2026-01-04T05:06:07Z" })],
      count: 1
    });

    const res = await get().expect(200);

    expect(res.body.data[0].creado_en).toBe("2026-01-02T03:04:05.000Z");
    expect(res.body.data[0].actualizado_en).toBe("2026-01-04T05:06:07Z");
  });

  test.each([
    "?estado=a&estado=b",
    "?page=0",
    "?limit=101",
    "?desconocido=x"
  ])("rechaza la consulta inválida %s antes de llamar al modelo", async (query) => {
    const res = await get(query).expect(400);

    expect(res.body.codigo).toBe("solicitud_invalida");
    expect(res.body.detalle.origen).toBe("query");
    expect(spy).not.toHaveBeenCalled();
  });

  test("sin cabecera del gateway responde 401 sin llamar al modelo", async () => {
    const res = await request(app).get("/reservas").expect(401);

    expect(res.body.codigo).toBe("cabecera_gateway_ausente");
    expect(spy).not.toHaveBeenCalled();
  });

  test("error de base de datos responde 500 sin mensaje ni stack", async () => {
    const error = Object.assign(new Error("select * from reservas where pasajero_id='usr-secreto'"), {
      name: "DatabaseError",
      code: "42703"
    });
    spy.mockRejectedValue(error);
    const logSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await get("?usuarioId=usr-secreto").expect(500);

    expect(res.body).toEqual({
      codigo: "error_interno",
      mensaje: "Ocurrió un error interno en el servicio.",
      detalle: {}
    });
    expect(JSON.stringify(res.body)).not.toContain("usr-secreto");
    expect(JSON.stringify(res.body)).not.toContain("42703");
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain("stack");
    const logPlano = JSON.stringify(logSpy.mock.calls);
    expect(logPlano).toContain("DatabaseError");
    expect(logPlano).toContain("42703");
    expect(logPlano).not.toContain("select * from reservas");
    expect(logPlano.toLowerCase()).not.toContain("stack");
  });
});
