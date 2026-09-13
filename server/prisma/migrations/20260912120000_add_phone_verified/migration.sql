-- Phone OTP verification: when (epoch ms) the user's phone passed OTP.
-- NULL means not verified yet; Google sign-in asks such users to verify once.
ALTER TABLE "users" ADD COLUMN "phoneVerifiedAt" REAL;
