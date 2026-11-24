/**
 * Consumer lag: how far a consumer group is behind the end of each partition.
 * The single most useful health metric for any Kafka consumer.
 */

export interface PartitionWatermarks {
  partition: number;
  /** offset of the oldest record still retained */
  low: string;
  /** offset the next produced record will get (the "high watermark") */
  high: string;
}

export interface CommittedOffset {
  partition: number;
  /** next offset the group will read, or "-1" if the group never committed */
  offset: string;
}

export interface PartitionLag {
  partition: number;
  high: number;
  committed: number | null;
  lag: number;
}

export interface LagReport {
  partitions: PartitionLag[];
  total: number;
}

/**
 * TODO(6): compute per-partition and total lag.
 *
 *  - lag = high - committed, per partition, never negative.
 *  - committed "-1" (or a partition missing from `committed`) means the group
 *    never committed there: report committed: null, and every retained record
 *    (high - low) counts as lag.
 *  - A committed offset older than `low` (retention deleted those records)
 *    can't be read anymore: measure lag from `low` instead.
 *  - Return partitions sorted by partition number, plus the total.
 */
export function computeLag(watermarks: PartitionWatermarks[], committed: CommittedOffset[]): LagReport {
  throw new Error("Not implemented: TODO(6)");
}

/** The admin calls needed to compute lag (kafkajs's Admin satisfies this). */
export interface LagAdmin {
  fetchTopicOffsets(topic: string): Promise<Array<{ partition: number; offset: string; high: string; low: string }>>;
  fetchOffsets(options: {
    groupId: string;
    topics: string[];
  }): Promise<Array<{ topic: string; partitions: Array<{ partition: number; offset: string }> }>>;
}

export async function fetchConsumerLag(admin: LagAdmin, groupId: string, topic: string): Promise<LagReport> {
  const [watermarks, offsets] = await Promise.all([
    admin.fetchTopicOffsets(topic),
    admin.fetchOffsets({ groupId, topics: [topic] }),
  ]);
  const committed = offsets.find((o) => o.topic === topic)?.partitions ?? [];
  return computeLag(watermarks, committed);
}
