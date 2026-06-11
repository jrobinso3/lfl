"use client";
import { useState, useEffect, useRef } from "react";
import TabBar from "@/components/TabBar";
import { getBooks, updateBook, getCurrentUser, type Book } from "@/lib/db";

export default function TakePage() {
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
    const scanner = new Html5QrcodeScanner("take-scanner", { fps: 10, qrbox: { width: 250, height: 150 } }, false);
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

  const lookupBook = async () => {
    if (!isbn.trim()) return;
    setLoading(true);
    setResult(null);
    setFoundBook(null);
    try {
      const books = await getBooks();
      const match = books.find(b =>
        b.isbn === isbn.trim() || b.isbn.replace(/-/g,"") === isbn.trim().replace(/-/g,"")
      );
      if (!match) {
        setResult({ type: "error", msg: "This book is not in the library." });
      } else if (match.status === "borrowed") {
        setResult({ type: "info", msg: "This book has already been taken." });
      } else {
        setFoundBook(match);
        setResult({ type: "info", msg: "Found it! Confirm below to take this book." });
      }
    } catch {
      setResult({ type: "error", msg: "Error looking up book." });
    }
    setLoading(false);
  };

  const confirmTake = async () => {
    if (!foundBook) return;
    setLoading(true);
    try {
      const user = getCurrentUser();
      const updated = await updateBook(foundBook.id, {
        status: "borrowed",
        borrowedBy: user?.username ?? "anonymous",
        borrowedAt: new Date().toISOString()
      });
      setResult({ type: "success", msg: `Enjoy "${updated.title}"! 📖 Please bring it back when you're done.` });
      setFoundBook(null);
      setIsbn("");
    } catch {
      setResult({ type: "error", msg: "Failed to check out book." });
    }
    setLoading(false);
  };

  return (
    <div className="app-shell">
      <header className="nav">
        <span className="nav-logo">📤 Take a Book</span>
      </header>
      <main className="page fade-up">
        <div className="card" style={{marginBottom: 20}}>
          <p style={{fontSize:"0.88rem", color:"var(--text-muted)", lineHeight:1.7}}>
            Want to borrow a book? Scan its barcode or enter the ISBN to check it out of the library.
          </p>
        </div>

        <div className={`scanner-box${scanning ? " active" : ""}`}>
          {scanning ? (
            <div id="take-scanner" style={{width:"100%"}} />
          ) : (
            <>
              <span style={{fontSize:"3rem"}}>📷</span>
              <p style={{fontSize:"0.85rem", color:"var(--text-muted)"}}>Tap to scan barcode</p>
              <button className="btn btn-secondary btn-sm" onClick={startScanner}>Start Camera</button>
            </>
          )}
        </div>

        <p className="section-title">Or enter ISBN manually</p>

        <div className="form-group">
          <label className="form-label">ISBN / Barcode</label>
          <input
            className="form-input"
            type="text"
            placeholder="e.g. 9780316769174"
            value={isbn}
            onChange={e => setIsbn(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <button className="btn btn-accent2" style={{marginBottom:16}} onClick={lookupBook} disabled={loading || !isbn.trim()}>
          {loading ? "Searching…" : "🔍 Look Up Book"}
        </button>

        {result && <div className={`alert alert-${result.type}`}>{result.msg}</div>}

        {foundBook && (
          <>
            <div className="card book-card" style={{marginBottom:16}}>
              <img src={foundBook.coverUrl} alt={foundBook.title} className="book-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/60x88/1f2937/94a3b8?text=📖"; }}
              />
              <div className="book-info">
                <div className="book-title">{foundBook.title}</div>
                <div className="book-author">{foundBook.author}</div>
                <span className="book-status available">✓ Available</span>
              </div>
            </div>
            <button className="btn btn-primary" onClick={confirmTake} disabled={loading}>
              📤 Confirm Take This Book
            </button>
          </>
        )}
      </main>
      <TabBar />
    </div>
  );
}
