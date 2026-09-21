import { io } from "socket.io-client";
import type { Card } from "../shared/cards";
import { buildDB, CardDB, DeckList } from "../shared/deck";

const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } };

/** "abc.trycloudflare.com/" -> "https://abc.trycloudflare.com"; returns null if it is not a valid http(s) URL. */
export function normalizeServerUrl(input: string): string | null {
  let u = input.trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `${/^(localhost|127\.|192\.168\.)/.test(u) ? "http" : "https"}://${u}`;
  try {
    const url = new URL(u);
    return url.origin;
  } catch {
    return null;
  }
}

// Links like  https://site/?server=https://xxx.trycloudflare.com&room=ABCD  configure the client, then get cleaned up.
const params = new URLSearchParams(location.search);
const fromLink = normalizeServerUrl(params.get("server") ?? "");
if (fromLink) safeSet("bot.server", fromLink);
export const initialRoom = (params.get("room") ?? "").toUpperCase().slice(0, 4);
if (params.has("server") || params.has("room")) history.replaceState(null, "", location.pathname);

/** Priority: saved by the player > VITE_SERVER_URL build default > same origin (dev proxy / single-host deploy). */
export const serverUrl = (): string => safeGet("bot.server") || import.meta.env.VITE_SERVER_URL || "";
export const socket = io(serverUrl() || undefined);

export function saveServerUrl(input: string): string | null {
  if (!input.trim()) { safeSet("bot.server", null); return ""; }
  const u = normalizeServerUrl(input);
  if (u) safeSet("bot.server", u);
  return u;
}
export const inviteLink = (room?: string) => {
  const q = new URLSearchParams();
  if (serverUrl()) q.set("server", serverUrl());
  if (room) q.set("room", room);
  return `${location.origin}/${q.size ? `?${q}` : ""}`;
};
export const emit = (ev: string, data?: unknown): Promise<any> => new Promise((res) => socket.emit(ev, data, res));

let cache: Promise<{ cards: Card[]; db: CardDB }> | null = null;
export function loadCards() {
  cache ??= fetch("/data/cards.json")
    .then((r) => r.json())
    .then((cards: Card[]) => ({ cards, db: buildDB(cards) }));
  return cache;
}

const safe = <T>(f: () => T, fallback: T): T => {
  try { return f(); } catch { return fallback; }
};
export const decksStore = {
  load: (): DeckList[] => safe(() => JSON.parse(localStorage.getItem("bot.decks") ?? "[]"), []),
  save: (d: DeckList[]) => safe(() => localStorage.setItem("bot.decks", JSON.stringify(d)), undefined),
};
export const sessionStore = {
  get: (): { code: string; token: string } | null => safe(() => JSON.parse(localStorage.getItem("bot.session") ?? "null"), null),
  set: (s: { code: string; token: string } | null) => safe(() => (s ? localStorage.setItem("bot.session", JSON.stringify(s)) : localStorage.removeItem("bot.session")), undefined),
};
export const nameStore = {
  get: () => safe(() => localStorage.getItem("bot.name") ?? "", ""),
  set: (n: string) => safe(() => localStorage.setItem("bot.name", n), undefined),
};
