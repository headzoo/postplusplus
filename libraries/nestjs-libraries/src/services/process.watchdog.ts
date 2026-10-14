import { Worker } from 'node:worker_threads';
import * as inspector from 'node:inspector';

const STARTUP_TIMEOUT_MS = 5 * 60 * 1000;
const STALL_TIMEOUT_MS = 2 * 60 * 1000;
const HEARTBEAT_MS = 5 * 1000;

// Runs on its own thread so it still fires when the main thread is blocked.
// It writes straight to stderr because worker console output goes through
// the main thread, and SIGKILL lets PM2 restart the process.
const WATCHDOG_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { writeSync } = require('node:fs');
const startedAt = Date.now();
let lastBeatAt = startedAt;
let readyAt = 0;
parentPort.on('message', (message) => {
  lastBeatAt = Date.now();
  if (message === 'ready' && !readyAt) readyAt = lastBeatAt;
});
setInterval(() => {
  const now = Date.now();
  const reason = !readyAt
    ? now - startedAt > workerData.startupTimeoutMs &&
      'did not finish starting within ' + workerData.startupTimeoutMs + 'ms'
    : now - lastBeatAt > workerData.stallTimeoutMs &&
      'main thread has not responded for ' + (now - lastBeatAt) + 'ms';
  if (!reason) return;
  writeSync(2, new Date().toISOString() + ' [ProcessWatchdog] ' + workerData.name + ' ' + reason + ', killing pid ' + process.pid + ' so it restarts\\n');
  process.kill(process.pid, 'SIGKILL');
}, 1000);
`;

export type ProcessWatchdog = { ready: () => void };

export const startProcessWatchdog = (name: string): ProcessWatchdog => {
  if (inspector.url()) {
    return { ready: () => undefined };
  }

  const watchdog = new Worker(WATCHDOG_SOURCE, {
    eval: true,
    workerData: {
      name,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      stallTimeoutMs: STALL_TIMEOUT_MS,
    },
  });
  watchdog.unref();
  watchdog.on('error', (error) => {
    console.error(`[ProcessWatchdog] ${name} watchdog stopped`, error);
  });

  const heartbeat = setInterval(
    () => watchdog.postMessage('beat'),
    HEARTBEAT_MS
  );
  heartbeat.unref();

  return { ready: () => watchdog.postMessage('ready') };
};
