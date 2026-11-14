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
- CircleCI connections require a unique provider-native `projectSlug`.
- `znect-build` is a reserved provider type for the planned native Build adapter. Registry support alone does not implement its API client, event signature, credentials, or diagnostics mapping.
- Unknown providers, duplicate project IDs, duplicate CircleCI slugs, invalid component references, unsafe path prefixes, malformed JSON, and oversized configuration are rejected.
- If the variable is absent, a single Forge project registry is loaded to preserve existing behavior.

## Current integration boundary

The registry currently drives CircleCI webhook allowlisting and project-isolated event inbox routing. The existing CircleCI run, job, logs, test and artifact tools remain Forge-default until project selection and resource-ownership validation are implemented across those operations. Do not infer that a project has live Build connectivity merely because it appears in this registry.
