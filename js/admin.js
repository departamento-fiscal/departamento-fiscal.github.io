/* =====================================================================
   Área ADM — atualização da base publicada
   Fluxo: senha (gate local) → upload .xlsx → validação → publicação
   ATÔMICA dos dois JSONs em um único commit via Git Data API do GitHub.
   A segurança real da publicação é o token do GitHub; a senha desta
   página é apenas uma barreira de conveniência (o site é estático).
   ===================================================================== */
(function () {
  'use strict';

  var HASH_SENHA = '4cd2b31d223fb791d6ffd5a3bf4e8e077b6bddcc3dd51f72c58a98e904b345d2';
  var REPO = 'departamento-fiscal/departamento-fiscal.github.io';
  var COLS_PROD = ['Código do Produto', 'Nome do Produto', 'Descrição Detalhada', 'NCM', 'Classificação Fiscal', 'Unidade de Medida', 'Tipo de Item'];
  var COLS_SERV = ['Código LC 116', 'Código ERP', 'Descrição do Serviço', 'Quando Utilizar', 'Impostos Retidos', 'Conta Contábil', 'Descrição da Conta Contábil'];

  var dadosProntos = null;

  function el(id) { return document.getElementById(id); }

  /* ---- mensagens SEM innerHTML: todo texto entra como textContent ----
     'texto' pode ser string ou array de linhas (juntadas com <br> via DOM). */
  function msg(id, texto, tipo) {
    var box = el(id);
    while (box.firstChild) box.removeChild(box.firstChild);
    if (!texto) return;
    var d = document.createElement('div');
    d.className = 'msg ' + (tipo || '');
    var linhas = Object.prototype.toString.call(texto) === '[object Array]' ? texto : [texto];
    linhas.forEach(function (t, i) {
      if (i) d.appendChild(document.createElement('br'));
      d.appendChild(document.createTextNode(String(t)));
    });
    box.appendChild(d);
  }

  /* ---------------- login ---------------- */
  function sha256Hex(txt) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }
  function entrar() {
    sha256Hex(el('senha').value).then(function (h) {
      if (h === HASH_SENHA) {
        sessionStorage.setItem('admOk', '1');
        liberaPainel();
      } else {
        msg('msgLogin', 'Senha incorreta.', 'erro');
      }
    });
  }
  function liberaPainel() {
    el('telaLogin').hidden = true;
    el('telaPainel').hidden = false;
    var badge = el('statusBadge');
    badge.textContent = 'ADM autenticado';
    badge.classList.add('ok');
    var t = sessionStorage.getItem('admToken');
    if (t) { el('token').value = t; el('lembrarToken').checked = true; }
  }
  el('btnEntrar').addEventListener('click', entrar);
  el('senha').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
  if (sessionStorage.getItem('admOk') === '1') liberaPainel();

  /* ---------------- upload e validação ---------------- */
  var dz = el('dropzone');
  dz.addEventListener('click', function () { el('arquivo').click(); });
  dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', function () { dz.classList.remove('over'); });
  dz.addEventListener('drop', function (e) {
    e.preventDefault(); dz.classList.remove('over');
    if (e.dataTransfer.files.length) processa(e.dataTransfer.files[0]);
  });
  el('arquivo').addEventListener('change', function () {
    if (this.files.length) processa(this.files[0]);
  });

  function lerAba(wb, nome, cols) {
    var ws = wb.Sheets[nome];
    if (!ws) return { erro: 'aba "' + nome + '" não encontrada' };
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    if (!rows.length) return { erro: 'aba "' + nome + '" vazia' };
    var header = rows[0].map(function (h) { return String(h).trim(); });
    for (var i = 0; i < cols.length; i++) {
      if (header[i] !== cols[i]) {
        return { erro: 'aba "' + nome + '": coluna ' + (i + 1) + ' deveria ser "' + cols[i] + '" e veio "' + (header[i] || '(vazia)') + '"' };
      }
    }
    var linhas = rows.slice(1)
      .map(function (r) { return cols.map(function (_, i) { return String(r[i] == null ? '' : r[i]).trim(); }); })
      .filter(function (r) { return r.some(function (v) { return v !== ''; }); });
    return { linhas: linhas };
  }

  function contaDuplicados(linhas, i) {
    var vistos = {}, dup = 0;
    linhas.forEach(function (l) { var k = l[i]; if (!k) return; if (vistos[k]) dup++; vistos[k] = 1; });
    return dup;
  }

  function processa(file) {
    dadosProntos = null;
    el('btnPublicar').disabled = true;
    while (el('resumoArquivo').firstChild) el('resumoArquivo').removeChild(el('resumoArquivo').firstChild);
    if (!/\.xlsx$/i.test(file.name)) {
      msg('msgArquivo', 'Envie um arquivo .xlsx.', 'erro');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      var wb;
      try {
        wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      } catch (err) {
        msg('msgArquivo', ['Não consegui ler o arquivo:', String(err && err.message || err)], 'erro');
        return;
      }
      var prod = lerAba(wb, 'Produtos', COLS_PROD);
      var serv = lerAba(wb, 'Servicos', COLS_SERV);
      var erros = [];
      if (prod.erro) erros.push(prod.erro);
      if (serv.erro) erros.push(serv.erro);

      if (!erros.length) {
        /* ---- validações de produtos ---- */
        var codVazio = prod.linhas.filter(function (l) { return !l[0]; }).length;
        var ncmRuim = prod.linhas.filter(function (l) { return !/^\d{4}\.\d{2}\.\d{2}$/.test(l[3]); }).length;
        var dupProd = contaDuplicados(prod.linhas, 0);
        if (codVazio) erros.push(codVazio + ' produto(s) sem código');
        if (ncmRuim) erros.push(ncmRuim + ' produto(s) com NCM fora do padrão 0000.00.00');
        if (dupProd) erros.push(dupProd + ' código(s) de produto duplicado(s)');

        /* ---- validações de serviços ---- */
        var lcRuim = serv.linhas.filter(function (l) { return !/^\d{2}\.\d{2}$/.test(l[0]); }).length;
        var erpVazio = serv.linhas.filter(function (l) { return !l[1]; }).length;
        /* Obs.: um mesmo código ERP PODE se repetir legitimamente em códigos LC116
           distintos (ex.: plano de saúde 04.22/04.23). Por isso NÃO bloqueamos por
           ERP duplicado — apenas por ERP vazio. */
        var contaRuim = serv.linhas.filter(function (l) { return l[5] && !/^\d+$/.test(l[5]); }).length;
        var impRuim = serv.linhas.filter(function (l) {
          return !(window.Fiscal && Fiscal.validaCampoImpostos(l[4]).ok);
        }).length;
        if (lcRuim) erros.push(lcRuim + ' serviço(s) com código LC fora do padrão 00.00');
        if (erpVazio) erros.push(erpVazio + ' serviço(s) sem código ERP');
        if (contaRuim) erros.push(contaRuim + ' serviço(s) com conta contábil não numérica');
        if (impRuim) erros.push(impRuim + ' serviço(s) com "Impostos Retidos" em formato não reconhecido (use "Não Retém" ou "Retém IR/PCC/INSS/PIS/COFINS")');
      }

      if (erros.length) {
        msg('msgArquivo', ['Arquivo reprovado na validação:'].concat(erros.map(function (x) { return '— ' + x; })), 'erro');
        return;
      }

      var hoje = new Date().toISOString().slice(0, 10);
      dadosProntos = {
        produtos: { colunas: COLS_PROD, linhas: prod.linhas, atualizado_em: hoje },
        servicos: { colunas: COLS_SERV, linhas: serv.linhas, atualizado_em: hoje }
      };
      msg('msgArquivo', 'Arquivo validado com sucesso — pronto para publicar.', 'ok');
      var ul = el('resumoArquivo');
      [
        prod.linhas.length.toLocaleString('pt-BR') + ' produtos',
        serv.linhas.length + ' serviços',
        'arquivo: ' + file.name
      ].forEach(function (t) {
        var li = document.createElement('li');
        li.textContent = t;      // file.name entra como texto — sem injeção de HTML
        ul.appendChild(li);
      });
      el('btnPublicar').disabled = false;
    };
    reader.readAsArrayBuffer(file);
  }

  /* ---------------- publicação ATÔMICA via Git Data API ---------------- */
  function ghApi(path, opts, token) {
    opts = opts || {};
    opts.headers = {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    var url = 'https://api.github.com/repos/' + REPO + path + (opts.method ? '' : sep + 't=' + Date.now());
    return fetch(url, opts);
  }
  function apiJson(r) {
    if (!r.ok) return r.json().then(function (j) { throw new Error((j && j.message) || ('HTTP ' + r.status)); },
      function () { throw new Error('HTTP ' + r.status); });
    return r.json();
  }

  /* Cria UM único commit contendo os dois arquivos. Se qualquer etapa falha,
     nada é publicado (a base nunca fica parcialmente atualizada). */
  function publicaAtomico(files, token, mensagem) {
    var branch;
    return ghApi('', {}, token).then(apiJson).then(function (repo) {
      branch = repo.default_branch || 'main';
      return ghApi('/git/ref/heads/' + branch, {}, token).then(apiJson);
    }).then(function (ref) {
      var headSha = ref.object.sha;
      return ghApi('/git/commits/' + headSha, {}, token).then(apiJson).then(function (commit) {
        return { headSha: headSha, baseTree: commit.tree.sha };
      });
    }).then(function (ctx) {
      return Promise.all(files.map(function (f) {
        return ghApi('/git/blobs', { method: 'POST', body: JSON.stringify({ content: f.content, encoding: 'utf-8' }) }, token).then(apiJson);
      })).then(function (blobs) {
        var tree = files.map(function (f, i) { return { path: f.path, mode: '100644', type: 'blob', sha: blobs[i].sha }; });
        return ghApi('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: ctx.baseTree, tree: tree }) }, token)
          .then(apiJson).then(function (t) { return { treeSha: t.sha, headSha: ctx.headSha }; });
      });
    }).then(function (ctx) {
      return ghApi('/git/commits', { method: 'POST', body: JSON.stringify({ message: mensagem, tree: ctx.treeSha, parents: [ctx.headSha] }) }, token)
        .then(apiJson);
    }).then(function (novo) {
      return ghApi('/git/refs/heads/' + branch, { method: 'PATCH', body: JSON.stringify({ sha: novo.sha }) }, token).then(apiJson);
    });
  }

  el('btnPublicar').addEventListener('click', function () {
    var token = el('token').value.trim();
    if (!token) { msg('msgPublicar', 'Informe o token de publicação do GitHub.', 'erro'); return; }
    if (!dadosProntos) { msg('msgPublicar', 'Valide um arquivo antes de publicar.', 'erro'); return; }
    if (el('lembrarToken').checked) sessionStorage.setItem('admToken', token);
    else sessionStorage.removeItem('admToken');

    var btn = el('btnPublicar');
    btn.disabled = true;
    msg('msgPublicar', 'Publicando os 2 arquivos em um único commit…', 'ok');
    var quando = new Date().toLocaleString('pt-BR');

    publicaAtomico([
      { path: 'data/produtos.json', content: JSON.stringify(dadosProntos.produtos) },
      { path: 'data/servicos.json', content: JSON.stringify(dadosProntos.servicos) }
    ], token, 'Atualização da base (produtos + serviços) — ' + quando)
      .then(function () {
        msg('msgPublicar', 'Base publicada com sucesso (commit único). O site atualiza em ~1 minuto (GitHub Pages).', 'ok');
        btn.disabled = false;
      })
      .catch(function (err) {
        msg('msgPublicar', [
          'Falha na publicação: ' + String(err && err.message || err),
          'Nada foi publicado — a base permanece na versão anterior.',
          'Confira se o token tem permissão de Contents: Read and write no repositório ' + REPO + '.'
        ], 'erro');
        btn.disabled = false;
      });
  });
})();
