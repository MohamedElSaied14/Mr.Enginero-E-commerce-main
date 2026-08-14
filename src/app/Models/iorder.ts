export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';

export interface IOrderItem {
  productId: number;
  name: string;
  brand: string;
  imgUrl: string;
  unitPrice: number;
  originalPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface IOrderCustomer {
  name: string;
  phone: string;
  email: string;
}

export interface IOrderAddress {
  governorate: string;
  city: string;
  street: string;
  notes: string;
}

export interface IStatusEntry {
  status: OrderStatus;
  at: string;
  by?: string;
  note?: string | null;
}

export interface IContactEntry {
  at: string;
  by: string;
  channel: 'email' | 'phone' | 'whatsapp' | 'note';
  subject?: string | null;
  message: string;
  delivered?: boolean;
  error?: string | null;
}

/** Outcome of one notification attempt, recorded so the dashboard can show it. */
export interface IMailOutcome {
  sent: boolean;
  at?: string;
  mode?: string;
  error?: string;
  skipped?: string;
  messageId?: string;
}

export interface IOrder {
  id: number;
  ref: string;
  status: OrderStatus;
  paymentMethod: 'cod';
  paymentStatus: 'unpaid' | 'paid' | 'cancelled';

  customer: IOrderCustomer;
  address: IOrderAddress;
  items: IOrderItem[];
  itemCount: number;

  subtotal: number;
  savings: number;
  shipping: number;
  codFee: number;
  total: number;
  currency: string;

  statusHistory: IStatusEntry[];
  /** Admin-only — absent from the public receipt. */
  contactLog?: IContactEntry[];
  emails?: Record<string, IMailOutcome>;

  /** True only when the confirmation email actually left the server. */
  receiptEmailed?: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface IOrderPage {
  items: IOrder[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  counts: Partial<Record<OrderStatus, number>>;
  totals: { open: number; orders: number; units: number };
  mailer: { mode: string; configured: boolean; managerInbox: string; from: string };
}

export interface ICheckoutConfig {
  governorates: string[];
  shippingFee: number;
  freeShippingOver: number;
  codFee: number;
  maxUnitsPerLine: number;
  paymentMethods: { id: string; label: string; description: string }[];
}

export interface ICheckoutRequest {
  customer: IOrderCustomer;
  address: IOrderAddress;
  items: { productId: number; quantity: number }[];
}

export const ORDER_STATUSES: { value: OrderStatus; label: string; tone: string }[] = [
  { value: 'pending', label: 'New', tone: 'warn' },
  { value: 'confirmed', label: 'Confirmed', tone: 'info' },
  { value: 'preparing', label: 'Preparing', tone: 'info' },
  { value: 'shipped', label: 'Shipped', tone: 'info' },
  { value: 'delivered', label: 'Delivered', tone: 'ok' },
  { value: 'cancelled', label: 'Cancelled', tone: 'bad' },
];

/** What the manager can move an order to next. */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};
