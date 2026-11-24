const { ZodError } = require("zod");
const { GatewayError } = require("../dist/clients/gateway.client");
const { createReputacionClient } = require("../dist/clients/reputacion.client");

const puntaje = {
  puntaje: 4.6,
  insignia: "confiable",
  viajesCompletados: 7,
  tasaCancelacion: 0.05,
  totalCalificaciones: 4
};

let request;
let client;

beforeEach(() => {
  request = jest.fn().mockResolvedValue(puntaje);
  client = createReputacionClient({ request });
});

test("solicita el puntaje por GET al gateway con el ID codificado", async () => {
  await expect(client.obtenerPuntaje("perfil ñ?#")).resolves.toEqual(puntaje);
  expect(request.mock.calls).toEqual([[{
    method: "GET", path: "/perfiles/perfil%20%C3%B1%3F%23/puntaje"
  }]]);
});

test.each(["", ".", "..", "grupo/perfil", " perfil ", null])(
  "valida el identificador sin contactar al gateway (%p)", async (id) => {
    await expect(client.obtenerPuntaje(id)).rejects.toBeInstanceOf(ZodError);
    expect(request).not.toHaveBeenCalled();
  }
);

test.each(["nuevo", "confiable", "en_observacion", "regular"])(
  "devuelve la insignia %s para que el MID aplique sus propias reglas", async (insignia) => {
    request.mockResolvedValue({ ...puntaje, insignia });
    await expect(client.obtenerPuntaje("usr-12")).resolves.toEqual({ ...puntaje, insignia });
  }
);

test.each([
  { puntaje: 5.1 }, { puntaje: "4.6" }, { insignia: "bloqueado" },
  { viajesCompletados: 1.5 }, { tasaCancelacion: 5 },
  { totalCalificaciones: -1 }, { totalCalificaciones: undefined }
])("traduce una respuesta incompatible a 502 (%p)", async (fields) => {
  request.mockResolvedValue({ ...puntaje, ...fields });
  await expect(client.obtenerPuntaje("usr-12")).rejects.toMatchObject({
    status: 502, codigo: "respuesta_dependencia_incompatible", detalle: {}
  });
});

test.each([404, 503])("conserva el error %i recibido del gateway", async (status) => {
  const error = new GatewayError(status, "request");
  request.mockRejectedValue(error);
  await expect(client.obtenerPuntaje("usr-12")).rejects.toBe(error);
  expect(request).toHaveBeenCalledTimes(1);
});
