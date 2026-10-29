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
        _ => println!("shipyard {}", env!("CARGO_PKG_VERSION")),
    }
}
