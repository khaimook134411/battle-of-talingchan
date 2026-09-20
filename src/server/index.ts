import express from "express";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Server, Socket } from "socket.io";
import type { Card } from "../shared/cards";
import { buildDB, DeckList, validateDeck } from "../shared/deck";
import { Action, applyAction, createGame, Game, Seat, setCardDb, viewFor } from "../shared/game";

const db = buildDB(JSON.parse(readFileSync("public/data/cards.json", "utf8")) as Card[]);
setCardDb(db);

interface RoomSeat {
  token: string;
  name: string;
  sid: string | null;
  deck: DeckList | null;
}
interface Room {
  code: string;
  seats: RoomSeat[];
  game: Game | null;
}
const rooms = new Map<string, Room>();

const app = express();
const http = createServer(app);
// CORS_ORIGIN: comma-separated list of allowed frontend origins (default: any)
const origins = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()).filter(Boolean);
const io = new Server(http, { cors: { origin: origins?.length ? origins : "*" } });
app.get("/health", (_req, res) => void res.json({ ok: true, rooms: rooms.size }));
if (existsSync("dist")) {
  app.use(express.static("dist"));
  app.use(express.static("public"));
}

const newCode = () => {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ";
  for (;;) {
    const c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join("");
    if (!rooms.has(c)) return c;
  }
};

function pushRoom(r: Room) {
  const info = r.seats.map((s) => ({ name: s.name, ready: !!s.deck, connected: !!s.sid }));
  r.seats.forEach((s, i) => {
    if (!s.sid) return;
    io.to(s.sid).emit("room", { code: r.code, seat: i, seats: info, inGame: !!r.game });
    if (r.game) io.to(s.sid).emit("state", viewFor(r.game, i as Seat));
  });
}

io.on("connection", (socket: Socket) => {
  let room: Room | null = null;
  let seat: Seat = 0;

  const attach = (r: Room, i: number) => {
    room = r;
    seat = i as Seat;
    r.seats[i].sid = socket.id;
  };

  socket.on("create", (name: string, cb) => {
    const r: Room = { code: newCode(), seats: [{ token: randomBytes(8).toString("hex"), name: name || "P1", sid: null, deck: null }], game: null };
    rooms.set(r.code, r);
    attach(r, 0);
    cb({ code: r.code, token: r.seats[0].token });
    pushRoom(r);
  });

  socket.on("join", ({ code, name }: { code: string; name: string }, cb) => {
    const r = rooms.get(String(code).toUpperCase());
    if (!r) return cb({ error: "ไม่พบห้อง" });
    if (r.seats.length >= 2) return cb({ error: "ห้องเต็มแล้ว" });
    r.seats.push({ token: randomBytes(8).toString("hex"), name: name || "P2", sid: null, deck: null });
    attach(r, 1);
    cb({ code: r.code, token: r.seats[1].token });
    pushRoom(r);
  });

  socket.on("rejoin", ({ code, token }: { code: string; token: string }, cb) => {
    const r = rooms.get(String(code).toUpperCase());
    const i = r?.seats.findIndex((s) => s.token === token) ?? -1;
    if (!r || i < 0) return cb({ error: "ห้องนี้ไม่มีอยู่แล้ว" });
    attach(r, i);
    cb({ code: r.code });
    pushRoom(r);
  });

  socket.on("deck", (deck: DeckList, cb) => {
    if (!room) return cb({ error: "ยังไม่ได้เข้าห้อง" });
    if (room.game && room.game.phase !== "over") return cb({ error: "เกมกำลังเล่นอยู่" });
    const { errors } = validateDeck(db, deck);
    if (errors.length) return cb({ error: errors.join("\n") });
    room.seats[seat].deck = deck;
    const [a, b] = room.seats;
    if (a?.deck && b?.deck) {
      room.game = createGame([a.deck, b.deck]);
      a.deck = b.deck = null;
    }
    cb({ ok: true });
    pushRoom(room);
  });

  socket.on("act", (action: Action, cb) => {
    if (!room?.game) return cb?.({ error: "ยังไม่ได้เริ่มเกม" });
    const err = applyAction(room.game, seat, action);
    cb?.(err ? { error: err } : { ok: true });
    pushRoom(room);
  });

  socket.on("disconnect", () => {
    if (!room) return;
    const s = room.seats[seat];
    if (s.sid === socket.id) s.sid = null;
    pushRoom(room);
    const r = room;
    setTimeout(() => {
      if (r.seats.every((x) => !x.sid)) rooms.delete(r.code);
    }, 30 * 60 * 1000);
  });
});

const port = Number(process.env.PORT ?? 3001);
http.listen(port, () => console.log(`server on :${port}`));
