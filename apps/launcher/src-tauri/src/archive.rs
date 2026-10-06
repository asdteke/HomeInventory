//! Archive extraction helpers (zip, tar.gz and the hardened managed-app extractor).

use std::{
    fs::{self, File},
    path::Path,
};

pub(crate) fn extract_zip(archive_path: &Path, dest_dir: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|e| format!("Failed to open zip: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {e}"))?;
    archive
        .extract(dest_dir)
        .map_err(|e| format!("Failed to extract zip: {e}"))?;
    Ok(())
}

pub(crate) fn extract_tar_gz(archive_path: &Path, dest_dir: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|e| format!("Failed to open tar.gz: {e}"))?;
    let tar = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(tar);
    archive
        .unpack(dest_dir)
        .map_err(|e| format!("Failed to unpack tar.gz: {e}"))?;
    Ok(())
}

pub(crate) fn extract_archive(archive_path: &Path, staging_dir: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|e| format!("Failed to open archive: {e}"))?;
    let tar = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(tar);

    let mut cumulative_size: u64 = 0;
    let max_cumulative_size: u64 = 300 * 1024 * 1024;
    let max_file_size: u64 = 50 * 1024 * 1024;

    fs::create_dir_all(staging_dir).map_err(|e| format!("Failed to create staging dir: {e}"))?;
    let canonical_staging = fs::canonicalize(staging_dir)
        .map_err(|e| format!("Failed to canonicalize staging dir: {e}"))?;

    for entry_result in archive
        .entries()
        .map_err(|e| format!("Failed to read archive entries: {e}"))?
    {
        let mut entry = entry_result.map_err(|e| format!("Failed to get entry: {e}"))?;
        let path = entry
            .path()
            .map_err(|e| format!("Failed to get entry path: {e}"))?
            .to_path_buf();

        if path.is_absolute() {
            return Err(format!(
                "Security failure: Absolute path detected in archive: {:?}",
                path
            ));
        }

        for component in path.components() {
            if let std::path::Component::ParentDir = component {
                return Err(format!(
                    "Security failure: Path traversal detected in archive: {:?}",
                    path
                ));
            }
        }

        let entry_type = entry.header().entry_type();
        if entry_type.is_symlink() || entry_type.is_hard_link() {
            return Err(format!(
                "Security failure: Symlinks or hardlinks are not allowed: {:?}",
                path
            ));
        }

        if !entry_type.is_file() && !entry_type.is_dir() {
            return Err(format!(
                "Security failure: Unsupported entry type: {:?}",
                path
            ));
        }

        let file_size = entry.size();
        if file_size > max_file_size {
            return Err(format!(
                "Security failure: File too large in archive ({} bytes): {:?}",
                file_size, path
            ));
        }
        cumulative_size += file_size;
        if cumulative_size > max_cumulative_size {
            return Err(format!(
                "Security failure: Cumulative archive size limit exceeded ({} bytes)",
                cumulative_size
            ));
        }

        entry
            .unpack_in(&canonical_staging)
            .map_err(|e| format!("Failed to unpack entry {:?}: {e}", path))?;
    }

    Ok(())
}
