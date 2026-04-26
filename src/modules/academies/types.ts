export type GymPlanParserId = "smartfit" | "bluefit";

export interface GymDefinition {
  id: string;
  name: string;
  sourceUrl: string;
  selectorCandidates: string[];
  anchorPhrases: string[];
  keywordWaitHints: string[];
  planParser: GymPlanParserId;
}

export interface GymPlan {
  name: string;
  headlinePrice: string | null;
  pricePeriod: string | null;
  promotionalText: string | null;
  commitment: string | null;
  enrollmentFee: string | null;
  annualFee: string | null;
  description: string | null;
  benefits: string[];
}

export interface ScrapeOutcome {
  gymId: string;
  gymName: string;
  sourceUrl: string;
  status: "ok" | "error";
  currentPrice: string | null;
  currentPlanName: string | null;
  detectedPrices: string[];
  plans: GymPlan[];
  sourceHint: string | null;
  checkedAt: string;
  errorMessage?: string;
  screenshotPath?: string | null;
}

export interface ScrapeSummary {
  executionId: string;
  trigger: string;
  startedAt: string;
  finishedAt: string;
  status: "success" | "partial" | "error";
  results: ScrapeOutcome[];
  successfulGyms: number;
  failedGyms: number;
  reusedExistingRun: boolean;
}

export type ScrapeProgressEvent =
  | {
      type: "queued_existing_run";
      executionId: string;
      trigger: string;
    }
  | {
      type: "started";
      executionId: string;
      trigger: string;
      startedAt: string;
      gymCount: number;
    }
  | {
      type: "gym_started";
      executionId: string;
      trigger: string;
      gymId: string;
      gymName: string;
      index: number;
      total: number;
    }
  | {
      type: "gym_finished";
      executionId: string;
      trigger: string;
      gymId: string;
      gymName: string;
      index: number;
      total: number;
      status: ScrapeOutcome["status"];
      currentPrice: string | null;
      currentPlanName: string | null;
      planCount: number;
      errorMessage?: string | null;
    }
  | {
      type: "finished";
      executionId: string;
      trigger: string;
      finishedAt: string;
      status: ScrapeSummary["status"];
      successfulGyms: number;
      failedGyms: number;
    };

export interface RunScrapeOptions {
  onProgress?: (event: ScrapeProgressEvent) => void | Promise<void>;
}
