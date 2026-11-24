import express from "express";
import { gatewayMiddleware } from "./middlewares/gateway.middleware";

const app = express();

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "reservas-mid",
    status: "OK"
  });
});

app.use(gatewayMiddleware);
app.use(express.json());

export default app;
