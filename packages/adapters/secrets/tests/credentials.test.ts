import { describe, it, expect } from "vitest";
import { encrypt, decrypt, CredentialManager } from "../src/credentials.js";
import crypto from "node:crypto";

describe("encrypt/decrypt", () => {
  const key = crypto.scryptSync("test-secret", "consensus-tools-salt", 32);

  it("should round-trip preserve plaintext", () => {
    const plaintext = "my-super-secret-api-key";
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it("should produce different ciphertexts with different IVs", () => {
    const plaintext = "same-plaintext";
    const a = encrypt(plaintext, key);
    const b = encrypt(plaintext, key);
    expect(a).not.toBe(b);
  });
});

describe("CredentialManager", () => {
  it("should create a new credential and return updated=false", () => {
    const mgr = new CredentialManager("secret-1");
    const result = mgr.upsert("openai", "api_key", "sk-abc123");
    expect(result.updated).toBe(false);
    expect(result.provider).toBe("openai");
    expect(result.keyName).toBe("api_key");
    expect(result.id).toBeDefined();
  });

  it("should update an existing credential and return updated=true", () => {
    const mgr = new CredentialManager("secret-2");
    mgr.upsert("openai", "api_key", "sk-old");
    const result = mgr.upsert("openai", "api_key", "sk-new");
    expect(result.updated).toBe(true);
  });

  it("should return decrypted value for existing credential", () => {
    const mgr = new CredentialManager("secret-3");
    mgr.upsert("anthropic", "api_key", "sk-ant-secret");
    const value = mgr.get("anthropic", "api_key");
    expect(value).toBe("sk-ant-secret");
  });

  it("should return null for non-existent credential", () => {
    const mgr = new CredentialManager("secret-4");
    const value = mgr.get("nonexistent", "key");
    expect(value).toBeNull();
  });

  it("should return null when decryption fails with wrong key", () => {
    const mgr1 = new CredentialManager("secret-a");
    const mgr2 = new CredentialManager("secret-b");

    mgr1.upsert("provider", "key", "the-value");

    // Manually copy the encrypted entry from mgr1 to mgr2's internal map
    const entries1 = (mgr1 as any).entries as Map<string, any>;
    const entries2 = (mgr2 as any).entries as Map<string, any>;
    for (const [k, v] of entries1) {
      entries2.set(k, { ...v });
    }

    const value = mgr2.get("provider", "key");
    expect(value).toBeNull();
  });

  it("should list all credentials without values", () => {
    const mgr = new CredentialManager("secret-5");
    mgr.upsert("openai", "api_key", "sk-1");
    mgr.upsert("anthropic", "api_key", "sk-2");
    const list = mgr.list();
    expect(list).toHaveLength(2);
    expect(list[0]).toHaveProperty("provider");
    expect(list[0]).toHaveProperty("keyName");
    expect(list[0]).toHaveProperty("createdAt");
    expect(list[0]).toHaveProperty("updatedAt");
    expect(list[0]).not.toHaveProperty("encrypted");
    expect(list[0]).not.toHaveProperty("value");
  });

  it("should delete a credential so subsequent get returns null", () => {
    const mgr = new CredentialManager("secret-6");
    mgr.upsert("openai", "api_key", "sk-delete-me");
    expect(mgr.delete("openai", "api_key")).toBe(true);
    expect(mgr.get("openai", "api_key")).toBeNull();
  });

  it("should return correct provider status map", () => {
    const mgr = new CredentialManager("secret-7");
    mgr.upsert("openai", "api_key", "sk-1");
    mgr.upsert("openai", "org_id", "org-1");
    mgr.upsert("anthropic", "api_key", "sk-2");

    const status = mgr.getProviderStatus("openai");
    expect(status).toEqual({ api_key: true, org_id: true });

    const anthropicStatus = mgr.getProviderStatus("anthropic");
    expect(anthropicStatus).toEqual({ api_key: true });

    const emptyStatus = mgr.getProviderStatus("nonexistent");
    expect(emptyStatus).toEqual({});
  });
});
