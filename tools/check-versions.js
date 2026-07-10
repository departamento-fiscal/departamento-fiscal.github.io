'use strict';
/* Garante que a versão de cache-busting (?v=N) e a VERSAO do service worker
   estão consistentes entre index.html, admin.html e sw.js.
   Uso: node tools/check-versions.js  (sai com código 1 se houver divergência). */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
function lerV(arquivo) {
  var t = fs.readFileSync(path.join(root, arquivo), 'utf8');
  var vs = (t.match(/\?v=(\d+)/g) || []).map(function (s) { return s.replace('?v=', ''); });
  return vs;
}
var versoes = {};
['index.html', 'admin.html', 'sw.js'].forEach(function (f) { versoes[f] = lerV(f); });
var sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
var mVersao = sw.match(/consulta-fiscal-v(\d+)/);
var vSw = mVersao ? mVersao[1] : null;

var todas = [];
Object.keys(versoes).forEach(function (f) { versoes[f].forEach(function (v) { todas.push(v); }); });
if (vSw) todas.push(vSw);
var unicas = todas.filter(function (v, i) { return todas.indexOf(v) === i; });

if (unicas.length !== 1) {
  console.error('DIVERGÊNCIA de versão. Encontradas:', unicas.join(', '));
  Object.keys(versoes).forEach(function (f) { console.error('  ' + f + ': ?v=' + versoes[f].join(',')); });
  console.error('  sw.js VERSAO: consulta-fiscal-v' + vSw);
  process.exit(1);
}
console.log('OK — todas as versões consistentes em v' + unicas[0]);
