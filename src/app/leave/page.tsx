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

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await (scannerRef.current as any).clear();
      } catch (err) {
        console.error("Failed to clear scanner:", err);
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => {
    if (!scanning) return;

    let isMounted = true;
    let scannerInstance: any = null;

    const initScanner = async () => {
      // 1. Pre-flight permission check to verify browser supports it and user allows it
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (isMounted) {
          setResult({
            type: "error",
            msg: "Camera scanning is not supported on this browser/connection. Please verify HTTPS is active or enter the ISBN manually."
          });
          setScanning(false);
        }
        return;
      }

      try {
        // Request permission and capture video stream temporarily to verify access
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        // Stop stream immediately to free it up for html5-qrcode
        stream.getTracks().forEach(track => track.stop());
      } catch (err: any) {
        console.error("Camera permission check failed:", err);
        if (isMounted) {
          let errorMsg = "Camera access denied. Please allow camera access in browser settings.";
          if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            errorMsg = "Camera permission denied. Please enable camera access in your browser settings and try again.";
          } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            errorMsg = "No camera hardware detected on this device.";
          } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
            errorMsg = "Camera is already in use by another app or tab.";
          }
          setResult({ type: "error", msg: errorMsg });
          setScanning(false);
        }
        return;
      }

      // 2. Initialize Html5QrcodeScanner
      try {
        const { Html5QrcodeScanner } = await import("html5-qrcode");
        if (!isMounted) return;

        // Ensure target element exists in DOM
        const targetEl = document.getElementById("leave-scanner");
        if (!targetEl) {
          console.warn("Scanner target element not in DOM yet.");
          return;
        }

        scannerInstance = new Html5QrcodeScanner(
          "leave-scanner",
          { fps: 10, qrbox: { width: 250, height: 150 } },
          /* verbose= */ false
        );
        scannerRef.current = scannerInstance;

        scannerInstance.render(
          (decoded: string) => {
            if (isMounted) {
              setIsbn(decoded);
              stopScanner();
            }
          },
          () => {
            // Frame parsing errors are silent to prevent logs flooding
          }
        );
      } catch (err) {
        console.error("Scanner setup failed:", err);
        if (isMounted) {
          setResult({ type: "error", msg: "Failed to load/initialize the camera scanner." });
          setScanning(false);
        }
      }
    };

    // Delay initialization slightly to let React complete the DOM render cycle
    const timer = setTimeout(initScanner, 80);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scannerInstance) {
        try {
          scannerInstance.clear().catch(() => {});
        } catch {
          // ignore
        }
      }
    };
  }, [scanning]);

  const startScanner = () => {
    setScanning(true);
    setResult(null);
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
        <div className={`scanner-box${scanning ? " active" : ""}`} style={{ position: "relative" }}>
          {scanning ? (
            <>
              <div id="leave-scanner" style={{width:"100%"}} />
              <button 
                className="btn btn-danger btn-sm" 
                style={{ 
                  position: "absolute", 
                  top: "10px", 
                  right: "10px", 
                  zIndex: 10,
                  width: "auto",
                  padding: "6px 12px",
                  borderRadius: "20px"
                }} 
                type="button"
                onClick={stopScanner}
              >
                ✕ Cancel Scan
              </button>
            </>
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
