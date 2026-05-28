# 📋 Portal de Notas

Portal individual de notas para divulgação sigilosa conforme a LGPD.  
Autenticação por **matrícula + primeiro nome**.

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

## 🌐 Deploy no Render (gratuito)

### 1. Suba o código no GitHub

```bash
git init
git add .
git commit -m "Portal de Notas v1"
git remote add origin https://github.com/SEU_USUARIO/portal-notas.git
git push -u origin main
```

### 2. Crie um serviço no Render

1. Acesse [render.com](https://render.com) → **New → Web Service**
2. Conecte seu repositório GitHub
3. O `render.yaml` já configura tudo automaticamente:
   - Build: instala dependências Python + builda o React
   - Start: inicia o uvicorn
   - Disk: persiste o banco SQLite em `/data`
4. Clique em **Deploy**

Após o deploy, você receberá uma URL pública (ex: `https://portal-notas.onrender.com`).  
Compartilhe essa URL com os alunos.

> ⚠️ **Plano gratuito do Render**: o serviço "dorme" após 15 min sem uso.  
> A primeira requisição pode demorar ~30s para "acordar".  
> Para evitar isso, use o plano pago ($7/mês) ou configure um ping periódico (UptimeRobot, gratuito).

---

## 📊 Formato da planilha CSV

Exporte do Excel como **CSV UTF-8**. Colunas obrigatórias:

| Nome | Matrícula | AC1 | AC2 | AC3 | AC4 | AP1 | AP2 | AS |
|------|-----------|-----|-----|-----|-----|-----|-----|----|
| João Silva | 20231001 | 8.5 | 7.0 | | | | | |

- A coluna de matrícula deve se chamar `Matrícula` ou `RA`
- A coluna de nome deve se chamar `Nome` ou `Aluno`
- Notas em branco são exibidas como pendentes (—)
- Separador: `;` (padrão Excel Brasil) ou `,` (auto-detectado)

---

## 🔒 Segurança

- O professor define uma senha na primeira vez que acessa
- Alunos autenticam com **matrícula + primeiro nome**
- Nenhum aluno vê dados de outro
- Dados armazenados em SQLite local (não em serviços de terceiros)
- Tokens de admin armazenados em `localStorage` do navegador
