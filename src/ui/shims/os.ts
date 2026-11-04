// Browser shim for `node:os` (likec4 imports the default export; only used by
// filesystem/temp paths that fromSource() never touches).
export const tmpdir = () => "/tmp";
export const homedir = () => "/";
export const platform = () => "browser";
export const EOL = "\n";
export const hostname = () => "localhost";
export default { tmpdir, homedir, platform, EOL, hostname };
