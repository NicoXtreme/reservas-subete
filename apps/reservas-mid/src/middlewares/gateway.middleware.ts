import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const gatewayMiddleware: RequestHandler = (req, res, next) => {
  const receivedSecret = req.get("x-gateway-secret");
  if (receivedSecret === undefined) {
    res.status(401).json({
      codigo: "cabecera_gateway_ausente",
      mensaje: "Se requiere la cabecera interna del gateway.",
      detalle: {}
    });
    return;
  }

  const configuredSecret = process.env.GATEWAY_INTERNAL_SECRET;
  if (!configuredSecret?.trim()) {
    res.status(503).json({
      codigo: "servicio_no_disponible",
      mensaje: "El servicio no está disponible.",
      detalle: {}
    });
    return;
  }

  const expected = Buffer.from(configuredSecret, "utf8");
  const received = Buffer.from(receivedSecret, "utf8");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    res.status(403).json({
      codigo: "cabecera_gateway_invalida",
      mensaje: "La cabecera interna del gateway no es válida.",
      detalle: {}
    });
    return;
  }

  next();
};
