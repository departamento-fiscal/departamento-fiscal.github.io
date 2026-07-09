# Consulta Fiscal · Âmbar Energia

Sistema de consulta do Departamento Fiscal para requisitantes de material, administrativos e suprimentos: encontre o **código correto de produto ou serviço** antes da requisição no sistema ou da conferência da nota fiscal.

**Acesso:** https://departamento-fiscal.github.io — sem login para consulta.

## Funcionalidades

- **Produtos**: busca por nome/característica, filtro por NCM e por tipo de item (Produto / Bem Patrimonial). Sugere os códigos cadastrados mais aderentes, com descrição detalhada para apoiar a decisão.
- **Serviços**: busca pelo serviço pretendido + local de execução:
  - *Fora do estabelecimento* → só códigos **sem retenção de INSS**;
  - *No estabelecimento* → todas as opções; se for **manutenção**, o sistema pergunta a frequência: **contínuo** → só códigos **com retenção de INSS** (exigência legal); **esporádico** → só códigos sem retenção.
- **Busca por aproximação**: ignora acentos, maiúsculas e palavras vazias (de, da, para…), entende abreviações comuns (manut → manutenção, equip → equipamento…) e tolera pequenos erros de digitação (distância de Levenshtein com limite proporcional ao tamanho do termo). Busca numérica encontra NCM, código ERP e código LC 116 por prefixo. Corte adaptativo de relevância descarta a cauda de resultados fracos.
- **PWA instalável**: "Adicionar à tela inicial" no celular instala o app com o ícone Âmbar; o service worker mantém os assets em cache e a base de dados com estratégia *network-first* — com sinal, o usuário sempre vê a base mais recente; sem sinal, continua consultando a última baixada.
- **Celular**: em telas pequenas os resultados viram cards empilhados com rótulos e botão copiar — sem rolagem lateral.

## Atualização da base (ADM)

1. Acesse `/admin.html` e entre com a senha do administrador.
2. Envie o `.xlsx` com as abas `Produtos` e `Servicos` (mesmo layout da *Base Fiscal - Saneada.xlsx*). O arquivo é validado no navegador (colunas, NCM, códigos LC, duplicidades).
3. Informe o **token fine-grained do GitHub** (permissão *Contents: Read and write* somente neste repositório) e clique em **Publicar** — os dados em `data/*.json` são commitados e o site atualiza em ~1 minuto.

### Trocar a senha do ADM

Gere o hash SHA-256 da nova senha e substitua `HASH_SENHA` em `js/admin.js`:

```powershell
python -c "import hashlib;print(hashlib.sha256('NOVA_SENHA'.encode()).hexdigest())"
```

> Nota de segurança: o site é estático e os dados são públicos. A senha do ADM é uma barreira de conveniência; a proteção real da publicação é o token do GitHub (nunca fica no repositório).

## Estrutura

```
index.html            consulta pública (abas Produtos e Serviços) — CSP restrita a 'self'
admin.html            área restrita de atualização da base (noindex; CSP libera só api.github.com)
css/style.css         identidade visual padrão Âmbar Energia + responsivo mobile
js/busca.js           motor de busca por aproximação (sem dependências)
js/app.js             lógica da consulta, regras fiscais de INSS, clipboard, registro do SW
js/admin.js           gate de senha, validação do xlsx e publicação via API do GitHub
sw.js                 service worker (cache-first p/ estáticos, network-first p/ data/)
manifest.webmanifest  manifesto PWA (instalável, standalone)
icons/                ícones PWA 192/512/maskable + apple-touch-icon
data/produtos.json    base de produtos (12.955 itens)
data/servicos.json    base de serviços LC 116 (208 itens)
vendor/xlsx…js        SheetJS — leitura do Excel no navegador (só no ADM)
```

## Convenções de manutenção

- **Versionamento de assets**: os HTML referenciam `css/js` com `?v=N`. Ao alterar qualquer css/js, incremente o `?v=` nos dois HTML **e** a constante `VERSAO`/lista `ESTATICOS` em `sw.js` — é isso que invalida o cache dos usuários (navegador e service worker).
- **Dados**: `data/*.json` não entram no pré-cache do SW; são buscados na rede a cada visita (com fallback offline), então a publicação do ADM chega aos usuários sem troca de versão.
- **Sem build**: o site é 100% estático, sem dependências de build ou frameworks; o único vendor é o SheetJS, usado apenas na página ADM.

## Notas de segurança (para revisão/auditoria)

- Dados de produtos/serviços são **públicos por design** (consulta sem login).
- A senha do ADM (hash SHA-256 client-side) é barreira de conveniência, não controle de segurança: num site estático qualquer pessoa pode ler o JS. O controle real de escrita é o **token fine-grained do GitHub**, que nunca fica no repositório e só é usado no navegador do ADM contra `api.github.com`.
- "Lembrar token" grava em `localStorage` por opção explícita do ADM (uso em máquina pessoal); caso contrário o token não é persistido.
- Todo conteúdo dinâmico renderizado passa por escape de HTML (`Busca.escapaHtml`); as CSPs bloqueiam scripts externos e limitam conexões.

Origem dos dados: `Base Fiscal - Saneada.xlsx` (saneamento documentado em 09/07/2026 — deduplicação, NBSP, NCM placeholder `0000.00.00`, consolidação de unidades).
