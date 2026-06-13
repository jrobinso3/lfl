"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import TabBar from "@/components/TabBar";
import DbStatus from "@/components/DbStatus";
import { subscribeBooks, deleteBook, getCurrentUser, type Book, type SessionUser } from "@/lib/db";
import heroImg from "./img/IMG_0702.jpeg";

export default function HomePage() {
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [summary, setSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [displayedSummary, setDisplayedSummary] = useState("");
  const [extraDetails, setExtraDetails] = useState<{
    publishDate?: string;
    publisher?: string;
    pages?: number;
    publishPlaces?: string;
    goodreadsId?: string;
    openLibraryUrl?: string;
  } | null>(null);

  useEffect(() => {
    setMe(getCurrentUser());
    setLoading(true);
    const unsub = subscribeBooks((latestBooks) => {
      setAllBooks(latestBooks);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleDeleteBook = async (bookId: string) => {
    if (!confirm("Are you sure you want to remove this book from the library?")) return;
    try {
      await deleteBook(bookId);
    } catch {
      alert("Failed to delete book.");
    }
  };

  useEffect(() => {
    if (!selectedBook) {
      setSummary("");
      setExtraDetails(null);
      return;
    }
    
    let isMounted = true;
    setLoadingSummary(true);
    setSummary("");
    setExtraDetails(null);
    
    const fetchSummary = async () => {
      try {
        const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${selectedBook.isbn}&format=json&jscmd=details`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const key = `ISBN:${selectedBook.isbn}`;
        const bookData = data[key];
        
        let desc = "";
        let publishDate = "";
        let publisher = "";
        let pages = 0;
        let publishPlaces = "";
        let goodreadsId = "";
        let openLibraryUrl = bookData?.info_url ?? "";
        
        if (bookData?.details) {
          const details = bookData.details;
          
          if (details.description) {
            const d = details.description;
            desc = typeof d === "string" ? d : d.value ?? "";
          }
          
          publishDate = details.publish_date ?? "";
          if (details.publishers && details.publishers.length > 0) {
            publisher = details.publishers.join(", ");
          }
          pages = details.number_of_pages ?? 0;
          if (details.publish_places && details.publish_places.length > 0) {
            publishPlaces = details.publish_places.join(", ");
          }
          if (details.identifiers?.goodreads && details.identifiers.goodreads.length > 0) {
            goodreadsId = details.identifiers.goodreads[0];
          }
        }
        
        if (isMounted) {
          if (desc) {
            setSummary(desc);
          } else {
            setSummary("No summary available for this edition in the OpenLibrary archives.");
          }
          setExtraDetails({
            publishDate,
            publisher,
            pages,
            publishPlaces,
            goodreadsId,
            openLibraryUrl
          });
        }
      } catch (err) {
        if (isMounted) {
          setSummary("Could not load book summary. Please check your internet connection.");
          setExtraDetails(null);
        }
      } finally {
        if (isMounted) {
          setLoadingSummary(false);
        }
      }
    };
    
    fetchSummary();
    
    return () => {
      isMounted = false;
    };
  }, [selectedBook]);

  useEffect(() => {
    setDisplayedSummary("");
    if (!summary) return;
    
    const words = summary.split(" ");
    let i = 0;
    let current = "";
    
    const timer = setInterval(() => {
      if (i < words.length) {
        current += (i === 0 ? "" : " ") + words[i];
        setDisplayedSummary(current);
        i++;
      } else {
        clearInterval(timer);
      }
    }, 30);
    
    return () => clearInterval(timer);
  }, [summary]);

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
            src={heroImg.src}
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
            <div key={book.id} className="card" onClick={() => setSelectedBook(book)} style={{ cursor: "pointer" }}>
              <div className="book-card">
                <img
                  src={book.coverUrl || `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg`}
                  alt={book.title}
                  className="book-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/60x88/1f2937/94a3b8?text=📖"; }}
                />
                <div className="book-info" style={{ flex: 1 }}>
                  <div className="book-title">{book.title}</div>
                  <div className="book-author">{book.author}</div>
                  <div className="book-isbn">ISBN: {book.isbn}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <span className={`book-status ${book.status}`}>
                      {book.status === "available" ? "✓ Available" : "✗ Borrowed"}
                    </span>
                    {me?.role === "admin" && (
                      <button 
                        className="btn btn-danger btn-sm" 
                        style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "4px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBook(book.id);
                        }}
                      >
                        🗑 Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </main>

      <TabBar />

      {selectedBook && (
        <div className="modal-overlay" onClick={() => setSelectedBook(null)}>
          <div className="modal-container" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedBook(null)}>✕</button>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <img
                src={selectedBook.coverUrl || `https://covers.openlibrary.org/b/isbn/${selectedBook.isbn}-L.jpg`}
                alt={selectedBook.title}
                style={{ width: "120px", height: "176px", borderRadius: "10px", objectFit: "cover", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}
                onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/120x176/1f2937/94a3b8?text=📖"; }}
              />
            </div>
            <h2 className="modal-title" style={{ textAlign: "center" }}>{selectedBook.title}</h2>
            <p className="modal-author" style={{ textAlign: "center" }}>by {selectedBook.author}</p>
            
            <div className="modal-meta-list">
              <div className="modal-meta-item">
                <span className="modal-meta-label">ISBN</span>
                <span className="modal-meta-value" style={{ fontFamily: "monospace" }}>{selectedBook.isbn}</span>
              </div>
              <div className="modal-meta-item">
                <span className="modal-meta-label">Status</span>
                <span className={`book-status ${selectedBook.status}`} style={{ margin: 0 }}>
                  {selectedBook.status === "available" ? "✓ Available" : "✗ Borrowed"}
                </span>
              </div>
              <div className="modal-meta-item">
                <span className="modal-meta-label">Added By</span>
                <span className="modal-meta-value">{selectedBook.addedBy}</span>
              </div>
              <div className="modal-meta-item">
                <span className="modal-meta-label">Added On</span>
                <span className="modal-meta-value">
                  {selectedBook.addedAt ? new Date(selectedBook.addedAt).toLocaleDateString(undefined, { dateStyle: "medium" }) : "N/A"}
                </span>
              </div>
              {selectedBook.status === "borrowed" && (
                <>
                  <div className="modal-meta-item">
                    <span className="modal-meta-label">Borrowed By</span>
                    <span className="modal-meta-value">{selectedBook.borrowedBy || "Anonymous"}</span>
                  </div>
                  <div className="modal-meta-item">
                    <span className="modal-meta-label">Borrowed On</span>
                    <span className="modal-meta-value">
                      {selectedBook.borrowedAt ? new Date(selectedBook.borrowedAt).toLocaleDateString(undefined, { dateStyle: "medium" }) : "N/A"}
                    </span>
                  </div>
                </>
              )}
              {extraDetails && (
                <>
                  {extraDetails.publisher && (
                    <div className="modal-meta-item">
                      <span className="modal-meta-label">Publisher</span>
                      <span className="modal-meta-value" style={{ textAlign: "right", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={extraDetails.publisher}>{extraDetails.publisher}</span>
                    </div>
                  )}
                  {extraDetails.publishDate && (
                    <div className="modal-meta-item">
                      <span className="modal-meta-label">Published</span>
                      <span className="modal-meta-value">{extraDetails.publishDate}</span>
                    </div>
                  )}
                  {extraDetails.pages && extraDetails.pages > 0 ? (
                    <div className="modal-meta-item">
                      <span className="modal-meta-label">Pages</span>
                      <span className="modal-meta-value">{extraDetails.pages} pages</span>
                    </div>
                  ) : null}
                  {extraDetails.publishPlaces && (
                    <div className="modal-meta-item">
                      <span className="modal-meta-label">Publish Place</span>
                      <span className="modal-meta-value" style={{ textAlign: "right", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={extraDetails.publishPlaces}>{extraDetails.publishPlaces}</span>
                    </div>
                  )}
                  {(extraDetails.goodreadsId || extraDetails.openLibraryUrl) && (
                    <div className="modal-meta-item" style={{ borderBottom: "none", paddingBottom: 0 }}>
                      <span className="modal-meta-label">Links</span>
                      <div style={{ display: "flex", gap: 12 }}>
                        {extraDetails.openLibraryUrl && (
                          <a href={extraDetails.openLibraryUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8rem", color: "var(--accent)", textDecoration: "none", display: "flex", alignItems: "center", gap: 2 }}>
                            📖 OpenLibrary
                          </a>
                        )}
                        {extraDetails.goodreadsId && (
                          <a href={`https://www.goodreads.com/book/show/${extraDetails.goodreadsId}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8rem", color: "var(--accent2)", textDecoration: "none", display: "flex", alignItems: "center", gap: 2 }}>
                            📚 Goodreads
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <span className="modal-meta-label" style={{ fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>
                Book Summary
              </span>
              {loadingSummary ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, margin: 0 }} />
                  <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontStyle: "italic" }}>Streaming summary...</span>
                </div>
              ) : (
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.6, maxHeight: "160px", overflowY: "auto", paddingRight: 4 }}>
                  {displayedSummary || "No summary loaded."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
