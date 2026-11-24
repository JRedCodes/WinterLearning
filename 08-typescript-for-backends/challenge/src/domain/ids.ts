// Ported from ids.js. In the JS days every id was "just a string",
// and that is still true here: the aliases below are documentation only.

export type UserId = string;
export type OrderId = string;
export type Sku = string;

export const UserId = (raw: string): UserId => raw;
export const OrderId = (raw: string): OrderId => raw;
export const Sku = (raw: string): Sku => raw;
