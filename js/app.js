/* =====================================================================
   Consulta Fiscal Âmbar — aplicação pública
   Produtos: [0]=Código [1]=Nome [2]=Descrição [3]=NCM [4]=Classif [5]=Unid [6]=Tipo
   Serviços: [0]=LC116 [1]=ERP [2]=Descrição [3]=Quando Utilizar
             [4]=Impostos Retidos [5]=Conta [6]=Descrição da Conta
   ===================================================================== */
(function () {
  'use strict';
  var esc = Busca.escapaHtml;

  var produtos = null, servicos = null;
  var idxProd = null, idxServ = null;
  var MAX_LINHAS = 60;

  /* ---------------- estado da aba serviços ---------------- */
  var local = null;         // 'dentro' | 'fora'
  var frequencia = null;    // 'esporadico' | 'continuo'

  /* ---------------- carga de dados ---------------- */
  Promise.all([
    fetch('data/produtos.json').then(function (r) { return r.json(); }),
    fetch('data/servicos.json').then(function (r) { return r.json(); })
  ]).then(function (res) {
    produtos = res[0]; servicos = res[1];

    idxProd = Busca.criaIndice(produtos.linhas, [
      { i: 1, peso: 1 },            // nome
      { i: 2, peso: 0.9 },          // descrição detalhada
      { i: 4, peso: 0.6 },          // classificação fiscal
      { i: 0, codigo: true },       // código do produto
      { i: 3, codigo: true }        // NCM
    ]);
    idxServ = Busca.criaIndice(servicos.linhas, [
      { i: 2, peso: 1 },            // descrição do serviço
      { i: 3, peso: 0.9 },          // quando utilizar
      { i: 6, peso: 0.6 },          // descrição da conta
      { i: 0, codigo: true },       // LC 116
      { i: 1, codigo: true }        // código ERP
    ]);

    montaDatalistNcm();
    document.getElementById('pillBase').textContent =
      produtos.linhas.length.toLocaleString('pt-BR') + ' produtos · ' + servicos.linhas.length + ' serviços';
    document.getElementById('pillAtualizado').textContent = 'base atualizada em ' + formataData(produtos.atualizado_em);
    var badge = document.getElementById('statusBadge');
    badge.textContent = 'base carregada';
    badge.classList.add('ok');
  }).catch(function () {
    var badge = document.getElementById('statusBadge');
    badge.textContent = 'erro ao carregar a base';
    badge.classList.add('warn');
  });

  function formataData(iso) {
    if (!iso) return '—';
    var p = String(iso).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  }

  function montaDatalistNcm() {
    var vistos = {};
    var dl = document.getElementById('listaNcm');
    var frag = document.createDocumentFragment();
    produtos.linhas.forEach(function (l) {
      var ncm = l[3];
      if (ncm === '0000.00.00' || vistos[ncm]) return;
      vistos[ncm] = true;
      var opt = document.createElement('option');
      opt.value = ncm;
      opt.label = (l[4] || '').slice(0, 80);
      frag.appendChild(opt);
    });
    dl.appendChild(frag);
  }

  /* ---------------- navegação por abas ---------------- */
  var TITULOS = {
    produtos: ['Consulta de Produtos', 'Encontre o código correto antes da requisição ou da conferência da nota fiscal'],
    servicos: ['Consulta de Serviços', 'Encontre o código LC 116 e ERP corretos, com a retenção de impostos adequada']
  };
  document.querySelectorAll('.nav-item').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.nav-item').forEach(function (x) { x.classList.toggle('active', x === b); });
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      document.getElementById('tab-' + b.dataset.tab).classList.add('active');
      document.getElementById('pageTitle').textContent = TITULOS[b.dataset.tab][0];
      document.getElementById('pageSubtitle').textContent = TITULOS[b.dataset.tab][1];
    });
  });

  /* ---------------- util ---------------- */
  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }
  function botaoCopiar(codigo) {
    return '<button class="btn mini" type="button" data-copia="' + esc(codigo) + '" title="Copiar código ' + esc(codigo) + '">copiar</button>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copia]');
    if (!b) return;
    navigator.clipboard.writeText(b.dataset.copia).then(function () {
      var antes = b.textContent;
      b.textContent = 'copiado ✓';
      setTimeout(function () { b.textContent = antes; }, 1200);
    });
  });

  /* ================= PRODUTOS ================= */
  var elQProd = document.getElementById('qProduto');
  var elQNcm = document.getElementById('qNcm');
  var elQTipo = document.getElementById('qTipo');

  function buscaProdutos() {
    if (!idxProd) return;
    var q = elQProd.value.trim();
    var ncm = elQNcm.value.replace(/[^0-9]/g, '');
    var tipo = elQTipo.value;
    var tbody = document.getElementById('tbodyProd');
    var qtd = document.getElementById('qtdProd');

    if (!q && !ncm && !tipo) {
      qtd.textContent = 'Digite acima para pesquisar';
      tbody.innerHTML = '<tr><td colspan="8"><div class="vazio">Comece digitando o produto que você precisa.<br>Ex.: <b>graxa rolamento</b> · <b>cabo flexivel 2,5mm</b> · <b>impressora etiqueta</b></div></td></tr>';
      return;
    }

    var base;
    if (q) {
      base = Busca.busca(idxProd, q, 4000);
    } else {
      base = idxProd.map(function (r) { return { idx: r.idx, linha: r.linha, score: 0.5 }; });
    }
    var res = base.filter(function (r) {
      if (ncm && r.linha[3].replace(/[^0-9]/g, '').indexOf(ncm) !== 0) return false;
      if (tipo && r.linha[6] !== tipo) return false;
      return true;
    });

    if (!res.length) {
      qtd.textContent = 'Nenhum produto encontrado';
      tbody.innerHTML = '<tr><td colspan="8"><div class="vazio"><b>Nenhum resultado.</b><br>Tente menos palavras, outra grafia ou remova o filtro de NCM/tipo.<br>Se o produto não existe na base, contate o Departamento Fiscal para inclusão.</div></td></tr>';
      return;
    }

    var top = res[0].score;
    var html = res.slice(0, MAX_LINHAS).map(function (r, i) {
      var l = r.linha;
      var marcaTop = (q && i === 0 && top >= 0.7) ? '<span class="tag top">melhor correspondência</span>' : '';
      var ncmCell = l[3] === '0000.00.00'
        ? '<span class="tag warn" title="Item ainda sem NCM definido — confirme com o Fiscal">sem NCM</span>'
        : esc(l[3]);
      return '<tr>' +
        '<td>' + botaoCopiar(l[0]) + '</td>' +
        '<td class="cod">' + esc(l[0]) + (marcaTop ? '<br>' + marcaTop : '') + '</td>' +
        '<td class="wrap">' + Busca.destaca(l[1], q) + '</td>' +
        '<td class="wrap">' + Busca.destaca(l[2], q) + '</td>' +
        '<td class="cod">' + ncmCell + '</td>' +
        '<td class="wrap">' + esc(l[4]) + '</td>' +
        '<td>' + esc(l[5]) + '</td>' +
        '<td>' + (l[6] === 'Bem Patrimonial' ? '<span class="tag ok">Bem Patrimonial</span>' : '<span class="tag neutro">Produto</span>') + '</td>' +
        '</tr>';
    }).join('');

    qtd.textContent = res.length.toLocaleString('pt-BR') + ' produto(s) encontrado(s)' +
      (res.length > MAX_LINHAS ? ' — exibindo os ' + MAX_LINHAS + ' mais relevantes' : '');
    tbody.innerHTML = html;
  }

  elQProd.addEventListener('input', debounce(buscaProdutos, 160));
  elQNcm.addEventListener('input', debounce(buscaProdutos, 160));
  elQTipo.addEventListener('change', buscaProdutos);
  document.getElementById('btnLimparProd').addEventListener('click', function () {
    elQProd.value = ''; elQNcm.value = ''; elQTipo.value = '';
    buscaProdutos(); elQProd.focus();
  });

  /* ================= SERVIÇOS ================= */
  var elQServ = document.getElementById('qServico');

  function retemInss(l) { return /INSS/i.test(l[4]); }
  function ehManutencao(q) {
    var tokens = Busca.norm(q).split(' ');
    return tokens.some(function (t) { return t.indexOf('manut') === 0 || t === 'mnt'; });
  }

  function pillsLocal() {
    document.getElementById('optDentro').setAttribute('aria-pressed', local === 'dentro');
    document.getElementById('optFora').setAttribute('aria-pressed', local === 'fora');
    document.getElementById('optEsporadico').setAttribute('aria-pressed', frequencia === 'esporadico');
    document.getElementById('optContinuo').setAttribute('aria-pressed', frequencia === 'continuo');
  }

  function buscaServicos() {
    if (!idxServ) return;
    var q = elQServ.value.trim();
    var tbody = document.getElementById('tbodyServ');
    var qtd = document.getElementById('qtdServ');
    var avisoBox = document.getElementById('avisoServ');
    var manut = q && ehManutencao(q);

    /* pergunta de frequência só aparece p/ manutenção dentro do estabelecimento */
    var mostraFreq = manut && local === 'dentro';
    document.getElementById('rowFrequencia').hidden = !mostraFreq;
    if (!mostraFreq) frequencia = null;
    pillsLocal();

    if (!q) {
      qtd.textContent = 'Digite acima para pesquisar';
      avisoBox.innerHTML = '';
      tbody.innerHTML = '<tr><td colspan="7"><div class="vazio">Comece digitando o serviço e informe onde ele será realizado.<br>Ex.: <b>manutenção de bombas</b> · <b>armazenagem</b> · <b>treinamento</b></div></td></tr>';
      return;
    }

    var res = Busca.busca(idxServ, q, 300);
    var avisos = [];

    if (!local) {
      avisos.push('<div class="aviso"><span class="ico">⚠</span><span>Informe <b>onde o serviço será realizado</b> — a retenção de INSS depende disso. Mostrando todas as opções por enquanto.</span></div>');
    } else if (local === 'fora') {
      res = res.filter(function (r) { return !retemInss(r.linha); });
      avisos.push('<div class="aviso"><span class="ico">ℹ</span><span>Serviço <b>fora do estabelecimento</b>: exibindo somente códigos <b>sem retenção de INSS</b>.</span></div>');
    } else if (mostraFreq) {
      if (frequencia === 'continuo') {
        res = res.filter(function (r) { return retemInss(r.linha); });
        avisos.push('<div class="aviso alerta"><span class="ico">⚠</span><span>Manutenção <b>contínua</b> no estabelecimento: a legislação determina <b>retenção de INSS</b> — exibindo somente códigos que retêm INSS.</span></div>');
      } else if (frequencia === 'esporadico') {
        res = res.filter(function (r) { return !retemInss(r.linha); });
        avisos.push('<div class="aviso"><span class="ico">ℹ</span><span>Manutenção <b>esporádica</b>: exibindo códigos <b>sem retenção de INSS</b>.</span></div>');
      } else {
        avisos.push('<div class="aviso"><span class="ico">⚠</span><span>Serviço de manutenção: informe se é <b>esporádico ou contínuo</b> — a retenção de INSS muda conforme a frequência. Mostrando todas as opções por enquanto.</span></div>');
      }
    }
    avisoBox.innerHTML = avisos.join('');

    if (!res.length) {
      qtd.textContent = 'Nenhum serviço encontrado';
      tbody.innerHTML = '<tr><td colspan="7"><div class="vazio"><b>Nenhum resultado com os critérios atuais.</b><br>Tente outras palavras ou revise o local/frequência selecionados.<br>Se o serviço não existe na base, contate o Departamento Fiscal.</div></td></tr>';
      return;
    }

    var top = res[0].score;
    var html = res.slice(0, MAX_LINHAS).map(function (r, i) {
      var l = r.linha;
      var marcaTop = (i === 0 && top >= 0.7) ? '<span class="tag top">melhor correspondência</span>' : '';
      var inss = retemInss(l);
      var tagImposto = l[4] === 'Não Retém'
        ? '<span class="tag neutro">Não retém</span>'
        : '<span class="tag ' + (inss ? 'warn' : 'ok') + '">' + esc(l[4]) + '</span>';
      return '<tr>' +
        '<td>' + botaoCopiar(l[1]) + '</td>' +
        '<td class="cod">' + esc(l[0]) + (marcaTop ? '<br>' + marcaTop : '') + '</td>' +
        '<td class="cod">' + esc(l[1]) + '</td>' +
        '<td class="wrap">' + Busca.destaca(l[2], q) + '</td>' +
        '<td class="wrap">' + Busca.destaca(l[3], q) + '</td>' +
        '<td>' + tagImposto + '</td>' +
        '<td class="wrap"><span class="cod">' + esc(l[5]) + '</span> · ' + esc(l[6]) + '</td>' +
        '</tr>';
    }).join('');

    qtd.textContent = res.length + ' serviço(s) encontrado(s)' +
      (res.length > MAX_LINHAS ? ' — exibindo os ' + MAX_LINHAS + ' mais relevantes' : '');
    tbody.innerHTML = html;
  }

  elQServ.addEventListener('input', debounce(buscaServicos, 160));
  document.getElementById('optDentro').addEventListener('click', function () { local = 'dentro'; buscaServicos(); });
  document.getElementById('optFora').addEventListener('click', function () { local = 'fora'; buscaServicos(); });
  document.getElementById('optEsporadico').addEventListener('click', function () { frequencia = 'esporadico'; buscaServicos(); });
  document.getElementById('optContinuo').addEventListener('click', function () { frequencia = 'continuo'; buscaServicos(); });
  document.getElementById('btnLimparServ').addEventListener('click', function () {
    elQServ.value = ''; local = null; frequencia = null;
    buscaServicos(); elQServ.focus();
  });
})();
