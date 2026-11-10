/**
 * figureLibrary.js - a teacher's personal shelf of reusable figures (a map of
 * Ghana, the water cycle, a labelled cell...). Kept in THIS browser's
 * localStorage, so it costs nothing on the server and never counts against
 * the saved-exam storage cap. A figure is saved once and dropped into any
 * exam, on any question, in two taps.
 */
export const LIBRARY_KEY = "eduformium.figureLibrary.v1";
export const LIBRARY_MAX_ITEMS = 24;
export const LIBRARY_MAX_CHARS = 1_600_000; // stay well inside the ~5 MB browser quota (the school logo lives there too)

const defaultStorage = () => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; } };

export function loadLibrary(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const raw = JSON.parse(storage.getItem(LIBRARY_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter(x => x && typeof x.id === "string" && typeof x.src === "string") : [];
  } catch { return []; }
}

function persist(items, storage) {
  try { storage.setItem(LIBRARY_KEY, JSON.stringify(items)); return true; } catch { return false; }
}

/**
 * Add a figure (newest first). The same picture is never stored twice, and the
 * oldest figures are dropped when the shelf is full.
 * @returns {{ ok: boolean, items: object[], dropped: number, error?: string }}
 */
export function addToLibrary({ name, src }, storage = defaultStorage(), now = Date.now()) {
  if (!storage) return { ok: false, items: [], dropped: 0, error: "Your browser doesn't allow saving figures." };
  if (typeof src !== "string" || !src.startsWith("data:image/")) return { ok: false, items: loadLibrary(storage), dropped: 0, error: "That isn't a valid image." };
  if (src.length > LIBRARY_MAX_CHARS) return { ok: false, items: loadLibrary(storage), dropped: 0, error: "That image is too big for the library." };
  let items = loadLibrary(storage).filter(x => x.src !== src);
  items.unshift({ id: `fig_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`, name: String(name || "Saved figure").trim().slice(0, 40) || "Saved figure", src, savedAt: now });
  let dropped = 0;
  const total = (a) => a.reduce((n, x) => n + x.src.length, 0);
  while (items.length > LIBRARY_MAX_ITEMS || total(items) > LIBRARY_MAX_CHARS) { items.pop(); dropped++; }
  while (!persist(items, storage) && items.length > 1) { items.pop(); dropped++; } // browser quota hit: make room
  if (!persist(items, storage)) return { ok: false, items: loadLibrary(storage), dropped, error: "Couldn't save: your browser storage is full." };
  return { ok: true, items, dropped };
}

export function removeFromLibrary(id, storage = defaultStorage()) {
  if (!storage) return [];
  const items = loadLibrary(storage).filter(x => x.id !== id);
  persist(items, storage);
  return items;
}
