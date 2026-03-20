export type SeoHardBlockFlag = "DESIGN_MUTATION" | "ROUTE_CHANGE" | "CONTENT_REWRITE";

interface PatternGroup {
  flag: SeoHardBlockFlag;
  patterns: RegExp[];
}

const SEO_PATTERN_GROUPS: PatternGroup[] = [
  {
    flag: "DESIGN_MUTATION",
    patterns: [
      /\bclassName\s*=/,
      /\bstyle\s*=/,
      /\.module\.(css|scss|sass)/,
      /\btailwind\b/i,
      /\bcss\b.*\bimport\b|\bimport\b.*\bcss\b/i,
    ],
  },
  {
    flag: "ROUTE_CHANGE",
    patterns: [
      /\bredirects?\s*:/i,
      /\brewrites?\s*:/i,
      /app\/.*\/page\.(tsx|ts|jsx|js)/,
      /\brouter\.(push|replace)\b/,
    ],
  },
  {
    flag: "CONTENT_REWRITE",
    patterns: [
      />[^<]{20,}</,
    ],
  },
];

export const SEO_HARD_BLOCK_PATTERNS: RegExp[] = SEO_PATTERN_GROUPS.flatMap(
  (g) => g.patterns,
);

export function detectSeoHardBlocks(text: string): SeoHardBlockFlag[] {
  const flags: SeoHardBlockFlag[] = [];
  for (const group of SEO_PATTERN_GROUPS) {
    if (group.patterns.some((p) => p.test(text))) {
      flags.push(group.flag);
    }
  }
  return flags;
}
