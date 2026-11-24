const { ZodError } = require("zod");
const { GatewayError } = require("../dist/clients/gateway.client");
const { createRutasClient } = require("../dist/clients/rutas.client");

const ruta = {
  id: "ruta-0001",
  conductorId: "usr-12",
  origen: { nombre: "Chapinero", punto: { type: "Point", coordinates: [-74.0645, 4.6486] } },
  destino: { nombre: "Universidad", punto: { type: "Point", coordinates: [-74.0415, 4.7012] } },
  trazado: { type: "LineString", coordinates: [[-74.0645, 4.6486], [-74.0415, 4.7012]] },
  salida: "2026-11-21T06:30:00Z",
  cuposTotales: 3,
  cuposDisponibles: 2,
  precioTotal: 12000,
  estado: "abierta"
};

let request;
let client;

beforeEach(() => {
  request = jest.fn().mockResolvedValue(ruta);
  client = createRutasClient({ request });
});

test("consulta el detalle con GET y codifica el ID para el gateway", async () => {
  await expect(client.obtenerRuta("ruta ñ?#")).resolves.toEqual(ruta);
  expect(request.mock.calls).toEqual([[{ method: "GET", path: "/rutas/ruta%20%C3%B1%3F%23" }]]);
});

test.each([[-1, "llena", 0], [1, "abierta", 1]])(
  "envía delta %i por PATCH y valida el resultado provisional",
  async (delta, estado, cuposDisponibles) => {
    request.mockResolvedValue({ estado, cuposDisponibles });
    await expect(client.actualizarCupos("ruta-0001", delta)).resolves.toEqual({
      estado, cuposDisponibles
    });
    expect(request.mock.calls).toEqual([[{
      method: "PATCH", path: "/rutas/ruta-0001/cupos", data: { delta }
    }]]);
  }
);

test.each(["", "  ", "..", "ruta/a", "ruta\\a", "%2e%2e", "ruta\n", "\uD800", 1])(
  "rechaza un identificador inválido antes de contactar al gateway (%p)", async (id) => {
    await expect(client.obtenerRuta(id)).rejects.toBeInstanceOf(ZodError);
    await expect(client.actualizarCupos(id, -1)).rejects.toBeInstanceOf(ZodError);
    expect(request).not.toHaveBeenCalled();
  }
);

test.each([0, -2, 2, 1.5, "1", NaN])("rechaza el delta provisional no admitido (%p)", async (delta) => {
  await expect(client.actualizarCupos(ruta.id, delta)).rejects.toBeInstanceOf(ZodError);
  expect(request).not.toHaveBeenCalled();
});

test.each(["abierta", "llena", "cerrada"])("admite una ruta %s", async (estado) => {
  request.mockResolvedValue({ ...ruta, estado, cuposDisponibles: estado === "llena" ? 0 : 2 });
  await expect(client.obtenerRuta(ruta.id)).resolves.toMatchObject({ estado });
});

test("valida GeoJSON en orden longitud, latitud incluso donde la longitud excede 90 grados", async () => {
  const origen = { ...ruta.origen, punto: { type: "Point", coordinates: [-120, 40] } };
  const trazado = { type: "LineString", coordinates: [[-120, 40], [-121, 41]] };
  request.mockResolvedValue({ ...ruta, origen, trazado });
  await expect(client.obtenerRuta(ruta.id)).resolves.toMatchObject({ origen, trazado });
});

test.each([
  { estado: "cancelada" },
  { conductorId: undefined },
  { cuposDisponibles: 4 },
  { cuposTotales: 7 },
  { precioTotal: -1 },
  { salida: "2026-11-21T06:30:00" },
  { origen: { nombre: "Origen", punto: { type: "Point", coordinates: [40, -120] } } },
  { destino: { nombre: "Destino", punto: { type: "LineString", coordinates: [-74, 4] } } },
  { trazado: { type: "LineString", coordinates: [[-74, 4]] } },
  { trazado: { type: "LineString", coordinates: [[-74, 4], [181, 4]] } }
])("trata una respuesta de detalle incompatible como 502 (%p)", async (fields) => {
  request.mockResolvedValue({ ...ruta, ...fields });
  await expect(client.obtenerRuta(ruta.id)).rejects.toMatchObject({
    status: 502, codigo: "respuesta_dependencia_incompatible", detalle: {}
  });
});

test("rechaza el éxito incompatible de PATCH sin repetir la escritura", async () => {
  request.mockResolvedValue({ estado: "llena" });
  await expect(client.actualizarCupos(ruta.id, -1)).rejects.toMatchObject({
    status: 502, codigo: "respuesta_dependencia_incompatible"
  });
  expect(request).toHaveBeenCalledTimes(1);
});

test("conserva el 404 del gateway en la consulta y al actualizar cupos", async () => {
  const error = new GatewayError(404, "request");
  request.mockRejectedValue(error);
  await expect(client.obtenerRuta(ruta.id)).rejects.toBe(error);
  await expect(client.actualizarCupos(ruta.id, -1)).rejects.toBe(error);
  expect(request).toHaveBeenCalledTimes(2);
});

test("preserva 409 sin_cupos y no repite PATCH", async () => {
  const error = new GatewayError(409, "request", {
    codigo: "sin_cupos", mensaje: "No hay cupos.", detalle: { disponibles: 0 }
  });
  request.mockRejectedValue(error);
  await expect(client.actualizarCupos(ruta.id, -1)).rejects.toBe(error);
  expect(request).toHaveBeenCalledTimes(1);
});

test("conserva el 503 del gateway sin repetir PATCH", async () => {
  const error = new GatewayError(503, "request");
  request.mockRejectedValue(error);
  await expect(client.actualizarCupos(ruta.id, 1)).rejects.toBe(error);
  expect(request).toHaveBeenCalledTimes(1);
});
