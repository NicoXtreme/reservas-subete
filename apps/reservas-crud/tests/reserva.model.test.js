const mockDefine = jest.fn((nombre, atributos, opciones) => ({ nombre, atributos, opciones }));

jest.mock("../dist/config/database", () => ({
  sequelize: {
    define: (...args) => mockDefine(...args)
  }
}));

function cargarModelo() {
  jest.resetModules();
  mockDefine.mockClear();

  const modulo = require("../dist/models/Reserva");

  return { modulo, definicion: mockDefine.mock.calls[0] };
}

describe("Modelo Reserva de reservas-crud", () => {
  test("usa la conexión Sequelize existente sobre la tabla reservas", () => {
    const { modulo, definicion } = cargarModelo();
    const [nombre, , opciones] = definicion;

    expect(nombre).toBe("Reserva");
    expect(modulo.Reserva).toEqual(expect.objectContaining({ nombre: "Reserva" }));
    expect(opciones).toEqual(expect.objectContaining({
      tableName: "reservas",
      timestamps: true,
      createdAt: "creado_en",
      updatedAt: "actualizado_en"
    }));
  });

  test("declara los campos oficiales como obligatorios", () => {
    const [, atributos] = cargarModelo().definicion;

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

    for (const atributo of Object.values(atributos)) {
      expect(atributo.allowNull).toBe(false);
    }

    expect(atributos.id).toEqual(expect.objectContaining({ primaryKey: true, allowNull: false }));
    expect(atributos.id).not.toHaveProperty("defaultValue");
  });

  test("usa los tipos definidos en el borrador OpenAPI", () => {
    const [, atributos] = cargarModelo().definicion;
    const tiposEsperados = {
      id: "STRING",
      ruta_id: "STRING",
      pasajero_id: "STRING",
      cupos: "INTEGER",
      abordaje: "STRING",
      descenso: "STRING",
      costo: "DECIMAL",
      estado: "ENUM",
      penalizacion: "DECIMAL",
      creado_en: "DATE",
      actualizado_en: "DATE"
    };

    for (const [campo, tipo] of Object.entries(tiposEsperados)) {
      expect(atributos[campo].type.key).toBe(tipo);
    }
  });

  test("limita los estados y aplica los valores por defecto acordados", () => {
    const [, atributos] = cargarModelo().definicion;

    expect(atributos.estado.type.values).toEqual([
      "pendiente",
      "confirmada",
      "cancelada",
      "completada"
    ]);
    expect(atributos.estado.defaultValue).toBe("pendiente");
    expect(atributos.penalizacion.defaultValue).toBe(0);
  });

  test("valida cupos y montos sin agregar restricciones no oficiales", () => {
    const [, atributos, opciones] = cargarModelo().definicion;

    expect(atributos.cupos.validate).toEqual({ min: 1 });
    expect(atributos.costo.validate).toEqual({ min: 0 });
    expect(atributos.penalizacion.validate).toEqual({ min: 0 });

    for (const atributo of Object.values(atributos)) {
      expect(atributo.unique).toBeUndefined();
    }
    expect(opciones).not.toHaveProperty("indexes");
  });
});
