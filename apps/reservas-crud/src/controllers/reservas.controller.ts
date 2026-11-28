import type { RequestHandler, Response } from "express";
import type { EstadoReserva } from "../models/estados";
import { consultarReservas } from "../repositories/reservas.repository";
import type { ListarReservasQueryInput } from "../validators/reserva.validators";

export interface ReservaSerializada {
  id: string;
  ruta_id: string;
  pasajero_id: string;
  cupos: number;
  abordaje: string;
  descenso: string;
  costo: number;
  estado: EstadoReserva;
  penalizacion: number;
  creado_en: string;
  actualizado_en: string;
}

interface InstanciaReserva {
  get(opciones: { plain: true }): unknown;
}

function fechaContrato(valor: unknown): string {
  return valor instanceof Date ? valor.toISOString() : (valor as string);
}

export function serializarReserva(instancia: InstanciaReserva): ReservaSerializada {
  const plano = instancia.get({ plain: true }) as Record<string, unknown>;

  return {
    id: plano.id as string,
    ruta_id: plano.ruta_id as string,
    pasajero_id: plano.pasajero_id as string,
    cupos: plano.cupos as number,
    abordaje: plano.abordaje as string,
    descenso: plano.descenso as string,
    costo: plano.costo as number,
    estado: plano.estado as EstadoReserva,
    penalizacion: plano.penalizacion as number,
    creado_en: fechaContrato(plano.creado_en),
    actualizado_en: fechaContrato(plano.actualizado_en)
  };
}

function consultaValidada(res: Response): ListarReservasQueryInput {
  const consulta = res.locals.validated?.query;
  if (consulta === undefined) {
    throw new Error("La consulta validada no está disponible.");
  }
  return consulta as ListarReservasQueryInput;
}

export const listarReservas: RequestHandler = async (_req, res, next) => {
  try {
    const consulta = consultaValidada(res);
    const { rows, total } = await consultarReservas(consulta);

    res.status(200).json({
      data: rows.map((fila) => serializarReserva(fila)),
      pagination: {
        page: consulta.page,
        limit: consulta.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / consulta.limit)
      }
    });
  } catch (error) {
    next(error);
  }
};
