import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';

const CHECK_INTERVAL_MS = 30 * 1000;
const MAX_STOPPED_MS = 2 * 60 * 1000;

@Injectable()
export class WorkerHealthService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly _logger = new Logger(WorkerHealthService.name);
  private readonly _stoppedSince = new Map<string, number>();
  private _interval?: NodeJS.Timeout;

  constructor(private _temporalService: TemporalService) {}

  getStoppedWorkers(): string[] {
    try {
      const workers = this._temporalService.getAllWorkers()?.workers;
      if (!workers) {
        return ['all'];
      }
      return [...workers.entries()]
        .filter(([, status]) => !status.isRunning)
        .map(([taskQueue]) => taskQueue);
    } catch {
      return ['all'];
    }
  }

  onApplicationBootstrap() {
    this._interval = setInterval(() => this.check(), CHECK_INTERVAL_MS);
    this._interval.unref();
  }

  onApplicationShutdown() {
    clearInterval(this._interval);
  }

  check(now = Date.now()) {
    const stopped = this.getStoppedWorkers();
    for (const taskQueue of [...this._stoppedSince.keys()]) {
      if (!stopped.includes(taskQueue)) {
        this._stoppedSince.delete(taskQueue);
      }
    }
    for (const taskQueue of stopped) {
      if (!this._stoppedSince.has(taskQueue)) {
        this._stoppedSince.set(taskQueue, now);
      }
    }

    const expired = stopped.filter(
      (taskQueue) => now - this._stoppedSince.get(taskQueue)! >= MAX_STOPPED_MS
    );
    if (!expired.length) {
      return;
    }
    // nestjs-temporal-core gives up after a few restarts and leaves the
    // queue unpolled, so only a fresh process recovers it.
    this._logger.error(
      `Temporal workers stopped for ${MAX_STOPPED_MS / 1000}s: ${expired.join(
        ', '
      )}. Exiting so PM2 restarts the orchestrator.`
    );
    process.exit(1);
  }
}
