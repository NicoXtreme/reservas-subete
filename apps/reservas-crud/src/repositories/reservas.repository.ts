import type { Order } from "sequelize";
import { Reserva } from "../models/Reserva";
import type { ListarReservasQueryInput } from "../validators/reserva.validators";

type FilaReserva = InstanceType<typeof Reserva>;

export interface ResultadoListarReservas {
  rows: FilaReserva[];
  total: number;
}

const ORDEN_RESERVAS: Order = [
  ["creado_en", "DESC"],
  ["id", "ASC"]
];

export function construirWhereReservas(consulta: ListarReservasQueryInput): Record<string, string> {
  const where: Record<string, string> = {};

  if (consulta.usuarioId !== undefined) {
    where.pasajero_id = consulta.usuarioId;
  }
  if (consulta.rutaId !== undefined) {
    where.ruta_id = consulta.rutaId;
  }
  if (consulta.estado !== undefined) {
    where.estado = consulta.estado;
  }

  return where;
}

export async function consultarReservas(consulta: ListarReservasQueryInput): Promise<ResultadoListarReservas> {
  const { rows, count } = await Reserva.findAndCountAll({
    where: construirWhereReservas(consulta),
    limit: consulta.limit,
    offset: (consulta.page - 1) * consulta.limit,
    order: ORDEN_RESERVAS
  });

  return { rows, total: count };
}
