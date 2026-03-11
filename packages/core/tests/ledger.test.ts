import { describe, it, expect } from "vitest";
import { createTempStorage, makeConfig } from "./helpers.js";
import { LedgerEngine } from "../src/ledger/ledger.js";

async function makeLedger(configOverrides: Record<string, any> = {}) {
  const { storage } = await createTempStorage();
  const config = makeConfig(configOverrides);
  return { ledger: new LedgerEngine(storage, config), storage };
}

describe("LedgerEngine", () => {
  it("faucet adds credits", async () => {
    const { ledger } = await makeLedger();
    await ledger.faucet("a1", 100, "test");
    expect(await ledger.getBalance("a1")).toBe(100);
  });

  it("stake deducts credits", async () => {
    const { ledger } = await makeLedger();
    await ledger.faucet("a1", 100, "test");
    await ledger.stake("a1", 30, "job-1");
    expect(await ledger.getBalance("a1")).toBe(70);
  });

  it("payout adds credits", async () => {
    const { ledger } = await makeLedger();
    await ledger.faucet("a1", 100, "test");
    await ledger.payout("a1", 5, "job-1");
    expect(await ledger.getBalance("a1")).toBe(105);
  });

  it("unstake returns staked credits", async () => {
    const { ledger } = await makeLedger();
    await ledger.faucet("a1", 100, "test");
    await ledger.stake("a1", 10, "job-1");
    await ledger.unstake("a1", 10, "job-1");
    expect(await ledger.getBalance("a1")).toBe(100);
  });

  it("full lifecycle: faucet+stake+payout+unstake", async () => {
    const { ledger } = await makeLedger();
    await ledger.faucet("a1", 100, "test");
    await ledger.stake("a1", 10, "job-1");
    await ledger.payout("a1", 5, "job-1");
    await ledger.unstake("a1", 10, "job-1");
    // 100 - 10 + 5 + 10 = 105
    expect(await ledger.getBalance("a1")).toBe(105);
  });

  it("prevents negative balance on stake", async () => {
    const { ledger } = await makeLedger();
    await ledger.faucet("a1", 5, "test");
    await expect(ledger.stake("a1", 10, "job-1")).rejects.toThrow();
  });

  it("prevents negative balance on slash", async () => {
    const { ledger } = await makeLedger();
    await ledger.faucet("a1", 5, "test");
    await expect(ledger.slash("a1", 10, "job-1")).rejects.toThrow();
  });

  it("ensureInitialCredits is idempotent", async () => {
    const { ledger } = await makeLedger();
    await ledger.ensureInitialCredits("a1");
    await ledger.ensureInitialCredits("a1");
    expect(await ledger.getBalance("a1")).toBe(100); // initialCreditsPerAgent default
  });
});
