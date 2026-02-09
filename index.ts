import { PLUGIN_ID, loadConfig, resolveAgentId, validateConfig } from './src/config';
import { createStorage } from './src/storage/IStorage';
import { LedgerEngine } from './src/ledger/ledger';
import { JobEngine } from './src/jobs/engine';
import { ConsensusToolsClient } from './src/network/client';
import { ConsensusToolsServer } from './src/network/server';
import { registerCli } from './src/cli';
import { registerTools } from './src/tools';
import { createService } from './src/service';
import type { ConsensusToolsConfig, Job } from './src/types';

export default async function register(api: any) {
  const logger = api?.logger?.child ? api.logger.child({ plugin: PLUGIN_ID }) : api?.logger;
  const loaded = loadConfig(api, logger);
  const { config } = validateConfig(loaded, logger);
  const agentId = resolveAgentId(api, config);

  const storage = createStorage(config);
  await storage.init();

  const ledger = new LedgerEngine(storage, config, logger);
  const engine = new JobEngine(storage, ledger, config, logger);
  const server = new ConsensusToolsServer(config, engine, ledger, logger);
  const client = new ConsensusToolsClient(config.global.baseUrl, config.global.accessToken, logger);

  if (config.mode === 'local') {
    await ledger.applyConfigBalances(
      config.local.ledger.balances,
      config.local.ledger.balancesMode ?? 'initial'
    );
  }

  const backend = createBackend(config, engine, ledger, client, server, storage, logger, agentId);

  api.registerCli(
    ({ program }: any) => {
      registerCli(program, backend, config, agentId);
    },
    { commands: ['consensus'] }
  );

  registerTools(api, backend, config, agentId);

  const capabilities = api?.capabilities || api?.agent?.capabilities || [];
  const serviceBackend = {
    listJobs: backend.listJobs,
    claimJob: backend.claimJob,
    heartbeat: backend.heartbeat,
    getJob: backend.getJob
  };
  const service = createService(config, serviceBackend, agentId, capabilities, logger);
  api.registerService({ id: 'consensus-tools', start: service.start, stop: service.stop });
}

function createBackend(
  config: ConsensusToolsConfig,
  engine: JobEngine,
  ledger: LedgerEngine,
  client: ConsensusToolsClient,
  server: ConsensusToolsServer,
  storage: any,
  logger: any,
  agentId: string
) {
  const ensureNetworkSideEffects = (action: string) => {
    if (config.mode === 'global' && !config.global.accessToken) {
      throw new Error('Global access token missing. Set plugins.entries.consensus-tools.config.global.accessToken.');
    }
    if (config.mode === 'global' && !config.safety.allowNetworkSideEffects) {
      throw new Error(
        `Network side effects disabled. Enable plugins.entries.consensus-tools.config.safety.allowNetworkSideEffects to ${action}.`
      );
    }
  };

  const recordLocalError = async (err: any, context: Record<string, unknown>) => {
    if (config.mode !== 'local') return;
    try {
      await engine.recordError(err?.message || 'Error', context);
    } catch {
      // ignore
    }
  };

  const ensureGlobalAccess = (action: string) => {
    if (config.mode === 'global' && !config.global.accessToken) {
      throw new Error(`Global access token missing. Set plugins.entries.consensus-tools.config.global.accessToken to ${action}.`);
    }
  };

  const backend = {
    postJob: async (actorId: string, input: any): Promise<Job> => {
      if (config.mode === 'global') {
        ensureGlobalAccess('post jobs');
        ensureNetworkSideEffects('post jobs');
        return client.postJob(actorId, input);
      }
      try {
        return await engine.postJob(actorId, input);
      } catch (err) {
        await recordLocalError(err, { action: 'postJob', actorId });
        throw err;
      }
    },
    listJobs: async (filters?: Record<string, string | undefined>): Promise<Job[]> => {
      if (config.mode === 'global') {
        ensureGlobalAccess('list jobs');
        return client.listJobs(filters || {});
      }
      return engine.listJobs(filters || {});
    },
    getJob: async (jobId: string): Promise<Job | undefined> => {
      if (config.mode === 'global') {
        ensureGlobalAccess('get jobs');
        return client.getJob(jobId);
      }
      return engine.getJob(jobId);
    },
    getStatus: async (jobId: string): Promise<any> => {
      if (config.mode === 'global') {
        ensureGlobalAccess('get job status');
        return client.getStatus(jobId);
      }
      return engine.getStatus(jobId);
    },
    claimJob: async (actorId: string, jobId: string, stakeAmount: number, leaseSeconds: number): Promise<any> => {
      if (config.mode === 'global') {
        ensureGlobalAccess('claim jobs');
        ensureNetworkSideEffects('claim jobs');
        return client.claimJob(actorId, jobId, { stakeAmount, leaseSeconds });
      }
      try {
        return await engine.claimJob(actorId, jobId, { stakeAmount, leaseSeconds });
      } catch (err) {
        await recordLocalError(err, { action: 'claimJob', actorId, jobId });
        throw err;
      }
    },
    heartbeat: async (actorId: string, jobId: string): Promise<void> => {
      if (config.mode === 'global') {
        return;
      }
      return engine.heartbeat(actorId, jobId);
    },
    submitJob: async (actorId: string, jobId: string, input: any): Promise<any> => {
      if (config.mode === 'global') {
        ensureGlobalAccess('submit jobs');
        ensureNetworkSideEffects('submit jobs');
        return client.submitJob(actorId, jobId, input);
      }
      try {
        return await engine.submitJob(actorId, jobId, input);
      } catch (err) {
        await recordLocalError(err, { action: 'submitJob', actorId, jobId });
        throw err;
      }
    },
    listSubmissions: async (jobId: string): Promise<any[]> => {
      if (config.mode === 'global') {
        ensureGlobalAccess('list submissions');
        const status = await client.getStatus(jobId);
        return status?.submissions || [];
      }
      const status = await engine.getStatus(jobId);
      return status.submissions;
    },
    listVotes: async (jobId: string): Promise<any[]> => {
      if (config.mode === 'global') {
        ensureGlobalAccess('list votes');
        const status = await client.getStatus(jobId);
        return status?.votes || [];
      }
      const status = await engine.getStatus(jobId);
      return status.votes;
    },
    vote: async (actorId: string, jobId: string, input: any): Promise<any> => {
      if (config.mode === 'global') {
        ensureGlobalAccess('vote');
        ensureNetworkSideEffects('vote');
        return client.vote(actorId, jobId, input);
      }
      try {
        return await engine.vote(actorId, jobId, input);
      } catch (err) {
        await recordLocalError(err, { action: 'vote', actorId, jobId });
        throw err;
      }
    },
    resolveJob: async (actorId: string, jobId: string, input: any): Promise<any> => {
      if (config.mode === 'global') {
        ensureGlobalAccess('resolve jobs');
        ensureNetworkSideEffects('resolve jobs');
        return client.resolveJob(actorId, jobId, input);
      }
      try {
        return await engine.resolveJob(actorId, jobId, input);
      } catch (err) {
        await recordLocalError(err, { action: 'resolveJob', actorId, jobId });
        throw err;
      }
    },
    getLedgerBalance: async (target: string): Promise<number> => {
      if (config.mode === 'global') {
        ensureGlobalAccess('read ledger');
        const result = await client.getLedger(target);
        return result.balance;
      }
      return ledger.getBalance(target);
    },
    faucet: async (target: string, amount: number): Promise<any> => {
      if (!config.local.ledger.faucetEnabled) {
        throw new Error('Faucet disabled');
      }
      if (config.mode === 'global') {
        ensureGlobalAccess('use faucet');
        ensureNetworkSideEffects('use faucet');
        throw new Error('Faucet not available over global mode');
      }
      return ledger.faucet(target, amount, `faucet:${agentId}`);
    },
    getDiagnostics: async () => {
      const errors = (await storage.getState()).errors.map((err: any) => ({ at: err.at, message: err.message }));
      let networkOk: boolean | undefined = undefined;
      if (config.mode === 'global') {
        try {
          if (!config.global.accessToken) {
            throw new Error('Global access token missing.');
          }
          await client.listJobs({});
          networkOk = true;
        } catch (err) {
          logger?.warn?.({ err }, 'consensus-tools: diagnostics network check failed');
          networkOk = false;
        }
      }
      return { errors, networkOk };
    },
    startServer: async () => server.start(),
    stopServer: async () => server.stop()
  };

  return backend;
}
