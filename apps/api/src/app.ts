import { Body, Controller, Get, HttpCode, Inject, Module, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthRequest, AuthService, cookieOptions, SessionGuard, sessionCookie, tokenHash } from './auth';
import { BranchStaffService } from './branch-staff';
import { CatalogService } from './catalog';
import { CheckoutService } from './checkout';
import { CustomerService } from './customer';
import { DashboardService } from './dashboard';
import { Database } from './database';
import { InventoryService } from './inventory';
import { ShiftService } from './shift';
import { TransferService } from './transfer';
import { PromotionService } from './promotion';
import { ProcurementService } from './procurement';
import { ReportService } from './report';
import { LoyaltyService } from './loyalty';
import { StockTakeService } from './stock-take';
import { TaxInvoiceService } from './tax-invoice';
import { PromptPayService } from './promptpay';
import { AuditService } from './audit';
import { LineService } from './line';
import { RefundService } from './refund';
import { parse, auditQuerySchema, updateLineSettingsSchema, linkCustomerLineSchema, sendLineReceiptSchema, lineReceiptLogsQuerySchema, createSaleReturnSchema, returnsQuerySchema } from './validation';

@Controller()
class AppController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(InventoryService) private readonly inventory: InventoryService,
    @Inject(BranchStaffService) private readonly branchStaff: BranchStaffService,
    @Inject(CheckoutService) private readonly checkout: CheckoutService,
    @Inject(CustomerService) private readonly customer: CustomerService,
    @Inject(DashboardService) private readonly dashboard: DashboardService,
    @Inject(ShiftService) private readonly shift: ShiftService,
    @Inject(TransferService) private readonly transfer: TransferService,
    @Inject(PromotionService) private readonly promotion: PromotionService,
    @Inject(ProcurementService) private readonly procurement: ProcurementService,
    @Inject(ReportService) private readonly report: ReportService,
    @Inject(LoyaltyService) private readonly loyalty: LoyaltyService,
    @Inject(StockTakeService) private readonly stockTake: StockTakeService,
    @Inject(TaxInvoiceService) private readonly taxInvoice: TaxInvoiceService,
    @Inject(PromptPayService) private readonly promptPay: PromptPayService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LineService) private readonly line: LineService,
    @Inject(RefundService) private readonly refund: RefundService,
  ) {}

  @Get('health') health() { return { status: 'ok', service: 'rubtang-api' }; }
  @Post('auth/register') register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) { return this.auth.register(body, res); }
  @Post('auth/login') @HttpCode(200) login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) { return this.auth.login(body, res); }

  @Get('auth/me') @UseGuards(SessionGuard)
  async me(@Req() req: AuthRequest) {
    const p = req.principal;
    const [user, tenant, branches] = await Promise.all([
      this.db.user.findUniqueOrThrow({ where: { id: p.userId }, select: { id: true, displayName: true, email: true } }),
      this.db.tenant.findUniqueOrThrow({ where: { id: p.tenantId }, select: { id: true, name: true } }),
      this.db.branch.findMany({ where: { tenantId: p.tenantId, ...(p.role === 'OWNER' ? {} : { id: { in: p.branchIds } }) }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return { user, tenant, branches, role: p.role };
  }

  @Post('auth/logout') @HttpCode(200) @UseGuards(SessionGuard)
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.db.session.deleteMany({ where: { tokenHash: tokenHash(req.cookies[sessionCookie]) } });
    res.clearCookie(sessionCookie, cookieOptions());
    return { ok: true };
  }

  @Get('products') @UseGuards(SessionGuard)
  list(@Req() req: AuthRequest, @Query('branchId') branchId: unknown, @Query('search') search: unknown) { return this.catalog.list(req.principal, branchId, search); }

  @Post('products') @UseGuards(SessionGuard)
  create(@Req() req: AuthRequest, @Body() body: unknown) { return this.catalog.create(req.principal, body); }

  @Post('products/:id') @HttpCode(200) @UseGuards(SessionGuard)
  update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) { return this.catalog.update(req.principal, id, body); }

  @Get('inventory/movements') @UseGuards(SessionGuard)
  history(@Req() req: AuthRequest, @Query('branchId') branch: unknown, @Query('productId') product: unknown, @Query('cursor') cursor: unknown) { return this.inventory.history(req.principal, branch, product, cursor); }

  @Post('inventory/movements') @UseGuards(SessionGuard)
  receive(@Req() req: AuthRequest, @Body() body: unknown) { return this.inventory.record(req.principal, body); }

  @Get('branches') @UseGuards(SessionGuard)
  listBranches(@Req() req: AuthRequest) { return this.branchStaff.listBranches(req.principal); }

  @Post('branches') @UseGuards(SessionGuard)
  createBranch(@Req() req: AuthRequest, @Body() body: unknown) { return this.branchStaff.createBranch(req.principal, body); }

  @Get('staff') @UseGuards(SessionGuard)
  listStaff(@Req() req: AuthRequest) { return this.branchStaff.listStaff(req.principal); }

  @Post('staff') @UseGuards(SessionGuard)
  createStaff(@Req() req: AuthRequest, @Body() body: unknown) { return this.branchStaff.createStaff(req.principal, body); }

  @Post('checkout') @HttpCode(200) @UseGuards(SessionGuard)
  processCheckout(@Req() req: AuthRequest, @Body() body: unknown) { return this.checkout.processCheckout(req.principal, body); }

  @Get('sales') @UseGuards(SessionGuard)
  listSales(@Req() req: AuthRequest, @Query('branchId') branchId: unknown) { return this.checkout.listSales(req.principal, branchId); }

  @Post('sales/:id/void') @HttpCode(200) @UseGuards(SessionGuard)
  voidSale(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) { return this.checkout.voidSale(req.principal, id, body); }


  @Get('customers') @UseGuards(SessionGuard)
  listCustomers(@Req() req: AuthRequest, @Query('search') search: unknown) { return this.customer.list(req.principal, search); }

  @Post('customers') @UseGuards(SessionGuard)
  createCustomer(@Req() req: AuthRequest, @Body() body: unknown) { return this.customer.create(req.principal, body); }

  @Get('customers/:id') @UseGuards(SessionGuard)
  getCustomer(@Req() req: AuthRequest, @Param('id') id: string) { return this.customer.getById(req.principal, id); }

  @Get('dashboard') @UseGuards(SessionGuard)
  getDashboard(@Req() req: AuthRequest, @Query('branchId') branchId?: unknown) { return this.dashboard.getMetrics(req.principal, branchId); }

  @Get('shifts/current') @UseGuards(SessionGuard)
  getCurrentShift(@Req() req: AuthRequest, @Query('branchId') branchId: unknown) { return this.shift.getCurrentShift(req.principal, branchId); }

  @Post('shifts/open') @UseGuards(SessionGuard)
  openShift(@Req() req: AuthRequest, @Body() body: unknown) { return this.shift.openShift(req.principal, body); }

  @Post('shifts/:id/close') @HttpCode(200) @UseGuards(SessionGuard)
  closeShift(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) { return this.shift.closeShift(req.principal, id, body); }

  @Get('shifts') @UseGuards(SessionGuard)
  listShifts(@Req() req: AuthRequest, @Query('branchId') branchId?: unknown) { return this.shift.listShifts(req.principal, branchId); }

  @Get('transfers') @UseGuards(SessionGuard)
  listTransfers(@Req() req: AuthRequest, @Query('branchId') branchId?: unknown, @Query('status') status?: unknown) { return this.transfer.listTransfers(req.principal, branchId, status); }

  @Post('transfers') @UseGuards(SessionGuard)
  createTransfer(@Req() req: AuthRequest, @Body() body: unknown) { return this.transfer.createTransfer(req.principal, body); }

  @Post('transfers/:id/receive') @HttpCode(200) @UseGuards(SessionGuard)
  receiveTransfer(@Req() req: AuthRequest, @Param('id') id: string) { return this.transfer.receiveTransfer(req.principal, id); }

  @Post('transfers/:id/cancel') @HttpCode(200) @UseGuards(SessionGuard)
  cancelTransfer(@Req() req: AuthRequest, @Param('id') id: string) { return this.transfer.cancelTransfer(req.principal, id); }

  @Get('promotions') @UseGuards(SessionGuard)
  listPromotions(@Req() req: AuthRequest, @Query('branchId') branchId?: unknown, @Query('activeOnly') activeOnly?: unknown) { return this.promotion.listPromotions(req.principal, branchId, activeOnly); }

  @Post('promotions') @UseGuards(SessionGuard)
  createPromotion(@Req() req: AuthRequest, @Body() body: unknown) { return this.promotion.createPromotion(req.principal, body); }

  @Post('promotions/:id') @HttpCode(200) @UseGuards(SessionGuard)
  updatePromotion(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) { return this.promotion.updatePromotion(req.principal, id, body); }

  @Post('promotions/validate') @HttpCode(200) @UseGuards(SessionGuard)
  validatePromotion(@Req() req: AuthRequest, @Body() body: unknown) { return this.promotion.validatePromotion(req.principal, body); }

  @Get('suppliers') @UseGuards(SessionGuard)
  listSuppliers(@Req() req: AuthRequest, @Query('search') search?: unknown) {
    return this.procurement.listSuppliers(req.principal, typeof search === 'string' ? search : undefined);
  }

  @Post('suppliers') @UseGuards(SessionGuard)
  createSupplier(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.procurement.createSupplier(req.principal, body);
  }

  @Post('suppliers/:id') @HttpCode(200) @UseGuards(SessionGuard)
  updateSupplier(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.procurement.updateSupplier(req.principal, id, body);
  }

  @Get('purchase-orders') @UseGuards(SessionGuard)
  listPurchaseOrders(
    @Req() req: AuthRequest,
    @Query('branchId') branchId?: string,
    @Query('status') status?: any,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.procurement.listPurchaseOrders(req.principal, { branchId, status, supplierId });
  }

  @Get('purchase-orders/:id') @UseGuards(SessionGuard)
  getPurchaseOrder(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.procurement.getPurchaseOrder(req.principal, id);
  }

  @Post('purchase-orders') @UseGuards(SessionGuard)
  createPurchaseOrder(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.procurement.createPurchaseOrder(req.principal, body);
  }

  @Post('purchase-orders/:id/receive') @HttpCode(200) @UseGuards(SessionGuard)
  receiveGoods(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.procurement.receiveGoods(req.principal, id, body);
  }

  @Post('purchase-orders/:id/cancel') @HttpCode(200) @UseGuards(SessionGuard)
  cancelPurchaseOrder(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.procurement.cancelPurchaseOrder(req.principal, id);
  }

  @Get('reports/sales') @UseGuards(SessionGuard)
  getSalesReport(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.report.getSalesReport(req.principal, query);
  }

  @Get('reports/top-products') @UseGuards(SessionGuard)
  getTopProducts(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.report.getTopProductsReport(req.principal, query);
  }

  @Get('reports/inventory-valuation') @UseGuards(SessionGuard)
  getInventoryValuation(@Req() req: AuthRequest, @Query('branchId') branchId?: string) {
    return this.report.getInventoryValuationReport(req.principal, branchId);
  }

  @Get('customers/:id/ledger') @UseGuards(SessionGuard)
  getCustomerLedger(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.loyalty.getCustomerLedger(req.principal, id);
  }

  @Post('customers/:id/adjust-points') @HttpCode(200) @UseGuards(SessionGuard)
  adjustPoints(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.loyalty.adjustPoints(req.principal, id, body);
  }

  @Get('loyalty/rewards') @UseGuards(SessionGuard)
  listRewards(@Req() req: AuthRequest) {
    return this.loyalty.listRewards(req.principal);
  }

  @Post('loyalty/rewards') @UseGuards(SessionGuard)
  createReward(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.loyalty.createReward(req.principal, body);
  }

  @Post('loyalty/rewards/:id/toggle') @HttpCode(200) @UseGuards(SessionGuard)
  toggleReward(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.loyalty.toggleReward(req.principal, id);
  }

  @Post('loyalty/rewards/:id') @HttpCode(200) @UseGuards(SessionGuard)
  updateReward(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.loyalty.updateReward(req.principal, id, body);
  }

  @Get('stock-takes') @UseGuards(SessionGuard)
  listStockTakes(
    @Req() req: AuthRequest,
    @Query('branchId') branchId?: string,
    @Query('status') status?: any,
  ) {
    return this.stockTake.list(req.principal, { branchId, status });
  }

  @Get('stock-takes/:id') @UseGuards(SessionGuard)
  getStockTake(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.stockTake.getById(req.principal, id);
  }

  @Post('stock-takes') @UseGuards(SessionGuard)
  createStockTake(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.stockTake.create(req.principal, body);
  }

  @Post('stock-takes/:id/counts') @HttpCode(200) @UseGuards(SessionGuard)
  updateStockTakeCounts(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.stockTake.updateCounts(req.principal, id, body);
  }

  @Post('stock-takes/:id/approve') @HttpCode(200) @UseGuards(SessionGuard)
  approveStockTake(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.stockTake.reconcileAndApprove(req.principal, id);
  }

  @Post('stock-takes/:id/cancel') @HttpCode(200) @UseGuards(SessionGuard)
  cancelStockTake(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.stockTake.cancel(req.principal, id);
  }

  @Post('sales/:id/tax-invoice') @HttpCode(200) @UseGuards(SessionGuard)
  createTaxInvoice(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.taxInvoice.createTaxInvoice(req.principal, id, body);
  }

  @Get('sales/:id/tax-invoice') @UseGuards(SessionGuard)
  getTaxInvoiceBySaleId(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.taxInvoice.getTaxInvoiceBySaleId(req.principal, id);
  }

  @Get('tax-invoices/:id') @UseGuards(SessionGuard)
  getTaxInvoice(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.taxInvoice.getTaxInvoice(req.principal, id);
  }

  @Get('branches/:id/tax-settings') @UseGuards(SessionGuard)
  getBranchTaxSettings(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.taxInvoice.getBranchTaxSettings(req.principal, id);
  }

  @Post('branches/:id/tax-settings') @HttpCode(200) @UseGuards(SessionGuard)
  updateBranchTaxSettings(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.taxInvoice.updateBranchTaxSettings(req.principal, id, body);
  }

  @Get('branches/:id/promptpay') @UseGuards(SessionGuard)
  getBranchPromptPay(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.promptPay.getBranchPromptPay(req.principal, id);
  }

  @Post('branches/:id/promptpay') @HttpCode(200) @UseGuards(SessionGuard)
  updateBranchPromptPay(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.promptPay.updateBranchPromptPay(req.principal, id, body as any);
  }

  @Post('branches/:id/promptpay/dynamic-qr') @HttpCode(200) @UseGuards(SessionGuard)
  generatePromptPayQr(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { amount: number | string; ref1?: string }
  ) {
    return this.promptPay.generateDynamicQr(req.principal, id, body.amount, body.ref1);
  }

  @Post('sales/verify-slip') @HttpCode(200) @UseGuards(SessionGuard)
  verifySlip(@Req() req: AuthRequest, @Body() body: { expectedAmount: number; transferRef: string; slipImageUrl?: string }) {
    return this.promptPay.verifySlip(req.principal, body);
  }

  @Get('audits') @UseGuards(SessionGuard)
  getAuditLogs(@Req() req: AuthRequest, @Query() query: unknown) {
    const parsed = parse(auditQuerySchema, query);
    return this.audit.list(req.principal, parsed);
  }

  @Get('audits/metrics') @UseGuards(SessionGuard)
  getAuditMetrics(@Req() req: AuthRequest) {
    return this.audit.getMetrics(req.principal);
  }

  @Get('audits/actions') @UseGuards(SessionGuard)
  getAuditActions(@Req() req: AuthRequest) {
    return this.audit.getActions(req.principal);
  }

  @Get('audits/:id') @UseGuards(SessionGuard)
  getAuditLogById(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.audit.getById(req.principal, id);
  }

  // LINE Official Account & E-Receipt
  @Get('line/settings') @UseGuards(SessionGuard)
  getLineSettings(@Req() req: AuthRequest) {
    return this.line.getSettings(req.principal);
  }

  @Post('line/settings') @HttpCode(200) @UseGuards(SessionGuard)
  updateLineSettings(@Req() req: AuthRequest, @Body() body: unknown) {
    const payload = parse(updateLineSettingsSchema, body);
    return this.line.updateSettings(req.principal, payload);
  }

  @Post('line/test-connection') @HttpCode(200) @UseGuards(SessionGuard)
  testLineConnection(@Req() req: AuthRequest) {
    return this.line.testConnection(req.principal);
  }

  @Post('line/customers/:id/link') @HttpCode(200) @UseGuards(SessionGuard)
  linkCustomerLine(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    const payload = parse(linkCustomerLineSchema, body);
    return this.line.linkCustomer(req.principal, id, payload);
  }

  @Post('line/customers/:id/unlink') @HttpCode(200) @UseGuards(SessionGuard)
  unlinkCustomerLine(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.line.unlinkCustomer(req.principal, id);
  }

  @Post('sales/:id/send-line-receipt') @HttpCode(200) @UseGuards(SessionGuard)
  sendLineReceipt(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    const payload = parse(sendLineReceiptSchema, body || {});
    return this.line.sendReceipt(req.principal, id, payload);
  }

  @Get('line/receipt-logs') @UseGuards(SessionGuard)
  getLineReceiptLogs(@Req() req: AuthRequest, @Query() query: unknown) {
    const parsed = parse(lineReceiptLogsQuerySchema, query || {});
    return this.line.getReceiptLogs(req.principal, parsed.limit, parsed.offset);
  }

  // ── Partial Returns & Refunds ──

  @Get('sales/:id/returnable-items') @UseGuards(SessionGuard)
  getReturnableItems(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.refund.getReturnableItems(req.principal, id);
  }

  @Post('sales/:id/returns') @UseGuards(SessionGuard) @HttpCode(201)
  createSaleReturn(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.refund.createReturn(req.principal, id, body);
  }

  @Get('sales/:id/returns') @UseGuards(SessionGuard)
  getSaleReturns(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.refund.getSaleReturns(req.principal, id);
  }

  @Get('returns') @UseGuards(SessionGuard)
  listReturns(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.refund.listReturns(req.principal, query || {});
  }

  @Get('returns/:id') @UseGuards(SessionGuard)
  getReturnById(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.refund.getReturnById(req.principal, id);
  }
}


@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
  controllers: [AppController],
  providers: [
    Database,
    AuthService,
    SessionGuard,
    CatalogService,
    InventoryService,
    BranchStaffService,
    CheckoutService,
    CustomerService,
    DashboardService,
    ShiftService,
    TransferService,
    PromotionService,
    ProcurementService,
    ReportService,
    LoyaltyService,
    StockTakeService,
    TaxInvoiceService,
    PromptPayService,
    AuditService,
    LineService,
    RefundService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}


