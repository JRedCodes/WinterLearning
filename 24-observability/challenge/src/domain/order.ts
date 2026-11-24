export interface LineItem {
  sku: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: string;
  customerId: string;
  items: LineItem[];
  totalCents: number;
  authorizationId: string;
  createdAt: string;
}

export interface PaymentDetails {
  cardNumber: string;
  cvc: string;
}

export interface CheckoutInput {
  customerId: string;
  items: LineItem[];
  payment: PaymentDetails;
}

export function orderTotal(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
}
