import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const teeTimes = pgTable('tee_times', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp('date').notNull(),
  time: text('time').notNull(),
  golferName: text('golfer_name').notNull(),
  golferId: text('golfer_id').notNull(),
  postingStatus: text('posting_status').notNull().default('unexcused_no_post'),
  excuseReason: text('excuse_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const posts = pgTable('posts', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp('date').notNull(),
  ghinNumber: text('ghin_number').notNull(),
  createdAt: timestamp('created_at').defaultNow()
})

export const users = pgTable('users', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull().unique(),
  name: text('name'),
  isApproved: boolean('is_approved').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}) 