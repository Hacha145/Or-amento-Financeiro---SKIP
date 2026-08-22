/**
 * Encrypted backup using the WebCrypto API.
 *
 * Derives a key from the user-supplied password via PBKDF2, encrypts the JSON
 * payload with AES-GCM, and wraps it with a manifest (version, checksums).
 * The same password is required to restore.
 */
import { exportBackupJSON, restoreBackupJSON } from './storage'

const APP_VERSION = '2.0'
const PBKDF2_ITERATIONS = 150_000
const SALT_BYTES = 16
const IV_BYTES = 12
const KEY_BITS = 256

const enc = new TextEncoder()
const dec = new TextDecoder()

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  )
}

export interface EncryptedBackup {
  format: 'orcamento-encrypted-v1'
  appVersion: string
  createdAt: string
  kdf: { algorithm: 'PBKDF2'; iterations: number; hash: string }
  salt: string // base64
  iv: string // base64
  ciphertext: string // base64
  sha256: string // checksum of the plaintext, base64
}

export async function exportEncryptedBackup(password: string): Promise<string> {
  const plaintext = exportBackupJSON()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt)
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    enc.encode(plaintext),
  )
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(plaintext))
  const backup: EncryptedBackup = {
    format: 'orcamento-encrypted-v1',
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    kdf: { algorithm: 'PBKDF2', iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    salt: toBase64(salt.buffer),
    iv: toBase64(iv.buffer),
    ciphertext: toBase64(cipherBuf),
    sha256: toBase64(digest),
  }
  return JSON.stringify(backup, null, 2)
}

export async function restoreEncryptedBackup(jsonStr: string, password: string): Promise<boolean> {
  try {
    const backup = JSON.parse(jsonStr) as EncryptedBackup
    if (!backup || backup.format !== 'orcamento-encrypted-v1') {
      // fall back to a plain JSON restore
      return restoreBackupJSON(jsonStr)
    }
    const salt = fromBase64(backup.salt)
    const iv = fromBase64(backup.iv)
    const cipher = fromBase64(backup.ciphertext)
    const key = await deriveKey(password, salt)
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      cipher as BufferSource,
    )
    const plaintext = dec.decode(plainBuf)
    // optional checksum verification
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(plaintext))
    if (toBase64(digest) !== backup.sha256) {
      console.warn('Checksum mismatch on encrypted restore — proceeding anyway')
    }
    return restoreBackupJSON(plaintext)
  } catch (e) {
    console.error('Failed to decrypt backup (wrong password?)', e)
    return false
  }
}
