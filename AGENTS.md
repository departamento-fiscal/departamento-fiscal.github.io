# Contexto do projeto — Consulta Fiscal Âmbar Energia

Sistema estático de consulta do Departamento Fiscal, hospedado em GitHub Pages
(https://departamento-fiscal.github.io). Usuários de outras áreas (requisitantes,
administrativo, suprimentos) pesquisam códigos de **produtos** (12.955 itens) e
**serviços** (208 itens LC 116/2003) para requisição e conferência de nota fiscal.
Consulta pública sem login; atualização da base restrita ao ADM.

## Arquitetura (sem build, sem frameworks)

| Arquivo | Papel |
|---|---|
| `index.html` | Consulta pública, abas Produtos/Serviços; CSP `default-src 'self'` |
| `admin.html` | Atualização da base (gate de senha + token GitHub); CSP libera só `api.github.com`; `noindex` |
| `css/style.css` | Identidade visual padrão Âmbar Energia + responsivo (cards ≤700px) |
| `js/busca.js` | Motor de busca por aproximação, sem dependências (IIFE, expõe `window.Busca`) |
| `js/app.js` | Regras de negócio da consulta (filtros INSS), clipboard, registro do SW |
| `js/admin.js` | SHA-256 da senha, validação do .xlsx (SheetJS), commit via API GitHub |
| `sw.js` | Service worker: cache-first p/ estáticos versionados; network-first p/ `data/`; ADM nunca cacheado |
| `data/*.json` | Base de dados (formato `{colunas, linhas: string[][], atualizado_em}`) |
| `vendor/xlsx.full.min.js` | SheetJS, usado apenas pelo admin.html |

## Regras de negócio críticas (legislação fiscal — não alterar sem confirmação)

A decisão fiscal é separada da busca textual: `js/fiscal.js` interpreta o campo
"Impostos Retidos" de forma estruturada (`classificaImpostos`) e avalia o cenário
do questionário (`avaliaCenario`). O questionário (cessão de mão de obra/empreitada,
local, frequência, Simples Nacional) aparece na aba Serviços quando há candidato
que retém INSS. Regras vigentes (definidas pelo Departamento Fiscal em 10/07/2026):
1. **Cessão = "Sim"** → em regra incide retenção de INSS (Lei 8.212/91, art. 31);
   códigos que retêm INSS são destacados como "coerente com o cenário"; código sem
   INSS neste cenário gera alerta de INCOERÊNCIA. Nada é ocultado.
2. **Cessão = "Não"** → **códigos que retêm INSS são OCULTADOS da lista** (sem
   cessão não há retenção; exibi-los induziria à requisição errada). O aviso
   informa quantos códigos foram ocultados. Se todos os candidatos retêm INSS,
   a mensagem de vazio explica o porquê. `temInss` (que controla a exibição do
   questionário) é calculado ANTES do filtro — não mover.
3. **Cessão = "Não sei"/não informada** → nada é ocultado; aviso pede a informação.
4. **Simples Nacional** → mensagem EXATA definida pelo Fiscal (não parafrasear):
   "Atenção: Prestadores optantes pelo Simples Nacional, não sofrem retenções,
   com exceção dos enquadrados no Anexo IV".
5. Local de execução e frequência são informativos (reforçam avisos), não filtram.

## Convenções obrigatórias

- **Versionamento de cache**: os HTML referenciam css/js com `?v=N`. Toda alteração
  de css/js exige incrementar o `?v=` nos DOIS html **e** `VERSAO` + lista `ESTATICOS`
  em `sw.js`. Sem isso, usuários ficam com código velho preso no cache/SW.
- **Sem dependências novas**: o site deve continuar 100% estático e sem build.
  Não adicionar CDN (a CSP bloqueia); vendors entram no repositório.
- **Escape de HTML**: todo conteúdo dinâmico renderizado passa por
  `Busca.escapaHtml`/`destaca` (dados vêm do xlsx do ADM — tratar como não confiáveis).
- **Idioma**: UI, comentários e mensagens em pt-BR. Estilo ES5 (var, function),
  compatível com navegadores corporativos antigos.
- **Dados**: `Código do Produto` é chave única em produtos; `Código LC 116` repete-se
  legitimamente em serviços (mesmo item da lei com vários produtos ERP);
  NCM `0000.00.00` é placeholder de "sem classificação" (219 itens) — exibido como
  tag "sem NCM", não é bug.

## Como rodar/testar localmente

```
python -m http.server 8734
# http://localhost:8734  (SW registra em localhost)
```
Não há suíte de testes automatizada; validar manualmente:
busca com erro de digitação ("tinta epoxy cinsa" → tintas epóxi cinza),
fluxo INSS completo na aba Serviços, viewport 375px sem rolagem lateral,
admin.html: senha → upload xlsx (abas `Produtos`/`Servicos`) → validação.

## Modelo de segurança (decisões conscientes, não achados)

- Dados da base são **públicos por design** (consulta sem login).
- A senha do ADM (hash SHA-256 no cliente) é barreira de conveniência —
  num site estático o JS é legível por qualquer um. O controle real de escrita
  é o **token fine-grained do GitHub** (Contents RW só neste repositório),
  digitado pelo ADM e nunca commitado.
- "Lembrar token" usa `localStorage` mediante opção explícita do ADM.
