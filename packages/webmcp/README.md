# `@adaptive-world/webmcp`

React/TypeScript adapter for Adaptive World's page-scoped WebMCP tools. It uses
`document.modelContext` as the canonical API and supports `navigator.modelContext`
only as a compatibility fallback for early implementations.

The package is intentionally fail-safe:

- browsers without WebMCP get a no-op registration and retain the normal UI;
- component unmount aborts all registrations;
- every state-changing tool requires an application-owned confirmation callback;
- tool results are limited to 1,500 characters by default;
- read-only and untrusted-content annotations are included in every catalog;
- no medical tool is exposed cross-origin.

```tsx
const webmcp = useGymWebMCPTools({
  handlers,
  confirmMutation: ({ title, input }) => openConfirmationModal({ title, input }),
});
```

The hook returns `status`, `error`, and `toolNames`, so a route can show whether
its tools were actually registered. Catalog factories are also exported for
custom lifecycle management and tool-registry UIs.
