/**
 * TODO(1): Kafka's default partitioner
 *
 * Kafka's Java client (and kafkajs's `Partitioners.DefaultPartitioner`) place a
 * keyed record with:
 *
 *     partition = toPositive(murmur2(utf8Bytes(key))) % numPartitions
 *
 * Implement it byte-for-byte compatibly, so a Java service and this service put
 * the same key on the same partition. The test file has known hash values.
 *
 * murmur2 (32-bit, signed result like a Java int):
 *   seed = 0x9747b28c, m = 0x5bd1e995, r = 24
 *   h = seed XOR length
 *   for each whole 4-byte block (read as a little-endian 32-bit int k):
 *     k *= m;  k ^= k >>> r;  k *= m;
 *     h *= m;  h ^= k;
 *   tail (length % 4 bytes left, fall through!):
 *     3: h ^= byte[2] << 16
 *     2: h ^= byte[1] << 8
 *     1: h ^= byte[0];  h *= m
 *   h ^= h >>> 13;  h *= m;  h ^= h >>> 15
 *   return h as a signed 32-bit int
 *
 * JavaScript gotchas:
 *  - `a * b` on two 32-bit numbers loses precision (floats!). Use Math.imul(a, b)
 *    for 32-bit multiplication.
 *  - `>>>` is the unsigned shift, `| 0` turns a number into a signed 32-bit int.
 *  - The tsconfig forbids switch fall-through (noFallthroughCasesInSwitch), so
 *    write the tail as `if (rest >= 3) ...; if (rest >= 2) ...; if (rest >= 1) {...}`.
 *  - Hash the UTF-8 BYTES of the key (TextEncoder), not the UTF-16 char codes.
 *
 * toPositive(n) clears the sign bit (n & 0x7fffffff). It is NOT Math.abs.
 * partitionFor must throw a RangeError if numPartitions isn't a positive integer.
 */

export function murmur2(data: Uint8Array): number {
  return 0; // TODO(1)
}

export function toPositive(n: number): number {
  return n; // TODO(1)
}

export function partitionFor(key: string, numPartitions: number): number {
  // TODO(1): every key lands on partition 0 until you implement this.
  return 0;
}
