# Evaluación de seguridad de Sequelize y uuid (N17)

**Fecha** 2026-11-25, Colombia. Evaluación del [issue #18](https://github.com/NicoXtreme/reservas-subete/issues/18) sobre `origin/main` en `77d750235c8d052dabd47522ca4dee552fab05b7`, con Node.js 22.18.0 y npm 10.9.3.

**Revalidación** 2026-11-26 sobre `fc97f370c23e25d3cb5e5ab2c2487388e83b89dc`. Se repitieron ambas auditorías y la inspección del árbol instalado. Se confirmó que Sequelize 6.37.8 sigue siendo la versión `latest` publicada y requiere `uuid@^8.3.2`. Los resultados de auditoría de la tabla se mantuvieron.

## Evidencia reproducible

Desde la raíz del monorepo, con las dependencias instaladas según el lockfile:

```sh
npm audit --json
npm audit --omit=dev --json
npm ls sequelize uuid zod --all
npm view sequelize@6 version dependencies.uuid --json
npm view sequelize dist-tags --json
npm view uuid@11.1.1 version type engines exports --json
npm view uuid dist-tags --json
```

| Comando | Salida | Resultado |
| --- | --- | --- |
| `npm audit --json` | 1 | Dos entradas moderadas, ninguna informativa, baja, alta o crítica. |
| `npm audit --omit=dev --json` | 1 | Las mismas dos entradas moderadas en producción. |
| `npm ls sequelize uuid zod --all` | 0 | `reservas-crud → sequelize@6.37.8 → uuid@8.3.2`. Ambos workspaces usan `zod@4.6.7`, con una instalación compartida. |

Las entradas de `node_modules/uuid` (transitiva) y `node_modules/sequelize` (directa en el CRUD) corresponden a **un solo aviso**, GHSA-w5hq-g745-h8pq / CVE-2026-41907. Sequelize aparece por depender de `uuid`. npm clasifica ambas entradas como moderadas y devuelve código 1 por los hallazgos. El JSON también incluye una puntuación CVSS 3.1 de 7.5 para el aviso. GitHub clasifica el aviso como moderado y enumera los rangos afectados `<11.1.1`, `>=12.0.0 <12.0.1` y `>=13.0.0 <13.0.1`. [Aviso del mantenedor](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq) · [GitHub Advisory Database](https://github.com/advisories/GHSA-w5hq-g745-h8pq)

Los resultados actuales coinciden con las dos entradas restantes que recoge [PROGRESS.md](PROGRESS.md) después de la actualización de Zod. El aviso alto anterior de Zod sigue ausente en ambas auditorías. [Aviso histórico de Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)

## Exposición en Reservas

El aviso afecta la comprobación de límites al generar UUID v3, v5 o v6 cuando la función recibe explícitamente un búfer de salida. La revisión de la instalación de Sequelize 6.37.8 encontró llamadas a `v1()` y `v4()` sin argumentos en `lib/utils.js` (valores predeterminados), y a `v4()` sin argumentos en `lib/dialects/abstract/query-generator.js` (delimitador de funciones) y `lib/dialects/abstract/query-generator/transaction.js` (identificadores de transacción). Esas llamadas quedan fuera de la condición del aviso. `uuid@8.3.2` exporta v3 y v5, pero no v6. [Código de Sequelize 6.37.8](https://github.com/sequelize/sequelize/tree/v6.37.8/src) · [Exportaciones de uuid 8.3.2](https://github.com/uuidjs/uuid/blob/v8.3.2/src/index.js)

En la revisión de los dos directorios `src`, no aparecieron imports de Sequelize ni llamadas a generadores UUID. El CRUD registra `/health`, el middleware del gateway y el parser JSON, y aún carece de un flujo de persistencia en esta base. No se encontró un recorrido desde una petición HTTP hasta una función afectada. **La exposición de la aplicación no está determinada**. Esta revisión estática se limita a la base evaluada y debe repetirse al integrar el CRUD, las migraciones y los seeders.

## Alternativas y recomendación

| Alternativa | Evaluación |
| --- | --- |
| Actualizar dentro de Sequelize 6 | npm publica `6.37.8` como `latest`, y esta versión exige `uuid@^8.3.2`. La serie 6 publicada no resuelve a la versión corregida. Revisar una futura actualización oficial que cambie esa dependencia y confirmar la resolución en el lockfile. |
| Usar `uuid@11.1.1` con Sequelize 6 | Es la corrección más próxima del aviso y exporta una entrada `require` de Node, pero queda fuera del rango declarado por Sequelize. Una instalación directa no garantiza reemplazar la copia transitiva. Una sustitución forzada o un parche mantenido por el equipo exige autorización, pruebas de compatibilidad y mantenimiento propio. |
| Aplicar la sugerencia de npm | `fixAvailable` propone `sequelize@3.30.0` y marca el cambio como mayor. Descartar ese retroceso por romper la línea 6 acordada e introducir riesgo de incompatibilidad y regresiones. |
| Mantener Sequelize 6 y limitar el uso | Revisar con Daniel Gómez que el código de persistencia no use generadores afectados con búferes de salida. Para nuevos identificadores v4, si el contrato lo permite, se puede usar `node:crypto.randomUUID()` o una función de PostgreSQL. Esto reduce las vías de exposición por código propio y deja el hallazgo transitivo abierto. |

Los metadatos consultados muestran `uuid@14.0.3` como `latest` y `11.1.1` como `legacy-11`. La disponibilidad de una versión posterior de uuid no establece su compatibilidad con Sequelize 6. [Metadatos de Sequelize](https://registry.npmjs.org/sequelize/latest) · [Metadatos de uuid 11.1.1](https://registry.npmjs.org/uuid/11.1.1)

**Recomendación.** Mantener las versiones actuales mientras se busca una publicación compatible de Sequelize 6, revisar la alcanzabilidad con Daniel Gómez al incorporar persistencia y volver a ejecutar ambas auditorías antes del despliegue. Para aceptar una futura actualización, comprobar una instalación limpia en Node.js 22 y Docker, importación CommonJS, generación y validación de identificadores, arranque y conexión a PostgreSQL, migraciones y seeders, operaciones CRUD y transacciones. Verificar luego el árbol resuelto y las dos auditorías. Si aparece una ruta alcanzable al código afectado o se necesita desplegar con el aviso abierto, revisar la decisión con el equipo.

**Riesgo residual.** `uuid@8.3.2` sigue instalado en producción como dependencia transitiva del CRUD. Las futuras rutas de persistencia o cambios en el árbol de dependencias pueden alterar la exposición. La evaluación no aplica una corrección.

## Seguimiento separado de TLS en DG01

En el SHA revisado `e3fb861f85607aa50068440202b511c0450db3d1` del PR #67, `DB_SSL=true` configura `rejectUnauthorized: false`. El tráfico se cifra, pero el cliente omite la verificación de la identidad del servidor. La corrección sigue pendiente en DG01, cuyo PR se cerró temporalmente sin fusionar. La recomendación es verificar el certificado y el nombre del servidor con una CA de confianza y probar en un entorno aislado tanto la conexión válida como el rechazo de un certificado no confiable. Es un hallazgo de configuración del PR. No corresponde al aviso de `uuid` ni a una vulnerabilidad confirmada de Sequelize. [Código revisado](https://github.com/NicoXtreme/reservas-subete/blob/e3fb861f85607aa50068440202b511c0450db3d1/apps/reservas-crud/src/config/database.ts#L71) · [PR #67](https://github.com/NicoXtreme/reservas-subete/pull/67) · [TLS en Azure PostgreSQL](https://learn.microsoft.com/en-us/azure/postgresql/security/security-tls-how-to-connect)
