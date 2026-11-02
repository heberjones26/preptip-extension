export const USAGE_KEY = 'pt.usage.v1';
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function openingDetails(now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return {
    date: dateKey(now), week: dateKey(monday), weekday: now.getDay(),
    hour: now.getHours(), at: now.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    utcOffsetMinutes: -now.getTimezoneOffset()
  };
}

export function addOpening(data, userId, event) {
  const next = structuredClone(data || { version: 1, teachers: {} });
  const key = `teacher:${userId}`;
  const teacher = next.teachers[key] ||= { userId, firstSeen: event.at, days: {} };
  const day = teacher.days[event.date] ||= {
    date: event.date, week: event.week, weekday: event.weekday,
    opens: 0, hours: Array(24).fill(0), firstOpen: event.at, lastOpen: event.at,
    timeZone: event.timeZone, utcOffsetMinutes: event.utcOffsetMinutes
  };
  day.opens += 1;
  day.hours[event.hour] += 1;
  day.firstOpen = day.firstOpen < event.at ? day.firstOpen : event.at;
  day.lastOpen = day.lastOpen > event.at ? day.lastOpen : event.at;
  return next;
}

// Include enrolled teachers with zero activity in the requested week.
export function weeklyReport(data, week) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error('Use a Monday date: YYYY-MM-DD');
  const monday = new Date(`${week}T12:00:00`);
  if (Number.isNaN(monday.getTime()) || dateKey(monday) !== week || monday.getDay() !== 1) {
    throw new Error('Use a valid Monday date');
  }
  const end = new Date(monday);
  end.setDate(end.getDate() + 7);
  const rows = Object.values(data?.teachers || {}).filter((t) =>
    Object.keys(t.days).some((day) => day < dateKey(end))
  ).map((teacher) => {
    const days = Object.values(teacher.days).filter((d) => d.week === week);
    const officeDays = days.filter((d) => d.weekday >= 1 && d.weekday <= 5);
    return {
      userId: teacher.userId, week, distinctOfficeDays: officeDays.length,
      metric: officeDays.length >= 3 ? 1 : 0,
      totalOpens: days.reduce((sum, d) => sum + d.opens, 0),
      officeDayOpens: officeDays.reduce((sum, d) => sum + d.opens, 0)
    };
  });
  return {
    week, teachers: rows,
    qualifyingTeachers: rows.reduce((sum, r) => sum + r.metric, 0),
    teacherCount: rows.length,
    averageOfficeDays: rows.length ? rows.reduce((sum, r) => sum + r.distinctOfficeDays, 0) / rows.length : null
  };
}
