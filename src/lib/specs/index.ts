import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	type ApplyRow_Serialize,
	type ArtifactState_Serialize,
	type CapabilityRow,
	type ChangeView_Serialize,
	commands,
	type Draft_Deserialize,
	type Draft_Serialize,
	type Entry,
	type PlanRow,
	type Question,
	type SpecFinding_Serialize,
	type SpecView_Serialize,
	type SplitPreview_Serialize,
	unwrap,
} from "@/lib/ipc";
import { syncKeys } from "@/lib/sync";

export type Change = ChangeView_Serialize;
export type Artifact = ArtifactState_Serialize;
export type Finding = SpecFinding_Serialize;
export type Capability = CapabilityRow;
export type SpecView = SpecView_Serialize;
export type QuestionEntry = Entry;
export type Plan = PlanRow;
export type Draft = Draft_Serialize;
export type SplitItem = Draft_Serialize["items"][number];
export type Preview = SplitPreview_Serialize;
export type ApplyResult = ApplyRow_Serialize;
export type { Question };

/** The five artifacts of a change, in reading order. */
export const ARTIFACTS = ["proposal", "spec", "plan", "checklist", "tasks"] as const;
export type ArtifactKind = (typeof ARTIFACTS)[number];
export type ArtifactStatus = Artifact["status"];

/** The closed lists of the RAID file. The backend refuses a value outside them (REQ-010). */
export const KINDS = ["risk", "assumption", "issue", "dependency", "question", "decision"];
export const STATUSES = ["open", "answered", "withdrawn"];

export const specsKeys = {
	all: ["specs"] as const,
	changes: ["specs", "changes"] as const,
	capabilities: ["specs", "capabilities"] as const,
	questions: ["specs", "questions"] as const,
	plans: ["specs", "plans"] as const,
	file: (path: string) => ["specs", "file", path] as const,
	spec: (path: string) => ["specs", "spec", path] as const,
	coverage: (cap: string) => ["specs", "coverage", cap] as const,
	draft: (change: string) => ["specs", "draft", change] as const,
	preview: (change: string) => ["specs", "preview", change] as const,
};

// ---------------------------------------------------------------- pure rules

/** The repository path of an artifact of a change. */
export const artifactPath = (c: Change, a: Artifact) => `${c.path}/${a.path}`;

/** One status for the artifacts of one kind. No file is missing; any draft makes a draft; a mix is a draft. */
export function kindStatus(c: Change, kind: ArtifactKind): ArtifactStatus {
	const of = c.artifacts.filter((a) => a.artifact === kind);
	if (of.every((a) => a.status === "missing")) return "missing";
	return of.every((a) => a.status === "done") ? "done" : "draft";
}

/** The slug of a plan file, as the `test:` ref has it. */
export const planRef = (path: string) =>
	`test:${(path.split("/").pop() ?? "")
		.replace(/\.feature$/, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")}`;

/** The capability that a `spec:` ref names. */
export const capabilityOf = (ref: string) => /^spec:([^#]+)/.exec(ref)?.[1] ?? "";

/** The last line of the question text that is not empty: the answer that a person wrote. */
export const lastLine = (body: string) =>
	body
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.pop() ?? "";

const KEYS = [
	"id",
	"kind",
	"status",
	"raisedAt",
	"raisedBy",
	"owner",
	"specRef",
	"taskRef",
	"ticket",
] as const;

/** A RAID file as a question: the frontmatter keys, the `# ` title, then the body. */
export function readQuestion(text: string): Question {
	const clean = text.replace(/\r\n/g, "\n");
	const m = /^---\n([\s\S]*?)\n---\n?/.exec(clean);
	const q: Question = {
		id: "",
		kind: "",
		status: "",
		raisedAt: "",
		raisedBy: "",
		owner: "",
		specRef: "",
		taskRef: "",
		ticket: "",
		title: "",
		body: "",
	};
	for (const l of (m?.[1] ?? "").split("\n")) {
		const kv = /^([A-Za-z][\w-]*):(.*)$/.exec(l);
		const key = KEYS.find((k) => k === kv?.[1]);
		if (!key) continue;
		const v = (kv?.[2] ?? "").trim();
		try {
			q[key] = v.startsWith('"') ? (JSON.parse(v) as string) : v;
		} catch {
			q[key] = v;
		}
	}
	const rest = m ? clean.slice(m[0].length) : clean;
	const t = /^# (.*)\n?/.exec(rest);
	q.title = t?.[1] ?? "";
	q.body = t ? rest.slice(t[0].length) : rest;
	return q;
}

/** The open items that an archive refusal names, or null for another error. */
export function openItems(message: string): string[] | null {
	const m = /^open items: (.*)$/s.exec(message);
	return m ? (m[1] ?? "").split("; ").filter(Boolean) : null;
}

// ---------------------------------------------------------------- reads

export const useChanges = () =>
	useQuery({ queryKey: specsKeys.changes, queryFn: () => unwrap(commands.specsChanges()) });

export const useCapabilities = () =>
	useQuery({
		queryKey: specsKeys.capabilities,
		queryFn: () => unwrap(commands.specsCapabilities()),
	});

export const useQuestions = () =>
	useQuery({ queryKey: specsKeys.questions, queryFn: () => unwrap(commands.specsQuestions()) });

export const useBdd = () =>
	useQuery({ queryKey: [...specsKeys.all, "bdd"], queryFn: () => unwrap(commands.specsBdd()) });

export const useTestPlans = () =>
	useQuery({ queryKey: specsKeys.plans, queryFn: () => unwrap(commands.specsTestplans()) });

/** The text of a file and its stamp. */
export function useFile(path: string | null) {
	return useQuery({
		queryKey: specsKeys.file(path ?? ""),
		queryFn: () => unwrap(commands.specsRead(path ?? "")),
		enabled: path !== null,
		retry: false,
		// The stamp is the one of the open: a read of a changed disk would hide the conflict.
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
}

export function useSpecView(path: string | null) {
	return useQuery({
		queryKey: specsKeys.spec(path ?? ""),
		queryFn: () => unwrap(commands.specsSpec(path ?? "")),
		enabled: path !== null,
		retry: false,
	});
}

/** The requirements of a capability that no scenario cites. */
export function useCoverage(cap: string) {
	return useQuery({
		queryKey: specsKeys.coverage(cap),
		queryFn: () => unwrap(commands.specsCoverage(cap)),
	});
}

export function useSplitDraft(change: string) {
	return useQuery({
		queryKey: specsKeys.draft(change),
		queryFn: () => unwrap(commands.specsSplitDraft(change)),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

/** The rows that the apply would write. Nothing is written (REQ-018). */
export function useSplitPreview(change: string, enabled: boolean) {
	return useQuery({
		queryKey: specsKeys.preview(change),
		queryFn: () => unwrap(commands.specsSplitPreview(change)),
		enabled,
		retry: false,
		gcTime: 0,
	});
}

/** The number of open markers of each change, by change id (REQ-007). */
export function useMarkerCounts(changes: Change[]) {
	const specs = changes.flatMap((c) =>
		c.artifacts
			.filter((a) => a.artifact === "spec" && a.status !== "missing")
			.map((a) => ({ id: c.id, path: artifactPath(c, a) })),
	);
	const results = useQueries({
		queries: specs.map((s) => ({
			queryKey: specsKeys.spec(s.path),
			queryFn: () => unwrap(commands.specsSpec(s.path)),
		})),
	});
	const out: Record<string, number> = {};
	specs.forEach((s, i) => {
		out[s.id] = (out[s.id] ?? 0) + (results[i]?.data?.markers.length ?? 0);
	});
	return out;
}

/** The specs that hold a marker of the question: where a fold would write (REQ-015). */
export function useFoldTargets(question: string, capability: string) {
	const changes = useChanges().data ?? [];
	const caps = useCapabilities().data ?? [];
	const paths = [
		...caps.filter((c) => c.capability === capability).map((c) => c.path),
		...changes.flatMap((c) =>
			c.artifacts
				.filter(
					(a) => a.artifact === "spec" && a.capability === capability && a.status !== "missing",
				)
				.map((a) => artifactPath(c, a)),
		),
	];
	const results = useQueries({
		queries: paths.map((p) => ({
			queryKey: specsKeys.spec(p),
			queryFn: () => unwrap(commands.specsSpec(p)),
		})),
	});
	return paths.filter((_, i) => results[i]?.data?.markers.some((m) => m.question === question));
}

// ---------------------------------------------------------------- writes

/**
 * Every write of the Specs space. Fold, split apply and archive pass `click`: each one is called
 * from a click. After a write the views read their data again, the refs and the tracker mirror too.
 */
export function useSpecsActions() {
	const qc = useQueryClient();
	return useMemo(() => {
		const run = async <T>(
			call: Promise<{ status: "ok"; data: T } | { status: "error"; error: string }>,
		) => {
			try {
				return await unwrap(call);
			} finally {
				await Promise.all(
					[specsKeys.all, ["refs"], ["work"], syncKeys.all].map((queryKey) =>
						qc.invalidateQueries({ queryKey }),
					),
				);
			}
		};
		return {
			createChange: (id: string) => run(commands.specsChangeCreate(id)),
			write: (path: string, text: string, stamp: string | null, create = false) =>
				run(commands.specsWrite(path, text, stamp, create)),
			validate: (id: string) => run(commands.specsValidate(id)),
			saveQuestion: (path: string, q: Question, stamp: string | null) =>
				run(commands.specsQuestionSave(path, q, stamp)),
			createQuestion: (q: Question) => run(commands.specsQuestionCreate(q)),
			fold: (path: string, id: string, answer: string, stamp: string) =>
				run(commands.specsFold(path, id, answer, stamp, true)),
			saveSplit: (d: Draft_Deserialize) => run(commands.specsSplitSave(d)),
			applySplit: (change: string) => run(commands.specsSplitApply(change, true)),
			archive: (id: string, confirmed: boolean) => run(commands.specsArchive(id, confirmed)),
		};
	}, [qc]);
}
