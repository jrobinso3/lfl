"use client";
import { useState, useEffect, useRef } from "react";
import TabBar from "@/components/TabBar";
import { getBookByIsbn, addBook, getCurrentUser, type Book } from "@/lib/db";

export default function LeavePage() {
  const [isbn, setIsbn] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ type: "success"|"error"|"info"; msg: string } | null>(null);
  const [foundBook, setFoundBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(false);
  const scannerRef = useRef<unknown>(null);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (scannerRef.current as any).stop?.().catch?.(() => {});
      }
    };
  }, []);

  const startScanner = async () => {
    const { Html5QrcodeScanner } = await import("html5-qrcode");
    setScanning(true);
    setResult(null);
    const scanner = new Html5QrcodeScanner("leave-scanner", { fps: 10, qrbox: { width: 250, height: 150 } }, false);
    scannerRef.current = scanner;
    scanner.render(
      (decoded: string) => {
        setIsbn(decoded);
        scanner.clear();
        setScanning(false);
      },
      () => {}
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isbn.trim()) return;
    setLoading(true);
    setResult(null);
    setFoundBook(null);
    try {
      const existing = await getBookByIsbn(isbn.trim());
      if (existing) {
        setResult({ type: "error", msg: "This book is already in the library." });
        setLoading(false);
        return;
      }
      // Fetch book info from Open Library
      let bookData = { title: "Unknown Title", author: "Unknown Author", coverUrl: "" };
      try {
        const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn.trim()}&format=json&jscmd=data`);
        const data = await res.json();
        const key = `ISBN:${isbn.trim()}`;
        if (data[key]) {
          const d = data[key];
          bookData.title = d.title ?? bookData.title;
          bookData.author = d.authors?.[0]?.name ?? bookData.author;
          bookData.coverUrl = d.cover?.large ?? d.cover?.medium ?? `https://covers.openlibrary.org/b/isbn/${isbn.trim()}-L.jpg`;
        } else {
          bookData.coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn.trim()}-L.jpg`;
        }
      } catch {
        bookData.coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn.trim()}-L.jpg`;
      }
      const user = getCurrentUser();
      const book = await addBook({
        isbn: isbn.trim(), ...bookData, status: "available",
        borrowedBy: null, borrowedAt: null, addedBy: user?.username ?? "anonymous"
      });
      setFoundBook(book);
      setResult({ type: "success", msg: `"${book.title}" has been added to the library! 🎉` });
      setIsbn("");
    } catch (err) {
      setResult({ type: "error", msg: err instanceof Error ? err.message : "Failed to add book" });
    }
    setLoading(false);
  };

  return (
    <div className="app-shell">
      <header className="nav">
        <span className="nav-logo">📥 Leave a Book</span>
      </header>
      <main className="page fade-up">
        <div className="card" style={{marginBottom: 20}}>
          <p style={{fontSize:"0.88rem", color:"var(--text-muted)", lineHeight:1.7}}>
            Donating a book? Scan its barcode or enter the ISBN manually to register it in the library.
          </p>
        </div>

        {/* Scanner */}
        <div className={`scanner-box${scanning ? " active" : ""}`}>
          {scanning ? (
            <div id="leave-scanner" style={{width:"100%"}} />
          ) : (
            <>
              <span style={{fontSize:"3rem"}}>📷</span>
              <p style={{fontSize:"0.85rem", color:"var(--text-muted)"}}>Tap to scan barcode</p>
              <button className="btn btn-secondary btn-sm" onClick={startScanner}>Start Camera</button>
            </>
          )}
        </div>

        <p className="section-title">Or enter ISBN manually</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">ISBN / Barcode</label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. 9780451524935"
              value={isbn}
              onChange={e => setIsbn(e.target.value)}
              inputMode="numeric"
            />
          </div>
          {result && <div className={`alert alert-${result.type}`}>{result.msg}</div>}
          {foundBook && (
            <div className="card book-card" style={{marginBottom:16}}>
              <img src={foundBook.coverUrl} alt={foundBook.title} className="book-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/60x88/1f2937/94a3b8?text=📖"; }}
              />
              <div className="book-info">
                <div className="book-title">{foundBook.title}</div>
                <div className="book-author">{foundBook.author}</div>
                <span className="book-status available">✓ Added</span>
              </div>
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={loading || !isbn.trim()}>
            {loading ? "Looking up…" : "📥 Leave This Book"}
          </button>
        </form>
      </main>
      <TabBar />
    </div>
  );
}
