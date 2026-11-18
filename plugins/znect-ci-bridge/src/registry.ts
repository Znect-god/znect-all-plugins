export type CiProvider = "circleci";

export interface ProjectRepository {
  fullName: string;
  componentId?: string;
}

export interface ProjectComponent {
  id: string;
  name: string;
  repository?: string;
  pathPrefix?: string;
}

export interface ProjectConnection {
  id: string;
  provider: CiProvider;
  /** Provider-native project identifier; for CircleCI this is gh/owner/repo. */
  projectSlug?: string;
}

export interface ProjectRegistryEntry {
  id: string;
  name: string;
  repositories: ProjectRepository[];
  components: ProjectComponent[];
  connections: ProjectConnection[];
}

export interface ProjectRegistry {
  version: 1;
  projects: ProjectRegistryEntry[];
}

const MAX_REGISTRY_BYTES = 32_768;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const CIRCLECI_SLUG_PATTERN = /^(?:gh|github)\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, max = 160): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new Error(`Invalid project registry field: ${field}.`);
  }
  return value;
}

/**
 * Parse the non-secret project registry supplied through ZNECT_PROJECT_REGISTRY.
 * Provider credentials are deliberately not part of this document.
 */
export function parseProjectRegistry(raw: string): ProjectRegistry {
  if (new TextEncoder().encode(raw).byteLength > MAX_REGISTRY_BYTES) {
    throw new Error("Project registry exceeds the 32 KiB limit.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Project registry must contain valid JSON.");
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.projects)) {
    throw new Error("Project registry must use schema version 1 and contain a projects array.");
  }
  if (parsed.projects.length > 100) throw new Error("Project registry supports at most 100 projects.");

  const projectIds = new Set<string>();
  const connectionIds = new Set<string>();
  const projects: ProjectRegistryEntry[] = [];

  for (const [projectIndex, candidate] of parsed.projects.entries()) {
    if (!isRecord(candidate)) throw new Error(`Invalid project at index ${projectIndex}.`);
    const id = requiredString(candidate.id, `projects[${projectIndex}].id`, 63);
    if (!ID_PATTERN.test(id) || projectIds.has(id)) throw new Error(`Invalid or duplicate project ID: ${id}.`);
    projectIds.add(id);
    const name = requiredString(candidate.name, `projects[${projectIndex}].name`);

    const repositoriesRaw = candidate.repositories ?? [];
    const componentsRaw = candidate.components ?? [];
    const connectionsRaw = candidate.connections ?? [];
    if (!Array.isArray(repositoriesRaw) || !Array.isArray(componentsRaw) || !Array.isArray(connectionsRaw)) {
      throw new Error(`Project ${id} repositories, components and connections must be arrays.`);
    }

    const repositories: ProjectRepository[] = repositoriesRaw.map((item, index) => {
      if (!isRecord(item)) throw new Error(`Invalid repository at projects[${projectIndex}].repositories[${index}].`);
      const fullName = requiredString(item.fullName, `projects[${projectIndex}].repositories[${index}].fullName`, 200);
      if (!REPOSITORY_PATTERN.test(fullName)) throw new Error(`Invalid repository name: ${fullName}.`);
      const componentId = item.componentId === undefined
        ? undefined
        : requiredString(item.componentId, `projects[${projectIndex}].repositories[${index}].componentId`, 63);
      return { fullName, ...(componentId ? { componentId } : {}) };
    });

    const components: ProjectComponent[] = componentsRaw.map((item, index) => {
      if (!isRecord(item)) throw new Error(`Invalid component at projects[${projectIndex}].components[${index}].`);
      const componentId = requiredString(item.id, `projects[${projectIndex}].components[${index}].id`, 63);
      if (!ID_PATTERN.test(componentId)) throw new Error(`Invalid component ID: ${componentId}.`);
      const componentName = requiredString(item.name, `projects[${projectIndex}].components[${index}].name`);
      const repository = item.repository === undefined ? undefined : requiredString(item.repository, "component.repository", 200);
      if (repository && !REPOSITORY_PATTERN.test(repository)) throw new Error(`Invalid component repository: ${repository}.`);
      const pathPrefix = item.pathPrefix === undefined ? undefined : requiredString(item.pathPrefix, "component.pathPrefix", 512);
      if (pathPrefix !== undefined) {
        const segments = pathPrefix.split("/");
        const safeSegments = pathPrefix.endsWith("/") ? segments.slice(0, -1) : segments;
        if (pathPrefix.startsWith("/") || safeSegments.length === 0 ||
            safeSegments.some((segment) =>
              segment.length === 0 || segment === "." || segment === ".." ||
              !/^[A-Za-z0-9._-]+$/.test(segment)
            )) {
          throw new Error("Component pathPrefix must be a relative safe path.");
        }
      }
      return { id: componentId, name: componentName, ...(repository ? { repository } : {}), ...(pathPrefix ? { pathPrefix } : {}) };
    });
    const componentIds = new Set(components.map((component) => component.id));
    if (componentIds.size !== components.length) throw new Error(`Project ${id} contains duplicate component IDs.`);
    for (const repository of repositories) {
      if (repository.componentId && !componentIds.has(repository.componentId)) {
        throw new Error(`Repository ${repository.fullName} references unknown component ${repository.componentId}.`);
      }
    }
    for (const component of components) {
      if (component.repository && !repositories.some((repository) => repository.fullName === component.repository)) {
        throw new Error(`Component ${component.id} references an unregistered repository.`);
      }
    }

    const connections: ProjectConnection[] = connectionsRaw.map((item, index) => {
      if (!isRecord(item)) throw new Error(`Invalid connection at projects[${projectIndex}].connections[${index}].`);
      const connectionId = requiredString(item.id, `projects[${projectIndex}].connections[${index}].id`, 63);
      if (!ID_PATTERN.test(connectionId)) throw new Error(`Invalid connection ID: ${connectionId}.`);
      const provider = item.provider;
      if (provider !== "circleci") throw new Error(`Unsupported CI provider: ${String(provider)}.`);
      const key = `${id}:${connectionId}`;
      if (connectionIds.has(key)) throw new Error(`Duplicate connection ID: ${connectionId} in project ${id}.`);
      connectionIds.add(key);
      const projectSlug = item.projectSlug === undefined
        ? undefined
        : requiredString(item.projectSlug, `projects[${projectIndex}].connections[${index}].projectSlug`, 256);
      if (provider === "circleci" && (!projectSlug || !CIRCLECI_SLUG_PATTERN.test(projectSlug))) {
        throw new Error(`CircleCI connection ${connectionId} requires a valid projectSlug.`);
      }
      return { id: connectionId, provider, ...(projectSlug ? { projectSlug } : {}) };
    });
        projects.push({ id, name, repositories, components, connections });
  }

  const circleCiSlugs = projects.flatMap((project) =>
    project.connections.filter((connection) => connection.provider === "circleci").map((connection) => connection.projectSlug!)
  );
  if (new Set(circleCiSlugs).size !== circleCiSlugs.length) {
    throw new Error("A CircleCI project slug may only be registered once.");
  }

  return { version: 1, projects };
}


const EMPTY_PROJECT_REGISTRY = JSON.stringify({ version: 1, projects: [] });

export function loadProjectRegistry(raw?: string): ProjectRegistry {
  return parseProjectRegistry(raw ?? EMPTY_PROJECT_REGISTRY);
}

export function findProject(registry: ProjectRegistry, projectId: string): ProjectRegistryEntry | undefined {
  return registry.projects.find((project) => project.id === projectId);
}

export function findCircleCiProject(
  registry: ProjectRegistry,
  projectSlug: string
): { project: ProjectRegistryEntry; connection: ProjectConnection } | undefined {
  for (const project of registry.projects) {
    const connection = project.connections.find((candidate) =>
      candidate.provider === "circleci" && candidate.projectSlug === projectSlug
    );
    if (connection) return { project, connection };
  }
  return undefined;
}

/**
 * Resolve a configured provider connection without silently selecting the first
 * one when a project has multiple connections for the same provider.
 */
export function selectProjectConnection(
  project: ProjectRegistryEntry,
  provider: CiProvider,
  connectionId?: string
): ProjectConnection {
  const matches = project.connections.filter((connection) => connection.provider === provider);
  if (connectionId) {
    const selected = matches.find((connection) => connection.id === connectionId);
    if (!selected) throw new Error(`Project ${project.id} has no ${provider} connection named ${connectionId}.`);
    return selected;
  }
  if (matches.length === 0) throw new Error(`Project ${project.id} has no ${provider} connection.`);
  if (matches.length > 1) {
    throw new Error(`Project ${project.id} has multiple ${provider} connections; provide connection_id.`);
  }
  return matches[0];
}

/**
 * Derive registry/configuration/provider states without implying live reachability.
 * Provider availability is only established by a provider-specific read probe.
 */
export function describeProjectStatus(project: ProjectRegistryEntry) {
  return {
    id: project.id,
    name: project.name,
    status: "registered" as const,
    ci_status: project.connections.length === 0 ? "not_configured" as const : "configured" as const,
    providers: [...new Set(project.connections.map((connection) => connection.provider))],
    connections: project.connections.map((connection) => ({
      id: connection.id,
      provider: connection.provider,
      status: "configured" as const,
      provider_availability: "not_checked" as const
    }))
  };
}
