type AttendanceEventLike = {
  server_time: string;
  type: string;
};

function typeOrder(type: string) {
  if (type === "OUT") return 0;
  if (type === "IN") return 1;
  return 2;
}

export function compareAttendanceEventsAsc(a: AttendanceEventLike, b: AttendanceEventLike) {
  const at = new Date(a.server_time).getTime();
  const bt = new Date(b.server_time).getTime();
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
  if (a.server_time !== b.server_time) return a.server_time < b.server_time ? -1 : 1;
  return typeOrder(a.type) - typeOrder(b.type);
}

export function compareAttendanceEventsDesc(a: AttendanceEventLike, b: AttendanceEventLike) {
  const byTime = compareAttendanceEventsAsc(a, b);
  if (byTime !== 0) return -byTime;
  return typeOrder(b.type) - typeOrder(a.type);
}
