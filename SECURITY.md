# Seguridad

## Modelo de amenazas

Babel GRC es una aplicación estática que funciona por completo en el navegador. No tiene servidor, cuentas, base de datos remota ni telemetría.

| Activo | Dónde está | Riesgo principal | Medidas |
|---|---|---|---|
| Proyectos (estados, responsables, evidencias) | `localStorage` del navegador | Pérdida o acceso por otra persona con acceso al equipo | Copias de seguridad en JSON; los datos no salen del equipo |
| Marcos importados | `localStorage` | Archivo malicioso o mal formado | Validación y normalización: tipos, longitudes, referencias e ids con formato fijo |
| PDF de normas | Memoria del navegador (no se guarda) | PDF malicioso | pdf.js 4.10 con `isEvalSupported: false`, en un worker; solo se extrae texto, sin ejecutar scripts ni cargar fuentes; límite de 60 MB |
| Archivos exportados (CSV, Excel) | Equipo del usuario | Inyección de fórmulas al abrirlos | Neutralización de celdas que empiezan con `=`, `+`, `-`, `@`, tabulación o retorno |
| Código de la aplicación | GitHub Pages | Inyección de scripts | CSP estricta con hashes y SRI |

## Controles

- **Content-Security-Policy** (meta): `default-src 'none'`; scripts permitidos solo por hash SHA-256 (bloque inline) y por hash SHA-384 de `vendor/exceljs.min.js` y `vendor/pdf.min.mjs`; estilos solo por hash; `connect-src 'self'` y `worker-src 'self'` (worker y mapas de caracteres del lector de PDF, servidos por el propio sitio); `form-action 'none'`, `base-uri 'none'` y `object-src 'none'`. No hay `unsafe-inline` ni `unsafe-eval`.
- **Sin atributos `style` ni manejadores inline.** Los anchos y colores dinámicos se aplican con CSSOM.
- **Escapado** de todo el texto antes de insertarlo en el DOM.
- **Importación**: archivos de hasta 8 MB; Excel leído como texto plano, sin evaluar fórmulas; límites de filas y columnas; ids validados con expresiones regulares; acceso a propiedades con `hasOwnProperty` para evitar contaminación de prototipos.
- **Dependencias**: ninguna en ejecución salvo ExcelJS y pdf.js, que se cargan bajo demanda desde el mismo origen con SRI. `npm audit` se ejecuta en CI.

`frame-ancestors` no puede declararse en una etiqueta meta. Si se despliega fuera de GitHub Pages, conviene enviar la CSP y `X-Frame-Options` como cabeceras HTTP.

## Cómo informar una vulnerabilidad

Abrí un *security advisory* privado en GitHub (pestaña **Security › Report a vulnerability**) o contactá al autor. No publiques detalles en issues abiertos hasta que haya una corrección.
