# Briefing de auditoria — Consulta Fiscal Âmbar Energia

Este documento orienta a auditoria externa do código. Leia junto com o `AGENTS.md`
(contexto, arquitetura e convenções) e o `README.md` (funcionalidades e operação).

## Escopo

Todo o código próprio do repositório:
`index.html`, `admin.html`, `css/style.css`, `js/busca.js`, `js/app.js`,
`js/admin.js`, `sw.js`, `manifest.webmanifest`.
Fora de escopo: `vendor/xlsx.full.min.js` (SheetJS upstream, sem modificações)
e o conteúdo de `data/*.json` (dados de negócio, não código).

## O que auditar, em ordem de prioridade

### 1. Correção das regras fiscais (crítico)
As regras de retenção de INSS em `js/app.js` (`buscaServicos`) decidem qual código
o usuário usa na requisição/nota — erro aqui gera passivo fiscal:
- fora do estabelecimento ⇒ nunca exibir código que retém INSS;
- manutenção contínua no estabelecimento ⇒ exibir somente códigos que retêm INSS;
- manutenção esporádica ⇒ somente códigos que não retêm;
- combinação de estados (trocar local depois de escolher frequência; limpar busca;
  trocar de aba) não pode deixar filtro "fantasma" ativo.

### 2. Correção do motor de busca (`js/busca.js`)
- `lev()` devolve `teto+1` quando estoura o limite — verificar que nenhum chamador
  interprete esse sentinela como distância real (já houve bug assim, corrigido);
- corte adaptativo (`0.42` / `top*0.55`) e regra de casamento (`≥ 50%` dos tokens):
  procurar casos degenerados (consulta de 1 token, só stopwords, só dígitos,
  strings vazias, caracteres unicode fora do ASCII);
- normalização: a classe regex de combinantes usa caracteres literais U+0300–U+036F —
  conferir robustez a encoding;
- desempenho: 12.955 registros × tokens por tecla digitada (debounce 160 ms) —
  avaliar se há explosão em consultas longas.

### 3. Segurança
- XSS: dados vêm do xlsx enviado pelo ADM e são renderizados com `innerHTML` após
  `escapaHtml`/`destaca` — procurar qualquer caminho que escape do escape
  (atributos `data-copia`, `title`, datalist de NCM, mensagens de erro do admin);
- `js/admin.js`: fluxo do token GitHub (nunca logado/enviado a terceiros além de
  `api.github.com`; `localStorage` só com opt-in), validação do arquivo antes do
  commit, tratamento de erro da API (409 de SHA desatualizado, rate limit);
- CSPs dos dois HTML: conferir se são as mais restritas possíveis sem quebrar o app;
- `sw.js`: envenenamento de cache (o que acontece se um deploy falho entrar no
  pré-cache), interceptação indevida de rotas do admin, atualização de versão.

### 4. Confiabilidade / manutenção
- Convenção de versionamento `?v=N` + `VERSAO` do SW: procurar pontos onde um
  esquecimento quebraria usuários (sugerir automação simples se couber);
- comportamento offline: dados `network-first` com fallback — o que o usuário vê
  na primeira visita sem rede? Mensagens de erro adequadas?
- acessibilidade: navegação por teclado nas pills, contraste das tags, aria-live.

## Limitações conhecidas e aceitas (NÃO reportar como achado)

1. Dados da base são públicos por design — consulta sem login é requisito.
2. A senha do ADM é comparação de hash no cliente — barreira de conveniência
   assumida e documentada; a segurança real de escrita é o token do GitHub.
3. Não há testes automatizados — o projeto é estático e pequeno; sugestões de
   suíte leve (ex.: testes de `busca.js` em Node) são bem-vindas como melhoria,
   não como defeito bloqueante.
4. `vendor/xlsx.full.min.js` é cópia do SheetJS sem revisão de código upstream.

## Formato esperado do relatório

Para cada achado: **arquivo:linha · severidade (crítica/alta/média/baixa) ·
descrição · cenário concreto de falha · correção sugerida**.
Separar "defeitos" de "melhorias recomendadas". Ao final, um veredito geral
de prontidão para uso corporativo.
