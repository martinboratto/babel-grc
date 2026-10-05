# Marcos normativos

Cada archivo `*.json` de esta carpeta es un marco. En cada push, `scripts/build.mjs` los lee, los valida y los incrusta en la aplicación. **Para agregar un marco, agregá un archivo aquí.** No hace falta tocar código.

| Archivo | Marco | Requisitos |
|---|---|---:|
| `iso27001-2022.json` | ISO/IEC 27001:2022: cláusulas 4–10 y 93 controles del Anexo A | 118 |
| `dora.json` | DORA, Reglamento (UE) 2022/2554: arts. 5–30 y 45 | 109 |

## Pasos

1. Prepará el marco de alguna de estas formas:
   - con la plantilla [`../templates/plantilla-marco.xlsx`](../templates/plantilla-marco.xlsx) y `npm run xlsx-a-marco -- tu-marco.xlsx`;
   - importándolo en la aplicación (*Marcos normativos › Agregar un marco*), completando los mapeos y usando **JSON** en su tarjeta;
   - escribiendo el JSON a mano con el esquema [`../schema/framework.schema.json`](../schema/framework.schema.json).
2. Guardalo como `frameworks/<id>.json`. El nombre del archivo debe coincidir con el `id`.
3. Ejecutá `npm run validate` (o dejá que lo haga GitHub Actions).
4. Hacé commit y push. El workflow **Pages** publica la nueva versión.

## Formato

```jsonc
{
  "$schema": "../schema/framework.schema.json",
  "id": "bcra-a7724",                    // minúsculas, números, . _ - (2–49)
  "order": 10,                           // opcional: orden en la aplicación
  "name": "BCRA · Comunicación A 7724",
  "shortName": "BCRA A7724",
  "version": "2023",
  "publisher": "Banco Central de la República Argentina",
  "jurisdiction": "Argentina · entidades financieras",
  "type": "regulacion",
  "color": "#C2410C",                    // #RRGGBB
  "url": "https://www.bcra.gob.ar/",     // solo https
  "description": "…",
  "notice": "Resúmenes propios; no reproduce el texto oficial.",
  "groups": [{ "id": "2", "title": "Sección 2 · Gobierno" }],
  "requirements": [
    {
      "id": "A7724-2.1",                 // único dentro del marco
      "ref": "Secc. 2.1",                // referencia visible
      "group": "2",
      "title": "Marco de gestión de riesgos tecnológicos",
      "summary": "Resumen propio del requisito.",
      "excludable": false,               // false = no se puede excluir de la SoA
      "note": "Opcional: aclaraciones de aplicabilidad.",
      "mappings": [
        { "control": "RIE-01", "strength": "full" },
        { "control": "GOB-02", "strength": "partial" },
        { "control": "GOB-12", "strength": "related" }
      ]
    }
  ],
  "controls": [                          // opcional: controles que no existen en el catálogo
    { "id": "FIN-01", "domain": "FIN", "title": "…", "description": "…" }
  ]
}
```

## Criterios de mapeo

| Fuerza | Peso | Cuándo usarla |
|---|---:|---|
| `full` (total) | 1 | Implantar el control satisface el requisito por completo. |
| `partial` (parcial) | 0,5 | El control cubre una parte del requisito. Si un requisito solo tiene enlaces parciales, su cobertura no supera el 50 %. |
| `related` (relación) | 0 | Vínculo informativo: aparece en las equivalencias, pero no cuenta para el cumplimiento. |

Recomendaciones:

- **Antes de crear un control nuevo, buscalo en el catálogo** (`catalog/controls.json` o la hoja *Catalogo* de la plantilla). Reutilizar controles es lo que genera las equivalencias entre marcos.
- Un requisito amplio suele tener un enlace total al control principal y parciales a los complementarios.
- Marcá `excludable: false` en lo que el marco declara obligatorio (por ejemplo, cláusulas de sistema de gestión).
- Usá `note` para limitaciones de aplicabilidad (por ejemplo, «solo entidades designadas»).
- **Derechos de autor:** si el texto del marco está protegido (normas ISO, IEC y similares), escribí títulos y resúmenes propios.
- Si una autoridad publica una correspondencia oficial entre marcos, preferila frente al criterio propio e indicalo en `notice`.

## Qué valida `npm run validate`

- `id` con formato válido, único y coincidente con el nombre del archivo; `name` obligatorio.
- Requisitos con `id` único y `title`.
- Cada `mappings[].control` existe en el catálogo o en los `controls` del propio marco; `strength` es `full`, `partial` o `related`.
- Controles nuevos con id `DOM-NN`, sin pisar los del catálogo.
- Avisos (no bloquean): requisitos sin mapear, requisitos solo con enlaces de relación, grupos no declarados y controles repetidos.
