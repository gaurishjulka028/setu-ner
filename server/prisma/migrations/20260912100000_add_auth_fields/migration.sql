-- Add registration/SSO fields to users: phone, authProvider, googleSub.
-- passwordHash becomes nullable (Google/Firebase-only accounts have no
-- password). SQLite can't ALTER a NOT NULL constraint, so rebuild the table.
-- No other table references users, so the rebuild is safe.
ALTER TABLE "users" RENAME TO "users_old";

CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "points" INTEGER,
    "badges" TEXT,
    "passwordHash" TEXT,
    "phone" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'password',
    "googleSub" TEXT
);

INSERT INTO "users" ("id", "email", "name", "role", "org", "districtId", "points", "badges", "passwordHash", "phone", "authProvider", "googleSub")
  SELECT "id", "email", "name", "role", "org", "districtId", "points", "badges", "passwordHash", NULL, 'password', NULL
  FROM "users_old";

DROP TABLE "users_old";

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_googleSub_key" ON "users"("googleSub");
