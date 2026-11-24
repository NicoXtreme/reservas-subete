import axios, { type AxiosRequestConfig } from "axios";
import { z } from "zod";

interface TokenContract {
  encode(clientId: string, clientSecret: string): {
    body: string;
    contentType: string;
  };
  decode(body: unknown): { accessToken: string; expiresInSeconds: number };
}

interface GatewayOptions {
  url: string;
  tokenPath: string;
  clientId: string;
  clientSecret: string;
  timeoutMs: number;
  readRetries: number;
  tokenContract?: TokenContract;
}

interface GatewayRequest {
  method: "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  params?: Record<string, string | number | boolean>;
  data?: unknown;
}

const tokenResponse = z.object({
  access_token: z.string(),
  expires_in: z.number()
});

const businessErrorResponse = z.object({
  codigo: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  mensaje: z.string().min(1).max(500),
  detalle: z.record(z.string(), z.unknown())
});

type BusinessError = z.infer<typeof businessErrorResponse>;

const clientCredentialsForm: TokenContract = {
  encode(clientId, clientSecret) {
    return {
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret
      }).toString(),
      contentType: "application/x-www-form-urlencoded"
    };
  },
  decode(body) {
    const parsed = tokenResponse.parse(body);
    return { accessToken: parsed.access_token, expiresInSeconds: parsed.expires_in };
  }
};

export class GatewayError extends Error {
  readonly codigo?: string;
  readonly mensaje?: string;
  readonly detalle?: Record<string, unknown>;

  constructor(
    public readonly status: number,
    public readonly stage: "token" | "request",
    businessError?: BusinessError
  ) {
    super(`El gateway respondió con un error (${status}, ${stage}).`);
    this.name = "GatewayError";
    this.codigo = businessError?.codigo;
    this.mensaje = businessError?.mensaje;
    this.detalle = businessError?.detalle;
  }
}

export function createGatewayClient(options: GatewayOptions) {
  let gateway: URL;
  try {
    gateway = new URL(options.url);
  } catch {
    throw new Error("GATEWAY_URL debe ser un origen HTTP(S) sin credenciales.");
  }
  if (!["https:", "http:"].includes(gateway.protocol) || gateway.username ||
      gateway.password || gateway.pathname !== "/" || gateway.search || gateway.hash) {
    throw new Error("GATEWAY_URL debe ser un origen HTTP(S) sin credenciales.");
  }
  if (!options.clientId.trim() || !options.clientSecret.trim() ||
      !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 ||
      options.timeoutMs > 2_147_483_647 ||
      !Number.isInteger(options.readRetries) || options.readRetries < 0 || options.readRetries > 3) {
    throw new Error("Configuración inválida del cliente del gateway.");
  }

  function resolvePath(path: string) {
    if (!path.startsWith("/") || path.startsWith("//") || /[\\\s]/.test(path)) {
      throw new Error("Se requiere una ruta con raíz en el gateway.");
    }
    const url = new URL(path, gateway.origin);
    if (url.origin !== gateway.origin || url.hash) {
      throw new Error("La ruta debe pertenecer al gateway y carecer de fragmento.");
    }
    return url.href;
  }

  const tokenUrl = resolvePath(options.tokenPath);
  const contract = options.tokenContract ?? clientCredentialsForm;
  const http = axios.create({
    adapter: "http",
    maxRedirects: 0,
    proxy: false,
    timeout: options.timeoutMs
  });

  function readBusinessError(body: unknown, token: string): BusinessError | undefined {
    const parsed = businessErrorResponse.safeParse(body);
    if (!parsed.success) return;

    const payload = JSON.stringify(parsed.data);
    const sensitiveContent = /"(?:authorization|cookie|set-cookie|[^"]*(?:secret|secreto|token|password|contrase(?:ñ|n)a|credencial|credential|api[_-]?key|stack|trace)[^"]*)"\s*:|\bBearer\s+|\beyJ[\w-]+\.[\w-]+\.[\w-]+/i;
    const secrets = [options.clientSecret, token];
    if (payload.length > 4096 || sensitiveContent.test(payload) ||
        secrets.some((secret) => payload.includes(JSON.stringify(secret).slice(1, -1)))) {
      return;
    }
    return parsed.data;
  }

  async function send<T>(config: AxiosRequestConfig, stage: GatewayError["stage"], token?: string) {
    try {
      const response = await http.request<T>({
        ...config,
        signal: AbortSignal.timeout(options.timeoutMs)
      });
      return response.data;
    } catch (error) {
      const response = axios.isAxiosError(error) ? error.response : undefined;
      const status = response && response.status >= 400 ? response.status : 503;
      const businessError = token && response && status >= 400 && status < 500 &&
        status !== 401 && status !== 403
        ? readBusinessError(response.data, token)
        : undefined;
      throw new GatewayError(status, stage, businessError);
    }
  }

  interface CachedToken {
    value: string;
    expiresAt: number;
    replacement?: Promise<CachedToken>;
  }
  let cachedToken: CachedToken | undefined;
  let pendingToken: Promise<CachedToken> | undefined;

  async function requestToken(): Promise<CachedToken> {
    const startedAt = Date.now();
    let encoded: ReturnType<TokenContract["encode"]>;
    try {
      encoded = contract.encode(options.clientId, options.clientSecret);
    } catch {
      throw new GatewayError(503, "token");
    }
    const response = await send<unknown>({
      method: "POST",
      url: tokenUrl,
      data: encoded.body,
      headers: { "Content-Type": encoded.contentType }
    }, "token");

    try {
      const { accessToken, expiresInSeconds } = contract.decode(response);
      const lifetime = expiresInSeconds * 1000;
      const expiresAt = startedAt + lifetime - Math.min(5000, lifetime / 10);
      if (!/^[A-Za-z0-9._~+/-]+=*$/.test(accessToken) ||
          !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw new Error("Respuesta de token inválida.");
      }
      cachedToken = { value: accessToken, expiresAt };
      return cachedToken;
    } catch {
      throw new GatewayError(503, "token");
    }
  }

  function getToken(): Promise<CachedToken> {
    if (cachedToken && Date.now() < cachedToken.expiresAt) {
      return Promise.resolve(cachedToken);
    }
    pendingToken ??= requestToken().finally(() => { pendingToken = undefined; });
    return pendingToken;
  }

  return {
    async request<T = unknown>({ method, path, params, data }: GatewayRequest): Promise<T> {
      const url = resolvePath(path);
      const canRetryRead = ["GET", "HEAD", "OPTIONS"].includes(method);
      let remainingReadRetries = canRetryRead ? options.readRetries : 0;
      let refreshed = false;
      let token = await getToken();

      for (;;) {
        try {
          return await send<T>({
            method, url, params, data,
            headers: { Authorization: `Bearer ${token.value}` }
          }, "request", token.value);
        } catch (error) {
          if (!(error instanceof GatewayError)) throw error;
          if (error.status === 401) {
            if (cachedToken === token) cachedToken = undefined;
            if (!canRetryRead || refreshed) throw error;
            refreshed = true;
            token.replacement ??= getToken();
            token = await token.replacement;
          } else if (error.status === 503 && remainingReadRetries > 0) {
            remainingReadRetries--;
            token = await getToken();
          } else {
            throw error;
          }
        }
      }
    }
  };
}

export function createGatewayClientFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const format = env.GATEWAY_TOKEN_FORMAT ?? "form";
  if (format !== "form" && format !== "json") {
    throw new Error("GATEWAY_TOKEN_FORMAT debe ser form o json.");
  }
  const tokenContract = format === "form" ? clientCredentialsForm : {
    ...clientCredentialsForm,
    encode: (clientId: string, clientSecret: string) => ({
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret
      }),
      contentType: "application/json"
    })
  };
  return createGatewayClient({
    url: env.GATEWAY_URL ?? "",
    tokenPath: env.GATEWAY_TOKEN_PATH ?? "/token",
    clientId: env.GATEWAY_CLIENT_ID ?? "",
    clientSecret: env.GATEWAY_CLIENT_SECRET ?? "",
    timeoutMs: Number(env.GATEWAY_TIMEOUT_MS ?? 3000),
    readRetries: Number(env.GATEWAY_READ_RETRIES ?? 1),
    tokenContract
  });
}
