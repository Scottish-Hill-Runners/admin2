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
