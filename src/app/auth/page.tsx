"use client";
import { useState, useEffect } from "react";
import TabBar from "@/components/TabBar";
import DbStatus from "@/components/DbStatus";
import {
  getCurrentUser, setCurrentUser, getUserByUsername, addUser, hashPassword,
  type SessionUser
} from "@/lib/db";

export default function AuthPage() {
  const [tab, setTab] = useState<"login"|"register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<{type:"success"|"error"; msg:string}|null>(null);
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<SessionUser|null>(null);

  useEffect(() => { setMe(getCurrentUser()); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setResult(null);
    try {
      if (tab === "login") {
        const user = await getUserByUsername(username);
        if (!user) { setResult({type:"error", msg:"Invalid username or password"}); setLoading(false); return; }
        // Support both SHA-256 hash (seed admin) and djb2 hash (new registrations)
        const djb2Hash = hashPassword(password);
        // SHA-256 of "password" == ef92b778... (seed admin uses "password" as password)
        const sha256Match = user.passwordHash.length === 64 && user.passwordHash === user.passwordHash; // always re-check via stored
        const match = user.passwordHash === djb2Hash || (user.passwordHash.length === 64 && sha256Match && await verifySha256(password, user.passwordHash));
        if (!match) { setResult({type:"error", msg:"Invalid username or password"}); setLoading(false); return; }
        const session: SessionUser = { id: user.id, username: user.username, role: user.role };
        setCurrentUser(session);
        setMe(session);
        setResult({type:"success", msg:`Welcome back, ${user.username}!`});
      } else {
        if (!username || username.length < 3) { setResult({type:"error", msg:"Username too short (min 3)"}); setLoading(false); return; }
        if (!password || password.length < 6) { setResult({type:"error", msg:"Password too short (min 6)"}); setLoading(false); return; }
        const existing = await getUserByUsername(username);
        if (existing) { setResult({type:"error", msg:"Username already taken"}); setLoading(false); return; }
        const user = await addUser({ username, passwordHash: hashPassword(password), role: "user" });
        const session: SessionUser = { id: user.id, username: user.username, role: user.role };
        setCurrentUser(session);
        setMe(session);
        setResult({type:"success", msg:`Welcome, ${user.username}!`});
      }
    } catch { setResult({type:"error", msg:"An error occurred. Please try again."}); }
    setLoading(false);
  };

  const logout = () => { setCurrentUser(null); setMe(null); setResult(null); };

  return (
    <div className="app-shell">
      <header className="nav">
        <span className="nav-logo">👤 Account</span>
        <div className="nav-actions">
          <DbStatus />
        </div>
      </header>
      <main className="page fade-up">
        {me ? (
          <div>
            <div className="card" style={{textAlign:"center", padding:"32px 20px", marginBottom:20}}>
              <div style={{fontSize:"3rem", marginBottom:12}}>👋</div>
              <h2 style={{fontSize:"1.2rem", fontWeight:700, marginBottom:4}}>Hello, {me.username}!</h2>
              <p style={{fontSize:"0.85rem", color:"var(--text-muted)", marginBottom:20}}>
                Role: <strong style={{color: me.role==="admin"?"var(--accent)":"var(--accent2)"}}>{me.role}</strong>
              </p>
              <button className="btn btn-danger btn-sm" onClick={logout}>Sign Out</button>
            </div>
            <div className="card">
              <p style={{fontSize:"0.85rem", color:"var(--text-muted)"}}>
                You can now leave comments and book requests in the 💬 Community tab!
              </p>
            </div>
          </div>
        ) : (
          <div>
            <div className="tab-pills" style={{marginBottom:24}}>
              <button className={`tab-pill${tab==="login"?" active":""}`} onClick={() => setTab("login")}>Sign In</button>
              <button className={`tab-pill${tab==="register"?" active":""}`} onClick={() => setTab("register")}>Create Account</button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className="form-input" type="text" placeholder="Your username" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" type="password" placeholder="Your password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={tab==="login"?"current-password":"new-password"} />
              </div>
              {result && <div className={`alert alert-${result.type}`}>{result.msg}</div>}
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? "Please wait…" : tab === "login" ? "Sign In" : "Create Account"}
              </button>
            </form>
          </div>
        )}
      </main>
      <TabBar />
    </div>
  );
}

// SHA-256 verification using SubtleCrypto (browser native)
async function verifySha256(password: string, storedHash: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hex = hashArray.map(b => b.toString(16).padStart(2,"0")).join("");
    return hex === storedHash;
  } catch { return false; }
}
