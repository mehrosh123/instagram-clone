import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envFilePath = path.join(__dirname, '.env')

function loadEnvFileFallback(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')

    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue

      const separatorIndex = rawLine.indexOf('=')
      if (separatorIndex <= 0) continue

      const key = rawLine.slice(0, separatorIndex).trim()
      if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue

      let value = rawLine.slice(separatorIndex + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      process.env[key] = value
    }
  } catch {
    // Drizzle commands can still be invoked with env vars set externally.
  }
}

let usedNativeEnvLoader = false

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envFilePath)
    usedNativeEnvLoader = true
  } catch {
    usedNativeEnvLoader = false
  }
}

if (!usedNativeEnvLoader) {
  loadEnvFileFallback(envFilePath)
}

export default {
  dialect: 'postgresql',
  schema: './db/schema.js',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || ''
  },
  strict: true,
  verbose: true
}
