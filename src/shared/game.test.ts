import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { applyAction, createGame, Game, payError, setCardDb, viewFor } from "./game";
import { buildDB, cardKey, DeckList, validateDeck } from "./deck";
import type { Card } from "./cards";

const cards: Card[] = JSON.parse(readFileSync("public/data/cards.json", "utf8"));
const db = buildDB(cards);

const mk = (over: Partial<Card>): Card => ({ name: "x", type: "Avatar", soi: 1, print: "T-000", rare: "C", mainEffect: "", ...over });
const test = (list: Card[]) => {
  const d = buildDB(list);
  setCardDb(d);
  return d;
};

/** build a Game with hand-picked cards: hand[seat] keys, board setup done by caller */
function game(hands: [Card[], Card[]], deckSize = 10): Game {
  const all = [...hands[0], ...hands[1]];
  const filler = mk({ name: "filler", print: "F-000", gem: 1, cost: 1, power: 1 });
  const life = ["a", "b", "c", "d", "e"].map((n, i) => mk({ name: n, type: "Life", print: `L-${i}` }));
  const d = test([...all, filler, ...life]);
  const deck = (s: 0 | 1): DeckList => ({ name: "t", main: Array(deckSize).fill(cardKey(filler)), life: life.map(cardKey) });
  const g = createGame([deck(0), deck(1)], 0, () => 0.5);
  for (const s of [0, 1] as const) {
    g.players[s].hand = [];
    hands[s].forEach((c, i) => {
      const id = `${s}:h${i}`;
      g.cards[id] = { key: cardKey(c), owner: s };
      g.players[s].hand.push(id);
    });
  }
  void d;
  return g;
}
const startMain = (g: Game) => {
  applyAction(g, 0, { t: "mulligan", ids: [] });
  applyAction(g, 1, { t: "mulligan", ids: [] });
};

describe("gem payment (rulebook examples)", () => {
  const av = mk({ name: "A", cost: 4, color: "แดง", power: 3, print: "A-1" });
  const g4 = mk({ name: "g4", gem: 4, print: "G-4", type: "Magic" });
  const g3 = mk({ name: "g3", gem: 3, print: "G-3", type: "Magic" });
  const g2 = mk({ name: "g2", gem: 2, print: "G-2", type: "Magic" });
  const g1 = mk({ name: "g1", gem: 1, print: "G-1", type: "Magic" });
  const g0 = mk({ name: "g0", gem: 0, print: "G-0", type: "Magic" });
  const blue = mk({ name: "blue", gem: 4, gemColor: "ฟ้า", print: "G-B", type: "Magic" });
  const red = mk({ name: "red", gem: 4, gemColor: "แดง", print: "G-R", type: "Magic" });
  let g: Game;
  beforeAll(() => {
    g = game([[av, g4, g3, g2, g1, g0, blue, red], []]);
  });
  const ids = (...i: number[]) => i.map((n) => `0:h${n}`);
  it("4+1 is over-payment", () => expect(payError(g, 0, "0:h0", ids(1, 4))).toMatch(/เกิน/));
  it("3+2 is fine", () => expect(payError(g, 0, "0:h0", ids(2, 3))).toBeNull());
  it("single 4 is fine", () => expect(payError(g, 0, "0:h0", ids(1))).toBeNull());
  it("not enough", () => expect(payError(g, 0, "0:h0", ids(4))).toMatch(/ไม่พอ/));
  it("gem 0 cannot pay", () => expect(payError(g, 0, "0:h0", ids(5, 1))).toMatch(/Gem 0/));
  it("wrong colour rejected, same colour accepted", () => {
    expect(payError(g, 0, "0:h0", ids(6))).toMatch(/สีฟ้า/);
    expect(payError(g, 0, "0:h0", ids(7))).toBeNull();
  });
  it("cost 0 needs no payment", () => {
    const z = mk({ name: "z", cost: 0, print: "Z" });
    const gg = game([[z, g1], []]);
    expect(payError(gg, 0, "0:h0", [])).toBeNull();
    expect(payError(gg, 0, "0:h0", ["0:h1"])).toMatch(/Cost 0/);
  });
});

describe("turn flow", () => {
  it("first player draws 2 on turn 1 and skips battle", () => {
    const g = game([[mk({}), mk({ print: "T-1" }), mk({ print: "T-2" })], []]);
    startMain(g);
    expect(g.phase).toBe("main");
    expect(g.players[0].hand.length).toBeGreaterThanOrEqual(2);
    applyAction(g, 0, { t: "next" });
    expect(g.phase).toBe("end");
  });
  it("must discard down to 7 before ending turn", () => {
    const hand = Array.from({ length: 9 }, (_, i) => mk({ print: `H-${i}`, name: `h${i}` }));
    const g = game([hand, []]);
    startMain(g);
    applyAction(g, 0, { t: "next" });
    expect(applyAction(g, 0, { t: "next" })).toMatch(/ทิ้งการ์ด/);
  });
  it("draws up to 3 when hand < 3 on later turns", () => {
    const g = game([[], [mk({ print: "H-1" })]]);
    startMain(g);
    // startMain's mulligan draws 0 cards; P2 hand is 1 card, so draws 2 to reach 3
    applyAction(g, 0, { t: "next" });
    applyAction(g, 0, { t: "next" }); // end turn -> P2's turn
    expect(g.turn).toBe(1);
    expect(g.players[1].hand.length).toBe(3);
    // with >=3 cards in hand only 1 is drawn
    applyAction(g, 1, { t: "next" });
    applyAction(g, 1, { t: "next" });
    applyAction(g, 1, { t: "next" }); // -> P1's turn, P1 hand 0 -> draws 3
    expect(g.turn).toBe(0);
    expect(g.players[0].hand.length).toBe(3);
  });
});

describe("battle", () => {
  function setup(aP: number, dP: number, dEffect = "", aEffect = "") {
    const a = mk({ name: "atk", power: aP, print: "AT", mainEffect: aEffect });
    const d = mk({ name: "def", power: dP, print: "DF", mainEffect: dEffect });
    const g = game([[a], [d]]);
    startMain(g);
    // put both on board
    g.players[0].avatar.push({ id: "0:h0", tapped: false, mod: 0, equip: [] });
    g.players[0].hand = [];
    g.players[1].avatar.push({ id: "1:h0", tapped: false, mod: 0, equip: [] });
    g.players[1].hand = [];
    g.turnNo = 2;
    g.phase = "battle";
    return g;
  }
  const fight = (g: Game) => {
    expect(applyAction(g, 0, { t: "attack", id: "0:h0", target: { kind: "avatar", id: "1:h0" } })).toBeNull();
    expect(applyAction(g, 0, { t: "respond" })).toMatch(/รอ/); // attacker can't resolve
    expect(applyAction(g, 1, { t: "respond" })).toBeNull();
  };
  it("higher power wins", () => {
    const g = setup(5, 3);
    fight(g);
    expect(g.players[1].avatar).toHaveLength(0);
    expect(g.players[1].hell).toContain("1:h0");
    expect(g.players[0].avatar).toHaveLength(1);
    expect(g.players[0].avatar[0].tapped).toBe(true);
  });
  it("tie destroys both", () => {
    const g = setup(3, 3);
    fight(g);
    expect(g.players[0].avatar).toHaveLength(0);
    expect(g.players[1].avatar).toHaveLength(0);
  });
  it("0 vs 0 does nothing", () => {
    const g = setup(0, 0);
    fight(g);
    expect(g.players[0].avatar).toHaveLength(1);
    expect(g.players[1].avatar).toHaveLength(1);
  });
  it("ลูกฮึด wins ties against non-holder", () => {
    const g = setup(3, 3, "", "ลูกฮึด");
    fight(g);
    expect(g.players[0].avatar).toHaveLength(1);
    expect(g.players[1].avatar).toHaveLength(0);
  });
  it("cannot hit LIFE while opponent has an Avatar", () => {
    const g = setup(3, 3);
    expect(applyAction(g, 0, { t: "attack", id: "0:h0", target: { kind: "life" } })).toMatch(/LIFE/);
  });
  it("LIFE attack flips top life; hit while สาหัส wins the game; power 0 does not", () => {
    const g = setup(3, 3);
    g.players[1].avatar = [];
    const hit = () => {
      g.players[0].avatar[0].tapped = false;
      applyAction(g, 0, { t: "attack", id: "0:h0", target: { kind: "life" } });
      applyAction(g, 1, { t: "respond" });
    };
    hit();
    expect(g.players[1].life.filter((l) => l.up)).toHaveLength(1);
    for (let i = 0; i < 4; i++) hit();
    expect(g.players[1].life.every((l) => l.up)).toBe(true);
    expect(g.phase).toBe("battle");
    g.players[0].avatar[0].mod = -99;
    hit();
    expect(g.phase).toBe("battle");
    g.players[0].avatar[0].mod = 0;
    hit();
    expect(g.phase).toBe("over");
    expect(g.winner).toBe(0);
  });
  it("Construct only destroyed by greater power", () => {
    const wall = mk({ name: "wall", type: "Construct", power: 3, print: "C-1" });
    const a = mk({ name: "atk", power: 3, print: "AT" });
    const g = game([[a], [wall]]);
    startMain(g);
    g.players[0].avatar.push({ id: "0:h0", tapped: false, mod: 0, equip: [] });
    g.players[1].construct.push({ id: "1:h0", tapped: false, mod: 0, equip: [] });
    g.players[0].hand = [];
    g.players[1].hand = [];
    g.turnNo = 2;
    g.phase = "battle";
    const hit = () => {
      g.players[0].avatar[0].tapped = false;
      applyAction(g, 0, { t: "attack", id: "0:h0", target: { kind: "construct", id: "1:h0" } });
      applyAction(g, 1, { t: "respond" });
    };
    hit();
    expect(g.players[1].construct).toHaveLength(1); // 3 vs 3: nothing
    expect(g.players[0].avatar).toHaveLength(1);
    g.players[0].avatar[0].mod = 1;
    hit();
    expect(g.players[1].construct).toHaveLength(0);
    expect(g.players[1].hell).toContain("1:h0");
  });
});

describe("hidden information", () => {
  it("opponent view hides hand, deck and face-down life", () => {
    setCardDb(db);
    const deck = cards.filter((c) => c.type === "Avatar").slice(0, 50).map(cardKey);
    const life = cards.filter((c) => c.type === "Life").slice(0, 5).map(cardKey);
    const g = createGame([{ name: "a", main: deck, life }, { name: "b", main: deck, life }], 0);
    const v = viewFor(g, 1);
    expect(v.players[0].hand).toEqual([]);
    expect(v.players[0].handCount).toBe(5);
    expect(v.players[0].life.every((l) => l.id === null)).toBe(true);
    expect(v.players[0].deckList).toEqual([]);
    expect(Object.keys(v.cards).every((id) => id.startsWith("1:"))).toBe(true);
    expect(JSON.stringify(v)).not.toContain('"deck"');
  });
});

describe("deck validation", () => {
  it("accepts a legal deck and reports errors for bad ones", () => {
    const only = cards.find((c) => c.ex === "Only #1" && c.type === "Avatar")!;
    const pool = cards.filter((c) => c.type === "Avatar" && !c.ex?.toString().match(/Only|ลำเอียง/) && !c.customLimit);
    const names = [...new Set(pool.map((c) => c.name))];
    const main = [cardKey(only)];
    for (let i = 0; main.length < 50; i++) {
      const n = names[Math.floor(i / 4)];
      main.push(cardKey(pool.find((c) => c.name === n)!));
    }
    const life = cards.filter((c) => c.type === "Life").slice(0, 5).map(cardKey);
    expect(validateDeck(db, { name: "ok", main, life }).errors).toEqual([]);
    expect(validateDeck(db, { name: "bad", main: main.slice(1), life: life.slice(0, 4) }).errors.length).toBeGreaterThanOrEqual(2);
    expect(validateDeck(db, { name: "5x", main: [...main.slice(0, 49), main[1]], life }).errors.join()).toMatch(/สูงสุด|Only/);
  });
});
