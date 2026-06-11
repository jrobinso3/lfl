"use client";
import { useEffect, useState } from "react";
import { isFirebaseEnabled } from "@/lib/firebase";
import { getLastDbError } from "@/lib/db";

export default function DbStatus() {
  const [enabled, setEnabled] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const updateStatus = () => {
      setEnabled(isFirebaseEnabled());
      setErrorMsg(getLastDbError());
    };
    updateStatus();

    window.addEventListener("lfl-db-status-change", updateStatus);
    return () => window.removeEventListener("lfl-db-status-change", updateStatus);
  }, []);

  if (!enabled) {
    return (
      <span className="db-status-badge offline" title="Saved locally in browser cache only. Enter Firebase configuration in Admin -> Settings to enable sync.">🔌 Local Cache</span>
    );
  }

  if (errorMsg) {
    return (
      <span className="db-status-badge error" title={`Cloud sync error: ${errorMsg}. Falling back to local cache.`}>⚠️ Sync Error</span>
    );
  }

  return (
    <span className="db-status-badge active" title="Synced with Firestore Cloud Database">☁️ Cloud Active</span>
  );
}
