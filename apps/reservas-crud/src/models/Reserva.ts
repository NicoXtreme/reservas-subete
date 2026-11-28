import { DataTypes, type Model } from "sequelize";
import { sequelize } from "../config/database";

const ESTADOS_RESERVA = ["pendiente", "confirmada", "cancelada", "completada"] as const;

export type EstadoReserva = (typeof ESTADOS_RESERVA)[number];

export type MontoDecimalBD = string | number;

export interface ReservaAttributes {
  id: string;
  ruta_id: string;
  pasajero_id: string;
  cupos: number;
  abordaje: string;
  descenso: string;
  costo: number;
  estado: EstadoReserva;
  penalizacion: number;
  creado_en: Date;
  actualizado_en: Date;
}

export interface ReservaFilaBD extends Omit<ReservaAttributes, "costo" | "penalizacion"> {
  costo: MontoDecimalBD;
  penalizacion: MontoDecimalBD;
}

export function normalizarMonto(
  valor: MontoDecimalBD | null | undefined,
  campo: "costo" | "penalizacion"
): number | undefined {
  if (valor === undefined) {
    return undefined;
  }

  if (valor === null) {
    throw new Error(`${campo} no puede ser null.`);
  }

  if (typeof valor === "string" && valor.trim() === "") {
    throw new Error(`${campo} no puede ser una cadena vacía.`);
  }

  const numero = typeof valor === "number" ? valor : Number(valor);

  if (!Number.isFinite(numero)) {
    throw new Error(`${campo} debe ser un número finito (recibido: ${String(valor)}).`);
  }

  return numero;
}

export type ReservaCreationAttributes = Omit<ReservaAttributes, "estado" | "penalizacion" | "creado_en" | "actualizado_en"> &
  Partial<Pick<ReservaAttributes, "estado" | "penalizacion" | "creado_en" | "actualizado_en">>;

type ReservaModel = Model<ReservaAttributes, ReservaCreationAttributes>;

export const Reserva = sequelize.define<ReservaModel, ReservaCreationAttributes>(
  "Reserva",
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    ruta_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    pasajero_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    cupos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 }
    },
    abordaje: {
      type: DataTypes.STRING,
      allowNull: false
    },
    descenso: {
      type: DataTypes.STRING,
      allowNull: false
    },
    costo: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { min: 0 },
      get(this: ReservaModel): number | undefined {
        return normalizarMonto(
          this.getDataValue("costo") as unknown as MontoDecimalBD | null | undefined,
          "costo"
        );
      }
    },
    estado: {
      type: DataTypes.ENUM(...ESTADOS_RESERVA),
      allowNull: false,
      defaultValue: "pendiente"
    },
    penalizacion: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
      get(this: ReservaModel): number | undefined {
        return normalizarMonto(
          this.getDataValue("penalizacion") as unknown as MontoDecimalBD | null | undefined,
          "penalizacion"
        );
      }
    },
    creado_en: {
      type: DataTypes.DATE,
      allowNull: false
    },
    actualizado_en: {
      type: DataTypes.DATE,
      allowNull: false
    }
  },
  {
    tableName: "reservas",
    timestamps: true,
    createdAt: "creado_en",
    updatedAt: "actualizado_en"
  }
);
