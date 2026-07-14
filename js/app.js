/* =====================================================================
   Consulta Fiscal Âmbar — aplicação pública
   Produtos: [0]=Código [1]=Nome [2]=Descrição [3]=NCM [4]=Classif [5]=Unid [6]=Tipo
   Serviços: [0]=LC116 [1]=ERP [2]=Descrição [3]=Quando Utilizar
             [4]=Impostos Retidos [5]=Conta [6]=Descrição da Conta
   ===================================================================== */
(function () {
  'use strict';
  var esc = Busca.escapaHtml;

  /* PWA: service worker (offline + instalável). Só em contexto seguro. */
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* sem SW, o site segue normal */ });
    });
  }

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
    var maisRecente = [produtos.atualizado_em, servicos.atualizado_em].sort().pop();
    document.getElementById('pillAtualizado').textContent = 'base atualizada em ' + formataData(maisRecente);
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
  function ativaAba(nome) {
    if (!TITULOS[nome]) return;
    document.querySelectorAll('.nav-item').forEach(function (x) { x.classList.toggle('active', x.dataset.tab === nome); });
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    document.getElementById('tab-' + nome).classList.add('active');
    document.getElementById('pageTitle').textContent = TITULOS[nome][0];
    document.getElementById('pageSubtitle').textContent = TITULOS[nome][1];
    if (history.replaceState) history.replaceState(null, '', '#' + nome);
  }
  document.querySelectorAll('.nav-item').forEach(function (b) {
    b.addEventListener('click', function () { ativaAba(b.dataset.tab); });
  });
  /* deep-link: /#servicos abre direto na aba de serviços */
  if (location.hash === '#servicos') ativaAba('servicos');

  /* ---------------- util ---------------- */
  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }
  function botaoCopiar(codigo) {
    return '<button class="btn mini" type="button" data-copia="' + esc(codigo) + '" title="Copiar código ' + esc(codigo) + '">copiar</button>';
  }
  function copiaTexto(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto);
    }
    /* fallback para navegadores antigos / contexto não seguro */
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = texto;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy falhou'));
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copia]');
    if (!b) return;
    copiaTexto(b.dataset.copia).then(function () {
      var antes = b.textContent;
      b.textContent = 'copiado ✓';
      setTimeout(function () { b.textContent = antes; }, 1200);
    }).catch(function () {
      b.textContent = 'copie: ' + b.dataset.copia;
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
        '<td class="acao">' + botaoCopiar(l[0]) + '</td>' +
        '<td class="cod" data-label="Código ERP">' + esc(l[0]) + (marcaTop ? '<br>' + marcaTop : '') + '</td>' +
        '<td class="wrap" data-label="Nome do produto">' + Busca.destaca(l[1], q) + '</td>' +
        '<td class="wrap" data-label="Descrição detalhada">' + Busca.destaca(l[2], q) + '</td>' +
        '<td class="cod" data-label="NCM">' + ncmCell + '</td>' +
        '<td class="wrap" data-label="Classificação fiscal">' + esc(l[4]) + '</td>' +
        '<td data-label="Unidade">' + esc(l[5]) + '</td>' +
        '<td data-label="Tipo">' + (l[6] === 'Bem Patrimonial' ? '<span class="tag ok">Bem Patrimonial</span>' : '<span class="tag neutro">Produto</span>') + '</td>' +
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

  /* ================= SERVIÇOS =================
     A DECISÃO fiscal (retenção de INSS) NÃO depende mais da palavra digitada
     nem de um filtro destrutivo por local. Ela vem do campo estruturado
     "Impostos Retidos" (classificado por js/fiscal.js) + de um questionário
     fiscal (cessão de mão de obra/empreitada, local, continuidade, Simples).
     A ferramenta orienta e destaca, e sempre remete a confirmação ao
     Departamento Fiscal. Exceção deliberada (regra de negócio do Fiscal):
     quando o usuário afirma que NÃO há cessão de mão de obra/empreitada,
     os códigos que retêm INSS são OCULTADOS da lista — sem cessão não há
     retenção de INSS (Lei 8.212/91, art. 31), então exibi-los induziria
     à requisição errada. */
  var elQServ = document.getElementById('qServico');

  var local = null;      // 'dentro' | 'fora' (local de execução — informativo)
  var cessao = null;     // 'sim' | 'nao' | 'naosei' (cessão de mão de obra/empreitada)
  var continuo = null;   // true | false (serviço contínuo/recorrente)
  var simples = null;    // 'sim' | 'nao' (prestador optante pelo Simples Nacional)

  function classif(l) { return Fiscal.classificaImpostos(l[4]); }

  function pillsServ() {
    function set(id, on) { var e = document.getElementById(id); if (e) e.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    set('optDentro', local === 'dentro');
    set('optFora', local === 'fora');
    set('optCessaoSim', cessao === 'sim');
    set('optCessaoNao', cessao === 'nao');
    set('optCessaoNaoSei', cessao === 'naosei');
    set('optEsporadico', continuo === false);
    set('optContinuo', continuo === true);
    set('optSimplesSim', simples === 'sim');
    set('optSimplesNao', simples === 'nao');
  }

  function avisoHtml(cls, texto) {
    var ico = cls.indexOf('alerta') >= 0 ? '⚠' : 'ℹ';
    return '<div class="' + cls + '"><span class="ico">' + ico + '</span><span>' + esc(texto) + '</span></div>';
  }

  function buscaServicos() {
    if (!idxServ) return;
    var q = elQServ.value.trim();
    var tbody = document.getElementById('tbodyServ');
    var qtd = document.getElementById('qtdServ');
    var avisoBox = document.getElementById('avisoServ');

    if (!q) {
      qtd.textContent = 'Digite acima para pesquisar';
      avisoBox.innerHTML = '';
      document.getElementById('rowFiscal').hidden = true;
      tbody.innerHTML = '<tr><td colspan="7"><div class="vazio">Comece digitando o serviço pretendido.<br>Ex.: <b>manutenção de bombas</b> · <b>limpeza</b> · <b>vigilância</b> · <b>transporte</b></div></td></tr>';
      return;
    }

    var res = Busca.busca(idxServ, q, 300);

    /* O questionário fiscal aparece quando HÁ, entre os candidatos, algum
       código que retém INSS na classificação cadastrada — independentemente
       da palavra digitada. */
    var temInss = res.some(function (r) { return classif(r.linha).retemInss; });
    var temSimples = res.some(function (r) { return classif(r.linha).excecaoSimples; });
    document.getElementById('rowFiscal').hidden = !temInss;
    if (!temInss) { local = null; cessao = null; continuo = null; simples = null; }
    pillsServ();

    /* Regra de negócio: sem cessão de mão de obra/empreitada não há retenção
       de INSS — códigos que retêm INSS saem da lista. (temInss é calculado
       ANTES do filtro para o questionário continuar visível.) */
    var ocultadosInss = 0;
    if (cessao === 'nao') {
      var soSemInss = res.filter(function (r) { return !classif(r.linha).retemInss; });
      ocultadosInss = res.length - soSemInss.length;
      res = soSemInss;
    }

    var avisos = [];
    if (ocultadosInss > 0) {
      avisos.push(avisoHtml('aviso', ocultadosInss + ' código(s) com retenção de INSS ocultado(s) porque você informou que não há cessão de mão de obra/empreitada.'));
    }
    if (temInss) {
      var aval = Fiscal.avaliaCenario(
        { local: local, cessao: cessao, continuo: continuo, simples: simples },
        { reconhecido: true, retemInss: true, excecaoSimples: temSimples }
      );
      var cls = aval.inss === 'aplica' ? 'aviso alerta' : 'aviso';
      aval.mensagens.forEach(function (m) { avisos.push(avisoHtml(cls, m)); });
    }
    avisoBox.innerHTML = avisos.join('');

    if (!res.length) {
      qtd.textContent = 'Nenhum serviço encontrado';
      tbody.innerHTML = ocultadosInss > 0
        ? '<tr><td colspan="7"><div class="vazio"><b>Todos os códigos encontrados para esta busca retêm INSS</b> e foram ocultados porque você informou que não há cessão de mão de obra/empreitada.<br>Revise a resposta de cessão ou confirme o enquadramento com o Departamento Fiscal.</div></td></tr>'
        : '<tr><td colspan="7"><div class="vazio"><b>Nenhum resultado com os critérios atuais.</b><br>Tente outras palavras ou outra grafia.<br>Se o serviço não existe na base, contate o Departamento Fiscal.</div></td></tr>';
      return;
    }

    var top = res[0].score;
    var html = res.slice(0, MAX_LINHAS).map(function (r, i) {
      var l = r.linha;
      var c = classif(l);
      var marcaTop = (i === 0 && top >= 0.7) ? '<span class="tag top">melhor correspondência</span>' : '';
      var retemAlgo = c.retemInss || c.retemIr || c.retemPcc || c.retemPisCofins;
      var tagImposto = !retemAlgo
        ? '<span class="tag neutro">Não retém</span>'
        : '<span class="tag ' + (c.retemInss ? 'warn' : 'ok') + '" title="' + esc(c.texto) + '">' + esc(l[4]) + '</span>';
      /* destaque advisory: marca o código coerente com o cenário informado.
         (com cessão="não" a lista já contém apenas códigos sem INSS, então
         a marcação só faz sentido no cenário cessão="sim") */
      var recomendado = temInss && cessao === 'sim' && c.retemInss;
      var tagRec = recomendado ? '<br><span class="tag ok">coerente com o cenário</span>' : '';
      return '<tr' + (recomendado ? ' class="rec"' : '') + '>' +
        '<td class="acao">' + botaoCopiar(l[1]) + '</td>' +
        '<td class="cod" data-label="LC 116">' + esc(l[0]) + (marcaTop ? '<br>' + marcaTop : '') + '</td>' +
        '<td class="cod" data-label="Código ERP">' + esc(l[1]) + '</td>' +
        '<td class="wrap" data-label="Descrição do serviço">' + Busca.destaca(l[2], q) + '</td>' +
        '<td class="wrap" data-label="Quando utilizar">' + Busca.destaca(l[3], q) + '</td>' +
        '<td data-label="Impostos retidos">' + tagImposto + tagRec + '</td>' +
        '<td class="wrap" data-label="Conta contábil"><span class="cod">' + esc(l[5]) + '</span> · ' + esc(l[6]) + '</td>' +
        '</tr>';
    }).join('');

    qtd.textContent = res.length + ' serviço(s) encontrado(s)' +
      (res.length > MAX_LINHAS ? ' — exibindo os ' + MAX_LINHAS + ' mais relevantes' : '');
    tbody.innerHTML = html;
  }

  elQServ.addEventListener('input', debounce(buscaServicos, 160));
  function liga(id, fn) { var e = document.getElementById(id); if (e) e.addEventListener('click', function () { fn(); buscaServicos(); }); }
  liga('optDentro', function () { local = 'dentro'; });
  liga('optFora', function () { local = 'fora'; });
  liga('optCessaoSim', function () { cessao = 'sim'; });
  liga('optCessaoNao', function () { cessao = 'nao'; });
  liga('optCessaoNaoSei', function () { cessao = 'naosei'; });
  liga('optEsporadico', function () { continuo = false; });
  liga('optContinuo', function () { continuo = true; });
  liga('optSimplesSim', function () { simples = 'sim'; });
  liga('optSimplesNao', function () { simples = 'nao'; });
  document.getElementById('btnLimparServ').addEventListener('click', function () {
    elQServ.value = ''; local = null; cessao = null; continuo = null; simples = null;
    buscaServicos(); elQServ.focus();
  });
})();
