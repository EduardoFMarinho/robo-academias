import { env } from "../../config/env.js";
import type { GymDefinition } from "./types.js";

export const gymCatalog: GymDefinition[] = [
  {
    id: "smartfit",
    name: "Smart Fit",
    sourceUrl: env.SMARTFIT_SOURCE_URL,
    selectorCandidates: ["main", "section", "body"],
    anchorPhrases: ["Plano Black", "Plano Fit", "Plano Smart", "A PARTIR DE"],
    keywordWaitHints: ["Plano Black", "Plano Fit", "Planos Smart Fit"],
    planParser: "smartfit"
  },
  {
    id: "bluefit",
    name: "Bluefit",
    sourceUrl: env.BLUEFIT_SOURCE_URL,
    selectorCandidates: ["main", "section", "body"],
    anchorPhrases: ["Planos de Assinatura", "A partir de", "Planos a partir de"],
    keywordWaitHints: ["Planos de Assinatura", "Planos a partir de", "Bluefit"],
    planParser: "bluefit"
  }
];
