import * as XLSX from "xlsx";
import type { ReceivedEmail } from "@/lib/resend";
import { downloadAttachment } from "@/lib/resend";
import { extractSections, parseKeyValues } from "@/lib/email-parse";

const maxAttachmentBytes = 15 * 1024 * 1024;
const csvExtensions = new Set([".csv"]);
const spreadsheetExtensions = new Set([".xlsx", ".ods"]);

export async function attachmentBytes(
  emailId: string,
  attachment: NonNullable<ReceivedEmail["attachments"]>[number],
) {
  const bytes = await downloadAttachment(emailId, attachment);
  if (bytes.byteLength > maxAttachmentBytes)
    throw new Error("The email attachment is larger than 15 MB");
  return bytes;
}

export async function csvFromAttachment(
  emailId: string,
  attachment: NonNullable<ReceivedEmail["attachments"]>[number],
) {
  const filename = attachment.filename.toLowerCase();
  const extension = filename.slice(filename.lastIndexOf("."));
  const bytes = await attachmentBytes(emailId, attachment);
  if (csvExtensions.has(extension))
    return bytes.toString("utf8").replace(/^\uFEFF/, "");
  if (spreadsheetExtensions.has(extension)) {
    const workbook = XLSX.read(bytes, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error("The spreadsheet has no worksheets");
    return XLSX.utils.sheet_to_csv(firstSheet);
  }
  throw new Error("The attachment is not a CSV, XLSX, or ODS file");
}

export async function csvFromEmail(email: ReceivedEmail, path: string) {
  const section = extractSections(email.text ?? "")
    .map(parseKeyValues)
    .find((values) => values.file === path);
  if (section?.googlesheet) {
    const url = `${section.googlesheet.replace(/\/$/, "")}/gviz/tq?tqx=out:csv`;
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("The spreadsheet could not be fetched");
    return (await response.text()).replace(/^\uFEFF/, "");
  }
  const attachment = email.attachments?.find((item) => {
    const filename = item.filename.toLowerCase();
    return [...csvExtensions, ...spreadsheetExtensions].some((extension) =>
      filename.endsWith(extension),
    );
  });
  if (!attachment)
    throw new Error("No CSV or spreadsheet attachment was found");
  return csvFromAttachment(email.id, attachment);
}
