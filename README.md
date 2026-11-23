# SHR Admin 2

Admin surface for reviewing email-based updates to the Scottish Hill Runners content store.

## Development

Use Node 22 LTS. Copy `.env.example` to `.env.local`, configure GitHub OAuth and the service credentials, then run:

```sh
npm install
npm test
npm run lint
npm run dev
```

The implementation specification is maintained in `ADMIN2-SPEC.md` during initial development.

## Missing results

The review desk's Missing results report compares past calendar dates with the
published results for a selected year (defaulting to the current UK year).
Today's races are excluded. Results are matched by race ID, so any result for
an ID counts for all its calendar dates in that year. Races without an ID
cannot be checked and are listed separately. Each missing race links to its
public race page and shows available organiser and website details. Organiser
email links open a prefilled request for the results. Failed
contact lookups are flagged; failures to load the calendar or results prevent
the report from being produced.

## Runner category review

The review desk's Runner categories report checks a year's published results for
sex and age-band inconsistencies. It compares same-name runners across clubs as
possible matches; identical names need not mean the same person. Same-name
results in the same race file are never compared or used as evidence for one
another. Age bands are approximated from the categories observed at each race,
and calendar dates are used only when the race and result file have an
unambiguous date. Open and unrecognised categories do not establish an age.
A lower age category can cover an older runner when that race does not use the
higher category. Without dates, age bands are flagged only when they cannot be
reconciled within a year. For each flagged name, all results are shown for
context in an accordion, with one runner open at a time. Choices are retained
when another runner is opened. Dated races appear chronologically, followed by
races without an unambiguous date. Race names come from the year's calendar or published race
metadata, falling back to the ID if neither has a name. PWT is the runner's
time as a percentage of the overall winner's time in the same race and result
file; it is unavailable if either time or the winner cannot be determined.

No changes are preselected. A category is suggested only when same-name,
same-club results in at least two different race files agree, it has more
comparable race files than the current category, and it is already used in the
race. Lower categories in races without the higher category are not counted
against it. Editors may also enter
another category; the report warns, without blocking a save, if it is new to
that race or does not match M, F, A or NB optionally followed by two digits.
The app verifies the current saved results before making one commit on the
staging branch. If a source row cannot be matched uniquely, including when a
published name differs from the source, nothing is committed. Use Publish to
make saved changes live.

## Facebook feed caching

The public feed removes `fbclid` tracking parameters from links in messages,
including posts already stored in Blob. The stored original is unchanged.
Image descriptions in the public feed are limited to the first sentence and
200 characters for concise alt text; the full descriptions remain in Blob.
Posts without a message or images are omitted from the public feed but remain
available to administrators.

The public `/api/facebook-feed` response has an ETag and must be revalidated
before reuse. Browsers can send `If-None-Match` and receive `304 Not Modified`
when the public feed is unchanged. Refreshing or removing a post changes the
validator when the public response changes, without waiting for a cache TTL.
Each revalidation still reads the current Blob; this saves response bandwidth,
not the function invocation or Blob read. Errors are not cached.

Feed reads request an uncompressed Blob so refreshes and removals can use its
strong ETag for conditional writes. A missing or weak ETag prevents a write.
