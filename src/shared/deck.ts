import type { Card } from "./cards";

export interface DeckList {
  name: string;
  main: string[]; // card keys (print|rare), one entry per copy
  life: string[];
}

export type CardDB = Record<string, Card>;

export const cardKey = (c: Pick<Card, "print" | "rare">) => `${c.print}|${c.rare}`;

export function buildDB(cards: Card[]): CardDB {
  const db: CardDB = {};
  for (const c of cards) db[cardKey(c)] = c;
  return db;
}

export const isOnly1 = (c: Card) => c.ex === "Only #1";

export function validateDeck(db: CardDB, deck: DeckList): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const main = deck.main.map((k) => db[k]);
  if (main.some((c) => !c)) return { errors: ["มีการ์ดที่ไม่รู้จักใน Deck"], warnings };

  if (main.length !== 50) errors.push(`Main Deck ต้องมี 50 ใบพอดี (ตอนนี้ ${main.length})`);
  if (main.some((c) => c.type === "Life" || c.type === "Token")) errors.push("Main Deck ห้ามมี LIFE Card หรือ Token");

  const byName = new Map<string, { n: number; limit: number }>();
  const limitOf = new Map<string, number>();
  for (const c of main) if (c.customLimit) limitOf.set(c.name, c.customLimit);
  for (const c of main) {
    const e = byName.get(c.name) ?? { n: 0, limit: limitOf.get(c.name) ?? 4 };
    e.n++;
    byName.set(c.name, e);
  }
  for (const [name, e] of byName) if (e.n > e.limit) errors.push(`"${name}" ใส่ได้สูงสุด ${e.limit} ใบ (ตอนนี้ ${e.n})`);

  const only1 = main.filter(isOnly1);
  const allSameBigLimit = byName.size === 1 && [...byName.values()][0].limit >= 50;
  if (!allSameBigLimit) {
    if (only1.length === 0) errors.push('ต้องมีการ์ด "Only #1" 1 ใบ');
    else if (only1.length > 1) errors.push('ใส่การ์ด "Only #1" ได้ 1 ใบเท่านั้น');
  }
  if (main.some((c) => c.ex === "ลำเอียง")) warnings.push("มีการ์ด “ลำเอียง” (ใช้แข่งทั่วไปไม่ได้)");

  const life = deck.life.map((k) => db[k]);
  if (life.some((c) => !c)) errors.push("LIFE Deck มีการ์ดที่ไม่รู้จัก");
  else {
    if (life.length !== 5) errors.push(`LIFE Deck ต้องมี 5 ใบ (ตอนนี้ ${life.length})`);
    if (life.some((c) => c.type !== "Life")) errors.push("LIFE Deck ต้องเป็น LIFE Card เท่านั้น");
    if (new Set(life.map((c) => c.name)).size !== life.length) errors.push("LIFE Card ต้องมีชื่อไม่ซ้ำกัน");
  }
  return { errors, warnings };
}
