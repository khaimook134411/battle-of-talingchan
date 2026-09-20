import { useEffect, useMemo, useRef, useState } from "react";
import { Card, cardImageUrl } from "../shared/cards";
import { CardDB } from "../shared/deck";
import type { Action, Dest, PView, Seat, Slot, Target, View } from "../shared/game";

type Mode = null | { k: "pay"; target: string; pay: string[] } | { k: "attack"; id: string } | { k: "equip"; id: string };
type Where = { seat: Seat; zone: "hand" | "avatar" | "construct" | "magic" | "hell" | "dark" | "land" | "deck" | "equip"; slot?: Slot };

interface Props {
  view: View;
  names: string[];
  db: CardDB;
  send: (a: Action) => Promise<string | null>;
  onRematch: () => void;
  onLeave: () => void;
}

const POWER_OF = (c: Card, slot?: Slot) => Math.max(0, (c.power ?? 0) + (slot?.mod ?? 0));

export function Board({ view, names, db, send, onRematch, onLeave }: Props) {
  const me = view.me;
  const opp = (1 - me) as Seat;
  const P = view.players;
  const [sel, setSel] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [pile, setPile] = useState<null | "deck" | "myHell" | "oppHell" | "myDark" | "oppDark">(null);
  const [swap, setSwap] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const card = (id: string | null | undefined) => (id && view.cards[id] ? db[view.cards[id]] : undefined);
  const myTurn = view.turn === me;

  useEffect(() => { logRef.current?.scrollTo(0, 1e9); }, [view.log.length]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 4000); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => { setMode(null); }, [view.turn, view.phase]);

  const act = async (a: Action) => {
    const err = await send(a);
    if (err) setToast(err);
    return err;
  };

  const where = (id: string): Where | null => {
    for (const s of [0, 1] as Seat[]) {
      const p = P[s];
      if (p.hand.includes(id)) return { seat: s, zone: "hand" };
      for (const z of ["avatar", "construct"] as const) for (const sl of p[z]) {
        if (sl.id === id) return { seat: s, zone: z, slot: sl };
        if (sl.equip.includes(id)) return { seat: s, zone: "equip", slot: sl };
      }
      for (const z of ["magic", "hell", "dark"] as const) if (p[z].includes(id)) return { seat: s, zone: z };
      if (p.deckList.includes(id)) return { seat: s, zone: "deck" };
    }
    if (view.land?.id === id) return { seat: view.land.owner, zone: "land" };
    return null;
  };

  const click = (id: string) => {
    if (view.phase === "mulligan") return setSwap((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    const w = where(id);
    if (mode?.k === "pay" && w?.zone === "hand" && w.seat === me && id !== mode.target) {
      const pay = mode.pay.includes(id) ? mode.pay.filter((x) => x !== id) : [...mode.pay, id];
      return setMode({ ...mode, pay });
    }
    if (mode?.k === "attack" && w && w.seat === opp && (w.zone === "avatar" || w.zone === "construct")) {
      act({ t: "attack", id: mode.id, target: { kind: w.zone, id } as Target }).then(() => setMode(null));
      return;
    }
    if (mode?.k === "equip" && w && w.zone === "avatar") {
      act({ t: "magic", id: mode.id, target: id }).then(() => setMode(null));
      return;
    }
    setSel(id);
  };

  // ---------- card rendering ----------
  const Cd = ({ id, slot, back, small }: { id?: string | null; slot?: Slot; back?: boolean; small?: boolean }) => {  // plain function (not a component) so cards are not remounted every render
    const c = card(id);
    if (back || !c || !id) return <div key={id ?? "back"} className={`card back ${small ? "small" : ""}`}>BoT</div>;
    const isPay = mode?.k === "pay" && (mode.pay.includes(id) || mode.target === id);
    const targetable = (mode?.k === "attack" && where(id)?.seat === opp && ["avatar", "construct"].includes(where(id)!.zone)) || (mode?.k === "equip" && where(id)?.zone === "avatar");
    const showPower = slot && (c.type === "Avatar" || c.type === "Construct" || c.type === "Token");
    return (
      <div
        key={id}
        className={`card ${slot?.tapped ? "tapped" : ""} ${sel === id ? "sel" : ""} ${isPay ? "pay" : ""} ${targetable ? "target" : ""}`}
        onClick={(e) => { e.stopPropagation(); click(id); }}
        onMouseEnter={() => setHoverId(id)}
        title={c.name}
      >
        <img src={cardImageUrl(c)} alt={c.name} loading="lazy" draggable={false} />
        {showPower && <span className={`badge ${slot!.mod ? "mod" : ""}`}>{POWER_OF(c, slot)}{slot!.mod ? (slot!.mod > 0 ? ` (+${slot!.mod})` : ` (${slot!.mod})`) : ""}</span>}
        {slot && slot.equip.length > 0 && <span className="eq">+{slot.equip.length}</span>}
      </div>
    );
  };

  const SlotCards = (slots: Slot[]) => slots.map((s) => Cd({ id: s.id, slot: s }));

  const Mat = (s: Seat, flip: boolean) => {
    const p: PView = P[s];
    const landHere = view.land && view.land.owner === s;
    const atkLife = mode?.k === "attack" && s === opp;
    return (
      <div className={`mat ${flip ? "opp" : "mine"} ${view.turn === s ? "active" : ""}`}>
        <div className="zone" style={{ gridArea: "construct" }}><span className="zl">Construct Zone</span>{SlotCards(p.construct)}</div>
        <div className="zone" style={{ gridArea: "land" }}><span className="zl">Land Magic Zone</span>{landHere && Cd({ id: view.land!.id })}</div>
        <div className="zone logo" style={{ gridArea: "logo" }}>BATTLE OF TALINGCHAN</div>
        <div
          className={`zone life ${atkLife ? "drop" : ""}`}
          style={{ gridArea: "life" }}
          onClick={() => atkLife && act({ t: "attack", id: (mode as { id: string }).id, target: { kind: "life" } }).then(() => setMode(null))}
        >
          <span className="zl">Life</span>
          {p.life.map((l, i) => (
            <div key={i} className={`life-tile ${l.up ? "up" : ""}`} onClick={(e) => { if (l.id) { e.stopPropagation(); setSel(l.id); } }} onMouseEnter={() => l.id && setHoverId(l.id)}>
              {l.up ? card(l.id)?.name : "LIFE"}
            </div>
          ))}
        </div>
        <div className="zone" style={{ gridArea: "avatar" }}><span className="zl">Avatar Zone</span>{SlotCards(p.avatar)}</div>
        <div className="zone" style={{ gridArea: "magic" }}><span className="zl">Magic Zone</span>{p.magic.map((id) => Cd({ id }))}</div>
        <div className="zone pile" style={{ gridArea: "hell" }} onClick={() => setPile(s === me ? "myHell" : "oppHell")}>
          <span className="zl">Hell นรก</span>
          {p.hell.length ? Cd({ id: p.hell[p.hell.length - 1] }) : <div className="muted">ว่าง</div>}
          <small>{p.hell.length} ใบ{p.dark.length ? ` · มิติมืด ${p.dark.length}` : ""}</small>
        </div>
        <div className="zone pile" style={{ gridArea: "deck" }} onClick={() => s === me && setPile("deck")}>
          <span className="zl">Deck</span>
          {Cd({ back: true, small: true })}
          <small>{p.deckCount} ใบ</small>
        </div>
      </div>
    );
  };

  // ---------- selected card actions ----------
  const selCard = card(sel);
  const selWhere = sel ? where(sel) : null;
  const pending = view.pending;
  const iAmDefender = !!pending && pending.by !== me;

  const actionsFor = (): { label: string; run: () => void; primary?: boolean; danger?: boolean }[] => {
    if (!sel || !selCard || !selWhere) return [];
    const w = selWhere;
    const out: { label: string; run: () => void; primary?: boolean; danger?: boolean }[] = [];
    const mv = (label: string, to: Dest, side?: Seat) => out.push({ label, run: () => { act({ t: "move", id: sel, to, side }); if (to !== "hand") setSel(null); } });
    const mineHand = w.zone === "hand" && w.seat === me;
    if (mineHand) {
      if (selCard.type === "Avatar" || selCard.type === "Construct") {
        out.push({
          label: selCard.type === "Avatar" ? "อัญเชิญ" : "ก่อสร้าง", primary: true,
          run: () => ((selCard.cost ?? 0) === 0 ? act({ t: "summon", id: sel, pay: [] }).then((e) => !e && setSel(null)) : setMode({ k: "pay", target: sel, pay: [] })),
        });
      } else if (selCard.type === "Magic") {
        out.push({
          label: `ใช้ ${selCard.subtype ?? "Magic"}`, primary: true,
          run: () => (selCard.subtype === "Modification" ? setMode({ k: "equip", id: sel }) : act({ t: "magic", id: sel }).then((e) => !e && setSel(null))),
        });
      }
      mv("ทิ้งลงนรก", "hell");
      mv("ใส่ใต้ Deck", "deckBottom");
      mv("วางบน Deck", "deckTop");
    } else {
      if (w.zone === "avatar" && w.seat === me) {
        if (iAmDefender && selCard.mainEffect.includes("โล่มนุษย์") && !w.slot!.tapped)
          out.push({ label: "🛡️ ใช้โล่มนุษย์", primary: true, run: () => act({ t: "respond", shield: sel }) });
        if (myTurn && view.phase === "battle" && !pending && !w.slot!.tapped)
          out.push({ label: "⚔️ โจมตี", primary: true, run: () => setMode({ k: "attack", id: sel }) });
      }
      if (w.zone === "avatar" || w.zone === "construct") {
        out.push({ label: w.slot!.tapped ? "ทำให้ตื่น" : "ทำให้นอน", run: () => act({ t: "tap", id: sel }) });
        out.push({ label: "POWER +1", run: () => act({ t: "mod", id: sel, d: 1 }) });
        out.push({ label: "POWER −1", run: () => act({ t: "mod", id: sel, d: -1 }) });
        out.push({ label: "POWER +2", run: () => act({ t: "mod", id: sel, d: 2 }) });
        out.push({ label: "POWER −2", run: () => act({ t: "mod", id: sel, d: -2 }) });
      }
      if (w.zone !== "deck") {
        mv("→ ขึ้นมือ", "hand");
        mv("→ นรก", "hell");
      }
      mv("→ มิติมืด (เนรเทศ)", "dark");
      mv("→ ใต้ Deck", "deckBottom");
      mv("→ บน Deck", "deckTop");
      if (w.zone === "hell" || w.zone === "dark" || w.zone === "deck" || w.zone === "magic") {
        mv("→ Avatar Zone (ฝ่ายเรา)", "avatar", me);
        mv("→ Magic Zone (ฝ่ายเรา)", "magic", me);
      }
      if (selCard.type === "Life" && sel) out.push({ label: "หงาย/คว่ำ LIFE", run: () => act({ t: "flip", id: sel }) });
    }
    return out;
  };

  const lifeSel = sel && P.flatMap((p) => p.life).some((l) => l.id === sel);

  const prev = card(hoverId ?? sel);

  // pay mode summary
  let payInfo: { sum: number; cost: number } | null = null;
  if (mode?.k === "pay") {
    const t = card(mode.target)!;
    payInfo = { sum: mode.pay.reduce((n, id) => n + (card(id)?.gem ?? 0), 0), cost: t.cost ?? 0 };
  }

  const phaseLabel = { mulligan: "เปลี่ยนการ์ดเริ่มต้น", main: "Main Phase", battle: "Battle Phase", end: "End Phase", over: "จบเกม" }[view.phase];
  const nextLabel = view.phase === "main" ? (view.turnNo === 1 ? "ไป End Phase" : "ไป Battle Phase") : view.phase === "battle" ? "ไป End Phase" : "จบเทิร์น";
  const handOver = P[me].hand.length - 7;

  const pileIds = useMemo(() => {
    if (pile === "deck") return P[me].deckList;
    if (pile === "myHell") return [...P[me].hell].reverse();
    if (pile === "oppHell") return [...P[opp].hell].reverse();
    if (pile === "myDark") return P[me].dark;
    if (pile === "oppDark") return P[opp].dark;
    return [];
  }, [pile, view]);

  const pdesc = pending ? `“${card(pending.attacker)?.name}” โจมตี ${pending.target.kind === "life" ? "LIFE" : `“${card(pending.target.id)?.name}”`}` : "";

  return (
    <div className="game" onClick={() => setHoverId(null)}>
      <div className="main">
        <div className="bar">
          <b>{names[opp]}</b> (P{opp + 1}) · มือ {P[opp].handCount} ใบ · Deck {P[opp].deckCount}
          {P[opp].dark.length > 0 && <a href="#" onClick={(e) => { e.preventDefault(); setPile("oppDark"); }}>มิติมืด {P[opp].dark.length}</a>}
          <span style={{ flex: 1 }} />
          {view.turn === opp && <span className="turn">◀ เทิร์นฝ่ายตรงข้าม</span>}
        </div>
        {Mat(opp, true)}
        {Mat(me, false)}
        <div className="bar">
          <b>{names[me]}</b> (คุณ = P{me + 1}) · Deck {P[me].deckCount}
          {P[me].dark.length > 0 && <a href="#" onClick={(e) => { e.preventDefault(); setPile("myDark"); }}>มิติมืด {P[me].dark.length}</a>}
          <span style={{ flex: 1 }} />
          {myTurn && <span className="turn">▶ เทิร์นของคุณ</span>}
        </div>
        <div className="hand">
          {P[me].hand.map((id) => Cd({ id }))}
          {P[me].hand.length === 0 && <span className="muted">ไม่มีการ์ดบนมือ</span>}
        </div>

        {view.phase === "mulligan" && (
          <div className="overlay">
            <div className="box">
              <h3>เปลี่ยนการ์ดเริ่มต้น (ผู้เล่น {view.first + 1} เล่นก่อน)</h3>
              {P[me].mulliganDone ? <div>รออีกฝ่ายเลือก…</div> : (
                <>
                  <div className="muted">คลิกการ์ดที่ต้องการเปลี่ยน (ใต้ Deck แล้วจั่วใหม่)</div>
                  <div className="grid-cards">
                    {P[me].hand.map((id) => (
                      <div key={id} style={{ outline: swap.includes(id) ? "3px solid #ff5050" : "none", borderRadius: 4 }}>
                        {Cd({ id })}
                      </div>
                    ))}
                  </div>
                  <button className="primary" onClick={() => { act({ t: "mulligan", ids: swap }); setSwap([]); }}>{swap.length ? `เปลี่ยน ${swap.length} ใบ` : "ใช้การ์ดชุดนี้"}</button>
                </>
              )}
            </div>
          </div>
        )}

        {pile && (
          <div className="overlay" onClick={() => setPile(null)}>
            <div className="box" onClick={(e) => e.stopPropagation()}>
              <div className="row"><h3 style={{ margin: 0 }}>{{ deck: "Deck ของคุณ (ค้นหา)", myHell: "นรกของคุณ", oppHell: "นรกฝ่ายตรงข้าม", myDark: "มิติมืดของคุณ", oppDark: "มิติมืดฝ่ายตรงข้าม" }[pile]} ({pileIds.length})</h3><span style={{ flex: 1 }} /><button onClick={() => setPile(null)}>ปิด</button></div>
              {pile === "deck" && <div className="muted">เลือกการ์ด แล้วใช้ปุ่มด้านขวา — หลังค้นหาอย่าลืมกด “สับ Deck”</div>}
              <div className="grid-cards">{pileIds.map((id) => Cd({ id }))}</div>
            </div>
          </div>
        )}

        {view.phase === "over" && (
          <div className="overlay">
            <div className="box" style={{ textAlign: "center" }}>
              <h2>{view.winner === me ? "🏆 คุณชนะ!" : "คุณแพ้"}</h2>
              <div className="muted" style={{ maxWidth: 360 }}>{[...view.log].reverse().find((l) => l.startsWith("🏆"))}</div>
              <div className="row" style={{ justifyContent: "center" }}>
                <button className="primary" onClick={onRematch}>เล่นอีกครั้ง (เลือก Deck)</button>
                <button onClick={onLeave}>ออกจากห้อง</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="side" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <b>Turn {view.turnNo}</b> · <span className={myTurn ? "turn" : ""}>{phaseLabel}</span>
          <span style={{ flex: 1 }} />
          <button className="primary" disabled={!myTurn || view.phase === "mulligan" || !!pending} onClick={() => act({ t: "next" })}>{nextLabel}</button>
        </div>
        {myTurn && view.phase === "end" && handOver > 0 && <div className="banner">ต้องทิ้งการ์ดอีก {handOver} ใบ เพื่อให้เหลือ 7 ใบก่อนจบเทิร์น</div>}
        {pending && (
          <div className="banner">
            ⚔️ {pdesc}
            {iAmDefender ? (
              <div className="actions" style={{ marginTop: 6 }}>
                <button className="primary" onClick={() => act({ t: "respond" })}>ปล่อยผ่าน → ต่อสู้</button>
                <span className="muted">ตอบสนองด้วย React Magic / โล่มนุษย์ (คลิก Avatar ของคุณ) ก่อนได้</span>
              </div>
            ) : <div className="muted">รอฝ่ายตรงข้ามตอบสนอง…</div>}
          </div>
        )}
        {mode?.k === "attack" && <div className="banner">เลือกเป้าหมาย: คลิก Avatar/Construct ฝ่ายตรงข้าม หรือกรอบ Life (ถ้าไม่มี Avatar) <button onClick={() => setMode(null)}>ยกเลิก</button></div>}
        {mode?.k === "equip" && <div className="banner">เลือก Avatar ที่จะสวมใส่ <button onClick={() => setMode(null)}>ยกเลิก</button></div>}
        {mode?.k === "pay" && payInfo && (
          <div className="banner">
            เลือกการ์ดบนมือเพื่อจ่าย Gem: <b>{payInfo.sum}/{payInfo.cost}</b>
            <div className="actions" style={{ marginTop: 6 }}>
              <button className="primary" onClick={() => act({ t: "summon", id: mode.target, pay: mode.pay }).then((e) => { if (!e) { setMode(null); setSel(null); } })}>ยืนยัน</button>
              <button onClick={() => setMode(null)}>ยกเลิก</button>
            </div>
          </div>
        )}

        <div className="preview">
          {prev ? <><img src={cardImageUrl(prev)} alt={prev.name} /><div className="fx"><b>{prev.name}</b>{prev.cost !== undefined ? ` · Cost ${prev.cost}` : ""}{prev.gem !== undefined ? ` · Gem ${prev.gem}${prev.gemColor ? prev.gemColor : ""}` : ""}{prev.power !== undefined ? ` · POWER ${prev.power}` : ""}{prev.symbol ? ` · ${prev.symbol}` : ""}{"\n"}{prev.mainEffect}</div></> : <div className="muted">เอาเมาส์ชี้การ์ดเพื่อดูรายละเอียด · คลิกเพื่อเลือก</div>}
        </div>

        {sel && selCard && (
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>เลือก: {selCard.name}{lifeSel ? " (LIFE)" : ""}</div>
            <div className="actions">
              {actionsFor().map((a) => <button key={a.label} className={a.primary ? "primary" : a.danger ? "danger" : ""} onClick={a.run}>{a.label}</button>)}
              <button onClick={() => setSel(null)}>เลิกเลือก</button>
            </div>
          </div>
        )}

        <div className="actions">
          <button onClick={() => act({ t: "draw", n: 1 })}>จั่ว 1</button>
          <button onClick={() => act({ t: "shuffle" })}>สับ Deck</button>
          <button onClick={() => setPile("deck")}>ค้นหา Deck</button>
          <button onClick={() => act({ t: "dice" })}>🎲</button>
          <button className="danger" onClick={() => confirm("ยอมแพ้?") && act({ t: "concede" })}>ยอมแพ้</button>
        </div>
        <div className="log" ref={logRef}>{view.log.map((l, i) => <div key={i}>{l}</div>)}</div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
