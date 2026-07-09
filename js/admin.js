/* =====================================================================
   Área ADM — atualização da base publicada
   Fluxo: senha (gate local) → upload .xlsx → validação → commit dos
   JSONs em data/ via API do GitHub (token fine-grained do ADM).
   A segurança real da publicação é o token do GitHub; a senha desta
   página é apenas uma barreira de conveniência (o site é estático).
   ===================================================================== */
(function () {
  'use strict';

  /* SHA-256 da senha do ADM. Para trocar: gere o hash da nova senha
     (instruções no README) e substitua a constante abaixo. */
  var HASH_SENHA = 'fed92377fc0ea67de313c6e75f805cbfb2beb339f2b1cf916d1889b02273b0a3';

  var REPO = 'departamento-fiscal/departamento-fiscal.github.io';
  var COLS_PROD = ['Código do Produto', 'Nome do Produto', 'Descrição Detalhada', 'NCM', 'Classificação Fiscal', 'Unidade de Medida', 'Tipo de Item'];
  var COLS_SERV = ['Código LC 116', 'Código ERP', 'Descrição do Serviço', 'Quando Utilizar', 'Impostos Retidos', 'Conta Contábil', 'Descrição da Conta Contábil'];

  var dadosProntos = null; // { produtos: {...}, servicos: {...} }

  function el(id) { return document.getElementById(id); }
  function msg(id, texto, tipo) {
    el(id).innerHTML = texto ? '<div class="msg ' + tipo + '">' + texto + '</div>' : '';
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
    var t = localStorage.getItem('admToken');
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

  function processa(file) {
    dadosProntos = null;
    el('btnPublicar').disabled = true;
    el('resumoArquivo').innerHTML = '';
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
        msg('msgArquivo', 'Não consegui ler o arquivo: ' + err.message, 'erro');
        return;
      }
      var prod = lerAba(wb, 'Produtos', COLS_PROD);
      var serv = lerAba(wb, 'Servicos', COLS_SERV);
      var erros = [];
      if (prod.erro) erros.push(prod.erro);
      if (serv.erro) erros.push(serv.erro);

      if (!erros.length) {
        /* validações de conteúdo */
        var ncmRuim = prod.linhas.filter(function (l) { return !/^\d{4}\.\d{2}\.\d{2}$/.test(l[3]); }).length;
        var codVazio = prod.linhas.filter(function (l) { return !l[0]; }).length;
        var lcRuim = serv.linhas.filter(function (l) { return !/^\d{2}\.\d{2}$/.test(l[0]); }).length;
        if (codVazio) erros.push(codVazio + ' produto(s) sem código');
        if (ncmRuim) erros.push(ncmRuim + ' produto(s) com NCM fora do padrão 0000.00.00');
        if (lcRuim) erros.push(lcRuim + ' serviço(s) com código LC fora do padrão 00.00');
        var vistos = {}, dup = 0;
        prod.linhas.forEach(function (l) { if (vistos[l[0]]) dup++; vistos[l[0]] = 1; });
        if (dup) erros.push(dup + ' código(s) de produto duplicado(s)');
      }

      if (erros.length) {
        msg('msgArquivo', 'Arquivo reprovado na validação:<br>— ' + erros.join('<br>— '), 'erro');
        return;
      }

      var hoje = new Date().toISOString().slice(0, 10);
      dadosProntos = {
        produtos: { colunas: COLS_PROD, linhas: prod.linhas, atualizado_em: hoje },
        servicos: { colunas: COLS_SERV, linhas: serv.linhas, atualizado_em: hoje }
      };
      msg('msgArquivo', 'Arquivo validado com sucesso — pronto para publicar.', 'ok');
      el('resumoArquivo').innerHTML =
        '<li>' + prod.linhas.length.toLocaleString('pt-BR') + ' produtos</li>' +
        '<li>' + serv.linhas.length + ' serviços</li>' +
        '<li>arquivo: ' + file.name + '</li>';
      el('btnPublicar').disabled = false;
    };
    reader.readAsArrayBuffer(file);
  }

  /* ---------------- publicação via API GitHub ---------------- */
  function b64utf8(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function gh(caminho, opts, token) {
    opts = opts || {};
    opts.headers = {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    return fetch('https://api.github.com/repos/' + REPO + '/contents/' + caminho + (opts.method ? '' : '?t=' + Date.now()), opts);
  }
  function publicaArquivo(caminho, conteudo, token, mensagem) {
    return gh(caminho, {}, token)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (atual) {
        var body = { message: mensagem, content: b64utf8(conteudo) };
        if (atual && atual.sha) body.sha = atual.sha;
        return gh(caminho, { method: 'PUT', body: JSON.stringify(body) }, token);
      })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.message || ('HTTP ' + r.status)); });
        return r.json();
      });
  }

  el('btnPublicar').addEventListener('click', function () {
    var token = el('token').value.trim();
    if (!token) { msg('msgPublicar', 'Informe o token de publicação do GitHub.', 'erro'); return; }
    if (!dadosProntos) { msg('msgPublicar', 'Valide um arquivo antes de publicar.', 'erro'); return; }
    if (el('lembrarToken').checked) localStorage.setItem('admToken', token);
    else localStorage.removeItem('admToken');

    var btn = el('btnPublicar');
    btn.disabled = true;
    msg('msgPublicar', 'Publicando… (2 arquivos)', 'ok');
    var quando = new Date().toLocaleString('pt-BR');

    publicaArquivo('data/produtos.json', JSON.stringify(dadosProntos.produtos), token,
      'Atualização da base de produtos — ' + quando)
      .then(function () {
        return publicaArquivo('data/servicos.json', JSON.stringify(dadosProntos.servicos), token,
          'Atualização da base de serviços — ' + quando);
      })
      .then(function () {
        msg('msgPublicar', 'Base publicada com sucesso. O site atualiza em ~1 minuto (GitHub Pages).', 'ok');
        btn.disabled = false;
      })
      .catch(function (err) {
        msg('msgPublicar', 'Falha na publicação: ' + err.message +
          '<br>Confira se o token tem permissão de <b>Contents: Read and write</b> no repositório ' + REPO + '.', 'erro');
        btn.disabled = false;
      });
  });
})();
