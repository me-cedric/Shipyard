mod bridge;

use shipyard_mcp::relay::{FLAG, run};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.as_slice() {
        // `shipyard --mcp-relay <server-id>`: an agent starts this in place of a stdio MCP server.
        [flag, server] if flag == FLAG => {
            if let Err(e) = run(server) {
                eprintln!("shipyard: {e}");
                std::process::exit(1);
            }
        }
        // `shipyard --mcp-bridge`: an agent starts this as a stdio MCP server. The URL and the
        // token come from `SHIPYARD_MCP_URL` and `SHIPYARD_MCP_TOKEN`, never from arguments.
        [flag] if flag == bridge::FLAG => {
            if let Err(e) = bridge::run() {
                eprintln!("shipyard: {e}");
                std::process::exit(1);
            }
        }
        _ => println!("shipyard {}", env!("CARGO_PKG_VERSION")),
    }
}
