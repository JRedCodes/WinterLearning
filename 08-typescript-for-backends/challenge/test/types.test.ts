/**
 * Type-level acceptance tests.
 *
 * Most of these assertions are checked by the COMPILER, not at runtime:
 * `npm test` runs `tsc --noEmit` first, so a failing type assertion or an
 * unused `@ts-expect-error` fails the build before Vitest even starts.
 *
 * `// @ts-expect-error` means "the next line MUST be a type error". If the
 * line compiles, tsc reports "Unused '@ts-expect-error' directive".
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { OrderId, Sku, UserId } from "../src/domain/ids.js";
import type { Cents } from "../src/domain/money.js";
import type { Order, OrderStatus } from "../src/domain/order.js";
import type { AuthUser } from "../src/domain/user.js";
import type { OrderService } from "../src/services/orderService.js";
import type { OrderRepository } from "../src/repositories/orderRepository.js";
import type { PlaceOrderBody } from "../src/controllers/dto.js";

// Never called: it only exists so the compiler checks these lines.
export function compileTimeChecks(service: OrderService, repo: OrderRepository) {
  const userId = UserId("u_alice");
  const orderId = OrderId("ord_1");

  // @ts-expect-error a UserId must not be assignable to an OrderId
  const wrongId: OrderId = userId;

  // @ts-expect-error raw strings must go through the UserId() constructor
  const rawId: UserId = "u_alice";

  // @ts-expect-error cancelOrder(userId, orderId): swapped arguments must not compile
  void service.cancelOrder(orderId, userId);

  // @ts-expect-error the order repository is keyed by OrderId, not UserId
  void repo.findById(userId);

  // @ts-expect-error a bare number is not Cents (use the cents() constructor)
  const price: Cents = 499;

  return { wrongId, rawId, price };
}

describe("type-level contract (checked by tsc)", () => {
  it("ids are branded: UserId, OrderId and Sku are distinct types that still behave like strings", () => {
    expectTypeOf<UserId>().not.toEqualTypeOf<OrderId>();
    expectTypeOf<OrderId>().not.toEqualTypeOf<Sku>();
    expectTypeOf<UserId>().toExtend<string>();
  });

  it("OrderStatus is a closed union of literals", () => {
    expectTypeOf<OrderStatus>().toEqualTypeOf<"pending" | "paid" | "packed" | "shipped" | "cancelled">();
  });

  it("Order is a discriminated union: only shipped orders carry a tracking number", () => {
    expectTypeOf<Extract<Order, { status: "shipped" }>["trackingNumber"]>().toEqualTypeOf<string>();
    expectTypeOf<Extract<Order, { status: "shipped" }>["carrier"]>().toEqualTypeOf<string>();
    expectTypeOf<Extract<Order, { status: "pending" }>>().not.toHaveProperty("trackingNumber");
    expectTypeOf<Extract<Order, { status: "paid" }>["paidAt"]>().toEqualTypeOf<string>();
  });

  it("money is Cents, never a bare number or string", () => {
    expectTypeOf<Order["totalCents"]>().toEqualTypeOf<Cents>();
    expectTypeOf<Cents>().toExtend<number>();
    expectTypeOf<number>().not.toExtend<Cents>();
  });

  it("the repository is generic and keyed by OrderId", () => {
    expectTypeOf<OrderRepository["findById"]>().parameter(0).toEqualTypeOf<OrderId>();
    expectTypeOf<OrderRepository["findById"]>().returns.resolves.toEqualTypeOf<Order | undefined>();
  });

  it("req.user and res.locals.requestId are typed through declaration merging", () => {
    expectTypeOf<Express.Request["user"]>().toEqualTypeOf<AuthUser | undefined>();
    expectTypeOf<Express.Locals["requestId"]>().toEqualTypeOf<string>();
  });

  it("the place-order body type is derived from the validated shape", () => {
    expectTypeOf<PlaceOrderBody>().toEqualTypeOf<{
      country: string;
      lines: { sku: Sku; quantity: number }[];
    }>();
  });
});

describe("id and money constructors (runtime)", () => {
  it("ids are plain strings at runtime", () => {
    expect(UserId("u_alice")).toBe("u_alice");
    expect(typeof OrderId("ord_1")).toBe("string");
  });

  it("id constructors reject empty strings", () => {
    expect(() => OrderId("")).toThrow();
    expect(() => UserId("   ")).toThrow();
  });
});
