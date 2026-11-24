import { describe, expect, it } from "vitest";
import { CLOSE_SLOW_CONSUMER, OPEN, safeSend, type SendableSocket } from "../src/realtime/send.js";

function fakeSocket(overrides: Partial<{ readyState: number; bufferedAmount: number }> = {}) {
  const sent: string[] = [];
  const closes: Array<{ code?: number; reason?: string }> = [];
  const socket: SendableSocket = {
    readyState: overrides.readyState ?? OPEN,
    bufferedAmount: overrides.bufferedAmount ?? 0,
    send: (data) => void sent.push(data),
    close: (code, reason) => void closes.push({ code, reason }),
  };
  return { socket, sent, closes };
}

describe("safeSend (TODO 3)", () => {
  it("sends when the socket is open and the buffer has room", () => {
    const { socket, sent, closes } = fakeSocket();
    expect(safeSend(socket, "hello", 1000)).toBe("sent");
    expect(sent).toEqual(["hello"]);
    expect(closes).toEqual([]);
  });

  it("skips sockets that are not open (closing/closed/connecting) without throwing", () => {
    for (const readyState of [0, 2, 3]) {
      const { socket, sent, closes } = fakeSocket({ readyState });
      expect(safeSend(socket, "hello", 1000)).toBe("skipped");
      expect(sent).toEqual([]);
      expect(closes).toEqual([]);
    }
  });

  it("disconnects a slow consumer with close code 1013 instead of buffering more", () => {
    const { socket, sent, closes } = fakeSocket({ bufferedAmount: 950 });
    expect(safeSend(socket, "x".repeat(100), 1000)).toBe("overloaded");
    expect(sent, "nothing more should be queued for a slow client").toEqual([]);
    expect(closes).toHaveLength(1);
    expect(closes[0]?.code).toBe(CLOSE_SLOW_CONSUMER);
    expect(CLOSE_SLOW_CONSUMER).toBe(1013);
  });

  it("counts the new frame's size in bytes, not characters", () => {
    // "é" is 2 bytes in UTF-8: 900 buffered + 60 chars * 2 bytes = 1020 > 1000.
    const { socket } = fakeSocket({ bufferedAmount: 900 });
    expect(safeSend(socket, "é".repeat(60), 1000)).toBe("overloaded");
    const ok = fakeSocket({ bufferedAmount: 900 });
    expect(safeSend(ok.socket, "e".repeat(60), 1000)).toBe("sent");
  });

  it("allows filling the buffer exactly to the limit", () => {
    const { socket } = fakeSocket({ bufferedAmount: 990 });
    expect(safeSend(socket, "x".repeat(10), 1000)).toBe("sent");
  });
});
