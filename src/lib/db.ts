// Client-side database layer.
// Stores data in localStorage by default.
// If Firebase is configured, all reads/writes also sync with Firestore.

import { getFirebaseDb, getFirebaseInitError } from "./firebase";
import {
  collection, doc, getDocs, setDoc, updateDoc,
  addDoc, query, orderBy, where, deleteDoc, Timestamp, limit
} from "firebase/firestore";

// Error tracking for live DB connection status
function setLastDbError(err: unknown) {
  const msg = err instanceof Error ? err.message : err ? String(err) : null;
  if (typeof window !== "undefined") {
    const prev = window.sessionStorage.getItem("lfl-last-db-error");
    if (msg) {
      window.sessionStorage.setItem("lfl-last-db-error", msg);
    } else {
      window.sessionStorage.removeItem("lfl-last-db-error");
    }
    if (prev !== msg) {
      window.dispatchEvent(new CustomEvent("lfl-db-status-change"));
    }
  }
}

export function getLastDbError(): string | null {
  if (typeof window === "undefined") return null;
  const initError = getFirebaseInitError();
  if (initError) return `Init Error: ${initError}`;
  return window.sessionStorage.getItem("lfl-last-db-error");
}


// ─── Types ───────────────────────────────────────────────────────────────────

export interface Book {
  id: string; isbn: string; title: string; author: string;
  coverUrl: string; status: "available" | "borrowed";
  borrowedBy: string | null; borrowedAt: string | null;
  addedBy: string; addedAt: string;
}

export interface User {
  id: string; username: string; passwordHash: string; role: "user" | "admin";
}

export interface Comment {
  id: string; userId: string; username: string;
  type: "comment" | "request"; content: string; createdAt: string;
}

export interface DbSchema {
  books: Book[];
  users: User[];
  comments: Comment[];
}

// ─── Seed Data ───────────────────────────────────────────────────────────────

const SEED: DbSchema = {
  books: [
    { id: "book-1", isbn: "9780140449136", title: "The Odyssey", author: "Homer",
      coverUrl: "https://covers.openlibrary.org/b/isbn/9780140449136-L.jpg",
      status: "available", borrowedBy: null, borrowedAt: null,
      addedBy: "system", addedAt: "2026-06-09T20:00:00.000Z" },
    { id: "book-2", isbn: "9780451524935", title: "1984", author: "George Orwell",
      coverUrl: "https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg",
      status: "available", borrowedBy: null, borrowedAt: null,
      addedBy: "system", addedAt: "2026-06-09T20:00:00.000Z" },
    { id: "book-3", isbn: "9780316769174", title: "The Catcher in the Rye", author: "J.D. Salinger",
      coverUrl: "https://covers.openlibrary.org/b/isbn/9780316769174-L.jpg",
      status: "available", borrowedBy: null, borrowedAt: null,
      addedBy: "system", addedAt: "2026-06-09T20:00:00.000Z" },
  ],
  users: [
    { id: "user-admin", username: "admin",
      passwordHash: "ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f",
      role: "admin" },
  ],
  comments: [
    { id: "comment-1", userId: "user-admin", username: "admin",
      type: "comment",
      content: "Welcome to the Robinson ReposiStory Little Free Library! Feel free to browse, take, or leave books.",
      createdAt: "2026-06-09T21:00:00.000Z" },
  ],
};

// ─── localStorage helpers ─────────────────────────────────────────────────────

function readLocal(): DbSchema {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = localStorage.getItem("lfl-db");
    if (raw) return JSON.parse(raw) as DbSchema;
  } catch {}
  // First visit — seed and persist
  writeLocal(SEED);
  return SEED;
}

function writeLocal(data: DbSchema) {
  if (typeof window === "undefined") return;
  localStorage.setItem("lfl-db", JSON.stringify(data));
}

// ─── Session helpers (localStorage) ──────────────────────────────────────────

export interface SessionUser { id: string; username: string; role: "user" | "admin"; }

export function hashPassword(s: string): string {
  // Simple deterministic hash; mirrors the SHA-256 used server-side for the seed admin account.
  // For new registrations we store a djb2 hex string — good enough for a local community toy.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function getCurrentUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("lfl-session");
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch { return null; }
}

export function setCurrentUser(u: SessionUser | null) {
  if (u) sessionStorage.setItem("lfl-session", JSON.stringify(u));
  else sessionStorage.removeItem("lfl-session");
}

// ─── Books ────────────────────────────────────────────────────────────────────

export async function getBooks(): Promise<Book[]> {
  const fbDb = getFirebaseDb();
  if (fbDb) {
    try {
      const snap = await getDocs(collection(fbDb, "books"));
      setLastDbError(null);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Book));
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore getBooks error, falling back to local:", err);
    }
  }
  return readLocal().books;
}

export async function getBookByIsbn(isbn: string): Promise<Book | undefined> {
  const books = await getBooks();
  return books.find(b => b.isbn === isbn);
}

export async function addBook(book: Omit<Book, "id" | "addedAt">): Promise<Book> {
  const fbDb = getFirebaseDb();
  const addedAt = new Date().toISOString();
  if (fbDb) {
    try {
      const ref = await addDoc(collection(fbDb, "books"), { ...book, addedAt });
      setLastDbError(null);
      return { id: ref.id, ...book, addedAt };
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore addBook error, falling back to local:", err);
    }
  }
  const db = readLocal();
  const nb: Book = { ...book, id: `book-${Date.now()}`, addedAt };
  db.books.push(nb);
  writeLocal(db);
  return nb;
}

export async function updateBook(id: string, updates: Partial<Book>): Promise<Book> {
  const fbDb = getFirebaseDb();
  if (fbDb) {
    try {
      await updateDoc(doc(fbDb, "books", id), updates as Record<string, unknown>);
      setLastDbError(null);
      const books = await getBooks();
      return books.find(b => b.id === id)!;
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore updateBook error, falling back to local:", err);
    }
  }
  const db = readLocal();
  const i = db.books.findIndex(b => b.id === id);
  if (i === -1) throw new Error("Book not found");
  db.books[i] = { ...db.books[i], ...updates };
  writeLocal(db);
  return db.books[i];
}

export async function deleteBook(id: string): Promise<void> {
  const fbDb = getFirebaseDb();
  if (fbDb) {
    try {
      await deleteDoc(doc(fbDb, "books", id));
      setLastDbError(null);
      return;
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore deleteBook error, falling back to local:", err);
    }
  }
  const db = readLocal();
  db.books = db.books.filter(b => b.id !== id);
  writeLocal(db);
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const fbDb = getFirebaseDb();
  if (fbDb) {
    try {
      const snap = await getDocs(query(collection(fbDb, "users"), where("username", "==", username.toLowerCase())));
      setLastDbError(null);
      if (snap.empty) return undefined;
      const d = snap.docs[0];
      return { id: d.id, ...d.data() } as User;
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore getUserByUsername error, falling back to local:", err);
    }
  }
  return readLocal().users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

export async function addUser(user: Omit<User, "id">): Promise<User> {
  const fbDb = getFirebaseDb();
  if (fbDb) {
    try {
      const ref = await addDoc(collection(fbDb, "users"), user);
      setLastDbError(null);
      return { id: ref.id, ...user };
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore addUser error, falling back to local:", err);
    }
  }
  const db = readLocal();
  const nu: User = { ...user, id: `user-${Date.now()}` };
  db.users.push(nu);
  writeLocal(db);
  return nu;
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function getComments(): Promise<Comment[]> {
  const fbDb = getFirebaseDb();
  if (fbDb) {
    try {
      const snap = await getDocs(query(collection(fbDb, "comments"), orderBy("createdAt", "desc")));
      setLastDbError(null);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment));
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore getComments error, falling back to local:", err);
    }
  }
  return [...readLocal().comments];
}

export async function addComment(c: Omit<Comment, "id" | "createdAt">): Promise<Comment> {
  const fbDb = getFirebaseDb();
  const createdAt = new Date().toISOString();
  if (fbDb) {
    try {
      const ref = await addDoc(collection(fbDb, "comments"), { ...c, createdAt });
      setLastDbError(null);
      return { id: ref.id, ...c, createdAt };
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore addComment error, falling back to local:", err);
    }
  }
  const db = readLocal();
  const nc: Comment = { ...c, id: `comment-${Date.now()}`, createdAt };
  db.comments.unshift(nc);
  writeLocal(db);
  return nc;
}

export async function deleteComment(id: string): Promise<void> {
  const fbDb = getFirebaseDb();
  if (fbDb) {
    try {
      await deleteDoc(doc(fbDb, "comments", id));
      setLastDbError(null);
      return;
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore deleteComment error, falling back to local:", err);
    }
  }
  const db = readLocal();
  db.comments = db.comments.filter(c => c.id !== id);
  writeLocal(db);
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export interface FirebaseTestResult {
  configPresent: boolean;
  initialized: boolean;
  readSuccess: boolean;
  writeSuccess: boolean;
  error?: string;
  projectId?: string;
}

export async function testFirebaseConnection(): Promise<FirebaseTestResult> {
  const result: FirebaseTestResult = {
    configPresent: false,
    initialized: false,
    readSuccess: false,
    writeSuccess: false,
  };

  const fbDb = getFirebaseDb();
  if (!fbDb) {
    const initErr = getFirebaseInitError();
    if (initErr) {
      result.configPresent = true;
      result.error = `Initialization failed: ${initErr}`;
      return result;
    }
    result.error = "No Firebase configuration found. Please enter credentials in Settings.";
    return result;
  }

  result.configPresent = true;
  result.initialized = true;
  result.projectId = fbDb.app.options.projectId ?? "unknown";

  try {
    // Test Read: Query 1 document from the books collection
    const testQuery = query(collection(fbDb, "books"), limit(1));
    await getDocs(testQuery);
    result.readSuccess = true;
  } catch (err) {
    result.error = `Read test failed: ${err instanceof Error ? err.message : String(err)}`;
    return result;
  }

  try {
    // Test Write: Add and then delete a document in the "_connection_test" collection
    const tempDocRef = doc(collection(fbDb, "_connection_test"), "temp-write-test");
    await setDoc(tempDocRef, { testedAt: new Date().toISOString(), test: true });
    result.writeSuccess = true;
    
    // Clean up
    await deleteDoc(tempDocRef);
  } catch (err) {
    result.error = `Write test failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  return result;
}
