const { createServer } = require("node:http");
const express = require("express");
const {
  createGatewayClient,
  createGatewayClientFromEnv
} = require("../dist/clients/gateway.client");

let server;
let url;
let calls;
let onToken;
let onResource;

function client(overrides = {}) {
  return createGatewayClient({
    url,
    tokenPath: "/auth",
    clientId: "mid-prueba",
    clientSecret: "credencial-ficticia",
    timeoutMs: 1000,
    readRetries: 1,
    ...overrides
  });
}

const read = { method: "GET", path: "/recurso" };

beforeEach(async () => {
  calls = [];
  let issued = 0;
  onToken = (_req, res) => res.json({
    access_token: `token-ficticio-${++issued}`,
    expires_in: 60
  });
  onResource = (_req, res) => res.json({ ok: true });
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    calls.push({
      path: req.path, method: req.method, headers: req.headers,
      body: req.body, query: req.query
    });
    next();
  });
  app.post("/auth", (req, res) => onToken(req, res));
  app.all("/recurso", (req, res) => onResource(req, res));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("solicita Client Credentials una vez para peticiones concurrentes y reutiliza el token", async () => {
  const gateway = client();
  await Promise.all([gateway.request(read), gateway.request(read)]);
  await expect(gateway.request(read)).resolves.toEqual({ ok: true });
  expect(calls.map(({ path }) => path)).toEqual(["/auth", "/recurso", "/recurso", "/recurso"]);
  expect(calls[0].body).toEqual({
    grant_type: "client_credentials",
    client_id: "mid-prueba",
    client_secret: "credencial-ficticia"
  });
  expect(calls[0].headers.authorization).toBeUndefined();
  for (const call of calls.slice(1)) {
    expect(call.headers.authorization).toBe("Bearer token-ficticio-1");
    expect(call.body).toEqual({});
  }
  for (const call of calls) {
    expect(call.headers["x-gateway-secret"]).toBeUndefined();
  }
});

test("admite configuración JSON desde el entorno y transmite parámetros y cuerpo de la operación", async () => {
  const gateway = createGatewayClientFromEnv({
    GATEWAY_URL: url,
    GATEWAY_TOKEN_PATH: "/auth",
    GATEWAY_TOKEN_FORMAT: "json",
    GATEWAY_CLIENT_ID: "mid-prueba",
    GATEWAY_CLIENT_SECRET: "credencial-ficticia",
    GATEWAY_INTERNAL_SECRET: "valor-interno-ficticio"
  });
  await gateway.request({
    method: "PATCH", path: read.path, params: { activo: true }, data: { valor: 2 }
  });
  expect(calls[0].headers["content-type"]).toMatch(/^application\/json/);
  expect(calls[0].body.grant_type).toBe("client_credentials");
  expect(calls[1]).toMatchObject({
    method: "PATCH", query: { activo: "true" }, body: { valor: 2 }
  });
  expect(calls.every(({ headers }) => !("x-gateway-secret" in headers))).toBe(true);
});

test("renueva el token antes del vencimiento", async () => {
  const gateway = client();
  const now = jest.spyOn(Date, "now");
  try {
    await gateway.request(read);
    now.mockReturnValue(Date.now() + 56_000);
    await gateway.request(read);
    expect(calls.filter(({ path }) => path === "/auth")).toHaveLength(2);
  } finally {
    now.mockRestore();
  }
});

test("renueva y repite una petición que recibe 401", async () => {
  onResource = (req, res) => req.get("authorization") === "Bearer token-ficticio-1"
    ? res.sendStatus(401) : res.json({ ok: true });
  await expect(client().request(read)).resolves.toEqual({ ok: true });
  expect(calls.map(({ path }) => path)).toEqual(["/auth", "/recurso", "/auth", "/recurso"]);
});

test("comparte una sola renovación ante dos respuestas 401 concurrentes", async () => {
  const rejected = [];
  onResource = (req, res) => {
    if (req.get("authorization") === "Bearer token-ficticio-1") {
      rejected.push(res);
      if (rejected.length === 2) {
        rejected.forEach((response) => response.sendStatus(401));
      }
      return;
    }
    res.json({ ok: true });
  };

  const gateway = client();
  await expect(Promise.all([gateway.request(read), gateway.request(read)]))
    .resolves.toEqual([{ ok: true }, { ok: true }]);
  expect(calls.filter(({ path }) => path === "/auth")).toHaveLength(2);
  const resourceCalls = calls.filter(({ path }) => path === "/recurso");
  expect(resourceCalls.map(({ headers }) => headers.authorization)).toEqual([
    "Bearer token-ficticio-1", "Bearer token-ficticio-1",
    "Bearer token-ficticio-2", "Bearer token-ficticio-2"
  ]);
});

test("detiene la recuperación tras un segundo 401 y descarta el token rechazado", async () => {
  onResource = (_req, res) => res.sendStatus(401);
  const gateway = client();
  await expect(gateway.request(read)).rejects.toMatchObject({ status: 401, stage: "request" });
  expect(calls).toHaveLength(4);
  onResource = (_req, res) => res.json({ ok: true });
  await gateway.request(read);
  expect(calls.at(-1).headers.authorization).toBe("Bearer token-ficticio-3");
});

test.each([403, 404, 409])("conserva el estado %i sin repetir la solicitud", async (status) => {
  onResource = (_req, res) => res.sendStatus(status);
  await expect(client().request(read)).rejects.toMatchObject({ status, stage: "request" });
  expect(calls).toHaveLength(2);
});

test("expone el código sin_cupos y los detalles seguros para la lógica del MID", async () => {
  const errorBody = {
    codigo: "sin_cupos",
    mensaje: "No hay cupos disponibles.",
    detalle: { solicitados: 2, disponibles: 0 }
  };
  onResource = (_req, res) => res.status(409).json({
    ...errorBody,
    campoInterno: "dato-no-publicado"
  });
  const error = await client().request({ ...read, method: "PATCH" }).catch((failure) => failure);
  expect(error).toMatchObject({
    status: 409, stage: "request", ...errorBody
  });
  expect(error).not.toHaveProperty("campoInterno");
  expect(calls).toHaveLength(2);
});

test.each([
  { metadata: { authorization: "dato-ficticio" } },
  { valor: "credencial-ficticia" },
  { valor: "token-ficticio-1" }
])("omite el cuerpo de error si contiene datos sensibles (%p)", async (detalle) => {
  onResource = (_req, res) => res.status(409).json({
    codigo: "sin_cupos", mensaje: "No hay cupos.", detalle
  });
  await expect(client().request(read)).rejects.toMatchObject({
    status: 409, mensaje: undefined, detalle: undefined
  });
});

test.each([["GET", 2], ["PATCH", 1]])("limita los reintentos de %s ante 503", async (method, attempts) => {
  onResource = (_req, res) => res.sendStatus(503);
  await expect(client().request({ ...read, method })).rejects.toMatchObject({
    status: 503, stage: "request"
  });
  expect(calls.filter(({ path }) => path === "/recurso")).toHaveLength(attempts);
});

test.each([0, 2])("respeta el máximo configurado de %i reintentos adicionales", async (readRetries) => {
  onResource = (_req, res) => res.sendStatus(503);
  await expect(client({ readRetries }).request(read)).rejects.toMatchObject({ status: 503 });
  expect(calls.filter(({ path }) => path === "/recurso")).toHaveLength(1 + readRetries);
});

describe.each(["POST", "PUT", "PATCH", "DELETE"])("solicitudes %s", (method) => {
  test.each([401, 503])("no se reenvían ante un HTTP %i", async (status) => {
    onResource = (_req, res) => res.sendStatus(status);
    await expect(client().request({ ...read, method })).rejects.toMatchObject({
      status, stage: "request"
    });
    expect(calls.map(({ path }) => path)).toEqual(["/auth", "/recurso"]);
  });

  test.each(["timeout", "conexión interrumpida"])("no se reenvían ante %s", async (failure) => {
    onResource = (req) => {
      if (failure === "conexión interrumpida") req.socket.destroy();
    };
    await expect(client({ timeoutMs: 300 }).request({ ...read, method }))
      .rejects.toMatchObject({ status: 503, stage: "request" });
    expect(calls.map(({ path }) => path)).toEqual(["/auth", "/recurso"]);
  });
});

test("convierte un timeout en 503 con error sanitizado", async () => {
  onResource = () => {};
  await expect(client({ timeoutMs: 150, readRetries: 0 }).request(read)).rejects.toMatchObject({
    status: 503, stage: "request"
  });
});

test("rechaza una respuesta de token inválida sin propagar el contenido", async () => {
  onToken = (_req, res) => res.json({ access_token: "token-ficticio" });
  await expect(client().request(read)).rejects.toMatchObject({ status: 503, stage: "token" });
  expect(calls).toHaveLength(1);
});

test.each(["https://example.test/recurso", "//example.test/recurso", "/\\example.test/recurso"])(
  "rechaza la ruta externa %s antes de pedir credenciales",
  async (path) => {
    const gateway = client();
    await expect(gateway.request({ ...read, path })).rejects.toThrow();
    expect(() => client({ tokenPath: path })).toThrow();
    expect(calls).toHaveLength(0);
  }
);

test.each(["token", "request"])("impide redirecciones en la etapa %s", async (stage) => {
  const redirect = (_req, res) => res.redirect(307, `${url}/receptor`);
  if (stage === "token") onToken = redirect;
  else onResource = redirect;
  await expect(client({ readRetries: 0 }).request(read)).rejects.toMatchObject({
    status: 503, stage
  });
  expect(calls.map(({ path }) => path)).toEqual(stage === "token" ? ["/auth"] : ["/auth", "/recurso"]);
});
