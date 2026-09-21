import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Card } from "../shared/cards";
import { CardDB, DeckList, validateDeck } from "../shared/deck";
import type { Action, View } from "../shared/game";
import { Board } from "./Board";
import { DeckBuilder } from "./DeckBuilder";
import { decksStore, emit, initialRoom, inviteLink, loadCards, nameStore, saveServerUrl, serverUrl, sessionStore, socket } from "./api";
import "./style.css";

interface RoomInfo {
  code: string;
  seat: 0 | 1;
  seats: { name: string; ready: boolean; connected: boolean }[];
  inGame: boolean;
}

type Conn = "connecting" | "ok" | "error";

function ServerPanel({ conn }: { conn: Conn }) {
  const [url, setUrl] = useState(serverUrl());
  const [msg, setMsg] = useState("");
  const save = () => {
    const r = saveServerUrl(url);
    if (r === null) return setMsg("URL ไม่ถูกต้อง เช่น https://xxxx.trycloudflare.com");
    location.reload(); // socket is created once at startup with the saved URL
  };
  const label = { ok: "เชื่อมต่อแล้ว", connecting: "กำลังเชื่อมต่อ…", error: "ต่อเซิร์ฟเวอร์ไม่ได้" }[conn];
  const color = { ok: "#7fdc8a", connecting: "#f5c542", error: "#ff8080" }[conn];
  return (
    <details open={conn === "error"} style={{ border: "1px solid #333", borderRadius: 8, padding: "6px 10px" }}>
      <summary style={{ cursor: "pointer" }}><span style={{ color }}>●</span> เซิร์ฟเวอร์: {label}</summary>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <input placeholder="https://xxxx.trycloudflare.com (ว่าง = เซิร์ฟเวอร์เดียวกับหน้าเว็บ)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="row">
          <button className="primary" onClick={save}>บันทึกและเชื่อมต่อใหม่</button>
          <button onClick={() => navigator.clipboard?.writeText(inviteLink()).then(() => setMsg("คัดลอกลิงก์เชิญแล้ว — ส่งให้เพื่อนได้เลย"))} disabled={!serverUrl()}>คัดลอกลิงก์เชิญ</button>
        </div>
        {msg && <div className="muted">{msg}</div>}
        {conn === "error" && <div className="err">ถ้า tunnel เพิ่งเปลี่ยน URL ให้วาง URL ใหม่ที่นี่ (ไม่ต้อง deploy เว็บใหม่)</div>}
      </div>
    </details>
  );
}

function App() {
  const [data, setData] = useState<{ cards: Card[]; db: CardDB } | null>(null);
  const [screen, setScreen] = useState<"home" | "decks">("home");
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [name, setName] = useState(nameStore.get());
  const [code, setCode] = useState(initialRoom);
  const [conn, setConn] = useState<Conn>(socket.connected ? "ok" : "connecting");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [deckIdx, setDeckIdx] = useState(0);
  const [pickDeck, setPickDeck] = useState(false); // after game over: back to deck selection
  const [decks, setDecks] = useState<DeckList[]>(decksStore.load());

  useEffect(() => { loadCards().then(setData); }, []);

  useEffect(() => {
    const onRoom = (r: RoomInfo) => setRoom(r);
    const onState = (v: View) => {
      setView(v);
      if (v.phase !== "over") setPickDeck(false);
    };
    const tryRejoin = async () => {
      const s = sessionStore.get();
      if (!s) return;
      const res = await emit("rejoin", s);
      if (res.error) { sessionStore.set(null); setRoom(null); setView(null); }
    };
    const onOk = () => setConn("ok");
    const onBad = () => setConn("error");
    socket.on("connect", onOk);
    socket.on("connect_error", onBad);
    socket.on("disconnect", onBad);
    socket.on("room", onRoom);
    socket.on("state", onState);
    socket.on("connect", tryRejoin);
    if (socket.connected) tryRejoin();
    return () => { socket.off("connect", onOk); socket.off("connect_error", onBad); socket.off("disconnect", onBad); socket.off("room", onRoom); socket.off("state", onState); socket.off("connect", tryRejoin); };
  }, []);

  const enter = async (ev: "create" | "join") => {
    setErr("");
    if (conn !== "ok") return setErr("ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์ — ตรวจสอบ URL ในแผง “เซิร์ฟเวอร์” ด้านล่าง");
    nameStore.set(name);
    const res = await emit(ev, ev === "create" ? name : { code, name });
    if (res.error) return setErr(res.error);
    sessionStore.set({ code: res.code, token: res.token });
  };
  const leave = () => {
    sessionStore.set(null);
    setRoom(null);
    setView(null);
    location.reload();
  };
  const send = useCallback(async (a: Action) => (await emit("act", a)).error ?? null, []);

  if (!data) return <div className="center">กำลังโหลดข้อมูลการ์ด…</div>;
  if (screen === "decks") return <DeckBuilder cards={data.cards} db={data.db} onBack={() => { setDecks(decksStore.load()); setScreen("home"); }} />;

  if (room && view && room.inGame && !(view.phase === "over" && pickDeck)) {
    return <Board view={view} names={room.seats.map((s) => s.name)} db={data.db} send={send} onRematch={() => setPickDeck(true)} onLeave={leave} />;
  }

  if (room) {
    const me = room.seats[room.seat];
    const deck = decks[deckIdx];
    const check = deck ? validateDeck(data.db, deck) : { errors: ["ยังไม่มี Deck"], warnings: [] };
    const ready = async () => {
      setErr("");
      const res = await emit("deck", deck);
      if (res.error) setErr(res.error);
    };
    return (
      <div className="center">
        <h1>ห้อง <span style={{ letterSpacing: 4, color: "var(--accent)" }}>{room.code}</span></h1>
        <div className="muted">ส่งรหัสห้องนี้ให้เพื่อนเพื่อเข้าร่วม</div>
        {[0, 1].map((i) => {
          const s = room.seats[i];
          return <div key={i} className="row">P{i + 1}: {s ? <b>{s.name}</b> : <span className="muted">รอผู้เล่น…</span>} {s && (s.ready ? <span className="ok">✓ พร้อม</span> : <span className="muted">กำลังเลือก Deck</span>)} {s && !s.connected && <span className="err">(หลุดการเชื่อมต่อ)</span>}</div>;
        })}
        <h3>Deck ที่จะใช้</h3>
        {decks.length === 0 ? <div className="warn">ยังไม่มี Deck — ไปสร้างก่อน</div> : (
          <select value={deckIdx} onChange={(e) => setDeckIdx(Number(e.target.value))}>
            {decks.map((d, i) => <option key={i} value={i}>{d.name} ({d.main.length}/50)</option>)}
          </select>
        )}
        {check.errors.map((e) => <div key={e} className="err">• {e}</div>)}
        <div className="row">
          <button className="primary" disabled={!!check.errors.length || me.ready || room.seats.length < 2} onClick={ready}>{me.ready ? "รออีกฝ่าย…" : room.seats.length < 2 ? "รอเพื่อนเข้าห้อง" : "พร้อมเล่น"}</button>
          <button onClick={() => setScreen("decks")}>แก้ไข Deck</button>
          <button onClick={leave}>ออกจากห้อง</button>
          <button onClick={() => navigator.clipboard?.writeText(inviteLink(room.code)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })}>{copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์ชวนเพื่อน"}</button>
        </div>
        {err && <div className="err">{err}</div>}
        {conn !== "ok" && <ServerPanel conn={conn} />}
      </div>
    );
  }

  return (
    <div className="center">
      <h1>Battle of Talingchan Online</h1>
      <div className="muted">เกมการ์ด 2 ผู้เล่น · effect ของการ์ดผู้เล่นทำตามข้อความเอง ระบบบังคับกติกาหลัก</div>
      <input placeholder="ชื่อของคุณ" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
      <button onClick={() => setScreen("decks")}>🃏 จัด Deck ({decks.length})</button>
      <div className="row">
        <button className="primary" disabled={!name.trim()} onClick={() => enter("create")}>สร้างห้อง</button>
        <input placeholder="รหัสห้อง" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={4} style={{ width: 90, textTransform: "uppercase" }} />
        <button disabled={!name.trim() || code.length !== 4} onClick={() => enter("join")}>เข้าร่วม</button>
      </div>
      {err && <div className="err">{err}</div>}
      <ServerPanel conn={conn} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
