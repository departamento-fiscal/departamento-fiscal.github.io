'use strict';
var test = require('node:test');
var assert = require('node:assert');
var F = require('../js/fiscal.js');

test('classificaImpostos: retenção real de INSS', function () {
  assert.equal(F.classificaImpostos('Retém INSS').retemInss, true);
  assert.equal(F.classificaImpostos('Retém IR, PCC e INSS').retemInss, true);
  assert.equal(F.classificaImpostos('Retém PCC e INSS').retemInss, true);
});

test('classificaImpostos: NÃO confunde negação com retenção (regressão do /INSS/i)', function () {
  assert.equal(F.classificaImpostos('Não Retém').retemInss, false);
  assert.equal(F.classificaImpostos('Não Retém INSS').retemInss, false, 'texto negando INSS não pode contar como retenção');
  assert.equal(F.classificaImpostos('Sem INSS').retemInss, false);
});

test('classificaImpostos: sinaliza exceção do Simples sem perder a retenção', function () {
  var c = F.classificaImpostos('Retém INSS (Empresas do Simples Nacional não retém na forma do Anexo III)');
  assert.equal(c.retemInss, true);
  assert.equal(c.excecaoSimples, true);
});

test('classificaImpostos: outros tributos', function () {
  var c = F.classificaImpostos('Retém IR e PCC');
  assert.equal(c.retemInss, false);
  assert.equal(c.retemIr, true);
  assert.equal(c.retemPcc, true);
});

test('validaCampoImpostos: aceita válidos e rejeita inválidos', function () {
  assert.equal(F.validaCampoImpostos('Não Retém').ok, true);
  assert.equal(F.validaCampoImpostos('Retém IR, PCC e INSS').ok, true);
  assert.equal(F.validaCampoImpostos('').ok, false);
  assert.equal(F.validaCampoImpostos('qualquer coisa').ok, false);
  assert.equal(F.validaCampoImpostos('Retém XPTO').ok, false);
});

test('avaliaCenario: cessão define o INSS, não a palavra digitada', function () {
  var inss = F.classificaImpostos('Retém INSS');
  assert.equal(F.avaliaCenario({ cessao: 'sim' }, inss).inss, 'aplica');
  assert.equal(F.avaliaCenario({ cessao: 'nao' }, inss).inss, 'nao_aplica');
  assert.equal(F.avaliaCenario({ cessao: 'naosei' }, inss).inss, 'indefinido');
  assert.equal(F.avaliaCenario({}, inss).inss, 'indefinido');
});

test('avaliaCenario: cessão=sim + código SEM INSS = INCOERENTE (ressalva Codex)', function () {
  var semInss = F.classificaImpostos('Retém IR e PCC');
  var r = F.avaliaCenario({ cessao: 'sim' }, semInss);
  assert.equal(r.inss, 'incoerente');
  assert.equal(r.nivel, 'alerta');
  assert.ok(r.mensagens.some(function (m) { return /Priorize um código que retém INSS|confirme/i.test(m); }));
});

test('avaliaCenario: cessão=sim + classificação genérica sem INSS também é incoerente', function () {
  var r = F.avaliaCenario({ cessao: 'sim' }, { reconhecido: true, retemInss: false });
  assert.equal(r.inss, 'incoerente');
});

test('avaliaCenario: sem cessão informada + código sem INSS = não aplica (nada a decidir)', function () {
  assert.equal(F.avaliaCenario({}, F.classificaImpostos('Retém IR e PCC')).inss, 'nao_aplica');
});

test('avaliaCenario: Simples gera alerta de exceção', function () {
  var c = F.classificaImpostos('Retém INSS (Empresas do Simples Nacional não retém na forma do Anexo III)');
  var r = F.avaliaCenario({ cessao: 'sim', simples: 'sim' }, c);
  assert.equal(r.inss, 'aplica');
  assert.ok(r.mensagens.some(function (m) { return /Simples Nacional/.test(m); }));
});
