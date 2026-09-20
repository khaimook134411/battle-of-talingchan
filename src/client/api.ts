import { io } from "socket.io-client";
import type { Card } from "../shared/cards";
import { buildDB, CardDB, DeckList } from "../shared/deck";

// Empty in dev/same-origin deploys; set VITE_SERVER_URL when the frontend is hosted separately (e.g. Vercel).
export const socket = io(import.meta.env.VITE_SERVER_URL || undefined);
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
