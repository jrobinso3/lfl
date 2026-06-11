// Client-side database layer.
// Stores data in localStorage by default.
// If Firebase is configured, all reads/writes also sync with Firestore.

import { getFirebaseDb } from "./firebase";
import {
  collection, doc, getDocs, setDoc, updateDoc,
  addDoc, query, orderBy, where, deleteDoc, Timestamp
} from "firebase/firestore";

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
    const snap = await getDocs(collection(fbDb, "books"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Book));
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
    const ref = await addDoc(collection(fbDb, "books"), { ...book, addedAt });
    return { id: ref.id, ...book, addedAt };
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
    await updateDoc(doc(fbDb, "books", id), updates as Record<string, unknown>);
    const books = await getBooks();
    return books.find(b => b.id === id)!;
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
  if (fbDb) { await deleteDoc(doc(fbDb, "books", id)); return; }
  const db = readLocal();
  db.books = db.books.filter(b => b.id !== id);
  writeLocal(db);
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const fbDb = getFirebaseDb();
  if (fbDb) {
    const snap = await getDocs(query(collection(fbDb, "users"), where("username", "==", username.toLowerCase())));
    if (snap.empty) return undefined;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as User;
  }
  return readLocal().users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

export async function addUser(user: Omit<User, "id">): Promise<User> {
  const fbDb = getFirebaseDb();
  if (fbDb) {
    const ref = await addDoc(collection(fbDb, "users"), user);
    return { id: ref.id, ...user };
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
    const snap = await getDocs(query(collection(fbDb, "comments"), orderBy("createdAt", "desc")));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment));
  }
  return [...readLocal().comments];
}

export async function addComment(c: Omit<Comment, "id" | "createdAt">): Promise<Comment> {
  const fbDb = getFirebaseDb();
  const createdAt = new Date().toISOString();
  if (fbDb) {
    const ref = await addDoc(collection(fbDb, "comments"), { ...c, createdAt });
    return { id: ref.id, ...c, createdAt };
  }
  const db = readLocal();
  const nc: Comment = { ...c, id: `comment-${Date.now()}`, createdAt };
  db.comments.unshift(nc);
  writeLocal(db);
  return nc;
}

export async function deleteComment(id: string): Promise<void> {
  const fbDb = getFirebaseDb();
  if (fbDb) { await deleteDoc(doc(fbDb, "comments", id)); return; }
  const db = readLocal();
  db.comments = db.comments.filter(c => c.id !== id);
  writeLocal(db);
}
