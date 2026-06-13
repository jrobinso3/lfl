"use client";
import { useState, useEffect, useRef } from "react";
import TabBar from "@/components/TabBar";
import DbStatus from "@/components/DbStatus";
import { getBookByIsbn, addBook, getCurrentUser, type Book } from "@/lib/db";

export default function LeavePage() {
  const [isbn, setIsbn] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ type: "success"|"error"|"info"; msg: string } | null>(null);
  const [foundBook, setFoundBook] = useState<Book | null>(null);
  const [previewBook, setPreviewBook] = useState<{ title: string; author: string; coverUrl: string; isbn: string } | null>(null);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const scannerRef = useRef<unknown>(null);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await (scannerRef.current as any).stop();
      } catch (err) {
        console.error("Failed to stop scanner:", err);
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  // Trigger preview fetch when a valid ISBN length is reached
  useEffect(() => {
    const cleanIsbn = isbn.trim().replace(/[-\s]/g, "");
    if (cleanIsbn.length === 10 || cleanIsbn.length === 13) {
      loadOpenLibraryPreview(cleanIsbn);
    } else {
      setPreviewBook(null);
    }
  }, [isbn]);

  const loadOpenLibraryPreview = async (isbnValue: string) => {
    setFetchingPreview(true);
    setResult(null);
    setPreviewBook(null);
    setFoundBook(null);
    try {
      // 1. Check if already exists in the database
      const existing = await getBookByIsbn(isbnValue);
      if (existing) {
        setResult({ type: "error", msg: "This book is already in the library." });
        setFetchingPreview(false);
        return;
      }

      // 2. Fetch from Open Library API
      const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbnValue}&format=json&jscmd=data`);
      if (!res.ok) throw new Error("Network response was not ok");
      
      const data = await res.json();
      const key = `ISBN:${isbnValue}`;
      let title = "Unknown Title";
      let author = "Unknown Author";
      let coverUrl = `https://covers.openlibrary.org/b/isbn/${isbnValue}-L.jpg`;

      if (data[key]) {
        const d = data[key];
        title = d.title ?? title;
        author = d.authors?.[0]?.name ?? author;
        coverUrl = d.cover?.large ?? d.cover?.medium ?? coverUrl;
      }

      setPreviewBook({ title, author, coverUrl, isbn: isbnValue });
    } catch (err) {
      console.error("Open Library lookup failed:", err);
      // Still allow them to leave it as an Unknown Book
      setPreviewBook({
        title: "Unknown Book",
        author: "Unknown Author",
        coverUrl: `https://covers.openlibrary.org/b/isbn/${isbnValue}-L.jpg`,
        isbn: isbnValue
      });
    }
    setFetchingPreview(false);
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

      // Request permission using standard back camera constraints to prompt user
      let tempStream: MediaStream | null = null;
      try {
        tempStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
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

      // Enumerate devices to select the rear camera with the closest focus distance
      let chosenDeviceId: string | null = null;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === "videoinput");

        // Filter for back/rear/environment cameras
        const backCameras = videoDevices.filter(d => {
          const label = d.label.toLowerCase();
          return label.includes("back") || label.includes("rear") || label.includes("environment");
        });

        const candidates = backCameras.length > 0 ? backCameras : videoDevices;

        // Query capabilities to find the closest focus distance
        let closestFocus = Infinity;

        for (const device of candidates) {
          try {
            const testStream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: device.deviceId } }
            });
            const track = testStream.getVideoTracks()[0];
            if (track) {
              const capabilities = track.getCapabilities() as any;
              if (capabilities.focusDistance && typeof capabilities.focusDistance.min === "number") {
                const minFocus = capabilities.focusDistance.min;
                if (minFocus < closestFocus) {
                  closestFocus = minFocus;
                  chosenDeviceId = device.deviceId;
                }
              }
              track.stop();
            }
          } catch (err) {
            console.warn(`Could not query capabilities for camera: ${device.label}`, err);
          }
        }

        // Default to the first back camera if no focus distance capabilities could be read
        if (!chosenDeviceId && candidates.length > 0) {
          chosenDeviceId = candidates[0].deviceId;
        }
      } catch (err) {
        console.error("Failed to select best camera:", err);
      } finally {
        if (tempStream) {
          tempStream.getTracks().forEach(track => track.stop());
        }
      }

      // 2. Initialize Html5Qrcode
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (!isMounted) return;

        // Ensure target element exists in DOM
        const targetEl = document.getElementById("leave-scanner");
        if (!targetEl) {
          console.warn("Scanner target element not in DOM yet.");
          return;
        }

        scannerInstance = new Html5Qrcode("leave-scanner");
        scannerRef.current = scannerInstance;

        await scannerInstance.start(
          chosenDeviceId || { facingMode: "environment" },
          { 
            fps: 10, 
            qrbox: { width: 280, height: 160 },
            formatsToSupport: [
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.EAN_8,
              Html5QrcodeSupportedFormats.UPC_A,
              Html5QrcodeSupportedFormats.UPC_E,
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.QR_CODE
            ],
            experimentalFeatures: {
              useBarCodeDetectorIfSupported: true
            }
          },
          (decoded: string) => {
            if (isMounted) {
              // Satisfying double-pulse haptic feedback when scan is successful
              if (typeof navigator !== "undefined" && navigator.vibrate) {
                try {
                  navigator.vibrate([100, 50, 100]);
                } catch {
                  // ignore
                }
              }
              setIsbn(decoded);
              stopScanner();
            }
          },
          () => {
            // Frame parsing errors are silent to prevent logs flooding
          }
        );

        // Try to apply continuous autofocus if supported
        try {
          await scannerInstance.applyVideoConstraints({
            focusMode: "continuous"
          } as any);
        } catch {
          // ignore
        }

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
          scannerInstance.stop().catch(() => {});
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
    const cleanIsbn = isbn.trim();
    if (!cleanIsbn) return;
    setLoading(true);
    setResult(null);
    setFoundBook(null);
    try {
      const existing = await getBookByIsbn(cleanIsbn);
      if (existing) {
        setResult({ type: "error", msg: "This book is already in the library." });
        setLoading(false);
        return;
      }

      let bookData = previewBook;
      if (!bookData || bookData.isbn !== cleanIsbn) {
        // Fallback fetch if user didn't trigger preview (e.g. bypassed preview)
        let openLibraryData = { title: "Unknown Title", author: "Unknown Author", coverUrl: `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg` };
        try {
          const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`);
          const data = await res.json();
          const key = `ISBN:${cleanIsbn}`;
          if (data[key]) {
            const d = data[key];
            openLibraryData.title = d.title ?? openLibraryData.title;
            openLibraryData.author = d.authors?.[0]?.name ?? openLibraryData.author;
            openLibraryData.coverUrl = d.cover?.large ?? d.cover?.medium ?? openLibraryData.coverUrl;
          }
        } catch {
          // ignore
        }
        bookData = { ...openLibraryData, isbn: cleanIsbn };
      }

      const user = getCurrentUser();
      const book = await addBook({
        isbn: bookData.isbn,
        title: bookData.title,
        author: bookData.author,
        coverUrl: bookData.coverUrl,
        status: "available",
        borrowedBy: null,
        borrowedAt: null,
        addedBy: user?.displayName ?? user?.username ?? "anonymous"
      });

      setFoundBook(book);
      setPreviewBook(null);
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
        <div className="nav-actions">
          <DbStatus />
        </div>
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
              {/* Premium overlay grid / viewfinder cutout */}
              <div className="scanner-overlay">
                <div className="scanner-frame">
                  <div className="scanner-laser" />
                  <div className="corner top-left" />
                  <div className="corner top-right" />
                  <div className="corner bottom-left" />
                  <div className="corner bottom-right" />
                </div>
              </div>
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

          {/* Loading Preview Spinner */}
          {fetchingPreview && (
            <div className="card" style={{ display: "flex", gap: "16px", alignItems: "center", justifyContent: "center", minHeight: "100px", marginBottom: 16 }}>
              <div className="spinner" style={{ margin: 0, width: "24px", height: "24px", borderWidth: "2px" }} />
              <span style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>Loading book details from OpenLibrary...</span>
            </div>
          )}

          {/* Preview Card */}
          {previewBook && !fetchingPreview && (
            <div className="card" style={{ border: "1px solid var(--accent)", background: "rgba(110, 231, 183, 0.03)", marginBottom: 16 }}>
              <p className="section-title" style={{ color: "var(--accent)", marginBottom: 10 }}>Book Found on OpenLibrary</p>
              <div className="book-card" style={{ marginBottom: 0 }}>
                <img 
                  src={previewBook.coverUrl} 
                  alt={previewBook.title} 
                  className="book-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = "https://placehold.co/60x88/1f2937/94a3b8?text=📖"; }}
                />
                <div className="book-info">
                  <div className="book-title">{previewBook.title}</div>
                  <div className="book-author">{previewBook.author}</div>
                  <div className="book-isbn" style={{ marginTop: 4 }}>ISBN: {previewBook.isbn}</div>
                </div>
              </div>
            </div>
          )}

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

          <button className="btn btn-primary" type="submit" disabled={loading || fetchingPreview || !isbn.trim()}>
            {loading ? "Looking up…" : previewBook ? "📥 Confirm & Leave Book" : "📥 Leave This Book"}
          </button>
        </form>
      </main>
      <TabBar />
    </div>
  );
}
