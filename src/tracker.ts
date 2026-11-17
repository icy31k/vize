export type Category = {
  id: number;
  name: string;
};
export type Activity = {
  id: number;
  appID: string;
  appName: string;
  start: number;
  end: number;
  categoryID: number;
};
export type History = {
  categories: Category[];
  activities: Activity[];
  completed: number;
};
export type TimerStatus = {
  phase: 'focus' | 'rest' | 'longRest';
  deadline: number | null;
  remaining: number;
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
  hasStarted: boolean;
};
export type Status = {
  captureEnabled: boolean;
  foreground: {
    id: string;
    name: string;
  } | null;
  recentApp: {
    id: string;
    name: string;
  } | null;
  timer: TimerStatus;
  error: string | null;
};

export type Range = {
  from: number;
  to: number;
};
export const unix = (date: Date) => date.getTime() / 1000;

export function dayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function shiftDay(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function dayRange(date: Date): Range {
  return { from: unix(dayStart(date)), to: unix(shiftDay(date, 1)) };
}

export function weekStart(date: Date) {
  return shiftDay(date, -((date.getDay() + 6) % 7));
}

export function overlap(activity: Activity, range: Range) {
  return Math.max(
    0,
    Math.min(activity.end, range.to) - Math.max(activity.start, range.from),
  );
}

export function summarize(activities: Activity[], range: Range) {
  const categories = new Map<number, number>();
  const apps = new Map<
    number,
    Map<
      string,
      {
        name: string;
        seconds: number;
      }
    >
  >();
  let total = 0;
  for (const activity of activities) {
    const seconds = overlap(activity, range);
    if (seconds === 0) {
      continue;
    }
    total += seconds;
    const id = activity.categoryID;
    categories.set(id, (categories.get(id) ?? 0) + seconds);
    const appTotals = apps.get(id) ?? new Map();
    appTotals.set(activity.appID, {
      name: activity.appName,
      seconds: (appTotals.get(activity.appID)?.seconds ?? 0) + seconds,
    });
    apps.set(id, appTotals);
  }
  return { categories, apps, total };
}

export function duration(seconds: number) {
  const rounded = Math.floor(seconds);
  if (rounded < 60) {
    return `${rounded}s`;
  }
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  return [hours
    ? `${hours}h`
    : '', minutes
    ? `${minutes}m`
    : '']
    .filter(Boolean)
    .join(' ');
}

export function countdown(seconds: number) {
  const rounded = Math.max(0, Math.ceil(seconds));
  return [Math.floor(rounded / 60), rounded % 60]
    .map(part => String(part).padStart(2, '0'))
    .join(':');
}

export function dateLabel(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, options).format(date);
}
