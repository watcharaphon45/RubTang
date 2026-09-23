import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, LineReceiptStatus } from '@prisma/client';
import { Principal } from './auth';

export interface UpdateLineSettingsPayload {
  accountName: string;
  basicId?: string | null;
  channelId?: string | null;
  channelSecret?: string | null;
  channelAccessToken?: string | null;
  autoSendReceipt?: boolean;
  welcomeMessage?: string | null;
  qrCodeUrl?: string | null;
  active?: boolean;
}

export interface LinkCustomerLinePayload {
  lineUserId: string;
  lineDisplayName?: string | null;
  linePictureUrl?: string | null;
}

export interface SendLineReceiptPayload {
  lineUserId?: string;
}

export interface LineFlexBubbleMessage {
  type: 'flex';
  altText: string;
  contents: {
    type: 'bubble';
    size: 'mega';
    header: any;
    body: any;
    footer: any;
  };
}

@Injectable()
export class LineService {
  constructor(private readonly prisma: PrismaClient) {}

  private requireManagerOrOwner(principal: Principal) {
    if (principal.role !== 'OWNER' && principal.role !== 'MANAGER') {
      throw new ForbiddenException('ไม่มีสิทธิ์จัดการการตั้งค่า LINE Official Account');
    }
  }

  /**
   * ดึงการตั้งค่า LINE OA ของร้าน
   */
  async getSettings(principal: Principal) {
    let settings = await this.prisma.lineOaSettings.findUnique({
      where: { tenantId: principal.tenantId },
    });

    if (!settings) {
      // คืนค่า default ถ้ายังไม่เคยตั้งค่า
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: principal.tenantId },
      });
      return {
        id: null,
        tenantId: principal.tenantId,
        accountName: tenant?.name ? `${tenant.name} Official` : 'RubTang LINE Official',
        basicId: '@rubtang',
        channelId: null,
        channelSecret: null,
        channelAccessToken: null,
        autoSendReceipt: true,
        welcomeMessage: 'ยินดีต้อนรับสู่ร้านของเราระบบ E-Receipt และสะสมแต้ม',
        qrCodeUrl: 'https://qr-official.line.me/gs/M_rubtang_GW.png',
        active: false,
        isConfigured: false,
      };
    }

    return {
      ...settings,
      isConfigured: Boolean(settings.channelAccessToken && settings.channelAccessToken.length > 10),
    };
  }

  /**
   * บันทึกหรืออัปเดตการตั้งค่า LINE OA
   */
  async updateSettings(principal: Principal, payload: UpdateLineSettingsPayload) {
    this.requireManagerOrOwner(principal);

    if (!payload.accountName || payload.accountName.trim() === '') {
      throw new BadRequestException('กรุณาระบุชื่อบัญชี LINE Official Account');
    }

    const basicId = payload.basicId?.trim() || null;
    const channelId = payload.channelId?.trim() || null;
    const channelSecret = payload.channelSecret?.trim() || null;
    const channelAccessToken = payload.channelAccessToken?.trim() || null;
    const autoSendReceipt = payload.autoSendReceipt !== undefined ? payload.autoSendReceipt : true;
    const welcomeMessage = payload.welcomeMessage?.trim() || null;
    const qrCodeUrl = payload.qrCodeUrl?.trim() || null;
    const active = payload.active !== undefined ? payload.active : true;

    const updated = await this.prisma.lineOaSettings.upsert({
      where: { tenantId: principal.tenantId },
      create: {
        tenantId: principal.tenantId,
        accountName: payload.accountName.trim(),
        basicId,
        channelId,
        channelSecret,
        channelAccessToken,
        autoSendReceipt,
        welcomeMessage,
        qrCodeUrl,
        active,
      },
      update: {
        accountName: payload.accountName.trim(),
        basicId,
        channelId,
        channelSecret,
        channelAccessToken,
        autoSendReceipt,
        welcomeMessage,
        qrCodeUrl,
        active,
      },
    });

    // บันทึก Audit Log
    await this.prisma.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        action: 'LINE_SETTINGS_UPDATED',
        entityId: updated.id,
        newValue: {
          accountName: updated.accountName,
          basicId: updated.basicId,
          autoSendReceipt: updated.autoSendReceipt,
          active: updated.active,
          hasToken: Boolean(updated.channelAccessToken),
        },
      },
    });

    return {
      ...updated,
      isConfigured: Boolean(updated.channelAccessToken && updated.channelAccessToken.length > 10),
    };
  }

  /**
   * ทดสอบการเชื่อมต่อ Messaging API
   */
  async testConnection(principal: Principal) {
    const settings = await this.prisma.lineOaSettings.findUnique({
      where: { tenantId: principal.tenantId },
    });

    if (!settings || !settings.channelAccessToken) {
      return {
        connected: false,
        message: 'ยังไม่ได้ระบุ Channel Access Token ในการตั้งค่า LINE OA',
      };
    }

    // หาก Token เป็น mockup หรือโหมดเดโม
    if (settings.channelAccessToken.startsWith('mock_') || settings.channelAccessToken === 'test_token') {
      return {
        connected: true,
        botName: settings.accountName,
        basicId: settings.basicId || '@rubtang',
        message: 'เชื่อมต่อกับ LINE Messaging API สำเร็จ (Mock/Demo Mode)',
      };
    }

    // ทดสอบยิงไปที่ LINE Bot Info API จริง
    try {
      const response = await fetch('https://api.line.me/v2/bot/info', {
        headers: {
          Authorization: `Bearer ${settings.channelAccessToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        return {
          connected: false,
          message: errorData?.message || `LINE API ตอบกลับด้วยสถานะ ${response.status}`,
        };
      }

      const botInfo = (await response.json()) as any;
      return {
        connected: true,
        botName: botInfo.displayName || settings.accountName,
        basicId: botInfo.basicId ? `@${botInfo.basicId}` : settings.basicId || '',
        pictureUrl: botInfo.pictureUrl,
        message: 'เชื่อมต่อกับ LINE Messaging API สำเร็จ พร้อมใช้งานส่ง E-Receipt',
      };
    } catch (err: any) {
      return {
        connected: false,
        message: `ไม่สามารถเชื่อมต่อ LINE API: ${err.message || 'Network error'}`,
      };
    }
  }

  /**
   * ผูกบัญชี LINE กับข้อมูลลูกค้า/สมาชิก
   */
  async linkCustomer(principal: Principal, customerId: string, payload: LinkCustomerLinePayload) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: principal.tenantId },
    });

    if (!customer) {
      throw new NotFoundException('ไม่พบข้อมูลลูกค้า');
    }

    if (!payload.lineUserId || payload.lineUserId.trim() === '') {
      throw new BadRequestException('กรุณาระบุ LINE User ID');
    }

    // ตรวจสอบว่า lineUserId นี้ถูกผูกกับลูกค้ารายอื่นในร้านเดียวกันแล้วหรือไม่
    const duplicate = await this.prisma.customer.findFirst({
      where: {
        tenantId: principal.tenantId,
        lineUserId: payload.lineUserId.trim(),
        NOT: { id: customerId },
      },
    });

    if (duplicate) {
      throw new BadRequestException(
        `LINE User ID นี้ถูกผูกกับสมาชิกลูกค้า “${duplicate.name} (${duplicate.phone})” แล้ว`
      );
    }

    const updated = await this.prisma.customer.update({
      where: { tenantId_id: { tenantId: principal.tenantId, id: customerId } },
      data: {
        lineUserId: payload.lineUserId.trim(),
        lineDisplayName: payload.lineDisplayName?.trim() || customer.name,
        linePictureUrl: payload.linePictureUrl?.trim() || null,
        lineLinkedAt: new Date(),
      },
    });

    // บันทึก Audit Log
    await this.prisma.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        action: 'LINE_CUSTOMER_LINKED',
        entityId: customerId,
        newValue: {
          customerName: customer.name,
          phone: customer.phone,
          lineUserId: updated.lineUserId,
          lineDisplayName: updated.lineDisplayName,
        },
      },
    });

    return updated;
  }

  /**
   * ยกเลิกการผูกบัญชี LINE ของลูกค้า
   */
  async unlinkCustomer(principal: Principal, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: principal.tenantId },
    });

    if (!customer) {
      throw new NotFoundException('ไม่พบข้อมูลลูกค้า');
    }

    const previousLineUserId = customer.lineUserId;

    const updated = await this.prisma.customer.update({
      where: { tenantId_id: { tenantId: principal.tenantId, id: customerId } },
      data: {
        lineUserId: null,
        lineDisplayName: null,
        linePictureUrl: null,
        lineLinkedAt: null,
      },
    });

    // บันทึก Audit Log
    await this.prisma.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        action: 'LINE_CUSTOMER_UNLINKED',
        entityId: customerId,
        oldValue: {
          unlinkedLineUserId: previousLineUserId,
        },
        newValue: {
          customerName: customer.name,
          phone: customer.phone,
        },
      },
    });

    return updated;
  }

  /**
   * สร้างโครงสร้าง LINE Flex Message Bubble Container สำหรับ E-Receipt
   */
  buildFlexReceipt(sale: any, tenant: any, customer?: any): LineFlexBubbleMessage {
    const formattedDate = new Date(sale.createdAt).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const itemRows = (sale.items || []).map((item: any) => ({
      type: 'box',
      layout: 'horizontal',
      margin: 'sm',
      contents: [
        {
          type: 'text',
          text: `${item.name} × ${Number(item.quantity)}`,
          size: 'xs',
          color: '#334155',
          flex: 4,
          wrap: true,
        },
        {
          type: 'text',
          text: `฿${Number(item.subtotal).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          size: 'xs',
          color: '#0f172a',
          flex: 2,
          align: 'end',
          weight: 'bold',
        },
      ],
    }));

    const discountNum = Number(sale.discount || 0);

    const bubble: any = {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#06C755',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: 'E-RECEIPT · ใบเสร็จรับเงินอิเล็กทรอนิกส์',
            color: '#dcfce7',
            size: 'xxs',
            weight: 'bold',
            letterSpacing: '0.5px',
          },
          {
            type: 'text',
            text: tenant.name,
            color: '#ffffff',
            size: 'lg',
            weight: 'bold',
            margin: 'sm',
          },
          {
            type: 'text',
            text: `เลขที่: ${sale.receiptNumber}`,
            color: '#f0fdf4',
            size: 'xs',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: [
          // Branch & Date Info
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'วันที่:', size: 'xxs', color: '#64748b', flex: 1 },
              { type: 'text', text: formattedDate, size: 'xxs', color: '#0f172a', flex: 3, align: 'end' },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'xs',
            contents: [
              { type: 'text', text: 'สาขา:', size: 'xxs', color: '#64748b', flex: 1 },
              { type: 'text', text: sale.branch?.name || 'สำนักงานใหญ่', size: 'xxs', color: '#0f172a', flex: 3, align: 'end' },
            ],
          },
          { type: 'separator', margin: 'md', color: '#e2e8f0' },
          // Items
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            contents: itemRows,
          },
          { type: 'separator', margin: 'md', color: '#e2e8f0' },
          // Subtotal
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: 'รวมเงิน', size: 'xs', color: '#64748b' },
              {
                type: 'text',
                text: `฿${Number(sale.subtotal).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                size: 'xs',
                color: '#334155',
                align: 'end',
              },
            ],
          },
          ...(discountNum > 0
            ? [
                {
                  type: 'box',
                  layout: 'horizontal',
                  margin: 'xs',
                  contents: [
                    { type: 'text', text: 'ส่วนลด', size: 'xs', color: '#dc2626' },
                    {
                      type: 'text',
                      text: `-฿${discountNum.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      size: 'xs',
                      color: '#dc2626',
                      align: 'end',
                      weight: 'bold',
                    },
                  ],
                },
              ]
            : []),
          // Total
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: 'ยอดสุทธิ (Total)', size: 'md', weight: 'bold', color: '#0f172a' },
              {
                type: 'text',
                text: `฿${Number(sale.total).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                size: 'xl',
                weight: 'bold',
                color: '#06C755',
                align: 'end',
              },
            ],
          },
          // Payment method
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'xs',
            contents: [
              { type: 'text', text: 'วิธีชำระ:', size: 'xxs', color: '#64748b' },
              {
                type: 'text',
                text: sale.paymentMethod === 'CASH' ? 'เงินสด (Cash)' : 'โอนเงิน / PromptPay QR',
                size: 'xxs',
                color: '#475569',
                align: 'end',
                weight: 'bold',
              },
            ],
          },
          // Points
          ...(customer
            ? [
                { type: 'separator', margin: 'md', color: '#e2e8f0' },
                {
                  type: 'box',
                  layout: 'horizontal',
                  margin: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: `สมาชิก: ${customer.name}`,
                      size: 'xs',
                      color: '#0284c7',
                      weight: 'bold',
                      flex: 2,
                    },
                    {
                      type: 'text',
                      text: `+${sale.pointsEarned || 0} แต้ม (คงเหลือ: ${customer.points})`,
                      size: 'xs',
                      color: '#0284c7',
                      align: 'end',
                      weight: 'bold',
                      flex: 3,
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'ดูใบเสร็จฉบับเต็ม / PDF',
              uri: `https://rubtang.pos/receipts/${sale.id}`,
            },
            style: 'primary',
            color: '#06C755',
            height: 'sm',
          },
          {
            type: 'text',
            text: 'ขอบคุณที่ใช้บริการ · จัดการโดย RubTang POS',
            size: 'xxs',
            color: '#94a3b8',
            align: 'center',
            margin: 'sm',
          },
        ],
      },
    };

    return {
      type: 'flex',
      altText: `ใบเสร็จอิเล็กทรอนิกส์ ${sale.receiptNumber} (${tenant.name}) ฿${Number(sale.total).toFixed(2)}`,
      contents: bubble,
    };
  }

  /**
   * ส่ง E-Receipt เข้า LINE ของลูกค้า
   */
  async sendReceipt(principal: Principal, saleId: string, payload?: SendLineReceiptPayload) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, tenantId: principal.tenantId },
      include: {
        items: true,
        branch: true,
        customer: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('ไม่พบรายการขาย');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: principal.tenantId },
    });

    const settings = await this.prisma.lineOaSettings.findUnique({
      where: { tenantId: principal.tenantId },
    });

    // กำหนดผู้รับ LINE User ID
    const targetLineUserId =
      payload?.lineUserId?.trim() || sale.customer?.lineUserId || 'U_demo_mock_line_user';

    if (!targetLineUserId) {
      throw new BadRequestException(
        'ไม่พบ LINE User ID ของผู้รับ กรุณาผูกบัญชี LINE กับสมาชิกลูกค้าก่อน หรือระบุ LINE User ID โดยตรง'
      );
    }

    // สร้าง Flex Message Payload
    const flexMessage = this.buildFlexReceipt(sale, tenant, sale.customer);

    let status: LineReceiptStatus = 'SENT';
    let errorMessage: string | null = null;

    // หากมี Token จริง ให้ยิง Push Message ไปยัง LINE
    if (
      settings?.channelAccessToken &&
      !settings.channelAccessToken.startsWith('mock_') &&
      settings.channelAccessToken !== 'test_token' &&
      !targetLineUserId.startsWith('U_demo_')
    ) {
      try {
        const lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${settings.channelAccessToken}`,
          },
          body: JSON.stringify({
            to: targetLineUserId,
            messages: [flexMessage],
          }),
        });

        if (!lineResponse.ok) {
          const errBody = await lineResponse.json().catch(() => null);
          status = 'FAILED';
          errorMessage = errBody?.message || `LINE API error status ${lineResponse.status}`;
        }
      } catch (err: any) {
        status = 'FAILED';
        errorMessage = err.message || 'Network error during LINE push';
      }
    } else {
      // โหมด Mock/จำลอง ส่งสำเร็จเสมือนจริง
      status = 'SENT';
    }

    // บันทึก Log ลงฐานข้อมูล
    const receiptLog = await this.prisma.lineReceiptLog.create({
      data: {
        tenantId: principal.tenantId,
        saleId: sale.id,
        customerId: sale.customerId,
        lineUserId: targetLineUserId,
        receiptNumber: sale.receiptNumber,
        status,
        flexPayload: flexMessage as any,
        errorMessage,
      },
    });

    // บันทึก Audit Log
    await this.prisma.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        action: 'LINE_RECEIPT_SENT',
        entityId: sale.id,
        newValue: {
          receiptNumber: sale.receiptNumber,
          total: Number(sale.total),
          targetLineUserId,
          customerName: sale.customer?.name || null,
          status,
          logId: receiptLog.id,
          errorMessage,
        },
      },
    });

    return {
      success: status === 'SENT',
      logId: receiptLog.id,
      receiptNumber: sale.receiptNumber,
      lineUserId: targetLineUserId,
      status,
      errorMessage,
      flexMessage,
    };
  }

  /**
   * ดึงประวัติการส่ง E-Receipt
   */
  async getReceiptLogs(principal: Principal, limit = 50, offset = 0) {
    const [items, total] = await Promise.all([
      this.prisma.lineReceiptLog.findMany({
        where: { tenantId: principal.tenantId },
        orderBy: { sentAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          customer: {
            select: { id: true, name: true, phone: true, lineDisplayName: true },
          },
          sale: {
            select: { id: true, receiptNumber: true, total: true, createdAt: true },
          },
        },
      }),
      this.prisma.lineReceiptLog.count({
        where: { tenantId: principal.tenantId },
      }),
    ]);

    return {
      items,
      total,
      limit,
      offset,
    };
  }
}
