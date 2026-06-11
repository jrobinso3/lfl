"use client";
import { useEffect, useState } from "react";
import { isFirebaseEnabled } from "@/lib/firebase";

export default function DbStatus() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isFirebaseEnabled());
  }, []);

  return enabled ? (
    <span className="db-status-badge active" title="Synced with Firestore Cloud Database">☁️ Cloud Active</span>
  ) : (
    <span className="db-status-badge offline" title="Saved locally in browser cache only">🔌 Local Cache</span>
  );
}
