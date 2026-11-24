import type { AppDeps } from "./app.js";
import type { Config } from "./config.js";
import { type Clock, systemClock } from "./lib/clock.js";
import { type IdGenerator, randomId } from "./lib/ids.js";
import { createConsoleLogger, type Logger } from "./lib/logger.js";
import { InMemoryProductRepository } from "./repositories/inMemoryProductRepository.js";
import { ProductService } from "./services/productService.js";

export interface ContainerOptions {
  config: Config;
  clock?: Clock;
  ids?: IdGenerator;
  logger?: Logger;
}

/** Builds the object graph from an already-loaded config. */
export function createContainer(opts: ContainerOptions): AppDeps {
  const products = new InMemoryProductRepository();
  return {
    productService: new ProductService({
      products,
      clock: opts.clock ?? systemClock,
      ids: opts.ids ?? randomId,
    }),
    logger: opts.logger ?? createConsoleLogger(opts.config.logLevel),
    config: opts.config,
  };
}
