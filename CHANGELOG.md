# Cambios

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
