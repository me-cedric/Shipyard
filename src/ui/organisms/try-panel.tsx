import { useState } from "react";
import { Badge } from "../atoms/badge";
import { Button } from "../atoms/button";
import { Input } from "../atoms/input";
import { Select } from "../atoms/select";
import { Textarea } from "../atoms/textarea";
import { type ApiParam, buildRequest, type TryRequest } from "./openapi";

export type TryResponse = { status: number; body: string };

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m }));

/**
 * Call an endpoint. The caller sends the request: this panel builds it and shows the status and
 * the body, or the failure.
 */
export function TryPanel({
	servers,
	method: initialMethod,
	path: initialPath,
	params,
	onSend,
	labels,
}: {
	servers: string[];
	method: string;
	path: string;
	params: ApiParam[];
	onSend: (request: TryRequest, server: string) => Promise<TryResponse>;
	labels: {
		server: string;
		method: string;
		path: string;
		body: string;
		send: string;
		status: string;
		failure: string;
	};
}) {
	const [server, setServer] = useState(servers[0] ?? "");
	const [method, setMethod] = useState(initialMethod);
	const [path, setPath] = useState(initialPath);
	const [values, setValues] = useState<Record<string, string>>({});
	const [body, setBody] = useState("");
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<{ response?: TryResponse; failure?: string } | null>(null);

	const send = async () => {
		setBusy(true);
		try {
			setResult({
				response: await onSend(buildRequest(server, method, path, params, values, body), server),
			});
		} catch (e) {
			setResult({ failure: e instanceof Error ? e.message : String(e) });
		} finally {
			setBusy(false);
		}
	};

	return (
		<form
			aria-label={labels.send}
			className="flex flex-col gap-2"
			onSubmit={(e) => {
				e.preventDefault();
				void send();
			}}
		>
			<div className="flex items-end gap-2">
				<Select
					caption
					label={labels.server}
					items={servers.map((s) => ({ value: s, label: s }))}
					value={server}
					onValueChange={setServer}
					className="max-w-64"
				/>
				<Select
					caption
					label={labels.method}
					items={METHODS}
					value={method}
					onValueChange={setMethod}
				/>
				<div className="min-w-0 flex-1">
					<Input
						caption
						label={labels.path}
						value={path}
						onChange={(e) => setPath(e.target.value)}
					/>
				</div>
			</div>
			{params.length ? (
				<div className="grid grid-cols-2 gap-2">
					{params.map((p) => (
						<Input
							key={`${p.in}.${p.name}`}
							caption
							label={p.name}
							required={p.required}
							value={values[p.name] ?? ""}
							onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}
						/>
					))}
				</div>
			) : null}
			{!["GET", "HEAD"].includes(method) ? (
				<Textarea
					caption
					label={labels.body}
					value={body}
					onChange={(e) => setBody(e.target.value)}
					className="font-mono"
				/>
			) : null}
			<div>
				<Button type="submit" variant="primary" disabled={busy || !server}>
					{labels.send}
				</Button>
			</div>
			{result?.failure ? (
				<p role="alert" className="text-ui text-danger-text">
					{labels.failure}: {result.failure}
				</p>
			) : null}
			{result?.response ? (
				<output className="flex flex-col gap-1">
					<span className="flex items-center gap-2 text-12 text-n-11">
						{labels.status}
						<Badge variant={result.response.status < 400 ? "success" : "danger"}>
							{result.response.status}
						</Badge>
					</span>
					<pre className="max-h-64 overflow-auto rounded-md border border-n-7 bg-n-1 p-2 font-mono text-12">
						{result.response.body}
					</pre>
				</output>
			) : null}
		</form>
	);
}
