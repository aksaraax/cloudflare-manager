import { createCipheriv, createDecipheriv, pbkdf2, randomBytes } from 'crypto'
import { ConfigError } from '../utils/errors.js'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const SALT_LENGTH = 16
const TAG_LENGTH = 16
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_DIGEST = 'sha512'

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST, (err, key) => {
      if (err) reject(err)
      else resolve(key)
    })
  })
}

export async function encrypt(plaintext: string, password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const iv = randomBytes(IV_LENGTH)
  const key = await deriveKey(password, salt)

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

export async function decrypt(encrypted: string, password: string): Promise<string> {
  const parts = encrypted.split(':')
  if (parts.length !== 4) {
    throw new ConfigError('CONFIG_DECRYPT_INVALID_FORMAT', 'Encrypted payload format is invalid')
  }

  const saltB64 = parts[0] as string
  const ivB64 = parts[1] as string
  const authTagB64 = parts[2] as string
  const ciphertextB64 = parts[3] as string
  const salt = Buffer.from(saltB64, 'base64')
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const ciphertext = Buffer.from(ciphertextB64, 'base64')

  const key = await deriveKey(password, salt)

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decrypted.toString('utf8')
  } catch (cause) {
    throw new ConfigError(
      'CONFIG_DECRYPT_FAILED',
      'Decryption failed: wrong password or data has been tampered with',
      cause,
    )
  }
}
