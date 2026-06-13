"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import TabBar from "@/components/TabBar";
import DbStatus from "@/components/DbStatus";
import { subscribeComments, addComment, deleteComment, getCurrentUser, type Comment } from "@/lib/db";

export default function CommunityPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<ReturnType<typeof getCurrentUser>>(null);
  const [content, setContent] = useState("");
  const [type, setType] = useState<"comment"|"request">("comment");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{kind:"success"|"error";msg:string}|null>(null);

  useEffect(() => {
    setMe(getCurrentUser());
    setLoading(true);
    const unsub = subscribeComments((latestComments) => {
      setComments(latestComments);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    try {
      await deleteComment(commentId);
    } catch {
      alert("Failed to delete comment.");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !me) return;
    setSubmitting(true); setResult(null);
    try {
      await addComment({ userId: me.id, username: me.username, displayName: me.displayName || me.username, type, content: content.trim() });
      setContent(""); setResult({kind:"success", msg:"Posted!"});
    } catch { setResult({kind:"error", msg:"Failed to post."}); }
    setSubmitting(false);
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff/60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m/60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h/24)}d ago`;
  };

  return (
    <div className="app-shell">
      <header className="nav">
        <span className="nav-logo">💬 Community</span>
        <div className="nav-actions">
          <DbStatus />
        </div>
      </header>
      <main className="page fade-up">
        {me ? (
          <div className="card" style={{marginBottom:20}}>
            <div className="tab-pills" style={{marginBottom:12}}>
              <button className={`tab-pill${type==="comment"?" active":""}`} onClick={()=>setType("comment")}>💬 Comment</button>
              <button className={`tab-pill${type==="request"?" active":""}`} onClick={()=>setType("request")}>📌 Request a Book</button>
            </div>
            <form onSubmit={submit}>
              <div className="form-group">
                <textarea className="form-input"
                  placeholder={type==="request"?"Name a book you'd like to see in the library…":"Share a thought or recommendation…"}
                  value={content} onChange={e=>setContent(e.target.value)} />
              </div>
              {result && <div className={`alert alert-${result.kind==="success"?"success":"error"}`}>{result.msg}</div>}
              <button className="btn btn-primary btn-sm" type="submit" disabled={submitting || !content.trim()}>
                {submitting ? "Posting…" : "Post"}
              </button>
            </form>
          </div>
        ) : (
          <div className="alert alert-info" style={{marginBottom:20}}>
            👤 <Link href="/auth" style={{color:"var(--accent2)"}}>Sign in</Link> to leave a comment or request a book.
          </div>
        )}

        <p className="section-title">Community Board</p>

        {loading ? <div className="spinner" /> : comments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <h3>No posts yet</h3>
            <p>Be the first to leave a comment!</p>
          </div>
        ) : comments.map(c => {
          const displaySender = c.displayName || c.username;
          return (
            <div key={c.id} className="card comment-card">
              <div className="comment-header">
                <div className="comment-avatar">{displaySender[0].toUpperCase()}</div>
                <span className="comment-user">{displaySender}</span>
                <span className={`comment-type ${c.type}`}>{c.type === "request" ? "📌 Request" : "💬 Comment"}</span>
                <span className="comment-time">{timeAgo(c.createdAt)}</span>
                {me?.role === "admin" && (
                  <button 
                    className="btn btn-danger btn-sm" 
                    style={{ marginLeft: "auto", padding: "4px 8px", fontSize: "0.75rem", borderRadius: "4px" }}
                    onClick={() => handleDeleteComment(c.id)}
                  >
                    🗑
                  </button>
                )}
              </div>
              <div className="comment-content">{c.content}</div>
            </div>
          );
        })}
      </main>
      <TabBar />
    </div>
  );
}
