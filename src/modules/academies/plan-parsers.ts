import { collectPriceMatches } from "./price-parser.js";
import type { GymDefinition, GymPlan } from "./types.js";

const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const unique = (values: string[]): string[] => {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
};

const splitNonEmptyLines = (value: string): string[] => {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const extractFirstPrice = (value: string): string | null => {
  return collectPriceMatches(value)[0] ?? null;
};

const buildSegmentRegex = (names: string[], tailMarkers: string[]): RegExp => {
  const escapedNames = [...names]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join("|");
  const escapedTailMarkers = tailMarkers.map(escapeRegExp).join("|");

  return new RegExp(
    `(${escapedNames})\\s+([\\s\\S]*?)(?=(?:${escapedNames})|(?:${escapedTailMarkers})|$)`,
    "gi"
  );
};

const collectSmartFitPlans = (text: string): GymPlan[] => {
  const regex = buildSegmentRegex(
    ["Plano Black", "Plano Fit", "Plano Smart"],
    ["*Os preços", "Conheça nossos produtos", "Siga a Smart Fit"]
  );
  const plans: GymPlan[] = [];

  for (const match of text.matchAll(regex)) {
    const name = normalizeWhitespace(match[1] ?? "");
    const segment = String(match[2] ?? "");
    const normalizedSegment = normalizeWhitespace(segment);
    const lines = splitNonEmptyLines(segment);
    const promoLineIndex = lines.findIndex((line) => /no 1º mês, depois/i.test(line));
    const ctaLineIndex = lines.findIndex((line) => /^(Contratar agora|Buscar academia)$/i.test(line));
    const priceMarkerIndex = lines.findIndex((line) => /A PARTIR DE/i.test(line));
    const descriptionLines =
      priceMarkerIndex > 0 ? lines.slice(0, priceMarkerIndex) : lines.slice(0, 2);
    const priceMatch =
      /A PARTIR DE[\s\S]{0,80}?(R\$\s?\d{1,4}(?:[.,]\d{2})?)/i.exec(segment)?.[1] ??
      extractFirstPrice(segment);
    const promoText =
      promoLineIndex >= 0
        ? unique(
            lines
              .slice(Math.max(0, promoLineIndex - 2), promoLineIndex + 1)
              .filter((line) => /R\$|OFF|grátis|mês|depois/i.test(line))
          ).join(" | ") || null
        : null;
    const commitment =
      lines.find((line) => /sem fidelidade|\d+\s+meses de fidelidade/i.test(line)) ?? null;
    const benefits =
      ctaLineIndex >= 0
        ? lines
            .slice(ctaLineIndex + 1)
            .filter(
              (line) =>
                !/^(R\$|100% OFF|no 1º mês|Saiba mais)/i.test(line) &&
                !/sem fidelidade|\d+\s+meses de fidelidade/i.test(line) &&
                !/^\*/.test(line)
            )
            .slice(0, 8)
        : [];

    plans.push({
      name,
      headlinePrice: priceMatch ? normalizeWhitespace(priceMatch) : null,
      pricePeriod: "/mês",
      promotionalText: promoText,
      commitment,
      enrollmentFee: null,
      annualFee: null,
      description: descriptionLines.length > 0 ? normalizeWhitespace(descriptionLines.join(" ")) : null,
      benefits: unique(benefits)
    });
  }

  return plans;
};

const collectBluefitPlans = (text: string): GymPlan[] => {
  const regex = new RegExp(
    `PLANO\\s+(GOLD PLUS|PREMIUM PLUS|PREMIUM|GOLD|BLUE)\\s+([\\s\\S]*?)(?=PLANO\\s+(?:GOLD PLUS|PREMIUM PLUS|PREMIUM|GOLD|BLUE)|Valores e condições|$)`,
    "gi"
  );
  const plans: GymPlan[] = [];

  for (const match of text.matchAll(regex)) {
    const name = normalizeWhitespace(match[1] ?? "");
    const segment = String(match[2] ?? "");
    const normalizedSegment = normalizeWhitespace(segment);
    const lines = splitNonEmptyLines(segment);
    const hasExplicitMonthlyLine = lines.some((line) => /^por mês$/i.test(line));
    const headlinePrice =
      /de\s+(R\$\s?\d{1,4}(?:[.,]\d{2})?)\s+por/i.exec(normalizedSegment)?.[1] ??
      /A partir de:\s*(R\$\s?\d{1,4}(?:[.,]\d{2})?)/i.exec(normalizedSegment)?.[1] ??
      /R\$\s*(\d{1,4}(?:[.,]\d{2})?)\s+por mês/i.exec(normalizedSegment)?.[0]?.replace(/\s+/g, " ").replace(/ por mês/i, "") ??
      extractFirstPrice(segment);
    const promoLineIndex = lines.findIndex((line) => /grátis/i.test(line));
    const promotionalText =
      promoLineIndex >= 0
        ? unique(
            lines
              .slice(promoLineIndex, promoLineIndex + 2)
              .filter((line) => /grátis|mês/i.test(line))
          ).join(" ") || null
        : null;
    const commitment =
      lines.find((line) => /fidelidade de \d+ meses|sem fidelidade/i.test(line)) ?? null;
    const enrollmentFee =
      /Taxa de matrícula de\s+(R\$\s?\d{1,4}(?:[.,]\d{2})?)/i.exec(normalizedSegment)?.[1] ??
      null;
    const annualFee =
      /Taxa de anuidade de\s+(R\$\s?\d{1,4}(?:[.,]\d{2})?)/i.exec(normalizedSegment)?.[1] ??
      null;
    const benefits = lines
      .filter(
        (line) =>
          !/^(Grátis|No 1º mês|Matricule-se)$/i.test(line) &&
          !/^RECOMENDADO$/i.test(line) &&
          !/^A partir de:?$/i.test(line) &&
          !/^R\$/.test(line) &&
          !/^de R\$/.test(line) &&
          !/^\d{1,4}(?:[.,]\d{2})$/.test(line) &&
          !/^por mês$/i.test(line) &&
          !/fidelidade de \d+ meses|sem fidelidade/i.test(line) &&
          !/Taxa de matrícula|Taxa de anuidade/i.test(line)
      )
      .slice(0, 8);

    plans.push({
      name,
      headlinePrice: headlinePrice ? normalizeWhitespace(headlinePrice) : null,
      pricePeriod: hasExplicitMonthlyLine ? "por mês" : null,
      promotionalText,
      commitment,
      enrollmentFee,
      annualFee,
      description: null,
      benefits: unique(benefits)
    });
  }

  return plans;
};

export const extractPlansFromText = (gym: GymDefinition, text: string): GymPlan[] => {
  if (!text.trim()) {
    return [];
  }

  if (gym.planParser === "smartfit") {
    return collectSmartFitPlans(text);
  }

  if (gym.planParser === "bluefit") {
    return collectBluefitPlans(text);
  }

  return [];
};
