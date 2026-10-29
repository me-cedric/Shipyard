import YAML from "yaml";
import type { EditorError } from "./error-line";

const METHODS = ["get", "put", "post", "delete", "patch", "options", "head", "trace"] as const;

export type ApiParam = { name: string; in: string; required: boolean; type: string };
export type ApiResponse = { status: string; description: string };
export type ApiOp = {
	method: string;
	path: string;
	summary: string;
	tag: string;
	parameters: ApiParam[];
	responses: ApiResponse[];
	body: boolean;
};
export type ApiDoc = {
	title: string;
	version: string;
	servers: string[];
	/** The tags in order of first use. An operation without a tag goes to `""`. */
	groups: { tag: string; ops: ApiOp[] }[];
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
	v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Follow a local `#/a/b` reference. Any other reference stays as it is. */
function deref(root: Obj, v: unknown): Obj {
	const ref = str(obj(v).$ref);
	if (!ref.startsWith("#/")) return obj(v);
	let cur: unknown = root;
	for (const key of ref.slice(2).split("/"))
		cur = obj(cur)[key.replace(/~1/g, "/").replace(/~0/g, "~")];
	return obj(cur);
}

function param(root: Obj, v: unknown): ApiParam {
	const p = deref(root, v);
	return {
		name: str(p.name),
		in: str(p.in),
		required: p.required === true || p.in === "path",
		type: str(deref(root, p.schema).type),
	};
}

/** Parse one contract. It never throws: an invalid contract returns its error and no endpoint. */
export function parseOpenApi(text: string): { doc?: ApiDoc; error?: EditorError } {
	let root: Obj;
	try {
		root = obj(YAML.parse(text));
	} catch (e) {
		const line = (e as { linePos?: { line: number }[] }).linePos?.[0]?.line;
		return { error: { message: e instanceof Error ? e.message : String(e), line } };
	}
	if (!root.openapi && !root.swagger) return { error: { message: "Missing openapi version" } };
	if (!Object.keys(obj(root.paths)).length) return { error: { message: "Missing paths" } };

	const groups = new Map<string, ApiOp[]>();
	for (const [path, rawItem] of Object.entries(obj(root.paths))) {
		const item = obj(rawItem);
		for (const method of METHODS) {
			if (!item[method]) continue;
			const op = obj(item[method]);
			const tag = str((op.tags as unknown[] | undefined)?.[0]);
			const parameters = [
				...((item.parameters as unknown[]) ?? []),
				...((op.parameters as unknown[]) ?? []),
			];
			const entry: ApiOp = {
				method: method.toUpperCase(),
				path,
				summary: str(op.summary) || str(op.operationId),
				tag,
				parameters: parameters.map((p) => param(root, p)),
				responses: Object.entries(obj(op.responses)).map(([status, r]) => ({
					status,
					description: str(deref(root, r).description),
				})),
				body: Boolean(op.requestBody) || root.swagger !== undefined,
			};
			groups.set(tag, [...(groups.get(tag) ?? []), entry]);
		}
	}
	return {
		doc: {
			title: str(obj(root.info).title),
			version: str(obj(root.info).version),
			servers: ((root.servers as unknown[]) ?? []).map((s) => str(obj(s).url)).filter(Boolean),
			groups: [...groups].map(([tag, ops]) => ({ tag, ops })),
		},
	};
}

export type TryRequest = { url: string; method: string; body?: string };

/** The request for one call: path params fill the path, query params join the URL. */
export function buildRequest(
	server: string,
	method: string,
	path: string,
	params: ApiParam[],
	values: Record<string, string>,
	body: string,
): TryRequest {
	let p = path;
	const query = new URLSearchParams();
	for (const prm of params) {
		const v = values[prm.name] ?? "";
		if (prm.in === "path") p = p.replace(`{${prm.name}}`, encodeURIComponent(v));
		else if (prm.in === "query" && v) query.set(prm.name, v);
	}
	const qs = query.toString();
	const hasBody = !["GET", "HEAD"].includes(method) && body.trim() !== "";
	return {
		url: `${server.replace(/\/$/, "")}${p}${qs ? `?${qs}` : ""}`,
		method,
		...(hasBody ? { body } : {}),
	};
}
