import { useState } from "react";
import {
	type Artifact,
	DESIGN_DIR,
	ofKind,
	slug,
	TEMPLATE,
	useDesignActions,
	useDesignList,
} from "@/lib/design";
import { format, useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { Dialog } from "@/ui/organisms/dialog";
import type { ApiDoc, ApiOp, TryRequest } from "@/ui/organisms/openapi";
import { OpenApiView } from "@/ui/organisms/openapi-view";
import { TryPanel } from "@/ui/organisms/try-panel";
import { FileFrame } from "./frame";
import { ArtifactTab } from "./tab";

type Pending = { method: string; server: string; go: () => void; cancel: () => void };

/**
 * The try panel of one operation. A GET goes out at once. Any other method waits for one click
 * on the dialog that names the server (Q-039, option 1).
 */
function Try({ a, op, doc }: { a: Artifact; op: ApiOp; doc: ApiDoc }) {
	const { t } = useI18n();
	const act = useDesignActions();
	const [pending, setPending] = useState<Pending | null>(null);

	const send = (r: TryRequest, server: string) => {
		// The panel joins the server and the path. The command wants them apart.
		const call = () =>
			act.send({
				path: a.path,
				server,
				method: r.method,
				route: r.url.slice(server.replace(/\/$/, "").length),
				body: r.body ?? null,
			});
		if (r.method === "GET") return call();
		return new Promise<Awaited<ReturnType<typeof call>>>((resolve, reject) =>
			setPending({
				method: r.method,
				server,
				go: () => call().then(resolve, reject),
				cancel: () => reject(new Error(t.design.api.cancelled)),
			}),
		);
	};

	return (
		<>
			<TryPanel
				servers={doc.servers}
				method={op.method}
				path={op.path}
				params={op.parameters}
				onSend={send}
				labels={t.design.api}
			/>
			{pending ? (
				<Dialog
					open
					onOpenChange={() => {
						pending.cancel();
						setPending(null);
					}}
					title={format(t.design.api.confirm, { method: pending.method, server: pending.server })}
					actions={
						<Button
							variant="primary"
							onClick={() => {
								pending.go();
								setPending(null);
							}}
						>
							{t.design.api.send}
						</Button>
					}
				>
					<span />
				</Dialog>
			) : null}
		</>
	);
}

/** Design / API: the OpenAPI contracts, grouped by tag, with a try panel (REQ-011 to REQ-013). */
export function Api() {
	const { t } = useI18n();
	const list = useDesignList().data;
	const act = useDesignActions();
	const rows = ofKind(list, "api");
	return (
		<ArtifactTab
			title={t.tabs.design.api}
			noun={t.design.noun.api}
			rows={rows.map((a) => ({ ref: a.reference, title: a.title, tag: a.version, issue: a.issue }))}
			create={{
				run: async (name) => {
					const s = slug(name);
					await act.create(`${DESIGN_DIR.api}/${s}.yaml`, TEMPLATE.api(name));
					return `api:${s}`;
				},
			}}
		>
			{(row) => {
				const a = rows.find((x) => x.reference === row.ref);
				return a ? (
					<FileFrame path={a.path} refId={a.reference} title={a.title} issue={a.issue} readOnly>
						{(file, onError) => (
							<OpenApiView
								source={file.saved}
								labels={t.design.api}
								onError={onError}
								tryPanel={(op, doc) => <Try a={a} op={op} doc={doc} />}
							/>
						)}
					</FileFrame>
				) : null;
			}}
		</ArtifactTab>
	);
}
