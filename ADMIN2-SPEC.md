# Admin 2 — Implementation Specification

**Status:** Ready for implementation. Hand this document to the implementing agent together with `ADMIN2.md` (the source plan). Where this spec and `ADMIN2.md` disagree, this spec wins — it incorporates decisions made after the plan was written.

**Date:** 2026-08-22

---

## 1. Purpose & scope

Build **Admin-2**, a fresh Next.js web app (new repo, new codebase) that lets authenticated, non-technical Scottish Hill Runners admins:

1. Review content-update requests received by email (via Resend).
2. See a merged diff of each proposed update against the current content.
3. Optionally make small corrections, then approve — which pushes a commit to the `staging` branch of the contents repo, recorded against the admin's own GitHub account.
4. Decline / dismiss / junk emails, with status tracked in a Vercel Global Config store.
5. Publish accumulated changes by merging `staging` → `main` (one click).
6. Receive Cloudinary asset uploads via email attachment, and serve two public, unauthenticated asset-discovery webhooks backed by a Vercel Blob cache.

**Out of scope (do not build):**

- Any changes to `shr-web` (the static site). The email-template helper for `shr-web` is a separate, later piece of work.
- Frontmatter field validation (fields are merged verbatim).
- A general-purpose editor. The only editing surface is the pre-approval tweak box on the review screen.
- Real-time email ingestion. The app polls the Resend "received emails" API; no inbound webhook endpoint is needed.

---

## 2. Repo, stack, deployment

- **Repo:** new GitHub repo `Scottish-Hill-Runners/admin2`, scaffolded locally at `/Users/johnhamer/shr-admin2`. Do **not** fork or copy `shr-admin`; start clean and lift only the patterns noted below.
- **Framework:** Next.js 16.2.x (App Router), React 19, TypeScript 5, Tailwind CSS 4 (via `@tailwindcss/postcss`).
- **Node:** `>=22 <25` (set `engines` in package.json). Next.js 16 OOMs on Node 25 — do not use it.
- **Hosting:** Vercel.
- **Lint/build commands:** `npm run dev`, `npm run build`, `npm run lint`, `npm test`.

> ⚠️ Next.js 16 differs from training-data Next.js. Before writing any Next.js code, read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation notices.

### Initial dependencies

| Package | Purpose |
|---|---|
| `next`, `react`, `react-dom` | framework |
| `next-auth@^5.0.0-beta` (Auth.js v5) | GitHub OAuth |
| `@octokit/rest` | GitHub API |
| `resend` (or plain `fetch`) | Resend API |
| `gray-matter` | markdown frontmatter parse/serialize |
| `csv-parse`, `csv-stringify` | CSV parsing/patching (sync APIs) |
| `xlsx` (SheetJS) | XLSX/ODS attachment → CSV conversion |
| `cloudinary` (v2 SDK) | Cloudinary upload + Admin API |
| `diff` (jsdiff) | line diffs for the review UI |
| `zod` (v4) | env + payload validation |
| `@vercel/blob` | asset cache store |
| dev: `vitest`, `@types/*`, `eslint`, `eslint-config-next`, `tailwindcss`, `@tailwindcss/postcss`, `typescript` | tooling |

Use `csv-parse`/`csv-stringify` (not `awk`-style splits) — CSV fields contain quoted commas.

---

## 3. Environment variables

Create `src/lib/env.ts` with a Zod-validated env object, following the same style as `shr-admin/src/lib/env.ts` (empty string → `undefined`, boolean coercion, sensible defaults, cross-field `superRefine` checks). Required variables:

```env
# Auth
AUTH_SECRET=                        # random secret
AUTH_URL=                           # app base URL (Auth.js v5 naming; also accept NEXTAUTH_URL)
AUTH_GITHUB_ID=                     # GitHub OAuth app client id
AUTH_GITHUB_SECRET=                 # GitHub OAuth app client secret
ADMIN_GITHUB_LOGINS=                # comma-separated, lowercase GitHub logins allowed in

# Contents repo
CONTENT_REPO=Scottish-Hill-Runners/contents
CONTENT_BRANCH=main
CONTENT_STAGING_BRANCH=staging

# Resend
RESEND_API_KEY=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_WEBHOOK_SECRET=          # shared secret on the cache-refresh webhook

# Vercel
GLOBAL_CONFIG_API_TOKEN=            # token for the Vercel Global Config REST API
GLOBAL_CONFIG_ID=                   # config instance id
BLOB_READ_WRITE_TOKEN=              # Vercel Blob (asset cache)
```

Validation rules: `CONTENT_BRANCH` must differ from `CONTENT_STAGING_BRANCH`; Cloudinary vars all-or-nothing; fail fast at boot on missing required vars in production.

---

## 4. Authentication & authorisation

Use **Auth.js v5** (`next-auth@beta`) with a single **GitHub OAuth** provider.

- OAuth scope: `repo` (needed to commit to the private/organisation contents repo).
- Store the GitHub `accessToken`, the user's `login`, `name`, and `email` in the JWT (JWT sessions, no database).
- **Allowlist:** in the `signIn` callback, reject anyone whose GitHub `login` (lowercased) is not in `ADMIN_GITHUB_LOGINS`. Show a plain-language "not authorised" page on rejection.
- **Commits are recorded against the admin's account** because all GitHub writes use *their* OAuth token. Never use a shared PAT or App token for writes.
- Route guards: a `requireAdmin()` helper (in `src/lib/auth-session.ts`) that returns the session (login, name, email, GitHub token) or redirects to `/sign-in`. Call it at the top of every page and server action except `/sign-in` and the public asset webhooks.

Files: `src/auth.ts` (Auth.js config), `src/app/api/auth/[...nextauth]/route.ts` (handler), `src/lib/auth-session.ts` (guards).

---

## 5. External services

### 5.1 Resend (inbound email)

Read the docs before coding:
- List: <https://resend.com/docs/api-reference/emails/list-received-emails>
- Retrieve: <https://resend.com/docs/api-reference/emails/retrieve-received-email>
- Suppressions: <https://resend.com/docs/api-reference/suppressions/add-suppression>

Implement `src/lib/resend.ts`:

- `listReceivedEmails(): Promise<ReceivedEmailSummary[]>` — all received emails (subject, from, to, id, created_at, has-attachments flag). Handle pagination.
- `getReceivedEmail(id): Promise<ReceivedEmail>` — full body (prefer `text`; fall back to stripped `html`), plus attachment descriptors with authenticated download URLs.
- `downloadAttachment(url): Promise<Buffer>`.
- `addSuppression(email: string): Promise<void>` — used by the Junk action.

**Ops prerequisite (document in README, not code):** an inbound receiving address/domain must be configured in the Resend dashboard. Resend expires received emails after **30 days**.

### 5.2 Vercel Global Config (email status store)

Read <https://vercel.com/docs/global-config/vercel-api> before coding. Implement `src/lib/email-status.ts` over its REST API:

```ts
type EmailStatus = "pending" | "approved" | "declined" | "no-action" | "junk";

type EmailStatusRecord = {
  status: EmailStatus;
  adminLogin?: string;   // GitHub login of acting admin
  adminName?: string;
  updatedAt: string;     // ISO date
};

getStatuses(): Promise<Record<string, EmailStatusRecord>>       // keyed by Resend email id
setStatus(id, status, admin): Promise<void>
deleteStaleIds(validIds: string[]): Promise<number>             // returns count deleted
```

Behaviour:

- When the email list is loaded, any Resend email id **not** present in Global Config is immediately written as `pending` (with no admin fields).
- `declined`, `no-action`, and `junk` are set explicitly by the admin; `approved` is set automatically after a successful commit (§8).
- On each list load, run `deleteStaleIds(currentResendIds)` — ids no longer returned by Resend (30-day expiry) are removed from the config.

### 5.3 GitHub (contents repo)

Implement `src/lib/github.ts` using `@octokit/rest` constructed **per request with the admin's OAuth token**.

- `ensureStagingBranch()` — create `staging` from `main` if missing (get ref → 404 → create ref from `main`'s SHA).
- `getFile(path, ref): Promise<{ content: string; sha: string } | null>` — Contents API, base64-decoded; `null` when absent.
- `commitFiles(files: Array<{ path, content }>, message): Promise<{ commitUrl, sha }>` — one commit per file via `PUT /repos/{owner}/{repo}/contents/{path}` (`branch: staging`, include `sha` when the file exists). Sequential calls are acceptable; an email rarely carries more than 2 files. Normalise all paths with a `normalizeRepoPath()` helper (no leading slash, no `..`, no backslashes).
- `publishStagingToLive(): Promise<{ prUrl }>` — `POST /repos/{owner}/{repo}/pulls` `{ head: staging, base: main, title: "Publish staging to live" }`, then immediately `PUT /pulls/{n}/merge` (merge commit). Handle Octokit `422` errors: "No commits between main and staging" → friendly "nothing to publish"; "A pull request already exists" → fetch the open PR and merge it.

### 5.4 Cloudinary (blobs)

Implement `src/lib/cloudinary.ts` with the v2 Node SDK (server-side only).

- `uploadAsset(buffer, { folder, title, description, tags, license, individualPermission, filename })` — `upload_stream` with `folder`, `tags`, `use_filename: true`, `unique_filename: true`, and contextual metadata: `context = { title, description, license, individual_permission }` (pipe-separated `key=value` string per Cloudinary convention). Title/description also go to `context`; license & individual-permission are stored as context **only** (never exposed by the webhooks).
- `listFoldersWithAssets(): Promise<string[]>` — folders under the root that contain ≥1 resource.
- `listAssetsInFolder(folder): Promise<AssetEntry[]>` where

```ts
type AssetEntry = {
  public_id: string;
  format: string;
  title?: string;        // context title or caption
  description?: string;  // context description or alt
  tags?: string[];
  etag?: string;
};
```

### 5.5 Vercel Blob (asset cache)

Implement `src/lib/asset-cache.ts` over `@vercel/blob`:

- Cache document: `{ generatedAt: string, folders: Record<string, AssetEntry[]> }` stored as a single JSON blob, e.g. `asset-cache.json`, `access: "public"`, no random suffix (`addRandomSuffix: false`), overwritten on refresh.
- `readCache()`, `refreshCache()` (rebuilds from Cloudinary), `flushCache()` (delete + rebuild lazily).

Refresh triggers: (a) the Cloudinary notification webhook (§9.3), (b) the admin's manual "flush cache" button, (c) cold cache on first read.

---

## 6. Update-email parsing (`src/lib/email-parse/`)

All parsing logic lives here as pure, unit-testable functions. **Write the Vitest tests first** (§12).

### 6.1 Sensitive-section extraction

Email bodies contain one or more regions delimited by lines whose first non-whitespace characters are `!--`. The region opens at a line like `!-- IF YOU EDIT THE TEXT BELOW, PLEASE DO SO WITH CARE` and closes at the next `!--` line (conventionally `!-- END OF SENSITIVE SECTION`).

- `extractSections(body: string): string[][]` — return the inner lines of each region.
- Some clients interleave a blank line between every content line: if ≥50% of inner lines are blank, drop the blank ones.

### 6.2 Path validation

`validateContentPath(path: string): { kind } | { error }`. Allowed shapes:

| Shape | Rule |
|---|---|
| `races/{raceId}/index.md` | `{raceId}` matches `/^[-\w]+$/` |
| `races/{raceId}/{base}` | base matches `/^\d{4}(-\w+)?\.csv$/` or `/^[\w-]+\.geojson$/` |
| `championships/`, `clubs/`, `info/`, `long-distance/` `{base}` | base matches `/^[-\w]+\.md$/` |
| `news/{YYYY}/{base}` | `{YYYY}` matches `/^\d{4}$/`; base matches `/^\d{4}-\d{2}-\d{2}(-\d+)?\.md$/` |
| `calendar.csv` | exact |

A `.csv` path is valid **only** under `races/{raceId}/` or as exactly `calendar.csv`. Reject anything containing `..`, a leading `/`, or backslashes. `.geojson` files are valid paths but, in v1 of the review UI, are treated as "no automated merge — show raw diff" (see §7).

### 6.3 Update classification

`classifyEmail(email): EmailUpdate` — inspect sections + attachments and return a discriminated union:

```ts
type EmailUpdate =
  | { kind: "markdown"; path: string; frontmatter: Record<string, unknown>; body?: string }
  | { kind: "csv-file"; path: string; source: CsvSource }          // full-file replace
  | { kind: "csv-minor-edit"; path: string; selector: RowSelector; changes: RowChanges; comments?: string }
  | { kind: "calendar"; path: "calendar.csv"; lines: string[] }
  | { kind: "blob-upload"; folder: string; metadata: BlobMetadata; attachment: AttachmentRef }
  | { kind: "unrecognised"; reason: string };
```

Each `!--` section is parsed as `Key: value` lines. Dispatch rules:

1. Section has `Folder:` → **blob-upload** (§6.7).
2. Section has `File: calendar.csv` → **calendar** (§6.6).
3. Section has `File:` + any `Change * to:` keys → **csv-minor-edit** (§6.5).
4. Section has `File: *.csv` + a `GoogleSheet:` link, or there is a CSV/XLSX/ODS attachment → **csv-file** (§6.4).
5. Section has `File: *.md` → **markdown** (§6.4).
6. Otherwise → **unrecognised** (shown to admin with the raw body; they can only decline/no-action/junk).

### 6.4 Markdown updates

Section layout:

```text
File: races/CallanderCrags/index.md
---
maleRecord: Prasad Prasad, 0:21:27 (2012)
---
(optional markdown body)
```

- Parse the optional `--- … ---` block with `gray-matter` (wrap: `matter(`---\n${block}\n---\n`)`) or `yaml`; fields are merged **key-by-key** into existing frontmatter (email keys win; existing keys not mentioned are kept).
- If content follows the frontmatter block, it **fully replaces** the existing markdown body. If no body is present, keep the existing body.
- If the file does not exist in the repo, the update creates it (frontmatter + body from the email).
- Serialise with `matter.stringify(body.trim(), mergedFrontmatter)`.

### 6.5 Full CSV result files

CSV content comes from, in priority order:

1. A `GoogleSheet:` URL in the section → fetch `URL + "/gviz/tq?tqx=out:csv"` at approval time (and at preview time) with `fetch`.
2. A `.csv` attachment → download bytes as-is (decode UTF-8, strip BOM).
3. An `.xlsx` or `.ods` attachment → convert with SheetJS: `XLSX.read(buf)` → first sheet → `XLSX.utils.sheet_to_csv(ws)`.

The fetched CSV **fully replaces** the target file (create if absent). Validate before showing the diff: path passes §6.2, parsed header row contains a Position-like column (see aliases below) and a Name-like column. Surface — don't block on — row-count anomalies in the UI.

### 6.6 Minor CSV edits

Section layout:

```text
File: races/BenLomond/1996.csv
Position: 26
Name: Nialcoim Finbow
Category: MV
Club: Shettleston Harriers
Change Name to: Malcolm Finbow
Comments: …
```

Algorithm (`applyMinorEdit(csvText, selector, changes) → newCsvText`):

- Parse with `csv-parse/sync` (`columns: false`, keep raw), preserving the original column order and every column/row untouched except the target cells.
- **Column aliases** (case-insensitive match on the header row):
  - Position: `Position`, `RunnerPosition`, `FinishPosition`, `Pos`
  - Category: `Category`, `RunnerCategory`, `Cat`
  - Club: `Club`
  - Name: `Name`, or the pair `Firstname`/`FirstName` + `Surname`
  - Time: `Time` (never editable)
- **Row selection:** match data rows where the Position column equals `Position:`. If exactly one row matches → use it. If several match, pick the row whose Name (or `Firstname Surname` concatenation) case-insensitively equals `Name:`; if still ambiguous, fail with a clear error listing the candidate rows.
- **Changes:** only `Change Name to:`, `Change Club to:`, `Change Category to:` are allowed.
  - `Change Name to:` with a single `Name` column → set it. With split `Firstname`/`Surname` columns → split the new value on the **first** space: first token → Firstname, remainder → Surname.
  - `Position` and `Time` can never be changed, even if a malicious section tries.
- `Category:`/`Club:` in the section are reference-only; never written unless via a `Change … to:` key.
- Serialise with `csv-stringify/sync`, preserving the original line-ending style and quoting only where needed. The row count and column order must be identical before and after.

### 6.7 Calendar updates

If the section's `File:` is `calendar.csv`, collect the section lines matching `/^\d{4}-\d{2}-\d{2},[-\w]*$/` and merge them into the existing `calendar.csv`:

- Skip incoming lines already present verbatim.
- Append the rest, then re-sort the whole file by date (stable), preserving any non-matching lines (e.g. rows with extra columns) in place.

### 6.8 Blob uploads

Section layout:

```text
Folder: races/BenLomond
Title: Summit checkpoint
Description: View of runners …
Tags: Ben Lomond, 2026, summit, runners, hero
License: CC-BY-4.0
Individual permission: Yes
```

- `Folder:` is required and must match one of: `races/{raceId}`, `championships/{series}`, `clubs/{clubId}`, `documents/` — where the placeholders match `/^[-\w]+$/`. **Exactly these four prefixes; nothing else** (do not add homepage/portraits/unclassified).
- `Tags:` is a comma-separated list (trim each).
- `Title`, `Description`, `License`, `Individual permission` map to Cloudinary contextual metadata (`title`, `description`, `license`, `individual_permission`).
- The image/document bytes come from the email's attachments (first non-CSV attachment, or the only attachment). Reject if there is no suitable attachment.

---

## 7. Review flow (the core UX)

### Pages

| Route | Purpose |
|---|---|
| `/sign-in` | GitHub sign-in; plain-language copy |
| `/` | Inbox: table of received emails — date, sender, subject, detected update type, status badge. Filter buttons: All / Pending / Approved / Declined / No action / Junk. Loading this page triggers pending-backfill + stale cleanup (§5.2) |
| `/emails/[id]` | Review screen (below) |
| `/publish` | Shows count of commits on `staging` ahead of `main`, "Publish updates" button → §5.3 `publishStagingToLive()` |
| `/assets` | Cache info (generated-at, folder count) + "Refresh asset list" button (flush + rebuild) |

Layout: a slim shared shell (app name, signed-in admin name, nav: Inbox / Publish / Assets / Sign out). Mobile-friendly, high-contrast, large click targets — admins are non-technical.

### Review screen (`/emails/[id]`)

1. Load email via Resend; classify (§6.3); load current file(s) from `staging` (creating the branch if needed).
2. Compute the **merged result** and render a unified line diff (jsdiff) old → new per file, plus the parsed summary (what will change, in plain words).
3. Provide a textarea pre-filled with the merged file content so the admin can make minor corrections before approving ("You can make small corrections below before saving.").
4. Action buttons:
   - **Approve and save** → commit (§5.3) → set status `approved` → show confirmation with a plain-language message.
   - **Decline** → status `declined` (confirm dialog: "The sender will not be notified automatically.").
   - **No action needed** → status `no-action`.
   - **Junk** → confirm → Resend `addSuppression(sender)` → status `junk`.
5. For `unrecognised` emails: show the raw body and only the Decline / No action / Junk actions.
6. Blob-upload emails: preview metadata + attachment thumbnail; Approve uploads to Cloudinary, refreshes the asset cache, and sets `approved` (no GitHub commit).
7. Guard: if status is already `approved`/`declined`/`junk`, render read-only with the recorded admin name + date.

Mutations are Next.js **server actions** with `useActionState`, returning `{ status: "idle" | "success" | "error"; message?: string; fieldErrors?: … }`.

### UI copy rules (hard requirement)

Never expose GitHub/Resend jargon to admins. Use: "draft/saved update" not "PR/commit/branch"; "publish updates" not "merge"; "Checks" not "Validation"; "URL ending" not "slug"; "content store" not "content repository"; "saved fields" not "frontmatter/markdown/YAML". Error like "Publishing is not set up yet — please contact an administrator" instead of raw credential errors. Button labels describe intent: "Approve and save", "Publish updates".

---

## 8. Approval → commit sequence

For a GitHub-backed update (markdown / csv-file / csv-minor-edit / calendar):

1. `ensureStagingBranch()`.
2. Re-fetch the current file (guard against drift since preview).
3. Recompute merged content **from the admin's edited textarea if they changed it**, otherwise from the parsed merge.
4. `commitFiles()` with message like `Update races/BenLomond/1996.csv (via admin review)`.
5. `setStatus(emailId, "approved", admin)`.
6. Redirect back to `/` with a success flash.

Any thrown GitHub/Resend error → `status: "error"` with a plain-language message; log the technical detail server-side.

---

## 9. Public asset-discovery webhooks & cache

Two **unauthenticated** GET endpoints (consumed by the static site from the browser — send `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=300`):

| Endpoint | Response |
|---|---|
| `GET /api/assets` | `{ folders: string[] }` — every folder containing ≥1 blob |
| `GET /api/assets?folder=races/BenLomond` | `{ folder, entries: AssetEntry[] }` (§5.4 shape). Unknown/empty folder → `404 { error }` |

Both read from the Vercel Blob cache; cold cache triggers a rebuild.

Also:

- `POST /api/cloudinary-webhook` — Cloudinary notification URL target. Requires header/query secret equal to `CLOUDINARY_WEBHOOK_SECRET`; on `upload` notifications, refresh the cache. Return `401` otherwise. Document in README that this URL must be registered in the Cloudinary console.
- The `/assets` admin page's "Refresh asset list" button calls a server action that flushes + rebuilds the cache.

---

## 10. Error handling & limits

- All server actions wrapped in try/catch → `{ status: "error", message }` in plain language.
- Resend/Global Config/Blob outages → inbox page still renders with a clear banner, never a stack trace.
- Attachment size cap: 15 MB; reject larger with a friendly message.
- GoogleSheet fetches: 10 s timeout, follow redirects off, content-type sanity check.
- Never log OAuth tokens, API keys, or full email bodies at `info` level.

---

## 11. README must document

- Local setup (env vars table, GitHub OAuth app creation, Resend inbound address setup, Cloudinary webhook registration).
- Deployment on Vercel (link Global Config + Blob stores).
- The email templates the app understands (copy of §6 examples).
- Branch model: `staging` accumulates approvals; Publish merges to `main`.

---

## 12. Testing (Vitest)

Place under `testing/` (mirroring shr-admin's convention) or `src/**/*.test.ts`. Minimum coverage:

1. `extractSections` — multiple sections, interleaved blank lines, missing terminator.
2. `validateContentPath` — every allowed shape + rejections (`../`, `.csv` outside races, bad news date).
3. Markdown merge — frontmatter-only, body-only, both, create-new-file.
4. `applyMinorEdit` — unique Position; duplicate Position resolved by Name; split Firstname/Surname change; alias headers (`Pos`, `Cat`, `RunnerCategory`); extra columns (`Leg`, `Team`) preserved; attempt to change Position/Time is rejected.
5. Calendar merge — dedupe, sort, preserve non-matching lines.
6. Classification dispatch — each of the six `EmailUpdate` kinds from fixture bodies.
7. CSV source priority — GoogleSheet link beats attachment.

Fixtures: small inline strings, plus 2–3 sample emails modelled on the `ADMIN2.md` examples.

---

## 13. Implementation order (follow strictly)

1. Scaffold repo (Next.js 16 + TS + Tailwind 4), `engines.node`, README skeleton, env.ts with §3 schema.
2. Auth (§4) with allowlist; protect a placeholder home page.
3. Resend client + email-status store; inbox page listing emails with statuses (no parsing yet).
4. Parsing library + full Vitest suite (§6, §12) — pure functions, no I/O.
5. GitHub read/merge/preview; review page with diff + actions (§7, §8).
6. Publish page (§5.3).
7. Cloudinary upload path for blob-upload emails (§6.8).
8. Asset cache + public webhooks + Cloudinary webhook + `/assets` admin page (§9).
9. Polish: copy review against §7 rules, error states, loading states.
10. `npm run build`, `npm run lint`, `npm test` all green; deploy to Vercel; register Cloudinary webhook; smoke-test end-to-end with a real email.

---

## 14. Acceptance criteria

- An allowlisted admin can sign in with GitHub; anyone else is refused.
- The inbox lists all Resend-received emails with correct statuses; stale ids are pruned.
- For each example in `ADMIN2.md` (markdown frontmatter update, GoogleSheet CSV, minor edit, calendar line, blob upload), the review screen shows a correct diff/summary, and approving produces the expected commit on `staging` (or Cloudinary upload), recorded against the admin's GitHub account.
- Minor edit never alters column order, untouched cells, Position, or Time.
- "Publish updates" creates and merges a `staging → main` PR; a second click with no changes shows "nothing to publish".
- Junk marks the email and suppresses the sender in Resend.
- `GET /api/assets` and `GET /api/assets?folder=…` return correct cached data with CORS headers; uploading a new asset (or pressing refresh) updates the cache.
- No GitHub/Resend jargon appears anywhere in the UI.

---

## 15. Decisions & assumptions log

Decisions confirmed with the product owner (2026-08-22):

1. New repo `Scottish-Hill-Runners/admin2`; `shr-web` changes are out of scope.
2. GitHub OAuth per admin; commits use the admin's own token (easiest UX — single "Sign in with GitHub").
3. Admin allowlist via `ADMIN_GITHUB_LOGINS` env var.
4. Publish = create `staging → main` PR and merge immediately, one click.
5. Markdown merge = frontmatter key-by-key, body fully replaced when present.
6. Blob folders limited to exactly `races/`, `championships/`, `clubs/`, `documents/`.
7. License / Individual permission stored as Cloudinary context only, never exposed publicly.

Assumptions (flag to the owner if wrong):

- Resend inbound receiving is/will be configured in the Resend dashboard outside this project.
- `.geojson` race files pass path validation but get a raw (replace-only) review, no smart merge.
- Full-CSV updates replace the whole file.
- Multiple files per email are committed as sequential single-file commits.
- Calendar merge sorts the whole file by date after appending new lines.
- Split Firstname/Surname edits split the new name on the first space.
