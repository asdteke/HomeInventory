//! In-memory launcher log buffer and child-process output streaming.

use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
};

use crate::config::LOG_LIMIT;
use crate::state::LauncherState;
use crate::types::LogEntry;
use crate::util::now;

pub(crate) fn stream_process_output(
    state: &LauncherState,
    source: &'static str,
    pipe: Option<impl std::io::Read + Send + 'static>,
    level: &'static str,
    log_dir: Option<PathBuf>,
) {
    let Some(pipe) = pipe else {
        return;
    };
    let logs = state.logs.clone();
    thread::spawn(move || {
        let reader = BufReader::new(pipe);
        for line in reader.lines().map_while(Result::ok) {
            if let Some(ref dir) = log_dir {
                let log_file_path = dir.join(format!("{}.log", source));
                if let Ok(mut file) = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(log_file_path)
                {
                    use std::io::Write;
                    let _ = writeln!(file, "[{}] [{}] {}", now(), level, line);
                }
            }
            push_log(
                &logs,
                LogEntry {
                    timestamp: now(),
                    source: source.to_string(),
                    level: level.to_string(),
                    message: line,
                },
            );
        }
    });
}

pub(crate) fn append_log(state: &LauncherState, source: &str, level: &str, message: &str) {
    if let Ok(mut logs) = state.logs.lock() {
        push_log_inner(
            &mut logs,
            LogEntry {
                timestamp: now(),
                source: source.to_string(),
                level: level.to_string(),
                message: message.to_string(),
            },
        );
    }
}

pub(crate) fn append_process_output(
    state: &LauncherState,
    source: &str,
    bytes: &[u8],
    level: &str,
) {
    let text = String::from_utf8_lossy(bytes);
    for line in text.lines().filter(|line| !line.trim().is_empty()) {
        append_log(state, source, level, line);
    }
}

pub(crate) fn push_log(logs: &Arc<Mutex<Vec<LogEntry>>>, entry: LogEntry) {
    if let Ok(mut logs) = logs.lock() {
        push_log_inner(&mut logs, entry);
    }
}

pub(crate) fn push_log_inner(logs: &mut Vec<LogEntry>, entry: LogEntry) {
    logs.push(entry);
    if logs.len() > LOG_LIMIT {
        let overflow = logs.len() - LOG_LIMIT;
        logs.drain(0..overflow);
    }
}
