import dotenv from "dotenv";
import app from "./app";

dotenv.config();

const PORT = Number(process.env.MID_PORT) || 3002;

app.listen(PORT, () => {
  console.log(`Reservas MID running on port ${PORT}`);
});
