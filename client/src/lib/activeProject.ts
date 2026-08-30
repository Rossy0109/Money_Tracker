import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

export const ACTIVE_PROJECT_STORAGE_KEY = "my-hisab.active-project-id";

export function resolveActiveProjectId(
  projectIds: number[],
  currentProjectId: number | null,
  storedProjectId: number | null
) {
  if (!projectIds.length) return null;
  if (currentProjectId !== null && projectIds.includes(currentProjectId))
    return currentProjectId;
  if (storedProjectId !== null && projectIds.includes(storedProjectId))
    return storedProjectId;
  return projectIds[0];
}

export function readActiveProjectId() {
  try {
    const value = window.sessionStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
    const projectId = Number(value);
    return Number.isInteger(projectId) && projectId > 0 ? projectId : null;
  } catch {
    return null;
  }
}

export function saveActiveProjectId(projectId: number) {
  try {
    window.sessionStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, String(projectId));
  } catch {
    // Storage can be unavailable in privacy-restricted mobile browsers.
  }
}

export function useActiveProject() {
  const { data: projects = [], isLoading } = trpc.projects.list.useQuery();
  const [activeProjectId, setActiveProjectId] = useState<number | null>(() => readActiveProjectId());

  useEffect(() => {
    if (projects.length > 0) {
      setActiveProjectId((current) => {
        const next = resolveActiveProjectId(
          projects.map((p) => p.id),
          current,
          readActiveProjectId()
        );
        if (next !== null && next !== current) {
          saveActiveProjectId(next);
        }
        return next;
      });
    }
  }, [projects]);

  const selectProject = (id: number) => {
    setActiveProjectId(id);
    saveActiveProjectId(id);
  };

  return {
    activeProjectId,
    projects,
    isLoading,
    selectProject,
    setActiveProjectId: selectProject,
  };
}
