-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "promptPayType" TEXT DEFAULT 'MOBILE';
ALTER TABLE "Branch" ADD COLUMN "promptPayAccount" TEXT;
ALTER TABLE "Branch" ADD COLUMN "promptPayName" TEXT;
ALTER TABLE "Branch" ADD COLUMN "promptPayBank" TEXT;
