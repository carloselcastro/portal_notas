import { useState, useEffect } from "react";
import Papa from "papaparse";

// ─── Config ──────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || "";

async function api(path, opts = {}) {
  const token = localStorage.getItem("admin_token");
  const res = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Erro desconhecido" }));
    throw new Error(err.detail || "Erro na requisição");
  }
  return res.json();
}

// ─── Utils ───────────────────────────────────────────────────────────────────
function normalize(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function gradeStyle(val) {
  const n = parseFloat(String(val).replace(",", "."));
  if (isNaN(n) || val === "" || val === null || val === undefined) return null;
  if (n >= 7) return { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" };
  if (n >= 5) return { color: "#d97706", bg: "#fffbeb", border: "#fde68a" };
  return { color: "#dc2626", bg: "#fef2f2", border: "#fecaca" };
}

// ─── Components ──────────────────────────────────────────────────────────────
function GradeCard({ label, value }) {
  const isEmpty =
    value === "" || value === null || value === undefined || String(value).trim() === "";
  const style = gradeStyle(value);
  return (
    <div
      style={{
        borderRadius: 14,
        padding: "14px 10px",
        textAlign: "center",
        background: isEmpty ? "#f8fafc" : style.bg,
        border: `1.5px solid ${isEmpty ? "#e2e8f0" : style.border}`,
        transition: "all 0.2s",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: "#94a3b8",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: isEmpty ? 20 : 26,
          fontWeight: 800,
          color: isEmpty ? "#cbd5e1" : style.color,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {isEmpty ? "—" : value}
      </div>
    </div>
  );
}

function Inp({ label, ...props }) {
  return (
    <div>
      {label && (
        <label
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#334155",
            display: "block",
            marginBottom: 6,
          }}
        >
          {label}
        </label>
      )}
      <input
        {...props}
        style={{
          width: "100%",
          border: "1.5px solid #e2e8f0",
          borderRadius: 10,
          padding: "11px 14px",
          fontSize: 14,
          color: "#1e293b",
          outline: "none",
          boxSizing: "border-box",
          background: "#fff",
          ...(props.style || {}),
        }}
        onFocus={(e) => (e.target.style.borderColor = "#002855")}
        onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
      />
    </div>
  );
}

function Btn({ children, variant = "primary", loading, ...props }) {
  const styles = {
    primary: { background: "#002855", color: "#fff" },
    secondary: { background: "#f1f5f9", color: "#475569" },
    danger: { background: "#fef2f2", color: "#dc2626", border: "1.5px solid #fecaca" },
  };
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      style={{
        width: "100%",
        padding: "13px 18px",
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 700,
        border: "none",
        cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.7 : 1,
        transition: "opacity 0.15s",
        ...styles[variant],
        ...(props.style || {}),
      }}
    >
      {loading ? "Aguarde…" : children}
    </button>
  );
}

function Card({ children, style }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 20,
        boxShadow: "0 4px 32px rgba(0,0,0,0.10)",
        padding: "32px 28px",
        width: "100%",
        maxWidth: 400,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Alert({ type, children }) {
  const s = {
    error: { background: "#fef2f2", color: "#dc2626", border: "1.5px solid #fecaca" },
    success: { background: "#f0fdf4", color: "#16a34a", border: "1.5px solid #bbf7d0" },
  };
  return (
    <div
      style={{ borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 500, ...s[type] }}
    >
      {children}
    </div>
  );
}

function BackBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "#94a3b8",
        fontSize: 13,
        fontWeight: 600,
        padding: 0,
        marginBottom: 20,
      }}
    >
      ← Voltar
    </button>
  );
}

function PageBG({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f172a 0%, #002855 60%, #1e3a5f 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      {children}
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("home");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isFirstSetup, setIsFirstSetup] = useState(false);
  const [studentCount, setStudentCount] = useState(0);
  const [gradeColumns, setGradeColumns] = useState([]);
  const [turma, setTurma] = useState("");

  // forms
  const [adminPwd, setAdminPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [matriculaInput, setMatriculaInput] = useState("");
  const [nomeInput, setNomeInput] = useState("");
  const [csvText, setCsvText] = useState("");
  const [delimiter, setDelimiter] = useState("auto");
  const [turmaInput, setTurmaInput] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [studentData, setStudentData] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    api("/api/status")
      .then((s) => {
        setIsFirstSetup(!s.setup_done);
        setStudentCount(s.student_count);
        setGradeColumns(s.columns || []);
        setTurma(s.turma || "");
      })
      .catch(() => setIsFirstSetup(true))
      .finally(() => setLoading(false));
  }, []);

  // ── Admin ──────────────────────────────────────────────────────────────────
  async function handleAdminSetup() {
    if (!newPwd || newPwd.length < 6) return setError("Senha deve ter ao menos 6 caracteres");
    if (newPwd !== confirmPwd) return setError("Senhas não coincidem");
    setBusy(true);
    try {
      const { token } = await api("/api/setup", {
        method: "POST",
        body: JSON.stringify({ password: newPwd }),
      });
      localStorage.setItem("admin_token", token);
      setIsFirstSetup(false);
      setError("");
      setScreen("admin-panel");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAdminLogin() {
    setBusy(true);
    try {
      const { token } = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ password: adminPwd }),
      });
      localStorage.setItem("admin_token", token);
      setAdminPwd("");
      setError("");
      // Refresh counts
      const s = await api("/api/status");
      setStudentCount(s.student_count);
      setGradeColumns(s.columns || []);
      setTurma(s.turma || "");
      setTurmaInput(s.turma || "");
      setScreen("admin-panel");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function handleParseCSV() {
    if (!csvText.trim()) return setError("Cole o conteúdo da planilha acima");
    const opts = { header: true, skipEmptyLines: true };
    if (delimiter !== "auto") opts.delimiter = delimiter;
    const result = Papa.parse(csvText.trim(), opts);
    if (!result.data.length) return setError("Não consegui ler os dados. Tente outro separador.");
    setPreview(result);
    setError("");
    setSuccess("");
  }

  async function handleSaveGrades() {
    if (!preview) return;
    const headers = preview.meta.fields;
    const matriculaCol = headers.find((h) => /matr[íi]cula|^ra$|registro/i.test(h.trim()));
    const nomeCol = headers.find((h) => /^nome|^aluno/i.test(h.trim()));
    if (!matriculaCol)
      return setError(`Coluna de matrícula não encontrada. Colunas: ${headers.join(", ")}`);

    const gradesCols = headers.filter((h) => h !== matriculaCol && h !== nomeCol);
    const rows = preview.data.map((row) => ({
      matricula: String(row[matriculaCol] ?? "").trim(),
      nome: nomeCol ? String(row[nomeCol] ?? "").trim() : "",
      ...Object.fromEntries(gradesCols.map((c) => [c, String(row[c] ?? "").trim()])),
    }));

    setBusy(true);
    try {
      const { count } = await api("/api/grades", {
        method: "POST",
        body: JSON.stringify({ data: rows, columns: gradesCols, turma: turmaInput || turma }),
      });
      setStudentCount(count);
      setGradeColumns(gradesCols);
      setTurma(turmaInput || turma);
      setPreview(null);
      setCsvText("");
      setSuccess(`✅ ${count} alunos salvos! Colunas: ${gradesCols.join(", ")}`);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleClearData() {
    if (!window.confirm("Apagar TODOS os dados? Não pode ser desfeito.")) return;
    setBusy(true);
    try {
      await api("/api/grades", { method: "DELETE" });
      setStudentCount(0);
      setGradeColumns([]);
      setTurma("");
      setSuccess("Dados apagados.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ── Student ────────────────────────────────────────────────────────────────
  async function handleStudentLogin() {
    setError("");
    if (!matriculaInput.trim()) return setError("Informe sua matrícula");
    if (!nomeInput.trim()) return setError("Informe seu primeiro nome");
    setBusy(true);
    try {
      const data = await api("/api/student/login", {
        method: "POST",
        body: JSON.stringify({ matricula: matriculaInput.trim(), nome: nomeInput.trim() }),
      });
      setStudentData(data);
      setScreen("student-view");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading)
    return (
      <PageBG>
        <p style={{ color: "rgba(255,255,255,0.5)", fontFamily: "system-ui" }}>Carregando…</p>
      </PageBG>
    );

  // HOME
  if (screen === "home")
    return (
      <PageBG>
        <Card>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div
              style={{
                width: 64,
                height: 64,
                background: "linear-gradient(135deg,#002855,#1e4d8c)",
                borderRadius: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                margin: "0 auto 16px",
                boxShadow: "0 8px 24px rgba(0,40,85,0.25)",
              }}
            >
              📋
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>
              Portal de Notas
            </h1>
            {turma && (
              <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0", fontWeight: 500 }}>
                {turma}
              </p>
            )}
            <p style={{ fontSize: 13, color: "#94a3b8", margin: "4px 0 0" }}>
              Consulta individual e sigilosa
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Btn onClick={() => { setScreen("student-login"); setError(""); }}>
              🎓 Consultar minhas notas
            </Btn>
            <Btn
              variant="secondary"
              onClick={() => { setScreen(isFirstSetup ? "admin-setup" : "admin-login"); setError(""); }}
              style={{ fontSize: 13 }}
            >
              ⚙️ Área do professor
            </Btn>
          </div>
          <p style={{ fontSize: 11, color: "#cbd5e1", textAlign: "center", marginTop: 20, marginBottom: 0 }}>
            🔒 Dados protegidos conforme a LGPD
          </p>
        </Card>
      </PageBG>
    );

  // ADMIN SETUP
  if (screen === "admin-setup")
    return (
      <PageBG>
        <Card>
          <BackBtn onClick={() => setScreen("home")} />
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>
            Configuração inicial
          </h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px" }}>
            Crie uma senha para a área do professor
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Inp label="Nova senha" type="password" value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)} placeholder="Mínimo 6 caracteres" />
            <Inp label="Confirmar senha" type="password" value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdminSetup()}
              placeholder="Repita a senha" />
            {error && <Alert type="error">{error}</Alert>}
            <Btn onClick={handleAdminSetup} loading={busy}>
              Criar senha e continuar →
            </Btn>
          </div>
        </Card>
      </PageBG>
    );

  // ADMIN LOGIN
  if (screen === "admin-login")
    return (
      <PageBG>
        <Card>
          <BackBtn onClick={() => setScreen("home")} />
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>
            Área do Professor
          </h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 24px" }}>
            Digite sua senha para continuar
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Inp type="password" value={adminPwd}
              onChange={(e) => setAdminPwd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
              placeholder="Senha do professor" />
            {error && <Alert type="error">{error}</Alert>}
            <Btn onClick={handleAdminLogin} loading={busy}>Entrar →</Btn>
          </div>
        </Card>
      </PageBG>
    );

  // ADMIN PANEL
  if (screen === "admin-panel")
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#f8fafc",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          padding: "24px 16px",
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 24,
            }}
          >
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0 }}>
                Painel do Professor
              </h2>
              <p style={{ fontSize: 13, color: "#64748b", margin: "2px 0 0" }}>
                Gerencie as notas dos alunos
              </p>
            </div>
            <button
              onClick={() => setScreen("home")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 13, fontWeight: 600 }}
            >
              Sair
            </button>
          </div>

          {/* Stats */}
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              border: "1.5px solid #e2e8f0",
              padding: "18px 20px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                width: 48, height: 48, background: "#f0f4ff",
                borderRadius: 14, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 22,
              }}
            >
              👥
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#002855", lineHeight: 1 }}>
                {studentCount}
              </div>
              <div style={{ fontSize: 13, color: "#64748b" }}>alunos cadastrados</div>
            </div>
            {gradeColumns.length > 0 && (
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>
                  Colunas
                </div>
                <div style={{ fontSize: 12, color: "#475569" }}>{gradeColumns.join(" · ")}</div>
              </div>
            )}
          </div>

          {success && <div style={{ marginBottom: 16 }}><Alert type="success">{success}</Alert></div>}

          {/* CSV upload */}
          <div
            style={{
              background: "#fff", borderRadius: 16,
              border: "1.5px solid #e2e8f0", padding: 20, marginBottom: 16,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" }}>
              📤 Carregar planilha (CSV)
            </h3>
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px", lineHeight: 1.6 }}>
              No Excel: <strong>Arquivo → Salvar Como → CSV UTF-8</strong>.<br />
              A coluna de matrícula deve se chamar{" "}
              <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>Matrícula</code> ou{" "}
              <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>RA</code>,
              e a de nome <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>Nome</code>.
            </p>

            <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "center" }}>
              <label style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>Separador:</label>
              <select
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
                style={{ fontSize: 13, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "4px 8px" }}
              >
                <option value="auto">Auto-detectar</option>
                <option value=";">Ponto e vírgula ( ; )</option>
                <option value=",">Vírgula ( , )</option>
                <option value="	">Tab</option>
              </select>
            </div>

            <div style={{ marginBottom: 10 }}>
              <Inp
                label="Nome da turma / disciplina (opcional)"
                value={turmaInput}
                onChange={(e) => setTurmaInput(e.target.value)}
                placeholder="Ex: Cálculo I — 2025.1"
              />
            </div>

            <textarea
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setPreview(null); setSuccess(""); }}
              style={{
                width: "100%", border: "1.5px solid #e2e8f0", borderRadius: 10,
                padding: "10px 12px", fontSize: 12, fontFamily: "monospace",
                height: 110, resize: "vertical", boxSizing: "border-box", marginBottom: 10,
              }}
              placeholder={"Nome;Matrícula;AC1;AC2;AC3;AC4;AP1;AP2;AS\nJoão Silva;20231001;8.5;7.0;;\n..."}
            />

            {error && <div style={{ marginBottom: 10 }}><Alert type="error">{error}</Alert></div>}

            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="secondary" onClick={handleParseCSV} style={{ fontSize: 13 }}>
                🔍 Verificar dados
              </Btn>
              {preview && (
                <Btn onClick={handleSaveGrades} loading={busy} style={{ fontSize: 13 }}>
                  ✅ Salvar {preview.data.length} alunos
                </Btn>
              )}
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div
              style={{
                background: "#fff", borderRadius: 16,
                border: "1.5px solid #e2e8f0", padding: 20, marginBottom: 16,
              }}
            >
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 12px" }}>
                Prévia — {preview.data.length} alunos
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ fontSize: 12, width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {preview.meta.fields.map((f) => (
                        <th
                          key={f}
                          style={{
                            textAlign: "left", padding: "6px 10px", color: "#64748b",
                            fontWeight: 700, borderBottom: "1.5px solid #f1f5f9",
                            whiteSpace: "nowrap", textTransform: "uppercase", fontSize: 11,
                          }}
                        >
                          {f}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.slice(0, 6).map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f8fafc" }}>
                        {preview.meta.fields.map((f) => (
                          <td key={f} style={{ padding: "6px 10px", color: "#334155", whiteSpace: "nowrap" }}>
                            {row[f] || <span style={{ color: "#cbd5e1" }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.data.length > 6 && (
                  <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", marginTop: 8 }}>
                    … e mais {preview.data.length - 6} alunos
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Danger zone */}
          {studentCount > 0 && (
            <div style={{ border: "1.5px solid #fecaca", borderRadius: 16, padding: "16px 20px" }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", margin: "0 0 10px" }}>
                ⚠️ Zona de perigo
              </h3>
              <Btn variant="danger" onClick={handleClearData} loading={busy} style={{ fontSize: 13 }}>
                🗑️ Apagar todos os dados de notas
              </Btn>
            </div>
          )}
        </div>
      </div>
    );

  // STUDENT LOGIN
  if (screen === "student-login")
    return (
      <PageBG>
        <Card>
          <BackBtn onClick={() => { setScreen("home"); setError(""); }} />
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🎓</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 }}>
              Consultar minhas notas
            </h2>
            {turma && (
              <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>{turma}</p>
            )}
            <p style={{ fontSize: 13, color: "#94a3b8", margin: "6px 0 0" }}>
              Informe sua matrícula e primeiro nome
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Inp
              label="Matrícula"
              value={matriculaInput}
              onChange={(e) => setMatriculaInput(e.target.value)}
              placeholder="Ex: 20231001"
            />
            <Inp
              label="Primeiro nome (verificação)"
              value={nomeInput}
              onChange={(e) => setNomeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStudentLogin()}
              placeholder="Ex: João"
            />
            {error && <Alert type="error">{error}</Alert>}
            <Btn onClick={handleStudentLogin} loading={busy}>
              Ver minhas notas →
            </Btn>
          </div>
          <div
            style={{
              background: "#f8fafc", borderRadius: 10, padding: "10px 14px",
              marginTop: 16, fontSize: 12, color: "#64748b", lineHeight: 1.5,
            }}
          >
            🔒 Cada aluno acessa apenas as suas próprias notas.
          </div>
        </Card>
      </PageBG>
    );

  // STUDENT VIEW
  if (screen === "student-view" && studentData) {
    const { nome, matricula, grades, columns: cols, turma: t } = studentData;
    const gradeEntries = (cols || []).map((c) => [c, grades[c]]);
    const filled = gradeEntries.filter(
      ([, v]) => v !== "" && v !== null && v !== undefined && String(v).trim() !== ""
    ).length;

    return (
      <PageBG>
        <Card style={{ maxWidth: 460 }}>
          <div
            style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "flex-start", marginBottom: 24,
            }}
          >
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 }}>
                {nome || "Aluno"}
              </h2>
              {t && <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0", fontWeight: 500 }}>{t}</p>}
              <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>Matrícula: {matricula}</p>
            </div>
            <button
              onClick={() => {
                setScreen("home");
                setStudentData(null);
                setMatriculaInput("");
                setNomeInput("");
              }}
              style={{
                background: "none", border: "1.5px solid #e2e8f0", borderRadius: 8,
                padding: "5px 12px", fontSize: 12, color: "#64748b", cursor: "pointer", fontWeight: 600,
              }}
            >
              Sair
            </button>
          </div>

          {/* Progress */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "flex", justifyContent: "space-between",
                fontSize: 12, color: "#94a3b8", marginBottom: 6,
              }}
            >
              <span>Notas lançadas</span>
              <span>{filled} / {gradeEntries.length}</span>
            </div>
            <div style={{ background: "#f1f5f9", borderRadius: 99, height: 6, overflow: "hidden" }}>
              <div
                style={{
                  width: `${gradeEntries.length ? (filled / gradeEntries.length) * 100 : 0}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #002855, #1e4d8c)",
                  borderRadius: 99,
                }}
              />
            </div>
          </div>

          {/* Grades grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(gradeEntries.length, 4)}, 1fr)`,
              gap: 10,
              marginBottom: 20,
            }}
          >
            {gradeEntries.map(([label, value]) => (
              <GradeCard key={label} label={label} value={value} />
            ))}
          </div>

          {/* Legend */}
          <div
            style={{
              display: "flex", gap: 16, fontSize: 11, color: "#94a3b8",
              paddingTop: 14, borderTop: "1px solid #f1f5f9",
            }}
          >
            {[
              { color: "#16a34a", label: "≥ 7,0" },
              { color: "#d97706", label: "≥ 5,0" },
              { color: "#dc2626", label: "< 5,0" },
              { color: "#cbd5e1", label: "Pendente" },
            ].map(({ color, label }) => (
              <span key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: color, display: "inline-block",
                  }}
                />
                {label}
              </span>
            ))}
          </div>
        </Card>
      </PageBG>
    );
  }

  return null;
}
