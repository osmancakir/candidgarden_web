-- GitHub was the only OAuth provider this app ever wired up, and it is gone.
-- With no providers left there is nothing to store here: accounts are reached
-- through password, passkey, or the emailed verification code.

-- DropForeignKey
ALTER TABLE "Connection" DROP CONSTRAINT "Connection_userId_fkey";

-- DropTable
DROP TABLE "Connection";
