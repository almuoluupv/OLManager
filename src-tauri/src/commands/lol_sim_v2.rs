use tauri::State;

use crate::application::lol_sim_v2::{
    dispose, init, reset, run_to_completion, skip_to_end, tick, LolSimV2DisposeRequest,
    LolSimV2DisposeResponse, LolSimV2ResetRequest, LolSimV2RunToCompletionRequest,
    LolSimV2RunToCompletionResponse, LolSimV2SkipToEndRequest, LolSimV2SkipToEndResponse,
    LolSimV2StateResponse, LolSimV2StoreState, LolSimV2TickRequest,
};

#[tauri::command]
pub fn lol_sim_v2_init(
    state: State<'_, LolSimV2StoreState>,
    request: crate::application::lol_sim_v2::LolSimV2InitRequest,
) -> Result<LolSimV2StateResponse, String> {
    init(&state, request)
}

#[tauri::command]
pub fn lol_sim_v2_tick(
    state: State<'_, LolSimV2StoreState>,
    request: LolSimV2TickRequest,
) -> Result<LolSimV2StateResponse, String> {
    tick(&state, request)
}

#[tauri::command]
pub fn lol_sim_v2_reset(
    state: State<'_, LolSimV2StoreState>,
    request: LolSimV2ResetRequest,
) -> Result<LolSimV2StateResponse, String> {
    reset(&state, request)
}

#[tauri::command]
pub fn lol_sim_v2_dispose(
    state: State<'_, LolSimV2StoreState>,
    request: LolSimV2DisposeRequest,
) -> Result<LolSimV2DisposeResponse, String> {
    dispose(&state, request)
}

#[tauri::command]
pub async fn lol_sim_v2_run_to_completion(
    state: State<'_, LolSimV2StoreState>,
    request: LolSimV2RunToCompletionRequest,
) -> Result<LolSimV2RunToCompletionResponse, String> {
    run_to_completion(&state, request)
}

#[tauri::command]
pub fn lol_sim_v2_skip_to_end(
    state: State<'_, LolSimV2StoreState>,
    request: LolSimV2SkipToEndRequest,
) -> Result<LolSimV2SkipToEndResponse, String> {
    skip_to_end(&state, request)
}
