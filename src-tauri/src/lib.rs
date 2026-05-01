use base64::{engine::general_purpose, Engine as _};

#[tauri::command]
fn load_scenario(path: String) -> Result<serde_json::Value, String> {
    let index_path = std::path::Path::new(&path).join("index.json");
    let content = std::fs::read_to_string(&index_path)
        .map_err(|e| format!("Не удалось прочитать index.json: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Ошибка парсинга JSON: {}", e))
}

#[tauri::command]
fn read_image(path: String) -> Result<String, String> {
    let data = std::fs::read(&path)
        .map_err(|e| format!("Не удалось прочитать изображение: {}", e))?;
    let b64 = general_purpose::STANDARD.encode(&data);
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_scenario, read_image])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
