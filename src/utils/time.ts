import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);
dayjs.locale('ko');

export function formatDistanceToNow(value: Date | string | null) {
  if (!value) return '—';
  return dayjs(value).fromNow();
}

export function formatDate(value: Date | string | null, format = 'YYYY-MM-DD HH:mm') {
  if (!value) return '—';
  return dayjs(value).format(format);
}
