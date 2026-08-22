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
