import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { JsonStorage } from "@consensus-tools/storage";

export async function createTempStorage() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "consensus-tools-wf-test-"));
  const filePath = path.join(dir, "state.json");
  const storage = new JsonStorage(filePath);
  await storage.init();
  return { storage, filePath, dir };
}
