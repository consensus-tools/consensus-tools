import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;

export interface CredentialStore {
  entries: Map<string, EncryptedEntry>;
}

interface EncryptedEntry {
  id: string;
  provider: string;
  keyName: string;
  encrypted: string;
  createdAt: number;
  updatedAt: number;
}

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, "consensus-tools-salt", 32);
}

export function encrypt(plaintext: string, secretKey: Buffer): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, secretKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(encoded: string, secretKey: Buffer): string {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, secretKey, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

/**
 * In-memory credential manager with AES-256-GCM encryption.
 * Credentials are encrypted at rest and decrypted on access.
 */
export class CredentialManager {
  private readonly secretKey: Buffer;
  private readonly entries = new Map<string, EncryptedEntry>();
  private nextId = 1;

  constructor(secret: string) {
    this.secretKey = deriveKey(secret);
  }

  private key(provider: string, keyName: string): string {
    return `${provider}:${keyName}`;
  }

  upsert(
    provider: string,
    keyName: string,
    value: string,
  ): { id: string; provider: string; keyName: string; updated: boolean } {
    const k = this.key(provider, keyName);
    const ts = Date.now();
    const encrypted = encrypt(value, this.secretKey);
    const existing = this.entries.get(k);

    if (existing) {
      existing.encrypted = encrypted;
      existing.updatedAt = ts;
      return { id: existing.id, provider, keyName, updated: true };
    }

    const id = `cred_${this.nextId++}`;
    this.entries.set(k, { id, provider, keyName, encrypted, createdAt: ts, updatedAt: ts });
    return { id, provider, keyName, updated: false };
  }

  get(provider: string, keyName: string): string | null {
    const entry = this.entries.get(this.key(provider, keyName));
    if (!entry) return null;
    try {
      return decrypt(entry.encrypted, this.secretKey);
    } catch (err) {
      console.warn(
        `consensus-tools: failed to decrypt credential ${provider}:${keyName} — ` +
        `master secret may have changed or ciphertext is corrupted`,
        err,
      );
      return null;
    }
  }

  list(): Array<{ provider: string; keyName: string; createdAt: number; updatedAt: number }> {
    return Array.from(this.entries.values()).map((e) => ({
      provider: e.provider,
      keyName: e.keyName,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  }

  delete(provider: string, keyName: string): boolean {
    return this.entries.delete(this.key(provider, keyName));
  }

  getProviderStatus(provider: string): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const entry of this.entries.values()) {
      if (entry.provider === provider) {
        status[entry.keyName] = true;
      }
    }
    return status;
  }
}
