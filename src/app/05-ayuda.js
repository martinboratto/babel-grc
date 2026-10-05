/* Babel GRC · ayuda y arranque. */

VIEWS.ayuda = () => head('Ayuda', 'Cómo funciona Babel GRC, cómo se calcula el cumplimiento y cómo sumar marcos nuevos.') +
  `<div class="grid g2">
  <div class="card prose">
    <h2>Cómo se usa</h2>
    <ol>
      <li><strong>Proyecto.</strong> En Inicio, creá un proyecto y elegí los marcos de su alcance (o cargá el caso de ejemplo).</li>
      <li><strong>Controles.</strong> Registrá el estado de cada control del catálogo común (implantado, parcial, pendiente o no aplica), con responsable, evidencias y fecha de revisión. Cada cambio recalcula todos los marcos.</li>
      <li><strong>Requisitos.</strong> Revisá la declaración de aplicabilidad de cada marco y excluí con justificación lo que no aplique (solo si el requisito admite exclusión).</li>
      <li><strong>Equivalencias, brechas y plan.</strong> Consultá qué requisitos equivalen entre marcos, qué falta cubrir y en qué orden conviene implantar.</li>
      <li><strong>Exportar.</strong> Excel con la declaración de aplicabilidad por marco, informe en Markdown, CSV y copias de seguridad en JSON.</li>
    </ol>
    <h2>Método de cálculo</h2>
    <p>Cada requisito se enlaza con uno o más controles con un peso <strong>w</strong>: 1 (total), 0,5 (parcial) o 0 (relación, informativa). El estado del control vale 1 (implantado), 0,5 (parcial) o 0 (pendiente o no aplica).</p>
    <p class="formula">cobertura = max(w) × Σ(w × estado) / Σ w</p>
    <ul>
      <li><strong>Cubierto</strong> al 100 %, <strong>parcial</strong> entre 0 y 100 %, <strong>brecha</strong> en 0. Si un requisito solo tiene enlaces parciales, no supera el 50 %.</li>
      <li><strong>Sin mapear</strong>: el requisito no tiene controles con peso; cuenta como 0 hasta que lo mapees.</li>
      <li><strong>Cumplimiento del marco</strong>: promedio de la cobertura de los requisitos aplicables (los excluidos no cuentan).</li>
      <li><strong>Prioridad</strong> de un control pendiente: puntos porcentuales que suma en todos los marcos del alcance si se implanta.</li>
      <li><strong>Equivalencia</strong> entre dos requisitos de marcos distintos: existe si comparten un control. Es total si ambos enlaces son totales, parcial si alguno es parcial y relación si alguno es informativo.</li>
      <li><strong>Solapamiento A → B</strong>: parte de B cubierta al implantar los controles que A exige con enlace total.</li>
    </ul>
    <h2>Fotos del período</h2>
    <p>En <strong>Exportar › Foto del período</strong> congelás el estado del proyecto como prueba de un período (por ejemplo, el cierre de un trimestre o el día previo a una auditoría). Se descargan dos archivos:</p>
    <ul>
      <li><strong>Excel</strong>: hoja «Foto» con el período, la fecha y hora, quién la elaboró, el cumplimiento de cada marco y el código de verificación, más la declaración de aplicabilidad, controles, plan y alertas tal como estaban.</li>
      <li><strong>JSON</strong>: el mismo contenido en formato verificable.</li>
    </ul>
    <p>Con <strong>Verificar una foto</strong> elegís el JSON: la herramienta recalcula el código SHA-256 e indica si la foto está íntegra o si se modificó. También la compara con el estado actual o con otra foto (variación por marco, requisitos que mejoraron o empeoraron y controles que cambiaron de estado).</p>
    <p>El código demuestra que el archivo no cambió, pero quien edite el archivo también podría recalcularlo. Para que funcione como prueba, <strong>registrá el código fuera del archivo</strong>: en el acta, un correo o un ticket con fecha.</p>
    <h2>Privacidad</h2>
    <p>Babel GRC funciona por completo en tu navegador. No hay servidor, cuentas ni telemetría; los proyectos y los marcos importados se guardan en el almacenamiento local del navegador. La política de seguridad de contenido bloquea cualquier conexión externa.</p>
  </div>
  <div class="card prose">
    <h2>Sumar un marco nuevo</h2>
    <h3>Desde la aplicación (solo en tu navegador)</h3>
    <ol>
      <li>En <strong>Marcos normativos</strong>, descargá la <em>Plantilla Excel</em> (o la JSON).</li>
      <li>Completá la hoja «Marco» con el id y el nombre, y la hoja «Requisitos» con una fila por requisito.</li>
      <li>En cada requisito indicá los controles del catálogo que lo cubren, separados por coma, en las columnas <code>controles_total</code>, <code>controles_parcial</code> o <code>controles_relacion</code>. La hoja «Catalogo» lista todos los controles.</li>
      <li>Si algún requisito necesita un control que no existe, definilo en la hoja «Controles_nuevos».</li>
      <li>Arrastrá el archivo a <strong>Agregar un marco</strong>. Se valida y, si no hay errores, queda disponible al instante.</li>
      <li>Los requisitos que queden sin mapear se completan después con <strong>Editar mapeos</strong>.</li>
    </ol>
    <h3>En el repositorio (disponible para todos)</h3>
    <ol>
      <li>Exportá el marco en JSON desde su tarjeta, o creá el archivo con el esquema <code>schema/framework.schema.json</code>.</li>
      <li>Subilo a la carpeta <code>frameworks/</code> del repositorio, desde la web de GitHub o con git.</li>
      <li>GitHub Actions ejecuta la validación y las pruebas y publica la nueva versión del sitio en GitHub Pages.</li>
    </ol>
    <p>En local: <code>npm run validate</code> valida los marcos y <code>npm run xlsx-a-marco -- archivo.xlsx</code> convierte una plantilla Excel en JSON.</p>
    <h2>Marcos incluidos</h2>
    <ul>${S.builtins.map(f => `<li><strong>${esc(f.name)}</strong> · ${f.requirements.length} requisitos. ${esc(f.notice || '')}</li>`).join('')}</ul>
    <h2>Limitaciones</h2>
    <ul>
      <li>Los mapeos son criterio del autor, basado en el texto de cada marco; revisalos con tu equipo antes de usarlos en una auditoría.</li>
      <li>Los títulos y resúmenes son propios: no reproducen textos protegidos por derechos de autor.</li>
      <li>La herramienta ayuda a gestionar el cumplimiento, pero no lo certifica ni sustituye el juicio profesional.</li>
    </ul>
  </div>
  </div>`;

/* ================= ARRANQUE ================= */
(function boot() {
  applyTheme();
  const builtinIds = S.builtins.map(b => b.id);
  S.customs = [];
  (store.get(LS.custom, []) || []).forEach(f => {
    try {
      if (!E.validateFramework(f, knownControlsFor(f.id), { existingIds: builtinIds }).ok) return;
      const n = E.normalizeFramework(f);
      if (typeof f.importedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.importedAt)) n.importedAt = f.importedAt;
      S.customs.push(n);
    } catch (e) { /* marco dañado: se descarta */ }
  });
  S.projects = (store.get(LS.projects, []) || []).map(p => {
    try { const c = cleanProject(p); if (typeof p.id === 'string' && /^[a-z0-9]{4,40}$/.test(p.id)) c.id = p.id; return c; } catch (e) { return null; }
  }).filter(Boolean);
  S.activeId = store.get(LS.active, null);
  if (!S.projects.some(p => p.id === S.activeId)) S.activeId = S.projects.length ? S.projects[0].id : null;
  rebuild();
  window.addEventListener('hashchange', route);
  route();
})();
