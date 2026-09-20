export type CardType = "Avatar" | "Magic" | "Life" | "Construct" | "Token";

export interface Card {
  name: string;
  type: CardType;
  soi: number;
  print: string;
  rare: string;
  mainEffect: string;
  cost?: number;
  gem?: number;
  power?: number;
  symbol?: string;
  color?: string;
  subtype?: "Normal" | "Modification" | "React" | "Land" | string;
  creator?: string;
  ex?: unknown;
  gemColor?: string;
  customLimit?: number;
  favorText?: string;
}

const CDN = "https://cdn.bottcg.com/cards";
const RARE_SUFFIX = ["SCR", "PR", "CBR"];
const SET_FOLDER: Record<string, string> = { SD09: "123v1k1" };

// Mirrors bottcg.com's getCardImageUrl.
export function cardImageUrl(card: Pick<Card, "print" | "rare">): string {
  const folder = SET_FOLDER[card.print.split("-")[0]];
  const base = folder ? `${CDN}/${folder}` : CDN;
  const file = RARE_SUFFIX.includes(card.rare) ? `${card.print}-${card.rare}` : card.print;
  return `${base}/${file}.png`;
}
