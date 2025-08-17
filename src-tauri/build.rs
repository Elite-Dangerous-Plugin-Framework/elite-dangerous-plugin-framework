use std::io::{self, Read};
use std::{env, fs::File, io::Write, path::PathBuf};

use sha2::{digest, Digest};
const EMBEDDED_BUN_VERSION: &str = "1.2.20";

fn main() {
    println!("cargo::rerun-if-changed=build.rs");
    let target = env::var("TARGET").unwrap();
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

    let platform = if target.contains("windows") {
        "windows"
    } else if target.contains("linux") {
        "linux"
    } else if target.contains("darwin") {
        "darwin"
    } else {
        panic!("Unsupported platform: {}", target);
    };

    let url = format!(
        "https://github.com/oven-sh/bun/releases/download/bun-v{EMBEDDED_BUN_VERSION}/bun-{platform}-x64.zip",
    );

    let resp = ureq::get(&url)
        .call()
        .unwrap_or_else(|_| panic!("Failed to download bun: {}", &url));
    let mut reader = resp.into_body().into_reader();

    let zip_path = out_dir.join("bun.zip");

    let mut buffer = [0u8; 8192];
    let mut file = File::create(&zip_path).expect("failed to open zip path");
    let mut digest = sha2::Sha256::default();
    loop {
        let bytes_read = reader
            .read(&mut buffer)
            .expect("failed to read from reader");
        if bytes_read == 0 {
            break; // EOF
        }
        digest
            .write_all(&buffer[..bytes_read])
            .expect("failed to write to digest");
        file.write_all(&buffer[..bytes_read])
            .expect("failed to write to file");
    }
    let digest = digest.finalize();

    let mut hash = File::create(out_dir.join("bun.zip.sha256")).expect("failed to create sha file");
    hash.write_all(&digest).expect("failed to write hash");

    tauri_build::build()
}
