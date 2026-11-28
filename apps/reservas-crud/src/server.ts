import dotenv from "dotenv";
import app from "./app";
import { testConnection } from "./config/database";

dotenv.config();

const PORT = Number(process.env.CRUD_PORT) || 3001;

export async function startServer(): Promise<void> {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`Reservas CRUD running on port ${PORT}`);
  });
}

export function ejecutarServidor(): void {
  startServer().catch((error: unknown) => {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    console.error(`Reservas CRUD no pudo iniciar. ${mensaje}`);
    process.exit(1);
  });
}

if (require.main === module) {
  ejecutarServidor();
}
