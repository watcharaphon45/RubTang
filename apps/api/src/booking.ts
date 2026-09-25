import { Injectable, Inject, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Database } from './database';
import { Principal } from './auth';
import { Decimal } from '@prisma/client/runtime/library';

export interface CreateServiceDto {
  branchId: string;
  name: string;
  category?: string;
  description?: string;
  durationMinutes: number;
  bufferMinutes?: number;
  price: number;
}

export interface CreateResourceDto {
  branchId: string;
  name: string;
  type?: 'CHAIR' | 'ROOM' | 'STATION' | 'TABLE';
  description?: string;
}

export interface CreateAppointmentDto {
  branchId: string;
  customerName: string;
  customerPhone: string;
  customerNote?: string;
  customerId?: string;
  serviceId: string;
  staffMembershipId?: string;
  resourceId?: string;
  bookingDate: string; // YYYY-MM-DD
  startTime: string;   // HH:mm
  status?: 'PENDING' | 'CONFIRMED';
}

@Injectable()
export class BookingService {
  constructor(@Inject(Database) private readonly db: Database) {}

  // ─── Auto-seed default services & chairs if empty ─────────────────────────
  async ensureDefaultServicesAndResources(tenantId: string, branchId: string) {
    try {
      if (!this.db.serviceCatalog?.count || !this.db.bookingResource?.count) {
        return;
      }

      const serviceCount = await this.db.serviceCatalog.count({
        where: { tenantId, branchId },
      });
      if (serviceCount === 0) {
        const defaultServices = [
          { name: 'ตัดผมชาย & เซ็ตทรง', category: 'ตัดผมและออกแบบทรง', durationMinutes: 45, bufferMinutes: 10, price: new Decimal(250), description: 'สระผม ตัดแต่งทรงผมสไตล์โมเดิร์น/วินเทจ พร้อมเซ็ตติ้งด้วยโพเมด' },
          { name: 'ตัดผมหญิง & สระไดร์สไตล์เกาหลี', category: 'ตัดผมและออกแบบทรง', durationMinutes: 60, bufferMinutes: 10, price: new Decimal(350), description: 'ออกแบบทรงผม เลเยอร์คัท พร้อมสระไดร์วอลลุ่ม' },
          { name: 'สระ-ไดร์ มาตรฐาน (Wash & Blow-dry)', category: 'สระและทรีตเมนต์', durationMinutes: 30, bufferMinutes: 5, price: new Decimal(150), description: 'สระทำความสะอาดเส้นผม นวดศีรษะผ่อนคลาย และไดร์จัดแต่งทรง' },
          { name: 'ทำสีผมแฟชั่น / ไฮไลท์ (Coloring)', category: 'ทำสีและดัดผม', durationMinutes: 120, bufferMinutes: 15, price: new Decimal(1200), description: 'เปลี่ยนสีผมแฟชั่น โทนสีพรีเมียม สภาพเส้นผมเงางาม' },
          { name: 'ดัดผมวอลลุ่ม / ยืดผมเคราติน', category: 'ทำสีและดัดผม', durationMinutes: 150, bufferMinutes: 15, price: new Decimal(1800), description: 'ดัดสไตล์เกาหลี หรือยืดเคราตินฟื้นฟูสภาพผมให้ตรงสลวย' },
        ];
        for (const s of defaultServices) {
          await this.db.serviceCatalog.create({
            data: {
              tenantId,
              branchId,
              ...s,
            },
          });
        }
      }

      const resourceCount = await this.db.bookingResource.count({
        where: { tenantId, branchId },
      });
      if (resourceCount === 0) {
        const defaultResources = [
          { name: 'เก้าอี้ตัดผม 1 (Station A)', type: 'CHAIR' as const, description: 'เก้าอี้บาร์เบอร์วินเทจ โซนด้านหน้า' },
          { name: 'เก้าอี้ตัดผม 2 (Station B)', type: 'CHAIR' as const, description: 'เก้าอี้ทำผม โซนกลาง' },
          { name: 'เก้าอี้ตัดผม 3 (Station C)', type: 'CHAIR' as const, description: 'เก้าอี้ทำผม โซนกระจกใหญ่' },
          { name: 'เตียงสระ 1 (Shampoo Bed)', type: 'STATION' as const, description: 'เตียงสระนวดผ่อนคลาย' },
        ];
        for (const r of defaultResources) {
          await this.db.bookingResource.create({
            data: {
              tenantId,
              branchId,
              ...r,
            },
          });
        }
      }
    } catch (err) {
      console.warn('Auto-seed default services/resources encountered an issue:', err);
    }
  }

  // ─── Service Catalog ───────────────────────────────────────────────────────

  async listServices(principal: Principal, branchId?: string) {
    const targetBranchId = branchId || principal.branchIds[0];
    if (!targetBranchId) throw new BadRequestException('ต้องระบุสาขา (branchId)');

    await this.ensureDefaultServicesAndResources(principal.tenantId, targetBranchId);

    return this.db.serviceCatalog.findMany({
      where: {
        tenantId: principal.tenantId,
        branchId: targetBranchId,
        active: true,
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async createService(principal: Principal, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('เฉพาะเจ้าของร้านหรือผู้จัดการที่สามารถเพิ่มบริการได้');
    }
    const b = body as CreateServiceDto;
    if (!b?.branchId || !b?.name || b?.durationMinutes === undefined || b?.price === undefined) {
      throw new BadRequestException('กรุณากรอกข้อมูลบริการให้ครบถ้วน');
    }

    return this.db.serviceCatalog.create({
      data: {
        tenantId: principal.tenantId,
        branchId: b.branchId,
        name: b.name.trim(),
        category: b.category?.trim() || 'ทั่วไป',
        description: b.description?.trim() || null,
        durationMinutes: Math.max(10, Number(b.durationMinutes) || 60),
        bufferMinutes: Math.max(0, Number(b.bufferMinutes) || 10),
        price: new Decimal(Number(b.price) || 0),
      },
    });
  }

  async updateService(principal: Principal, id: string, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('เฉพาะเจ้าของร้านหรือผู้จัดการที่สามารถแก้ไขบริการได้');
    }
    const b = body as Partial<CreateServiceDto> & { active?: boolean };
    const service = await this.db.serviceCatalog.findUnique({ where: { id } });
    if (!service || service.tenantId !== principal.tenantId) {
      throw new NotFoundException('ไม่พบบริการนี้');
    }

    return this.db.serviceCatalog.update({
      where: { id },
      data: {
        ...(b.name ? { name: b.name.trim() } : {}),
        ...(b.category ? { category: b.category.trim() } : {}),
        ...(b.description !== undefined ? { description: b.description?.trim() || null } : {}),
        ...(b.durationMinutes !== undefined ? { durationMinutes: Number(b.durationMinutes) } : {}),
        ...(b.bufferMinutes !== undefined ? { bufferMinutes: Number(b.bufferMinutes) } : {}),
        ...(b.price !== undefined ? { price: new Decimal(Number(b.price)) } : {}),
        ...(b.active !== undefined ? { active: b.active } : {}),
      },
    });
  }

  // ─── Booking Resources (Chairs / Stations) ─────────────────────────────────

  async listResources(principal: Principal, branchId?: string) {
    const targetBranchId = branchId || principal.branchIds[0];
    if (!targetBranchId) throw new BadRequestException('ต้องระบุสาขา (branchId)');

    await this.ensureDefaultServicesAndResources(principal.tenantId, targetBranchId);

    return this.db.bookingResource.findMany({
      where: {
        tenantId: principal.tenantId,
        branchId: targetBranchId,
        active: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async createResource(principal: Principal, body: unknown) {
    if (principal.role === 'CASHIER') {
      throw new ForbiddenException('เฉพาะเจ้าของร้านหรือผู้จัดการที่สามารถเพิ่มเก้าอี้/จุดบริการได้');
    }
    const b = body as CreateResourceDto;
    if (!b?.branchId || !b?.name) {
      throw new BadRequestException('กรุณากรอกชื่อจุดบริการ');
    }

    return this.db.bookingResource.create({
      data: {
        tenantId: principal.tenantId,
        branchId: b.branchId,
        name: b.name.trim(),
        type: b.type || 'CHAIR',
        description: b.description?.trim() || null,
      },
    });
  }

  // ─── Staff / Stylists ─────────────────────────────────────────────────────

  async listStaffStylists(principal: Principal, branchId?: string) {
    const targetBranchId = branchId || principal.branchIds[0];
    const memberships = await this.db.membership.findMany({
      where: {
        tenantId: principal.tenantId,
        assignments: {
          some: { branchId: targetBranchId },
        },
      },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        position: { select: { id: true, name: true, code: true } },
      },
      orderBy: { user: { displayName: 'asc' } },
    });

    return memberships.map(m => ({
      id: m.id,
      userId: m.user.id,
      displayName: m.user.displayName,
      email: m.user.email,
      role: m.role,
      positionName: m.position?.name || (m.role === 'OWNER' ? 'เจ้าของร้าน' : m.role === 'MANAGER' ? 'ผู้จัดการ' : 'ช่างประจำร้าน'),
    }));
  }

  // ─── Appointments Management (Authenticated) ───────────────────────────────

  async listAppointments(principal: Principal, branchId?: string, dateStr?: string, status?: string) {
    const targetBranchId = branchId || principal.branchIds[0];
    if (!targetBranchId) throw new BadRequestException('ต้องระบุสาขา (branchId)');

    const targetDate = dateStr ? new Date(`${dateStr}T00:00:00Z`) : undefined;

    return this.db.bookingAppointment.findMany({
      where: {
        tenantId: principal.tenantId,
        branchId: targetBranchId,
        ...(targetDate ? { bookingDate: targetDate } : {}),
        ...(status ? { status: status as any } : {}),
      },
      include: {
        service: true,
        resource: true,
        customer: true,
        staff: {
          include: {
            user: { select: { displayName: true } },
          },
        },
      },
      orderBy: [{ bookingDate: 'asc' }, { startTime: 'asc' }],
    });
  }

  async createAppointment(principal: Principal, body: unknown) {
    const b = body as CreateAppointmentDto;
    if (!b?.branchId || !b?.customerName || !b?.customerPhone || !b?.serviceId || !b?.bookingDate || !b?.startTime) {
      throw new BadRequestException('กรุณากรอกข้อมูลการจองให้ครบถ้วน');
    }

    const service = await this.db.serviceCatalog.findUnique({
      where: { id: b.serviceId },
    });
    if (!service || service.tenantId !== principal.tenantId) {
      throw new NotFoundException('ไม่พบบริการที่เลือก');
    }

    // Calculate end time based on service duration
    const [startHour, startMin] = b.startTime.split(':').map(Number);
    const totalStartMins = startHour * 60 + startMin;
    const totalEndMins = totalStartMins + service.durationMinutes;
    const endHour = Math.floor(totalEndMins / 60);
    const endMin = totalEndMins % 60;
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;

    const bookingDate = new Date(`${b.bookingDate}T00:00:00Z`);
    const bookingCode = `BK-${Date.now().toString().slice(-4)}${Math.floor(1000 + Math.random() * 9000)}`;

    const cleanStaffId = b.staffMembershipId && b.staffMembershipId.trim() && b.staffMembershipId !== 'undefined' && b.staffMembershipId !== 'null'
      ? b.staffMembershipId.trim()
      : null;
    const cleanResourceId = b.resourceId && b.resourceId.trim() && b.resourceId !== 'undefined' && b.resourceId !== 'null'
      ? b.resourceId.trim()
      : null;
    const cleanCustomerId = b.customerId && b.customerId.trim() && b.customerId !== 'undefined' && b.customerId !== 'null'
      ? b.customerId.trim()
      : null;

    return this.db.bookingAppointment.create({
      data: {
        tenantId: principal.tenantId,
        branchId: b.branchId,
        bookingCode,
        customerName: b.customerName.trim(),
        customerPhone: b.customerPhone.trim(),
        customerNote: b.customerNote?.trim() || null,
        customerId: cleanCustomerId,
        serviceId: b.serviceId,
        staffMembershipId: cleanStaffId,
        resourceId: cleanResourceId,
        bookingDate,
        startTime: b.startTime,
        endTime,
        status: b.status || 'CONFIRMED',
      },
      include: {
        service: true,
        resource: true,
        staff: {
          include: { user: { select: { displayName: true } } },
        },
      },
    });
  }

  async updateAppointmentStatus(principal: Principal, id: string, status: string, saleId?: string) {
    const appointment = await this.db.bookingAppointment.findUnique({ where: { id } });
    if (!appointment || appointment.tenantId !== principal.tenantId) {
      throw new NotFoundException('ไม่พบรายการนัดหมาย');
    }

    return this.db.bookingAppointment.update({
      where: { id },
      data: {
        status: status as any,
        ...(saleId ? { saleId } : {}),
      },
      include: {
        service: true,
        resource: true,
        staff: { include: { user: { select: { displayName: true } } } },
      },
    });
  }

  // ─── Smart Availability Engine ─────────────────────────────────────────────

  async calculateAvailableSlots(branchId: string, serviceId: string, dateStr: string, staffId?: string) {
    const service = await this.db.serviceCatalog.findUnique({
      where: { id: serviceId },
    });
    if (!service) throw new NotFoundException('ไม่พบบริการที่เลือก');

    const cleanStaffId = staffId && staffId.trim() && staffId !== 'undefined' && staffId !== 'null'
      ? staffId.trim()
      : undefined;

    const bookingDate = new Date(`${dateStr}T00:00:00Z`);

    // Fetch existing active appointments on this day
    const existing = await this.db.bookingAppointment.findMany({
      where: {
        branchId,
        bookingDate,
        status: { in: ['PENDING', 'CONFIRMED', 'IN_SERVICE'] },
        ...(cleanStaffId ? { staffMembershipId: cleanStaffId } : {}),
      },
      select: {
        startTime: true,
        endTime: true,
        staffMembershipId: true,
        resourceId: true,
      },
    });

    // Check branch capacity if no specific staff is selected
    let maxConcurrent = 1;
    if (!cleanStaffId && this.db.branch?.findUnique) {
      try {
        const branch = await this.db.branch.findUnique({ where: { id: branchId } });
        if (branch) {
          const staffCount = this.db.membership?.count
            ? await this.db.membership.count({
                where: {
                  tenantId: branch.tenantId,
                  assignments: { some: { branchId } },
                },
              })
            : 0;
          const resourceCount = this.db.bookingResource?.count
            ? await this.db.bookingResource.count({
                where: {
                  tenantId: branch.tenantId,
                  branchId,
                  active: true,
                },
              })
            : 0;
          maxConcurrent = Math.max(1, staffCount, resourceCount);
        }
      } catch {
        maxConcurrent = 1;
      }
    }

    // Salon default hours: 10:00 - 20:00
    const openHour = 10;
    const closeHour = 20;
    const slotStepMinutes = 30; // Check every 30 mins

    const totalCloseMins = closeHour * 60;
    const availableSlots: string[] = [];

    for (let m = openHour * 60; m + service.durationMinutes <= totalCloseMins; m += slotStepMinutes) {
      const slotStart = m;
      const slotEnd = m + service.durationMinutes;

      const slotStartHour = Math.floor(slotStart / 60).toString().padStart(2, '0');
      const slotStartMin = (slotStart % 60).toString().padStart(2, '0');
      const slotStartTimeStr = `${slotStartHour}:${slotStartMin}`;

      // Overlap condition: slotStart < appEnd && slotEnd > appStart
      const overlappingCount = existing.filter(app => {
        const [appSH, appSM] = app.startTime.split(':').map(Number);
        const [appEH, appEM] = app.endTime.split(':').map(Number);
        const appStart = appSH * 60 + appSM;
        const appEnd = appEH * 60 + appEM;
        return slotStart < appEnd && slotEnd > appStart;
      }).length;

      const isAvailable = cleanStaffId ? overlappingCount === 0 : overlappingCount < maxConcurrent;

      if (isAvailable) {
        availableSlots.push(slotStartTimeStr);
      }
    }

    return {
      date: dateStr,
      service,
      availableSlots,
    };
  }

  // ─── Public Customer Booking (Unauthenticated) ────────────────────────────

  async getPublicBookingInfo(branchId: string) {
    const branch = await this.db.branch.findUnique({
      where: { id: branchId },
      include: {
        tenant: { select: { id: true, name: true } },
      },
    });
    if (!branch) throw new NotFoundException('ไม่พบสาขาของร้าน');

    await this.ensureDefaultServicesAndResources(branch.tenantId, branchId);

    const [services, staffMembers] = await Promise.all([
      this.db.serviceCatalog.findMany({
        where: { branchId, active: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      this.db.membership.findMany({
        where: {
          tenantId: branch.tenantId,
          assignments: { some: { branchId } },
        },
        include: {
          user: { select: { id: true, displayName: true } },
          position: { select: { name: true } },
        },
      }),
    ]);

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        phone: branch.phone,
        address: branch.taxAddress,
      },
      tenant: {
        id: branch.tenant.id,
        name: branch.tenant.name,
      },
      services: services.map(s => ({
        id: s.id,
        name: s.name,
        category: s.category,
        description: s.description,
        durationMinutes: s.durationMinutes,
        price: Number(s.price),
      })),
      staff: staffMembers.map(m => ({
        id: m.id,
        displayName: m.user.displayName,
        title: m.position?.name || 'ช่างประจำร้าน',
      })),
    };
  }

  async submitPublicBooking(branchId: string, body: unknown) {
    const b = body as {
      customerName: string;
      customerPhone: string;
      customerNote?: string;
      serviceId: string;
      staffMembershipId?: string;
      bookingDate: string; // YYYY-MM-DD
      startTime: string;   // HH:mm
    };

    if (!b?.customerName || !b?.customerPhone || !b?.serviceId || !b?.bookingDate || !b?.startTime) {
      throw new BadRequestException('กรุณากรอกข้อมูลการจองให้ครบถ้วน');
    }

    const branch = await this.db.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('ไม่พบสาขาของร้าน');

    const service = await this.db.serviceCatalog.findUnique({ where: { id: b.serviceId } });
    if (!service || service.branchId !== branchId) {
      throw new NotFoundException('ไม่พบบริการที่เลือก');
    }

    const cleanStaffId = b.staffMembershipId && b.staffMembershipId.trim() && b.staffMembershipId !== 'undefined' && b.staffMembershipId !== 'null'
      ? b.staffMembershipId.trim()
      : null;

    // Verify slot availability
    const slotsInfo = await this.calculateAvailableSlots(branchId, b.serviceId, b.bookingDate, cleanStaffId || undefined);
    if (!slotsInfo.availableSlots.includes(b.startTime)) {
      throw new BadRequestException('รอบเวลานี้มีคิวจองเต็มแล้ว กรุณาเลือกรอบเวลาอื่น');
    }

    const [startHour, startMin] = b.startTime.split(':').map(Number);
    const totalStartMins = startHour * 60 + startMin;
    const totalEndMins = totalStartMins + service.durationMinutes;
    const endHour = Math.floor(totalEndMins / 60);
    const endMin = totalEndMins % 60;
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;

    const bookingDate = new Date(`${b.bookingDate}T00:00:00Z`);
    const bookingCode = `BK-${Date.now().toString().slice(-4)}${Math.floor(1000 + Math.random() * 9000)}`;

    // Optional find matching customer by phone
    const matchedCustomer = await this.db.customer.findFirst({
      where: {
        tenantId: branch.tenantId,
        phone: b.customerPhone.trim(),
      },
    });

    const appointment = await this.db.bookingAppointment.create({
      data: {
        tenantId: branch.tenantId,
        branchId,
        bookingCode,
        customerName: b.customerName.trim(),
        customerPhone: b.customerPhone.trim(),
        customerNote: b.customerNote?.trim() || null,
        customerId: matchedCustomer?.id || null,
        serviceId: b.serviceId,
        staffMembershipId: cleanStaffId,
        bookingDate,
        startTime: b.startTime,
        endTime,
        status: 'CONFIRMED',
      },
      include: {
        service: true,
        staff: { include: { user: { select: { displayName: true } } } },
      },
    });

    return {
      success: true,
      bookingCode,
      appointment,
      message: 'จองคิวนัดหมายสำเร็จ! กรุณามาถึงก่อนเวลา 5-10 นาทีครับ',
    };
  }

  async getPublicBookingStatus(bookingCode: string) {
    const appointment = await this.db.bookingAppointment.findUnique({
      where: { bookingCode },
      include: {
        service: true,
        branch: { select: { name: true, phone: true } },
        staff: { include: { user: { select: { displayName: true } } } },
      },
    });

    if (!appointment) throw new NotFoundException('ไม่พบข้อมูลการจองนี้');

    return appointment;
  }
}
