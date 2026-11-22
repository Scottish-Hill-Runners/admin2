"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth-session";
import { loadCategoryReport } from "@/lib/category-report";
import { applyCategoryCorrections, resultPath, type CategoryCorrection } from "@/lib/category-corrections";
import { commitFilesAtomically, ensureStagingBranch, getFile, getStagingHead } from "@/lib/github";

export type CategoryActionState = { status: "idle" | "success" | "error"; message?: string };

export async function saveCategoryCorrections(
  _previous: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const admin = await requireAdmin();
  const parsed = z.object({
    year: z.string().regex(/^\d{4}$/),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }).safeParse({ year: formData.get("year"), fingerprint: formData.get("fingerprint") });
  if (!parsed.success) return { status: "error", message: "Invalid report. Reload it and try again." };
  try {
    const report = await loadCategoryReport(parsed.data.year);
    if (report.fingerprint !== parsed.data.fingerprint)
      throw new Error("Published results have changed. Reload the report before saving.");
    const validRows = new Map(report.runners.flatMap((runner) => runner.rows.map((row) => [row.index, row] as const)));
    const changes = new Map<string, CategoryCorrection[]>();
    let count = 0;
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("change-")) continue;
      if (!/^change-\d+$/.test(key) || typeof value !== "string")
        throw new Error("Invalid correction.");
      const row = validRows.get(Number(key.slice(7)));
      if (!row) throw new Error("A result is no longer available. Reload the report.");
      if (value === "keep") continue;
      let category: string;
      if (value === "suggestion" && row.suggestion) {
        category = row.suggestion;
      } else if (value === "other") {
        const other = z.string().trim().min(1).safeParse(formData.get(`other-${row.index}`));
        if (!other.success)
          throw new Error(`Enter a category for ${row.result.name} in ${row.raceName}.`);
        category = other.data.toUpperCase();
      } else {
        throw new Error("A correction is no longer available. Reload the report.");
      }
      if (category === row.result.category.trim().toUpperCase())
        throw new Error(`The new category for ${row.result.name} in ${row.raceName} is unchanged.`);
      const path = resultPath(row.result, parsed.data.year);
      const group = changes.get(path) ?? [];
      group.push({ result: row.result, category });
      changes.set(path, group);
      count++;
    }
    if (!count) throw new Error("Choose at least one category change.");
    if (count > 500) throw new Error("Please save no more than 500 changes at once.");
    await ensureStagingBranch(admin.githubAccessToken);
    const head = await getStagingHead(admin.githubAccessToken);
    const files = await Promise.all([...changes].map(async ([path, corrections]) => {
      const current = await getFile(admin.githubAccessToken, path, head);
      if (!current) throw new Error(`Results file ${path} was not found in saved updates.`);
      return { path, content: applyCategoryCorrections(current.content, corrections) };
    }));
    await commitFilesAtomically(admin.githubAccessToken, head, files, `Correct ${parsed.data.year} runner categories`);
    return { status: "success", message: `Saved ${count} category ${count === 1 ? "change" : "changes"} in one commit. Publish saved updates when ready.` };
  } catch (error) {
    console.error("Unable to save category corrections", error);
    return { status: "error", message: error instanceof Error ? error.message : "The changes could not be saved." };
  }
}
