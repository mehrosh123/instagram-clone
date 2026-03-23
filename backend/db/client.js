import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { sql } from 'drizzle-orm'
import * as schema from './schema.js'

const databaseUrl = String(process.env.DATABASE_URL || '').trim()

export const hasDatabaseUrl = databaseUrl.length > 0

export const db = hasDatabaseUrl
  ? drizzle(neon(databaseUrl), { schema })
  : null

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
