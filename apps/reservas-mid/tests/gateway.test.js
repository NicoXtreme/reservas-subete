const request = require("supertest");
const app = require("../dist/app").default;

const testSecret = "secreto-ficticio";
const protectedRoute = "/prueba-protegida";

app.get(protectedRoute, (_req, res) => res.sendStatus(204));

describe("Protección del gateway en reservas-mid", () => {
  const originalSecret = process.env.GATEWAY_INTERNAL_SECRET;

  beforeEach(() => {
    process.env.GATEWAY_INTERNAL_SECRET = testSecret;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.GATEWAY_INTERNAL_SECRET;
    } else {
      process.env.GATEWAY_INTERNAL_SECRET = originalSecret;
    }
  });

  test("mantiene /health accesible sin cabecera ni secreto configurado", async () => {
    delete process.env.GATEWAY_INTERNAL_SECRET;
    await request(app).get("/health").expect(200, {
      service: "reservas-mid",
      status: "OK"
    });
  });

  test("responde 401 si falta la cabecera", async () => {
    await request(app).get(protectedRoute).expect(401, {
      codigo: "cabecera_gateway_ausente",
      mensaje: "Se requiere la cabecera interna del gateway.",
      detalle: {}
    });
  });

  test.each([testSecret.toUpperCase(), "incorrecto"])(
    "responde 403 ante un secreto incorrecto (%s)",
    async (incorrectSecret) => {
      await request(app).get(protectedRoute)
        .set("x-gateway-secret", incorrectSecret).expect(403, {
          codigo: "cabecera_gateway_invalida",
          mensaje: "La cabecera interna del gateway no es válida.",
          detalle: {}
        });
    }
  );

  test("permite una petición con el secreto correcto", async () => {
    await request(app).get(protectedRoute)
      .set("x-gateway-secret", testSecret).expect(204);
  });

  test.each([undefined, "", " "])(
    "rechaza una petición si el secreto configurado es %p",
    async (configuredSecret) => {
      if (configuredSecret === undefined) {
        delete process.env.GATEWAY_INTERNAL_SECRET;
      } else {
        process.env.GATEWAY_INTERNAL_SECRET = configuredSecret;
      }

      await request(app).get(protectedRoute)
        .set("x-gateway-secret", testSecret).expect(503, {
          codigo: "servicio_no_disponible",
          mensaje: "El servicio no está disponible.",
          detalle: {}
        });
    }
  );
});
