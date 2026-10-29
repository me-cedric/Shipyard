import { Badge } from "../atoms/badge";
import { parseDbml } from "./dbml";
import type { EditorError } from "./error-line";
import { useRender } from "./use-render";

async function load(source: string) {
	const { data, error } = parseDbml(source);
	if (!data) throw new Error(error);
	return data;
}

/** Tables and relations of a DBML text. A broken text keeps the last good model and reports its error. */
export function DbmlView({
	source,
	labels,
	onError,
}: {
	source: string;
	labels: { pk: string; notNull: string; relations: string };
	onError?: (error: EditorError | null) => void;
}) {
	const model = useRender(source, load, onError);
	return (
		<div className="flex flex-col gap-3 overflow-auto rounded-md border border-n-7 bg-n-1 p-3">
			<div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
				{model?.tables.map((t) => (
					<section key={t.name} aria-label={t.name} className="rounded-md border border-n-7 bg-n-2">
						<h3 className="border-b border-n-7 px-2 py-1 text-ui font-medium">{t.name}</h3>
						<ul className="font-mono text-12">
							{t.fields.map((f) => (
								<li key={f.name} className="flex items-center gap-2 px-2 py-0.5">
									<span className="flex-1 truncate">{f.name}</span>
									<span className="text-n-10">{f.type}</span>
									{f.pk ? <Badge variant="accent">{labels.pk}</Badge> : null}
									{f.notNull ? <Badge>{labels.notNull}</Badge> : null}
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
			{model?.refs.length ? (
				<section aria-label={labels.relations}>
					<h3 className="py-1 text-12 font-medium text-n-11">{labels.relations}</h3>
					<ul className="font-mono text-12">
						{model.refs.map((r) => (
							<li key={`${r.from}>${r.to}`}>
								{r.from} → {r.to}
							</li>
						))}
					</ul>
				</section>
			) : null}
		</div>
	);
}
