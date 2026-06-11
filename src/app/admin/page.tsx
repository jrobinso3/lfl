"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import TabBar from "@/components/TabBar";
import { getBooks, getComments, updateBook, deleteBook, deleteComment, getCurrentUser, type Book, type Comment } from "@/lib/db";

export default function AdminPage() {
  const [me, setMe] = useState<ReturnType<typeof getCurrentUser>|undefined>(undefined);
  const [books, setBooks] = useState<Book[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activeTab, setActiveTab] = useState<"books"|"comments">("books");
  const [loading, setLoading] = useState(true);

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
      <header className="nav"><span className="nav-logo">🔒 Admin</span></header>
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
        <span style={{fontSize:"0.75rem", color:"var(--accent)"}}>Logged in as {me.username}</span>
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
        ) : (
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
        )}
      </main>
      <TabBar />
    </div>
  );
}
