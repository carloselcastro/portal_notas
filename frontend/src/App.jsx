import { useState, useEffect } from "react";

// ─── Config ──────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || "";

// ─── Marca Ibmec ─────────────────────────────────────────────────────────────
const IBMEC_BLUE = "#002555";
const IBMEC_BLUE_LIGHT = "#1e4d8c";
const IBMEC_YELLOW = "#F5AC00";

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Erro desconhecido" }));
    throw new Error(err.detail || "Erro na requisição");
  }
  return res.json();
}

// ─── Utils ───────────────────────────────────────────────────────────────────
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
        onFocus={(e) => (e.target.style.borderColor = IBMEC_BLUE)}
        onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
      />
    </div>
  );
}

function Btn({ children, variant = "primary", loading, ...props }) {
  const styles = {
    primary: { background: IBMEC_BLUE, color: "#fff" },
    secondary: { background: "#f1f5f9", color: "#475569" },
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
        background: `linear-gradient(135deg, #0f172a 0%, ${IBMEC_BLUE} 60%, #1e3a5f 100%)`,
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

function DisciplinaView({ disc }) {
  const gradeEntries = (disc.columns || []).map((c) => [c, disc.grades[c]]);
  const filled = gradeEntries.filter(
    ([, v]) => v !== "" && v !== null && v !== undefined && String(v).trim() !== ""
  ).length;

  return (
    <div>
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
              background: `linear-gradient(90deg, ${IBMEC_BLUE}, ${IBMEC_YELLOW})`,
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
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("home");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusInfo, setStatusInfo] = useState(null);

  // forms
  const [matriculaInput, setMatriculaInput] = useState("");
  const [nomeInput, setNomeInput] = useState("");
  const [error, setError] = useState("");
  const [studentData, setStudentData] = useState(null);
  const [activeDisc, setActiveDisc] = useState(0);

  useEffect(() => {
    api("/api/status")
      .then((s) => setStatusInfo(s))
      .catch(() => setStatusInfo({ ok: false, error: "Não foi possível conectar ao servidor." }))
      .finally(() => setLoading(false));
  }, []);

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
      setActiveDisc(0);
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

  const disciplinas = statusInfo?.disciplinas || [];

  // HOME
  if (screen === "home")
    return (
      <PageBG>
        <Card>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <img
              src="/ibmec.png"
              alt="Ibmec"
              style={{ width: 170, display: "block", margin: "0 auto 20px" }}
            />
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>
              Portal de Notas
            </h1>
            <div
              style={{
                width: 44,
                height: 4,
                borderRadius: 99,
                background: IBMEC_YELLOW,
                margin: "10px auto 12px",
              }}
            />
            <p style={{ fontSize: 13, color: "#94a3b8", margin: "4px 0 0" }}>
              Consulta individual e sigilosa
            </p>
          </div>
          {statusInfo && !statusInfo.ok && (
            <div style={{ marginBottom: 14 }}>
              <Alert type="error">{statusInfo.error}</Alert>
            </div>
          )}
          <Btn onClick={() => { setScreen("student-login"); setError(""); }}>
            🎓 Consultar minhas notas
          </Btn>
          <p style={{ fontSize: 11, color: "#cbd5e1", textAlign: "center", marginTop: 20, marginBottom: 0 }}>
            🔒 Dados protegidos conforme a LGPD
          </p>
        </Card>
      </PageBG>
    );

  // STUDENT LOGIN
  if (screen === "student-login")
    return (
      <PageBG>
        <Card>
          <BackBtn onClick={() => { setScreen("home"); setError(""); }} />
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <img
              src="/ibmec.png"
              alt="Ibmec"
              style={{ width: 110, display: "block", margin: "0 auto 14px" }}
            />
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 }}>
              Consultar minhas notas
            </h2>
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
    const { nome, matricula, disciplinas: discs } = studentData;
    const disc = discs[Math.min(activeDisc, discs.length - 1)];

    return (
      <PageBG>
        <Card style={{ maxWidth: 460 }}>
          <div
            style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "flex-start", marginBottom: 20,
            }}
          >
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 }}>
                {nome || "Aluno"}
              </h2>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "2px 0 0" }}>
                Matrícula: {matricula}
              </p>
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

          {/* Seletor de disciplinas (só aparece se houver mais de uma) */}
          {discs.length > 1 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {discs.map((d, i) => {
                const active = i === activeDisc;
                return (
                  <button
                    key={d.id}
                    onClick={() => setActiveDisc(i)}
                    style={{
                      flex: 1,
                      padding: "10px 8px",
                      borderRadius: 12,
                      border: `1.5px solid ${active ? IBMEC_YELLOW : "#e2e8f0"}`,
                      background: active ? IBMEC_BLUE : "#f8fafc",
                      color: active ? "#fff" : "#475569",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {d.codigo || d.nome}
                    {d.turma && (
                      <span
                        style={{
                          display: "block",
                          fontSize: 10,
                          fontWeight: 500,
                          opacity: 0.75,
                          marginTop: 2,
                        }}
                      >
                        {d.turma}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Cabeçalho da disciplina ativa */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: IBMEC_BLUE }}>
              {disc.codigo && `${disc.codigo} · `}
              {disc.nome}
              {disc.turma && (
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
                  {" "}— {disc.turma}
                </span>
              )}
            </div>
          </div>

          <DisciplinaView disc={disc} />
        </Card>
      </PageBG>
    );
  }

  return null;
}
