import process from 'node:process'
import {
  checkDatabaseConnection,
  getDatabaseTroubleshootingHint,
  hasDatabaseUrl,
  inspectUsersTable
} from '../db/client.js'

async function main() {
  console.log(`DATABASE_URL configured: ${hasDatabaseUrl ? 'yes' : 'no'}`)

  const connection = await checkDatabaseConnection()
  console.log(`Connection: ${connection.ok ? 'ok' : 'failed'}`)
  console.log(`Connection message: ${connection.message}`)

  const usersTable = await inspectUsersTable()
  console.log(`Users table inspection: ${usersTable.ok ? 'ok' : 'failed'}`)
  console.log(`Users table message: ${usersTable.message}`)

  if (usersTable.exists) {
    console.log(`Users table columns: ${usersTable.columns.join(', ')}`)
  }

  if (Array.isArray(usersTable.missingColumns) && usersTable.missingColumns.length > 0) {
    console.log(`Missing columns: ${usersTable.missingColumns.join(', ')}`)
  }

  if (Array.isArray(usersTable.legacyColumns) && usersTable.legacyColumns.length > 0) {
    console.log(`Detected legacy columns: ${usersTable.legacyColumns.join(', ')}`)
  }

  if (!connection.ok || !usersTable.ok || (usersTable.exists && usersTable.missingColumns.length > 0)) {
    console.log(`Hint: ${getDatabaseTroubleshootingHint(new Error(usersTable.message), usersTable)}`)
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error('DB check failed:', error)
  process.exitCode = 1
})
