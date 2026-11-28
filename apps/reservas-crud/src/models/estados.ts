export const ESTADOS_RESERVA = ["pendiente", "confirmada", "cancelada", "completada"] as const;

export type EstadoReserva = (typeof ESTADOS_RESERVA)[number];

const TRANSICIONES_PERMITIDAS: Record<EstadoReserva, readonly EstadoReserva[]> = {
  pendiente: ["confirmada", "cancelada"],
  confirmada: ["completada", "cancelada"],
  cancelada: [],
  completada: []
};

export function transicionPermitida(actual: EstadoReserva, nuevo: EstadoReserva): boolean {
  return TRANSICIONES_PERMITIDAS[actual].includes(nuevo);
}
