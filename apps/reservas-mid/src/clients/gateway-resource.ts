import { z } from "zod";
import { GatewayError, type createGatewayClient } from "./gateway.client";

export type GatewayTransport = Pick<ReturnType<typeof createGatewayClient>, "request">;

export const resourceId = z.string().min(1).refine(
  (id) => id === id.trim() && id !== "." && id !== ".." &&
    !/[/%\\\u0000-\u001F\u007F\uD800-\uDFFF]/u.test(id),
  { error: "El identificador debe ser un segmento de ruta válido." }
);

export function parseGatewayResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new GatewayError(502, "request", {
      codigo: "respuesta_dependencia_incompatible",
      mensaje: "La dependencia devolvió una respuesta incompatible.",
      detalle: {}
    });
  }
  return parsed.data;
}
