/**
 * Highlights high-value terms in text.
 * Returns an array of { text, isHighlight } segments.
 */
export function highlightTerms(
  text: string,
  terms: string[]
): Array<{ text: string; isHighlight: boolean }> {
  if (!text || terms.length === 0) {
    return [{ text, isHighlight: false }];
  }

  // Build a regex that matches any of the terms (case-insensitive, word boundary)
  const escaped = terms
    .filter((t) => t.trim().length > 1)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (escaped.length === 0) return [{ text, isHighlight: false }];

  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);

  const lowerTerms = terms.map((t) => t.toLowerCase());

  return parts.map((part) => ({
    text: part,
    isHighlight: lowerTerms.includes(part.toLowerCase()),
  }));
}
