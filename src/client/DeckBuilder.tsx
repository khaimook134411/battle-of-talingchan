import { useMemo, useState } from "react";
import { Card, cardImageUrl } from "../shared/cards";
import { CardDB, cardKey, DeckList, validateDeck } from "../shared/deck";
import { decksStore } from "./api";

const TYPES = ["Avatar", "Magic", "Construct", "Life"];
const COLORS = ["แดง", "ฟ้า", "ม่วง", "เขียว"];
const RARES = ["C", "R", "SR", "UR", "SCR", "USEC", "PR", "CBR"];
const PAGE = 90;

const blank = (): DeckList => ({ name: "Deck ใหม่", main: [], life: [] });

export function DeckBuilder({ cards, db, onBack }: { cards: Card[]; db: CardDB; onBack: () => void }) {
  const [decks, setDecks] = useState<DeckList[]>(() => {
    const d = decksStore.load();
    return d.length ? d : [blank()];
  });
  const [idx, setIdx] = useState(0);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [color, setColor] = useState("");
  const [rare, setRare] = useState("");
  const [symbol, setSymbol] = useState("");
  const [cost, setCost] = useState("");
  const [page, setPage] = useState(1);
  const [hover, setHover] = useState<Card | null>(null);
  const [saved, setSaved] = useState(true);

  const deck = decks[idx] ?? decks[0];
  const symbols = useMemo(() => [...new Set(cards.map((c) => c.symbol).filter(Boolean))].sort() as string[], [cards]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return cards.filter(
      (c) =>
        c.type !== "Token" &&
        (!type || c.type === type) &&
        (!color || c.color === color) &&
        (!rare || c.rare === rare) &&
        (!symbol || c.symbol === symbol) &&
        (cost === "" || (cost === "7" ? (c.cost ?? 0) >= 7 : c.cost === Number(cost))) &&
        (!s || c.name.toLowerCase().includes(s) || c.print.toLowerCase().includes(s) || c.mainEffect.toLowerCase().includes(s)),
    );
  }, [cards, q, type, color, rare, symbol, cost]);

  const update = (d: DeckList) => {
    setDecks((all) => all.map((x, i) => (i === idx ? d : x)));
    setSaved(false);
  };
  const countName = (n: string) => deck.main.filter((k) => db[k].name === n).length;
  const countKey = (k: string) => deck.main.filter((x) => x === k).length + deck.life.filter((x) => x === k).length;

  const add = (c: Card) => {
    const k = cardKey(c);
    if (c.type === "Life") {
      if (deck.life.length < 5 && !deck.life.some((x) => db[x].name === c.name)) update({ ...deck, life: [...deck.life, k] });
    } else if (deck.main.length < 50) update({ ...deck, main: [...deck.main, k] });
  };
  const remove = (k: string) => {
    const i = deck.main.lastIndexOf(k);
    if (i >= 0) return update({ ...deck, main: deck.main.filter((_, j) => j !== i) });
    update({ ...deck, life: deck.life.filter((x) => x !== k) });
  };

  const persist = () => {
    decksStore.save(decks);
    setSaved(true);
  };
  const { errors, warnings } = validateDeck(db, deck);

  const grouped = useMemo(() => {
    const m = new Map<string, { k: string; n: number }>();
    for (const k of deck.main) {
      const e = m.get(k) ?? { k, n: 0 };
      e.n++;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => (db[a.k].cost ?? 0) - (db[b.k].cost ?? 0) || db[a.k].name.localeCompare(db[b.k].name));
  }, [deck.main, db]);

  const exportDeck = () => navigator.clipboard?.writeText(JSON.stringify(deck)).then(() => alert("คัดลอก Deck ไปที่ Clipboard แล้ว"));
  const importDeck = () => {
    const t = prompt("วาง JSON ของ Deck");
    if (!t) return;
    try {
      const d = JSON.parse(t) as DeckList;
      if (!Array.isArray(d.main) || !Array.isArray(d.life)) throw new Error();
      setDecks([...decks, { name: d.name || "Imported", main: d.main.filter((k) => db[k]), life: d.life.filter((k) => db[k]) }]);
      setIdx(decks.length);
      setSaved(false);
    } catch {
      alert("รูปแบบไม่ถูกต้อง");
    }
  };

  return (
    <div className="builder">
      <div className="pool">
        <div className="row">
          <button onClick={onBack}>← กลับ</button>
          <h2 style={{ margin: 0 }}>Deck Builder</h2>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input placeholder="ค้นหาชื่อ / รหัส / ข้อความ" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ minWidth: 220 }} />
          {[
            [type, setType, "ประเภท", TYPES],
            [color, setColor, "สี", COLORS],
            [rare, setRare, "ความหายาก", RARES],
            [symbol, setSymbol, "Symbol", symbols],
            [cost, setCost, "Cost", ["0", "1", "2", "3", "4", "5", "6", "7"]],
          ].map(([v, set, label, opts]) => (
            <select key={label as string} value={v as string} onChange={(e) => { (set as (s: string) => void)(e.target.value); setPage(1); }}>
              <option value="">{label as string}</option>
              {(opts as string[]).map((o) => <option key={o} value={o}>{label === "Cost" && o === "7" ? "7+" : o}</option>)}
            </select>
          ))}
          <span className="muted">{shown.length} ใบ · คลิกเพื่อเพิ่ม</span>
        </div>
        <div className="cards">
          {shown.slice(0, page * PAGE).map((c) => {
            const k = cardKey(c);
            const n = countKey(k);
            return (
              <div className="cell" key={k} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}>
                <img src={cardImageUrl(c)} alt={c.name} loading="lazy" onClick={() => add(c)} onContextMenu={(e) => { e.preventDefault(); remove(k); }} />
                {n > 0 && <span className="n">{n}</span>}
              </div>
            );
          })}
        </div>
        {shown.length > page * PAGE && <button style={{ margin: 12 }} onClick={() => setPage(page + 1)}>แสดงเพิ่ม</button>}
      </div>

      <div className="deckpane">
        <div className="row">
          <select value={idx} onChange={(e) => setIdx(Number(e.target.value))} style={{ flex: 1 }}>
            {decks.map((d, i) => <option key={i} value={i}>{d.name}</option>)}
          </select>
          <button onClick={() => { setDecks([...decks, blank()]); setIdx(decks.length); setSaved(false); }}>+ ใหม่</button>
        </div>
        <input value={deck.name} onChange={(e) => update({ ...deck, name: e.target.value })} />
        <div className="row">
          <b className={deck.main.length === 50 ? "ok" : ""}>Main {deck.main.length}/50</b>
          <b className={deck.life.length === 5 ? "ok" : ""}>LIFE {deck.life.length}/5</b>
        </div>
        <div className="row">
          <button className="primary" onClick={persist} disabled={saved}>{saved ? "บันทึกแล้ว" : "บันทึก"}</button>
          <button onClick={exportDeck}>Export</button>
          <button onClick={importDeck}>Import</button>
          <button className="danger" disabled={decks.length < 2} onClick={() => { if (confirm(`ลบ "${deck.name}" ?`)) { const nd = decks.filter((_, i) => i !== idx); setDecks(nd); decksStore.save(nd); setIdx(0); } }}>ลบ</button>
        </div>
        {errors.map((e) => <div key={e} className="err">• {e}</div>)}
        {warnings.map((e) => <div key={e} className="warn">• {e}</div>)}
        {!errors.length && <div className="ok">✓ Deck ถูกต้อง พร้อมเล่น{saved ? "" : " (อย่าลืมบันทึก)"}</div>}

        <h3>LIFE Deck</h3>
        {deck.life.map((k) => (
          <div className="deckrow" key={k} onMouseEnter={() => setHover(db[k])} onMouseLeave={() => setHover(null)}>
            <span className="nm">{db[k].name}</span><button onClick={() => remove(k)}>−</button>
          </div>
        ))}
        <h3>Main Deck</h3>
        {grouped.map(({ k, n }) => (
          <div className="deckrow" key={k} onMouseEnter={() => setHover(db[k])} onMouseLeave={() => setHover(null)}>
            <span className="muted" style={{ width: 22 }}>{db[k].cost ?? "-"}</span>
            <span className="nm">{db[k].name}{db[k].ex === "Only #1" ? " ★" : ""}</span>
            <button onClick={() => remove(k)}>−</button><b>{n}</b><button onClick={() => add(db[k])} disabled={countName(db[k].name) >= (db[k].customLimit ?? 4)}>+</button>
          </div>
        ))}
      </div>
      {hover && (
        <div className="hover-preview">
          <img src={cardImageUrl(hover)} alt={hover.name} />
          <div className="fx">{hover.mainEffect}</div>
        </div>
      )}
    </div>
  );
}
