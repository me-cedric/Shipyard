//! MCP server for the agents: the tools that a run calls. Read-only tools come first.
//! It also proxies the MCP servers of the connections ([`proxy`]) and keeps stdio servers open
//! between agent turns ([`relay`]).

pub mod proxy;
pub mod relay;
pub mod tools;
