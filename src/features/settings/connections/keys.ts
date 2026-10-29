export const connectionKeys = {
	list: ["connections", "list"] as const,
	repos: (id: string) => ["connections", "repos", id] as const,
};
