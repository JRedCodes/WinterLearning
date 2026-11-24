import { partitionFor } from "./partitioner.js";
import type {
  ConsumedMessage,
  ConsumerPort,
  EachMessageHandler,
  PartitionWriteResult,
  ProduceRequest,
  ProducerPort,
  TopicPartitionOffset,
} from "./types.js";

/**
 * A small, deterministic model of a Kafka cluster, used by the tests (and fun
 * to read: it's Kafka's core ideas in ~250 lines).
 *
 * What it models:
 *  - topics split into partitions, each an append-only array of records
 *  - keyed messages placed with partitionFor(key, n); unkeyed ones round-robin
 *  - consumer groups: each partition is owned by exactly one member, members
 *    joining or leaving trigger a rebalance
 *  - committed offsets per (group, topic, partition): where a member resumes
 *    after a rebalance or restart
 *  - handler errors: the failed message is retried, and later messages of that
 *    partition wait behind it (just like kafkajs)
 *  - failure injection: failNextSends(), failNextCommits()
 *
 * What it doesn't model: time, network, replication, retention, batching.
 *
 * Unlike a real consumer, nothing happens in the background: tests call
 * `await broker.drain()` to deliver everything that's pending.
 */

interface GroupState {
  members: InMemoryConsumer[];
  /** key "topic/partition" → next offset to read */
  committed: Map<string, number>;
  /** key "topic/partition" → where to start if nothing is committed yet */
  start: Map<string, number>;
  generation: number;
}

export interface HandlerError {
  groupId: string;
  topic: string;
  partition: number;
  offset: string;
  error: unknown;
}

const tpKey = (topic: string, partition: number) => `${topic}/${partition}`;

export class InMemoryBroker {
  readonly defaultPartitions: number;
  /** Every send() request, in order (lets tests inspect acks and batching). */
  readonly sendLog: ProduceRequest[] = [];
  /** Every error thrown by a consumer handler, in order. */
  readonly handlerErrors: HandlerError[] = [];

  private readonly topics = new Map<string, ConsumedMessage[][]>();
  private readonly groups = new Map<string, GroupState>();
  private readonly now: () => number;
  private roundRobin = 0;
  private memberSeq = 0;
  private sendFailures = 0;
  private commitFailures = 0;

  constructor(options: { defaultPartitions?: number; now?: () => number } = {}) {
    this.defaultPartitions = options.defaultPartitions ?? 3;
    this.now = options.now ?? (() => Date.now());
  }

  /* ------------------------------------------------------------ topics */

  createTopic(name: string, partitions: number = this.defaultPartitions): void {
    const existing = this.topics.get(name);
    if (existing) {
      if (existing.length !== partitions) {
        throw new Error(`topic ${name} already exists with ${existing.length} partitions`);
      }
      return;
    }
    if (!Number.isInteger(partitions) || partitions < 1) throw new Error("partitions must be >= 1");
    this.topics.set(
      name,
      Array.from({ length: partitions }, () => []),
    );
  }

  partitionCount(topic: string): number {
    return this.partitionsOf(topic).length;
  }

  /** Records of one partition, or of all partitions (partition order, then offset order). */
  records(topic: string, partition?: number): readonly ConsumedMessage[] {
    const parts = this.partitionsOf(topic);
    if (partition === undefined) return parts.flat();
    const p = parts[partition];
    if (!p) throw new Error(`topic ${topic} has no partition ${partition}`);
    return p;
  }

  /** The "high watermark": offset the next record in this partition will get. */
  endOffset(topic: string, partition: number): number {
    return this.records(topic, partition).length;
  }

  /** Next offset the group will read from this partition, or undefined if it never committed. */
  committedOffset(groupId: string, topic: string, partition: number): number | undefined {
    return this.groups.get(groupId)?.committed.get(tpKey(topic, partition));
  }

  /* ------------------------------------------------- failure injection */

  /** The next `n` send() calls reject (simulates a broker outage / timeout). */
  failNextSends(n = 1): void {
    this.sendFailures += n;
  }

  /** The next `n` commitOffsets() calls reject (simulates a rebalance during commit). */
  failNextCommits(n = 1): void {
    this.commitFailures += n;
  }

  /* --------------------------------------------------------- clients */

  producer(): ProducerPort {
    return { send: (request) => this.append(request) };
  }

  consumer(options: { groupId: string }): InMemoryConsumer {
    return new InMemoryConsumer(this, options.groupId, `member-${++this.memberSeq}`);
  }

  /**
   * Delivers pending records to every running consumer until nothing is left
   * (or maxRounds is reached, e.g. when a message keeps failing).
   * Returns the number of delivery attempts.
   */
  async drain(options: { maxRounds?: number } = {}): Promise<number> {
    const maxRounds = options.maxRounds ?? 20;
    let attempts = 0;
    for (let round = 0; round < maxRounds; round++) {
      let attemptedThisRound = false;
      for (const [groupId, group] of this.groups) {
        for (const member of [...group.members]) {
          for (const { topic, partition } of member.assignment()) {
            const generation = group.generation;
            const log = this.records(topic, partition);
            while (member.isRunning() && group.generation === generation) {
              const position = member.position(topic, partition);
              const record = log[position];
              if (!record) break;
              attempts++;
              attemptedThisRound = true;
              try {
                await member.deliver({ topic, partition, message: { ...record, headers: { ...record.headers } } });
              } catch (error) {
                // Retry this same message next round; later messages of the partition wait.
                this.handlerErrors.push({ groupId, topic, partition, offset: record.offset, error });
                break;
              }
              // A rebalance during the handler invalidates our position: the new
              // owner resumes from the committed offset instead.
              if (group.generation !== generation) break;
              member.setPosition(topic, partition, position + 1);
              if (member.autoCommits()) {
                try {
                  this.commit(groupId, [{ topic, partition, offset: String(position + 1) }]);
                } catch {
                  // kafkajs retries auto-commits later; the next successful one covers this offset.
                }
              }
            }
          }
        }
      }
      if (!attemptedThisRound) break;
    }
    return attempts;
  }

  /* ------------------------------------------ internals used by clients */

  /** @internal */
  async append(request: ProduceRequest): Promise<PartitionWriteResult[]> {
    this.sendLog.push(structuredClone(request));
    if (this.sendFailures > 0) {
      this.sendFailures--;
      throw new Error("simulated broker unavailable (send failed)");
    }
    if (!this.topics.has(request.topic)) this.createTopic(request.topic); // auto-create, like a dev broker
    const parts = this.partitionsOf(request.topic);
    const results = new Map<number, PartitionWriteResult>();
    for (const m of request.messages) {
      const partition =
        m.key === null ? this.roundRobin++ % parts.length : partitionFor(m.key, parts.length);
      const log = parts[partition];
      if (!log) throw new Error(`partitioner returned ${partition} for a topic with ${parts.length} partitions`);
      const offset = String(log.length);
      log.push({
        key: m.key,
        value: m.value,
        headers: { ...m.headers },
        offset,
        timestamp: String(this.now()),
      });
      if (!results.has(partition)) results.set(partition, { topic: request.topic, partition, baseOffset: offset });
    }
    return [...results.values()];
  }

  /** @internal */
  commit(groupId: string, offsets: TopicPartitionOffset[]): void {
    if (this.commitFailures > 0) {
      this.commitFailures--;
      throw new Error("simulated commit failure (group is rebalancing)");
    }
    const group = this.group(groupId);
    for (const o of offsets) {
      const n = Number(o.offset);
      if (!Number.isInteger(n) || n < 0) throw new Error(`invalid offset to commit: ${JSON.stringify(o.offset)}`);
      if (n > this.endOffset(o.topic, o.partition)) {
        throw new Error(`cannot commit offset ${n} beyond the end of ${o.topic}/${o.partition}`);
      }
      group.committed.set(tpKey(o.topic, o.partition), n);
    }
  }

  /** @internal */
  join(member: InMemoryConsumer): void {
    const group = this.group(member.groupId);
    for (const topic of member.topics()) {
      if (!this.topics.has(topic)) this.createTopic(topic);
      this.partitionsOf(topic).forEach((log, partition) => {
        const key = tpKey(topic, partition);
        if (!group.start.has(key)) group.start.set(key, member.fromBeginning() ? 0 : log.length);
      });
    }
    group.members.push(member);
    this.rebalance(group);
  }

  /** @internal */
  leave(member: InMemoryConsumer): void {
    const group = this.groups.get(member.groupId);
    if (!group || !group.members.includes(member)) return;
    group.members = group.members.filter((m) => m !== member);
    this.rebalance(group);
  }

  /** @internal */
  resumeOffset(groupId: string, topic: string, partition: number): number {
    const group = this.group(groupId);
    const key = tpKey(topic, partition);
    return group.committed.get(key) ?? group.start.get(key) ?? 0;
  }

  /**
   * Round-robin assignment: partition p of a topic goes to the (p mod n)-th
   * member subscribed to that topic. Every member then resumes from the
   * group's committed offsets, so anything processed but not committed is
   * delivered again. That's the at-least-once redelivery you must handle.
   */
  private rebalance(group: GroupState): void {
    group.generation++;
    for (const m of group.members) m.assign([]);
    const topics = new Set(group.members.flatMap((m) => m.topics()));
    const assignments = new Map<InMemoryConsumer, { topic: string; partition: number }[]>();
    for (const topic of [...topics].sort()) {
      const eligible = group.members.filter((m) => m.topics().includes(topic));
      for (let p = 0; p < this.partitionCount(topic); p++) {
        const owner = eligible[p % eligible.length];
        if (!owner) continue;
        const list = assignments.get(owner) ?? [];
        list.push({ topic, partition: p });
        assignments.set(owner, list);
      }
    }
    for (const [member, tps] of assignments) member.assign(tps);
  }

  private group(groupId: string): GroupState {
    let g = this.groups.get(groupId);
    if (!g) {
      g = { members: [], committed: new Map(), start: new Map(), generation: 0 };
      this.groups.set(groupId, g);
    }
    return g;
  }

  private partitionsOf(topic: string): ConsumedMessage[][] {
    const parts = this.topics.get(topic);
    if (!parts) throw new Error(`unknown topic ${topic}`);
    return parts;
  }
}

export class InMemoryConsumer implements ConsumerPort {
  private subscribed: string[] = [];
  private startFromBeginning = false;
  private handler: EachMessageHandler | undefined;
  private autoCommit = true;
  private running = false;
  private assigned: { topic: string; partition: number }[] = [];
  private readonly positions = new Map<string, number>();

  constructor(
    private readonly broker: InMemoryBroker,
    readonly groupId: string,
    readonly memberId: string,
  ) {}

  async subscribe(options: { topics: string[]; fromBeginning?: boolean }): Promise<void> {
    if (this.running) throw new Error("subscribe() must be called before run()");
    this.subscribed.push(...options.topics);
    this.startFromBeginning = options.fromBeginning ?? false;
  }

  async run(options: { eachMessage: EachMessageHandler; autoCommit?: boolean }): Promise<void> {
    if (this.running) throw new Error("run() was already called");
    if (this.subscribed.length === 0) throw new Error("subscribe() to at least one topic before run()");
    this.handler = options.eachMessage;
    this.autoCommit = options.autoCommit ?? true;
    this.running = true;
    this.broker.join(this);
  }

  async commitOffsets(offsets: TopicPartitionOffset[]): Promise<void> {
    this.broker.commit(this.groupId, offsets);
  }

  /** Leaving the group (or crashing) hands this member's partitions to the others. */
  async disconnect(): Promise<void> {
    this.running = false;
    this.broker.leave(this);
  }

  /** Partitions currently owned by this member. */
  assignment(): { topic: string; partition: number }[] {
    return this.running ? [...this.assigned] : [];
  }

  /* ---- used by the broker ---- */

  /** @internal */
  topics(): string[] {
    return [...this.subscribed];
  }
  /** @internal */
  fromBeginning(): boolean {
    return this.startFromBeginning;
  }
  /** @internal */
  isRunning(): boolean {
    return this.running;
  }
  /** @internal */
  autoCommits(): boolean {
    return this.autoCommit;
  }
  /** @internal */
  assign(tps: { topic: string; partition: number }[]): void {
    this.assigned = tps;
    this.positions.clear();
    for (const { topic, partition } of tps) {
      this.positions.set(tpKey(topic, partition), this.broker.resumeOffset(this.groupId, topic, partition));
    }
  }
  /** @internal */
  position(topic: string, partition: number): number {
    return this.positions.get(tpKey(topic, partition)) ?? this.broker.resumeOffset(this.groupId, topic, partition);
  }
  /** @internal */
  setPosition(topic: string, partition: number, offset: number): void {
    this.positions.set(tpKey(topic, partition), offset);
  }
  /** @internal */
  async deliver(payload: Parameters<EachMessageHandler>[0]): Promise<void> {
    if (!this.handler) throw new Error("consumer is not running");
    await this.handler(payload);
  }
}
