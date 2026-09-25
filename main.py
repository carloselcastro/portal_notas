import hashlib
import hmac
import json
import logging
import os
import secrets
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import sqlite3

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("portal-notas")

# ── Setup ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="Portal de Notas")

# Origens permitidas: em produção o frontend é servido pelo próprio FastAPI
# (mesma origem, CORS não se aplica). Em dev, o Vite roda em :5173.
# Para liberar outras origens, defina ALLOWED_ORIGINS="https://a.com,https://b.com".
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

DB_PATH = Path("data/grades.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


# ── Handler global de erros ───────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Erro não tratado em {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Erro interno do servidor. Tente novamente mais tarde."},
    )


# ── DB helpers ────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(str(DB_PATH), timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def init_db():
    conn = get_db()
    conn.execute(
        "CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)"
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS grades (
            matricula TEXT PRIMARY KEY,
            nome      TEXT,
            data      TEXT
        )"""
    )
    conn.commit()
    conn.close()


init_db()


PBKDF2_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    """PBKDF2-HMAC-SHA256 com salt aleatório. Formato: pbkdf2$iter$salt$hash"""
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS
    ).hex()
    return f"pbkdf2${PBKDF2_ITERATIONS}${salt}${h}"


def verify_password(password: str, stored: str) -> bool:
    """Verifica senha. Aceita o formato legado (SHA-256 puro) para migração."""
    if stored.startswith("pbkdf2$"):
        try:
            _, iter_s, salt, expected = stored.split("$", 3)
            h = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iter_s)
            ).hex()
            return hmac.compare_digest(h, expected)
        except (ValueError, TypeError):
            return False
    # Legado: SHA-256 sem salt (versão inicial do portal)
    legacy = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return hmac.compare_digest(legacy, stored)


def issue_token() -> str:
    """Gera token de sessão aleatório e o persiste (login anterior é revogado)."""
    token = secrets.token_urlsafe(32)
    set_config("admin_token", token)
    return token


def get_config(key: str, default: Optional[str] = None) -> Optional[str]:
    conn = get_db()
    try:
        row = conn.execute("SELECT value FROM config WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default
    finally:
        conn.close()


def set_config(key: str, value: str) -> None:
    conn = get_db()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO config (key, value) VALUES (?,?)", (key, value)
        )
        conn.commit()
    finally:
        conn.close()


def normalize(s: str) -> str:
    return (
        unicodedata.normalize("NFD", s or "")
        .encode("ascii", "ignore")
        .decode()
        .lower()
        .strip()
    )


# ── Auth ──────────────────────────────────────────────────────────────────────
def verify_admin(authorization: Optional[str] = Header(None)) -> bool:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Não autorizado — faça login novamente")
    token = authorization.split(" ", 1)[1]
    stored = get_config("admin_token")
    if not stored or not hmac.compare_digest(token, stored):
        raise HTTPException(status_code=401, detail="Token inválido — faça login novamente")
    return True


# ── Models ────────────────────────────────────────────────────────────────────
class SetupRequest(BaseModel):
    password: str


class LoginRequest(BaseModel):
    password: str


class GradesUpload(BaseModel):
    data: List[Dict[str, Any]]   # compatível com Python 3.8+
    columns: List[str]
    turma: str = ""


class StudentLoginRequest(BaseModel):
    matricula: str
    nome: str


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/api/status")
def status():
    conn = get_db()
    try:
        count = conn.execute("SELECT COUNT(*) as c FROM grades").fetchone()["c"]
    finally:
        conn.close()
    return {
        "setup_done": get_config("password_hash") is not None,
        "student_count": count,
        "columns": json.loads(get_config("columns", "[]")),
        "turma": get_config("turma", ""),
    }


@app.post("/api/setup")
def setup(req: SetupRequest):
    if get_config("password_hash"):
        raise HTTPException(400, "Senha já configurada")
    if len(req.password) < 6:
        raise HTTPException(400, "Senha deve ter ao menos 6 caracteres")
    set_config("password_hash", hash_password(req.password))
    return {"ok": True, "token": issue_token()}


@app.post("/api/login")
def login(req: LoginRequest):
    stored = get_config("password_hash")
    if not stored:
        raise HTTPException(400, "Nenhuma senha configurada")
    if not verify_password(req.password, stored):
        raise HTTPException(401, "Senha incorreta")
    # Migração transparente: hash legado (SHA-256) → PBKDF2 com salt
    if not stored.startswith("pbkdf2$"):
        set_config("password_hash", hash_password(req.password))
        logger.info("Hash de senha migrado para PBKDF2")
    return {"ok": True, "token": issue_token()}


@app.post("/api/grades", dependencies=[Depends(verify_admin)])
def upload_grades(req: GradesUpload):
    logger.info(f"Upload: {len(req.data)} alunos, colunas: {req.columns}")
    conn = get_db()
    try:
        conn.execute("DELETE FROM grades")
        inserted = 0
        for row in req.data:
            matricula = str(row.get("matricula", "") or "").strip()
            nome = str(row.get("nome", "") or "").strip()
            if not matricula:
                logger.warning(f"Linha sem matrícula ignorada: {row}")
                continue
            grade_data = {k: v for k, v in row.items() if k not in ("matricula", "nome")}
            conn.execute(
                "INSERT OR REPLACE INTO grades (matricula, nome, data) VALUES (?,?,?)",
                (matricula, nome, json.dumps(grade_data, ensure_ascii=False)),
            )
            inserted += 1
        conn.commit()
        logger.info(f"Salvos {inserted} alunos com sucesso")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro ao salvar grades: {e}", exc_info=True)
        raise HTTPException(500, "Erro ao salvar as notas. Verifique o arquivo e tente novamente.")
    finally:
        conn.close()

    set_config("columns", json.dumps(req.columns, ensure_ascii=False))
    set_config("turma", req.turma)
    return {"ok": True, "count": inserted}


@app.delete("/api/grades", dependencies=[Depends(verify_admin)])
def clear_grades():
    conn = get_db()
    try:
        conn.execute("DELETE FROM grades")
        conn.commit()
    finally:
        conn.close()
    set_config("columns", "[]")
    set_config("turma", "")
    return {"ok": True}


@app.post("/api/student/login")
def student_login(req: StudentLoginRequest):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM grades WHERE matricula=?", (req.matricula.strip(),)
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(404, "Matrícula não encontrada. Confira o número.")

    input_first = normalize(req.nome.split()[0]) if req.nome.strip() else ""
    stored_first = normalize((row["nome"] or "").split()[0]) if row["nome"] else ""

    if len(input_first) >= 2 and len(stored_first) >= 2:
        if not stored_first.startswith(input_first) and not input_first.startswith(stored_first):
            raise HTTPException(401, "Nome não confere com a matrícula informada.")

    grade_data = json.loads(row["data"])
    columns = json.loads(get_config("columns", "[]"))

    return {
        "nome": row["nome"],
        "matricula": row["matricula"],
        "grades": grade_data,
        "columns": columns,
        "turma": get_config("turma", ""),
    }


# ── Servir frontend em produção ───────────────────────────────────────────────
DIST = Path("frontend/dist")
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        return FileResponse(str(DIST / "index.html"))
