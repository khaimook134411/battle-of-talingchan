// Usage: tsx scripts/opp.ts ROOMCODE — joins as a passive opponent (for manual UI testing)
import { io } from "socket.io-client";
import { readFileSync } from "node:fs";
import { buildDB, cardKey } from "../src/shared/deck";
const cards = JSON.parse(readFileSync("public/data/cards.json", "utf8"));
const only = cards.find((c: any) => c.ex === "Only #1" && c.type === "Avatar");
const pool = cards.filter((c: any) => c.type === "Avatar" && !String(c.ex).match(/Only|ลำเอียง/) && !c.customLimit && (c.cost ?? 9) <= 4 && (c.power ?? 0) > 0 && c.gem);
const names = [...new Set(pool.map((c: any) => c.name))] as string[];
const main = [cardKey(only)];
for (let i = 0; main.length < 50; i++) main.push(cardKey(pool.find((c: any) => c.name === names[Math.floor(i / 4) + 3])));
const life = cards.filter((c: any) => c.type === "Life").slice(5, 10).map(cardKey);
void buildDB;
const s = io("http://localhost:3001");
const emit = (e: string, d?: any) => new Promise<any>((r) => s.emit(e, d, r));
console.log(await emit("join", { code: process.argv[2], name: "บอท" }));
console.log(await emit("deck", { name: "opp", main, life }));
s.on("state", async (v) => { if (v.phase === "mulligan" && !v.players[v.me].mulliganDone) await emit("act", { t: "mulligan", ids: [] }); });
setInterval(() => {}, 1e6);
