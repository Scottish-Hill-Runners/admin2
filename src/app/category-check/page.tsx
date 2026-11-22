import Link from "next/link";
import { requireAdmin } from "@/lib/auth-session";
import { loadCategoryReport } from "@/lib/category-report";
import { CategoryReportForm } from "@/components/category-report-form";

export default async function CategoryCheckPage({ searchParams }: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const year = typeof params.year === "string" ? params.year : "";
  const currentYear = new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "Europe/London" }).format(new Date());
  let report: Awaited<ReturnType<typeof loadCategoryReport>> | undefined;
  let error: string | undefined;
  if (year) {
    try {
      report = await loadCategoryReport(year);
    } catch (caught) {
      console.error("Unable to load category report", caught);
      error = caught instanceof Error ? caught.message : "The report could not be loaded.";
    }
  }
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 md:px-12">
      <Link href="/" className="underline">Review desk</Link>
      <p className="mt-8 text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Results review</p>
      <h1 className="mt-2 text-4xl font-bold md:text-5xl">Runner categories</h1>
      <p className="mt-4 max-w-3xl leading-relaxed">
        Find possible category inconsistencies in published results, then choose any corrections to save.
        Names with different or missing clubs may belong to different people.
      </p>
      <form className="mt-6 flex flex-wrap items-end gap-3">
        <label className="font-bold">Results year
          <input name="year" type="number" min="1000" max="9999" required defaultValue={year || currentYear}
            className="mt-2 block w-36 border border-[var(--ink)] bg-white px-3 py-2" />
        </label>
        <button type="submit" className="border-2 border-[var(--ink)] px-5 py-2 font-bold">Check results</button>
      </form>
      <p className="mt-5 max-w-3xl text-sm leading-relaxed">
        Age bands are approximated from categories recorded at each race; an absent category does not prove it was unavailable.
        Open categories and unfamiliar labels do not establish an age. Dates are used only when a race has one unambiguous date and result file.
        Suggestions require at least two matching same-club results and a category already used in that race.
        Review every suggestion before saving; no changes are selected automatically.
      </p>
      {error && <p role="alert" className="mt-6 border border-red-800 bg-red-50 p-4 text-red-900">{error}</p>}
      {report?.calendarWarning && <p role="alert" className="mt-6 border border-amber-700 bg-amber-50 p-4">{report.calendarWarning}</p>}
      {report?.raceNamesWarning && <p role="alert" className="mt-6 border border-amber-700 bg-amber-50 p-4">{report.raceNamesWarning}</p>}
      {report && (
        <div className="mt-6 text-sm">
          <p>Unambiguous dates available for {report.datedResults} of {report.results.length} results.</p>
          {report.unrecognised.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer font-bold">{report.unrecognised.length} unrecognised category labels were not checked</summary>
              <p className="mt-2 break-words">{report.unrecognised.map((label) => label || "(blank)").join(", ")}</p>
            </details>
          )}
        </div>
      )}
      {report && <CategoryReportForm key={`${year}-${report.fingerprint}`} year={year} fingerprint={report.fingerprint} runners={report.runners} />}
    </main>
  );
}
