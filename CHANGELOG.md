# Cambios

## 1.2.0 · 2026-10-05

Importación de marcos desde PDF.

- **Asistente PDF** en *Marcos normativos*: lectura en el navegador con pdf.js (el archivo no sale del equipo), detección de requisitos por artículos, cláusulas numeradas (con prefijo de anexo), códigos de control o secciones; limpieza de índices, encabezados, pies y referencias cruzadas.
- **Sugerencia de controles** por similitud de texto (TF-IDF con diccionario español/inglés). Contra los mapeos curados: primera sugerencia correcta en el 76–86 % de los casos, alguna de las tres en el 81–90 % (DORA en español e inglés, ISO/IEC 27001).
- Revisión antes de crear el marco: incluir o excluir requisitos, editar títulos, alternar enlace total o parcial, quitar o agregar controles; los artículos de forma (objeto, definiciones, entrada en vigor) vienen desmarcados.
- Opción de guardar un extracto del texto original (400 caracteres por requisito) con aviso de derechos de autor.
- CSP: `worker-src 'self'` y `connect-src 'self'` para el lector de PDF; SRI para `vendor/pdf.min.mjs`.
- Nuevo módulo `src/engine/babel-pdf.js` con 8 pruebas unitarias y 1 E2E sobre un PDF ficticio.

## 1.1.0 · 2026-10-05

Fotos del período: pruebas verificables del estado de cumplimiento en un momento dado.

- **Exportar › Foto del período**: período, desde/hasta, autor y nota. Descarga un Excel (hoja «Foto» con los datos del período, el cumplimiento por marco y el código de verificación, más SoA, controles, plan y alertas) y un JSON con el mismo contenido, sellados con SHA-256.
- **Verificar una foto**: recalcula el código e indica si la foto está íntegra o fue alterada; la compara con el estado actual o con otra foto (variación por marco, requisitos que mejoran o empeoran y controles que cambiaron de estado).
- Motor: `snapshot`, `sealSnapshot`, `verifySnapshot` y `compareSnapshots`.
- Pruebas: 2 unitarias y 1 E2E nuevas (29 y 10 en total).

## 1.0.1 · 2026-10-05

Corrección de visualización: contenidos que se salían de las tarjetas.

- Fichas de marcos: la columna de valores ya no se desborda con URLs, versiones o nombres largos.
- Títulos de marco con un único componente (`fwTitle`) que ajusta el nombre en varias líneas; cabeceras de tarjeta que no aprietan el título.
- Grids y flex sin desbordes por contenido (`minmax(0, 1fr)`, `min-width: 0`) y corte de palabras largas.
- Móvil: un nombre de proyecto largo ya no ensancha la página; las etiquetas accesibles de las tablas ya no generan desplazamiento horizontal.
- Resumen: el botón «Ver requisitos» pasa al pie de cada tarjeta.
- Nueva prueba E2E: importa un marco con textos extremos y verifica que ningún contenido se desborda en todas las vistas y paneles, a 1440, 1000 y 390 px.

## 1.0.0 · 2026-10-05

Primera versión.

- Catálogo común de 147 controles en 14 dominios.
- Marcos incluidos: ISO/IEC 27001:2022 (25 requisitos de cláusulas y 93 controles del Anexo A) y DORA, Reglamento (UE) 2022/2554 (109 requisitos de los arts. 5–30 y 45).
- Marcos ampliables: importación desde Excel o JSON con validación, controles propios por marco, editor de mapeos y exportación a JSON y Excel; los marcos agregados en `frameworks/` se publican con GitHub Actions.
- Vistas: Inicio, Resumen, Requisitos y SoA, Controles, Equivalencias, Brechas y coherencia (10 reglas), Plan de acción, Marcos normativos, Exportar y Ayuda.
- Exportación a Excel (SoA por marco, controles, plan y alertas), Markdown, CSV, JSON y copia de seguridad.
- Caso de ejemplo con una entidad de pago ficticia.
- CSP con hashes, SRI y neutralización de fórmulas.
- Pruebas: 27 de `node:test` y 8 E2E con Playwright.
