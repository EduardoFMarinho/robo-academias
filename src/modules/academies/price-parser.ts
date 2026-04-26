const PRICE_PATTERN = /R\$\s?\d{1,4}(?:[.,]\d{2})?/gi;
const PRICE_CAPTURE_PATTERN = /(R\$\s?\d{1,4}(?:[.,]\d{2})?)/i;

const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const collectPriceMatches = (value: string): string[] => {
  const matches = normalizeWhitespace(value).match(PRICE_PATTERN) ?? [];
  const unique = new Set<string>();

  for (const match of matches) {
    unique.add(normalizeWhitespace(match));
  }

  return [...unique];
};

export const pickBestPrice = (
  value: string,
  anchors: string[]
): {
  currentPrice: string | null;
  detectedPrices: string[];
  sourceHint: string | null;
} => {
  const normalized = normalizeWhitespace(value);

  for (const anchor of anchors) {
    const anchoredPattern = new RegExp(
      `${escapeRegExp(anchor)}[\\s\\S]{0,220}?${PRICE_CAPTURE_PATTERN.source}`,
      "i"
    );
    const match = anchoredPattern.exec(normalized);

    if (match?.[1]) {
      return {
        currentPrice: normalizeWhitespace(match[1]),
        detectedPrices: collectPriceMatches(normalized),
        sourceHint: `anchor:${anchor}`
      };
    }
  }

  const detectedPrices = collectPriceMatches(normalized);

  return {
    currentPrice: detectedPrices[0] ?? null,
    detectedPrices,
    sourceHint: detectedPrices[0] ? "fallback:first-price" : null
  };
};
