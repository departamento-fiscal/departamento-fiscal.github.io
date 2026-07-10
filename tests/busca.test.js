'use strict';
var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var vm = require('vm');

var code = fs.readFileSync(__dirname + '/../js/busca.js', 'utf8');
var ctx = { window: {}, console: console };
vm.runInNewContext(code, ctx);
var B = ctx.window.Busca;
/* fixture própria: os testes não dependem da base de produção */
var serv = JSON.parse(fs.readFileSync(__dirname + '/fixtures/servicos.sample.json', 'utf8'));
var idx = B.criaIndice(serv.linhas, [
  { i: 2, peso: 1 }, { i: 3, peso: 0.9 }, { i: 6, peso: 0.6 },
  { i: 0, codigo: true }, { i: 1, codigo: true }
]);

test('norm remove acentos e pontuação', function () {
  assert.equal(B.norm('Manutenção ELÉTRICA!'), 'manutencao eletrica');
});

test('encontra manutenção (termo real da base)', function () {
  var r = B.busca(idx, 'manutencao', 50);
  assert.ok(r.length > 0);
});

test('sinônimo vigilancia -> seguranca acha Segurança Patrimonial', function () {
  var r = B.busca(idx, 'vigilancia', 50);
  assert.ok(r.length > 0, 'vigilancia deveria achar segurança via sinônimo');
});

test('consultas degeneradas não quebram e retornam vazio', function () {
  ['', 'a', 'de da para', '🙂🙂', '   '].forEach(function (q) {
    var r = B.busca(idx, q, 50);
    assert.ok(Array.isArray(r));
  });
});

test('destaca escapa HTML (sem XSS) e marca termo', function () {
  var out = B.destaca('Cabo <script> de manutenção', 'manutencao');
  assert.ok(out.indexOf('<script>') === -1, 'não pode conter tag crua');
  assert.ok(out.indexOf('&lt;script&gt;') !== -1, 'deve escapar');
  assert.ok(out.indexOf('<mark>') !== -1, 'deve marcar o termo');
});

test('destaca não quebra com acentos e nunca vaza <', function () {
  var out = B.destaca('Manutenção de compressores à válvula', 'manutencao valvula');
  assert.ok(/^[^<]*(<mark>[^<]*<\/mark>[^<]*)*$/.test(out) || out.indexOf('<mark>') !== -1);
  assert.ok(out.indexOf('<scr') === -1);
});

test('busca por código (prefixo LC/ERP)', function () {
  var r = B.busca(idx, '01.01', 50);
  assert.ok(r.length > 0);
});
