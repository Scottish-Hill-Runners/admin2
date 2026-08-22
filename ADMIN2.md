# Admin site, version 2

The existing admin app has grown overly complex. Rather than continue, we wish to start again in a new repo, using a simplified, uniform design that processes draft content updates sent via email.

## Environment

- Admin-2 will be a Next.js web app hosted on [Vercel](https://vercel.com).
- Its primary purpose is to provide a non-technical surface for users to review and commit changes.
- Content update requests from community users will be sent by email, via [Resend](https://resend.com).
- The result web app (`shr-web`) will be updated to assist community users in preparing emails that conform to the required templates.
- Admin-2 will be reserved for authenticated admins only.
- The logged-in admin must be an authenticated GitHub user, and commits and merges will be recorded against their account.
- When an admin approves an update, a commit will be pushed against the `staging` branch in the `shr-contents` repo.
- An admin can publish accumulated changes by requesting a merge from the `staging` branch into `main`.
- The Admin 2 UI will display unprocessed emails for admin review, prepare commits, and push and merge branches.

## Review interface

After login, the admin UI will query the Resend API for a list of all received emails, and display a summary for review.

API link: <https://resend.com/docs/api-reference/emails/list-received-emails>

When an email is selected for review, the app will retrieve the body of the email along with any relevant attachments. If the email is a proposed content update, it will:

- retrieve any current file from the contents repo `staging` branch (creating this branch from `main` if necessary);
- create a merged version of changes from the email with the current contents; and
- display a diff for the admin to view and approve.

The admin may be given the opportunity to make minor changes before pushing a commit.

API link: <https://resend.com/docs/api-reference/emails/retrieve-received-email>

Alternatively, the admin user may choose to "decline" an email, mark it as "no-action", or flag it as "junk". If none of these actions are taken, the email is marked as "pending".

A [Vercel Global Config](https://vercel.com/docs/global-config/vercel-api) will be used to store the status of an email ID. An email status is one of:

- pending
- approved
- declined
- no-action
- junk

Email IDs are marked "pending" immediately on receipt, if they are not present in the Global Config. The admin can mark an email "declined", "no-action" or "junk" - these update the status. With a junk email, the email sender is suspended - see <https://resend.com/docs/api-reference/suppressions/add-suppression>.

If possible, the date and name of the admin should be recorded along with the status.

Resend will expire emails after 30 days, and any Global Config email IDs that do not appear in the Resend email list are stale and can be deleted.

## Update artifacts

The `shr-contents` repo consists entirely of `.md`, `.csv` and `.geojson` files.

Each file has a path; e.g. `races/BenLedi/2013.csv`, `championships/SHR.md`, `info/FAQs.md`, etc. The path prefix must match one of:

- `races/{raceId}/`
- `championships/`
- `clubs/`
- `info/`
- `long-distance/`
- `news/{YYYY}/`
- `calendar.csv`

The placeholder `{raceId}` must conform to the regex `[-\w]+`, and `{YYYY}` to `\d{4}`.

If the directory matches `races/{raceId}/` then the basepath must one of:

- `index.md` (exact match)
- `\d{4}(-\w+)?\*?.csv` (regex match)
- `*.geojson` (pattern match)

If the directory is `championships/`, `clubs/`, `info/` or `long-distance/` then the basepath must match the regex `[-\w]+\.md`.

If the directory is `news/{YYYY}/` then the basepath must match the regex `\d{4}-\d{2}-\d{2}(-\d+)?\.md`.

Any `.csv` path _must_ have a prefix matching `races/{raceId}/` _or_ be `calendar.csv`.

### Markdown files

Some (but not all) `.md` files include frontmatter. Fields in the frontmatter vary, and the app does not need to validate these; they are simply merged with any existing frontmatter. The update may specify just content, just metadata, or a mix of both.

Updates to `.md` content are included in the message body, in a section delimited by lines starting `!--`. The first line after in the delimited region should name a file, and the remaining lines the file content. For example,

```text
!-- IF YOU EDIT THE TEXT BELOW, PLEASE DO SO WITH CARE
File: races/CallanderCrags/index.md
---
maleRecord: Prasad Prasad, 0:21:27 (2012)
---
(new markdown content optionally appears here)
!-- END OF SENSITIVE SECTION
```

Some email clients may introduce alternating blank lines; these should be removed.

### CSV result files

New CSV result files are included either as an attachment or a link in the email body. If the email body contains a section delimited by `!--` then we can retrieve the file from there; e.g.

```text
!-- IF YOU EDIT THE TEXT BELOW, PLEASE DO SO WITH CARE
File: races/TwoBreweries/2026.csv
GoogleSheet: https://docs.google.com/spreadsheets/d/15Ry6nJHAbA8J_Vy0xYHS0EApR0jrRgmKF1WCeyxyFps
!-- END OF SENSITIVE SECTION
```

If a `GoogleSheet` link is provided, the CSV content can be retrieved by appending `/gviz/tq?tqx=out:csv` to the URL.

If no link is provided in the email body, look for CSV, XLSX or ODS attachments.

### Minor edits

We also support a special kind of "minor edit", which updates a single row in an existing CSV file. The update details will appear in the email body, in a key-value section delimited by lines starting `!--`. For example,

```text
!-- IF YOU EDIT THE TEXT BELOW, PLEASE DO SO WITH CARE
File: races/BenLomond/1996.csv
Position: 26
Name: Nialcoim Finbow
Category: MV
Club: Shettleston Harriers
Change Name to: Malcolm Finbow
Comments: Nialcoim Finbow is a mispelling of Malcolm Finbow, can this be changed?
!-- END OF SENSITIVE SECTION
```

In addition to "Change Name to:", we allow "Change Club to:" and "Change Category to:". The `Category:` and `Club:` fields are only provided for reference.

`File:` must be present, and must correspond to an existing file in the contents repo. The row to update within this file is specified by matching the `Position` column. Rarely, a `Position:` might not be unique, in which case `Name:` should be used identify the most likely row.

The order of the columns in the `.csv` file must be respected in preparing the patch. Any values not changed by the patch must keep their original value. The `Position` and `Time` fields can never be changed by a minor result edit. The CSV file may contain additional columns (such as `Leg` or `Team`), whose values must be preserved.

CSV headers may use alternate column names. The correspondences are:

- `RunnerPosition`, `FinishPosition` or `Pos` for `Position`
- `RunnerCategory` or `Cat` for `Category`
- `Firstname` (or `FirstName`) and `Surname` for `Name`

### Calendar updates

If the email body references `calendar.csv` then any lines that match `\d{4}-\d{2}-\d{2},[-\w]*` are to be merged with the existing calendar.

```text
!-- IF YOU EDIT THE TEXT BELOW, PLEASE DO SO WITH CARE
File: calendar.csv
2026-08-15,Oldhamstocks
!-- END OF SENSITIVE SECTION
```

## Blobs

All image files and documents reside on Cloudinary. No GitHub involvement, no versioning, no static site rebuild when they are updated. The static site will pull assets directly from Cloudinary.

Asset discovery will be supported via a webhook in the admin app. The static results site cannot query Cloudinary directly, as that would expose the secret API key.

Two unauthenticated asset discovery webhook queries need to be supported:

- a parameterless query, returning a list of all folders that contain at least one blob; and
- a query that takes a folder parameter, returning a list of entries of each blob in that folder. Each entry should include:
  - secure_url
  - resource_type
  - title (or caption)
  - description (or alt text)
  - tag set (possibly empty)
  - etag

The admin site should also cache query results in a Vercel blob store. The cache should be refreshed when a new asset is uploaded to the folder. The admin should also have an option to manually flush the entire cache.

Cloudinary assets are always sent as email attachments. In addition, the email body should contain a section delimited by `!--` markers containing key-value metadata fields; e.g.

```text
!-- IF YOU EDIT THE TEXT BELOW, PLEASE DO SO WITH CARE
Folder: races/BenLomond
Title: Summit checkpoint
Description: View of runners as they turn to start their descent
Tags: Ben Lomond, 2026, summit, runners, hero
License: CC-BY-4.0
Individual permission: Yes
!-- END OF SENSITIVE SECTION
```

The Folder key must be present, and the value should match one of the following:

- `races/{raceId}`
- `championships/{series}`
- `clubs/{clubId}`
- `documents/`

Here, `{raceId}`, `{series}` and `{clubId}` must match the regex `[-\w]+`.
