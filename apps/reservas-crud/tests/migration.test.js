const migracion = require("../migrations/20261126000000-create-reservas");

function queryInterfaceFalso() {
  return {
    createTable: jest.fn(async () => undefined),
    dropTable: jest.fn(async () => undefined),
    sequelize: {
      query: jest.fn(async () => undefined)
    }
  };
}

describe("Migración de reservas", () => {
  test("up crea la tabla con DECIMAL(10, 2), ENUM y valores por defecto", async () => {
    const queryInterface = queryInterfaceFalso();

    await migracion.up(queryInterface);

    expect(queryInterface.createTable).toHaveBeenCalledTimes(1);
    const [nombre, atributos] = queryInterface.createTable.mock.calls[0];

    expect(nombre).toBe("reservas");
    expect(Object.keys(atributos)).toEqual([
      "id",
      "ruta_id",
      "pasajero_id",
      "cupos",
      "abordaje",
      "descenso",
      "costo",
      "estado",
      "penalizacion",
      "creado_en",
      "actualizado_en"
    ]);
    expect(atributos.costo.allowNull).toBe(false);
    expect(atributos.costo.type.key).toBe("DECIMAL");
    expect(atributos.costo.type.options).toEqual({ precision: 10, scale: 2 });
    expect(atributos.estado.allowNull).toBe(false);
    expect(atributos.estado.type.values).toEqual(["pendiente", "confirmada", "cancelada", "completada"]);
    expect(atributos.estado.defaultValue).toBe("pendiente");
    expect(atributos.penalizacion.allowNull).toBe(false);
    expect(atributos.penalizacion.type.options).toEqual({ precision: 10, scale: 2 });
    expect(atributos.penalizacion.defaultValue).toBe(0);
    expect(atributos.creado_en.allowNull).toBe(false);
    expect(atributos.actualizado_en.allowNull).toBe(false);
  });

  test("down elimina la tabla antes que el tipo ENUM", async () => {
    const queryInterface = queryInterfaceFalso();

    await migracion.down(queryInterface);

    expect(queryInterface.dropTable).toHaveBeenCalledWith("reservas");
    expect(queryInterface.sequelize.query).toHaveBeenCalledWith('DROP TYPE IF EXISTS "enum_reservas_estado";');
    expect(queryInterface.dropTable.mock.invocationCallOrder[0]).toBeLessThan(
      queryInterface.sequelize.query.mock.invocationCallOrder[0]
    );
  });
});
