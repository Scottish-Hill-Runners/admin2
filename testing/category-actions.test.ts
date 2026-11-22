import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "csv-parse/sync";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  loadCategoryReport: vi.fn(),
  ensureStagingBranch: vi.fn(),
  getStagingHead: vi.fn(),
  getFile: vi.fn(),
  commitFilesAtomically: vi.fn(),
}));
vi.mock("@/lib/auth-session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/category-report", () => ({ loadCategoryReport: mocks.loadCategoryReport }));
vi.mock("@/lib/github", () => ({
  ensureStagingBranch: mocks.ensureStagingBranch,
  getStagingHead: mocks.getStagingHead,
  getFile: mocks.getFile,
  commitFilesAtomically: mocks.commitFilesAtomically,
}));

import { saveCategoryCorrections } from "@/app/category-check/actions";

const fingerprint = "a".repeat(64);
function form() {
  const data = new FormData();
  data.set("year", "2025");
  data.set("fingerprint", fingerprint);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ githubAccessToken: "token" });
  mocks.getStagingHead.mockResolvedValue("base");
  mocks.getFile.mockResolvedValue({ content: "Position,Name,Category\n1,Alex Runner,M40\n" });
  mocks.loadCategoryReport.mockResolvedValue({
    fingerprint,
    runners: [{
      rows: ["A", "B"].map((raceId, index) => ({
        index,
        result: { raceId, year: "2025", position: 1, name: "Alex Runner", category: "M40" },
        raceName: `Race ${raceId}`,
        alternatives: ["M40", "M50"],
        raceCategories: ["M40", "M50"],
        suggestion: "M50",
      })),
    }],
  });
});

describe("saving category corrections", () => {
  it("writes multiple approved files as a single commit against a pinned head", async () => {
    const data = form();
    data.set("change-0", "suggestion");
    data.set("change-1", "suggestion");
    const response = await saveCategoryCorrections({ status: "idle" }, data);
    expect(response.status).toBe("success");
    expect(mocks.getFile).toHaveBeenCalledWith("token", "races/A/2025.csv", "base");
    expect(mocks.commitFilesAtomically).toHaveBeenCalledOnce();
    expect(mocks.commitFilesAtomically.mock.calls[0][2]).toHaveLength(2);
    expect(mocks.commitFilesAtomically.mock.calls[0][2][0].content).toContain("Alex Runner,M50");
  });

  it("accepts an explicitly entered category, even if it is new to the race", async () => {
    const data = form();
    data.set("change-0", "other");
    data.set("other-0", " f55 ");
    const response = await saveCategoryCorrections({ status: "idle" }, data);
    expect(response.status).toBe("success");
    expect(mocks.commitFilesAtomically.mock.calls[0][2][0].content).toContain("Alex Runner,F55");
  });

  it.each(["F 55+", "NB/40", "F_40", "M-40", "=legacy", "F".repeat(41)])(
    "allows the explicitly approved non-standard category %s",
    async (category) => {
      const data = form();
      data.set("change-0", "other");
      data.set("other-0", category);
      expect((await saveCategoryCorrections({ status: "idle" }, data)).status).toBe("success");
      expect(mocks.commitFilesAtomically.mock.calls[0][2][0].content).toContain(`Alex Runner,${category.toUpperCase()}`);
    },
  );

  it("preserves CSV structure when a non-standard category contains a comma", async () => {
    const data = form();
    data.set("change-0", "other");
    data.set("other-0", "F,40");
    expect((await saveCategoryCorrections({ status: "idle" }, data)).status).toBe("success");
    const csv = mocks.commitFilesAtomically.mock.calls[0][2][0].content;
    expect(parse(csv)[1]).toEqual(["1", "Alex Runner", "F,40"]);
  });

  it("does not save a suggestion that is no longer available or an unchanged category", async () => {
    const report = await mocks.loadCategoryReport();
    delete report.runners[0].rows[0].suggestion;
    mocks.loadCategoryReport.mockResolvedValue(report);
    const data = form();
    data.set("change-0", "suggestion");
    expect((await saveCategoryCorrections({ status: "idle" }, data)).status).toBe("error");
    data.set("change-0", "other");
    data.set("other-0", "m40");
    expect((await saveCategoryCorrections({ status: "idle" }, data)).status).toBe("error");
    expect(mocks.commitFilesAtomically).not.toHaveBeenCalled();
  });

  it("refuses stale reports, invalid choices and ambiguous source without committing", async () => {
    const data = form();
    data.set("change-0", "suggestion");
    mocks.loadCategoryReport.mockResolvedValueOnce({ fingerprint: "b".repeat(64), runners: [] });
    expect((await saveCategoryCorrections({ status: "idle" }, data)).status).toBe("error");
    data.set("change-0", "other");
    data.set("other-0", "  ");
    expect((await saveCategoryCorrections({ status: "idle" }, data)).status).toBe("error");
    data.set("change-0", "M50");
    expect((await saveCategoryCorrections({ status: "idle" }, data)).status).toBe("error");
    data.set("change-0", "suggestion");
    mocks.getFile.mockResolvedValueOnce({ content: "Position,Name,Category\n1,Alex Runner,M40\n1,Alex Runner,M40\n" });
    expect((await saveCategoryCorrections({ status: "idle" }, data)).status).toBe("error");
    expect(mocks.commitFilesAtomically).not.toHaveBeenCalled();
  });
});
