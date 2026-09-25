# 📋 Portal de Notas

Portal individual de notas para divulgação sigilosa conforme a LGPD.
Autenticação por **matrícula + primeiro nome**. Suporta **múltiplas disciplinas**:
cada aluno vê apenas as disciplinas em que está matriculado.

Sem painel de admin e sem banco de dados: as notas vivem em **planilhas CSV**
na pasta `notas/` (fora do git). Em produção, os arquivos ficam num bucket
privado no **Cloudflare R2** e o portal os baixa automaticamente — as notas
nunca passam pelo git.

---

## 📁 Estrutura das notas

```
notas/
  notas.json            ← manifesto das disciplinas
  calculo1-2026-1.csv   ← uma planilha por disciplina/turma
  gestao-2026-2.csv
```

### `notas.json` (manifesto)

```json
[
  { "arquivo": "calculo1-2026-1.csv", "nome": "Cálculo I", "turma": "2026.1" },
  { "arquivo": "gestao-2026-2.csv",   "nome": "Gestão",    "turma": "2026.2" }
]
```

Para adicionar uma disciplina: crie o CSV e some uma entrada no manifesto
(e suba os dois para o R2, em produção).

### Formato do CSV

Exporte do Excel como **CSV UTF-8** (separador `;` ou `,`, auto-detectado):

| NOME | MATRÍCULA | AC1 | AC2 | AC3 | AC4 | AP1 | AP2 | AS | MÉDIAS AC | MÉDIA FINAL |
|------|-----------|-----|-----|-----|-----|-----|-----|----|-----------|-------------|
| João Silva | 20231001 | 8.5 | 7.0 | | | | | | | |

- A coluna de matrícula deve se chamar `MATRÍCULA` ou `RA`
- A coluna de nome deve se chamar `NOME` ou `ALUNO`
- Colunas de controle interno (`STATUS`, `AG`, `DRAGSTATUS`, `OBS`) são ignoradas
- Colunas sem nenhuma nota lançada são escondidas automaticamente
- Notas em branco aparecem como pendentes (—)
- Matrículas duplicadas no mesmo CSV: a primeira é mantida (aviso no log)

---

## 🖥️ Rodar localmente

### Pré-requisitos
- Python 3.11+
- Node.js 18+

### 1. Backend (FastAPI)

```bash
# Na pasta raiz do projeto
pip install -r requirements.txt
uvicorn main:app --reload
# Abre em http://localhost:8000
```

Sem as variáveis `R2_*` definidas, o portal usa a pasta `notas/` local —
edições no CSV aparecem na hora, sem reiniciar.

### 2. Frontend (React/Vite)

```bash
# Em outro terminal
cd frontend
npm install
npm run dev
# Abre em http://localhost:5173
```

> O Vite redireciona `/api/*` automaticamente para o FastAPI em `:8000`.
> Acesse sempre pelo **http://localhost:5173** durante o desenvolvimento.

---

## ☁️ Produção: Cloudflare R2 + Render

Como o plano gratuito do Render não tem disco persistente, as notas ficam num
bucket privado do **Cloudflare R2** (plano gratuito, 10 GB). O portal baixa os
arquivos do bucket a cada 60 segundos (configurável) e mantém um cache local.

### 1. Criar o bucket no R2

1. Crie uma conta em [cloudflare.com](https://www.cloudflare.com) (gratuita)
2. No painel, vá em **R2 Object Storage → Create bucket**
3. Nome: `portal-notas` → **Create bucket**

### 2. Criar o token de acesso

1. Em **R2 → Manage R2 API Tokens → Create API token**
2. Permissão: **Object Read & Write**, restrito ao bucket `portal-notas`
3. Anote: **Access Key ID**, **Secret Access Key** e o **Account ID**
   (aparece na URL do endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`)

### 3. Subir as notas

No painel do R2, abra o bucket e arraste os arquivos da sua pasta `notas/`
local: `notas.json` + todos os `.csv` (na raiz do bucket, sem subpastas).

### 4. Configurar o Render

1. Suba o código no GitHub (`git push`) — as notas **não** vão junto
2. Em [render.com](https://render.com) → **New → Web Service** → conecte o repo
3. O `render.yaml` já configura build e start; no passo de variáveis de
   ambiente (ou depois, em **Environment**), preencha:

   | Variável | Valor |
   |---|---|
   | `R2_ACCOUNT_ID` | o Account ID do passo 2 |
   | `R2_ACCESS_KEY_ID` | o Access Key ID |
   | `R2_SECRET_ACCESS_KEY` | o Secret Access Key |
   | `R2_BUCKET` | `portal-notas` |

4. **Deploy**. A URL pública (ex: `https://portal-notas.onrender.com`) é a que
   você compartilha com os alunos.

### 5. Atualizar notas depois

1. Edite o CSV local
2. Arraste o arquivo para o bucket no painel do R2 (sobrescreve o anterior)
3. Em até ~60 s o portal já mostra as notas novas — sem redeploy, sem senha

> 💡 Para testar a configuração: acesse `https://SEU-APP.onrender.com/api/status`.
> O campo `"fonte": "r2"` e `"r2_sync_ok": true` confirmam que o sync está ativo.

> ⚠️ **Plano gratuito do Render**: o serviço "dorme" após 15 min sem uso e a
> primeira requisição demora ~30–60 s para acordar. Para evitar, use o plano
> pago ($7/mês) ou um ping periódico (UptimeRobot, gratuito).

---

## 🔒 Segurança

- Alunos autenticam com **matrícula + primeiro nome**
- Cada aluno vê apenas as próprias notas, somente das disciplinas em que está matriculado
- Quem não está em nenhuma planilha recebe "matrícula não encontrada"
- As notas **não são versionadas no git** — ficam na sua máquina e no bucket privado do R2
- O bucket não é público; só o portal lê dele, com token restrito
- Sem painel admin, sem senhas, sem tokens de sessão: a superfície de ataque é mínima
- CORS restrito a `localhost:5173` em dev (configurável via `ALLOWED_ORIGINS`)
