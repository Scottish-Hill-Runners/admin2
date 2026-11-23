import { z } from "zod";
import { fetchPublishedJson } from "@/lib/published-json";

const site = "https://www.scottishhillrunners.uk";
const calendarSchema = z.array(z.object({
  Date: z.iso.date(),
  raceName: z.string().nullish(),
  raceId: z.union([z.literal(""), z.string().regex(/^[A-Za-z0-9-]+$/)]).nullish(),
}));
const resultsSchema = z.array(z.object({ raceId: z.string() }));
const raceSchema = z.object({
  info: z.object({ organiser: z.string().nullish(), web: z.string().nullish() }),
});

export function londonDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function loadMissingResultsReport(year: string, now = new Date()) {
  if (!/^\d{4}$/.test(year) || Number(year) < 1000) throw new Error("Enter a four-digit year.");
  const [calendarData, resultsData] = await Promise.all([
    fetchPublishedJson(`${site}/calendar.json.gz`),
    fetchPublishedJson(`${site}/results/${year}.json.gz`),
  ]);
  const calendar = calendarSchema.parse(calendarData);
  const results = resultsSchema.parse(resultsData);
  const resultIds = new Set(results.map((result) => result.raceId));
  const today = londonDate(now);
  const past = calendar.filter((entry) => entry.Date.startsWith(`${year}-`) && entry.Date < today);
  const missing = past.filter((entry): entry is typeof entry & { raceId: string } =>
    typeof entry.raceId === "string" && entry.raceId.length > 0 && !resultIds.has(entry.raceId))
    .sort((a, b) => a.Date.localeCompare(b.Date) || (a.raceName ?? "").localeCompare(b.raceName ?? ""));
  const unchecked = past.filter((entry) => !entry.raceId)
    .sort((a, b) => a.Date.localeCompare(b.Date));

  const contacts = new Map<string, { organiser?: string; web?: string; error?: boolean }>();
  const ids = [...new Set(missing.map((entry) => entry.raceId))];
  for (let i = 0; i < ids.length; i += 8) {
    await Promise.all(ids.slice(i, i + 8).map(async (id) => {
      try {
        const { info } = raceSchema.parse(await fetchPublishedJson(`${site}/results/${encodeURIComponent(id)}.json.gz`));
        if (info.organiser && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(info.organiser)) {
          throw new Error("Invalid encoded organiser.");
        }
        contacts.set(id, {
          organiser: info.organiser ? Buffer.from(info.organiser, "base64").toString("utf8").trim() : undefined,
          web: info.web?.trim() || undefined,
        });
      } catch (error) {
        console.error(`Could not load contact details for ${id}`, error);
        contacts.set(id, { error: true });
      }
    }));
  }
  return {
    missing: missing.map((entry) => {
      const contact = contacts.get(entry.raceId);
      if (!contact) throw new Error(`Contact lookup missing for ${entry.raceId}.`);
      return { ...entry, contact };
    }),
    unchecked,
  };
}
