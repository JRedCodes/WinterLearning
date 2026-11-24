import type pg from "pg";

export const DEMO_PRODUCTS = [
  { sku: "DESK-OAK-120", name: "Oak standing desk", description: "120cm, electric", priceCents: 54900, stock: 12 },
  { sku: "CHAIR-ERGO", name: "Ergonomic chair", description: "Mesh back, lumbar support", priceCents: 32900, stock: 30 },
  { sku: "LAMP-LED", name: "LED desk lamp", description: "Dimmable, USB-C", priceCents: 4900, stock: 140 },
] as const;

/** Inserts the demo products (ids 1, 2, 3 on a fresh table). */
export async function seedProducts(pool: pg.Pool): Promise<void> {
  for (const p of DEMO_PRODUCTS) {
    await pool.query(
      `INSERT INTO products (sku, name, description, price_cents, stock)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (sku) DO NOTHING`,
      [p.sku, p.name, p.description, p.priceCents, p.stock],
    );
  }
}
