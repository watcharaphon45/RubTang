-- CreateEnum
CREATE TYPE "TaxInvoiceType" AS ENUM ('FULL', 'ABBREVIATED');

-- CreateEnum
CREATE TYPE "TaxInvoiceStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "companyName" TEXT,
ADD COLUMN "taxId" TEXT,
ADD COLUMN "taxAddress" TEXT,
ADD COLUMN "branchNumber" TEXT DEFAULT '00000',
ADD COLUMN "isHeadOffice" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "phone" TEXT,
ADD COLUMN "receiptHeader" TEXT,
ADD COLUMN "receiptFooter" TEXT;

-- CreateTable
CREATE TABLE "TaxInvoice" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "type" "TaxInvoiceType" NOT NULL DEFAULT 'FULL',
    "status" "TaxInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "customerName" TEXT NOT NULL,
    "customerTaxId" TEXT,
    "customerAddress" TEXT,
    "customerBranchNumber" TEXT DEFAULT '00000',
    "customerIsHeadOffice" BOOLEAN NOT NULL DEFAULT true,
    "customerPhone" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(12,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 7.00,
    "vatAmount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "bahtText" TEXT NOT NULL,
    "issuedById" UUID NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "TaxInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxInvoice_tenantId_id_key" ON "TaxInvoice"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaxInvoice_tenantId_invoiceNumber_key" ON "TaxInvoice"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "TaxInvoice_tenantId_branchId_issuedAt_idx" ON "TaxInvoice"("tenantId", "branchId", "issuedAt");

-- CreateIndex
CREATE INDEX "TaxInvoice_tenantId_saleId_idx" ON "TaxInvoice"("tenantId", "saleId");

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Branch"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_tenantId_issuedById_fkey" FOREIGN KEY ("tenantId", "issuedById") REFERENCES "Membership"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
