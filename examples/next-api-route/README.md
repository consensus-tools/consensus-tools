# Next.js API Route Example

Demonstrates using `@consensus-tools/core` inside a Next.js API route handler.

```ts
// app/api/consensus/route.ts
import { LocalBoard, createStorage } from "@consensus-tools/core";
import { createRegistryResolver } from "@consensus-tools/policies";

const board = new LocalBoard(createStorage(config), config);

export async function POST(req: Request) {
  const body = await req.json();
  const job = await board.postJob("web-user", body);
  return Response.json(job);
}
```
