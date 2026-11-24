import { z } from "zod";
import { parseGatewayResponse, resourceId, type GatewayTransport } from "./gateway-resource";

// Esquema provisional según la sección 5.2 de los requisitos del clúster.
const puntajeSchema = z.object({
  puntaje: z.number().min(0).max(5),
  insignia: z.enum(["nuevo", "confiable", "en_observacion", "regular"]),
  viajesCompletados: z.number().int().nonnegative(),
  tasaCancelacion: z.number().min(0).max(1),
  totalCalificaciones: z.number().int().nonnegative()
});

export type PuntajeReputacion = z.infer<typeof puntajeSchema>;

export function createReputacionClient(gateway: GatewayTransport) {
  return {
    async obtenerPuntaje(perfilId: string): Promise<PuntajeReputacion> {
      const id = encodeURIComponent(resourceId.parse(perfilId));
      const response = await gateway.request({ method: "GET", path: `/perfiles/${id}/puntaje` });
      return parseGatewayResponse(puntajeSchema, response);
    }
  };
}
