import dotenv from "dotenv";
import app from "./app";

dotenv.config();

const PORT = Number(process.env.CRUD_PORT) || 3001;

app.listen(PORT, () => {
  console.log(`Reservas CRUD running on port ${PORT}`);
});
