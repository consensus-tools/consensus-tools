/**
 * Hard-block flag detection for guard evaluation.
 * Ported from consensus-guard-core/src/taxonomy.mjs.
 *
 * These patterns trigger automatic BLOCK decisions regardless of
 * persona votes or policy thresholds. They represent safety-critical
 * content that must never be approved.
 */

export const HARD_BLOCK_FLAGS = [
  "SENSITIVE_DATA",
  "LEGAL_CLAIM",
  "MEDICAL_CLAIM",
  "THREAT_OR_HARASSMENT",
  "CONFIDENTIALITY_BREACH",
  "WRONGDOING_INSTRUCTION",
  "DISALLOWED_GUARANTEE",
] as const;

export type HardBlockFlag = (typeof HARD_BLOCK_FLAGS)[number];

export function detectHardBlockFlags(text = ""): HardBlockFlag[] {
  const t = text.toLowerCase();
  const out: HardBlockFlag[] = [];

  if (/ssn|social security|dob|account number/.test(t)) out.push("SENSITIVE_DATA");
  if (/legal certainty|lawsuit|liable/.test(t)) out.push("LEGAL_CLAIM");
  if (/medical certainty|diagnose|cure/.test(t)) out.push("MEDICAL_CLAIM");
  if (/threat|harass|abuse/.test(t)) out.push("THREAT_OR_HARASSMENT");
  if (/confidential|nda|private key/.test(t)) out.push("CONFIDENTIALITY_BREACH");
  if (/bypass|exploit|steal|hack/.test(t)) out.push("WRONGDOING_INSTRUCTION");
  if (/guarantee|guaranteed|promise forever/.test(t)) out.push("DISALLOWED_GUARANTEE");

  return [...new Set(out)];
}
