import { pgTable, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core'

export const teeTimes = pgTable('tee_times', {
  id: text('id').primaryKey().defaultRandom(),
  date: timestamp('date').notNull(),
  time: text('time').notNull(),
  golferName: text('golfer_name').notNull(),
  memberNumber: text('member_number'),
  ghinNumber: text('ghin_number'),
  status: text('status').notNull().default('pending'), // pending, posted, excused
  excuseReason: text('excuse_reason'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
})

export const posts = pgTable('posts', {
  id: text('id').primaryKey().defaultRandom(),
  date: timestamp('date').notNull(),
  ghinNumber: text('ghin_number').notNull(),
  createdAt: timestamp('created_at').defaultNow()
})

export const users = pgTable('users', {
  id: text('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  isApproved: boolean('is_approved').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}) 