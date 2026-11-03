import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from './cipher.js'
import { ConfigError } from '../utils/errors.js'

describe('cipher', () => {
  const password = 'CorrectHorseBatteryStaple123!'
  const plaintext = 'SuperSecretCloudflareApiTokenString_998877'

  it('encrypts and successfully decrypts back to original plaintext', async () => {
    const encrypted = await encrypt(plaintext, password)
    const decrypted = await decrypt(encrypted, password)
    expect(decrypted).toBe(plaintext)
  })

  it('fails decryption with wrong password and throws ConfigError', async () => {
    const encrypted = await encrypt(plaintext, password)
    await expect(decrypt(encrypted, 'WrongPassword456!')).rejects.toThrow(ConfigError)
  })

  it('fails decryption when ciphertext is tampered with', async () => {
    const encrypted = await encrypt(plaintext, password)
    const parts = encrypted.split(':')
    const tamperedCiphertext = Buffer.from('corrupted_data_string').toString('base64')
    const tamperedPayload = [parts[0], parts[1], parts[2], tamperedCiphertext].join(':')
    await expect(decrypt(tamperedPayload, password)).rejects.toThrow(ConfigError)
  })

  it('fails decryption when auth tag is tampered with', async () => {
    const encrypted = await encrypt(plaintext, password)
    const parts = encrypted.split(':')
    const tamperedTag = Buffer.from('corrupted_tag__1').toString('base64')
    const tamperedPayload = [parts[0], parts[1], tamperedTag, parts[3]].join(':')
    await expect(decrypt(tamperedPayload, password)).rejects.toThrow(ConfigError)
  })

  it('produces different ciphertext for identical inputs due to random salt and IV', async () => {
    const enc1 = await encrypt(plaintext, password)
    const enc2 = await encrypt(plaintext, password)
    expect(enc1).not.toBe(enc2)
  })

  it('supports roundtrip encryption of empty string', async () => {
    const encrypted = await encrypt('', password)
    const decrypted = await decrypt(encrypted, password)
    expect(decrypted).toBe('')
  })

  it('supports roundtrip encryption of Unicode characters', async () => {
    const unicodeText = 'Cloudflare 🚀 管理员 🌐 日本語 🔒 100%'
    const encrypted = await encrypt(unicodeText, password)
    const decrypted = await decrypt(encrypted, password)
    expect(decrypted).toBe(unicodeText)
  })

  it('throws ConfigError on invalid format', async () => {
    await expect(decrypt('not:a:valid:encrypted:format:extra', password)).rejects.toThrow(ConfigError)
  })
})

