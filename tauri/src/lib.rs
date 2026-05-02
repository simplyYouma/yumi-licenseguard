//! Yumi LicenseGuard — Tauri backend.
//!
//! Single source of truth for every Yumi POS client app:
//! - Stable hardware ID (Windows + Unix).
//! - Ed25519 signature verification against the Yumi Hub public key.
//! - Tamper-resistant license + sync metadata storage in the OS app-data dir.
//!
//! Host integration: list these commands inside the host app's
//! `tauri::generate_handler![...]` invocation. See `INTEGRATION.md`.
//!
//! Tauri requires `#[tauri::command]` items to live in their own module when
//! the crate is consumed as a library — that's why everything is in
//! `commands` below. Host apps wire it up like this:
//!
//! ```ignore
//! tauri::generate_handler![
//!     yumi_licenseguard::commands::get_machine_id,
//!     yumi_licenseguard::commands::verify_license,
//!     // …
//! ]
//! ```

pub mod commands {
    use std::fs;

    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    use tauri::{AppHandle, Manager};

    /// Yumi Hub public key (Ed25519). Same key signs licenses on the Hub
    /// (`HUB_PRIVATE_SEED` Cloudflare secret) and verifies them here.
    const HUB_PUBLIC_KEY_HEX: &str =
        "eef17a2365fe4e7d9fbad5d87741f79979e00055108be650d57ece534d53360a";

    // ── Hardware ID ────────────────────────────────────────────────────────

    #[cfg(target_os = "windows")]
    fn read_machine_id() -> String {
        use std::process::Command;

        // 1. WMIC csproduct UUID — most stable across reboots and clones.
        if let Ok(output) = Command::new("wmic")
            .args(["csproduct", "get", "uuid"])
            .output()
        {
            let raw = String::from_utf8_lossy(&output.stdout);
            let cleaned = raw.replace("UUID", "").trim().to_string();
            if !cleaned.is_empty() && cleaned != "00000000-0000-0000-0000-000000000000" {
                return cleaned;
            }
        }

        // 2. PowerShell HKLM Cryptography MachineGuid.
        if let Ok(output) = Command::new("powershell")
            .args([
                "-Command",
                "(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid",
            ])
            .output()
        {
            let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !result.is_empty() {
                return result;
            }
        }

        // 3. Reg query fallback (PowerShell unavailable / restricted).
        if let Ok(output) = Command::new("reg")
            .args([
                "query",
                "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography",
                "/v",
                "MachineGuid",
            ])
            .output()
        {
            let result = String::from_utf8_lossy(&output.stdout);
            if let Some(guid) = result.split_whitespace().last() {
                if guid.contains('-') {
                    return guid.to_string();
                }
            }
        }

        "ID-MOTEUR-YUMI-NON-IDENTIFIE".to_string()
    }

    #[cfg(not(target_os = "windows"))]
    fn read_machine_id() -> String {
        if let Ok(id) = fs::read_to_string("/etc/machine-id") {
            return id.trim().to_string();
        }
        "FALLBACK_MACHINE_ID".to_string()
    }

    #[tauri::command]
    pub fn get_machine_id() -> String {
        read_machine_id().to_uppercase()
    }

    // ── Ed25519 verification ───────────────────────────────────────────────

    #[tauri::command]
    pub fn verify_license(machine_id: String, license_key: String) -> bool {
        // Dev bypass — debug builds only. The cfg gate strips this branch
        // entirely from release binaries (cargo build --release / tauri build),
        // so production never honors it.
        #[cfg(debug_assertions)]
        if license_key == "DEV-BYPASS" {
            let _ = machine_id;
            return true;
        }

        let Ok(pub_bytes) = hex::decode(HUB_PUBLIC_KEY_HEX) else {
            return false;
        };
        if pub_bytes.len() != 32 {
            return false;
        }

        let mut pub_arr = [0u8; 32];
        pub_arr.copy_from_slice(&pub_bytes);

        let Ok(public_key) = VerifyingKey::from_bytes(&pub_arr) else {
            return false;
        };

        let Ok(sig_bytes) = hex::decode(&license_key) else {
            return false;
        };
        let Ok(signature) = Signature::from_slice(&sig_bytes) else {
            return false;
        };

        public_key
            .verify(machine_id.as_bytes(), &signature)
            .is_ok()
    }

    // ── License key storage (.license in OS app-data dir) ──────────────────

    #[tauri::command]
    pub fn get_license_key(app_handle: AppHandle) -> String {
        let Ok(data_dir) = app_handle.path().app_data_dir() else {
            return String::new();
        };
        fs::read_to_string(data_dir.join(".license"))
            .unwrap_or_default()
            .trim()
            .to_string()
    }

    #[tauri::command]
    pub fn save_license_key(app_handle: AppHandle, key: String) -> Result<(), String> {
        let data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        if !data_dir.exists() {
            fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        }
        fs::write(data_dir.join(".license"), key).map_err(|e| e.to_string())?;
        Ok(())
    }

    // ── Secure storage (anti-clock-fraud counters) ─────────────────────────

    #[tauri::command]
    pub fn get_secure_storage(app_handle: AppHandle, key: String) -> String {
        let Ok(data_dir) = app_handle.path().app_data_dir() else {
            return String::new();
        };
        fs::read_to_string(data_dir.join(format!(".{key}")))
            .unwrap_or_default()
            .trim()
            .to_string()
    }

    #[tauri::command]
    pub fn set_secure_storage(
        app_handle: AppHandle,
        key: String,
        value: String,
    ) -> Result<(), String> {
        let data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        if !data_dir.exists() {
            fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        }
        fs::write(data_dir.join(format!(".{key}")), value).map_err(|e| e.to_string())?;
        Ok(())
    }
}
