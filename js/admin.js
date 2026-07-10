/* =====================================================================
   Área ADM — atualização da base (login usuário + senha)
   O token do GitHub NÃO fica mais no navegador: a publicação passa por um
   publicador serverless (Cloudflare Worker) que guarda o token como segredo.
   Aqui o funcionário só usa USUÁRIO + SENHA.
   ===================================================================== */
(function () {
  'use strict';

  /* URL do publicador (preencher após o deploy do Worker) */
  var PUBLISHER_URL = 'https://ambar-publisher.arcosta2012.workers.dev';

  var COLS_PROD = ['Código do Produto', 'Nome do Produto', 'Descrição Detalhada', 'NCM', 'Classificação Fiscal', 'Unidade de Medida', 'Tipo de Item'];
  var COLS_SERV = ['Código LC 116', 'Código ERP', 'Descrição do Serviço', 'Quando Utilizar', 'Impostos Retidos', 'Conta Contábil', 'Descrição da Conta Contábil'];
  var dadosProntos = null;

  function el(id) { return document.getElementById(id); }
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
  function sessao() { return sessionStorage.getItem('admSession') || ''; }

  /* ---------------- login (via Worker) ---------------- */
  function entrar() {
    var user = el('usuario').value.trim();
    var pass = el('senha').value;
    if (!user || !pass) { msg('msgLogin', 'Informe usuário e senha.', 'erro'); return; }
    msg('msgLogin', 'Entrando…', 'ok');
    fetch(PUBLISHER_URL + '/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: user, pass: pass })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { msg('msgLogin', res.j.error || 'Falha no login.', 'erro'); return; }
        sessionStorage.setItem('admSession', res.j.token);
        sessionStorage.setItem('admUser', res.j.user);
        liberaPainel();
      })
      .catch(function () { msg('msgLogin', 'Não foi possível contatar o servidor de login. Verifique a conexão.', 'erro'); });
  }
  function liberaPainel() {
    el('telaLogin').hidden = true;
    el('telaPainel').hidden = false;
    var badge = el('statusBadge');
    badge.textContent = 'ADM: ' + (sessionStorage.getItem('admUser') || 'autenticado');
    badge.classList.add('ok');
  }
  function sair() {
    sessionStorage.removeItem('admSession');
    sessionStorage.removeItem('admUser');
    location.reload();
  }
  el('btnEntrar').addEventListener('click', entrar);
  el('senha').addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
  var btnSair = el('btnSair'); if (btnSair) btnSair.addEventListener('click', sair);
  if (sessao()) liberaPainel();

  /* ---------------- upload e validação (inalterado) ---------------- */
  var dz = el('dropzone');
  dz.addEventListener('click', function () { el('arquivo').click(); });
  dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', function () { dz.classList.remove('over'); });
  dz.addEventListener('drop', function (e) {
    e.preventDefault(); dz.classList.remove('over');
    if (e.dataTransfer.files.length) processa(e.dataTransfer.files[0]);
  });
  el('arquivo').addEventListener('change', function () { if (this.files.length) processa(this.files[0]); });

  function lerAba(wb, nome, cols) {
    var ws = wb.Sheets[nome];
    if (!ws) return { erro: 'aba "' + nome + '" não encontrada' };
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    if (!rows.length) return { erro: 'aba "' + nome + '" vazia' };
    var header = rows[0].map(function (h) { return String(h).trim(); });
    for (var i = 0; i < cols.length; i++) {
      if (header[i] !== cols[i]) return { erro: 'aba "' + nome + '": coluna ' + (i + 1) + ' deveria ser "' + cols[i] + '" e veio "' + (header[i] || '(vazia)') + '"' };
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
    if (!/\.xlsx$/i.test(file.name)) { msg('msgArquivo', 'Envie um arquivo .xlsx.', 'erro'); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      var wb;
      try { wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' }); }
      catch (err) { msg('msgArquivo', ['Não consegui ler o arquivo:', String(err && err.message || err)], 'erro'); return; }
      var prod = lerAba(wb, 'Produtos', COLS_PROD);
      var serv = lerAba(wb, 'Servicos', COLS_SERV);
      var erros = [];
      if (prod.erro) erros.push(prod.erro);
      if (serv.erro) erros.push(serv.erro);
      if (!erros.length) {
        var codVazio = prod.linhas.filter(function (l) { return !l[0]; }).length;
        var ncmRuim = prod.linhas.filter(function (l) { return !/^\d{4}\.\d{2}\.\d{2}$/.test(l[3]); }).length;
        var dupProd = contaDuplicados(prod.linhas, 0);
        if (codVazio) erros.push(codVazio + ' produto(s) sem código');
        if (ncmRuim) erros.push(ncmRuim + ' produto(s) com NCM fora do padrão 0000.00.00');
        if (dupProd) erros.push(dupProd + ' código(s) de produto duplicado(s)');
        var lcRuim = serv.linhas.filter(function (l) { return !/^\d{2}\.\d{2}$/.test(l[0]); }).length;
        var erpVazio = serv.linhas.filter(function (l) { return !l[1]; }).length;
        var contaRuim = serv.linhas.filter(function (l) { return l[5] && !/^\d+$/.test(l[5]); }).length;
        var impRuim = serv.linhas.filter(function (l) { return !(window.Fiscal && Fiscal.validaCampoImpostos(l[4]).ok); }).length;
        if (lcRuim) erros.push(lcRuim + ' serviço(s) com código LC fora do padrão 00.00');
        if (erpVazio) erros.push(erpVazio + ' serviço(s) sem código ERP');
        if (contaRuim) erros.push(contaRuim + ' serviço(s) com conta contábil não numérica');
        if (impRuim) erros.push(impRuim + ' serviço(s) com "Impostos Retidos" em formato não reconhecido');
      }
      if (erros.length) { msg('msgArquivo', ['Arquivo reprovado na validação:'].concat(erros.map(function (x) { return '— ' + x; })), 'erro'); return; }
      var hoje = new Date().toISOString().slice(0, 10);
      dadosProntos = {
        produtos: { colunas: COLS_PROD, linhas: prod.linhas, atualizado_em: hoje },
        servicos: { colunas: COLS_SERV, linhas: serv.linhas, atualizado_em: hoje }
      };
      msg('msgArquivo', 'Arquivo validado com sucesso — pronto para publicar.', 'ok');
      var ul = el('resumoArquivo');
      [prod.linhas.length.toLocaleString('pt-BR') + ' produtos', serv.linhas.length + ' serviços', 'arquivo: ' + file.name].forEach(function (t) {
        var li = document.createElement('li'); li.textContent = t; ul.appendChild(li);
      });
      el('btnPublicar').disabled = false;
    };
    reader.readAsArrayBuffer(file);
  }

  /* ---------------- publicação (via Worker) ---------------- */
  el('btnPublicar').addEventListener('click', function () {
    if (!dadosProntos) { msg('msgPublicar', 'Valide um arquivo antes de publicar.', 'erro'); return; }
    if (!sessao()) { msg('msgPublicar', 'Sessão expirada — faça login novamente.', 'erro'); return; }
    var btn = el('btnPublicar');
    btn.disabled = true;
    msg('msgPublicar', 'Publicando…', 'ok');
    fetch(PUBLISHER_URL + '/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sessao() },
      body: JSON.stringify(dadosProntos)
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || 'falha');
        msg('msgPublicar', 'Base publicada com sucesso. O site atualiza em ~1 minuto.', 'ok');
        btn.disabled = false;
      })
      .catch(function (err) {
        msg('msgPublicar', ['Falha na publicação: ' + String(err && err.message || err), 'A base permanece na versão anterior.'], 'erro');
        btn.disabled = false;
      });
  });
})();
