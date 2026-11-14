import { describe, expect, it } from "vitest";
import {
  findCircleCiProject,
  findProject,
  parseProjectRegistry
} from "../src/registry";

const forge = {
  id: "znect-forge",
  name: "Znect Forge",
  repositories: [{ fullName: "Znect-god/znect-forge", componentId: "android-app" }],
  components: [{ id: "android-app", name: "Android application", repository: "Znect-god/znect-forge", pathPrefix: "app/" }],
  connections: [{ id: "circleci-main", provider: "circleci", projectSlug: "gh/Znect-god/znect-forge" }]
};

describe("project registry", () => {
  it("parses a multi-project registry and resolves projects and provider connections", () => {
    const registry = parseProjectRegistry(JSON.stringify({
      version: 1,
      projects: [
        forge,
        {
          id: "znect-ai",
          name: "Znect AI",
          repositories: [{ fullName: "Znect-god/znect-ai" }],
          components: [],
          connections: [{ id: "build-main", provider: "znect-build" }]
        }
      ]
    }));

    expect(registry.projects).toHaveLength(2);
    expect(findProject(registry, "znect-forge")?.name).toBe("Znect Forge");
    expect(findCircleCiProject(registry, "gh/Znect-god/znect-forge")).toMatchObject({
      project: { id: "znect-forge" },
      connection: { id: "circleci-main", provider: "circleci" }
    });
    expect(findCircleCiProject(registry, "gh/Znect-god/unknown")).toBeUndefined();
  });

  it("rejects duplicate project IDs and duplicate CircleCI project mappings", () => {
    expect(() => parseProjectRegistry(JSON.stringify({
      version: 1,
      projects: [forge, { ...forge, name: "Duplicate" }]
    }))).toThrow(/duplicate project ID/i);

    expect(() => parseProjectRegistry(JSON.stringify({
      version: 1,
      projects: [
        forge,
        { ...forge, id: "other-project", connections: [{ id: "circleci-other", provider: "circleci", projectSlug: "gh/Znect-god/znect-forge" }] }
      ]
    }))).toThrow(/may only be registered once/i);
  });

  it("rejects repositories assigned to unknown components", () => {
    expect(() => parseProjectRegistry(JSON.stringify({
      version: 1,
      projects: [{
        ...forge,
        repositories: [{ fullName: "Znect-god/znect-forge", componentId: "missing" }]
      }]
    }))).toThrow(/unknown component/i);
  });

  it("rejects unsafe component paths and unsupported providers", () => {
    expect(() => parseProjectRegistry(JSON.stringify({
      version: 1,
      projects: [{ ...forge, components: [{ id: "android-app", name: "App", pathPrefix: "../secrets" }] }]
    }))).toThrow(/relative safe path/i);

    expect(() => parseProjectRegistry(JSON.stringify({
      version: 1,
      projects: [{ ...forge, connections: [{ id: "jenkins", provider: "jenkins" }] }]
    }))).toThrow(/unsupported CI provider/i);
  });

  it("rejects malformed or oversized configuration", () => {
    expect(() => parseProjectRegistry("{")).toThrow(/valid JSON/i);
    expect(() => parseProjectRegistry(JSON.stringify({ version: 2, projects: [] }))).toThrow(/schema version/i);
    expect(() => parseProjectRegistry("x".repeat(32_769))).toThrow(/32 KiB/i);
  });
});
