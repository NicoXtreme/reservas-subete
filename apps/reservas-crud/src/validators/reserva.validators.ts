import { z } from "zod";
import { ESTADOS_RESERVA } from "../models/estados";

const MAX_COSTO = 99_999_999.99;
const MAX_CUPOS = 2_147_483_647;
const MAX_CAMPO = 100;
const MAX_ERROR_CAMPO = 100;
const MAX_ERRORES = 20;
const REGEX_ID_SEGURO = /^[^\s\x00-\x1f\x7f]+$/;
const REGEX_CONTROL = /[\x00-\x1f\x7f]/;
const REGEX_ENTERO = /^\d+$/;

export const CODIGO_SOLICITUD_INVALIDA = "solicitud_invalida";

export interface ErrorValidacion {
  campo: string;
  motivo: string;
}

function limitarCampo(campo: string): string {
  const texto = campo || "solicitud";
  return texto.length > MAX_ERROR_CAMPO ? texto.slice(0, MAX_ERROR_CAMPO) : texto;
}

function motivoIssue(issue: z.ZodIssue): string {
  if (issue.code === "unrecognized_keys") {
    return "Campos no permitidos.";
  }
  if (issue.code === "invalid_type") {
    if (issue.expected === "string") return "Debe ser una cadena.";
    if (issue.expected === "number") return "Debe ser un número.";
    if (issue.expected === "integer") return "Debe ser un entero.";
    if (issue.expected === "object") return "Debe ser un objeto.";
    return "Tipo de dato inválido.";
  }
  if (issue.code === "too_small") {
    if (issue.origin === "string") return "No puede estar vacío.";
    return "Valor fuera del rango permitido.";
  }
  if (issue.code === "too_big") {
    if (issue.origin === "string") return "Supera la longitud máxima permitida.";
    return "Valor fuera del rango permitido.";
  }
  if (issue.code === "invalid_value") return "Valor no permitido.";
  if (issue.code === "custom" && typeof issue.message === "string" && issue.message) {
    return issue.message;
  }
  return "Valor inválido.";
}

export function formatearErroresZod(error: z.ZodError): ErrorValidacion[] {
  const errores = error.issues.slice(0, MAX_ERRORES).map((issue) => ({
    campo: limitarCampo(issue.path.map(String).join(".")),
    motivo: motivoIssue(issue)
  }));
  return errores.length > 0 ? errores : [{ campo: "solicitud", motivo: "Valor inválido." }];
}

function tieneMaximoDosDecimales(valor: number): boolean {
  return Math.round(valor * 100) / 100 === valor;
}

const idSchema = z
  .string({ message: "Debe ser una cadena." })
  .min(1, "No puede estar vacío.")
  .max(MAX_CAMPO, "Supera la longitud máxima permitida.")
  .regex(REGEX_ID_SEGURO, "Contiene caracteres no permitidos.");

const textoUbicacionSchema = z
  .string({ message: "Debe ser una cadena." })
  .trim()
  .min(1, "No puede estar vacío.")
  .max(200, "Supera la longitud máxima permitida.")
  .refine((valor) => !REGEX_CONTROL.test(valor), "Contiene caracteres de control no permitidos.");

const costoSchema = z
  .number({ message: "Debe ser un número." })
  .finite("Debe ser un número finito.")
  .min(0, "Debe ser mayor o igual a 0.")
  .max(MAX_COSTO, "Supera el costo máximo permitido.")
  .refine(tieneMaximoDosDecimales, "Debe tener máximo 2 decimales.");

export const crearReservaSchema = z
  .object({
    ruta_id: idSchema,
    pasajero_id: idSchema,
    cupos: z
      .number({ message: "Debe ser un número." })
      .int("Debe ser un entero.")
      .min(1, "Debe ser mayor o igual a 1.")
      .max(MAX_CUPOS, "Valor fuera del rango permitido."),
    abordaje: textoUbicacionSchema,
    descenso: textoUbicacionSchema,
    costo: costoSchema
  })
  .strict();

export const actualizarEstadoReservaSchema = z
  .object({
    estado: z.enum(ESTADOS_RESERVA, { message: "Valor no permitido." })
  })
  .strict();

export const reservaIdParamSchema = z
  .object({
    id: idSchema
  })
  .strict();

function schemaQueryEntero(opciones: { min: number; max: number; default: number }) {
  return z.preprocess((valor) => {
    if (valor === undefined) return opciones.default;
    if (typeof valor !== "string") return valor;
    if (valor === "" || !REGEX_ENTERO.test(valor)) return valor;
    return Number(valor);
  }, z.number({ message: "Debe ser un entero." }).int("Debe ser un entero.").min(opciones.min, "Valor fuera del rango permitido.").max(opciones.max, "Valor fuera del rango permitido."));
}

function rechazarValorConsultaNoSimple(valor: unknown): unknown {
  if (valor === undefined) return undefined;
  if (typeof valor !== "string") return valor;
  if (valor === "") return valor;
  return valor;
}

export const listarReservasQuerySchema = z
  .object({
    usuarioId: z.preprocess(rechazarValorConsultaNoSimple, idSchema.optional()),
    rutaId: z.preprocess(rechazarValorConsultaNoSimple, idSchema.optional()),
    estado: z.preprocess(
      rechazarValorConsultaNoSimple,
      z.enum(ESTADOS_RESERVA, { message: "Valor no permitido." }).optional()
    ),
    page: schemaQueryEntero({ min: 1, max: 1_000_000, default: 1 }),
    limit: schemaQueryEntero({ min: 1, max: 100, default: 10 })
  })
  .strict();

export type CrearReservaInput = z.infer<typeof crearReservaSchema>;
export type ActualizarEstadoReservaInput = z.infer<typeof actualizarEstadoReservaSchema>;
export type ReservaIdParamInput = z.infer<typeof reservaIdParamSchema>;
export type ListarReservasQueryInput = z.infer<typeof listarReservasQuerySchema>;
