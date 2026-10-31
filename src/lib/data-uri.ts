/** A `data:` address of bytes, in chunks: one spread of a large array overflows the stack. */
export function dataUri(mime: string, bytes: number[]): string {
	let s = "";
	for (let i = 0; i < bytes.length; i += 0x8000)
		s += String.fromCharCode(...bytes.slice(i, i + 0x8000));
	return `data:${mime};base64,${btoa(s)}`;
}
