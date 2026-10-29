import { useQuery } from "@tanstack/react-query";
import { commands, unwrap } from "@/lib/ipc";

export const connectionKeys = {
	list: ["connections", "list"] as const,
	repos: (id: string) => ["connections", "repos", id] as const,
	users: (id: string) => ["connections", "users", id] as const,
};

export const mcpKeys = { list: ["mcp", "list"] as const };
export const providerKeys = {
	list: ["providers", "list"] as const,
	models: (id: string) => ["providers", "models", id] as const,
};
export const runnerKeys = { list: ["runners", "list"] as const };

/** The MCP servers with their live state. A start or a stop from outside shows within 2 s. */
export const useMcpServers = () =>
	useQuery({
		queryKey: mcpKeys.list,
		queryFn: () => unwrap(commands.mcpList()),
		refetchInterval: 2000,
	});

export const useProviders = () =>
	useQuery({
		queryKey: providerKeys.list,
		queryFn: () => unwrap(commands.providersList()),
	});

export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
