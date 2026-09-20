import type { Card } from "./cards";
import type { CardDB, DeckList } from "./deck";

export const MAX_HAND_END = 7;
export const MAX_AVATARS = 4;
export const MAX_AVATAR_TOKEN = 6;
export const MAX_CONSTRUCT = 3; // rulebook v3.2 (playmat prints 4)

export type Seat = 0 | 1;
export type Phase = "mulligan" | "main" | "battle" | "end" | "over";
export type Dest = "hand" | "deckTop" | "deckBottom" | "avatar" | "magic" | "construct" | "hell" | "dark" | "land";

export interface Slot {
  id: string;
  tapped: boolean;
  mod: number; // manual POWER modifier (+/-)
  equip: string[]; // Modification Magic attached
}
export interface LifeCard {
  id: string;
  up: boolean;
}
export interface PlayerState {
  deck: string[];
  hand: string[];
  avatar: Slot[];
  magic: string[];
  construct: Slot[];
  hell: string[];
  dark: string[];
  life: LifeCard[];
  mulliganDone: boolean;
}
export type Target = { kind: "avatar" | "construct"; id: string } | { kind: "life" };
export interface Pending {
  attacker: string;
  target: Target;
  by: Seat;
}
export interface Game {
  cards: Record<string, { key: string; owner: Seat }>;
  players: [PlayerState, PlayerState];
  land: { id: string; owner: Seat } | null;
  first: Seat;
  turn: Seat;
  turnNo: number;
  phase: Phase;
  pending: Pending | null;
  winner: Seat | null;
  log: string[];
}

export type Action =
  | { t: "mulligan"; ids: string[] }
  | { t: "next" }
  | { t: "summon"; id: string; pay: string[] }
  | { t: "magic"; id: string; target?: string }
  | { t: "attack"; id: string; target: Target }
  | { t: "respond"; shield?: string }
  | { t: "move"; id: string; to: Dest; side?: Seat }
  | { t: "tap"; id: string }
  | { t: "mod"; id: string; d: number }
  | { t: "draw"; n?: number }
  | { t: "shuffle" }
  | { t: "flip"; id: string }
  | { t: "dice" }
  | { t: "concede" };

let DB: CardDB = {};
export const setCardDb = (db: CardDB) => (DB = db);
export const info = (g: Game, id: string): Card => DB[g.cards[id].key];
const name = (g: Game, id: string) => info(g, id).name;
const other = (s: Seat): Seat => (s === 0 ? 1 : 0);

export function shuffle<T>(a: T[], rnd: () => number = Math.random): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const emptyPlayer = (): PlayerState => ({ deck: [], hand: [], avatar: [], magic: [], construct: [], hell: [], dark: [], life: [], mulliganDone: false });

export function createGame(decks: [DeckList, DeckList], first: Seat = Math.random() < 0.5 ? 0 : 1, rnd = Math.random): Game {
  const g: Game = { cards: {}, players: [emptyPlayer(), emptyPlayer()], land: null, first, turn: first, turnNo: 0, phase: "mulligan", pending: null, winner: null, log: [] };
  ([0, 1] as Seat[]).forEach((s) => {
    let n = 0;
    const mk = (key: string) => {
      const id = `${s}:${n++}`;
      g.cards[id] = { key, owner: s };
      return id;
    };
    const p = g.players[s];
    p.deck = shuffle(decks[s].main.map(mk), rnd);
    p.life = shuffle(decks[s].life.map(mk), rnd).map((id) => ({ id, up: false }));
    p.hand = p.deck.splice(0, 5);
  });
  log(g, `เริ่มเกม — ผู้เล่น ${first + 1} เล่นก่อน (เลือกเปลี่ยนการ์ดบนมือได้)`);
  return g;
}

function log(g: Game, msg: string) {
  g.log.push(msg);
  if (g.log.length > 300) g.log.splice(0, g.log.length - 300);
}
const who = (s: Seat) => `P${s + 1}`;

// ---------- locating / moving cards ----------
type Loc =
  | { zone: "hand" | "deck" | "magic" | "hell" | "dark"; seat: Seat }
  | { zone: "avatar" | "construct"; seat: Seat; slot: Slot }
  | { zone: "equip"; seat: Seat; slot: Slot; zoneOf: "avatar" | "construct" }
  | { zone: "land"; seat: Seat }
  | { zone: "life"; seat: Seat };

export function locate(g: Game, id: string): Loc | null {
  for (const s of [0, 1] as Seat[]) {
    const p = g.players[s];
    for (const z of ["hand", "deck", "magic", "hell", "dark"] as const) if (p[z].includes(id)) return { zone: z, seat: s };
    for (const z of ["avatar", "construct"] as const) {
      for (const slot of p[z]) {
        if (slot.id === id) return { zone: z, seat: s, slot };
        if (slot.equip.includes(id)) return { zone: "equip", seat: s, slot, zoneOf: z };
      }
    }
    if (p.life.some((l) => l.id === id)) return { zone: "life", seat: s };
  }
  if (g.land?.id === id) return { zone: "land", seat: g.land.owner };
  return null;
}

function detach(g: Game, id: string): string[] {
  // removes id from wherever it is; returns ids of attached cards that must go to hell
  const loc = locate(g, id);
  if (!loc) return [];
  const p = g.players[loc.seat];
  switch (loc.zone) {
    case "hand": case "deck": case "magic": case "hell": case "dark":
      p[loc.zone].splice(p[loc.zone].indexOf(id), 1);
      return [];
    case "avatar": case "construct":
      p[loc.zone].splice(p[loc.zone].indexOf(loc.slot), 1);
      return loc.slot.equip;
    case "equip":
      loc.slot.equip.splice(loc.slot.equip.indexOf(id), 1);
      return [];
    case "land":
      g.land = null;
      return [];
    case "life":
      p.life.splice(p.life.findIndex((l) => l.id === id), 1);
      return [];
  }
}

function place(g: Game, id: string, to: Dest, side: Seat) {
  const p = g.players[side];
  const owner = g.cards[id].owner;
  switch (to) {
    case "hand": g.players[owner].hand.push(id); break;
    case "deckTop": g.players[owner].deck.unshift(id); break;
    case "deckBottom": g.players[owner].deck.push(id); break;
    case "hell": g.players[owner].hell.push(id); break;
    case "dark": g.players[owner].dark.push(id); break;
    case "magic": p.magic.push(id); break;
    case "avatar": p.avatar.push({ id, tapped: false, mod: 0, equip: [] }); break;
    case "construct": p.construct.push({ id, tapped: false, mod: 0, equip: [] }); break;
    case "land": g.land = { id, owner: side }; break;
  }
}

/** Move a card (and send its attachments to hell). Old Land goes to its owner's hell. */
function moveCard(g: Game, id: string, to: Dest, side: Seat) {
  const attached = detach(g, id);
  if (to === "land" && g.land) {
    const old = g.land.id;
    g.land = null;
    place(g, old, "hell", g.cards[old].owner);
  }
  place(g, id, to, side);
  for (const a of attached) place(g, a, "hell", g.cards[a].owner);
}

const destroy = (g: Game, id: string) => moveCard(g, id, "hell", g.cards[id].owner);

// ---------- power / payment ----------
export function powerOf(g: Game, slot: Slot): number {
  return Math.max(0, (info(g, slot.id).power ?? 0) + slot.mod);
}
const hasKw = (g: Game, id: string, kw: string) => info(g, id).mainEffect.includes(kw);

export function payError(g: Game, seat: Seat, targetId: string, pay: string[]): string | null {
  const t = info(g, targetId);
  const cost = t.cost ?? 0;
  if (cost === 0) return pay.length ? "การ์ดใบนี้ Cost 0 ไม่ต้องจ่าย Gem" : null;
  const hand = g.players[seat].hand;
  if (new Set(pay).size !== pay.length) return "เลือกการ์ดซ้ำ";
  let sum = 0;
  let min = Infinity;
  for (const pid of pay) {
    if (pid === targetId || !hand.includes(pid)) return "การ์ดที่ใช้จ่ายต้องอยู่บนมือ";
    const c = info(g, pid);
    const gem = c.gem ?? 0;
    if (gem <= 0) return `"${c.name}" มี Gem 0 ใช้จ่ายไม่ได้`;
    if (c.gemColor && c.gemColor !== t.color) return `Gem สี${c.gemColor}ของ "${c.name}" ใช้ได้เฉพาะการ์ดสี${c.gemColor}`;
    sum += gem;
    min = Math.min(min, gem);
  }
  if (sum < cost) return `Gem ไม่พอ (${sum}/${cost})`;
  if (sum - min >= cost) return "จ่ายเกินจำเป็น (มีการ์ดที่ไม่ต้องใช้)";
  return null;
}

// ---------- turn flow ----------
function draw(g: Game, seat: Seat, n: number) {
  const p = g.players[seat];
  for (let i = 0; i < n; i++) {
    const id = p.deck.shift();
    if (id) p.hand.push(id);
  }
}

function startTurn(g: Game) {
  const s = g.turn;
  const p = g.players[s];
  g.turnNo++;
  for (const a of [...p.avatar, ...p.construct]) a.tapped = false;
  const n = g.turnNo === 1 ? 2 : p.hand.length < 3 ? 3 - p.hand.length : 1;
  draw(g, s, n);
  g.phase = "main";
  log(g, `— เทิร์นที่ ${g.turnNo}: ${who(s)} จั่ว ${n} ใบ (Main Phase) —`);
}

function checkEnd(g: Game) {
  if (g.phase === "over" || g.phase === "mulligan") return;
  for (const s of [0, 1] as Seat[]) {
    if (g.players[s].deck.length === 0) return win(g, other(s), `${who(s)} Deck หมด`);
  }
}
function win(g: Game, s: Seat, why: string) {
  g.winner = s;
  g.phase = "over";
  g.pending = null;
  log(g, `🏆 ${who(s)} ชนะ — ${why}`);
}

// ---------- battle ----------
function resolveBattle(g: Game) {
  const pd = g.pending!;
  g.pending = null;
  const atkSeat = pd.by;
  const defSeat = other(atkSeat);
  const atk = g.players[atkSeat].avatar.find((a) => a.id === pd.attacker);
  if (!atk) return log(g, "ผู้โจมตีออกจากสนามแล้ว การโจมตีสิ้นสุด");
  const ap = powerOf(g, atk);
  const D = g.players[defSeat];
  const an = name(g, atk.id);

  if (pd.target.kind === "life") {
    if (ap === 0) return log(g, `${an} POWER 0 โจมตี LIFE — ไม่ทำความเสียหาย`);
    const idx = D.life.findIndex((l) => !l.up);
    if (idx < 0) return win(g, atkSeat, `${who(defSeat)} ถูกโจมตี LIFE ขณะอยู่ในสถานะสาหัส`);
    D.life[idx].up = true;
    const lc = info(g, D.life[idx].id);
    log(g, `💥 ${an} โจมตี LIFE ของ ${who(defSeat)} — หงาย "${lc.name}": ${lc.mainEffect}`);
    if (D.life.every((l) => l.up)) log(g, `⚠️ ${who(defSeat)} เข้าสู่สถานะ “สาหัส”`);
    return;
  }
  const tid = pd.target.id;
  if (pd.target.kind === "construct") {
    const c = D.construct.find((x) => x.id === tid);
    if (!c) return log(g, "เป้าหมายหายไป การโจมตีสิ้นสุด");
    if (ap > powerOf(g, c)) {
      log(g, `${an} (${ap}) ทำลาย Construct "${name(g, tid)}"`);
      destroy(g, tid);
    } else log(g, `${an} (${ap}) โจมตี Construct "${name(g, tid)}" (${powerOf(g, c)}) — ไม่มีอะไรเกิดขึ้น`);
    return;
  }
  const d = D.avatar.find((x) => x.id === tid);
  if (!d) return log(g, "เป้าหมายหายไป การโจมตีสิ้นสุด");
  const dp = powerOf(g, d);
  const dn = name(g, d.id);
  log(g, `⚔️ ${an} (${ap}) ต่อสู้ ${dn} (${dp})`);
  let killA = false, killD = false;
  if (ap > dp) killD = true;
  else if (ap < dp) killA = true;
  else if (ap > 0) {
    const a1 = hasKw(g, atk.id, "ลูกฮึด"), d1 = hasKw(g, d.id, "ลูกฮึด");
    if (a1 && !d1) killD = true;
    else if (d1 && !a1) killA = true;
    else killA = killD = true;
  } else return log(g, "POWER 0 เท่ากัน — ไม่มีอะไรเกิดขึ้น");
  const ids: string[] = [];
  if (killA) ids.push(atk.id);
  if (killD) ids.push(d.id);
  for (const id of ids) {
    log(g, `💀 "${name(g, id)}" ถูกทำลาย${hasKw(g, id, "คำสั่งเสีย") ? " (มีคำสั่งเสีย — ทำตามข้อความการ์ดเอง)" : ""}`);
    destroy(g, id);
  }
}

// ---------- action dispatcher ----------
/** Returns an error message (Thai) or null on success. Mutates g. */
export function applyAction(g: Game, seat: Seat, a: Action): string | null {
  if (g.phase === "over") return "เกมจบแล้ว";
  const err = run(g, seat, a);
  if (!err) checkEnd(g);
  return err;
}

function run(g: Game, seat: Seat, a: Action): string | null {
  const me = g.players[seat];
  const myTurn = g.turn === seat;

  if (a.t === "concede") {
    win(g, other(seat), `${who(seat)} ยอมแพ้`);
    return null;
  }

  if (g.phase === "mulligan") {
    if (a.t !== "mulligan") return "รอเปลี่ยนการ์ดเริ่มต้นให้เสร็จก่อน";
    if (me.mulliganDone) return "เลือกไปแล้ว";
    const ids = [...new Set(a.ids)].filter((id) => me.hand.includes(id));
    for (const id of ids) {
      me.hand.splice(me.hand.indexOf(id), 1);
      me.deck.push(id);
    }
    draw(g, seat, ids.length);
    shuffle(me.deck);
    me.mulliganDone = true;
    log(g, `${who(seat)} เปลี่ยนการ์ด ${ids.length} ใบ`);
    if (g.players[0].mulliganDone && g.players[1].mulliganDone) {
      g.turn = g.first;
      startTurn(g);
    }
    return null;
  }

  switch (a.t) {
    case "mulligan": return "ไม่ใช่ช่วงเปลี่ยนการ์ด";

    case "next": {
      if (!myTurn) return "ไม่ใช่เทิร์นของคุณ";
      if (g.pending) return "มีการโจมตีค้างอยู่";
      if (g.phase === "main") {
        g.phase = g.turnNo === 1 ? "end" : "battle"; // first player skips Battle on turn 1
        log(g, `→ ${g.phase === "end" ? "End" : "Battle"} Phase`);
      } else if (g.phase === "battle") {
        g.phase = "end";
        log(g, "→ End Phase");
      } else {
        if (me.hand.length > MAX_HAND_END) return `ทิ้งการ์ดให้เหลือ ${MAX_HAND_END} ใบก่อนจบเทิร์น (มี ${me.hand.length})`;
        for (const s of [0, 1] as Seat[]) for (const id of [...g.players[s].magic]) if (info(g, id).subtype !== "Land") destroy(g, id);
        g.turn = other(seat);
        startTurn(g);
      }
      return null;
    }

    case "summon": {
      if (!myTurn || g.phase !== "main") return "อัญเชิญได้ใน Main Phase ของคุณ";
      if (g.pending) return "มีการโจมตีค้างอยู่";
      if (!me.hand.includes(a.id)) return "การ์ดต้องอยู่บนมือ";
      const c = info(g, a.id);
      if (c.type !== "Avatar" && c.type !== "Construct") return "อัญเชิญได้เฉพาะ Avatar / Construct";
      if (c.type === "Avatar") {
        const av = me.avatar.filter((s) => info(g, s.id).type === "Avatar").length;
        if (av >= MAX_AVATARS || me.avatar.length >= MAX_AVATAR_TOKEN) return "Avatar Zone เต็ม";
      } else {
        if (me.construct.length >= MAX_CONSTRUCT) return "Construct Zone เต็ม";
        if (me.construct.some((s) => name(g, s.id) === c.name)) return "Construct ชื่อซ้ำกันในสนามไม่ได้";
      }
      const e = payError(g, seat, a.id, a.pay);
      if (e) return e;
      for (const pid of a.pay) destroy(g, pid);
      moveCard(g, a.id, c.type === "Avatar" ? "avatar" : "construct", seat);
      log(g, `${who(seat)} ${c.type === "Avatar" ? "อัญเชิญ" : "ก่อสร้าง"} "${c.name}"${a.pay.length ? ` (ทิ้ง ${a.pay.length} ใบ)` : ""}${c.mainEffect.includes("จุติ") ? " — มีจุติ ทำตามข้อความการ์ด" : ""}`);
      return null;
    }

    case "magic": {
      if (!me.hand.includes(a.id)) return "การ์ดต้องอยู่บนมือ";
      const c = info(g, a.id);
      if (c.type !== "Magic") return "ไม่ใช่ Magic";
      const react = c.subtype === "React";
      if (!react && (!myTurn || g.phase !== "main")) return "Magic ชนิดนี้ใช้ได้ใน Main Phase ของคุณเท่านั้น";
      if (!react && g.pending) return "มีการโจมตีค้างอยู่ (ใช้ได้เฉพาะ React)";
      if (c.subtype === "Modification") {
        const t = a.target && locate(g, a.target);
        if (!t || t.zone !== "avatar") return "เลือก Avatar บน Avatar Zone เป็นเป้าหมายสวมใส่";
        detach(g, a.id);
        t.slot.equip.push(a.id);
        log(g, `${who(seat)} สวมใส่ "${c.name}" ให้ "${name(g, t.slot.id)}" — ${c.mainEffect}`);
        return null;
      }
      moveCard(g, a.id, c.subtype === "Land" ? "land" : "magic", seat);
      log(g, `${who(seat)} ใช้ ${c.subtype ?? "Magic"} "${c.name}" — ${c.mainEffect}`);
      return null;
    }

    case "attack": {
      if (!myTurn || g.phase !== "battle") return "โจมตีได้ใน Battle Phase ของคุณ";
      if (g.pending) return "มีการโจมตีค้างอยู่";
      const at = me.avatar.find((s) => s.id === a.id);
      if (!at) return "เลือก Avatar บน Avatar Zone";
      if (at.tapped) return "Avatar นอนอยู่ โจมตีไม่ได้";
      const opp = g.players[other(seat)];
      if (a.target.kind === "avatar") {
        if (!opp.avatar.some((s) => s.id === (a.target as { id: string }).id)) return "ไม่พบเป้าหมาย";
      } else if (a.target.kind === "construct") {
        if (!opp.construct.some((s) => s.id === (a.target as { id: string }).id)) return "ไม่พบเป้าหมาย";
      } else if (opp.avatar.length > 0 && !hasKw(g, at.id, "เตะไข่")) return "โจมตี LIFE ได้เมื่อฝ่ายตรงข้ามไม่มี Avatar (หรือมีเตะไข่)";
      at.tapped = true;
      g.pending = { attacker: at.id, target: a.target, by: seat };
      const tn = a.target.kind === "life" ? "LIFE" : `"${name(g, a.target.id)}"`;
      log(g, `🗡️ ${who(seat)}: "${name(g, at.id)}" โจมตี ${tn} — รอ ${who(other(seat))} ตอบสนอง`);
      return null;
    }

    case "respond": {
      const pd = g.pending;
      if (!pd) return "ไม่มีการโจมตี";
      if (seat === pd.by) return "รอฝ่ายตรงข้ามตอบสนอง";
      if (a.shield) {
        const sh = me.avatar.find((s) => s.id === a.shield);
        if (!sh || sh.tapped || !hasKw(g, sh.id, "โล่มนุษย์")) return "ต้องเลือก Avatar ตื่นที่มีโล่มนุษย์";
        sh.tapped = true;
        pd.target = { kind: "avatar", id: sh.id };
        log(g, `🛡️ ${who(seat)} ใช้โล่มนุษย์ "${name(g, sh.id)}" เปลี่ยนเป้าหมาย`);
        return null;
      }
      resolveBattle(g);
      return null;
    }

    // ---- manual controls (trust-based; usable by both players) ----
    case "move": {
      const loc = locate(g, a.id);
      if (!loc) return "ไม่พบการ์ด";
      if (loc.zone === "life") return "ย้าย LIFE Card ไม่ได้";
      const side = a.side ?? (["avatar", "magic", "construct", "land"].includes(a.to) ? (loc.zone === "hand" ? seat : loc.seat) : g.cards[a.id].owner);
      moveCard(g, a.id, a.to, side);
      log(g, `${who(seat)} ย้าย "${name(g, a.id)}" (${loc.zone} → ${a.to})`);
      return null;
    }
    case "tap": {
      const loc = locate(g, a.id);
      if (!loc || (loc.zone !== "avatar" && loc.zone !== "construct")) return "ไม่ใช่ Avatar/Construct";
      loc.slot.tapped = !loc.slot.tapped;
      log(g, `${who(seat)} เปลี่ยน "${name(g, a.id)}" เป็น${loc.slot.tapped ? "นอน" : "ตื่น"}`);
      return null;
    }
    case "mod": {
      const loc = locate(g, a.id);
      if (!loc || (loc.zone !== "avatar" && loc.zone !== "construct")) return "ไม่ใช่ Avatar/Construct";
      loc.slot.mod += a.d;
      log(g, `${who(seat)} "${name(g, a.id)}" POWER ${a.d > 0 ? "+" : ""}${a.d} (รวม ${powerOf(g, loc.slot)})`);
      return null;
    }
    case "draw": {
      const n = Math.max(1, Math.min(a.n ?? 1, 10));
      draw(g, seat, n);
      log(g, `${who(seat)} จั่ว ${n} ใบ`);
      return null;
    }
    case "shuffle":
      shuffle(me.deck);
      log(g, `${who(seat)} สับ Deck`);
      return null;
    case "flip": {
      const l = g.players.flatMap((p) => p.life).find((x) => x.id === a.id);
      if (!l) return "ไม่พบ LIFE Card";
      l.up = !l.up;
      log(g, `${who(seat)} ${l.up ? "หงาย" : "คว่ำ"} LIFE "${name(g, l.id)}" ด้วยมือ${l.up ? ` — ${info(g, l.id).mainEffect}` : ""}`);
      return null;
    }
    case "dice":
      log(g, `🎲 ${who(seat)} ทอยลูกเต๋าได้ ${1 + Math.floor(Math.random() * 6)}`);
      return null;
  }
}

// ---------- per-player view (hides private information) ----------
export interface View {
  me: Seat;
  turn: Seat;
  turnNo: number;
  phase: Phase;
  first: Seat;
  winner: Seat | null;
  pending: Pending | null;
  land: { id: string; owner: Seat } | null;
  cards: Record<string, string>; // id -> card key (only visible ones)
  players: [PView, PView];
  log: string[];
}
export interface PView extends Omit<PlayerState, "deck" | "hand" | "life"> {
  hand: string[]; // ids (own hand only)
  handCount: number;
  deckCount: number;
  deckList: string[]; // own deck ids sorted by card key (for searching)
  life: { id: string | null; up: boolean }[];
}

export function viewFor(g: Game, seat: Seat): View {
  const cards: Record<string, string> = {};
  const show = (id: string) => (cards[id] = g.cards[id].key);
  const players = ([0, 1] as Seat[]).map((s) => {
    const p = g.players[s];
    const mine = s === seat;
    p.avatar.forEach((x) => { show(x.id); x.equip.forEach(show); });
    p.construct.forEach((x) => { show(x.id); x.equip.forEach(show); });
    [...p.magic, ...p.hell, ...p.dark].forEach(show);
    if (mine) [...p.hand, ...p.deck].forEach(show);
    p.life.forEach((l) => l.up && show(l.id));
    return {
      ...p,
      hand: mine ? p.hand : [],
      handCount: p.hand.length,
      deckCount: p.deck.length,
      deckList: mine ? [...p.deck].sort((x, y) => g.cards[x].key.localeCompare(g.cards[y].key)) : [],
      life: p.life.map((l) => ({ id: l.up ? l.id : null, up: l.up })),
    } as PView;
  }) as [PView, PView];
  for (const p of players) delete (p as Partial<PlayerState>).deck;
  if (g.land) show(g.land.id);
  return { me: seat, turn: g.turn, turnNo: g.turnNo, phase: g.phase, first: g.first, winner: g.winner, pending: g.pending, land: g.land, cards, players, log: g.log.slice(-80) };
}
