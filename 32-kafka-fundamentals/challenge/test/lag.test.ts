import { describe, expect, it } from "vitest";
import { computeLag, fetchConsumerLag, type LagAdmin } from "../src/ops/lag.js";

describe("computeLag (TODO 6)", () => {
  it("computes lag per partition and in total", () => {
    const report = computeLag(
      [
        { partition: 0, low: "0", high: "10" },
        { partition: 1, low: "0", high: "5" },
      ],
      [
        { partition: 0, offset: "7" },
        { partition: 1, offset: "5" },
      ],
    );
    expect(report).toEqual({
      partitions: [
        { partition: 0, high: 10, committed: 7, lag: 3 },
        { partition: 1, high: 5, committed: 5, lag: 0 },
      ],
      total: 3,
    });
  });

  it("treats -1 (never committed) as everything retained being unread", () => {
    const report = computeLag([{ partition: 0, low: "2", high: "9" }], [{ partition: 0, offset: "-1" }]);
    expect(report.partitions[0]).toEqual({ partition: 0, high: 9, committed: null, lag: 7 });
  });

  it("treats a partition missing from the committed list as never committed", () => {
    const report = computeLag([{ partition: 0, low: "0", high: "4" }], []);
    expect(report.partitions[0]).toMatchObject({ committed: null, lag: 4 });
  });

  it("measures from the low watermark when retention deleted the committed position", () => {
    const report = computeLag([{ partition: 0, low: "100", high: "120" }], [{ partition: 0, offset: "40" }]);
    expect(report.partitions[0]).toMatchObject({ committed: 40, lag: 20 });
  });

  it("sorts partitions and never reports negative lag", () => {
    const report = computeLag(
      [
        { partition: 2, low: "0", high: "3" },
        { partition: 0, low: "0", high: "3" },
      ],
      [
        { partition: 0, offset: "3" },
        { partition: 2, offset: "3" },
      ],
    );
    expect(report.partitions.map((p) => p.partition)).toEqual([0, 2]);
    expect(report.total).toBe(0);
  });

  it("is what fetchConsumerLag returns for kafkajs-shaped admin responses", async () => {
    const admin: LagAdmin = {
      fetchTopicOffsets: async () => [
        { partition: 0, offset: "8", high: "8", low: "0" },
        { partition: 1, offset: "2", high: "2", low: "0" },
      ],
      fetchOffsets: async () => [{ topic: "orders.v1", partitions: [{ partition: 0, offset: "6" }, { partition: 1, offset: "-1" }] }],
    };
    const report = await fetchConsumerLag(admin, "customer-totals", "orders.v1");
    expect(report.total).toBe(4);
  });
});
