// Client-side database layer.
// Stores data in localStorage by default.
// If Firebase is configured, all reads/writes also sync with Firestore.

import { getFirebaseDb, getFirebaseInitError } from "./firebase";
import {
  collection, doc, getDocs, setDoc, updateDoc,
  addDoc, query, orderBy, where, deleteDoc, Timestamp, limit, onSnapshot
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
  rating?: number;
  ratingsCount?: number;
  pages?: number;
}

export interface User {
  id: string; username: string; displayName: string; passwordHash: string; role: "user" | "admin";
}

export interface Comment {
  id: string; userId: string; username: string; displayName?: string;
  type: "comment" | "request"; content: string; createdAt: string;
}

export interface DbSchema {
  books: Book[];
  users: User[];
  comments: Comment[];
}

// ─── Seed Data ───────────────────────────────────────────────────────────────

// Cover URLs use OpenLibrary cover-ID format (verified full-color JPEGs).
// Google Books thumbnail URLs at zoom=1 returned tiny 1KB grayscale stubs for most editions.
const SEED: DbSchema = {
  books: [
    { id: "book-1", isbn: "9780140449136", title: "Crime and Punishment", author: "Fyodor Dostoevsky",
      coverUrl: "https://covers.openlibrary.org/b/id/14935910-L.jpg",
      status: "available", borrowedBy: null, borrowedAt: null,
      addedBy: "system", addedAt: "2026-06-09T20:00:00.000Z",
      rating: 4.29, ratingsCount: 154, pages: 545 },
    { id: "book-2", isbn: "9780451524935", title: "1984", author: "George Orwell",
      coverUrl: "https://covers.openlibrary.org/b/id/12054527-L.jpg",
      status: "available", borrowedBy: null, borrowedAt: null,
      addedBy: "system", addedAt: "2026-06-09T20:00:00.000Z",
      rating: 4.29, ratingsCount: 405, pages: 328 },
    { id: "book-3", isbn: "9780316769174", title: "The Catcher in the Rye", author: "J.D. Salinger",
      coverUrl: "https://covers.openlibrary.org/b/id/15171908-L.jpg",
      status: "available", borrowedBy: null, borrowedAt: null,
      addedBy: "system", addedAt: "2026-06-09T20:00:00.000Z",
      rating: 3.59, ratingsCount: 392, pages: 277 },
  ],
  users: [
    { id: "user-admin", username: "admin", displayName: "Admin",
      passwordHash: "ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f",
      role: "admin" },
  ],
  comments: [
    { id: "comment-1", userId: "user-admin", username: "admin", displayName: "Admin",
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
    if (raw) {
      const parsed = JSON.parse(raw) as DbSchema;
      // Auto-repair book-1 seed metadata mismatch if present
      const book1 = parsed.books?.find(b => b.id === "book-1");
      if (book1 && book1.title === "The Odyssey" && book1.isbn === "9780140449136") {
        book1.title = "Crime and Punishment";
        book1.author = "Fyodor Dostoevsky";
        writeLocal(parsed);
      }
      
      // Auto-migrate seed book cover URLs to verified OpenLibrary cover-ID URLs.
      // The previous Google Books zoom=1 URLs returned tiny 1KB grayscale placeholder images.
      let updated = false;
      const BAD_COVERS: Record<string, string> = {
        "book-1": "https://covers.openlibrary.org/b/id/14935910-L.jpg",
        "book-2": "https://covers.openlibrary.org/b/id/12054527-L.jpg",
        "book-3": "https://covers.openlibrary.org/b/id/15171908-L.jpg",
      };
      const BAD_RATINGS: Record<string, { rating: number; ratingsCount: number }> = {
        "book-1": { rating: 4.29, ratingsCount: 154 },
        "book-2": { rating: 4.29, ratingsCount: 405 },
        "book-3": { rating: 3.59, ratingsCount: 392 },
      };
      for (const [id, goodUrl] of Object.entries(BAD_COVERS)) {
        const b = parsed.books?.find(b => b.id === id);
        if (b) {
          // Fix any old Google Books zoom=1 stub URL or any other bad cover
          const isBadGoogleUrl = b.coverUrl.includes("books.google.com") && b.coverUrl.includes("zoom=1");
          const isMissing = !b.coverUrl;
          if (isBadGoogleUrl || isMissing) {
            b.coverUrl = goodUrl;
            updated = true;
          }
          // Fix inflated/fictional ratingsCount values (seed data had millions)
          const correctRatings = BAD_RATINGS[id];
          if (correctRatings && (b.ratingsCount === undefined || b.ratingsCount > 10000)) {
            b.rating = correctRatings.rating;
            b.ratingsCount = correctRatings.ratingsCount;
            updated = true;
          }
        }
      }
      if (updated) {
        writeLocal(parsed);
      }
      
      return parsed;
    }
  } catch {}
  // First visit — seed and persist
  writeLocal(SEED);
  return SEED;
}

function writeLocal(data: DbSchema) {
  if (typeof window === "undefined") return;
  localStorage.setItem("lfl-db", JSON.stringify(data));
  window.dispatchEvent(new CustomEvent("lfl-local-write"));
}

// ─── Session helpers (localStorage) ──────────────────────────────────────────

export interface SessionUser { id: string; username: string; displayName: string; role: "user" | "admin"; }

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
  const fbDb = getFirebaseDb();
  if (fbDb) {
    try {
      const q = query(collection(fbDb, "books"), where("isbn", "==", isbn), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setLastDbError(null);
        return { id: snap.docs[0].id, ...snap.docs[0].data() } as Book;
      }
      return undefined;
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore getBookByIsbn error, falling back to local:", err);
    }
  }
  const books = readLocal().books;
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
      if (!snap.empty) {
        const d = snap.docs[0];
        const user = { id: d.id, ...d.data() } as User;
        
        // Promote this user to admin if there are currently no admins in Firestore
        const allUsers = await getUsers();
        const adminCount = allUsers.filter(u => u.role === "admin").length;
        if (adminCount === 0 && user.role !== "admin") {
          user.role = "admin";
          await updateDoc(doc(fbDb, "users", user.id), { role: "admin" });
        }
        return user;
      }
      return undefined;
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore getUserByUsername error, falling back to local:", err);
    }
  }
  
  // Local fallback
  const db = readLocal();
  const localUser = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (localUser) {
    const adminCount = db.users.filter(u => u.role === "admin").length;
    if (adminCount === 0 && localUser.role !== "admin") {
      localUser.role = "admin";
      const idx = db.users.findIndex(u => u.id === localUser.id);
      db.users[idx].role = "admin";
      writeLocal(db);
    }
  }
  return localUser;
}

export async function addUser(user: Omit<User, "id">): Promise<User> {
  const fbDb = getFirebaseDb();
  const allUsers = await getUsers();
  const adminCount = allUsers.filter(u => u.role === "admin").length;
  const roleToUse = adminCount === 0 ? "admin" : user.role;
  const userToCreate = { ...user, role: roleToUse };

  if (fbDb) {
    try {
      const ref = await addDoc(collection(fbDb, "users"), userToCreate);
      setLastDbError(null);
      return { id: ref.id, ...userToCreate };
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore addUser error, falling back to local:", err);
    }
  }
  const db = readLocal();
  const nu: User = { ...userToCreate, id: `user-${Date.now()}` };
  db.users.push(nu);
  writeLocal(db);
  return nu;
}

export async function getUsers(): Promise<User[]> {
  const fbDb = getFirebaseDb();
  if (fbDb) {
    try {
      const snap = await getDocs(collection(fbDb, "users"));
      setLastDbError(null);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore getUsers error, falling back to local:", err);
    }
  }
  return readLocal().users;
}

export async function deleteUser(id: string): Promise<void> {
  const fbDb = getFirebaseDb();
  if (fbDb) {
    try {
      await deleteDoc(doc(fbDb, "users", id));
      setLastDbError(null);
      return;
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore deleteUser error, falling back to local:", err);
    }
  }
  const db = readLocal();
  db.users = db.users.filter(u => u.id !== id);
  writeLocal(db);
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User> {
  const fbDb = getFirebaseDb();
  if (fbDb) {
    try {
      await updateDoc(doc(fbDb, "users", id), updates as Record<string, unknown>);
      setLastDbError(null);
      const users = await getUsers();
      return users.find(u => u.id === id)!;
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore updateUser error, falling back to local:", err);
    }
  }
  const db = readLocal();
  const i = db.users.findIndex(u => u.id === id);
  if (i === -1) throw new Error("User not found");
  db.users[i] = { ...db.users[i], ...updates };
  writeLocal(db);
  return db.users[i];
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

// ─── Real-Time Subscriptions ──────────────────────────────────────────────────

export function subscribeBooks(callback: (books: Book[]) => void): () => void {
  const fbDb = getFirebaseDb();
  if (fbDb) {
    try {
      const unsub = onSnapshot(collection(fbDb, "books"), (snap) => {
        const books = snap.docs.map(d => ({ id: d.id, ...d.data() } as Book));
        setLastDbError(null);
        callback(books);
      }, (err) => {
        setLastDbError(err);
        console.error("Firestore subscribeBooks error:", err);
      });
      return unsub;
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore subscribeBooks initial error:", err);
    }
  }

  // Local fallback
  const update = () => {
    callback(readLocal().books);
  };
  update();

  if (typeof window !== "undefined") {
    window.addEventListener("lfl-local-write", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("lfl-local-write", update);
      window.removeEventListener("storage", update);
    };
  }
  return () => {};
}

export function subscribeComments(callback: (comments: Comment[]) => void): () => void {
  const fbDb = getFirebaseDb();
  if (fbDb) {
    try {
      const unsub = onSnapshot(query(collection(fbDb, "comments"), orderBy("createdAt", "desc")), (snap) => {
        const comments = snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment));
        setLastDbError(null);
        callback(comments);
      }, (err) => {
        setLastDbError(err);
        console.error("Firestore subscribeComments error:", err);
      });
      return unsub;
    } catch (err) {
      setLastDbError(err);
      console.error("Firestore subscribeComments initial error:", err);
    }
  }

  // Local fallback
  const update = () => {
    callback([...readLocal().comments]);
  };
  update();

  if (typeof window !== "undefined") {
    window.addEventListener("lfl-local-write", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("lfl-local-write", update);
      window.removeEventListener("storage", update);
    };
  }
  return () => {};
}
