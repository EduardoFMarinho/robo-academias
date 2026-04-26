// Estes tipos representam apenas o que cada robo coleta do site.
export type GymId = "smartfit" | "bluefit";

export interface GymDefinition {
  id: GymId;
  name: string;
  sourceUrl: string;
}

export interface GymPlan {
  name: string;
  headlinePrice: string | null;
  pricePeriod: string | null;
}

export interface GymScrapeData {
  currentPrice: string | null;
  currentPlanName: string | null;
  detectedPrices: string[];
  plans: GymPlan[];
  sourceHint: string | null;
}
