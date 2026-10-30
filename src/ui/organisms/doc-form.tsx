import { useState } from "react";
import { Input } from "../atoms/input";
import { Select } from "../atoms/select";
import { Textarea } from "../atoms/textarea";
import { field, joinBody, sections, setField, setSection, trimBody } from "./doc-parts";

/**
 * One section body. It keeps its own text, so a blank line typed at the end stays. A change of
 * the file from outside the field resets it.
 */
function SectionField({
	heading,
	body,
	readOnly,
	onChange,
}: {
	heading: string;
	body: string;
	readOnly?: boolean;
	onChange: (body: string) => void;
}) {
	const [parts, setParts] = useState(() => trimBody(body));
	const [value, setValue] = useState(parts.core);
	if (joinBody(parts, value) !== body) {
		const next = trimBody(body);
		setParts(next);
		setValue(next.core);
	}
	return (
		<Textarea
			label={heading}
			caption
			value={value}
			readOnly={readOnly}
			rows={Math.max(3, value.split("\n").length + 1)}
			onChange={(e) => {
				setValue(e.target.value);
				onChange(joinBody(parts, e.target.value));
			}}
		/>
	);
}

/**
 * A markdown record as a form: the title, a status picker, the people and one field for each `## `
 * section. Each change gives the whole text back; the parts that the form does not show stay as
 * they are. A field shows only when the file holds its line.
 */
export function DocForm({
	text,
	onChange,
	statuses,
	statusLabel,
	readOnly,
	labels,
}: {
	text: string;
	onChange: (text: string) => void;
	/** The values of the status picker. The value in the file is always one of them. */
	statuses: string[];
	/** The shown name of a status value. */
	statusLabel?: Record<string, string>;
	readOnly?: boolean;
	labels: { form: string; title: string; status: string; people: string };
}) {
	const title = field(text, "title");
	const status = field(text, "status");
	const people = field(text, "people");
	const list = people ? /^\[(.*)\]$/.exec(people.value.trim()) : null;
	const values =
		status && !statuses.includes(status.value) ? [status.value, ...statuses] : statuses;
	return (
		<form
			aria-label={labels.form}
			onSubmit={(e) => e.preventDefault()}
			className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto"
		>
			{title ? (
				<Input
					label={labels.title}
					caption
					value={title.value}
					readOnly={readOnly}
					onChange={(e) => onChange(setField(text, "title", e.target.value))}
				/>
			) : null}
			{status || people ? (
				<div className="flex flex-wrap items-end gap-3">
					{status ? (
						<Select
							label={labels.status}
							caption
							disabled={readOnly}
							value={status.value}
							items={values.map((v) => ({ value: v, label: statusLabel?.[v] ?? v }))}
							onValueChange={(v) => onChange(setField(text, "status", v))}
						/>
					) : null}
					{people ? (
						<div className="min-w-60 flex-1">
							<Input
								label={labels.people}
								caption
								value={list ? (list[1] ?? "") : people.value}
								readOnly={readOnly}
								onChange={(e) =>
									onChange(setField(text, "people", list ? `[${e.target.value}]` : e.target.value))
								}
							/>
						</div>
					) : null}
				</div>
			) : null}
			{sections(text).map((s, i) => (
				<SectionField
					// biome-ignore lint/suspicious/noArrayIndexKey: two sections can have the same heading.
					key={`${i}:${s.heading}`}
					heading={s.heading}
					body={s.body}
					readOnly={readOnly}
					onChange={(b) => onChange(setSection(text, i, b))}
				/>
			))}
		</form>
	);
}
