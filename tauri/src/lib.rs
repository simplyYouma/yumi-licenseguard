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
    //
    // Stratégie par plateforme :
    //
    //   • Windows  → UUID matériel via WMIC csproduct / registre Cryptography
    //                (stable cross-reboot, change si la carte mère change —
    //                comportement attendu pour une licence par machine)
    //   • macOS    → IOPlatformUUID via ioreg (équivalent matériel)
    //   • Linux    → /etc/machine-id (systemd, stable cross-reboot)
    //   • Android  → UUID v4 persistant dans app_data_dir. Stable
    //                cross-launch ; reset à la désinstallation. Contrat
    //                "licence par installation" — équivalent à ce que font
    //                Slack, Discord et la plupart des apps cross-platform
    //                mobiles. ANDROID_ID via JNI demanderait un build NDK
    //                non trivial pour un gain marginal.
    //   • iOS      → identique à Android. Apple décourage
    //                identifierForVendor pour les usages licence.
    //   • Fallback → "FALLBACK_MACHINE_ID" — visible au support, pas de
    //                panique runtime.
    //
    // La signature unifiée `read_machine_id(&AppHandle)` permet à
    // Android/iOS d'utiliser l'AppHandle pour persister leur UUID. Côté JS,
    // `invoke('get_machine_id')` reste inchangé — Tauri injecte
    // automatiquement l'AppHandle.

    #[cfg(target_os = "windows")]
    fn read_machine_id(_app: &AppHandle) -> String {
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

    #[cfg(target_os = "macos")]
    fn read_machine_id(_app: &AppHandle) -> String {
        use std::process::Command;
        if let Ok(output) = Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            let raw = String::from_utf8_lossy(&output.stdout);
            for line in raw.lines() {
                if line.contains("IOPlatformUUID") {
                    if let Some(eq) = line.split('=').nth(1) {
                        let id = eq.trim().trim_matches('"').to_string();
                        if !id.is_empty() {
                            return id;
                        }
                    }
                }
            }
        }
        "FALLBACK_MACHINE_ID".to_string()
    }

    #[cfg(all(
        target_family = "unix",
        not(target_os = "macos"),
        not(target_os = "android"),
        not(target_os = "ios"),
    ))]
    fn read_machine_id(_app: &AppHandle) -> String {
        if let Ok(id) = fs::read_to_string("/etc/machine-id") {
            return id.trim().to_string();
        }
        "FALLBACK_MACHINE_ID".to_string()
    }

    /// Plateformes mobiles : lit ou génère un identifiant d'installation.
    /// Stocké en clair dans `<app_data_dir>/.install_id` — l'OS isole déjà
    /// le sandbox d'app, et un chiffrement local apporterait peu (un
    /// attaquant ayant accès au sandbox a déjà accès à .license aussi).
    /// Format UUID v4. Stable cross-launch ; remis à zéro à la
    /// désinstallation (limite acceptée du modèle "licence par install").
    #[cfg(any(target_os = "android", target_os = "ios"))]
    fn read_machine_id(app: &AppHandle) -> String {
        let Ok(dir) = app.path().app_data_dir() else {
            return "FALLBACK_MACHINE_ID".to_string();
        };
        if !dir.exists() {
            let _ = fs::create_dir_all(&dir);
        }
        let path = dir.join(".install_id");

        if let Ok(existing) = fs::read_to_string(&path) {
            let trimmed = existing.trim().to_string();
            if !trimmed.is_empty() {
                return trimmed;
            }
        }

        // Première installation : on génère un UUID v4 et on le persiste.
        // Si l'écriture échoue (sandbox read-only, disque plein), on renvoie
        // quand même l'UUID en mémoire — la licence ne s'enregistrera pas
        // pour cette session mais l'app démarre.
        let id = uuid::Uuid::new_v4().to_string();
        let _ = fs::write(&path, &id);
        id
    }

    /// Plateformes non couvertes (wasm32, redox…) — libellé identifiable
    /// pour le support, sans panique runtime.
    #[cfg(not(any(
        target_os = "windows",
        target_os = "macos",
        all(target_family = "unix", not(target_os = "macos"), not(target_os = "android"), not(target_os = "ios")),
        target_os = "android",
        target_os = "ios",
    )))]
    fn read_machine_id(_app: &AppHandle) -> String {
        "UNSUPPORTED_PLATFORM".to_string()
    }

    #[tauri::command]
    pub fn get_machine_id(app: AppHandle) -> String {
        read_machine_id(&app).to_uppercase()
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
