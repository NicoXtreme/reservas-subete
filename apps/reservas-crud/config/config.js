const path = require("node:path");
const {
  cargarEntorno,
  seleccionarConfiguracion,
  verificarBaseSegura
} = require("../dist/config/db-common.js");

cargarEntorno(path.resolve(__dirname, "../../../.env"));

function configurar(entornoAplicacion) {
  const configuracion = seleccionarConfiguracion(process.env, entornoAplicacion);

  if (entornoAplicacion === "test") {
    verificarBaseSegura(configuracion, process.env);
  }

  return configuracion;
}

module.exports = {
  get development() {
    return configurar("development");
  },
  get test() {
    return configurar("test");
  },
  get production() {
    return configurar("production");
  }
};
