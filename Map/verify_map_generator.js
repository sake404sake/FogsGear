const fs = require('fs');
const path = 'd:/workspace/mytools/FogsGear/Map/js/mapGenerator.js';
const source = fs.readFileSync(path, 'utf8');
try {
  new Function(source.replace(/^export\s+/, ''));
  console.log('Function parse OK');
} catch (e) {
  console.error('Function parse failed:', e.message);
  process.exit(1);
}
(async () => {
  try {
    const moduleUrl = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(source);
    await import(moduleUrl);
    console.log('ESM import OK');
  } catch (e) {
    console.error('ESM import failed:', e.message);
    process.exit(1);
  }
})();
