import { expectTypeOf } from "vitest";
import { deepFreeze, type DeepReadonly } from "../../src/deepFreeze.js";

const config = deepFreeze({ db: { host: "localhost", ports: [5433] }, name: "api" });

expectTypeOf(config).toEqualTypeOf<DeepReadonly<{ db: { host: string; ports: number[] }; name: string }>>();
expectTypeOf(config.db.ports).toEqualTypeOf<readonly number[]>();

// @ts-expect-error top-level properties are readonly
config.name = "other";

// @ts-expect-error nested properties are readonly too
config.db.host = "evil";

// @ts-expect-error nested arrays are readonly
config.db.ports.push(1);

expectTypeOf(deepFreeze(42)).toEqualTypeOf<number>();
