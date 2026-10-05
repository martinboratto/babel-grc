#!/usr/bin/env node
/** Valida el catálogo común y todos los marcos de frameworks/. Sale con código 1 si hay errores. */
import { loadSources, validateAll } from './build.mjs';

const src = loadSources();
const { errors, warnings } = validateAll(src);
src.frameworks.forEach(({ file, data }) => {
  const reqs = (data && data.requirements) || [];
  const mapped = reqs.filter(r => (r.mappings || []).some(m => m.strength !== 'related')).length;
  console.log(`• ${file.padEnd(28)} ${String(reqs.length).padStart(4)} requisitos · ${mapped} mapeados`);
});
warnings.forEach(w => console.warn('⚠ ' + w));
if (errors.length) {
  errors.forEach(e => console.error('✗ ' + e));
  console.error(`\n${errors.length} error(es). Corregí los archivos indicados.`);
  process.exit(1);
}
console.log(`✓ Catálogo (${src.catalog.controls.length} controles) y ${src.frameworks.length} marco(s) válidos.`);
