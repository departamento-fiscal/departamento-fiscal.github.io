/* =====================================================================
   Módulo fiscal — Consulta Fiscal Âmbar
   Objetivo: separar a DECISÃO fiscal da busca textual.
   - classificaImpostos(): interpreta o campo "Impostos Retidos" de forma
     ESTRUTURADA (não usa mais um simples /INSS/ sobre texto livre).
   - avaliaCenario(): a partir do cenário informado pelo usuário
     (cessão de mão de obra/empreitada, local, continuidade, Simples),
     devolve uma ORIENTAÇÃO advisory sobre a retenção de INSS.
     Nunca decide sozinho de forma definitiva: sempre remete ao Fiscal.

   Base legal de referência (não substitui análise do Departamento Fiscal):
   - Lei 8.212/1991, art. 31 (retenção de 11% na cessão de mão de obra/empreitada)
   - LC 116/2003 (natureza dos serviços / ISS)
   - Regimes especiais: Simples Nacional (exceções por anexo/atividade)
   ===================================================================== */
(function (global) {
  'use strict';

  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /* Interpreta o campo textual de impostos retidos em flags estruturadas.
     Regra: só considera um tributo "retido" quando o texto AFIRMA retenção
     ("Retém ..."). Textos como "Não Retém" ou "Não Retém INSS" => sem retenção.
     A exceção do Simples Nacional (entre parênteses) é sinalizada à parte. */
  function classificaImpostos(txt) {
    var raw = String(txt == null ? '' : txt).trim();
    // observação entre parênteses (ex.: exceção do Simples) precisa ser removida
    // ANTES de normalizar, porque norm() já converte "(" ")" em espaço.
    var semObs = raw.replace(/\([^)]*\)/g, ' ');
    var nFull = norm(raw);       // texto completo (para detectar a exceção do Simples)
    var n = norm(semObs);        // sem observação (para afirmar tributos retidos)
    var out = {
      texto: raw, reconhecido: false, naoRetem: false,
      retemInss: false, retemIr: false, retemPcc: false, retemPisCofins: false,
      excecaoSimples: false, tributos: []
    };
    if (!norm(raw)) return out;

    out.excecaoSimples = /\bsimples nacional\b/.test(nFull);

    // afirma retenção somente quando começa por "retem"
    var afirma = /^retem\b/.test(n);
    var base = n;

    if (!afirma) {
      // "nao retem", "sem inss", ou qualquer texto que não afirme retenção
      out.naoRetem = true;
      out.reconhecido = /^nao retem\b/.test(n) || /\bnao retem\b/.test(n);
      return out;
    }

    out.reconhecido = true;
    if (/\binss\b/.test(base)) { out.retemInss = true; out.tributos.push('INSS'); }
    if (/\bir\b/.test(base)) { out.retemIr = true; out.tributos.push('IR'); }
    if (/\bpcc\b/.test(base)) { out.retemPcc = true; out.tributos.push('PCC'); }
    if (/\bpis\b/.test(base)) { out.retemPisCofins = true; if (out.tributos.indexOf('PIS') < 0) out.tributos.push('PIS'); }
    if (/\bcofins\b/.test(base)) { out.retemPisCofins = true; if (out.tributos.indexOf('COFINS') < 0) out.tributos.push('COFINS'); }
    return out;
  }

  /* Valida se o texto do campo está num formato reconhecido (para o ADM).
     Não é uma lista fechada rígida: aceita "Não Retém" ou "Retém <tributos>",
     desde que os tributos sejam reconhecidos. Retorna {ok, motivo}. */
  var TRIBUTOS_OK = ['inss', 'ir', 'pcc', 'pis', 'cofins'];
  function validaCampoImpostos(txt) {
    var raw = String(txt == null ? '' : txt).trim();
    // remove observação entre parênteses ANTES de normalizar (norm apaga parênteses)
    var n = norm(raw.replace(/\([^)]*\)/g, ' '));
    if (!n) return { ok: false, motivo: 'campo "Impostos Retidos" vazio' };
    if (/^nao retem\b/.test(n)) return { ok: true };
    if (!/^retem\b/.test(n)) {
      return { ok: false, motivo: 'valor "' + raw + '" não começa por "Retém" nem "Não Retém"' };
    }
    var base = n.replace(/^retem\b/, ' ');
    var palavras = base.split(' ').filter(function (w) { return w && w !== 'e'; });
    var invalidas = palavras.filter(function (w) { return TRIBUTOS_OK.indexOf(w) < 0; });
    if (invalidas.length) {
      return { ok: false, motivo: 'valor "' + raw + '" tem tributo(s) não reconhecido(s): ' + invalidas.join(', ') };
    }
    if (!palavras.length) return { ok: false, motivo: 'valor "' + raw + '" afirma retenção sem indicar tributo' };
    return { ok: true };
  }

  /* Avalia o cenário informado e devolve orientação advisory sobre INSS.
     cen = { local:'dentro'|'fora'|null, cessao:'sim'|'nao'|'naosei'|null,
             continuo:true|false|null, simples:'sim'|'nao'|null }
     cls = resultado de classificaImpostos() para o código em questão.
     Retorna { inss:'aplica'|'nao_aplica'|'indefinido', nivel, mensagens:[] } */
  function avaliaCenario(cen, cls) {
    cen = cen || {};
    var msgs = [];
    var base = 'A retenção de INSS (11%, Lei 8.212/91 art. 31) depende de haver cessão de mão de obra ou empreitada, da natureza e continuidade do serviço, do local de execução e do regime do prestador. Confirme sempre com o Departamento Fiscal.';
    var semInss = cls && cls.reconhecido && !cls.retemInss;

    if (cen.cessao === 'sim') {
      // Cenário de cessão/empreitada + código que NÃO retém INSS = INCOERENTE,
      // não "não aplica": o usuário provavelmente escolheu o código errado.
      if (semInss) {
        return { inss: 'incoerente', nivel: 'alerta', mensagens: [
          'O cenário informado indica cessão de mão de obra/empreitada, mas este código NÃO prevê retenção de INSS na classificação cadastrada. Priorize um código que retém INSS ou confirme o enquadramento com o Departamento Fiscal.',
          base
        ] };
      }
      msgs.push('Cenário informado: HÁ cessão de mão de obra/empreitada → em regra incide retenção de INSS. Priorize o código que retém INSS.');
      if (cen.simples === 'sim' || (cls && cls.excecaoSimples)) {
        msgs.push('Atenção: prestador optante pelo Simples Nacional pode NÃO sofrer retenção (ex.: Anexo III). Confirmar enquadramento com o Fiscal.');
      }
      if (cen.continuo === true) {
        msgs.push('Serviço contínuo/recorrente reforça a caracterização de cessão de mão de obra — atenção redobrada.');
      }
      msgs.push(base);
      return { inss: 'aplica', nivel: 'alerta', mensagens: msgs };
    }

    if (cen.cessao === 'nao') {
      msgs.push('Cenário informado: NÃO há cessão de mão de obra/empreitada → em regra não há retenção de INSS. Ainda assim, valide a natureza do serviço com o Fiscal.');
      msgs.push(base);
      return { inss: 'nao_aplica', nivel: 'info', mensagens: msgs };
    }

    // cessão não informada (null / "não sei")
    if (semInss) {
      return { inss: 'nao_aplica', nivel: 'info', mensagens: ['Este código não prevê retenção de INSS na classificação fiscal cadastrada.'] };
    }
    msgs.push('Informe se o serviço é prestado mediante cessão de mão de obra ou empreitada — é isso que define a retenção de INSS, e não a palavra digitada.');
    msgs.push(base);
    return { inss: 'indefinido', nivel: 'info', mensagens: msgs };
  }

  var api = {
    norm: norm,
    classificaImpostos: classificaImpostos,
    validaCampoImpostos: validaCampoImpostos,
    avaliaCenario: avaliaCenario
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.Fiscal = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
