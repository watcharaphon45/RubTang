export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const isMockMode = import.meta.env.VITE_USE_MOCK_DATA === 'true';

export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (isMockMode) {
    const { mockApi } = await import('./mock-api');
    return mockApi<T>(path, body);
  }
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, typeof data?.message === 'string' ? data.message : 'เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่');
  return data as T;
}

export type Profile = {
  user: { id: string; email: string; displayName: string };
  tenant: { id: string; name: string };
  branches: { id: string; name: string }[];
  role: 'OWNER' | 'MANAGER' | 'CASHIER';
};
export type Product = { id: string; name: string; sku: string; barcode: string | null; price: string; quantity: string; active: boolean };
export type Branch = { id: string; name: string };
export type StaffMember = {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: 'OWNER' | 'MANAGER' | 'CASHIER';
  branches: Branch[];
};
export type MembershipTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
export type Customer = {
  id: string;
  name: string;
  phone: string;
  points: number;
  lifetimePoints?: number;
  tier?: MembershipTier;
  note?: string | null;
  lineUserId?: string | null;
  lineDisplayName?: string | null;
  linePictureUrl?: string | null;
  lineLinkedAt?: string | null;
  createdAt: string;
};
export type CheckoutItemPayload = { productId: string; quantity: number };
export type CheckoutPayload = {
  branchId: string;
  customerId?: string;
  items: CheckoutItemPayload[];
  discount?: string;
  redeemPoints?: number;
  paymentMethod: 'CASH' | 'TRANSFER';
  receivedAmount?: string;
  transferRef?: string;
};
export type SaleReceiptItem = {
  id?: string;
  productId: string;
  name: string;
  sku: string;
  price: string;
  quantity: string;
  returnedQuantity?: string;
  subtotal: string;
};
export type SaleReceipt = {
  id: string;
  receiptNumber: string;
  createdAt: string;
  branch: { id: string; name: string };
  cashier: { displayName: string };
  customer?: { id: string; name: string; phone: string; pointsEarned: number } | null;
  subtotal: string;
  discount: string;
  total: string;
  paymentMethod: 'CASH' | 'TRANSFER';
  receivedAmount: string;
  change: string;
  transferRef?: string;
  items: SaleReceiptItem[];
};

export type SaleHistoryItem = {
  id: string;
  receiptNumber: string;
  status: 'COMPLETED' | 'VOIDED';
  createdAt: string;
  branchName: string;
  cashierName: string;
  voidedAt?: string | null;
  voidedByName?: string | null;
  voidReason?: string | null;
  customer?: { id: string; name: string; phone: string } | null;
  subtotal: string;
  discount: string;
  total: string;
  paymentMethod: 'CASH' | 'TRANSFER';
  transferRef?: string | null;
  paymentDetail?: Record<string, unknown> | null;
  items: SaleReceiptItem[];
};

export type DashboardMetrics = {
  todaySales: number;
  todayBills: number;
  yesterdaySales: number;
  monthSales: number;
  monthBills: number;
  lowStockCount: number;
};

export type DailySalesItem = {
  date: string;
  dayLabel: string;
  amount: number;
};

export type TopProductItem = {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
};

export type LowStockItem = {
  productId: string;
  name: string;
  sku: string;
  branchName: string;
  quantity: number;
};

export type BranchComparisonItem = {
  branchId: string;
  name: string;
  sales: number;
};

export type DashboardData = {
  metrics: DashboardMetrics;
  dailySales: DailySalesItem[];
  topProducts: TopProductItem[];
  lowStock: LowStockItem[];
  paymentBreakdown: {
    cash: number;
    transfer: number;
  };
  branchComparison: BranchComparisonItem[];
};

export type ShiftData = {
  id: string;
  branchId: string;
  cashierId: string;
  cashierName: string;
  status: 'OPEN' | 'CLOSED';
  startingCash: number;
  cashSales: number;
  transferSales: number;
  expectedCash: number;
  actualCash?: number | null;
  difference?: number | null;
  salesCount: number;
  notes?: string | null;
  openedAt: string;
  closedAt?: string | null;
};

export type StockTransferItemData = {
  id: string;
  productId: string;
  quantity: string | number;
  product: { id: string; name: string; sku: string };
};

export type StockTransferData = {
  id: string;
  transferNumber: string;
  originBranchId: string;
  destinationBranchId: string;
  status: 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  notes?: string | null;
  createdAt: string;
  receivedAt?: string | null;
  cancelledAt?: string | null;
  originBranch: { id: string; name: string };
  destinationBranch: { id: string; name: string };
  createdBy: { user: { displayName: string } };
  receivedBy?: { user: { displayName: string } } | null;
  items: StockTransferItemData[];
};

export type PromotionData = {
  id: string;
  name: string;
  code?: string | null;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  minSpend: number;
  maxDiscount?: number | null;
  branchId?: string | null;
  branchName?: string;
  active: boolean;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
};

export type ValidatePromotionResult = {
  valid: boolean;
  promotion: {
    id: string;
    name: string;
    code?: string | null;
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
    discountValue: number;
    minSpend: number;
    maxDiscount?: number | null;
  };
  subtotal: number;
  discountAmount: number;
  finalTotal: number;
};

export type SupplierData = {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  creditDays: number;
  active: boolean;
  poCount?: number;
  createdAt: string;
};

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'ORDERED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export type PurchaseOrderItemData = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  barcode?: string | null;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  totalCost: number;
};

export type PurchaseOrderData = {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  supplierId: string;
  supplierName: string;
  branchId: string;
  branchName: string;
  createdByName: string;
  receivedByName?: string | null;
  totalAmount: number;
  itemCount: number;
  totalOrderedQty: number;
  totalReceivedQty: number;
  note?: string | null;
  orderedAt?: string | null;
  receivedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  items?: PurchaseOrderItemData[];
};

export type SalesReportRow = {
  date: string;
  bills: number;
  subtotal: number;
  discount: number;
  netSales: number;
  cashSales: number;
  transferSales: number;
};

export type SalesReportData = {
  summary: {
    totalSales: number;
    totalBills: number;
    averageOrderValue: number;
    totalDiscount: number;
    totalCash: number;
    totalTransfer: number;
  };
  rows: SalesReportRow[];
};

export type ReportTopProductItem = {
  productId: string;
  name: string;
  sku: string;
  quantitySold: number;
  revenue: number;
  sharePercent: number;
};

export type TopProductsReportData = {
  totalRevenue: number;
  items: ReportTopProductItem[];
};

export type InventoryValuationItem = {
  productId: string;
  productName: string;
  sku: string;
  barcode?: string | null;
  branchId: string;
  branchName: string;
  quantity: number;
  unitPrice: number;
  valuation: number;
};

export type InventoryValuationData = {
  summary: {
    totalSKUs: number;
    totalUnits: number;
    totalValuation: number;
    outOfStockCount: number;
    lowStockCount: number;
  };
  items: InventoryValuationItem[];
};

export type PointLedgerItem = {
  id: string;
  type: 'EARN' | 'REDEEM' | 'REVERT' | 'ADJUST';
  amount: number;
  balanceAfter: number;
  reason: string;
  saleReceiptNumber?: string | null;
  actorName?: string | null;
  createdAt: string;
};

export type CustomerLedgerResponse = {
  customer: {
    id: string;
    name: string;
    phone: string;
    points: number;
    lifetimePoints: number;
    tier: MembershipTier;
  };
  ledgers: PointLedgerItem[];
};

export type LoyaltyReward = {
  id: string;
  title: string;
  pointsCost: number;
  discountAmount: string;
  active: boolean;
  createdAt?: string;
};

export function getCustomerLedger(customerId: string) {
  return api<CustomerLedgerResponse>(`/customers/${customerId}/ledger`);
}

export function adjustCustomerPoints(customerId: string, payload: { amount: number; reason: string }) {
  return api<{ customer: Customer; ledger: PointLedgerItem }>(`/customers/${customerId}/adjust-points`, payload);
}

export function getLoyaltyRewards() {
  return api<LoyaltyReward[]>('/loyalty/rewards');
}

export function createLoyaltyReward(payload: { title: string; pointsCost: number; discountAmount: string }) {
  return api<LoyaltyReward>('/loyalty/rewards', payload);
}

export function toggleLoyaltyReward(rewardId: string) {
  return api<LoyaltyReward>(`/loyalty/rewards/${rewardId}/toggle`, {});
}

export function updateLoyaltyReward(rewardId: string, payload: Partial<{ title: string; pointsCost: number; discountAmount: string; active: boolean }>) {
  return api<LoyaltyReward>(`/loyalty/rewards/${rewardId}`, payload);
}

export type StockTakeStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface StockTakeItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  barcode?: string | null;
  systemQuantity: string;
  countedQuantity: string;
  variance: string;
  unitPrice: string;
  varianceValue: string;
  note?: string | null;
}

export interface StockTakeSummary {
  id: string;
  takeNumber: string;
  status: StockTakeStatus;
  branchId: string;
  branchName: string;
  createdByName: string;
  approvedByName?: string | null;
  note?: string | null;
  startedAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
  totalItems: number;
  itemsWithVariance: number;
  totalVarianceValue: string;
}

export interface StockTakeDetail extends StockTakeSummary {
  items: StockTakeItem[];
}

export function listStockTakes(branchId?: string, status?: StockTakeStatus) {
  const params = new URLSearchParams();
  if (branchId) params.append('branchId', branchId);
  if (status) params.append('status', status);
  const qs = params.toString();
  return api<StockTakeSummary[]>(`/stock-takes${qs ? `?${qs}` : ''}`);
}

export function getStockTake(id: string) {
  return api<StockTakeDetail>(`/stock-takes/${id}`);
}

export function createStockTake(payload: { branchId: string; note?: string }) {
  return api<StockTakeSummary>('/stock-takes', payload);
}

export function updateStockTakeCounts(id: string, items: { itemId: string; countedQuantity: string; note?: string }[]) {
  return api<{ success: boolean; updatedCount: number }>(`/stock-takes/${id}/counts`, { items });
}

export function approveStockTake(id: string) {
  return api<{ id: string; takeNumber: string; status: StockTakeStatus; completedAt: string; adjustedCount: number }>(`/stock-takes/${id}/approve`, {});
}

export function cancelStockTake(id: string) {
  return api<{ id: string; takeNumber: string; status: StockTakeStatus }>(`/stock-takes/${id}/cancel`, {});
}

export interface BranchTaxSettings {
  id: string;
  name: string;
  companyName?: string | null;
  taxId?: string | null;
  taxAddress?: string | null;
  branchNumber?: string | null;
  isHeadOffice?: boolean;
  phone?: string | null;
  receiptHeader?: string | null;
  receiptFooter?: string | null;
}

export interface TaxInvoiceItem {
  productId: string;
  name: string;
  sku: string;
  price: string;
  quantity: string;
  subtotal: string;
}

export interface TaxInvoice {
  id: string;
  invoiceNumber: string;
  type: 'FULL' | 'ABBREVIATED';
  status: 'ISSUED' | 'CANCELLED';
  saleId: string;
  receiptNumber: string;
  issuedAt: string;
  issuedByName: string;
  issuer: {
    name: string;
    taxId: string;
    address: string;
    branchNumber: string;
    isHeadOffice: boolean;
    phone: string;
    receiptHeader?: string | null;
    receiptFooter?: string | null;
  };
  customer: {
    name: string;
    taxId?: string | null;
    address?: string | null;
    branchNumber?: string | null;
    isHeadOffice: boolean;
    phone?: string | null;
  };
  subtotal: string;
  discount: string;
  taxableAmount: string;
  vatRate: string;
  vatAmount: string;
  total: string;
  bahtText: string;
  paymentMethod: string;
  note?: string | null;
  items: TaxInvoiceItem[];
}

export interface TaxInvoiceRequest {
  customerName: string;
  customerTaxId?: string | null;
  customerAddress?: string | null;
  customerBranchNumber?: string | null;
  customerIsHeadOffice?: boolean;
  customerPhone?: string | null;
  saveCustomerTaxInfo?: boolean;
  note?: string | null;
}

export function createTaxInvoice(saleId: string, payload: TaxInvoiceRequest) {
  return api<TaxInvoice>(`/sales/${saleId}/tax-invoice`, payload);
}

export function getTaxInvoiceBySaleId(saleId: string) {
  return api<TaxInvoice | null>(`/sales/${saleId}/tax-invoice`);
}

export function getTaxInvoice(id: string) {
  return api<TaxInvoice>(`/tax-invoices/${id}`);
}

export function getBranchTaxSettings(branchId: string) {
  return api<BranchTaxSettings>(`/branches/${branchId}/tax-settings`);
}

export function updateBranchTaxSettings(branchId: string, payload: Partial<BranchTaxSettings>) {
  return api<BranchTaxSettings>(`/branches/${branchId}/tax-settings`, payload);
}

export interface BranchPromptPay {
  id: string;
  name: string;
  promptPayType: 'MOBILE' | 'TAX_ID' | 'EWALLET' | null;
  promptPayAccount: string | null;
  promptPayName: string | null;
  promptPayBank: string | null;
}

export interface VerifySlipPayload {
  expectedAmount: number;
  transferRef: string;
  slipImageUrl?: string;
}

export interface VerifySlipResult {
  verified: boolean;
  transferRef?: string;
  matchedAmount?: number;
  verifiedAt?: string;
  slipImageUrl?: string | null;
  message?: string;
  reason?: string;
  duplicateSaleId?: string;
}

export function getBranchPromptPay(branchId: string) {
  return api<BranchPromptPay>(`/branches/${branchId}/promptpay`);
}

export function updateBranchPromptPay(branchId: string, payload: Partial<BranchPromptPay>) {
  return api<BranchPromptPay>(`/branches/${branchId}/promptpay`, payload);
}

export function verifySlip(payload: VerifySlipPayload) {
  return api<VerifySlipResult>('/sales/verify-slip', payload);
}

export interface AuditLogActor {
  id: string;
  email: string;
  displayName: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string;
  actor?: AuditLogActor | null;
  details: any;
  createdAt: string;
  actionLabel?: string;
  category?: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
}

export interface AuditLogMetrics {
  totalCount: number;
  todayCount: number;
  weekCount: number;
  criticalCount: number;
  categoryCounts: Record<string, number>;
  topActors: { actorId: string; name: string; email: string; count: number }[];
}

export interface AuditLogListResponse {
  items: AuditLogItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditQueryParams {
  limit?: number;
  offset?: number;
  action?: string;
  category?: string;
  entityType?: string;
  actorUserId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export function getAuditLogs(params?: AuditQueryParams) {
  const q = new URLSearchParams();
  if (params) {
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    if (params.action) q.set('action', params.action);
    if (params.category) q.set('category', params.category);
    if (params.entityType) q.set('entityType', params.entityType);
    if (params.actorUserId) q.set('actorUserId', params.actorUserId);
    if (params.startDate) q.set('startDate', params.startDate);
    if (params.endDate) q.set('endDate', params.endDate);
    if (params.search) q.set('search', params.search);
  }
  const queryString = q.toString() ? `?${q.toString()}` : '';
  return api<AuditLogListResponse>(`/audits${queryString}`);
}

export function getAuditMetrics() {
  return api<AuditLogMetrics>('/audits/metrics');
}

export interface LineOaSettings {
  id: string | null;
  tenantId: string;
  accountName: string;
  basicId: string | null;
  channelId: string | null;
  channelSecret: string | null;
  channelAccessToken: string | null;
  autoSendReceipt: boolean;
  welcomeMessage: string | null;
  qrCodeUrl: string | null;
  active: boolean;
  isConfigured?: boolean;
}

export interface LineReceiptLog {
  id: string;
  tenantId: string;
  saleId: string;
  customerId: string | null;
  lineUserId: string;
  receiptNumber: string;
  status: 'SENT' | 'FAILED' | 'PENDING';
  flexPayload: any;
  errorMessage?: string | null;
  sentAt: string;
  customer?: { id: string; name: string; phone: string; lineDisplayName?: string | null } | null;
  sale?: { id: string; receiptNumber: string; total: string; createdAt: string } | null;
}

export interface SendLineReceiptPayload {
  lineUserId?: string;
}

export interface LinkCustomerLinePayload {
  lineUserId: string;
  lineDisplayName?: string;
  linePictureUrl?: string;
}

export function getLineSettings() {
  return api<LineOaSettings>('/line/settings');
}

export function updateLineSettings(payload: Partial<LineOaSettings>) {
  return api<LineOaSettings>('/line/settings', payload);
}

export function testLineConnection() {
  return api<{ connected: boolean; botName?: string; basicId?: string; pictureUrl?: string; message: string }>('/line/test-connection', {});
}

export function linkCustomerLine(customerId: string, payload: LinkCustomerLinePayload) {
  return api<Customer>(`/line/customers/${customerId}/link`, payload);
}

export function unlinkCustomerLine(customerId: string) {
  return api<Customer>(`/line/customers/${customerId}/unlink`, {});
}

export function sendLineReceipt(saleId: string, payload?: SendLineReceiptPayload) {
  return api<{
    success: boolean;
    logId: string;
    receiptNumber: string;
    lineUserId: string;
    status: 'SENT' | 'FAILED';
    errorMessage?: string | null;
    flexMessage: any;
  }>(`/sales/${saleId}/send-line-receipt`, payload || {});
}

export function getLineReceiptLogs(params?: { limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.limit !== undefined) q.set('limit', String(params.limit));
  if (params?.offset !== undefined) q.set('offset', String(params.offset));
  const queryString = q.toString() ? `?${q.toString()}` : '';
  return api<{ items: LineReceiptLog[]; total: number; limit: number; offset: number }>(`/line/receipt-logs${queryString}`);
}

// ── Partial Returns & Refunds ──

export type ReturnableItem = {
  saleItemId: string;
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number;
  originalQuantity: number;
  returnedQuantity: number;
  remainingQuantity: number;
  lineSubtotal: number;
};

export type ReturnableSaleInfo = {
  sale: {
    id: string;
    receiptNumber: string;
    status: string;
    total: number;
    subtotal: number;
    discount: number;
    pointsEarned: number;
    pointsRedeemed: number;
    paymentMethod: string;
    createdAt: string;
    branch: { id: string; name: string };
    customer: { id: string; name: string; phone: string; points: number } | null;
  };
  items: ReturnableItem[];
};

export type SaleReturnItem = {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  refundAmount: number;
  restock: boolean;
  condition: 'RESTOCKABLE' | 'DAMAGED';
  note?: string | null;
};

export type SaleReturn = {
  id: string;
  returnNumber: string;
  saleId: string;
  receiptNumber: string;
  branch: { id: string; name: string };
  customer: { id: string; name: string; phone: string } | null;
  refundMethod: 'CASH' | 'TRANSFER' | 'CREDIT_CARD' | 'ORIGINAL_PAYMENT';
  subtotalRefund: number;
  vatRefund: number;
  totalRefund: number;
  pointsDeducted: number;
  reason: string;
  items: SaleReturnItem[];
  createdAt: string;
  allFullyReturned?: boolean;
};

export type SaleReturnListItem = {
  id: string;
  returnNumber: string;
  receiptNumber: string;
  branch: { id: string; name: string };
  refundMethod: string;
  totalRefund: number;
  pointsDeducted: number;
  reason: string;
  processedBy: string;
  itemCount: number;
  items: {
    productName: string;
    sku: string;
    quantity: number;
    refundAmount: number;
    restock: boolean;
    condition: string;
  }[];
  createdAt: string;
};

export type CreateSaleReturnPayload = {
  refundMethod: 'CASH' | 'TRANSFER' | 'CREDIT_CARD' | 'ORIGINAL_PAYMENT';
  reason: string;
  items: {
    saleItemId: string;
    quantity: string;
    restock?: boolean;
    condition?: 'RESTOCKABLE' | 'DAMAGED';
    note?: string;
  }[];
};

export function getReturnableItems(saleId: string) {
  return api<ReturnableSaleInfo>(`/sales/${saleId}/returnable-items`);
}

export function createSaleReturn(saleId: string, payload: CreateSaleReturnPayload) {
  return api<SaleReturn>(`/sales/${saleId}/returns`, payload);
}

export function getSaleReturns(saleId: string) {
  return api<{ saleId: string; receiptNumber: string; returns: SaleReturnListItem[] }>(`/sales/${saleId}/returns`);
}

export function listAllReturns(params?: { branchId?: string; startDate?: string; endDate?: string; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.branchId) q.set('branchId', params.branchId);
  if (params?.startDate) q.set('startDate', params.startDate);
  if (params?.endDate) q.set('endDate', params.endDate);
  if (params?.limit !== undefined) q.set('limit', String(params.limit));
  if (params?.offset !== undefined) q.set('offset', String(params.offset));
  const queryString = q.toString() ? `?${q.toString()}` : '';
  return api<{ items: SaleReturnListItem[]; total: number }>(`/returns${queryString}`);
}

export function getReturnById(returnId: string) {
  return api<SaleReturn>(`/returns/${returnId}`);
}
