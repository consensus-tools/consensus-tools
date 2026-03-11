import type { TraceSpan } from "@consensus-tools/schemas";

let idCounter = 0;
function traceId(): string {
  return `trace_${Date.now()}_${++idCounter}`;
}
function spanId(): string {
  return `span_${Date.now()}_${++idCounter}`;
}

/** Create a new trace span. */
export function createSpan(name: string, parentId?: string): TraceSpan {
  return {
    traceId: parentId ? parentId.split("/")[0]! : traceId(),
    spanId: spanId(),
    parentSpanId: parentId,
    name,
    startTime: new Date().toISOString(),
    status: "ok",
  };
}

/** Close a span with optional error. */
export function closeSpan(span: TraceSpan, error?: string): TraceSpan {
  return {
    ...span,
    endTime: new Date().toISOString(),
    status: error ? "error" : "ok",
    attributes: error ? { ...span.attributes, error } : span.attributes,
  };
}
