// Browser stub for node:fs — only the synchronous helpers likec4 references
// from its filesystem paths (never hit under fromSource()).
export const mkdirSync = () => undefined;
export const statSync = () => {
	throw new Error("fs.statSync is not available in the browser");
};
export const existsSync = () => false;
export const readFileSync = () => {
	throw new Error("fs.readFileSync is not available in the browser");
};
export const writeFileSync = () => undefined;

// langium's node FileSystemProvider references fs.promises (unused under
// fromSource); provide a matching object so the binding is defined.
const fail = async () => {
	throw new Error("fs.promises is not available in the browser");
};
export const promises = {
	readFile: fail,
	writeFile: async () => undefined,
	mkdir: async () => undefined,
	readdir: async () => [],
	stat: fail,
	access: fail,
};

export default {
	mkdirSync,
	statSync,
	existsSync,
	readFileSync,
	writeFileSync,
	promises,
};
