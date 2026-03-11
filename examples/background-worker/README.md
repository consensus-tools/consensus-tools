# Background Worker Example

Demonstrates a long-running worker that polls for open jobs, claims them, and submits results.

```ts
import { LocalBoard, createStorage, JobEngine, LedgerEngine } from "@consensus-tools/core";
import { createRegistryResolver } from "@consensus-tools/policies";
import { EventBuffer, ConsoleSink, createEvent } from "@consensus-tools/telemetry";

const config = { /* ... */ };
const storage = createStorage(config);
await storage.init();

const ledger = new LedgerEngine(storage, config);
const resolver = createRegistryResolver();
const engine = new JobEngine(storage, ledger, config, undefined, resolver);

const telemetry = new EventBuffer([new ConsoleSink()]);

async function pollLoop() {
  while (true) {
    const jobs = await engine.listJobs({ status: "OPEN" });
    for (const job of jobs) {
      telemetry.push(createEvent("job.claimed", job.id));
      await engine.claimJob("worker-agent", job.id, { stakeAmount: 1, leaseSeconds: 300 });
      // ... do work, submit result ...
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

pollLoop().catch(console.error);
```
