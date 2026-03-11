import type { TelemetryEvent } from "@consensus-tools/schemas";
import type { Sink } from "./sink.js";

/** Console-based sink for local development. */
export class ConsoleSink implements Sink {
  name = "console";
  write(event: TelemetryEvent): void {
    const line = `[${event.timestamp}] ${event.type} ${event.jobId ?? ""}`;
    console.log(line);
  }
}

/** File-based sink that appends NDJSON to a local file. */
export class FileSink implements Sink {
  name = "file";
  private buffer: string[] = [];

  constructor(private readonly path: string) {}

  write(event: TelemetryEvent): void {
    this.buffer.push(JSON.stringify(event));
  }

  async flush(): Promise<void> {
    if (!this.buffer.length) return;
    const { writeFile, appendFile } = await import("node:fs/promises");
    const data = this.buffer.join("\n") + "\n";
    this.buffer = [];
    try {
      await appendFile(this.path, data, "utf-8");
    } catch {
      await writeFile(this.path, data, "utf-8");
    }
  }

  async close(): Promise<void> {
    await this.flush();
  }
}
