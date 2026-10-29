//! An HTTP model provider as a run (spec `factory`, REQ-015). A provider has no tools and never
//! edits a repository: the run is one answer, as `Text`, then `Usage` and `Exit`.

use super::*;
use crate::runners::ModelProvider;
use shipyard_http::Http;
use shipyard_secrets::{SecretStore, conn_account};

/// Ask `provider` the brief on a thread. Cancel drops the answer: the blocking call cannot be
/// interrupted, but its text never reaches the log. The key never reaches an event.
pub fn run_provider(
    provider: ModelProvider,
    http: Arc<dyn Http>,
    store: Arc<dyn SecretStore>,
    prompt: String,
) -> Run {
    thread_run(move |cancel, tx| {
        let key: Vec<Secret> = store
            .get(&conn_account(&provider.id))
            .ok()
            .flatten()
            .into_iter()
            .collect();
        let send = |e: Event| {
            let _ = tx.send(scrub_event(e, &key));
        };
        send(Event::Turn);
        let result = provider.chat_full(&*http, &*store, &prompt);
        if cancel.is_cancelled() {
            return send(Event::Exit {
                code: None,
                cancelled: true,
            });
        }
        let code = match result {
            Ok(chat) => {
                send(Event::Text { text: chat.text });
                send(Event::Usage {
                    input_tokens: chat.input_tokens,
                    output_tokens: chat.output_tokens,
                    cached_tokens: 0,
                    cost_usd: None,
                });
                0
            }
            Err(e) => {
                send(Event::Error {
                    message: e.to_string(),
                });
                1
            }
        };
        send(Event::Exit {
            code: Some(code),
            cancelled: false,
        });
    })
}
