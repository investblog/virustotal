import type { QueueItem, QueuePriority, DomainRecord, ApiUsage } from './types';
import { BUDGET, ADHOC_COOLDOWN_MS } from './constants';

const PRIORITY_ORDER: Record<QueuePriority, number> = { high: 0, normal: 1, low: 2 };

export function enqueue(queue: QueueItem[], domain: string, priority: QueuePriority): boolean {
  if (queue.some(item => item.domain === domain)) return false;

  const entry: QueueItem = { domain, priority };
  const insertIdx = queue.findIndex(item => PRIORITY_ORDER[item.priority] > PRIORITY_ORDER[priority]);

  if (insertIdx === -1) {
    queue.push(entry);
  } else {
    queue.splice(insertIdx, 0, entry);
  }
  return true;
}

export function dequeue(queue: QueueItem[]): QueueItem | undefined {
  return queue.shift();
}

export function isQueued(queue: QueueItem[], domain: string): boolean {
  return queue.some(item => item.domain === domain);
}

export function canEnqueue(priority: QueuePriority, usage: ApiUsage): boolean {
  if (priority === 'high') return true;
  if (priority === 'low' && usage.count >= BUDGET.WATCHLIST_RESERVE) return false;
  if (priority === 'normal' && usage.count >= BUDGET.HARD_CAP) return false;
  return true;
}

export function isInCooldown(record: DomainRecord | undefined): boolean {
  if (!record) return false;
  if (record.watchlist) return false;
  return record.last_checked > 0 && (Date.now() - record.last_checked) < ADHOC_COOLDOWN_MS;
}
