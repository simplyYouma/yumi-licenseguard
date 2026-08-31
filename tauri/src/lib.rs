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
    //   • Windows  → UUID matériel SMBIOS via CIM (Win32_ComputerSystemProduct),
    //                mémorisé dans app_data_dir et revalidé à chaque lancement.
    //                Stable cross-reboot ; ne change QUE si la carte mère
    //                change — comportement attendu pour une licence par
    //                machine. Voir `candidats_machine` : l'identité ne doit
    //                jamais dépendre de l'outil système encore installé.
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

    /// ═══ AUCUNE CONSOLE NOIRE NE DOIT CLIGNOTER À L'ÉCRAN ═══
    ///
    /// Sur Windows, lancer `powershell`, `wmic` ou `reg` depuis une
    /// application graphique ouvre une VRAIE fenêtre de console — elle
    /// apparaît, clignote et se referme. Personne ne sait d'où elle vient, et
    /// dans un magasin, devant un client, ça a l'air d'un incident (constaté
    /// par Youma le 31/08/2026 : « des fenêtres qui se lancent et se ferment,
    /// je ne connais pas la cause »).
    ///
    /// `CREATE_NO_WINDOW` demande au système de créer le processus SANS
    /// console. C'est la règle déjà appliquée dans les POS (voir
    /// `pare_feu.rs`) ; elle manquait ici, où l'identifiant machine se lit
    /// justement par ces commandes.
    #[cfg(target_os = "windows")]
    const SANS_FENETRE: u32 = 0x0800_0000;

    /// Un identifiant n'est retenu que s'il ressemble vraiment à un UUID
    /// matériel. Le « zéro absolu » est renvoyé par certaines cartes mères
    /// OEM : il désignerait alors TOUTES ces machines à la fois.
    #[cfg(target_os = "windows")]
    fn identifiant_plausible(brut: &str) -> Option<String> {
        let v = brut.trim().to_uppercase();
        if v.len() < 8 || !v.contains('-') {
            return None;
        }
        if v.chars().all(|c| c == '0' || c == '-') {
            return None;
        }
        Some(v)
    }

    /// TOUS les identifiants lisibles sur cette machine, du plus fiable au
    /// moins fiable. La liste sert deux fois : le premier élément devient
    /// l'identité, et l'ensemble sert à VALIDER une identité mémorisée.
    #[cfg(target_os = "windows")]
    fn candidats_machine() -> Vec<String> {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        let mut trouves: Vec<String> = Vec::new();

        // 1. L'UUID de la carte mère (SMBIOS), via CIM.
        //
        // ═══ POURQUOI PLUS PAR `wmic` ═══
        //
        // C'est ici que tout s'est joué. `wmic csproduct get uuid` a rendu
        // cet UUID pendant des années — puis Microsoft a RETIRÉ wmic de
        // Windows 11. Du jour au lendemain, sur une machine parfaitement
        // inchangée, la commande n'existe plus : le code tombait sur la
        // source suivante et rendait un identifiant TOTALEMENT DIFFÉRENT.
        // La licence activée ne correspondait alors plus à rien et le POS
        // réclamait une nouvelle activation (constaté par Youma le
        // 29/08/2026 : sa machine annonçait 21C090F9… là où le Hub
        // connaissait 4391823F…).
        //
        // `Get-CimInstance Win32_ComputerSystemProduct` interroge la MÊME
        // donnée SMBIOS et rend EXACTEMENT le même UUID : les machines déjà
        // activées retrouvent donc leur identité, sans rien réactiver.
        if let Ok(output) = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID",
            ])
            .creation_flags(SANS_FENETRE)
            .output()
        {
            if let Some(v) = identifiant_plausible(&String::from_utf8_lossy(&output.stdout)) {
                trouves.push(v);
            }
        }

        // 2. wmic, pour les Windows anciens où PowerShell est bridé. Rend la
        //    même valeur que la source 1 quand il existe encore.
        if let Ok(output) = Command::new("wmic")
            .args(["csproduct", "get", "uuid"])
            .creation_flags(SANS_FENETRE)
            .output()
        {
            let raw = String::from_utf8_lossy(&output.stdout).replace("UUID", "");
            if let Some(v) = identifiant_plausible(&raw) {
                if !trouves.contains(&v) {
                    trouves.push(v);
                }
            }
        }

        // 3. MachineGuid — identité de l'INSTALLATION de Windows, pas du
        //    matériel : elle est régénérée par une réinstallation du système.
        //    Dernier recours, jamais un premier choix.
        if let Ok(output) = Command::new("reg")
            .args([
                "query",
                "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography",
                "/v",
                "MachineGuid",
            ])
            .creation_flags(SANS_FENETRE)
            .output()
        {
            let result = String::from_utf8_lossy(&output.stdout);
            if let Some(dernier) = result.split_whitespace().last() {
                if let Some(v) = identifiant_plausible(dernier) {
                    if !trouves.contains(&v) {
                        trouves.push(v);
                    }
                }
            }
        }

        trouves
    }

    /// ═══ L'IDENTITÉ NE DÉPEND PLUS DE L'OUTIL DISPONIBLE ═══
    ///
    /// Le défaut de fond n'était pas le retrait de `wmic` : c'était qu'une
    /// cascade de sources DIFFÉRENTES pouvait, en silence, changer l'identité
    /// d'une machine. Le premier identifiant retenu est donc conservé dans
    /// `app_data_dir`, et réutilisé tant qu'il correspond ENCORE à l'une des
    /// sources lisibles.
    ///
    /// Cette double condition est le cœur du raisonnement :
    ///
    ///   · une source qui disparaît ne change plus rien — la mémoire tient,
    ///     et une source restante confirme qu'on est bien sur la même
    ///     machine ;
    ///   · un dossier de données recopié sur un AUTRE ordinateur ne
    ///     correspond à aucune source locale : la mémoire est rejetée et la
    ///     licence ne suit pas. Sans cette validation, copier le dossier
    ///     emporterait la licence ET son identifiant — la protection ne
    ///     servirait plus à rien, puisque `.license` vit au même endroit.
    #[cfg(target_os = "windows")]
    fn read_machine_id(app: &AppHandle) -> String {
        let candidats = candidats_machine();
        let chemin = app.path().app_data_dir().ok().map(|dir| {
            if !dir.exists() {
                let _ = fs::create_dir_all(&dir);
            }
            dir.join(".machine_id")
        });
        let memorise = chemin.as_ref().and_then(|p| {
            fs::read_to_string(p)
                .ok()
                .map(|c| c.trim().to_uppercase())
                .filter(|c| !c.is_empty())
        });

        // Une identité déjà connue, encore confirmée par le matériel, prime.
        if let Some(garde) = memorise.as_ref() {
            if candidats.iter().any(|c| c == garde) {
                return garde.clone();
            }
        }

        let Some(principal) = candidats.first().cloned() else {
            // Aucune source lisible (PowerShell bridé, session verrouillée) :
            // on préfère l'identité mémorisée à un libellé d'erreur, qui
            // ferait réclamer une activation à tort.
            return memorise.unwrap_or_else(|| "ID-MOTEUR-YUMI-NON-IDENTIFIE".to_string());
        };

        if let Some(path) = chemin.as_ref() {
            let _ = fs::write(path, &principal);
        }
        principal
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

    /// L'identité est résolue UNE FOIS par lancement.
    ///
    /// Elle ne peut pas changer pendant que l'application tourne, et chaque
    /// résolution coûte le démarrage d'un ou deux processus système. Sans ce
    /// garde-mémoire, un écran qui redemande l'identifiant relançait
    /// PowerShell — et, avant `CREATE_NO_WINDOW`, faisait clignoter une
    /// console de plus.
    static ID_MACHINE: std::sync::OnceLock<String> = std::sync::OnceLock::new();

    #[tauri::command]
    pub fn get_machine_id(app: AppHandle) -> String {
        ID_MACHINE
            .get_or_init(|| read_machine_id(&app).to_uppercase())
            .clone()
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

    // ── Auto-update Android ────────────────────────────────────────────────
    //
    // tauri-plugin-updater est desktop-only (support Android = "none", son
    // install() y est un no-op silencieux). Sur Android le flux est donc
    // porté par le package :
    //
    //   1. `get_updater_endpoint`      → JS récupère l'URL de manifeste déjà
    //      substituée ({{current_version}}, {{target}}, {{arch}}) depuis la
    //      config `plugins.updater` du POS — zéro duplication de config.
    //   2. JS fetch le manifeste (même host que le Hub, déjà dans la CSP),
    //      compare les versions et affiche la bannière habituelle.
    //   3. `download_and_install_apk`  → Rust télécharge l'APK, vérifie la
    //      signature minisign avec la pubkey updater embarquée (même niveau
    //      de garantie que le plugin desktop), écrit dans le cache app et
    //      ouvre l'installeur système (ACTION_VIEW + FileProvider). Android
    //      gère lui-même la confirmation utilisateur et, au premier usage,
    //      l'autorisation "installer des applis inconnues".
    //
    // Prérequis côté POS (appliqués par tools/apply-android-recipe.mjs) :
    // permission REQUEST_INSTALL_PACKAGES, déclaration FileProvider
    // (authority "<identifier>.yumiupdate", cache-path "updates/") et
    // dépendance androidx.core.

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct UpdaterEndpointInfo {
        pub endpoint: String,
        pub current_version: String,
    }

    #[tauri::command]
    pub fn get_updater_endpoint(app: AppHandle) -> Result<UpdaterEndpointInfo, String> {
        let version = app.package_info().version.to_string();
        let config = app.config();
        let endpoint = config
            .plugins
            .0
            .get("updater")
            .and_then(|u| u.get("endpoints"))
            .and_then(|e| e.get(0))
            .and_then(|v| v.as_str())
            .ok_or("plugins.updater.endpoints manquant dans tauri.conf.json")?;

        // Mêmes conventions de nommage que tauri-plugin-updater.
        let arch = match std::env::consts::ARCH {
            "x86" => "i686",
            "arm" => "armv7",
            other => other,
        };
        let target = match std::env::consts::OS {
            "macos" => "darwin",
            other => other,
        };

        Ok(UpdaterEndpointInfo {
            endpoint: endpoint
                .replace("{{current_version}}", &version)
                .replace("{{target}}", target)
                .replace("{{arch}}", arch),
            current_version: version,
        })
    }

    /// Vérifie une signature minisign (format tauri signer : base64 du
    /// contenu du fichier .sig / de la pubkey) sur les octets fournis.
    /// Partagé desktop/Android pour rester testable partout.
    #[cfg_attr(not(target_os = "android"), allow(dead_code))]
    fn verify_minisign(data: &[u8], signature_b64: &str, pubkey_b64: &str) -> Result<(), String> {
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD;

        let pk_text = b64
            .decode(pubkey_b64.trim())
            .ok()
            .and_then(|raw| String::from_utf8(raw).ok())
            .unwrap_or_else(|| pubkey_b64.trim().to_string());
        let sig_text = b64
            .decode(signature_b64.trim())
            .ok()
            .and_then(|raw| String::from_utf8(raw).ok())
            .unwrap_or_else(|| signature_b64.trim().to_string());

        let pk = minisign_verify::PublicKey::decode(&pk_text)
            .map_err(|e| format!("pubkey updater illisible : {e}"))?;
        let sig = minisign_verify::Signature::decode(&sig_text)
            .map_err(|e| format!("signature updater illisible : {e}"))?;
        pk.verify(data, &sig, true)
            .map_err(|e| format!("signature de l'APK invalide : {e}"))
    }

    #[cfg(not(target_os = "android"))]
    #[tauri::command]
    pub async fn download_and_install_apk(
        app: AppHandle,
        url: String,
        signature: String,
    ) -> Result<(), String> {
        let _ = (app, url, signature);
        Err("download_and_install_apk n'est disponible que sur Android — utiliser tauri-plugin-updater sur desktop.".into())
    }

    /// Drapeau d'annulation du téléchargement APK en cours — armé par la
    /// commande `cancel_apk_download` (bouton « Annuler » de l'overlay
    /// d'installation), consulté entre chaque chunk du stream.
    #[cfg(target_os = "android")]
    static APK_CANCEL: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

    /// Annule le téléchargement APK en cours (no-op s'il n'y en a pas).
    #[tauri::command]
    pub fn cancel_apk_download() {
        #[cfg(target_os = "android")]
        APK_CANCEL.store(true, std::sync::atomic::Ordering::SeqCst);
    }

    /// Payload des événements de progression émis pendant l'installation :
    /// `yumi-update-progress` { phase, downloaded, total } —
    /// phase ∈ download | verify | install.
    #[cfg(target_os = "android")]
    #[derive(Clone, serde::Serialize)]
    struct UpdateProgress {
        phase: &'static str,
        downloaded: u64,
        total: Option<u64>,
    }

    #[cfg(target_os = "android")]
    #[tauri::command]
    pub async fn download_and_install_apk(
        app: AppHandle,
        url: String,
        signature: String,
    ) -> Result<(), String> {
        use std::sync::atomic::Ordering;
        use tauri::Emitter;
        APK_CANCEL.store(false, Ordering::SeqCst);
        let emit = |phase: &'static str, downloaded: u64, total: Option<u64>| {
            let _ = app.emit("yumi-update-progress", UpdateProgress { phase, downloaded, total });
        };

        // 1. Téléchargement STREAMÉ (reqwest natif — non soumis à la politique
        //    cleartext du WebView) : progression émise chunk par chunk vers
        //    l'overlay d'installation, annulable entre deux chunks.
        eprintln!("[yumi-updater] téléchargement : {url}");
        let mut response = reqwest::get(&url)
            .await
            .map_err(|e| format!("téléchargement APK impossible : {e}"))?;
        if !response.status().is_success() {
            return Err(format!("téléchargement APK : HTTP {}", response.status()));
        }
        let total = response.content_length();
        emit("download", 0, total);
        let mut bytes: Vec<u8> = Vec::with_capacity(total.unwrap_or(0) as usize);
        {
            let mut last_emit = std::time::Instant::now();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|e| format!("lecture APK interrompue : {e}"))?
            {
                if APK_CANCEL.load(Ordering::SeqCst) {
                    return Err("Installation annulée".into());
                }
                bytes.extend_from_slice(&chunk);
                // Throttle : un événement max toutes les ~120 ms suffit pour
                // une barre fluide sans inonder le pont IPC.
                if last_emit.elapsed().as_millis() >= 120 {
                    emit("download", bytes.len() as u64, total);
                    last_emit = std::time::Instant::now();
                }
            }
        }
        emit("download", bytes.len() as u64, total.or(Some(bytes.len() as u64)));
        eprintln!("[yumi-updater] téléchargé : {} octets", bytes.len());
        if APK_CANCEL.load(Ordering::SeqCst) {
            return Err("Installation annulée".into());
        }
        emit("verify", bytes.len() as u64, total);

        // 2. Vérification minisign avec la pubkey updater du POS.
        let config = app.config();
        let pubkey = config
            .plugins
            .0
            .get("updater")
            .and_then(|u| u.get("pubkey"))
            .and_then(|v| v.as_str())
            .ok_or("plugins.updater.pubkey manquant dans tauri.conf.json")?;
        verify_minisign(&bytes, &signature, pubkey)?;
        eprintln!("[yumi-updater] signature minisign valide");

        // 3. Écriture dans <cache>/updates/ (chemin exposé par le
        //    FileProvider "<identifier>.yumiupdate", cache-path "updates/").
        let cache = app
            .path()
            .app_cache_dir()
            .map_err(|e| format!("cache dir inaccessible : {e}"))?;
        let dir = cache.join("updates");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let apk_path = dir.join("update.apk");
        fs::write(&apk_path, &bytes).map_err(|e| format!("écriture APK : {e}"))?;

        // 4. Installeur système — API PackageInstaller.Session (la même que
        //    `adb install`) via le pont JNI officiel de wry (`jni_handle`) :
        //    la closure s'exécute sur le thread Android principal avec
        //    l'Activity en main. Le flux ACTION_VIEW + FileProvider a été
        //    écarté : vérifié sur banc, le staging du content-URI peut
        //    échouer ("problem parsing the package") alors que le fichier
        //    est intègre. La Session streame les octets directement au
        //    système — pas de FileProvider, pas de staging intermédiaire.
        //    (ndk-context n'est PAS initialisé par tao/wry dans Tauri 2.)
        let path_str = apk_path.to_string_lossy().to_string();
        eprintln!("[yumi-updater] APK écrit : {path_str} — ouverture session PackageInstaller");
        emit("install", bytes.len() as u64, total);

        let webview = app
            .webview_windows()
            .into_iter()
            .next()
            .map(|(_, w)| w)
            .ok_or("aucune fenêtre webview active")?;
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
        webview
            .with_webview(move |platform_webview| {
                platform_webview.jni_handle().exec(move |env, activity, _webview| {
                    let result = android_install::install_via_session(env, activity, &path_str);
                    if result.is_err() {
                        // Une exception Java pendante casserait les appels
                        // JNI suivants — on la loggue (logcat) et on la purge.
                        let _ = env.exception_describe();
                        let _ = env.exception_clear();
                    }
                    let _ = tx.send(result);
                });
            })
            .map_err(|e| format!("with_webview : {e}"))?;

        let result = tauri::async_runtime::spawn_blocking(move || {
            rx.recv_timeout(std::time::Duration::from_secs(15))
                .map_err(|_| "délai dépassé en attendant l'installeur système".to_string())?
        })
        .await
        .map_err(|e| format!("spawn_blocking : {e}"))?;
        match &result {
            Ok(()) => eprintln!("[yumi-updater] installeur système lancé"),
            Err(e) => eprintln!("[yumi-updater] ERREUR installeur : {e}"),
        }
        result
    }

    /// JNI : installation par PackageInstaller.Session — le mécanisme
    /// qu'utilise `adb install`. On streame l'APK dans la session, puis
    /// `commit` avec un PendingIntent vers notre Activity : le système
    /// affiche sa confirmation (STATUS_PENDING_USER_ACTION relayé par le
    /// MainActivity patché via apply-android-recipe), installe, et
    /// relance l'app. Prérequis manifeste : REQUEST_INSTALL_PACKAGES.
    #[cfg(target_os = "android")]
    mod android_install {
        use jni::objects::{JObject, JValue};
        use jni::JNIEnv;
        use std::io::Read;

        const MODE_FULL_INSTALL: i32 = 1; // PackageInstaller.SessionParams
        const FLAG_UPDATE_CURRENT: i32 = 0x0800_0000; // PendingIntent
        const FLAG_MUTABLE: i32 = 0x0200_0000; // requis API 31+ : le système remplit les extras de statut

        pub fn install_via_session(
            env: &mut JNIEnv,
            context: &JObject,
            apk_path: &str,
        ) -> Result<(), String> {
            let jerr = |e: jni::errors::Error| format!("installeur système (JNI) : {e}");

            let pm = env
                .call_method(context, "getPackageManager", "()Landroid/content/pm/PackageManager;", &[])
                .and_then(|v| v.l())
                .map_err(jerr)?;
            let installer = env
                .call_method(&pm, "getPackageInstaller", "()Landroid/content/pm/PackageInstaller;", &[])
                .and_then(|v| v.l())
                .map_err(jerr)?;

            // Session en mode installation complète.
            let params = env
                .new_object(
                    "android/content/pm/PackageInstaller$SessionParams",
                    "(I)V",
                    &[JValue::Int(MODE_FULL_INSTALL)],
                )
                .map_err(jerr)?;
            let session_id = env
                .call_method(
                    &installer,
                    "createSession",
                    "(Landroid/content/pm/PackageInstaller$SessionParams;)I",
                    &[JValue::Object(&params)],
                )
                .and_then(|v| v.i())
                .map_err(jerr)?;
            let session = env
                .call_method(
                    &installer,
                    "openSession",
                    "(I)Landroid/content/pm/PackageInstaller$Session;",
                    &[JValue::Int(session_id)],
                )
                .and_then(|v| v.l())
                .map_err(jerr)?;

            // Stream de l'APK dans la session (chunks de 1 MiB).
            let size = std::fs::metadata(apk_path)
                .map_err(|e| format!("APK introuvable : {e}"))?
                .len() as i64;
            let jname = env.new_string("update.apk").map_err(jerr)?;
            let out = env
                .call_method(
                    &session,
                    "openWrite",
                    "(Ljava/lang/String;JJ)Ljava/io/OutputStream;",
                    &[JValue::Object(&jname), JValue::Long(0), JValue::Long(size)],
                )
                .and_then(|v| v.l())
                .map_err(jerr)?;

            let mut file = std::fs::File::open(apk_path)
                .map_err(|e| format!("lecture APK : {e}"))?;
            const CHUNK: usize = 1024 * 1024;
            let jbuf = env.new_byte_array(CHUNK as i32).map_err(jerr)?;
            let mut buf = vec![0u8; CHUNK];
            loop {
                let n = file.read(&mut buf).map_err(|e| format!("lecture APK : {e}"))?;
                if n == 0 {
                    break;
                }
                // &[u8] → &[i8] : même représentation mémoire, exigé par JNI.
                let signed: &[i8] =
                    unsafe { std::slice::from_raw_parts(buf.as_ptr().cast::<i8>(), n) };
                env.set_byte_array_region(&jbuf, 0, signed).map_err(jerr)?;
                env.call_method(
                    &out,
                    "write",
                    "([BII)V",
                    &[JValue::Object(&jbuf), JValue::Int(0), JValue::Int(n as i32)],
                )
                .map_err(jerr)?;
            }
            env.call_method(&session, "fsync", "(Ljava/io/OutputStream;)V", &[JValue::Object(&out)])
                .map_err(jerr)?;
            env.call_method(&out, "close", "()V", &[]).map_err(jerr)?;

            // IntentSender vers notre Activity : le système y délivrera le
            // statut (dont STATUS_PENDING_USER_ACTION → dialogue de
            // confirmation relayé par MainActivity).
            let pkg = env
                .call_method(context, "getPackageName", "()Ljava/lang/String;", &[])
                .and_then(|v| v.l())
                .map_err(jerr)?;
            let launch = env
                .call_method(
                    &pm,
                    "getLaunchIntentForPackage",
                    "(Ljava/lang/String;)Landroid/content/Intent;",
                    &[JValue::Object(&pkg)],
                )
                .and_then(|v| v.l())
                .map_err(jerr)?;
            let pending = env
                .call_static_method(
                    "android/app/PendingIntent",
                    "getActivity",
                    "(Landroid/content/Context;ILandroid/content/Intent;I)Landroid/app/PendingIntent;",
                    &[
                        JValue::Object(context),
                        JValue::Int(session_id),
                        JValue::Object(&launch),
                        JValue::Int(FLAG_UPDATE_CURRENT | FLAG_MUTABLE),
                    ],
                )
                .and_then(|v| v.l())
                .map_err(jerr)?;
            let sender = env
                .call_method(&pending, "getIntentSender", "()Landroid/content/IntentSender;", &[])
                .and_then(|v| v.l())
                .map_err(jerr)?;
            env.call_method(
                &session,
                "commit",
                "(Landroid/content/IntentSender;)V",
                &[JValue::Object(&sender)],
            )
            .map_err(jerr)?;
            Ok(())
        }
    }
}
