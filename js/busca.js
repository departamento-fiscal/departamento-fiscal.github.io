/* =====================================================================
   Motor de busca por aproximação — Consulta Fiscal Âmbar
   Sem dependências. Tolera acentos, abreviações e pequenos erros de
   digitação (distância de Levenshtein) e entende códigos (NCM, ERP, LC).
   ===================================================================== */
(function (global) {
  'use strict';

  /* normaliza: minúsculas, sem acento, sem pontuação */
  function norm(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /* abreviações comuns no dia a dia de requisição → termo completo */
  var SINONIMOS = {
    manut: 'manutencao', mnt: 'manutencao',
    serv: 'servico', svc: 'servico',
    equip: 'equipamento', eqpto: 'equipamento', eqp: 'equipamento',
    elet: 'eletrico', eletr: 'eletrico',
    hidr: 'hidraulico',
    mec: 'mecanico',
    refrig: 'refrigeracao',
    calib: 'calibracao',
    consult: 'consultoria',
    transp: 'transporte',
    armaz: 'armazenagem',
    lab: 'laboratorio',
    treinam: 'treinamento', trein: 'treinamento',
    seg: 'seguranca',
    limp: 'limpeza',
    mont: 'montagem',
    desmont: 'desmontagem',
    inst: 'instalacao',
    engenh: 'engenharia', eng: 'engenharia',
    ti: 'informatica', info: 'informatica',
    juridico: 'advocaticios',
    adv: 'advocaticios',
    lubrif: 'lubrificante', lub: 'lubrificante',
    parafuso: 'parafuso', paraf: 'parafuso',
    rolam: 'rolamento',
    valv: 'valvula',
    tub: 'tubo',
    mang: 'mangueira',
    impressora: 'impressora', impr: 'impressora',
    epi: 'protecao'
  };

  /* palavras vazias: não pontuam nem são destacadas */
  var STOP = { de: 1, da: 1, do: 1, das: 1, dos: 1, em: 1, no: 1, na: 1, nos: 1, nas: 1, e: 1, ou: 1, com: 1, para: 1, por: 1, um: 1, uma: 1, o: 1, a: 1, os: 1, as: 1 };

  function tokensUteis(q) {
    var t = norm(q).split(' ').filter(function (x) { return x.length >= 2 && !STOP[x]; });
    return t;
  }

  function expandeTokens(tokens) {
    var out = [];
    tokens.forEach(function (t) {
      out.push(t);
      if (SINONIMOS[t] && SINONIMOS[t] !== t) out.push(SINONIMOS[t]);
    });
    return out;
  }

  /* Levenshtein com teto (early exit) */
  function lev(a, b, teto) {
    if (Math.abs(a.length - b.length) > teto) return teto + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      var melhor = i;
      for (j = 1; j <= b.length; j++) {
        var custo = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + custo);
        if (cur[j] < melhor) melhor = cur[j];
      }
      if (melhor > teto) return teto + 1;
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[b.length];
  }

  /* melhor pontuação de um token da consulta contra os tokens do registro */
  function pontuaToken(qt, tokens) {
    var melhor = 0, i, rt;
    for (i = 0; i < tokens.length; i++) {
      rt = tokens[i];
      if (rt === qt) return 1;
      if (qt.length >= 3 && rt.indexOf(qt) === 0) { if (melhor < 0.85) melhor = 0.85; continue; }
      if (qt.length >= 4 && rt.indexOf(qt) > 0) { if (melhor < 0.7) melhor = 0.7; continue; }
      if (qt.length >= 4 && rt.length >= 4) {
        var teto = qt.length >= 7 ? 2 : 1;
        var d = lev(qt, rt, teto);
        if (d > teto) continue; /* lev devolve teto+1 quando estoura o limite */
        if (d === 1 && melhor < 0.75) melhor = 0.75;
        else if (d === 2 && melhor < 0.55) melhor = 0.55;
      }
    }
    return melhor;
  }

  /*
    Índice: cada registro vira { linha, campos: [{tokens, texto, peso}], codigos: [strings] }
    - campos textuais entram na pontuação fuzzy
    - codigos (NCM, ERP, LC) casam por prefixo numérico
  */
  function criaIndice(linhas, campos) {
    return linhas.map(function (linha, idx) {
      var texto = campos.filter(function (c) { return !c.codigo; })
        .map(function (c) { return { tokens: norm(linha[c.i]).split(' ').filter(Boolean), peso: c.peso }; });
      var codigos = campos.filter(function (c) { return c.codigo; })
        .map(function (c) { return String(linha[c.i] || '').replace(/[^0-9]/g, ''); });
      return { idx: idx, linha: linha, campos: texto, codigos: codigos };
    });
  }

  /*
    Busca. Retorna [{linha, idx, score}] ordenado por relevância.
    - consulta só com dígitos/pontos → busca por prefixo nos códigos
    - texto → pontuação por token com pesos por campo; exige que
      a maioria dos termos encontre correspondência (≥ 60%)
  */
  function busca(indice, consulta, limite) {
    limite = limite || 100;
    var q = String(consulta || '').trim();
    if (!q) return [];

    var soCodigo = /^[0-9.,\-\/\s]+$/.test(q);
    var resultados = [];

    if (soCodigo) {
      var dig = q.replace(/[^0-9]/g, '');
      if (!dig) return [];
      indice.forEach(function (rec) {
        var melhor = 0;
        rec.codigos.forEach(function (c) {
          if (!c) return;
          if (c === dig) melhor = Math.max(melhor, 1);
          else if (c.indexOf(dig) === 0) melhor = Math.max(melhor, 0.9);
          else if (dig.length >= 4 && c.indexOf(dig) > 0) melhor = Math.max(melhor, 0.6);
        });
        if (melhor > 0) resultados.push({ idx: rec.idx, linha: rec.linha, score: melhor });
      });
    } else {
      var tokens = tokensUteis(q);
      if (!tokens.length) return [];
      var expandidos = tokens.map(function (t) {
        return SINONIMOS[t] && SINONIMOS[t] !== t ? [t, SINONIMOS[t]] : [t];
      });

      indice.forEach(function (rec) {
        var somaPesos = 0, soma = 0, casados = 0;
        expandidos.forEach(function (variantes) {
          var melhorCampo = 0, pesoUsado = 1;
          rec.campos.forEach(function (campo) {
            var m = 0;
            variantes.forEach(function (v) {
              var p = pontuaToken(v, campo.tokens);
              if (p > m) m = p;
            });
            if (m * campo.peso > melhorCampo * pesoUsado) { melhorCampo = m; pesoUsado = campo.peso; }
          });
          if (melhorCampo > 0) casados++;
          soma += melhorCampo * pesoUsado;
          somaPesos += 1;
        });
        if (!casados) return;
        if (casados / expandidos.length < 0.5) return;
        var score = soma / somaPesos;
        if (score >= 0.35) resultados.push({ idx: rec.idx, linha: rec.linha, score: score });
      });
    }

    resultados.sort(function (a, b) { return b.score - a.score; });
    /* corte adaptativo: descarta a cauda muito abaixo do melhor resultado */
    if (resultados.length) {
      var minimo = Math.max(0.42, resultados[0].score * 0.55);
      resultados = resultados.filter(function (r) { return r.score >= minimo; });
    }
    return resultados.slice(0, limite);
  }

  /* destaca os termos da consulta num texto (para exibição) */
  function destaca(texto, consulta) {
    var t = String(texto || '');
    var tokens = expandeTokens(tokensUteis(consulta));
    if (!tokens.length) return escapaHtml(t);
    var nt = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    var marcas = [];
    tokens.forEach(function (tok) {
      var i = 0;
      while (true) {
        var j = nt.indexOf(tok, i);
        if (j < 0) break;
        marcas.push([j, j + tok.length]);
        i = j + tok.length;
      }
    });
    if (!marcas.length) return escapaHtml(t);
    marcas.sort(function (a, b) { return a[0] - b[0]; });
    var unidas = [marcas[0]];
    for (var k = 1; k < marcas.length; k++) {
      var ult = unidas[unidas.length - 1];
      if (marcas[k][0] <= ult[1]) ult[1] = Math.max(ult[1], marcas[k][1]);
      else unidas.push(marcas[k]);
    }
    var out = '', pos = 0;
    unidas.forEach(function (m) {
      out += escapaHtml(t.slice(pos, m[0])) + '<mark>' + escapaHtml(t.slice(m[0], m[1])) + '</mark>';
      pos = m[1];
    });
    return out + escapaHtml(t.slice(pos));
  }

  function escapaHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  global.Busca = { norm: norm, criaIndice: criaIndice, busca: busca, destaca: destaca, escapaHtml: escapaHtml };
})(window);
