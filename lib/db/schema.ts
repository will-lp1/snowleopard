import {
  pgTable,
  uuid,
  timestamp,
  text,
  varchar,
  jsonb,
  boolean,
  primaryKey,
  integer,
  pgEnum,
  unique
} from 'drizzle-orm/pg-core';
import { relations, Many, One } from 'drizzle-orm';
import { InferSelectModel } from 'drizzle-orm';

export const user = pgTable("user", {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const session = pgTable("session", {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(()=> user.id, { onDelete: 'cascade' })
});

export const account = pgTable("account", {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(()=> user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const verification = pgTable("verification", {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const Chat = pgTable('Chat', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('createdAt', { mode: 'string' }).notNull(),
  title: text('title').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
  document_context: jsonb('document_context'),
});

export type Chat = InferSelectModel<typeof Chat>;

export const Message = pgTable('Message', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => Chat.id),
  role: varchar('role').notNull(),
  content: jsonb('content').notNull(),
  createdAt: timestamp('createdAt', { mode: 'string' }).notNull(),
});

export type Message = InferSelectModel<typeof Message>;

export const artifactKindEnum = pgEnum('artifact_kind', ['text', 'code', 'image', 'sheet']);

export const Document = pgTable(
  'Document',
  {
    id: uuid('id').notNull().defaultRandom(),
    createdAt: timestamp('createdAt', { mode: 'string' }).notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'string' }).notNull().defaultNow(),
    title: text('title').notNull(),
    content: text('content'),
    kind: artifactKindEnum('kind')
      .notNull()
      .default('text'),
    userId: text('userId')
      .notNull()
      .references(() => user.id),
    chatId: uuid('chatId')
      .references(() => Chat.id),
    is_current: boolean('is_current').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  },
);

export type Document = InferSelectModel<typeof Document>;

export const userRelations = relations(user, ({ many }) => ({
	accounts: many(account),
  sessions: many(session),
  documents: many(Document),
  chats: many(Chat),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const chatRelations = relations(Chat, ({ one, many }) => ({
	user: one(user, {
		fields: [Chat.userId],
		references: [user.id],
	}),
  messages: many(Message),
  documents: many(Document),
}));

export const documentRelations = relations(Document, ({ one, many }) => ({
	user: one(user, {
		fields: [Document.userId],
		references: [user.id],
	}),
  chat: one(Chat, {
    fields: [Document.chatId],
    references: [Chat.id],
  }),
}));

export const messageRelations = relations(Message, ({ one }) => ({
	chat: one(Chat, {
		fields: [Message.chatId],
		references: [Chat.id],
	}),
}));
