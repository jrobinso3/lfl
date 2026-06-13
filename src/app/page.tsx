"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import TabBar from "@/components/TabBar";
import DbStatus from "@/components/DbStatus";
import { subscribeBooks, deleteBook, updateBook, getCurrentUser, type Book, type SessionUser } from "@/lib/db";
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
    googleBooksUrl?: string;
    openLibraryUrl?: string;
    googleCoverUrl?: string;
    rating?: number;
    ratingsCount?: number;
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

  // Background enrichment: for any book missing rating/pages/cover, fetch from OpenLibrary
  // and persist so catalog cards show populated data without requiring a modal open.
  useEffect(() => {
    if (allBooks.length === 0) return;
    let cancelled = false;

    const needsEnrichment = allBooks.filter(b =>
      b.rating === undefined || !b.pages || b.pages === 0 || !b.coverUrl
    );
    if (needsEnrichment.length === 0) return;

    const enrich = async () => {
      for (const book of needsEnrichment) {
        if (cancelled) break;
        try {
          // 1. Fetch edition details (cover, pages)
          const detailsRes = await fetch(
            `https://openlibrary.org/api/books?bibkeys=ISBN:${book.isbn}&format=json&jscmd=details`
          );
          if (!detailsRes.ok || cancelled) continue;
          const detailsData = await detailsRes.json();
          const bk = detailsData[`ISBN:${book.isbn}`];
          if (!bk) continue;

          const updates: Partial<Book> = {};

          // Cover: use the cover ID from details to build a proper large URL
          if (!book.coverUrl) {
            const coverIds: number[] = bk.details?.covers ?? [];
            const validId = coverIds.find((id: number) => id > 0);
            if (validId) {
              updates.coverUrl = `https://covers.openlibrary.org/b/id/${validId}-L.jpg`;
            } else if (bk.thumbnail_url) {
              // thumbnail_url is -S size; upgrade to -L
              updates.coverUrl = bk.thumbnail_url.replace(/-S\.jpg$/, "-L.jpg");
            }
          }

          // Pages
          if ((!book.pages || book.pages === 0) && bk.details?.number_of_pages) {
            updates.pages = bk.details.number_of_pages;
          }

          // 2. Fetch ratings from Work endpoint
          if (book.rating === undefined) {
            const works: { key: string }[] = bk.details?.works ?? [];
            if (works.length > 0) {
              await new Promise(r => setTimeout(r, 300));
              if (cancelled) break;
              const ratingsRes = await fetch(
                `https://openlibrary.org${works[0].key}/ratings.json`
              );
              if (ratingsRes.ok && !cancelled) {
                const rd = await ratingsRes.json();
                if (rd.summary?.average) {
                  updates.rating = rd.summary.average;
                  updates.ratingsCount = rd.summary.count;
                }
              }
            }
          }

          if (Object.keys(updates).length > 0 && !cancelled) {
            updateBook(book.id, updates).catch(() => {});
          }
        } catch {
          // Non-fatal — skip this book
        }
        // Throttle between books to be polite to the API
        await new Promise(r => setTimeout(r, 300));
      }
    };

    enrich();
    return () => { cancelled = true; };
  }, [allBooks]);

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
      let desc = "";
      let publishDate = "";
      let publisher = "";
      let pages = 0;
      let googleBooksUrl = "";
      let openLibraryUrl = "";
      let googleCoverUrl = "";
      let rating: number | undefined = undefined;
      let ratingsCount: number | undefined = undefined;
      
      // 1. Try Google Books API first
      try {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY;
        const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${selectedBook.isbn}${apiKey ? `&key=${apiKey}` : ""}`);
        if (!res.ok) throw new Error("Google Books request failed");
        const data = await res.json();
        if (data.error) throw new Error(data.error.message || "Google Books error");
        
        if (data.items && data.items.length > 0) {
          const volumeInfo = data.items[0].volumeInfo;
          desc = volumeInfo.description ?? "";
          publishDate = volumeInfo.publishedDate ?? "";
          publisher = volumeInfo.publisher ?? "";
          pages = volumeInfo.pageCount ?? 0;
          googleBooksUrl = volumeInfo.infoLink ?? "";
          rating = volumeInfo.averageRating;
          ratingsCount = volumeInfo.ratingsCount;
          
          let rawCover = volumeInfo.imageLinks?.thumbnail ?? volumeInfo.imageLinks?.smallThumbnail;
          if (rawCover) {
            googleCoverUrl = rawCover.replace(/^http:\/\//i, "https://");
          }
        }
      } catch (gErr) {
        console.warn("Google Books API failed, falling back to OpenLibrary:", gErr);
      }
      
      // 2. Fallback to OpenLibrary if description or rating is missing (or Google Books failed)
      if (!desc || rating === undefined) {
        try {
          const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${selectedBook.isbn}&format=json&jscmd=details`);
          if (res.ok) {
            const data = await res.json();
            const key = `ISBN:${selectedBook.isbn}`;
            const bookData = data[key];
            openLibraryUrl = bookData?.info_url ?? "";
            
            if (bookData?.details) {
              const details = bookData.details;
              if (details.description && !desc) {
                const d = details.description;
                desc = typeof d === "string" ? d : d.value ?? "";
              }
              publishDate = details.publish_date ?? publishDate;
              if (details.publishers && details.publishers.length > 0) {
                publisher = details.publishers.join(", ");
              }
              pages = details.number_of_pages ?? pages;
            }
            
            // Try fetching from Work endpoint for description and ratings
            if (bookData) {
              const works = bookData.works || bookData.details?.works;
              if (works && works.length > 0 && works[0].key) {
                const workKey = works[0].key;
                
                if (!desc) {
                  try {
                    const workRes = await fetch(`https://openlibrary.org${workKey}.json`);
                    if (workRes.ok) {
                      const workData = await workRes.json();
                      if (workData.description) {
                        const wd = workData.description;
                        desc = typeof wd === "string" ? wd : wd.value ?? "";
                      }
                    }
                  } catch {}
                }
                
                if (rating === undefined) {
                  try {
                    const ratingsRes = await fetch(`https://openlibrary.org${workKey}/ratings.json`);
                    if (ratingsRes.ok) {
                      const ratingsData = await ratingsRes.json();
                      if (ratingsData.summary) {
                        rating = ratingsData.summary.average;
                        ratingsCount = ratingsData.summary.count;
                      }
                    }
                  } catch {}
                }
              }
            }
          }
        } catch (olErr) {
          console.error("OpenLibrary fallback failed:", olErr);
        }
      }
      
      // Auto-upgrade database records if we successfully fetched better metadata (Google Books covers, ratings, pages)
      const updates: Partial<Book> = {};
      if (googleCoverUrl && (selectedBook.coverUrl.includes("openlibrary.org") || !selectedBook.coverUrl)) {
        updates.coverUrl = googleCoverUrl;
      }
      if (rating !== undefined && selectedBook.rating === undefined) {
        updates.rating = rating;
      }
      if (ratingsCount !== undefined && selectedBook.ratingsCount === undefined) {
        updates.ratingsCount = ratingsCount;
      }
      if (pages > 0 && (!selectedBook.pages || selectedBook.pages === 0)) {
        updates.pages = pages;
      }
      if (Object.keys(updates).length > 0) {
        updateBook(selectedBook.id, updates).catch(err => {
          console.error("Failed to auto-upgrade book details in DB:", err);
        });
      }
      
      if (isMounted) {
        if (desc) {
          setSummary(desc);
        } else {
          setSummary("No summary available for this edition in the archives.");
        }
        setExtraDetails({
          publishDate,
          publisher,
          pages,
          googleBooksUrl,
          openLibraryUrl,
          googleCoverUrl,
          rating,
          ratingsCount
        });
      }
      if (isMounted) {
        setLoadingSummary(false);
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
                  {book.rating ? (
                    <div className="book-rating" style={{ fontSize: "0.8rem", color: "#fbbf24", display: "flex", alignItems: "center", gap: "4px", marginTop: "4px", flexWrap: "wrap" }}>
                      {'★'.repeat(Math.round(book.rating)) + '☆'.repeat(5 - Math.round(book.rating))}
                      <span style={{ color: "var(--text)", fontWeight: 600 }}>{book.rating.toFixed(1)}</span>
                      {book.ratingsCount && (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>({book.ratingsCount.toLocaleString()})</span>
                      )}
                      {book.pages && book.pages > 0 && (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginLeft: "8px", borderLeft: "1px solid var(--border)", paddingLeft: "8px" }}>📖 {book.pages} pages</span>
                      )}
                    </div>
                  ) : (
                    <div className="book-rating" style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                      <span>☆☆☆☆☆ <span style={{ fontSize: "0.7rem" }}>(No ratings)</span></span>
                      {book.pages && book.pages > 0 && (
                        <span style={{ borderLeft: "1px solid var(--border)", paddingLeft: "8px" }}>📖 {book.pages} pages</span>
                      )}
                    </div>
                  )}
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
                src={extraDetails?.googleCoverUrl || selectedBook.coverUrl || `https://covers.openlibrary.org/b/isbn/${selectedBook.isbn}-L.jpg`}
                alt={selectedBook.title}
                style={{ width: "120px", height: "176px", borderRadius: "10px", objectFit: "cover", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}
                onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/120x176/1f2937/94a3b8?text=📖"; }}
              />
            </div>
            <h2 className="modal-title" style={{ textAlign: "center" }}>{selectedBook.title}</h2>
            <p className="modal-author" style={{ textAlign: "center", marginBottom: 8 }}>by {selectedBook.author}</p>
            
            {(selectedBook.rating || extraDetails?.rating) && (
              <div className="modal-rating" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginBottom: 16, color: "#fbbf24", fontSize: "1.1rem" }}>
                <div>
                  {'★'.repeat(Math.round(selectedBook.rating ?? extraDetails?.rating ?? 0)) + '☆'.repeat(5 - Math.round(selectedBook.rating ?? extraDetails?.rating ?? 0))}
                </div>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{(selectedBook.rating ?? extraDetails?.rating ?? 0).toFixed(1)}</span>
                {(selectedBook.ratingsCount || extraDetails?.ratingsCount) && (
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    ({(selectedBook.ratingsCount ?? extraDetails?.ratingsCount ?? 0).toLocaleString()} ratings)
                  </span>
                )}
              </div>
            )}
            
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
              <div className="modal-meta-item">
                <span className="modal-meta-label">Links</span>
                <div style={{ display: "flex", gap: 12 }}>
                  <a href={`https://www.goodreads.com/search?q=${selectedBook.isbn}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8rem", color: "var(--accent2)", textDecoration: "none", display: "flex", alignItems: "center", gap: 2 }}>
                    📚 Goodreads
                  </a>
                  {extraDetails?.googleBooksUrl && (
                    <a href={extraDetails.googleBooksUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8rem", color: "var(--accent)", textDecoration: "none", display: "flex", alignItems: "center", gap: 2 }}>
                      📖 Google Books
                    </a>
                  )}
                  {extraDetails?.openLibraryUrl && (
                    <a href={extraDetails.openLibraryUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8rem", color: "var(--accent)", textDecoration: "none", display: "flex", alignItems: "center", gap: 2 }}>
                      📖 OpenLibrary
                    </a>
                  )}
                </div>
              </div>
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
