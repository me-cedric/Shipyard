import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import YAML from "yaml";
import {
	type Adr,
	type Artifact_Serialize,
	commands,
	type Decision,
	type DesignList_Serialize,
	type FlowRow_Serialize,
	type Screen_Serialize,
	type TryRequest_Deserialize,
	unwrap,
	type Written_Serialize,
} from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";

export type Artifact = Artifact_Serialize;
export type DesignList = DesignList_Serialize;
export type Screen = Screen_Serialize;
export type FlowRow = FlowRow_Serialize;
export type { Adr };

export const designKeys = {
	all: ["design"] as const,
	list: ["design", "list"] as const,
	file: (path: string) => ["design", "file", path] as const,
};

/** The folders of each kind, as the Rust store names them. */
export const DESIGN_DIR = {
	diagram: "docs/diagrams",
	model: "docs/models",
	api: "docs/api",
	data: "docs/data-models",
	flow: "docs/flows",
} as const;

export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The artifacts, the ADRs, the screens and the design doc path. It waits for an open project. */
export function useDesignList() {
	const active = useActiveProject().data;
	return useQuery({
		queryKey: designKeys.list,
		queryFn: () => unwrap(commands.designList()),
		enabled: !!active,
	});
}

/** The artifacts of one kind, in list order. */
export const ofKind = (list: DesignList | undefined, kind: string) =>
	(list?.artifacts ?? []).filter((a) => a.kind === kind);

/**
 * One design file with its stamp. Every write sends the stamp of the read, so a change on disk
 * gives a conflict (REQ-023). A file that cannot be read shows its error and never saves (REQ-005).
 * `missing` is the text of a file that does not exist yet: the first save creates it.
 */
export function useDesignFile(path: string, missing?: string) {
	const qc = useQueryClient();
	const q = useQuery({
		queryKey: designKeys.file(path),
		queryFn: () => unwrap(commands.designRead(path)),
		// The stamp is the one of the open: a read of a changed disk would hide the conflict.
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchOnMount: "always",
		gcTime: 0,
	});
	const [draft, setDraft] = useState<string | null>(null);
	// The stamp of the disk, when a write found a newer file.
	const [conflict, setConflict] = useState<{ stamp: string | null; job: Job } | null>(null);
	const [failure, setFailure] = useState<string | null>(null);

	const absent =
		missing !== undefined && q.isError && /no such file|not found/i.test(message(q.error));
	const saved = q.data?.text ?? (absent ? missing : "");
	const stamp = q.data?.stamp ?? null;
	const ready = q.isSuccess || absent;

	const commit = useCallback(
		async (job: Job, replace?: string | null) => {
			setFailure(null);
			try {
				const w = await job(replace === undefined ? stamp : replace);
				if (w.conflict) {
					setConflict({ stamp: w.stamp, job });
					return false;
				}
				await q.refetch();
				setDraft(null);
				setConflict(null);
				await Promise.all([
					qc.invalidateQueries({ queryKey: designKeys.list }),
					qc.invalidateQueries({ queryKey: ["refs"] }),
				]);
				return true;
			} catch (e) {
				setFailure(message(e));
				return false;
			}
		},
		[q, qc, stamp],
	);

	const save = () =>
		draft === null || !ready
			? Promise.resolve(false)
			: commit(async (s) => unwrap(commands.designWrite(path, draft, s, absent)));

	return {
		ready,
		text: draft ?? saved,
		saved,
		stamp,
		dirty: draft !== null && draft !== saved,
		conflict: conflict !== null,
		/** The reason of a failed read, or of the last failed write. */
		error: failure ?? (absent || !q.isError ? null : message(q.error)),
		setText: setDraft,
		save,
		commit,
		/** Keep mine: run the write again against the stamp that the conflict gave. */
		keepMine: () => (conflict ? commit(conflict.job, conflict.stamp) : Promise.resolve(false)),
		reload: async () => {
			setDraft(null);
			setConflict(null);
			setFailure(null);
			await q.refetch();
		},
	};
}

type Job = (stamp: string | null) => Promise<Written_Serialize>;

/** Every write that is not a file edit. After a write the list and the refs read again. */
export function useDesignActions() {
	const qc = useQueryClient();
	return useMemo(() => {
		const after = async <T>(job: Promise<T>) => {
			try {
				return await job;
			} finally {
				await Promise.all([
					qc.invalidateQueries({ queryKey: designKeys.list }),
					qc.invalidateQueries({ queryKey: ["refs"] }),
				]);
			}
		};
		return {
			create: (path: string, text: string) =>
				after(unwrap(commands.designWrite(path, text, null, true))),
			createAdr: (title: string) => after(unwrap(commands.designAdrCreate(title))),
			decide: (path: string, decision: Decision, comment: string, stamp: string) =>
				after(unwrap(commands.designAdrDecide(path, decision, comment, stamp))),
			/** Adds a screen to the screens file. A file that does not exist yet is created. */
			addScreen: (file: string, title: string) =>
				after(
					(async () => {
						const read = await commands.designRead(file);
						if (read.status === "error" && !/no such file|not found/i.test(read.error))
							throw new Error(read.error);
						const now = read.status === "ok" ? read.data : null;
						const json = now ? (JSON.parse(now.text) as { screens: unknown[] }) : { screens: [] };
						json.screens.push({ slug: slug(title), title, artifacts: [], figma: null });
						const w = await unwrap(
							commands.designWrite(
								file,
								`${JSON.stringify(json, null, 2)}\n`,
								now?.stamp ?? null,
								!now,
							),
						);
						if (w.conflict) throw new Error("the file changed on disk");
					})(),
				),
			/** `click` is true: each call comes from a click of the person. */
			send: (request: TryRequest_Deserialize) => unwrap(commands.designTry(request, true)),
			open: (target: string) => unwrap(commands.designOpen(target)),
		};
	}, [qc]);
}

/** The rows of a flow file. A text that does not parse gives no row and its error. */
export function parseFlows(text: string): { rows: FlowRow[]; error: string | null } {
	try {
		const v = YAML.parse(text) as { rows?: FlowRow[] } | null;
		return { rows: v?.rows ?? [], error: null };
	} catch (e) {
		return { rows: [], error: message(e) };
	}
}

/** A file name from a title: lower case, digits and dashes. */
export const slug = (name: string) =>
	name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

/** The text of a new file, per kind and format. */
export const TEMPLATE = {
	excalidraw: '{"type":"excalidraw","version":2,"elements":[],"appState":{}}\n',
	mermaid: "flowchart LR\n  A[Start] --> B[End]\n",
	model:
		"specification {\n  element actor\n  element system\n}\nmodel {\n  user = actor 'User'\n  app = system 'App'\n  user -> app 'uses'\n}\nviews {\n  view index { include * }\n}\n",
	api: (title: string) =>
		`openapi: 3.0.3\ninfo:\n  title: ${JSON.stringify(title)}\n  version: 0.1.0\nservers:\n  - url: https://api.example.com\npaths:\n  /health:\n    get:\n      tags: [health]\n      summary: Health\n      responses:\n        "200":\n          description: OK\n`,
	data: "Table items {\n  id integer [pk]\n}\n",
	flow: "rows: []\n",
	/** The design doc skeleton, from Legacy `DesignDoc.tsx`. */
	doc: "# Design\n\n## Context and scope\n\n## Goals and non-goals\n\n## Overview\n\n## Detailed design\n\n## Alternatives considered\n\n## Open questions\n",
};
