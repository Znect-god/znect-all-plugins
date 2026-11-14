# Znect CI Bridge project registry

**Schema version:** 1  
**Configuration variable:** `ZNECT_PROJECT_REGISTRY`  
**Maximum configuration size:** 32 KiB

The registry is non-secret routing metadata. Never place API tokens, webhook signing secrets, credentials, or private keys in it. Provider credentials remain in the runtime's secret store and are selected by the provider adapter.

## Example

```json
{
  "version": 1,
  "projects": [
    {
      "id": "znect-forge",
      "name": "Znect Forge",
      "repositories": [
        {
          "fullName": "Znect-god/znect-forge",
          "componentId": "android-app"
        }
      ],
      "components": [
        {
          "id": "android-app",
          "name": "Android application",
          "repository": "Znect-god/znect-forge",
          "pathPrefix": "app/"
        }
      ],
      "connections": [
        {
          "id": "circleci-main",
          "provider": "circleci",
          "projectSlug": "gh/Znect-god/znect-forge"
        }
      ]
    },
    {
      "id": "znect-ai",
      "name": "Znect AI",
      "repositories": [
        {
          "fullName": "Znect-god/znect-ai"
        }
      ],
      "components": [],
      "connections": [
        {
          "id": "znect-build-main",
          "provider": "znect-build"
        }
      ]
    }
  ]
}
```

## Rules

- Project IDs and component IDs are stable lowercase identifiers.
- A project may own multiple repositories and components.
- A repository may be mapped to a component; multiple components may refer to the same repository for monorepo layouts.
- CircleCI connections require a unique provider-native `projectSlug` (`gh/owner/repository`). The v1.1 and v3 read-only tools resolve the selected project's registered slug rather than using a global Forge constant.
- `znect-build` is a reserved provider type for the planned native Build adapter. Registry support alone does not implement its API client, event signature, credentials, or diagnostics mapping.
- Unknown providers, duplicate project IDs, duplicate CircleCI slugs, invalid component references, unsafe path prefixes, malformed JSON, and oversized configuration are rejected.
- If the variable is absent, a single Forge project registry is loaded to preserve existing behavior.

## Current integration boundary

The registry drives CircleCI webhook allowlisting, project-isolated event inbox routing, and project selection for CircleCI build/run/job/log/test/artifact/diagnostic tools and the read-only browser API. MCP tools accept `project_id`; omitting it retains the `znect-forge` default for compatibility. Browser API endpoints accept `project_id` as a query parameter.

Before returning run diagnostics, the Bridge resolves the run's referenced pipeline with the selected `filter[project_id]` and verifies the pipeline's project reference. Before returning job data, it verifies the detail resource's `references.project.id`; when a job is inspected as part of a run, it also verifies `references.workflow.id`. Missing or mismatched ownership metadata is rejected rather than guessed. This protects against callers supplying a valid UUID belonging to another registered project.

The `znect-build` provider remains a reserved registry identifier only. Do not infer that a project has live Build connectivity merely because it appears in this registry.
