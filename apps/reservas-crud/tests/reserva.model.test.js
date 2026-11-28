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

function getterDe(campo) {
  const [, atributos] = cargarModelo().definicion;
  const getter = atributos[campo].get;
  expect(typeof getter).toBe("function");

  return (valor) => getter.call({ getDataValue: () => valor });
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

  test("declara costo y penalizacion como DECIMAL(10, 2)", () => {
    const [, atributos] = cargarModelo().definicion;

    for (const campo of ["costo", "penalizacion"]) {
      expect(atributos[campo].type.key).toBe("DECIMAL");
      expect(atributos[campo].type._precision).toBe(10);
      expect(atributos[campo].type._scale).toBe(2);
    }
  });

  test("normaliza los montos a number en ambos getters", () => {
    for (const campo of ["costo", "penalizacion"]) {
      const leer = getterDe(campo);

      expect(leer("25.50")).toBe(25.5);
      expect(leer("0.00")).toBe(0);
      expect(leer(25.5)).toBe(25.5);
      expect(leer("0.12345678901234567890")).toBe(Number("0.12345678901234567890"));
      expect(Number.isFinite(leer("0.12345678901234567890"))).toBe(true);
      expect(leer(-1)).toBe(-1);
    }
  });

  test("devuelve undefined cuando la instancia aún no tiene el monto", () => {
    for (const campo of ["costo", "penalizacion"]) {
      expect(getterDe(campo)(undefined)).toBeUndefined();
    }
  });

  test.each([null, "", "abc"])("rechaza %p en los getters de monto", (valor) => {
    for (const campo of ["costo", "penalizacion"]) {
      const leer = getterDe(campo);

      if (valor === null) {
        expect(() => leer(valor)).toThrow(`${campo} no puede ser null.`);
      } else if (valor === "") {
        expect(() => leer(valor)).toThrow(`${campo} no puede ser una cadena vacía.`);
      } else {
        expect(() => leer(valor)).toThrow(`${campo} debe ser un número finito`);
      }
    }
  });
});
