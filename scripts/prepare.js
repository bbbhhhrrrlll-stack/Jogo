// Copia three.js e as fontes para www/vendor, para o jogo funcionar 100% offline.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), vendor = path.join(root, 'www', 'vendor');
fs.mkdirSync(vendor, { recursive: true });
function cp(from, to) {
  try { fs.copyFileSync(path.join(root, 'node_modules', from), path.join(vendor, to)); return true; }
  catch (e) { console.warn('aviso: nao achei ' + from); return false; }
}
cp('three/build/three.min.js', 'three.min.js');
let css = '';
[['rubik', 'Rubik', 500], ['rubik', 'Rubik', 700], ['silkscreen', 'Silkscreen', 400], ['silkscreen', 'Silkscreen', 700]].forEach(function (f) {
  const file = f[0] + '-latin-' + f[2] + '-normal.woff2';
  if (cp('@fontsource/' + f[0] + '/files/' + file, file))
    css += "@font-face{font-family:'" + f[1] + "';font-weight:" + f[2] + ";font-style:normal;font-display:swap;src:url(" + file + ") format('woff2')}\n";
});
fs.writeFileSync(path.join(vendor, 'fonts.css'), css);
console.log('assets prontos em www/vendor');
