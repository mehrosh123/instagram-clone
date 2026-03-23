export default {
  dialect: 'postgresql',
  schema: './backend/db/schema.js',
  out: './backend/drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || ''
  },
  strict: true,
  verbose: true
}
