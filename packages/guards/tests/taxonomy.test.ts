import { describe, it, expect } from "vitest";
import { detectHardBlockFlags, HARD_BLOCK_FLAGS } from "../src/taxonomy.js";

describe("HARD_BLOCK_FLAGS", () => {
  it("contains exactly 7 flag types", () => {
    expect(HARD_BLOCK_FLAGS).toHaveLength(7);
  });

  it("includes all expected flags", () => {
    expect(HARD_BLOCK_FLAGS).toContain("SENSITIVE_DATA");
    expect(HARD_BLOCK_FLAGS).toContain("LEGAL_CLAIM");
    expect(HARD_BLOCK_FLAGS).toContain("MEDICAL_CLAIM");
    expect(HARD_BLOCK_FLAGS).toContain("THREAT_OR_HARASSMENT");
    expect(HARD_BLOCK_FLAGS).toContain("CONFIDENTIALITY_BREACH");
    expect(HARD_BLOCK_FLAGS).toContain("WRONGDOING_INSTRUCTION");
    expect(HARD_BLOCK_FLAGS).toContain("DISALLOWED_GUARANTEE");
  });
});

describe("detectHardBlockFlags", () => {
  it("returns empty array for clean text", () => {
    expect(detectHardBlockFlags("Hello, how can I help you today?")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(detectHardBlockFlags("")).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    expect(detectHardBlockFlags(undefined as unknown as string)).toEqual([]);
  });

  it("returns empty array when called with no arguments", () => {
    expect(detectHardBlockFlags()).toEqual([]);
  });

  it("detects SENSITIVE_DATA via SSN", () => {
    expect(detectHardBlockFlags("Please provide your SSN")).toContain("SENSITIVE_DATA");
  });

  it("detects SENSITIVE_DATA via social security", () => {
    expect(detectHardBlockFlags("Enter your social security number")).toContain("SENSITIVE_DATA");
  });

  it("detects SENSITIVE_DATA via dob", () => {
    expect(detectHardBlockFlags("What is your dob?")).toContain("SENSITIVE_DATA");
  });

  it("detects SENSITIVE_DATA via account number", () => {
    expect(detectHardBlockFlags("Send your account number")).toContain("SENSITIVE_DATA");
  });

  it("detects LEGAL_CLAIM via legal certainty", () => {
    expect(detectHardBlockFlags("With legal certainty we can say")).toContain("LEGAL_CLAIM");
  });

  it("detects LEGAL_CLAIM via lawsuit", () => {
    expect(detectHardBlockFlags("You should file a lawsuit")).toContain("LEGAL_CLAIM");
  });

  it("detects LEGAL_CLAIM via liable", () => {
    expect(detectHardBlockFlags("The company is liable for damages")).toContain("LEGAL_CLAIM");
  });

  it("detects MEDICAL_CLAIM via medical certainty", () => {
    expect(detectHardBlockFlags("With medical certainty this will work")).toContain("MEDICAL_CLAIM");
  });

  it("detects MEDICAL_CLAIM via diagnose", () => {
    expect(detectHardBlockFlags("I can diagnose your condition")).toContain("MEDICAL_CLAIM");
  });

  it("detects MEDICAL_CLAIM via cure", () => {
    expect(detectHardBlockFlags("This will cure your illness")).toContain("MEDICAL_CLAIM");
  });

  it("detects THREAT_OR_HARASSMENT via threat", () => {
    expect(detectHardBlockFlags("This is a threat to your safety")).toContain("THREAT_OR_HARASSMENT");
  });

  it("detects THREAT_OR_HARASSMENT via harass", () => {
    expect(detectHardBlockFlags("Stop harassing people")).toContain("THREAT_OR_HARASSMENT");
  });

  it("detects THREAT_OR_HARASSMENT via abuse", () => {
    expect(detectHardBlockFlags("This is considered abuse")).toContain("THREAT_OR_HARASSMENT");
  });

  it("detects CONFIDENTIALITY_BREACH via confidential", () => {
    expect(detectHardBlockFlags("This document is confidential")).toContain("CONFIDENTIALITY_BREACH");
  });

  it("detects CONFIDENTIALITY_BREACH via nda", () => {
    expect(detectHardBlockFlags("Covered by our NDA")).toContain("CONFIDENTIALITY_BREACH");
  });

  it("detects CONFIDENTIALITY_BREACH via private key", () => {
    expect(detectHardBlockFlags("Here is the private key")).toContain("CONFIDENTIALITY_BREACH");
  });

  it("detects WRONGDOING_INSTRUCTION via bypass", () => {
    expect(detectHardBlockFlags("How to bypass the security")).toContain("WRONGDOING_INSTRUCTION");
  });

  it("detects WRONGDOING_INSTRUCTION via exploit", () => {
    expect(detectHardBlockFlags("Use this exploit to gain access")).toContain("WRONGDOING_INSTRUCTION");
  });

  it("detects WRONGDOING_INSTRUCTION via steal", () => {
    expect(detectHardBlockFlags("How to steal credentials")).toContain("WRONGDOING_INSTRUCTION");
  });

  it("detects WRONGDOING_INSTRUCTION via hack", () => {
    expect(detectHardBlockFlags("Learn to hack systems")).toContain("WRONGDOING_INSTRUCTION");
  });

  it("detects DISALLOWED_GUARANTEE via guarantee", () => {
    expect(detectHardBlockFlags("We guarantee results")).toContain("DISALLOWED_GUARANTEE");
  });

  it("detects DISALLOWED_GUARANTEE via guaranteed", () => {
    expect(detectHardBlockFlags("Success is guaranteed")).toContain("DISALLOWED_GUARANTEE");
  });

  it("detects DISALLOWED_GUARANTEE via promise forever", () => {
    expect(detectHardBlockFlags("We promise forever support")).toContain("DISALLOWED_GUARANTEE");
  });

  it("is case-insensitive", () => {
    expect(detectHardBlockFlags("YOUR SSN IS REQUIRED")).toContain("SENSITIVE_DATA");
    expect(detectHardBlockFlags("GUARANTEED RESULTS")).toContain("DISALLOWED_GUARANTEE");
  });

  it("detects multiple flags in one text", () => {
    const flags = detectHardBlockFlags(
      "Send your SSN and we guarantee a cure, plus here is a private key to hack the system",
    );
    expect(flags).toContain("SENSITIVE_DATA");
    expect(flags).toContain("DISALLOWED_GUARANTEE");
    expect(flags).toContain("MEDICAL_CLAIM");
    expect(flags).toContain("CONFIDENTIALITY_BREACH");
    expect(flags).toContain("WRONGDOING_INSTRUCTION");
    expect(flags.length).toBeGreaterThanOrEqual(5);
  });

  it("deduplicates flags", () => {
    const flags = detectHardBlockFlags("SSN and social security and account number");
    const sensitiveCount = flags.filter((f) => f === "SENSITIVE_DATA").length;
    expect(sensitiveCount).toBe(1);
  });
});
