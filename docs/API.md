# HTTP API

The complete Tarnished HTTP API — every route of `api/server.js`, with auth,
request/response schemas and the env-dependent behavior — is documented as a
hand-written OpenAPI 3.1 spec:

- **Spec (source of truth):** [`api/openapi.yaml`](../api/openapi.yaml)
- **Browsable:** open the spec in any OpenAPI viewer, e.g. paste it into https://editor.swagger.io

Lint it after changing routes:

```sh
npx --yes @redocly/cli lint api/openapi.yaml
```
