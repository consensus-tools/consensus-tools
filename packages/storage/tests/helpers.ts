import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { JsonStorage } from "../src/json.js";

export async function createTempStorage() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "consensus-storage-test-"));
  const filePath = path.join(dir, "state.json");
  const storage = new JsonStorage(filePath);
  await storage.init();
  return { storage, filePath, dir };
}
