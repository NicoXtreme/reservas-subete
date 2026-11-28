import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodTypeAny } from "zod";
import { CODIGO_SOLICITUD_INVALIDA, formatearErroresZod } from "../validators/reserva.validators";

type OrigenValidacion = "body" | "params" | "query";

declare global {
  namespace Express {
    interface Locals {
      validated?: {
        body?: unknown;
        params?: unknown;
        query?: unknown;
      };
    }
  }
}

function responderErrorValidacion(res: Response, origen: OrigenValidacion, error: ZodError): void {
  res.status(400).json({
    codigo: CODIGO_SOLICITUD_INVALIDA,
    mensaje: "La solicitud contiene datos inválidos.",
    detalle: {
      origen,
      errores: formatearErroresZod(error)
    }
  });
}

function crearValidador(origen: OrigenValidacion, schema: ZodTypeAny, obtenerValor: (req: Request) => unknown): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const resultado = schema.safeParse(obtenerValor(req));
    if (!resultado.success) {
      responderErrorValidacion(res, origen, resultado.error);
      return;
    }

    const validated = res.locals.validated ?? {};
    validated[origen] = resultado.data;
    res.locals.validated = validated;
    next();
  };
}

export function validarCuerpo(schema: ZodTypeAny): RequestHandler {
  return crearValidador("body", schema, (req) => req.body);
}

export function validarParametros(schema: ZodTypeAny): RequestHandler {
  return crearValidador("params", schema, (req) => req.params);
}

export function validarConsulta(schema: ZodTypeAny): RequestHandler {
  return crearValidador("query", schema, (req) => req.query);
}
