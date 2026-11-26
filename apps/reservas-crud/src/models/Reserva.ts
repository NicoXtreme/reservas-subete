import { DataTypes, type Model } from "sequelize";
import { sequelize } from "../config/database";

const ESTADOS_RESERVA = ["pendiente", "confirmada", "cancelada", "completada"] as const;

export type EstadoReserva = (typeof ESTADOS_RESERVA)[number];

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
      type: DataTypes.DECIMAL,
      allowNull: false,
      validate: { min: 0 }
    },
    estado: {
      type: DataTypes.ENUM(...ESTADOS_RESERVA),
      allowNull: false,
      defaultValue: "pendiente"
    },
    penalizacion: {
      type: DataTypes.DECIMAL,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 }
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
