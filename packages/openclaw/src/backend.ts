import type { ConsensusToolsConfig, Job } from "@consensus-tools/schemas";
import { JobEngine, LedgerEngine, createStorage, deepCopy } from "@consensus-tools/core";
import { ConsensusToolsClient } from "@consensus-tools/client";
import { createRegistryResolver } from "@consensus-tools/policies";
import type { ConsensusToolsBackend } from "./tools.js";

export function createBackend(
  config: ConsensusToolsConfig,
  engine: JobEngine,
  ledger: LedgerEngine,
  client: ConsensusToolsClient,
  storage: { init(): Promise<void>; getState(): Promise<any> },
  logger: { warn?: (...args: unknown[]) => void } | undefined,
  agentId: string,
): ConsensusToolsBackend {
  let readyPromise: Promise<void> | null = null;
  const ensureReady = async () => {
    if (!readyPromise) {
      readyPromise = (async () => {
        await storage.init();
        if (config.mode === "local") {
          await ledger.applyConfigBalances(
            config.local.ledger.balances,
            config.local.ledger.balancesMode ?? "initial",
          );
        }
      })();
    }
    return readyPromise;
  };

  const ensureNetworkSideEffects = (action: string) => {
    if (config.mode === "global" && !config.global.accessToken) {
      throw new Error("Global access token missing.");
    }
    if (config.mode === "global" && !config.safety.allowNetworkSideEffects) {
      throw new Error(`Network side effects disabled. Enable safety.allowNetworkSideEffects to ${action}.`);
    }
  };

  const ensureGlobalAccess = (action: string) => {
    if (config.mode === "global" && !config.global.accessToken) {
      throw new Error(`Global access token missing to ${action}.`);
    }
  };

  const recordLocalError = async (err: unknown, context: Record<string, unknown>) => {
    if (config.mode !== "local") return;
    try {
      await engine.recordError(err instanceof Error ? err.message : "Error", context);
    } catch { /* ignore */ }
  };

  return {
    postJob: async (actorId, input) => {
      await ensureReady();
      if (config.mode === "global") { ensureGlobalAccess("post jobs"); ensureNetworkSideEffects("post jobs"); return client.postJob(actorId, input as any); }
      try { return await engine.postJob(actorId, input as any); } catch (err) { await recordLocalError(err, { action: "postJob", actorId }); throw err; }
    },
    listJobs: async (filters) => {
      await ensureReady();
      if (config.mode === "global") { ensureGlobalAccess("list jobs"); return client.listJobs(filters || {}); }
      return engine.listJobs(filters || {});
    },
    getJob: async (jobId) => {
      await ensureReady();
      if (config.mode === "global") { ensureGlobalAccess("get jobs"); return client.getJob(jobId); }
      return engine.getJob(jobId);
    },
    getStatus: async (jobId) => {
      await ensureReady();
      if (config.mode === "global") { ensureGlobalAccess("get status"); return client.getStatus(jobId); }
      return engine.getStatus(jobId);
    },
    claimJob: async (actorId, jobId, stakeAmount, leaseSeconds) => {
      await ensureReady();
      if (config.mode === "global") { ensureGlobalAccess("claim jobs"); ensureNetworkSideEffects("claim jobs"); return client.claimJob(actorId, jobId, { stakeAmount, leaseSeconds } as any); }
      try { return await engine.claimJob(actorId, jobId, { stakeAmount, leaseSeconds }); } catch (err) { await recordLocalError(err, { action: "claimJob", actorId, jobId }); throw err; }
    },
    heartbeat: async (actorId, jobId) => {
      await ensureReady();
      if (config.mode === "global") return;
      return engine.heartbeat(actorId, jobId);
    },
    submitJob: async (actorId, jobId, input) => {
      await ensureReady();
      if (config.mode === "global") { ensureGlobalAccess("submit"); ensureNetworkSideEffects("submit"); return client.submitJob(actorId, jobId, input as any); }
      try { return await engine.submitJob(actorId, jobId, input as any); } catch (err) { await recordLocalError(err, { action: "submitJob", actorId, jobId }); throw err; }
    },
    vote: async (actorId, jobId, input) => {
      await ensureReady();
      if (config.mode === "global") { ensureGlobalAccess("vote"); ensureNetworkSideEffects("vote"); return client.vote(actorId, jobId, input as any); }
      try { return await engine.vote(actorId, jobId, input as any); } catch (err) { await recordLocalError(err, { action: "vote", actorId, jobId }); throw err; }
    },
    resolveJob: async (actorId, jobId, input) => {
      await ensureReady();
      if (config.mode === "global") { ensureGlobalAccess("resolve"); ensureNetworkSideEffects("resolve"); return client.resolveJob(actorId, jobId, input as any); }
      try { return await engine.resolveJob(actorId, jobId, input as any); } catch (err) { await recordLocalError(err, { action: "resolveJob", actorId, jobId }); throw err; }
    },
    getLedgerBalance: async (target) => {
      await ensureReady();
      if (config.mode === "global") { ensureGlobalAccess("read ledger"); const r = await client.getLedger(target); return r.balance; }
      return ledger.getBalance(target);
    },
    faucet: async (target, amount) => {
      await ensureReady();
      if (!config.local.ledger.faucetEnabled) throw new Error("Faucet disabled");
      if (config.mode === "global") throw new Error("Faucet not available in global mode");
      return ledger.faucet(target, amount, `faucet:${agentId}`);
    },
    getDiagnostics: async () => {
      await ensureReady();
      const errors = ((await storage.getState()).errors ?? []).map((e: any) => ({ at: e.at, message: e.message }));
      let networkOk: boolean | undefined;
      if (config.mode === "global") {
        try { if (!config.global.accessToken) throw new Error("no token"); await client.listJobs({}); networkOk = true; } catch { networkOk = false; }
      }
      return { errors, networkOk };
    },
    startServer: async () => { await ensureReady(); },
    stopServer: async () => {},
  };
}
