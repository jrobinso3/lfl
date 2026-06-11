// Firebase client-side integration with localStorage fallback.
// Config is read from NEXT_PUBLIC_ env vars (injected at build time),
// OR from localStorage key "lfl-firebase-config" (set via Admin UI at runtime).

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function getConfig(): FirebaseConfig | null {
  // 1. Build-time env vars (available if secrets were set in GitHub Actions)
  const envConfig: FirebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
  if (envConfig.apiKey && envConfig.projectId) return envConfig;

  // 2. Runtime config stored in localStorage (entered via Admin UI)
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("lfl-firebase-config");
      if (raw) {
        const parsed = JSON.parse(raw) as FirebaseConfig;
        if (parsed.apiKey && parsed.projectId) return parsed;
      }
    } catch {}
  }

  return null;
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function getFirebaseDb(): Firestore | null {
  if (typeof window === "undefined") return null;
  if (db) return db;
  const config = getConfig();
  if (!config) return null;
  try {
    app = getApps().length ? getApps()[0] : initializeApp(config);
    db = getFirestore(app);
    return db;
  } catch {
    return null;
  }
}

export function isFirebaseEnabled(): boolean {
  return getConfig() !== null;
}

export function saveFirebaseConfig(config: FirebaseConfig) {
  localStorage.setItem("lfl-firebase-config", JSON.stringify(config));
  // Reset so next call re-initializes
  db = null;
  app = null;
}

export function clearFirebaseConfig() {
  localStorage.removeItem("lfl-firebase-config");
  db = null;
  app = null;
}
