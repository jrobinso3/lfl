"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import TabBar from "@/components/TabBar";
import DbStatus from "@/components/DbStatus";
import {
  getUsers, deleteUser, updateUser, addUser, getUserByUsername, hashPassword, getCurrentUser,
  type User, type SessionUser
} from "@/lib/db";

export default function AdminUsersPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const adminCount = users.filter(u => u.role === "admin").length;

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      console.error("Failed to load users:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    const user = getCurrentUser();
    if (user && user.role === "admin") {
      setMe(user);
      loadUsers();
    }
    setCheckingAuth(false);
  }, []);

  const handleToggleRole = async (targetUser: User) => {
    if (targetUser.id === me?.id) {
      alert("You cannot change your own role!");
      return;
    }
    if (targetUser.role === "admin" && adminCount <= 1) {
      alert("There must always be at least one administrator in the system.");
      return;
    }
    const newRole = targetUser.role === "admin" ? "user" : "admin";
    if (!confirm(`Are you sure you want to change ${targetUser.displayName}'s role to ${newRole}?`)) return;
    try {
      await updateUser(targetUser.id, { role: newRole });
      await loadUsers();
    } catch (err) {
      alert("Failed to update user role.");
    }
  };

  const handleDeleteUser = async (targetUser: User) => {
    if (targetUser.id === me?.id) {
      alert("You cannot delete your own account!");
      return;
    }
    if (targetUser.role === "admin" && adminCount <= 1) {
      alert("There must always be at least one administrator in the system.");
      return;
    }
    if (!confirm(`Are you sure you want to delete ${targetUser.displayName} (${targetUser.username})?`)) return;
    try {
      await deleteUser(targetUser.id);
      await loadUsers();
    } catch (err) {
      alert("Failed to delete user.");
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !displayName || !password || !confirmPassword) {
      setError("All fields are required.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (displayName.trim().length < 2) {
      setError("Display name too short (min 2).");
      return;
    }
    if (password.length < 6) {
      setError("Password too short (min 6).");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const existing = await getUserByUsername(email);
      if (existing) {
        setError("Email already registered.");
        setSubmitting(false);
        return;
      }
      await addUser({
        username: email.toLowerCase().trim(),
        displayName: displayName.trim(),
        passwordHash: hashPassword(password),
        role
      });
      setEmail("");
      setDisplayName("");
      setPassword("");
      setConfirmPassword("");
      setRole("user");
      setShowAddForm(false);
      await loadUsers();
    } catch (err) {
      setError("Failed to create user. Please try again.");
    }
    setSubmitting(false);
  };

  if (checkingAuth) {
    return (
      <div className="app-shell">
        <div className="spinner" />
      </div>
    );
  }

  if (!me || me.role !== "admin") {
    return (
      <div className="app-shell">
        <header className="nav">
          <span className="nav-logo">🔒 Access Denied</span>
          <div className="nav-actions">
            <DbStatus />
          </div>
        </header>
        <main className="page">
          <div className="alert alert-error">
            Admin access required. <Link href="/auth" style={{ color: "var(--accent2)", textDecoration: "underline" }}>Sign in</Link> as an administrator.
          </div>
        </main>
        <TabBar />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="nav">
        <span className="nav-logo">👥 Manage Users</span>
        <div className="nav-actions">
          <DbStatus />
          <Link href="/admin" className="nav-btn">← Back to Admin</Link>
        </div>
      </header>

      <main className="page fade-up">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <p className="section-title" style={{ margin: 0 }}>User Directory</p>
          <button 
            className="btn btn-primary btn-sm" 
            style={{ width: "auto", padding: "6px 12px" }}
            onClick={() => {
              setShowAddForm(!showAddForm);
              setError("");
            }}
          >
            {showAddForm ? "✕ Cancel" : "➕ Add User"}
          </button>
        </div>

        {/* Add User Form */}
        {showAddForm && (
          <div className="card" style={{ marginBottom: 20, border: "1px solid var(--accent)", background: "rgba(99, 102, 241, 0.02)" }}>
            <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: "1rem" }}>Create New Account</h3>
            <form onSubmit={handleAddUser}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="user@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Jane Doe"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">System Role</label>
                <select 
                  className="form-input" 
                  value={role} 
                  onChange={e => setRole(e.target.value as "user" | "admin")}
                  style={{ background: "var(--card-bg)", color: "var(--text)" }}
                >
                  <option value="user">User (Standard)</option>
                  <option value="admin">Admin (Superuser)</option>
                </select>
              </div>
              {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Creating..." : "Create Account"}
              </button>
            </form>
          </div>
        )}

        {/* User Directory List */}
        {loading ? (
          <div className="spinner" />
        ) : users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <h3>No users registered</h3>
          </div>
        ) : (
          users.map(u => (
            <div key={u.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1, marginRight: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: "0.95rem" }}>{u.displayName}</strong>
                    <span 
                      className={`book-status ${u.role === "admin" ? "borrowed" : "available"}`} 
                      style={{ fontSize: "0.7rem", padding: "2px 6px" }}
                    >
                      {u.role.toUpperCase()}
                    </span>
                    {u.id === me.id && (
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>(You)</span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
                    {u.username}
                  </div>
                </div>
                {u.id !== me.id && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button 
                      className="btn btn-secondary btn-sm"
                      style={{ width: "auto", padding: "6px 10px", fontSize: "0.75rem" }}
                      onClick={() => handleToggleRole(u)}
                      disabled={u.role === "admin" && adminCount <= 1}
                      title={u.role === "admin" && adminCount <= 1 ? "There must always be at least one admin." : ""}
                    >
                      {u.role === "admin" ? "Remove Admin" : "Make Admin"}
                    </button>
                    <button 
                      className="btn btn-danger btn-sm"
                      style={{ width: "auto", padding: "6px 10px", fontSize: "0.75rem" }}
                      onClick={() => handleDeleteUser(u)}
                      disabled={u.role === "admin" && adminCount <= 1}
                      title={u.role === "admin" && adminCount <= 1 ? "There must always be at least one admin." : ""}
                    >
                      🗑
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </main>
      <TabBar />
    </div>
  );
}
