import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import argon2 from 'argon2';
import type { HashOptions } from 'argon2';

const password = 'Synthetic benchmark password 2026!';
const memoryCost = numberEnvironment('PASSWORD_ARGON2_MEMORY_KIB', 65_536);
const timeCost = numberEnvironment('PASSWORD_ARGON2_TIME_COST', 3);
const parallelism = numberEnvironment('PASSWORD_ARGON2_PARALLELISM', 1);
const options: HashOptions = {
  type: argon2.argon2id,
  memoryCost,
  timeCost,
  parallelism,
};

async function main(): Promise<void> {
  const eventLoop = monitorEventLoopDelay({ resolution: 10 });
  eventLoop.enable();

  const hashDurations: number[] = [];
  const verifyDurations: number[] = [];
  const hash = await argon2.hash(password, options);
  for (let index = 0; index < 6; index += 1) {
    hashDurations.push(
      await duration(() =>
        argon2.hash(password, options).then(() => undefined),
      ),
    );
    verifyDurations.push(
      await duration(() => argon2.verify(hash, password).then(() => undefined)),
    );
  }

  const refreshDurations: number[] = [];
  let generation = 0;
  for (let index = 0; index < 10_000; index += 1) {
    refreshDurations.push(
      await duration(async () => {
        const presented = generation;
        await Promise.resolve();
        if (presented !== generation) {
          throw new Error('Synthetic refresh race lost');
        }
        generation += 1;
      }),
    );
  }

  eventLoop.disable();
  const memory = process.memoryUsage();
  report('argon2id_hash', hashDurations, {
    memoryCostKiB: memoryCost,
    timeCost,
    parallelism,
  });
  report('argon2id_verify', verifyDurations);
  report('refresh_orchestration_without_io', refreshDurations);
  process.stdout.write(
    `${JSON.stringify({
      benchmark: 'runtime_resources',
      eventLoopDelayP99Ms: nanosecondsToMilliseconds(eventLoop.percentile(99)),
      heapUsedMiB: bytesToMebibytes(memory.heapUsed),
      rssMiB: bytesToMebibytes(memory.rss),
      note: 'Synthetic local benchmark; refresh result excludes database and Redis latency.',
    })}\n`,
  );
}

async function duration(operation: () => Promise<void>): Promise<number> {
  const started = performance.now();
  await operation();
  return performance.now() - started;
}

function report(
  benchmark: string,
  durations: number[],
  metadata: Record<string, number> = {},
): void {
  const sorted = [...durations].sort((left, right) => left - right);
  process.stdout.write(
    `${JSON.stringify({
      benchmark,
      samples: sorted.length,
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      p99Ms: percentile(sorted, 99),
      ...metadata,
    })}\n`,
  );
}

function percentile(sorted: number[], value: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((value / 100) * sorted.length) - 1,
  );
  return Number(sorted[Math.max(0, index)].toFixed(3));
}

function numberEnvironment(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function nanosecondsToMilliseconds(value: number): number {
  return Number((value / 1_000_000).toFixed(3));
}

function bytesToMebibytes(value: number): number {
  return Number((value / 1_048_576).toFixed(2));
}

void main();
