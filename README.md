# Consulta Fiscal · Âmbar Energia

Sistema de consulta do Departamento Fiscal para requisitantes de material, administrativos e suprimentos: encontre o **código correto de produto ou serviço** antes da requisição no sistema ou da conferência da nota fiscal.

**Acesso:** https://departamento-fiscal.github.io — sem login para consulta.

## Funcionalidades

- **Produtos**: busca por nome/característica, filtro por NCM e por tipo de item (Produto / Bem Patrimonial). Sugere os códigos cadastrados mais aderentes, com descrição detalhada para apoiar a decisão.
- **Serviços**: busca pelo serviço pretendido + local de execução:
  - *Fora do estabelecimento* → só códigos **sem retenção de INSS**;
  - *No estabelecimento* → todas as opções; se for **manutenção**, o sistema pergunta a frequência: **contínuo** → só códigos **com retenção de INSS** (exigência legal); **esporádico** → só códigos sem retenção.
- **Busca por aproximação**: ignora acentos e maiúsculas, entende abreviações comuns (manut → manutenção, equip → equipamento…) e tolera pequenos erros de digitação. Busca numérica encontra NCM, código ERP e código LC 116 por prefixo.

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
index.html          consulta pública (abas Produtos e Serviços)
admin.html          área restrita de atualização da base
css/style.css       identidade visual Âmbar Energia (mesma do MtM Energia)
js/busca.js         motor de busca por aproximação (sem dependências)
js/app.js           lógica da consulta e regras fiscais de INSS
js/admin.js         validação do xlsx e publicação via API do GitHub
data/produtos.json  base de produtos (12.955 itens)
data/servicos.json  base de serviços LC 116 (208 itens)
vendor/xlsx…js      SheetJS — leitura do Excel no navegador (só no ADM)
```

Origem dos dados: `Base Fiscal - Saneada.xlsx` (saneamento documentado em 09/07/2026 — deduplicação, NBSP, NCM placeholder `0000.00.00`, consolidação de unidades).
