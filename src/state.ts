// Shared in-memory state for dashboard and bot

export type PriceEntry = { dex: string; price: number };
export type SpreadEntry = { buy: string; sell: string; profit: number };

export const latestPrices: PriceEntry[] = [];
export const topSpreads: SpreadEntry[] = [];
export const warnings: string[] = [];

// These arrays should be updated by your bot logic elsewhere in the app. 