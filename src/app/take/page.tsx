"use client";
import { useState, useEffect, useRef } from "react";
import TabBar from "@/components/TabBar";
import DbStatus from "@/components/DbStatus";
import { getBooks, updateBook, getCurrentUser, type Book } from "@/lib/db";

export default function TakePage() {
  const [isbn, setIsbn] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ type: "success"|"error"|"info"; msg: string } | null>(null);
  const [foundBook, setFoundBook] = useState<Book | null>(null);
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
        const targetEl = document.getElementById("take-scanner");
        if (!targetEl) {
          console.warn("Scanner target element not in DOM yet.");
          return;
        }

        scannerInstance = new Html5Qrcode("take-scanner");
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

  // Trigger automatic book lookup when a valid ISBN length is reached
  useEffect(() => {
    const cleanIsbn = isbn.trim().replace(/[-\s]/g, "");
    if (cleanIsbn.length === 10 || cleanIsbn.length === 13) {
      autoLookupBook(cleanIsbn);
    } else {
      setFoundBook(null);
      setResult(null);
    }
  }, [isbn]);

  const autoLookupBook = async (isbnValue: string) => {
    setLoading(true);
    setResult(null);
    setFoundBook(null);
    try {
      const books = await getBooks();
      const match = books.find(b =>
        b.isbn === isbnValue || b.isbn.replace(/[-\s]/g,"") === isbnValue
      );
      if (!match) {
        setResult({ type: "error", msg: "This book is not registered in the library." });
      } else if (match.status === "borrowed") {
        setResult({ type: "info", msg: `"${match.title}" is already checked out by ${match.borrowedBy}.` });
      } else {
        setFoundBook(match);
        setResult({ type: "info", msg: "Book found! Confirm below to borrow it." });
      }
    } catch (err) {
      console.error("Auto lookup failed:", err);
      setResult({ type: "error", msg: "Error searching library database." });
    }
    setLoading(false);
  };

  const startScanner = () => {
    setScanning(true);
    setResult(null);
  };

  const manualLookup = () => {
    const cleanIsbn = isbn.trim().replace(/[-\s]/g, "");
    if (cleanIsbn) {
      autoLookupBook(cleanIsbn);
    }
  };

  const confirmTake = async () => {
    if (!foundBook) return;
    setLoading(true);
    try {
      const user = getCurrentUser();
      const updated = await updateBook(foundBook.id, {
        status: "borrowed",
        borrowedBy: user?.displayName ?? user?.username ?? "anonymous",
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
        <div className="nav-actions">
          <DbStatus />
        </div>
      </header>
      <main className="page fade-up">
        <div className="card" style={{marginBottom: 20}}>
          <p style={{fontSize:"0.88rem", color:"var(--text-muted)", lineHeight:1.7}}>
            Want to borrow a book? Scan its barcode or enter the ISBN to check it out of the library.
          </p>
        </div>

        <div className={`scanner-box${scanning ? " active" : ""}`} style={{ position: "relative" }}>
          {scanning ? (
            <>
              <div id="take-scanner" style={{width:"100%"}} />
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
        <button className="btn btn-accent2" style={{marginBottom:16}} onClick={manualLookup} disabled={loading || !isbn.trim()}>
          {loading ? "Searching…" : "🔍 Look Up Book"}
        </button>

        {loading && (
          <div className="card" style={{ display: "flex", gap: "16px", alignItems: "center", justifyContent: "center", minHeight: "100px", marginBottom: 16 }}>
            <div className="spinner" style={{ margin: 0, width: "24px", height: "24px", borderWidth: "2px" }} />
            <span style={{ fontSize: "0.88rem", color: "var(--text-muted)" }}>Searching library database...</span>
          </div>
        )}

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
