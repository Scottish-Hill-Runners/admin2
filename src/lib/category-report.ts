import { z } from "zod";

const resultSchema = z.object({
  raceId: z.string(),
  year: z.string(),
  position: z.number().nullable(),
  name: z.string(),
  club: z.string().nullish(),
  category: z.string(),
  time: z.string().nullish(),
});

const calendarSchema = z.array(z.object({
  Date: z.string(),
  raceId: z.string().optional(),
  raceName: z.string().optional(),
}));
const raceMetadataSchema = z.record(z.string(), z.object({ title: z.string().nullish() }));

export type Result = z.infer<typeof resultSchema>;
type CalendarEntry = z.infer<typeof calendarSchema>[number];
type Band = { sex: string; min: number; max: number; age: number; junior: boolean };
export type ReportRow = {
  index: number;
  result: Result;
  raceName: string;
  date?: string;
  pwt?: number;
  reasons: string[];
  alternatives: string[];
  raceCategories: string[];
  suggestion?: string;
};
export type ReportRunner = { name: string; rows: ReportRow[] };

function categoryParts(value: string) {
  const match = value.trim().toUpperCase().match(/^(NB|M|F|N|W|L|A)\s*(SENIOR|SEN|S|JUNIOR|JNR|J|SV|VET|V|U)?\s*(\d+)?\+?$/);
  if (!match) return null;
  const sex = ["W", "L"].includes(match[1]) ? "F" : ["NB", "A"].includes(match[1]) ? "N" : match[1];
  const age = match[3] ? Number(match[3]) : undefined;
  return { sex, age, junior: age !== undefined && (["U", "J", "JNR", "JUNIOR"].includes(match[2] ?? "") || age < 30) };
}

function raceKey(row: Result) {
  return `${row.raceId}\0${row.year}`;
}

function timeInSeconds(time: string | null | undefined) {
  const match = time?.trim().match(/^(\d+):([0-5]\d):([0-5]\d)$/);
  if (!match) return undefined;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
}

function band(category: string, raceCategories: string[]): Band | null {
  const parsed = categoryParts(category);
  if (!parsed || parsed.age === undefined) return null;
  const age = parsed.age;
  const thresholds = raceCategories.flatMap((item) => {
    const other = categoryParts(item);
    return other && other.sex === parsed.sex && other.age !== undefined &&
      other.junior === parsed.junior ? [other.age] : [];
  });
  if (parsed.junior) {
    const previous = thresholds.filter((value) => value < age);
    return { ...parsed, age, min: previous.length ? Math.max(...previous) : 0, max: age - 1 };
  }
  const next = thresholds.filter((value) => value > age);
  return { ...parsed, age, min: age, max: next.length ? Math.min(...next) - 1 : Infinity };
}

function dateMap(results: Result[], calendar: CalendarEntry[], year: string) {
  const dates = new Map<string, Set<string>>();
  for (const entry of calendar) {
    if (entry.raceId && new RegExp(`^${year}-\\d{2}-\\d{2}$`).test(entry.Date)) {
      const set = dates.get(entry.raceId) ?? new Set<string>();
      set.add(entry.Date);
      dates.set(entry.raceId, set);
    }
  }
  const instances = new Map<string, Set<string>>();
  for (const result of results) {
    const set = instances.get(result.raceId) ?? new Set<string>();
    set.add(result.year);
    instances.set(result.raceId, set);
  }
  return (row: Result) => {
    const set = dates.get(row.raceId);
    return set?.size === 1 && instances.get(row.raceId)?.size === 1
      ? [...set][0] : undefined;
  };
}

export function makeCategoryReport(
  results: Result[],
  calendar: CalendarEntry[],
  year: string,
  raceNames: ReadonlyMap<string, string> = new Map(),
): ReportRunner[] {
  const categories = new Map<string, Set<string>>();
  const names = new Map<string, Array<{ result: Result; index: number }>>();
  const winnerTimes = new Map<string, number | null>();
  results.forEach((result, index) => {
    const key = raceKey(result);
    const race = categories.get(key) ?? new Set<string>();
    race.add(result.category);
    categories.set(key, race);
    if (result.position === 1) {
      const time = timeInSeconds(result.time);
      const previous = winnerTimes.get(key);
      winnerTimes.set(key, time !== undefined && (previous === undefined || previous === time) ? time : null);
    }
    const nameKey = result.name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
    if (!nameKey) return;
    const rows = names.get(nameKey) ?? [];
    rows.push({ result, index });
    names.set(nameKey, rows);
  });
  const getDate = dateMap(results, calendar, year);
  const calendarNames = new Map<string, Set<string>>();
  for (const entry of calendar) {
    const name = entry.raceName?.trim();
    if (!entry.raceId || !name || !entry.Date.startsWith(`${year}-`)) continue;
    const names = calendarNames.get(entry.raceId) ?? new Set<string>();
    names.add(name);
    calendarNames.set(entry.raceId, names);
  }
  const report: ReportRunner[] = [];
  for (const rows of names.values()) {
    if (rows.length < 2) continue;
    const reasons = new Map<number, Set<string>>();
    for (let i = 0; i < rows.length; i++) {
      const a = rows[i];
      const aParts = categoryParts(a.result.category);
      if (!aParts) continue;
      for (let j = i + 1; j < rows.length; j++) {
        const b = rows[j];
        if (raceKey(a.result) === raceKey(b.result)) continue;
        const bParts = categoryParts(b.result.category);
        if (!bParts) continue;
        const sameClub = Boolean(a.result.club?.trim()) &&
          a.result.club?.trim().toLowerCase() === b.result.club?.trim().toLowerCase();
        const confidence = sameClub ? "same club" : "different or missing clubs: possible name clash";
        const aBand = band(a.result.category, [...(categories.get(raceKey(a.result)) ?? [])]);
        const bBand = band(b.result.category, [...(categories.get(raceKey(b.result)) ?? [])]);
        let reason: string | undefined;
        if (aParts.sex !== bParts.sex) {
          reason = `Different sex categories (${confidence})`;
        } else if (aBand && bBand) {
          const aDate = getDate(a.result);
          const bDate = getDate(b.result);
          if (aDate && bDate && aDate === bDate &&
              (aBand.min > bBand.max || bBand.min > aBand.max)) {
            reason = `Incompatible age bands on the same day (${confidence})`;
          } else if (aDate && bDate && aDate !== bDate) {
            const earlier = aDate < bDate ? aBand : bBand;
            const later = aDate < bDate ? bBand : aBand;
            if (earlier.min > later.max)
              reason = `Age band goes backwards by race date (${confidence})`;
          }
          if (!reason && (aBand.min > bBand.max + 1 || bBand.min > aBand.max + 1))
            reason = `Age bands are more than one year apart (${confidence})`;
        }
        if (reason) {
          for (const row of [a, b]) {
            const set = reasons.get(row.index) ?? new Set<string>();
            set.add(reason);
            reasons.set(row.index, set);
          }
        }
      }
    }
    if (!reasons.size) continue;
    report.push({
      name: rows[0].result.name,
      rows: rows.map(({ result, index }) => {
        const raceCategories = [...(categories.get(raceKey(result)) ?? [])].sort();
        const comparableRows = rows.filter((other) =>
          other.index === index || raceKey(other.result) !== raceKey(result));
        const alternatives = [...new Set(comparableRows.map(({ result }) => result.category))].sort();
        const club = result.club?.trim().toLowerCase();
        const sameClubRows = club
          ? comparableRows.filter((other) => other.result.club?.trim().toLowerCase() === club)
          : [];
        const currentParts = categoryParts(result.category);
        const candidates = [...new Set(sameClubRows.map((other) => other.result.category))]
          .filter((category) => category !== result.category && raceCategories.includes(category))
          .flatMap((category) => {
            const candidateParts = categoryParts(category);
            const comparable = sameClubRows.filter(({ result: other }) => {
              const parts = categoryParts(other.category);
              if (!currentParts || !candidateParts || !parts ||
                  currentParts.sex !== candidateParts.sex || currentParts.junior ||
                  candidateParts.junior || currentParts.age === undefined || candidateParts.age === undefined ||
                  currentParts.age === candidateParts.age)
                return true;
              const lowerAge = Math.min(currentParts.age, candidateParts.age);
              const higherAge = Math.max(currentParts.age, candidateParts.age);
              if (parts.sex !== currentParts.sex || parts.age !== lowerAge) return true;
              return [...(categories.get(raceKey(other)) ?? [])].some((raceCategory) => {
                const raceParts = categoryParts(raceCategory);
                return raceParts?.sex === currentParts.sex && raceParts.age === higherAge && !raceParts.junior;
              });
            });
            const candidateCount = new Set(comparable
              .filter(({ result: other }) => other.category === category)
              .map(({ result: other }) => raceKey(other))).size;
            const currentCount = new Set(comparable
              .filter(({ result: other }) => other.category === result.category)
              .map(({ result: other }) => raceKey(other))).size;
            return candidateCount >= 2 && candidateCount > currentCount
              ? [{ category, count: candidateCount }] : [];
          }).sort((a, b) => b.count - a.count);
        const suggestion = reasons.has(index) && candidates[0] && candidates[0].count > (candidates[1]?.count ?? 0)
          ? candidates[0].category : undefined;
        const winnerTime = winnerTimes.get(raceKey(result));
        const runnerTime = timeInSeconds(result.time);
        const calendarName = calendarNames.get(result.raceId);
        const raceName = calendarName?.size === 1
          ? [...calendarName][0] : raceNames.get(result.raceId) || result.raceId;
        return {
          result, index, raceName, date: getDate(result), reasons: [...(reasons.get(index) ?? [])],
          alternatives, raceCategories, suggestion,
          pwt: winnerTime && runnerTime ? runnerTime / winnerTime * 100 : undefined,
        };
      }).sort((a, b) => {
        if (!a.date) return b.date ? 1 : a.index - b.index;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date) || a.index - b.index;
      }),
    });
  }
  return report.sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const data = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? (await import("node:zlib")).gunzipSync(bytes) : bytes;
  return JSON.parse(data.toString("utf8"));
}

export async function loadCategoryReport(year: string) {
  if (!/^\d{4}$/.test(year)) throw new Error("Enter a four-digit year.");
  const data = await fetchJson(`https://www.scottishhillrunners.uk/results/${year}.json.gz`);
  const results = z.array(resultSchema).parse(data);
  let calendar: CalendarEntry[] = [];
  let calendarWarning: string | undefined;
  try {
    calendar = calendarSchema.parse(await fetchJson("https://www.scottishhillrunners.uk/calendar.json.gz"));
  } catch (error) {
    console.error("Could not load race calendar", error);
    calendarWarning = "Race dates could not be loaded; date-order checks were skipped.";
  }
  let raceNames = new Map<string, string>();
  let raceNamesWarning: string | undefined;
  try {
    const metadata = raceMetadataSchema.parse(await fetchJson("https://www.scottishhillrunners.uk/results/races.json.gz"));
    raceNames = new Map(Object.entries(metadata).flatMap(([id, info]) =>
      info.title?.trim() ? [[id, info.title.trim()]] : [],
    ));
  } catch (error) {
    console.error("Could not load race names", error);
    raceNamesWarning = "Race names could not be loaded; races not in the calendar are shown by ID.";
  }
  const { createHash } = await import("node:crypto");
  const fingerprint = createHash("sha256").update(JSON.stringify(results)).digest("hex");
  const getDate = dateMap(results, calendar, year);
  const datedResults = results.filter((result) => getDate(result)).length;
  const unrecognised = [...new Set(results.map((result) => result.category)
    .filter((category) => !categoryParts(category)))].sort();
  return {
    runners: makeCategoryReport(results, calendar, year, raceNames), results, fingerprint,
    calendarWarning, raceNamesWarning, datedResults, unrecognised,
  };
}
