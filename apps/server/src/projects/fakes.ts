import { randomUUID } from "node:crypto";
import type { Project } from "@repo/schema";
import type {
  CreateWithFirstVersionResult,
  DeleteOwnedResult,
  GetLatestResult,
  GetVersionResult,
  ListVersionsResult,
  ProjectRepo,
  PublicProject,
  PublicVersionDetail,
  PublicVersionSummary,
  SaveNewVersionResult,
} from "./repositories.js";

interface InternalProject {
  id: string;
  ownerId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface InternalVersion {
  id: string;
  projectId: string;
  versionNumber: number;
  schemaVersion: number;
  document: Project;
  createdBy: string;
  createdAt: Date;
}

export class FakeProjectRepo implements ProjectRepo {
  private projects = new Map<string, InternalProject>();
  private versions = new Map<string, InternalVersion[]>();

  async createWithFirstVersion(params: {
    ownerId: string;
    document: Project;
    schemaVersion: number;
    maxProjectsPerUser: number;
    now: Date;
  }): Promise<CreateWithFirstVersionResult> {
    let count = 0;
    for (const p of this.projects.values()) {
      if (p.ownerId === params.ownerId) {
        count++;
      }
    }

    if (count >= params.maxProjectsPerUser) {
      return { ok: false, code: "project-limit-reached" };
    }

    const id = randomUUID();
    const project: InternalProject = {
      id,
      ownerId: params.ownerId,
      name: params.document.name,
      createdAt: new Date(params.now),
      updatedAt: new Date(params.now),
    };
    this.projects.set(id, project);

    const version: InternalVersion = {
      id: randomUUID(),
      projectId: id,
      versionNumber: 1,
      schemaVersion: params.schemaVersion,
      document: JSON.parse(JSON.stringify(params.document)),
      createdBy: params.ownerId,
      createdAt: new Date(params.now),
    };
    this.versions.set(id, [version]);

    return {
      ok: true,
      project: {
        id,
        name: project.name,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        latestVersion: 1,
      },
      version: {
        versionNumber: 1,
        schemaVersion: params.schemaVersion,
        createdAt: version.createdAt.toISOString(),
      },
    };
  }

  async saveNewVersion(params: {
    id: string;
    ownerId: string;
    baseVersion: number;
    schemaVersion: number;
    document: Project;
    now: Date;
  }): Promise<SaveNewVersionResult> {
    const project = this.projects.get(params.id);
    if (!project || project.ownerId !== params.ownerId) {
      return { ok: false, code: "not-found" };
    }

    const vers = this.versions.get(params.id) ?? [];
    let maxVersion = 0;
    for (const v of vers) {
      if (v.versionNumber > maxVersion) {
        maxVersion = v.versionNumber;
      }
    }

    if (params.baseVersion !== maxVersion) {
      return {
        ok: false,
        code: "version-conflict",
        currentVersion: maxVersion,
      };
    }

    const nextVersionNumber = maxVersion + 1;
    const newVersion: InternalVersion = {
      id: randomUUID(),
      projectId: params.id,
      versionNumber: nextVersionNumber,
      schemaVersion: params.schemaVersion,
      document: JSON.parse(JSON.stringify(params.document)),
      createdBy: params.ownerId,
      createdAt: new Date(params.now),
    };
    vers.push(newVersion);
    this.versions.set(params.id, vers);

    project.name = params.document.name;
    project.updatedAt = new Date(params.now);

    return {
      ok: true,
      project: {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        latestVersion: nextVersionNumber,
      },
      version: {
        versionNumber: nextVersionNumber,
        schemaVersion: params.schemaVersion,
        createdAt: newVersion.createdAt.toISOString(),
      },
    };
  }

  async listForOwner(ownerId: string, limit = 200): Promise<PublicProject[]> {
    const list: PublicProject[] = [];
    for (const p of this.projects.values()) {
      if (p.ownerId === ownerId) {
        const vers = this.versions.get(p.id) ?? [];
        let maxVersion = 0;
        for (const v of vers) {
          if (v.versionNumber > maxVersion) maxVersion = v.versionNumber;
        }
        list.push({
          id: p.id,
          name: p.name,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          latestVersion: maxVersion,
        });
      }
    }

    list.sort((a, b) => {
      const timeDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });

    return list.slice(0, limit);
  }

  async getLatest(params: {
    id: string;
    ownerId: string;
  }): Promise<GetLatestResult> {
    const project = this.projects.get(params.id);
    if (!project || project.ownerId !== params.ownerId) {
      return { ok: false, code: "not-found" };
    }

    const vers = this.versions.get(params.id) ?? [];
    let latest: InternalVersion | null = null;
    for (const v of vers) {
      if (!latest || v.versionNumber > latest.versionNumber) {
        latest = v;
      }
    }

    if (!latest) {
      return { ok: false, code: "not-found" };
    }

    return {
      ok: true,
      project: {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        latestVersion: latest.versionNumber,
      },
      version: {
        versionNumber: latest.versionNumber,
        schemaVersion: latest.schemaVersion,
        createdAt: latest.createdAt.toISOString(),
      },
      document: JSON.parse(JSON.stringify(latest.document)),
    };
  }

  async listVersions(params: {
    id: string;
    ownerId: string;
    limit?: number;
  }): Promise<ListVersionsResult> {
    const limit = params.limit ?? 200;
    const project = this.projects.get(params.id);
    if (!project || project.ownerId !== params.ownerId) {
      return { ok: false, code: "not-found" };
    }

    const vers = [...(this.versions.get(params.id) ?? [])];
    vers.sort((a, b) => b.versionNumber - a.versionNumber);

    const summaries: PublicVersionSummary[] = vers.slice(0, limit).map((v) => ({
      versionNumber: v.versionNumber,
      schemaVersion: v.schemaVersion,
      createdAt: v.createdAt.toISOString(),
      createdByMe: v.createdBy === params.ownerId,
    }));

    return {
      ok: true,
      versions: summaries,
    };
  }

  async getVersion(params: {
    id: string;
    ownerId: string;
    versionNumber: number;
  }): Promise<GetVersionResult> {
    const project = this.projects.get(params.id);
    if (!project || project.ownerId !== params.ownerId) {
      return { ok: false, code: "not-found" };
    }

    const vers = this.versions.get(params.id) ?? [];
    const v = vers.find((item) => item.versionNumber === params.versionNumber);
    if (!v) {
      return { ok: false, code: "not-found" };
    }

    const versionDetail: PublicVersionDetail = {
      versionNumber: v.versionNumber,
      schemaVersion: v.schemaVersion,
      createdAt: v.createdAt.toISOString(),
    };

    return {
      ok: true,
      version: versionDetail,
      document: JSON.parse(JSON.stringify(v.document)),
    };
  }

  async deleteOwned(params: {
    id: string;
    ownerId: string;
  }): Promise<DeleteOwnedResult> {
    const project = this.projects.get(params.id);
    if (!project || project.ownerId !== params.ownerId) {
      return { ok: false, code: "not-found" };
    }

    this.projects.delete(params.id);
    this.versions.delete(params.id);
    return { ok: true };
  }
}
