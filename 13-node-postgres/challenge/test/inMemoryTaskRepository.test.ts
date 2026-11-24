import { InMemoryTaskRepository } from "../src/repositories/inMemoryTaskRepository.js";
import { describeTaskRepositoryContract } from "./contract/taskRepository.contract.js";

// The reference implementation. This file passes from the start: it proves
// the contract itself is sound.
describeTaskRepositoryContract("InMemoryTaskRepository", async () => new InMemoryTaskRepository());
