import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { sql } from 'drizzle-orm'
import * as schema from './schema.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envFilePath = path.join(__dirname, '..', '.env')

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
    // Allow running without a local backend/.env file.
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

const databaseUrl = String(process.env.DATABASE_URL || '').trim()
const EXPECTED_USERS_COLUMNS = [
  'id',
  'email',
  'username',
  'password_hash',
  'full_name',
  'bio',
  'website',
  'profile_picture_url',
  'is_private',
  'is_verified',
  'follower_count',
  'following_count',
  'created_at',
  'updated_at',
  'deleted_at'
]
const LEGACY_USERS_COLUMNS = ['password', 'fullname', 'profile_picture']

export const hasDatabaseUrl = databaseUrl.length > 0

export const db = hasDatabaseUrl
  ? drizzle(neon(databaseUrl), { schema })
  : null

function extractRows(result) {
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.rows)) return result.rows
  return []
}

export async function checkDatabaseConnection() {
  if (!hasDatabaseUrl || !db) {
    return {
      ok: false,
      message: 'DATABASE_URL is not configured. Running with JSON file storage.'
    }
  }

  try {
    await db.execute(sql`select 1`)
    return { ok: true, message: 'Neon PostgreSQL connection is healthy.' }
  } catch (error) {
    return {
      ok: false,
      message: error?.message || 'Database connection failed.'
    }
  }
}

export async function inspectUsersTable() {
  if (!hasDatabaseUrl || !db) {
    return {
      ok: false,
      exists: false,
      columns: [],
      missingColumns: [...EXPECTED_USERS_COLUMNS],
      legacyColumns: [],
      schemaVariant: 'no-database',
      message: 'DATABASE_URL is not configured. Users table inspection skipped.'
    }
  }

  try {
    const result = await db.execute(sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'users'
      order by ordinal_position
    `)
    const rows = extractRows(result)
    const columns = rows
      .map(row => String(row?.column_name || row?.columnName || '').trim())
      .filter(Boolean)
    const columnSet = new Set(columns)
    const missingColumns = EXPECTED_USERS_COLUMNS.filter(column => !columnSet.has(column))
    const legacyColumns = LEGACY_USERS_COLUMNS.filter(column => columnSet.has(column))

    return {
      ok: true,
      exists: columns.length > 0,
      columns,
      missingColumns,
      legacyColumns,
      schemaVariant: columns.length === 0
        ? 'missing-table'
        : missingColumns.length === 0
          ? 'current'
          : legacyColumns.length > 0
            ? 'legacy-or-partial'
            : 'partial',
      message: columns.length === 0
        ? 'public.users table was not found in Neon.'
        : missingColumns.length === 0
          ? 'Users table matches the backend runtime schema.'
          : 'Users table is missing columns required by the backend runtime schema.'
    }
  } catch (error) {
    return {
      ok: false,
      exists: false,
      columns: [],
      missingColumns: [...EXPECTED_USERS_COLUMNS],
      legacyColumns: [],
      schemaVariant: 'inspection-failed',
      message: error?.message || 'Users table inspection failed.'
    }
  }
}

export function getDatabaseTroubleshootingHint(error, usersTableInfo) {
  const message = String(error?.message || '').toLowerCase()

  if (message.includes('invalid input syntax for type uuid')) {
    return 'The stored JWT token contains an invalid user id for the Neon users table. Clear localStorage and sign in again.'
  }

  if (usersTableInfo?.exists === false) {
    return 'The Neon database does not contain a public.users table. Run `npm run db:push` from the project root with the current drizzle config.'
  }

  if (Array.isArray(usersTableInfo?.missingColumns) && usersTableInfo.missingColumns.length > 0) {
    return `The Neon users table is missing backend-required columns: ${usersTableInfo.missingColumns.join(', ')}. Re-run \`npm run db:push\` with the current schema.`
  }

  if (message.includes('column') && message.includes('does not exist')) {
    return 'The backend schema and the live Neon schema do not match. Re-run `npm run db:push` using the current Drizzle schema.'
  }

  return 'Check backend/.env DATABASE_URL, confirm the correct Neon branch, and run `npm run db:check` for a schema report.'
}
