use chrono::Utc;
use reqwest::blocking::multipart::{Form, Part};
use serde::Serialize;
use std::sync::OnceLock;

static WEBHOOK_URL: OnceLock<String> = OnceLock::new();
static SAVES_DIR: OnceLock<String> = OnceLock::new();
static ACTIVE_SAVE_ID: OnceLock<String> = OnceLock::new();

pub fn init(webhook_url: String) {
    log::info!("[error_reporter] Initializing with webhook URL (length={})", webhook_url.len());
    let _ = WEBHOOK_URL.set(webhook_url);

    let url = WEBHOOK_URL.get().unwrap().clone();
    std::thread::spawn(move || {
        let payload = serde_json::json!({
            "embeds": [{
                "title": "OLM Error Reporter Active",
                "description": "Error reporting is now live. All panics and command errors will be sent here.",
                "color": 0x00FF00,
                "footer": { "text": "OLM" }
            }]
        });
        let body = serde_json::to_string(&payload).unwrap_or_default();
        match reqwest::blocking::Client::new()
            .post(&url)
            .header("Content-Type", "application/json")
            .body(body)
            .send() {
                Ok(resp) => log::info!("[error_reporter] Test webhook sent: status={}", resp.status()),
                Err(e) => log::error!("[error_reporter] Test webhook failed: {}", e),
            }
    });
}

pub fn set_saves_dir(path: String) {
    log::info!("[error_reporter] Setting saves dir: {}", path);
    let _ = SAVES_DIR.set(path);
}

pub fn set_active_save_id(save_id: String) {
    log::info!("[error_reporter] Setting active save ID: {}", save_id);
    let _ = ACTIVE_SAVE_ID.set(save_id);
}

#[derive(Serialize)]
struct DiscordPayload {
    embeds: Vec<DiscordEmbed>,
}

#[derive(Serialize)]
struct DiscordEmbed {
    title: String,
    description: String,
    color: u32,
    fields: Vec<DiscordEmbedField>,
    timestamp: String,
    footer: DiscordEmbedFooter,
}

#[derive(Serialize)]
struct DiscordEmbedField {
    name: String,
    value: String,
    inline: bool,
}

#[derive(Serialize)]
struct DiscordEmbedFooter {
    text: String,
}

fn build_embed(
    title: &str,
    description: &str,
    color: u32,
    command: Option<&str>,
    details: Option<&str>,
) -> DiscordEmbed {
    let mut fields = vec![
        DiscordEmbedField {
            name: "Version".to_string(),
            value: env!("CARGO_PKG_VERSION").to_string(),
            inline: true,
        },
        DiscordEmbedField {
            name: "OS".to_string(),
            value: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
            inline: true,
        },
    ];

    if let Some(cmd) = command {
        fields.push(DiscordEmbedField {
            name: "Command".to_string(),
            value: format!("```{}```", cmd),
            inline: false,
        });
    }

    if let Some(d) = details {
        let truncated = if d.len() > 1000 {
            format!("{}...[truncated]", &d[..1000])
        } else {
            d.to_string()
        };
        fields.push(DiscordEmbedField {
            name: "Details".to_string(),
            value: format!("```{}```", truncated),
            inline: false,
        });
    }

    DiscordEmbed {
        title: title.to_string(),
        description: format!("```{}```", description),
        color,
        fields,
        timestamp: Utc::now().to_rfc3339(),
        footer: DiscordEmbedFooter {
            text: "OLM Error Reporter".to_string(),
        },
    }
}

fn find_save_file() -> Option<(String, Vec<u8>)> {
    let Some(saves_dir) = SAVES_DIR.get() else {
        return None;
    };
    let Some(save_id) = ACTIVE_SAVE_ID.get() else {
        return None;
    };
    let db_filename = format!("{}.db", save_id);
    let path = std::path::Path::new(saves_dir).join(&db_filename);
    if path.exists() {
        if let Ok(bytes) = std::fs::read(&path) {
            if bytes.len() < 10 * 1024 * 1024 {
                return Some((db_filename, bytes));
            } else {
                log::warn!("[error_reporter] Save file too large to attach ({} bytes)", bytes.len());
            }
        }
    } else {
        log::warn!("[error_reporter] Save file not found: {:?}", path);
    }
    None
}

fn send_webhook_with_save(embed: DiscordEmbed, save_file: Option<(String, Vec<u8>)>) {
    let Some(webhook_url) = WEBHOOK_URL.get() else {
        log::error!("[error_reporter] Webhook URL not set, cannot send");
        return;
    };

    let url = webhook_url.clone();

    std::thread::spawn(move || {
        if let Some((filename, bytes)) = save_file {
            let payload_json = serde_json::to_string(&DiscordPayload {
                embeds: vec![embed],
            })
            .unwrap_or_default();

            let part = Part::bytes(bytes)
                .file_name(filename)
                .mime_str("application/json")
                .expect("valid MIME type");

            let form = Form::new()
                .text("payload_json", payload_json)
                .part("file", part);

            match reqwest::blocking::Client::new()
                .post(&url)
                .multipart(form)
                .send() {
                    Ok(resp) => log::info!("[error_reporter] Sent to Discord with save file: status={}", resp.status()),
                    Err(e) => log::error!("[error_reporter] Failed to send to Discord with save file: {}", e),
                }
        } else {
            let payload = DiscordPayload { embeds: vec![embed] };
            let body = serde_json::to_string(&payload).unwrap_or_default();
            match reqwest::blocking::Client::new()
                .post(&url)
                .header("Content-Type", "application/json")
                .body(body)
                .send() {
                    Ok(resp) => log::info!("[error_reporter] Sent to Discord: status={}", resp.status()),
                    Err(e) => log::error!("[error_reporter] Failed to send to Discord: {}", e),
                }
        }
    });
}

pub fn send_panic(info: &std::panic::PanicHookInfo<'_>) {
    let message = if let Some(s) = info.payload().downcast_ref::<&str>() {
        s.to_string()
    } else if let Some(s) = info.payload().downcast_ref::<String>() {
        s.clone()
    } else {
        "Unknown panic".to_string()
    };

    let location = info
        .location()
        .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
        .unwrap_or_else(|| "unknown".to_string());

    let details = format!(
        "PANIC at {}\n\nBacktrace:\n{}",
        location,
        std::backtrace::Backtrace::force_capture()
    );

    log::error!("[error_reporter] PANIC: {} at {}", message, location);

    let embed = build_embed("Panic", &message, 0xFF0000, None, Some(&details));
    let save_file = find_save_file();
    send_webhook_with_save(embed, save_file);
}

pub fn send_command_error(command: &str, error: &str) {
    log::error!("[error_reporter] Command '{}' error: {}", command, error);
    let embed = build_embed("Command Error", error, 0xFFA500, Some(command), None);
    let save_file = find_save_file();
    send_webhook_with_save(embed, save_file);
}

#[macro_export]
macro_rules! report_err {
    ($result:expr, $command:expr) => {
        match $result {
            Ok(v) => Ok(v),
            Err(e) => {
                crate::error_reporter::send_command_error($command, &e);
                Err(e)
            }
        }
    };
}

pub fn track<T>(command: &str, result: Result<T, String>) -> Result<T, String> {
    match result {
        Ok(v) => Ok(v),
        Err(ref e) => {
            log::error!("[error_reporter] Command '{}' failed: {}", command, e);
            send_command_error(command, e);
            Err(e.clone())
        }
    }
}
