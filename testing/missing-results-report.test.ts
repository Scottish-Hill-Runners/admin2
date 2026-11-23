import { gzipSync } from "node:zlib";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMissingResultsReport, londonDate } from "@/lib/missing-results-report";
import MissingResultsPage from "@/app/missing-results/page";

vi.mock("@/lib/auth-session", () => ({ requireAdmin: vi.fn() }));

const calendar = [
  { Date: "2026-03-01", raceId: "Missing", raceName: "Missing Race" },
  { Date: "2026-03-02", raceId: "Done", raceName: "Done Race" },
  { Date: "2026-03-03", raceName: "No ID Race" },
  { Date: "2026-03-04", raceId: "Broken", raceName: "Broken Contact" },
  { Date: "2026-03-05", raceId: "Missing", raceName: "Missing Race again" },
  { Date: "2026-03-06", raceId: "Today", raceName: "Today Race" },
  { Date: "2026-03-07", raceId: "Future", raceName: "Future Race" },
  { Date: "2025-03-01", raceId: "Other", raceName: "Other Year" },
];

function respond(data: unknown, compressed = false) {
  const json = JSON.stringify(data);
  return new Response(compressed ? gzipSync(json) : json, { status: 200 });
}

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/calendar.json.gz")) return respond(calendar, true);
    if (url.endsWith("/results/2026.json.gz")) return respond([{ raceId: "Done", year: "2026-s" }]);
    if (url.endsWith("/results/Missing.json.gz")) return respond({
      info: { organiser: Buffer.from("Élodie <runner@example.org>").toString("base64"), web: "www.example.org" },
    }, true);
    if (url.endsWith("/results/Broken.json.gz")) return new Response(null, { status: 404 });
    throw new Error(`Unexpected request: ${url}`);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("missing results report", () => {
  it("checks past dates by race ID and loads contacts once per race", async () => {
    const fetch = mockFetch();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const report = await loadMissingResultsReport("2026", new Date("2026-03-06T12:00:00Z"));
    expect(report.missing.map((race) => race.raceId)).toEqual(["Missing", "Broken", "Missing"]);
    expect(report.missing[0].contact).toEqual({ organiser: "Élodie <runner@example.org>", web: "www.example.org" });
    expect(report.missing[1].contact.error).toBe(true);
    expect(report.unchecked.map((race) => race.raceName)).toEqual(["No ID Race"]);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/results/Missing.json.gz"))).toHaveLength(1);
    expect(log).toHaveBeenCalledOnce();
  });

  it("uses the UK calendar day and rejects invalid years before fetching", async () => {
    const fetch = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(londonDate(new Date("2026-06-05T23:30:00Z"))).toBe("2026-06-06");
    const report = await loadMissingResultsReport("2026", new Date("2026-03-05T23:30:00Z"));
    expect(report.missing.map((race) => race.raceId)).toEqual(["Missing", "Broken"]);
    await expect(loadMissingResultsReport("../2026")).rejects.toThrow("Enter a four-digit year.");
    expect(fetch.mock.calls.some(([url]) => String(url).includes("../"))).toBe(false);
  });

  it("fails rather than presenting an incomplete report when results cannot load", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/calendar.json.gz") ? respond(calendar) : new Response(null, { status: 500 }));
    await expect(loadMissingResultsReport("2026")).rejects.toThrow("HTTP 500");
  });

  it("renders the default year, links, decoded contact details and warnings", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T12:00:00Z"));
    mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(await MissingResultsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('value="2026"');
    expect(html).toContain("https://www.scottishhillrunners.uk/races/Missing?year=2026");
    expect(html).toContain("Élodie &lt;<a href=\"mailto:runner@example.org?");
    expect(html).toContain("subject=Results%20for%20Missing%20Race%20(2026)");
    expect(html).toContain("body=Hi%2C%0A%0AWe%20don&#x27;t%20yet%20have%20the%202026%20results%20for%20Missing%20Race.");
    expect(html).toContain("https%3A%2F%2Fwww.scottishhillrunners.uk%2Fraces%2FMissing%3Fyear%3D2026");
    expect(html).toContain(">runner@example.org</a>&gt;");
    expect(html).toContain('href="https://www.example.org/"');
    expect(html).toContain("Contact details could not be loaded.");
    expect(html).toContain("No ID Race");
    expect(html).not.toContain("Today Race");
  });

  it("links each organiser email and preserves the surrounding text", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T12:00:00Z"));
    mockFetch().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/calendar.json.gz")) return respond(calendar);
      if (url.endsWith("/results/2026.json.gz")) return respond([{ raceId: "Done" }]);
      if (url.endsWith("/results/Missing.json.gz")) return respond({
        info: { organiser: Buffer.from("First <first+race@example.org>, Second <second@example.org>.").toString("base64") },
      });
      if (url.endsWith("/results/Broken.json.gz")) return respond({ info: { organiser: Buffer.from("A local club").toString("base64") } });
      throw new Error(`Unexpected request: ${url}`);
    });
    const html = renderToStaticMarkup(await MissingResultsPage({ searchParams: Promise.resolve({ year: "2026" }) }));
    expect(html).toContain('mailto:first%2Brace@example.org?subject=');
    expect(html).toContain('mailto:second@example.org?subject=');
    expect(html).toContain("First &lt;<a ");
    expect(html).toContain(">first+race@example.org</a>&gt;, Second &lt;<a ");
    expect(html).toContain(">second@example.org</a>&gt;.");
    expect(html).toContain("<strong>Organiser:</strong> A local club");
  });
});
