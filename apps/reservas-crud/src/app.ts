import express, { type NextFunction, type Request, type Response } from "express";
import { gatewayMiddleware } from "./middlewares/gateway.middleware";
import { CODIGO_SOLICITUD_INVALIDA } from "./validators/reserva.validators";

const app = express();

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "reservas-crud",
    status: "OK"
  });
});

app.use(gatewayMiddleware);
app.use(express.json());

// Registrar rutas de negocio antes de app.use(manejadorErrores).
export function manejadorErrores(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const err = error as { type?: unknown; status?: unknown; name?: string; message?: string };
  const esErrorBodyParser =
    typeof err?.type === "string" &&
    typeof err?.status === "number" &&
    err.status >= 400 &&
    err.status < 500;
  if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large" || esErrorBodyParser) {
    res.status(400).json({
      codigo: CODIGO_SOLICITUD_INVALIDA,
      mensaje: "La solicitud contiene datos inválidos.",
      detalle: {
        origen: "body",
        errores: [{ campo: "body", motivo: "JSON inválido o cuerpo no procesable." }]
      }
    });
    return;
  }

  console.error("Error no controlado en reservas-crud", {
    nombre: err?.name ?? "Error",
    mensaje: typeof err?.message === "string" ? err.message : "Error no identificado"
  });

  res.status(500).json({
    codigo: "error_interno",
    mensaje: "Ocurrió un error interno en el servicio.",
    detalle: {}
  });
}

app.use(manejadorErrores);

export default app;
