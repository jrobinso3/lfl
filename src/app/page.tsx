"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import TabBar from "@/components/TabBar";
import DbStatus from "@/components/DbStatus";
import { subscribeBooks, type Book } from "@/lib/db";

export default function HomePage() {
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeBooks((latestBooks) => {
      setAllBooks(latestBooks);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const lower = query.toLowerCase();
    setBooks(query ? allBooks.filter(b =>
      b.title.toLowerCase().includes(lower) ||
      b.author.toLowerCase().includes(lower) ||
      b.isbn.includes(lower)
    ) : allBooks);
  }, [query, allBooks]);

  return (
    <div className="app-shell">
      <header className="nav">
        <span className="nav-logo">📚 ReposiStory LFL</span>
        <div className="nav-actions">
          <DbStatus />
          <Link href="/admin" className="nav-btn">Admin</Link>
        </div>
      </header>

      <main className="page fade-up">
        {/* Hero */}
        <div className="hero">
          <img
            src="https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=600&q=80"
            alt="Little Free Library"
            className="hero-img"
          />
          <div className="hero-overlay">
            <h1 className="hero-title">Robinson ReposiStory</h1>
            <p className="hero-subtitle">Little Free Library · LFL #224710</p>
          </div>
        </div>

        {/* Welcome */}
        <div className="card" style={{marginBottom: 20}}>
          <p style={{fontSize:"0.9rem", color:"var(--text-muted)", lineHeight:1.7}}>
            👋 Welcome! Take a book, leave a book — it&apos;s that simple.
            Browse our current collection below, or scan a barcode to donate or borrow a book.
          </p>
        </div>

        {/* Actions */}
        <div className="action-grid">
          <Link href="/leave" className="action-btn leave">
            <span className="icon">📥</span>
            Leave a Book
          </Link>
          <Link href="/take" className="action-btn take">
            <span className="icon">📤</span>
            Take a Book
          </Link>
        </div>

        {/* Search */}
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            type="text"
            placeholder="Search by title, author, or ISBN…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {/* Book List */}
        <p className="section-title">
          {query ? `Results for "${query}"` : "Current Collection"}
        </p>

        {loading ? (
          <div className="spinner" />
        ) : books.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>No books found</h3>
            <p>Try a different search or donate a book!</p>
          </div>
        ) : (
          books.map(book => (
            <div key={book.id} className="card">
              <div className="book-card">
                <img
                  src={book.coverUrl || `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg`}
                  alt={book.title}
                  className="book-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/60x88/1f2937/94a3b8?text=📖"; }}
                />
                <div className="book-info">
                  <div className="book-title">{book.title}</div>
                  <div className="book-author">{book.author}</div>
                  <div className="book-isbn">ISBN: {book.isbn}</div>
                  <span className={`book-status ${book.status}`}>
                    {book.status === "available" ? "✓ Available" : "✗ Borrowed"}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </main>

      <TabBar />
    </div>
  );
}
