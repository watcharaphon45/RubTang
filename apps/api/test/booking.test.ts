import { describe, expect, it, vi } from 'vitest';
import { BookingService } from '../src/booking';
import { Principal } from '../src/auth';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('BookingService (Salon & Service Appointments)', () => {
  const ownerPrincipal: Principal = {
    userId: 'user-owner',
    tenantId: 'tenant-1',
    membershipId: 'mem-1',
    role: 'OWNER',
    branchIds: ['branch-1'],
  };

  it('lists services for a branch', async () => {
    const mockServices = [
      {
        id: 'srv-1',
        name: 'ตัดผมชาย + สระไดร์',
        category: 'Haircut',
        durationMinutes: 45,
        price: 350,
        active: true,
      },
      {
        id: 'srv-2',
        name: 'ดัดวอลลุ่มเกาหลี',
        category: 'Perm',
        durationMinutes: 120,
        price: 1800,
        active: true,
      },
    ];

    const mockDb: any = {
      serviceCatalog: {
        findMany: vi.fn().mockResolvedValue(mockServices),
      },
    };

    const service = new BookingService(mockDb);
    const result = await service.listServices(ownerPrincipal, 'branch-1');

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('ตัดผมชาย + สระไดร์');
    expect(result[0].durationMinutes).toBe(45);
  });

  it('calculates available slots correctly avoiding busy appointments', async () => {
    const mockService = {
      id: 'srv-1',
      name: 'ตัดผมชาย',
      durationMinutes: 60,
      price: 300,
    };

    // Stylist already has an appointment from 11:00 - 12:00
    const mockExistingAppointments = [
      {
        startTime: '11:00',
        endTime: '12:00',
        staffMembershipId: 'stylist-1',
        resourceId: 'chair-1',
      },
    ];

    const mockDb: any = {
      serviceCatalog: {
        findUnique: vi.fn().mockResolvedValue(mockService),
      },
      bookingAppointment: {
        findMany: vi.fn().mockResolvedValue(mockExistingAppointments),
      },
    };

    const service = new BookingService(mockDb);
    const result = await service.calculateAvailableSlots('branch-1', 'srv-1', '2026-09-26', 'stylist-1');

    expect(result.availableSlots).toContain('10:00');
    // 10:30 will overlap with 11:00-12:00 (10:30 + 60m = 11:30 > 11:00)
    expect(result.availableSlots).not.toContain('10:30');
    expect(result.availableSlots).not.toContain('11:00');
    expect(result.availableSlots).not.toContain('11:30');
    // 12:00 onwards should be free
    expect(result.availableSlots).toContain('12:00');
    expect(result.availableSlots).toContain('12:30');
  });

  it('submits public booking successfully and generates booking code', async () => {
    const mockBranch = {
      id: 'branch-1',
      tenantId: 'tenant-1',
      name: 'สาขาทองหล่อ',
    };

    const mockService = {
      id: 'srv-1',
      branchId: 'branch-1',
      name: 'ตัดผมชายวินเทจ',
      durationMinutes: 45,
      price: 400,
    };

    const mockCreatedApp = {
      id: 'app-1',
      bookingCode: 'BK-123456',
      customerName: 'คุณกิตติศักดิ์',
      customerPhone: '0819998888',
      serviceId: 'srv-1',
      bookingDate: new Date('2026-09-26T00:00:00Z'),
      startTime: '14:00',
      endTime: '14:45',
      status: 'CONFIRMED',
    };

    const mockDb: any = {
      branch: {
        findUnique: vi.fn().mockResolvedValue(mockBranch),
      },
      serviceCatalog: {
        findUnique: vi.fn().mockResolvedValue(mockService),
      },
      customer: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      bookingAppointment: {
        findMany: vi.fn().mockResolvedValue([]), // No conflict
        create: vi.fn().mockResolvedValue(mockCreatedApp),
      },
    };

    const service = new BookingService(mockDb);
    const result = await service.submitPublicBooking('branch-1', {
      customerName: 'คุณกิตติศักดิ์',
      customerPhone: '0819998888',
      serviceId: 'srv-1',
      bookingDate: '2026-09-26',
      startTime: '14:00',
      customerNote: 'ขอช่างที่ถนัดทรงเฟด',
    });

    expect(result.success).toBe(true);
    expect(result.bookingCode).toBeTruthy();
    expect(mockDb.bookingAppointment.create).toHaveBeenCalled();
  });

  it('updates appointment status to IN_SERVICE and COMPLETED', async () => {
    const mockAppointment = {
      id: 'app-1',
      tenantId: 'tenant-1',
      status: 'CONFIRMED',
    };

    const mockDb: any = {
      bookingAppointment: {
        findUnique: vi.fn().mockResolvedValue(mockAppointment),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...mockAppointment, ...data })),
      },
    };

    const service = new BookingService(mockDb);

    // Check-in
    const inServiceRes = await service.updateAppointmentStatus(ownerPrincipal, 'app-1', 'IN_SERVICE');
    expect(inServiceRes.status).toBe('IN_SERVICE');

    // Complete with sale
    const completedRes = await service.updateAppointmentStatus(ownerPrincipal, 'app-1', 'COMPLETED', 'sale-uuid-99');
    expect(completedRes.status).toBe('COMPLETED');
    expect(completedRes.saleId).toBe('sale-uuid-99');
  });
});
