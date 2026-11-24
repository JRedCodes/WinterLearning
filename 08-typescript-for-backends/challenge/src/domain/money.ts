// All money is stored as an integer number of cents (EUR).

export type Cents = number;

export const cents = (value: number): Cents => value;

export const addCents = (...amounts: Cents[]): Cents => amounts.reduce((sum, a) => sum + a, 0);

export const multiplyCents = (amount: Cents, factor: number): Cents => amount * factor;
