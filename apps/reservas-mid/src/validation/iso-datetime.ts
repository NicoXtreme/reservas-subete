import { z } from "zod";

const zonedDateTime = z.iso.datetime({ offset: true });

// Zod 3 aceptaba segundos omitidos y offsets compactos. Valida la forma
// equivalente con Zod 4 y conserva el valor original en el contrato.
export const isoDateTimeWithOffset = z.string().refine((value) => {
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
    .replace(/(T\d{2}:\d{2})(?=Z$|[+-]\d{2}:\d{2}$)/, "$1:00");
  return zonedDateTime.safeParse(normalized).success && Number.isFinite(Date.parse(value));
}, { error: "Fecha no válida." });
