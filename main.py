import csv
import json
import logging
import os
import time
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

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
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

NOTAS_DIR = Path("notas")
MANIFEST_PATH = NOTAS_DIR / "notas.json"

# Colunas de controle interno da planilha que nunca viram nota exibida
CONTROL_COLUMNS = {"status", "ag", "dragstatus", "obs", "observacao"}

# ── Cloudflare R2 (fonte das notas em produção) ───────────────────────────────
# Se as 4 variáveis estiverem definidas, os CSVs são baixados do bucket para o
# cache local (pasta notas/) a cada R2_SYNC_INTERVAL segundos. Sem elas, o
# portal usa a pasta notas/ local diretamente (modo desenvolvimento).
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "")
R2_PREFIX = os.environ.get("R2_PREFIX", "").strip("/")
R2_SYNC_INTERVAL = int(os.environ.get("R2_SYNC_INTERVAL", "60"))
R2_ENABLED = all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET])

_r2_last_sync = 0.0
_r2_sync_error: Optional[str] = None


def _r2_client():
    import boto3  # import preguiçoso: modo local não exige boto3 instalado

    return boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )


def sync_from_r2(force: bool = False) -> None:
    """Baixa notas.json e *.csv do bucket para o cache local, se mudaram."""
    global _r2_last_sync, _r2_sync_error
    if not R2_ENABLED:
        return
    now = time.time()
    if not force and now - _r2_last_sync < R2_SYNC_INTERVAL:
        return
    _r2_last_sync = now
    try:
        s3 = _r2_client()
        NOTAS_DIR.mkdir(parents=True, exist_ok=True)
        prefix = f"{R2_PREFIX}/" if R2_PREFIX else ""
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=R2_BUCKET, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                name = key[len(prefix):]
                if not name or "/" in name:
                    continue  # apenas arquivos na raiz do prefixo
                if name != "notas.json" and not name.lower().endswith(".csv"):
                    continue
                body = s3.get_object(Bucket=R2_BUCKET, Key=key)["Body"].read()
                local = NOTAS_DIR / name
                if local.exists() and local.read_bytes() == body:
                    continue  # sem mudança — não toca no mtime
                local.write_bytes(body)
                logger.info(f"R2 → local: {name} ({len(body)} bytes)")
        _r2_sync_error = None
    except Exception as e:
        _r2_sync_error = f"{type(e).__name__}: {e}"
        logger.error(f"Falha ao sincronizar com o R2: {_r2_sync_error}")


# ── Handler global de erros ───────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Erro não tratado em {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Erro interno do servidor. Tente novamente mais tarde."},
    )


# ── Utils ─────────────────────────────────────────────────────────────────────
def normalize(s: str) -> str:
    return (
        unicodedata.normalize("NFD", s or "")
        .encode("ascii", "ignore")
        .decode()
        .lower()
        .strip()
    )


def detect_delimiter(sample: str) -> str:
    first_line = sample.splitlines()[0] if sample.splitlines() else ""
    return ";" if first_line.count(";") >= first_line.count(",") else ","


# Erros de fórmula do Excel que não devem aparecer para o aluno
EXCEL_ERRORS = ("#NUM!", "#NÚM!", "#DIV/0!", "#VALUE!", "#VALOR!", "#REF!",
                "#NAME?", "#NOME?", "#N/A", "#NULL!")


def clean_grade(value: Any) -> str:
    v = (value or "").strip() if isinstance(value, str) else ("" if value is None else str(value).strip())
    return "" if v.upper() in EXCEL_ERRORS else v


# ── Carregamento das notas (memória, com recarga automática) ──────────────────
class GradeStore:
    """Lê notas/notas.json + CSVs e mantém índice matrícula → disciplinas.

    Recarrega automaticamente quando algum arquivo muda em disco — basta
    salvar o CSV que a próxima consulta já vê os dados novos.
    """

    def __init__(self) -> None:
        self.disciplinas: List[Dict[str, Any]] = []
        self.index: Dict[str, List[Dict[str, Any]]] = {}
        self._mtimes: Dict[str, float] = {}
        self.error: Optional[str] = None

    def _current_mtimes(self) -> Dict[str, float]:
        files = [MANIFEST_PATH] + list(NOTAS_DIR.glob("*.csv"))
        return {str(f): f.stat().st_mtime for f in files if f.exists()}

    def ensure_fresh(self) -> None:
        sync_from_r2()  # no-op no modo local; respeita o TTL no modo R2
        mtimes = self._current_mtimes()
        if mtimes != self._mtimes:
            self.reload(mtimes)

    def reload(self, mtimes: Optional[Dict[str, float]] = None) -> None:
        self.disciplinas = []
        self.index = {}
        self.error = None
        try:
            manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
            for entry in manifest:
                self._load_disciplina(entry)
        except FileNotFoundError:
            self.error = f"Pasta '{NOTAS_DIR}' ou arquivo notas.json não encontrado."
            logger.warning(self.error)
        except Exception as e:
            self.error = f"Erro ao carregar notas: {e}"
            logger.error(self.error, exc_info=True)
        self._mtimes = mtimes if mtimes is not None else self._current_mtimes()
        total = sum(len(d["alunos"]) for d in self.disciplinas)
        logger.info(
            f"Notas carregadas: {len(self.disciplinas)} disciplinas, "
            f"{total} matrículas, {len(self.index)} alunos únicos"
        )

    def _load_disciplina(self, entry: Dict[str, Any]) -> None:
        arquivo = entry.get("arquivo", "")
        path = NOTAS_DIR / arquivo
        if not path.exists():
            logger.warning(f"Arquivo não encontrado, ignorado: {path}")
            return

        text = path.read_text(encoding="utf-8-sig")
        delimiter = detect_delimiter(text)
        reader = csv.DictReader(text.splitlines(), delimiter=delimiter)
        headers = reader.fieldnames or []

        matricula_col = next(
            (h for h in headers if normalize(h) in ("matricula", "ra")), None
        )
        nome_col = next(
            (h for h in headers if normalize(h) in ("nome", "aluno")), None
        )
        if not matricula_col:
            logger.warning(f"{arquivo}: coluna de matrícula não encontrada, ignorado")
            return

        # Colunas de nota: se o manifesto define "variaveis", usa exatamente
        # essa lista (na ordem dada); senão, infere do CSV.
        id_cols = {"matricula", "ra", "nome", "aluno"}
        variaveis = entry.get("variaveis", "")
        if variaveis:
            grade_cols = []
            for v in variaveis.split(";"):
                v = v.strip()
                if not v or normalize(v) in id_cols or normalize(v) in CONTROL_COLUMNS:
                    continue
                match = next((h for h in headers if normalize(h) == normalize(v)), None)
                if match is None:
                    logger.warning(
                        f"{arquivo}: variável '{v}' do manifesto não existe no CSV, ignorada"
                    )
                    continue
                grade_cols.append(match)
        else:
            grade_cols = [
                h
                for h in headers
                if h not in (matricula_col, nome_col)
                and normalize(h) not in CONTROL_COLUMNS
            ]

        alunos: Dict[str, Dict[str, Any]] = {}
        for row in reader:
            matricula = (row.get(matricula_col) or "").strip()
            if not matricula:
                continue
            if matricula in alunos:
                logger.warning(f"{arquivo}: matrícula duplicada {matricula}, mantida a 1ª")
                continue
            nome = (row.get(nome_col) or "").strip() if nome_col else ""
            grades = {c: clean_grade(row.get(c)) for c in grade_cols}
            alunos[matricula] = {"nome": nome, "grades": grades}

        if variaveis:
            # Lista explícita: mostra todas as variáveis, mesmo as ainda vazias
            filled_cols = grade_cols
        else:
            # Lista inferida: esconde colunas totalmente vazias
            filled_cols = [
                c
                for c in grade_cols
                if any(a["grades"][c] for a in alunos.values())
            ] or grade_cols

        disc = {
            "id": path.stem,
            "codigo": entry.get("codigo", ""),
            "nome": entry.get("nome", path.stem),
            "turma": entry.get("turma", ""),
            "columns": filled_cols,
            "alunos": alunos,
        }
        self.disciplinas.append(disc)

        for matricula, aluno in alunos.items():
            self.index.setdefault(matricula, []).append(
                {"disciplina": disc, "aluno": aluno}
            )


store = GradeStore()
if R2_ENABLED:
    logger.info(f"Modo R2 ativo: bucket '{R2_BUCKET}' (sync a cada {R2_SYNC_INTERVAL}s)")
    sync_from_r2(force=True)
else:
    logger.info("Modo local: usando a pasta notas/ do disco")
store.reload()


# ── Models ────────────────────────────────────────────────────────────────────
class StudentLoginRequest(BaseModel):
    matricula: str
    nome: str


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/api/status")
def status():
    store.ensure_fresh()
    return {
        "ok": store.error is None
        and (not R2_ENABLED or _r2_sync_error is None or bool(store.disciplinas)),
        "error": store.error,
        "fonte": "r2" if R2_ENABLED else "local",
        "r2_sync_ok": (_r2_sync_error is None) if R2_ENABLED else None,
        "disciplinas": [
            {
                "id": d["id"],
                "codigo": d["codigo"],
                "nome": d["nome"],
                "turma": d["turma"],
                "alunos": len(d["alunos"]),
            }
            for d in store.disciplinas
        ],
        "total_alunos": len(store.index),
    }


@app.post("/api/student/login")
def student_login(req: StudentLoginRequest):
    store.ensure_fresh()
    matricula = req.matricula.strip()
    entries = store.index.get(matricula, [])

    if not entries:
        raise HTTPException(404, "Matrícula não encontrada. Confira o número.")

    input_first = normalize(req.nome.split()[0]) if req.nome.strip() else ""

    def nome_confere(stored_nome: str) -> bool:
        stored_first = normalize(stored_nome.split()[0]) if stored_nome else ""
        if len(input_first) < 2 or len(stored_first) < 2:
            return True  # nomes muito curtos não bloqueiam (mesmo critério de antes)
        return stored_first.startswith(input_first) or input_first.startswith(stored_first)

    match = next((e for e in entries if nome_confere(e["aluno"]["nome"])), None)
    if not match:
        raise HTTPException(401, "Nome não confere com a matrícula informada.")

    return {
        "nome": match["aluno"]["nome"],
        "matricula": matricula,
        "disciplinas": [
            {
                "id": e["disciplina"]["id"],
                "codigo": e["disciplina"]["codigo"],
                "nome": e["disciplina"]["nome"],
                "turma": e["disciplina"]["turma"],
                "columns": e["disciplina"]["columns"],
                "grades": e["aluno"]["grades"],
            }
            for e in entries
        ],
    }


# ── Servir frontend em produção ───────────────────────────────────────────────
DIST = Path("frontend/dist")
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Arquivos reais do build (logo, favicon etc.) têm prioridade;
        # o resto cai no index.html do SPA
        candidate = DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(DIST / "index.html"))
