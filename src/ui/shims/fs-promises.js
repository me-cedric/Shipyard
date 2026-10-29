// Browser stub for node:fs/promises — likec4 imports these for filesystem
// workspaces/writeDSL, none of which run under fromSource().
const fail = async () => {
	throw new Error("fs/promises is not available in the browser");
};
export const readFile = fail;
export const writeFile = async () => undefined;
export const unlink = async () => undefined;
export const mkdir = async () => undefined;
export const readdir = async () => [];
export const stat = fail;
export const access = fail;
export const rm = async () => undefined;
export default {
	readFile,
	writeFile,
	unlink,
	mkdir,
	readdir,
	stat,
	access,
	rm,
};
