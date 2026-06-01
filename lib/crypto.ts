/**
 * lib/crypto.ts
 *
 * Server-only AES-GCM helpers for encrypting provider API keys before storage.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"

/** Builds a stable 32-byte encryption key from APP_ENCRYPTION_KEY. */
function getEncryptionKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY
  if (!raw) {
    throw new Error("APP_ENCRYPTION_KEY is not configured")
  }

  return createHash("sha256").update(raw).digest()
}

/** Encrypts a plaintext provider key into a versioned payload. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":")
}

/** Decrypts a versioned encrypted provider key payload. */
export function decryptSecret(payload: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(":")
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted secret payload")
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivRaw, "base64url")
  )
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"))

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}
