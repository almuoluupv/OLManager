use log::warn;

#[tauri::command]
pub fn report_frontend_error(error: String, component: String, stack: Option<String>) {
    warn!("[frontend] Error in {}: {}", component, error);
    crate::error_reporter::send_command_error(
        &format!("frontend/{}", component),
        &stack.unwrap_or(error),
    );
}
