import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';

export const LEAGUE_TIMEZONE = 'Asia/Seoul';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.locale('ko');
dayjs.tz.setDefault(LEAGUE_TIMEZONE);

export function formatDistanceToNow(value: Date | string | null) {
  if (!value) return '—';
  return dayjs(value).tz().fromNow();
}

export function formatDate(value: Date | string | null, format = 'YYYY-MM-DD HH:mm') {
  if (!value) return '—';
  return dayjs(value).tz().format(format);
}

export function toLeagueIso(localDateTime: string) {
  return dayjs.tz(localDateTime, 'YYYY-MM-DDTHH:mm', LEAGUE_TIMEZONE).toISOString();
}

export { dayjs as leagueDayjs };
