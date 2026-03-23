import { ALARM_NAME, ALARM_PERIOD_MINUTES } from './constants';

export async function createWatchlistAlarm(): Promise<void> {
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
}

export async function watchlistAlarmExists(): Promise<boolean> {
  const alarm = await chrome.alarms.get(ALARM_NAME);
  return !!alarm;
}
