//! OS integration: opening URLs and folders, native path pickers.

use std::{path::Path, process::Command as ProcessCommand};

pub(crate) fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = ProcessCommand::new("open");
        command.arg(url);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = ProcessCommand::new("xdg-open");
        command.arg(url);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = ProcessCommand::new("cmd");
        command.args(["/C", "start", "", url]);
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        command
    };

    command
        .spawn()
        .map_err(|err| format!("Could not open local app URL: {err}"))?;
    Ok(())
}

pub(crate) fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = ProcessCommand::new("open");
        command.arg(path);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = ProcessCommand::new("xdg-open");
        command.arg(path);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = ProcessCommand::new("explorer");
        command.arg(path);
        command
    };

    command
        .spawn()
        .map_err(|err| format!("Could not open path: {err}"))?;
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn choose_path_platform(kind: &str) -> Result<Option<String>, String> {
    let script = match kind {
        "project" => {
            "POSIX path of (choose folder with prompt \"Select a HomeInventory install folder\")"
        }
        "node" => "POSIX path of (choose file with prompt \"Select the node executable\")",
        "npm" => "POSIX path of (choose file with prompt \"Select the npm executable\")",
        _ => return Err("Unsupported path picker type.".into()),
    };
    let output = ProcessCommand::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|err| format!("Could not open macOS picker: {err}"))?;
    parse_picker_output(output)
}

#[cfg(target_os = "linux")]
pub(crate) fn choose_path_platform(kind: &str) -> Result<Option<String>, String> {
    let folder = kind == "project";
    if let Some(path) = run_linux_picker("zenity", folder)? {
        return Ok(Some(path));
    }
    if let Some(path) = run_linux_picker("kdialog", folder)? {
        return Ok(Some(path));
    }
    Err("Install zenity or kdialog to use the graphical path picker on Linux.".into())
}

#[cfg(target_os = "linux")]
pub(crate) fn run_linux_picker(program: &str, folder: bool) -> Result<Option<String>, String> {
    let output = if program == "zenity" {
        let mut command = ProcessCommand::new(program);
        command.arg("--file-selection");
        if folder {
            command.arg("--directory");
        }
        command.output()
    } else {
        let mut command = ProcessCommand::new(program);
        command.arg(if folder {
            "--getexistingdirectory"
        } else {
            "--getopenfilename"
        });
        command.output()
    };

    let Ok(output) = output else {
        return Ok(None);
    };
    parse_picker_output(output)
}

#[cfg(target_os = "windows")]
pub(crate) fn choose_path_platform(kind: &str) -> Result<Option<String>, String> {
    let script = if kind == "project" {
        r#"Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Select a HomeInventory install folder'; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }"#
    } else {
        r#"Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = 'Select the executable'; $d.Filter = 'Executables (*.exe;*.cmd;*.bat)|*.exe;*.cmd;*.bat|All files (*.*)|*.*'; if ($d.ShowDialog() -eq 'OK') { $d.FileName }"#
    };
    let mut command = ProcessCommand::new("powershell");
    command.args(["-NoProfile", "-Command", script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let output = command
        .output()
        .map_err(|err| format!("Could not open Windows picker: {err}"))?;
    parse_picker_output(output)
}

pub(crate) fn parse_picker_output(output: std::process::Output) -> Result<Option<String>, String> {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if output.status.success() {
        return Ok(if stdout.is_empty() {
            None
        } else {
            Some(stdout)
        });
    }

    let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
    if stdout.is_empty()
        && (stderr.contains("cancel")
            || stderr.contains("canceled")
            || stderr.contains("cancelled")
            || stderr.contains("user canceled")
            || output.status.code() == Some(1))
    {
        return Ok(None);
    }

    Err(format!(
        "Path picker failed: {}",
        String::from_utf8_lossy(&output.stderr).trim()
    ))
}
