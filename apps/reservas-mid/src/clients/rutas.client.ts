import { z } from "zod";
import { parseGatewayResponse, resourceId, type GatewayTransport } from "./gateway-resource";

const coordenadas = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90)
]);
const lugar = z.object({
  nombre: z.string().min(1),
  punto: z.object({
    type: z.literal("Point"),
    coordinates: coordenadas
  })
});
const estadoRuta = z.enum(["abierta", "llena", "cerrada"]);
const cuposDisponibles = z.number().int().min(0).max(6);

// Esquemas provisionales según la sección 4.1 de los requisitos del clúster.
const rutaSchema = z.object({
  id: resourceId,
  conductorId: resourceId,
  origen: lugar,
  destino: lugar,
  trazado: z.object({
    type: z.literal("LineString"),
    coordinates: z.array(coordenadas).min(2)
  }),
  salida: z.string().datetime({ offset: true })
    .refine((value) => Number.isFinite(Date.parse(value))),
  cuposTotales: z.number().int().min(1).max(6),
  cuposDisponibles,
  precioTotal: z.number().finite().nonnegative(),
  estado: estadoRuta
}).refine((ruta) => ruta.cuposDisponibles <= ruta.cuposTotales, {
  path: ["cuposDisponibles"],
  message: "Los cupos disponibles superan los cupos totales."
});

const actualizacionCuposSchema = z.object({ cuposDisponibles, estado: estadoRuta });
const deltaSchema = z.union([z.literal(-1), z.literal(1)]);

export type Ruta = z.infer<typeof rutaSchema>;
export type ActualizacionCupos = z.infer<typeof actualizacionCuposSchema>;

export function createRutasClient(gateway: GatewayTransport) {
  return {
    async obtenerRuta(rutaId: string): Promise<Ruta> {
      const id = encodeURIComponent(resourceId.parse(rutaId));
      const response = await gateway.request({ method: "GET", path: `/rutas/${id}` });
      return parseGatewayResponse(rutaSchema, response);
    },

    async actualizarCupos(rutaId: string, delta: number): Promise<ActualizacionCupos> {
      const id = encodeURIComponent(resourceId.parse(rutaId));
      // El clúster aún debe acordar los deltas para operaciones de varios cupos.
      const data = { delta: deltaSchema.parse(delta) };
      const response = await gateway.request({ method: "PATCH", path: `/rutas/${id}/cupos`, data });
      return parseGatewayResponse(actualizacionCuposSchema, response);
    }
  };
}
