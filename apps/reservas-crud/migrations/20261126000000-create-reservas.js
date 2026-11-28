"use strict";

const { DataTypes } = require("sequelize");

const ESTADOS_RESERVA = ["pendiente", "confirmada", "cancelada", "completada"];

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable("reservas", {
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
        allowNull: false
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
        allowNull: false
      },
      estado: {
        type: DataTypes.ENUM(...ESTADOS_RESERVA),
        allowNull: false,
        defaultValue: "pendiente"
      },
      penalizacion: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
      },
      creado_en: {
        type: DataTypes.DATE,
        allowNull: false
      },
      actualizado_en: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("reservas");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_reservas_estado";');
  }
};
