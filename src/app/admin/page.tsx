"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import TabBar from "@/components/TabBar";
import DbStatus from "@/components/DbStatus";
import { saveFirebaseConfig, clearFirebaseConfig } from "@/lib/firebase";
import { getBooks, getComments, updateBook, deleteBook, deleteComment, getCurrentUser, type Book, type Comment } from "@/lib/db";

export default function AdminPage() {
  const [me, setMe] = useState<ReturnType<typeof getCurrentUser>|undefined>(undefined);
  const [books, setBooks] = useState<Book[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activeTab, setActiveTab] = useState<"books"|"comments"|"settings">("books");
  const [loading, setLoading] = useState(true);
  const [firebaseConfig, setFirebaseConfig] = useState({
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  });

  const load = useCallback(async () => {
    setLoading(true);
    const user = getCurrentUser();
    setMe(user);
    const [b, c] = await Promise.all([getBooks(), getComments()]);
    setBooks(b);
    setComments(c);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("lfl-firebase-config");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setFirebaseConfig({
            apiKey: parsed.apiKey ?? "",
            authDomain: parsed.authDomain ?? "",
            projectId: parsed.projectId ?? "",
            storageBucket: parsed.storageBucket ?? "",
            messagingSenderId: parsed.messagingSenderId ?? "",
            appId: parsed.appId ?? ""
          });
        } catch {}
      }
    }
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
      alert("API Key and Project ID are required!");
      return;
    }
    saveFirebaseConfig(firebaseConfig);
    alert("Firebase settings saved! The application will now sync cloud data.");
    window.location.reload();
  };

  const handleClearSettings = () => {
    if (!confirm("Are you sure you want to disconnect Firebase? Data will fall back to local device memory.")) return;
    clearFirebaseConfig();
    setFirebaseConfig({
      apiKey: "",
      authDomain: "",
      projectId: "",
      storageBucket: "",
      messagingSenderId: "",
      appId: ""
    });
    alert("Firebase settings cleared.");
    window.location.reload();
  };

  const returnBook = async (bookId: string) => {
    await updateBook(bookId, { status: "available", borrowedBy: null, borrowedAt: null });
    load();
  };

  const removeBook = async (bookId: string) => {
    if (!confirm("Remove this book from the library?")) return;
    await deleteBook(bookId);
    load();
  };

  const removeComment = async (commentId: string) => {
    if (!confirm("Delete this post?")) return;
    await deleteComment(commentId);
    load();
  };

  if (me === undefined) return <div className="app-shell"><div className="spinner" /></div>;

  if (!me || me.role !== "admin") return (
    <div className="app-shell">
      <header className="nav">
        <span className="nav-logo">🔒 Admin</span>
        <div className="nav-actions">
          <DbStatus />
        </div>
      </header>
      <main className="page">
        <div className="alert alert-error">Admin access required. <Link href="/auth" style={{color:"var(--accent2)"}}>Sign in</Link> as admin.</div>
      </main>
      <TabBar />
    </div>
  );

  const available = books.filter(b => b.status === "available").length;
  const borrowed = books.filter(b => b.status === "borrowed").length;

  return (
    <div className="app-shell">
      <header className="nav">
        <span className="nav-logo">⚙️ Admin</span>
        <div className="nav-actions">
          <DbStatus />
          <span style={{fontSize:"0.75rem", color:"var(--accent)"}}>Logged in as {me.username}</span>
        </div>
      </header>
      <main className="page fade-up">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-value">{books.length}</div><div className="stat-label">Total Books</div></div>
          <div className="stat-card"><div className="stat-value">{available}</div><div className="stat-label">Available</div></div>
          <div className="stat-card"><div className="stat-value">{borrowed}</div><div className="stat-label">Borrowed</div></div>
          <div className="stat-card"><div className="stat-value">{comments.length}</div><div className="stat-label">Posts</div></div>
        </div>

        <div className="tab-pills">
          <button className={`tab-pill${activeTab==="books"?" active":""}`} onClick={()=>setActiveTab("books")}>📚 Inventory</button>
          <button className={`tab-pill${activeTab==="comments"?" active":""}`} onClick={()=>setActiveTab("comments")}>💬 Posts</button>
          <button className={`tab-pill${activeTab==="settings"?" active":""}`} onClick={()=>setActiveTab("settings")}>⚙️ Settings</button>
        </div>

        {loading ? <div className="spinner" /> : activeTab === "books" ? (
          books.length === 0 ? <div className="empty-state"><div className="empty-icon">📭</div><h3>No books yet</h3></div> :
          books.map(book => (
            <div key={book.id} className="card">
              <div className="book-card">
                <img src={book.coverUrl} alt={book.title} className="book-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/60x88/1f2937/94a3b8?text=📖"; }}
                />
                <div className="book-info" style={{flex:1}}>
                  <div className="book-title">{book.title}</div>
                  <div className="book-author">{book.author}</div>
                  <div className="book-isbn">ISBN: {book.isbn}</div>
                  <div style={{display:"flex", gap:8, alignItems:"center", marginTop:8, flexWrap:"wrap"}}>
                    <span className={`book-status ${book.status}`}>{book.status === "available" ? "✓ Available" : `✗ Borrowed by ${book.borrowedBy}`}</span>
                    {book.status === "borrowed" && (
                      <button className="btn btn-danger btn-sm" onClick={() => returnBook(book.id)}>Mark Returned</button>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={() => removeBook(book.id)}>🗑 Remove</button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : activeTab === "comments" ? (
          comments.length === 0 ? <div className="empty-state"><div className="empty-icon">💬</div><h3>No posts yet</h3></div> :
          comments.map(c => (
            <div key={c.id} className="card comment-card">
              <div className="comment-header">
                <div className="comment-avatar">{c.username[0].toUpperCase()}</div>
                <span className="comment-user">{c.username}</span>
                <span className={`comment-type ${c.type}`}>{c.type === "request" ? "📌 Request" : "💬"}</span>
                <span className="comment-time">{new Date(c.createdAt).toLocaleDateString()}</span>
                <button className="btn btn-danger btn-sm" style={{marginLeft:"auto"}} onClick={() => removeComment(c.id)}>🗑</button>
              </div>
              <div className="comment-content">{c.content}</div>
            </div>
          ))
        ) : (
          <div className="card" style={{ padding: "20px" }}>
            <h3 style={{ marginBottom: 12, fontWeight: 700, fontSize: "1.05rem", color: "var(--accent)" }}>☁️ Firebase Firestore Configuration</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.6 }}>
              Enter your Firebase credentials below to enable multi-device real-time synchronization. If empty, the website runs in <strong>LocalStorage Fallback Mode</strong> (only saving data on the local browser).
            </p>
            <form onSubmit={handleSaveSettings}>
              <div className="form-group">
                <label className="form-label">API Key</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="AIzaSy..."
                  value={firebaseConfig.apiKey} 
                  onChange={e => setFirebaseConfig({ ...firebaseConfig, apiKey: e.target.value })} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Project ID</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="my-lfl-project"
                  value={firebaseConfig.projectId} 
                  onChange={e => setFirebaseConfig({ ...firebaseConfig, projectId: e.target.value })} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Auth Domain</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="my-lfl-project.firebaseapp.com"
                  value={firebaseConfig.authDomain} 
                  onChange={e => setFirebaseConfig({ ...firebaseConfig, authDomain: e.target.value })} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Storage Bucket</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="my-lfl-project.appspot.com"
                  value={firebaseConfig.storageBucket} 
                  onChange={e => setFirebaseConfig({ ...firebaseConfig, storageBucket: e.target.value })} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Messaging Sender ID</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="847194729"
                  value={firebaseConfig.messagingSenderId} 
                  onChange={e => setFirebaseConfig({ ...firebaseConfig, messagingSenderId: e.target.value })} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">App ID</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="1:847194729:web:abcdef"
                  value={firebaseConfig.appId} 
                  onChange={e => setFirebaseConfig({ ...firebaseConfig, appId: e.target.value })} 
                />
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Save Configuration
                </button>
                <button type="button" className="btn btn-danger" style={{ flex: 1 }} onClick={handleClearSettings}>
                  Disconnect Firebase
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
      <TabBar />
    </div>
  );
}
