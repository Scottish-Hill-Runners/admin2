import Link from "next/link";
import { Fragment } from "react";
import { requireAdmin } from "@/lib/auth-session";
import { loadMissingResultsReport, londonDate } from "@/lib/missing-results-report";

function organiserWithEmailLinks(race: Awaited<ReturnType<typeof loadMissingResultsReport>>["missing"][number], year: string) {
  const organiser = race.contact.organiser;
  if (!organiser) return null;
  const raceName = race.raceName?.trim() || race.raceId;
  const raceId = race.raceId;
  const raceDate = new Date(`${race.Date}T00:00:00Z`).toLocaleDateString("en-GB", {
                    day: "numeric", month: "long", timeZone: "UTC",
                  });
  const subject = `Results needed for ${raceName.replace(/[\r\n]+/g, " ")} (${year})`;
  const body = `Hi,\n\nWe don't yet have the ${year} results for ${raceName}, held on ${raceDate}.` +
  `\nCould you upload the results using the link at https://www.scottishhillrunners.uk/races/${raceId}?year=${year} so we can include them in the Scottish Hill Runners archive?` +
  `\nIf there are any issues with uploading the results, please let us know.` +
  `\n\nKind regards.`;
  const matches = [...organiser.matchAll(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi)];
  let position = 0;
  const parts = matches.map((match) => {
    const text = organiser.slice(position, match.index);
    position = match.index + match[0].length;
    const address = encodeURIComponent(match[0]).replace("%40", "@");
    const href = `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return <Fragment key={match.index}>{text}<a href={href} className="underline">{match[0]}</a></Fragment>;
  });
  return <>{parts}{organiser.slice(position)}</>;
}

function websiteUrl(web: string) {
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(web) ? web : `https://${web}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export default async function MissingResultsPage({ searchParams }: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const year = params.year === undefined ? londonDate(new Date()).slice(0, 4)
    : typeof params.year === "string" ? params.year : "";
  let report: Awaited<ReturnType<typeof loadMissingResultsReport>> | undefined;
  let error: string | undefined;
  try {
    report = await loadMissingResultsReport(year);
  } catch (caught) {
    console.error("Unable to load missing results report", caught);
    error = caught instanceof Error && caught.message === "Enter a four-digit year."
      ? caught.message : "The report could not be loaded. Please try again.";
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 md:px-12">
      <Link href="/" className="underline">Review desk</Link>
      <p className="mt-8 text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Results review</p>
      <h1 className="mt-2 text-4xl font-bold md:text-5xl">Missing results</h1>
      <p className="mt-4 max-w-3xl leading-relaxed">
        Find past calendar races with no published results for the selected year.
        Today&apos;s races are not included.
      </p>
      <form className="mt-6 flex flex-wrap items-end gap-3">
        <label className="font-bold">Results year
          <input name="year" type="number" min="1000" max="9999" required defaultValue={year}
            className="mt-2 block w-36 border border-[var(--ink)] bg-white px-3 py-2" />
        </label>
        <button type="submit" className="border-2 border-[var(--ink)] px-5 py-2 font-bold">Check results</button>
      </form>
      {error && <p role="alert" className="mt-6 border border-red-800 bg-red-50 p-4 text-red-900">{error}</p>}
      {report && (
        <section className="mt-8" aria-labelledby="missing-heading">
          <h2 id="missing-heading" className="border-y-2 border-[var(--ink)] py-4 text-xl font-bold">
            {report.missing.length} {report.missing.length === 1 ? "race" : "races"} without results
          </h2>
          {report.missing.length === 0 && <p className="py-5">No missing results found for races with an ID.</p>}
          <ul className="divide-y divide-[var(--line)]">
            {report.missing.map((race, index) => (
              <li key={`${race.raceId}-${race.Date}-${index}`} className="grid gap-3 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <time dateTime={race.Date} className="font-bold">
                  {new Date(`${race.Date}T00:00:00Z`).toLocaleDateString("en-GB", {
                    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
                  })}
                </time>
                <div className="min-w-0">
                  <a className="text-lg font-bold underline" href={`https://www.scottishhillrunners.uk/races/${encodeURIComponent(race.raceId)}?year=${year}`}>
                    {race.raceName?.trim() || race.raceId}
                  </a>
                  {race.contact.error ? <p className="mt-2 text-red-800">Contact details could not be loaded.</p> : (
                    <div className="mt-2 space-y-1 break-words text-sm">
                      {race.contact.organiser && <p><strong>Organiser:</strong>{" "}
                        {organiserWithEmailLinks(race, year)}
                      </p>}
                      {race.contact.web && <p><strong>Website:</strong>{" "}
                        {websiteUrl(race.contact.web) ? <a href={websiteUrl(race.contact.web)} className="underline">{race.contact.web}</a> : race.contact.web}
                      </p>}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {report.unchecked.length > 0 && (
            <section className="mt-6 border border-amber-700 bg-amber-50 p-4" aria-labelledby="unchecked-heading">
              <h2 id="unchecked-heading" className="font-bold">Calendar races without an ID could not be checked</h2>
              <ul className="mt-2 list-inside list-disc text-sm">
                {report.unchecked.map((race, index) => <li key={`${race.Date}-${index}`}>{race.Date}: {race.raceName || "Unnamed race"}</li>)}
              </ul>
            </section>
          )}
        </section>
      )}
    </main>
  );
}
