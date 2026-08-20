export type ProjectOption = { id: number };

export function activeProjectStorageKey(userId: number | undefined) {
  return `my-hisab-active-project-${userId ?? "anonymous"}`;
}

export function preferredProjectId(userId: number | undefined, projects: ProjectOption[]) {
  if (!projects.length) return null;
  if (typeof window !== "undefined") {
    const savedProjectId = Number(window.sessionStorage.getItem(activeProjectStorageKey(userId)));
    if (projects.some(project => project.id === savedProjectId)) return savedProjectId;
  }
  return projects[0].id;
}

export function persistPreferredProjectId(userId: number | undefined, projectId: number) {
  if (typeof window !== "undefined") window.sessionStorage.setItem(activeProjectStorageKey(userId), String(projectId));
}
