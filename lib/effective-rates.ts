type UserRow = {
  id: string;
  name?: string | null;
  role?: string | null;
  is_programmer?: boolean | null;
  hourly_rate: number | null;
  km_rate: number | null;
  programming_rate: number | null;
};

type UserSiteRateRow = {
  user_id: string;
  site_id: string;
  hourly_rate: number | null;
  km_rate: number | null;
  programming_rate: number | null;
};

type UserRateHistoryRow = {
  user_id: string;
  effective_from: string;
  hourly_rate: number | null;
  km_rate: number | null;
  programming_rate: number | null;
};

type UserSiteRateHistoryRow = {
  user_id: string;
  site_id: string;
  effective_from: string;
  hourly_rate: number | null;
  km_rate: number | null;
  programming_rate: number | null;
};

type DefaultSnapshot = {
  hourly_rate: number | null;
  km_rate: number | null;
  programming_rate: number | null;
  effective_from: string | null;
};

type SiteOverrideSnapshot = {
  hourly_rate: number | null;
  km_rate: number | null;
  programming_rate: number | null;
  effective_from: string | null;
} | null;

export type EffectiveRate = {
  hourly: number;
  km: number;
  prog: number;
  source: "default" | "site";
  effective_from: string | null;
};

const BASE_EFFECTIVE_DAY = "2000-01-01";

function toNum(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asDay(value: string | null | undefined) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
}

function historyTableMissing(error: unknown) {
  const text = String((error as { message?: string } | null)?.message || error || "");
  return text.includes("does not exist") || text.includes("Could not find the table") || text.includes("relation");
}

async function readMaybeHistoryTable<T>(promise: PromiseLike<{ data: T[] | null; error: unknown }>) {
  const result = await promise;
  if (result.error) {
    if (historyTableMissing(result.error)) return [] as T[];
    throw result.error;
  }
  return result.data || [];
}

function pickLatestAtDay<T extends { effective_from: string }>(rows: T[], day: string) {
  let match: T | null = null;
  for (const row of rows) {
    if (row.effective_from <= day) match = row;
    else break;
  }
  return match;
}

export async function loadEffectiveRateEngine(
  db: any,
  options?: {
    userIds?: string[];
  }
) {
  const userIds = (options?.userIds || []).filter(Boolean);

  let usersQuery = db
    .from("users")
    .select("id,name,role,is_programmer,hourly_rate,km_rate,programming_rate")
    .order("name", { ascending: true });
  if (userIds.length) usersQuery = usersQuery.in("id", userIds);

  let currentSiteQuery = db
    .from("user_site_rates")
    .select("user_id,site_id,hourly_rate,km_rate,programming_rate")
    .order("site_id", { ascending: true });
  if (userIds.length) currentSiteQuery = currentSiteQuery.in("user_id", userIds);

  let defaultHistoryQuery = db
    .from("user_rate_history")
    .select("user_id,effective_from,hourly_rate,km_rate,programming_rate")
    .order("effective_from", { ascending: true });
  if (userIds.length) defaultHistoryQuery = defaultHistoryQuery.in("user_id", userIds);

  let siteHistoryQuery = db
    .from("user_site_rate_history")
    .select("user_id,site_id,effective_from,hourly_rate,km_rate,programming_rate")
    .order("effective_from", { ascending: true });
  if (userIds.length) siteHistoryQuery = siteHistoryQuery.in("user_id", userIds);

  const [usersRes, currentSiteRes, defaultHistory, siteHistory] = await Promise.all([
    usersQuery,
    currentSiteQuery,
    readMaybeHistoryTable<UserRateHistoryRow>(defaultHistoryQuery),
    readMaybeHistoryTable<UserSiteRateHistoryRow>(siteHistoryQuery),
  ]);

  if (usersRes.error) throw usersRes.error;
  if (currentSiteRes.error) throw currentSiteRes.error;

  const users = (usersRes.data || []) as UserRow[];
  const currentSiteRates = (currentSiteRes.data || []) as UserSiteRateRow[];

  const userById = new Map<string, UserRow>();
  for (const user of users) userById.set(String(user.id), user);

  const defaultHistoryByUser = new Map<string, UserRateHistoryRow[]>();
  for (const user of users) {
    defaultHistoryByUser.set(String(user.id), [
      {
        user_id: String(user.id),
        effective_from: BASE_EFFECTIVE_DAY,
        hourly_rate: user.hourly_rate ?? null,
        km_rate: user.km_rate ?? null,
        programming_rate: user.programming_rate ?? null,
      },
    ]);
  }
  for (const row of defaultHistory) {
    const key = String(row.user_id);
    const list = defaultHistoryByUser.get(key) || [];
    list.push({
      user_id: key,
      effective_from: asDay(row.effective_from),
      hourly_rate: row.hourly_rate ?? null,
      km_rate: row.km_rate ?? null,
      programming_rate: row.programming_rate ?? null,
    });
    defaultHistoryByUser.set(key, list);
  }
  for (const list of defaultHistoryByUser.values()) {
    list.sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  }

  const siteRateKeys = new Set<string>();
  const siteHistoryByKey = new Map<string, UserSiteRateHistoryRow[]>();
  for (const row of currentSiteRates) {
    const key = `${row.user_id}__${row.site_id}`;
    siteRateKeys.add(key);
    siteHistoryByKey.set(key, [
      {
        user_id: String(row.user_id),
        site_id: String(row.site_id),
        effective_from: BASE_EFFECTIVE_DAY,
        hourly_rate: row.hourly_rate ?? null,
        km_rate: row.km_rate ?? null,
        programming_rate: row.programming_rate ?? null,
      },
    ]);
  }
  for (const row of siteHistory) {
    const key = `${row.user_id}__${row.site_id}`;
    siteRateKeys.add(key);
    const list = siteHistoryByKey.get(key) || [];
    list.push({
      user_id: String(row.user_id),
      site_id: String(row.site_id),
      effective_from: asDay(row.effective_from),
      hourly_rate: row.hourly_rate ?? null,
      km_rate: row.km_rate ?? null,
      programming_rate: row.programming_rate ?? null,
    });
    siteHistoryByKey.set(key, list);
  }
  for (const list of siteHistoryByKey.values()) {
    list.sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  }

  function getDefaultSnapshot(userId: string, dayInput?: string | null): DefaultSnapshot {
    const day = asDay(dayInput);
    const user = userById.get(userId);
    const rows = defaultHistoryByUser.get(userId) || [];
    const match = pickLatestAtDay(rows, day);
    const hourly = match?.hourly_rate ?? user?.hourly_rate ?? null;
    const km = match?.km_rate ?? user?.km_rate ?? null;
    const prog = match?.programming_rate ?? (hourly ?? user?.programming_rate ?? null);
    return {
      hourly_rate: hourly,
      km_rate: km,
      programming_rate: prog,
      effective_from: match?.effective_from || null,
    };
  }

  function getSiteOverrideSnapshot(userId: string, siteId: string, dayInput?: string | null): SiteOverrideSnapshot {
    const day = asDay(dayInput);
    const rows = siteHistoryByKey.get(`${userId}__${siteId}`) || [];
    const match = pickLatestAtDay(rows, day);
    if (!match) return null;
    const allNull = match.hourly_rate == null && match.km_rate == null && match.programming_rate == null;
    if (allNull && match.effective_from !== BASE_EFFECTIVE_DAY) return null;
    if (allNull && match.effective_from === BASE_EFFECTIVE_DAY) return null;
    return {
      hourly_rate: match.hourly_rate ?? null,
      km_rate: match.km_rate ?? null,
      programming_rate: match.programming_rate ?? null,
      effective_from: match.effective_from,
    };
  }

  function getRate(userId: string, siteId: string | null, dayInput?: string | null): EffectiveRate {
    const day = asDay(dayInput);
    const defaults = getDefaultSnapshot(userId, day);
    const defaultHourly = toNum(defaults.hourly_rate, 0);
    const defaultKm = toNum(defaults.km_rate, 0);
    const defaultProg = defaults.programming_rate == null ? defaultHourly : toNum(defaults.programming_rate, defaultHourly);

    if (siteId) {
      const override = getSiteOverrideSnapshot(userId, siteId, day);
      if (override) {
        const hourly = override.hourly_rate == null ? defaultHourly : toNum(override.hourly_rate, defaultHourly);
        const km = override.km_rate == null ? defaultKm : toNum(override.km_rate, defaultKm);
        const prog =
          override.programming_rate == null
            ? override.hourly_rate == null
              ? defaultProg
              : hourly
            : toNum(override.programming_rate, hourly);
        return {
          hourly,
          km,
          prog,
          source: "site",
          effective_from: override.effective_from,
        };
      }
    }

    return {
      hourly: defaultHourly,
      km: defaultKm,
      prog: defaultProg,
      source: "default",
      effective_from: defaults.effective_from,
    };
  }

  function listSiteIds(userId: string) {
    const result = new Set<string>();
    for (const key of siteRateKeys) {
      if (key.startsWith(`${userId}__`)) {
        const [, siteId] = key.split("__");
        if (siteId) result.add(siteId);
      }
    }
    return [...result].sort((a, b) => a.localeCompare(b, "cs"));
  }

  return {
    userById,
    getDefaultSnapshot,
    getSiteOverrideSnapshot,
    getRate,
    listSiteIds,
  };
}

export async function syncCurrentRateTables(db: any, userId: string) {
  const engine = await loadEffectiveRateEngine(db, { userIds: [userId] });
  const today = asDay(null);
  const defaults = engine.getDefaultSnapshot(userId, today);

  const userUpdate = await db
    .from("users")
    .update({
      hourly_rate: defaults.hourly_rate,
      km_rate: defaults.km_rate,
      programming_rate: defaults.programming_rate,
    })
    .eq("id", userId);

  if (userUpdate.error) throw userUpdate.error;

  const siteIds = engine.listSiteIds(userId);
  const rowsToUpsert = siteIds
    .map((siteId) => {
      const snapshot = engine.getSiteOverrideSnapshot(userId, siteId, today);
      if (!snapshot) return null;
      return {
        user_id: userId,
        site_id: siteId,
        hourly_rate: snapshot.hourly_rate,
        km_rate: snapshot.km_rate,
        programming_rate: snapshot.programming_rate,
      };
    })
    .filter(Boolean);

  if (siteIds.length) {
    const del = await db.from("user_site_rates").delete().eq("user_id", userId);
    if (del.error) throw del.error;
  }

  if (rowsToUpsert.length) {
    const up = await db.from("user_site_rates").upsert(rowsToUpsert, { onConflict: "user_id,site_id" });
    if (up.error) throw up.error;
  }
}

export function normalizeEffectiveFrom(value: string | null | undefined) {
  return asDay(value);
}
