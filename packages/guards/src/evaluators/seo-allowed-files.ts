const ALLOWED_PATTERNS: RegExp[] = [
  /^robots\.txt$/,
  /^sitemap\.(xml|ts|js)$/,
  /^app\/robots\.(ts|js)$/,
  /^app\/sitemap\.(ts|js)$/,
  /layout\.(tsx|ts|jsx|js)$/,
  /^next\.config\.(mjs|js|ts)$/,
  /\.(mdx|md)$/,
];

const BLOCKED_PATTERNS: RegExp[] = [
  /\.(css|scss|sass)$/,
  /^components\//,
  /page\.(tsx|ts|jsx|js)$/,
  /\.module\.(css|scss)$/,
];

export function isAllowedSeoFile(filePath: string): boolean {
  // Blocked patterns take precedence
  if (BLOCKED_PATTERNS.some((p) => p.test(filePath))) {
    return false;
  }
  return ALLOWED_PATTERNS.some((p) => p.test(filePath));
}
