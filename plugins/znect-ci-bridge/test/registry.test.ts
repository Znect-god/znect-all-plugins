import { describe, expect, it } from "vitest";
import {
  findCircleCiProject,
  findProject,
  parseProjectRegistry,
  loadProjectRegistry,
  selectProjectConnection,
  describeProjectStatus
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

  it("accepts the explicitly supported GitHub OAuth and API v3 CircleCI slug aliases", () => {
    const aliasProject = {
      ...forge,
      id: "znect-ai",
      connections: [{ id: "circleci-api", provider: "circleci", projectSlug: "github/Znect-god/znect-ai" }]
    };
    const registry = parseProjectRegistry(JSON.stringify({ version: 1, projects: [aliasProject] }));
    expect(findCircleCiProject(registry, "github/Znect-god/znect-ai")).toMatchObject({
      project: { id: "znect-ai" },
      connection: { projectSlug: "github/Znect-god/znect-ai" }
    });
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
  it("allows projects without CI connections and does not inject a Forge-only default", () => {
    const registry = loadProjectRegistry();
    expect(registry.projects).toEqual([]);
    const parsed = parseProjectRegistry(JSON.stringify({
      version: 1,
      projects: [{
        id: "znect-familiar",
        name: "Znect Familiar",
        repositories: [{ fullName: "Znect-god/znect-familiar" }],
        components: [],
        connections: []
      }]
    }));
    expect(parsed.projects[0].connections).toEqual([]);
  });

  it("preserves multiple repositories and multiple provider connections in one project", () => {
    const parsed = parseProjectRegistry(JSON.stringify({
      version: 1,
      projects: [{
        id: "znect-ai",
        name: "Znect AI",
        repositories: [
          { fullName: "Znect-god/znect-ai" },
          { fullName: "Znect-god/znect-ai-tools" }
        ],
        components: [],
        connections: [
          { id: "circleci-main", provider: "circleci", projectSlug: "gh/Znect-god/znect-ai" },
          { id: "build-main", provider: "znect-build" }
        ]
      }]
    }));
    expect(parsed.projects[0].repositories).toHaveLength(2);
    expect(parsed.projects[0].connections.map((connection) => connection.id))
      .toEqual(["circleci-main", "build-main"]);
  });
  it("reports project registration, CI configuration, and provider availability independently", () => {
    const empty = parseProjectRegistry(JSON.stringify({
      version: 1,
      projects: [{
        id: "znect-familiar",
        name: "Znect Familiar",
        repositories: [],
        components: [],
        connections: []
      }]
    })).projects[0];
    expect(describeProjectStatus(empty)).toEqual({
      id: "znect-familiar",
      name: "Znect Familiar",
      status: "registered",
      ci_status: "not_configured",
      providers: [],
      connections: []
    });

    const configuredProject = parseProjectRegistry(JSON.stringify({ version: 1, projects: [forge] })).projects[0];
    const configured = describeProjectStatus(configuredProject);
    expect(configured.status).toBe("registered");
    expect(configured.ci_status).toBe("configured");
    expect(configured.connections).toEqual([{
      id: "circleci-main",
      provider: "circleci",
      status: "configured",
      provider_availability: "not_checked"
    }]);
    const reservedProject = parseProjectRegistry(JSON.stringify({
      version: 1,
      projects: [{ ...forge, connections: [{ id: "build-main", provider: "znect-build" }] }]
    })).projects[0];
    const reserved = describeProjectStatus(reservedProject);
    expect(reserved.connections[0].provider_availability).toBe("not_implemented");
  });

  it("requires explicit connection selection when a project has multiple CircleCI connections", () => {
    const parsed = parseProjectRegistry(JSON.stringify({
      version: 1,
      projects: [{
        id: "znect-ai",
        name: "Znect AI",
        repositories: [{ fullName: "Znect-god/znect-ai" }],
        components: [],
        connections: [
          { id: "circleci-main", provider: "circleci", projectSlug: "gh/Znect-god/znect-ai" },
          { id: "circleci-tools", provider: "circleci", projectSlug: "gh/Znect-god/znect-ai-tools" }
        ]
      }]
    }));
    const project = parsed.projects[0];
    expect(selectProjectConnection(project, "circleci", "circleci-tools").projectSlug)
      .toBe("gh/Znect-god/znect-ai-tools");
    expect(() => selectProjectConnection(project, "circleci"))
      .toThrow(/multiple circleci connections.*connection_id/i);
    expect(() => selectProjectConnection(project, "circleci", "missing"))
      .toThrow(/no circleci connection named missing/i);
  });

});