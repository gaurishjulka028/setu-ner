-- Phone OTP codes, moved out of an in-memory Map so pending/rate-limit state
-- survives a `tsx watch` restart and works across more than one server
-- instance. One row per phone number (a new send just overwrites the row).
CREATE TABLE "otp_codes" (
    "phone" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "expiresAt" REAL NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" REAL NOT NULL,
    "sendLog" TEXT NOT NULL
);
