# Cambios

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
