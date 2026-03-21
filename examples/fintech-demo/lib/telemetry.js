import { EventBuffer, createEvent, ConsoleSink, FileSink } from "@consensus-tools/telemetry";

class SSESink {
  clients = new Set();
  addClient(res) { this.clients.add(res); }
  removeClient(res) { this.clients.delete(res); }
  write(event) {
    const data = JSON.stringify(event);
    for (const res of this.clients) {
      try { res.write(`data: ${data}\n\n`); }
      catch { this.clients.delete(res); }
    }
  }
}

export function createTelemetry(auditPath) {
  const sseSink = new SSESink();
  const buffer = new EventBuffer(
    [new ConsoleSink(), new FileSink(auditPath), sseSink],
    1, // flush immediately for real-time SSE
    0,
  );
  const emit = (type, jobId, metadata) => buffer.push(createEvent(type, jobId, metadata));
  return { buffer, sseSink, emit };
}
