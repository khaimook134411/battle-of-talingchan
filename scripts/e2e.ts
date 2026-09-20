import { io } from "socket.io-client";
import { readFileSync } from "node:fs";
import { buildDB, cardKey } from "../src/shared/deck";
const cards = JSON.parse(readFileSync("public/data/cards.json", "utf8"));
const db = buildDB(cards);
const only = cards.find((c: any) => c.ex === "Only #1" && c.type === "Avatar" && c.cost === 0) ?? cards.find((c: any) => c.ex === "Only #1" && c.type === "Avatar");
const pool = cards.filter((c: any) => c.type === "Avatar" && !c.ex?.toString().match(/Only|ลำเอียง/) && !c.customLimit && (c.cost ?? 9) <= 2 && (c.power ?? 0) > 0);
const names = [...new Set(pool.map((c: any) => c.name))] as string[];
const main = [cardKey(only)];
for (let i = 0; main.length < 50; i++) main.push(cardKey(pool.find((c: any) => c.name === names[Math.floor(i / 4)])));
const life = cards.filter((c: any) => c.type === "Life").slice(0, 5).map(cardKey);
const deck = { name: "e2e", main, life };
const mkc = () => { const s = io("http://localhost:3001"); return { s, emit: (e: string, d?: any) => new Promise<any>((r) => s.emit(e, d, r)), view: null as any, room: null as any }; };
const A = mkc(), B = mkc();
A.s.on("state", (v) => (A.view = v)); B.s.on("state", (v) => (B.view = v));
A.s.on("room", (v) => (A.room = v)); B.s.on("room", (v) => (B.room = v));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const { code } = await A.emit("create", "alice");
console.log("room", code, await B.emit("join", { code, name: "bob" }));
console.log("bad deck:", (await A.emit("deck", { name: "x", main: [], life: [] })).error?.split("\n")[0]);
await A.emit("deck", deck); await B.emit("deck", deck); await sleep(200);
console.log("phase", A.view.phase, "first", A.view.first, "hand", A.view.players[A.view.me].hand.length, "oppHandVisible", A.view.players[1 - A.view.me].hand.length);
await A.emit("act", { t: "mulligan", ids: A.view.players[A.view.me].hand.slice(0, 2) });
await B.emit("act", { t: "mulligan", ids: [] }); await sleep(200);
console.log("phase", A.view.phase, "turn", A.view.turn, "turnNo", A.view.turnNo);
const by = [A, B]; const seatOf = (c: typeof A) => c.view.me;
const cur = () => by.find((c) => seatOf(c) === A.view.turn)!;
const oth = () => by.find((c) => seatOf(c) !== A.view.turn)!;
const act = async (c: typeof A, a: any) => { const r = await c.emit("act", a); await sleep(30); if (r.error) console.log("  ERR", JSON.stringify(a).slice(0, 60), r.error); return r; };
async function summonAll(c: typeof A) {
  for (let n = 0; n < 6; n++) {
    const v = c.view, me = v.players[v.me];
    const hand = me.hand.map((id: string) => ({ id, c: db[v.cards[id]] }));
    const av = hand.find((h: any) => h.c.type === "Avatar" && (h.c.cost ?? 0) <= 2);
    if (!av) return;
    const need = av.c.cost ?? 0, pay: string[] = [];
    let sum = 0;
    for (const h of hand) { if (h.id === av.id || sum >= need) continue; if ((h.c.gem ?? 0) > 0 && !h.c.gemColor) { pay.push(h.id); sum += h.c.gem; } }
    const r = await c.emit("act", { t: "summon", id: av.id, pay }); await sleep(30);
    if (r.error) { if (n === 0) console.log("  summon err:", r.error); return; }
  }
}
for (let round = 0; round < 60 && A.view.phase !== "over"; round++) {
  const me = cur(), foe = oth(), v = me.view;
  if (v.phase === "main") await summonAll(me);
  if (me.view.phase === "main") await act(me, { t: "next" });
  if (me.view.phase === "battle") {
    for (const s of me.view.players[me.view.me].avatar.filter((s: any) => !s.tapped)) {
      const fp = foe.view.players[foe.view.me];
      const target = fp.avatar.length ? { kind: "avatar", id: fp.avatar[0].id } : { kind: "life" };
      const r = await act(me, { t: "attack", id: s.id, target });
      if (!r.error) await act(foe, { t: "respond" });
      if (A.view.phase === "over") break;
    }
    if (A.view.phase !== "over") await act(me, { t: "next" });
  }
  if (A.view.phase === "end") {
    const hand = me.view.players[me.view.me].hand;
    for (const id of hand.slice(7)) await act(me, { t: "move", id, to: "hell" });
    await act(me, { t: "next" });
  }
}
console.log("phase", A.view.phase, "winner", A.view.winner, "turnNo", A.view.turnNo);
console.log(A.view.log.slice(-6).join("\n"));
console.log("A sees opp life ids:", JSON.stringify(A.view.players[1 - A.view.me].life.map((l: any) => l.id)));
process.exit(0);
