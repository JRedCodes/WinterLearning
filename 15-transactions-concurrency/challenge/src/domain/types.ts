export interface Concert {
  id: number;
  name: string;
  capacity: number;
  priceCents: number;
  ticketsSold: number;
}

export interface Wallet {
  id: number;
  owner: string;
  balanceCents: number;
}

export interface Booking {
  id: number;
  concertId: number;
  walletId: number;
  quantity: number;
  totalCents: number;
  createdAt: string;
}

export interface Transfer {
  fromWalletId: number;
  toWalletId: number;
  amountCents: number;
}

export type LedgerKind = "deposit" | "booking" | "transfer_in" | "transfer_out";
