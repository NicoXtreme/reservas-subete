import { Router } from "express";
import { listarReservas } from "../controllers/reservas.controller";
import { validarConsulta } from "../middlewares/validation.middleware";
import { listarReservasQuerySchema } from "../validators/reserva.validators";

export const reservasRouter = Router();

reservasRouter.get("/", validarConsulta(listarReservasQuerySchema), listarReservas);
