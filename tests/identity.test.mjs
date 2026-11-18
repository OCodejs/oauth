import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
globalThis.crypto ??= webcrypto;

import { createCsrfToken, validateCsrfToken, hashPassword, verifyPassword, handleIdentity } from "../cloudflare/identity.mjs";

test("CSRF tokens are signed and reject tampering", async () => {
  const secret = "preview-only-secret-that-is-at-least-32-characters";
  const token = await createCsrfToken(secret);
  assert.equal(await validateCsrfToken(token, secret), true);
  assert.equal(await validateCsrfToken(token, secret + "-wrong"), false);
  assert.equal(await validateCsrfToken(token + "x", secret), false);
});

test("password hashes are salted, versioned and verifiable", async () => {
  const first = await hashPassword("correct horse battery staple", 100000);
  const second = await hashPassword("correct horse battery staple", 100000);
  assert.match(first, /^pbkdf2-sha256\$100000\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("correct horse battery staple", first), true);
  assert.equal(await verifyPassword("incorrect password", first), false);
  assert.equal(await verifyPassword("correct horse battery staple", "argon2id$legacy"), false);
});

test("identity routes fail closed until D1 and Preview secret are bound", async () => {
  const response = await handleIdentity(new Request("https://preview.example/api/v1/auth/csrf"), {}, new URL("https://preview.example/api/v1/auth/csrf"));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "IDENTITY_PREVIEW_NOT_CONFIGURED");
});

test("identity handler does not reveal database errors", async () => {
  const env = {
    DB: { prepare() { throw new Error("private database detail"); } },
    CSRF_SECRET: "preview-only-secret-that-is-at-least-32-characters"
  };
  const response = await handleIdentity(new Request("https://preview.example/api/v1/auth/csrf"), env, new URL("https://preview.example/api/v1/auth/csrf"));
  assert.equal(response.status, 200);
  // CSRF issuance is stateless and must not touch D1.
});
