-- CreateEnum
CREATE TYPE "BookingAppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingResourceType" AS ENUM ('CHAIR', 'ROOM', 'STATION', 'TABLE');

-- CreateTable
CREATE TABLE "ServiceCatalog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category" VARCHAR(64) NOT NULL DEFAULT 'General',
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 10,
    "price" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingResource" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "BookingResourceType" NOT NULL DEFAULT 'CHAIR',
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAppointment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "bookingCode" VARCHAR(64) NOT NULL,
    "customerId" UUID,
    "customerName" VARCHAR(150) NOT NULL,
    "customerPhone" VARCHAR(50) NOT NULL,
    "customerNote" TEXT,
    "serviceId" UUID NOT NULL,
    "staffMembershipId" UUID,
    "resourceId" UUID,
    "bookingDate" DATE NOT NULL,
    "startTime" VARCHAR(10) NOT NULL,
    "endTime" VARCHAR(10) NOT NULL,
    "status" "BookingAppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "saleId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCatalog_tenantId_branchId_name_key" ON "ServiceCatalog"("tenantId", "branchId", "name");
CREATE INDEX "ServiceCatalog_tenantId_branchId_active_idx" ON "ServiceCatalog"("tenantId", "branchId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "BookingResource_tenantId_branchId_name_key" ON "BookingResource"("tenantId", "branchId", "name");
CREATE INDEX "BookingResource_tenantId_branchId_active_idx" ON "BookingResource"("tenantId", "branchId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAppointment_bookingCode_key" ON "BookingAppointment"("bookingCode");
CREATE INDEX "BookingAppointment_tenantId_branchId_bookingDate_status_idx" ON "BookingAppointment"("tenantId", "branchId", "bookingDate", "status");
CREATE INDEX "BookingAppointment_staffMembershipId_bookingDate_idx" ON "BookingAppointment"("staffMembershipId", "bookingDate");
CREATE INDEX "BookingAppointment_bookingCode_idx" ON "BookingAppointment"("bookingCode");

-- AddForeignKey
ALTER TABLE "ServiceCatalog" ADD CONSTRAINT "ServiceCatalog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceCatalog" ADD CONSTRAINT "ServiceCatalog_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Branch"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingResource" ADD CONSTRAINT "BookingResource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingResource" ADD CONSTRAINT "BookingResource_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Branch"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAppointment" ADD CONSTRAINT "BookingAppointment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingAppointment" ADD CONSTRAINT "BookingAppointment_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Branch"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingAppointment" ADD CONSTRAINT "BookingAppointment_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingAppointment" ADD CONSTRAINT "BookingAppointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingAppointment" ADD CONSTRAINT "BookingAppointment_tenantId_staffMembershipId_fkey" FOREIGN KEY ("tenantId", "staffMembershipId") REFERENCES "Membership"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingAppointment" ADD CONSTRAINT "BookingAppointment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "BookingResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingAppointment" ADD CONSTRAINT "BookingAppointment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed navigation menu for Appointments & Booking
INSERT INTO "NavigationMenu" ("key", "section", "sectionLabel", "label", "icon", "sortOrder", "allowedRoles", "requiredFeature")
VALUES ('appointments', 'SALES', 'ขายหน้าร้าน', 'คิวนัดหมาย & จองบริการ', 'Calendar', 28, ARRAY['OWNER'::"Role", 'MANAGER'::"Role", 'CASHIER'::"Role"], NULL)
ON CONFLICT ("key") DO NOTHING;

-- Grant permissions to default Positions
INSERT INTO "PositionMenuPermission" ("positionId", "menuId", "canView", "canExport")
SELECT p.id, m.id, true, false
FROM "Position" p
JOIN "NavigationMenu" m ON m.key = 'appointments'
WHERE p.code IN ('OWNER', 'MANAGER', 'HEAD_CASHIER', 'CASHIER')
ON CONFLICT ("positionId", "menuId") DO NOTHING;
