import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, Database, FileSpreadsheet, Image, Plus, Save, Search, Trash2, Upload, User, UserCog } from "lucide-react";
import type { PlayerData, StaffData, TeamData } from "../../store/gameStore";
import { calculateLolOvr } from "../../lib/lolPlayerStats";
import { resolvePlayerPhoto, resolveStaffPhoto } from "../../lib/playerPhotos";
import { Card, CardBody, ThemeToggle } from "../ui";

type EditorMode = "players" | "staff";
type PlayerListScope = "all" | "main" | "academy" | "freeAgents";

type ExcelImportField = PlayerAttributeKey | "potential_base";

interface WorldDataEditorModel {
  name: string;
  description: string;
  teams: TeamData[];
  players: PlayerData[];
  staff: StaffData[];
}

interface WorldEditorTabProps {
  onBack?: () => void;
}

function clampRating(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(99, Math.round(parsed)));
}

function normalizeImportKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeLookupName(value: string): string {
  return normalizeImportKey(value).replace(/[^a-z0-9]/g, "");
}

function splitExcelRow(row: string): string[] {
  if (row.includes("\t")) return row.split("\t");
  if (row.includes(";")) return row.split(";");
  return row.split(",");
}

type PlayerAttributeKey = keyof PlayerData["attributes"];

const LOL_PLAYER_STATS: Array<{ label: string; key: PlayerAttributeKey }> = [
  { label: "Mechanics", key: "dribbling" },
  { label: "Laning", key: "shooting" },
  { label: "Teamfighting", key: "teamwork" },
  { label: "Macro", key: "vision" },
  { label: "Consistency", key: "decisions" },
  { label: "Shotcalling", key: "leadership" },
  { label: "Champion Pool", key: "agility" },
  { label: "Discipline", key: "composure" },
  { label: "Mental Resilience", key: "stamina" },
];

const EXCEL_PLAYER_IMPORT_HEADERS: Record<string, ExcelImportField> = {
  mecanicas: "dribbling",
  mechanics: "dribbling",
  "laning/pathing": "shooting",
  laning: "shooting",
  pathing: "shooting",
  teamfight: "teamwork",
  teamfighting: "teamwork",
  macro: "vision",
  consistencia: "decisions",
  consistency: "decisions",
  shotcalling: "leadership",
  versatilidad: "agility",
  versatility: "agility",
  disciplina: "composure",
  discipline: "composure",
  mentalidad: "stamina",
  mentality: "stamina",
  potencial: "potential_base",
  potential: "potential_base",
};

function applyStaffOverall(staff: StaffData, overall: number): StaffData {
  const value = clampRating(overall);
  return {
    ...staff,
    attributes: {
      ...staff.attributes,
      coaching: value,
      judging_ability: value,
      judging_potential: value,
      physiotherapy: value,
    },
  };
}

function staffOvr(staff: StaffData): number {
  const { coaching, judging_ability, judging_potential, physiotherapy } = staff.attributes;
  const weights: Record<StaffData["role"], [number, number, number, number]> = {
    Coach: [0.7, 0.15, 0.1, 0.05],
    AssistantManager: [0.35, 0.25, 0.25, 0.15],
    Scout: [0.1, 0.45, 0.4, 0.05],
    Physio: [0.15, 0.05, 0.05, 0.75],
  };
  const [coachW, abilityW, potentialW, physioW] = weights[staff.role];
  return Math.round(coaching * coachW + judging_ability * abilityW + judging_potential * potentialW + physiotherapy * physioW);
}

function teamName(world: WorldDataEditorModel, teamId: string | null): string {
  if (!teamId) return "Free agent";
  return world.teams.find((team) => team.id === teamId)?.short_name ?? teamId;
}

function normalizeOptionalUrl(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getAgeFromDob(dateOfBirth: string): number {
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return 24;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const birthdayPassed = today.getMonth() > birth.getMonth()
    || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!birthdayPassed) age -= 1;
  return Math.max(16, Math.min(45, age));
}

function roundMoney(value: number): number {
  return Math.max(50_000, Math.round(value / 10_000) * 10_000);
}

function isAcademyPlayer(world: WorldDataEditorModel, player: PlayerData): boolean {
  if (!player.team_id) return false;
  return world.teams.some((team) => team.id === player.team_id && team.team_kind === "Academy");
}

function calculateSuggestedMarketValue(player: PlayerData, isAcademy = false): number {
  const ovr = calculateLolOvr(player);
  const potential = player.potential_base ?? ovr;
  const age = getAgeFromDob(player.date_of_birth);
  const skillValue = 50_000 + Math.max(0, ovr - 60) ** 2 * 300;
  const potentialValue = Math.max(0, potential - ovr) * (isAcademy ? 3_000 : 6_000);
  const ageMultiplier = age <= 21 ? 1.1 : age <= 23 ? 1.05 : age <= 27 ? 1 : age <= 30 ? 0.9 : 0.75;
  const contractMultiplier = player.contract_end ? 1 : 0.75;
  const academyDevelopmentMultiplier = isAcademy ? 0.7 : 1;
  return roundMoney((skillValue + potentialValue) * ageMultiplier * contractMultiplier * academyDevelopmentMultiplier);
}

function uniqueId(prefix: string): string {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${randomId}`;
}

function defaultPlayerAttributes(value: number): PlayerData["attributes"] {
  return {
    pace: value,
    stamina: value,
    strength: value,
    agility: value,
    passing: value,
    shooting: value,
    tackling: value,
    dribbling: value,
    defending: value,
    positioning: value,
    vision: value,
    decisions: value,
    composure: value,
    aggression: value,
    teamwork: value,
    leadership: value,
    handling: 20,
    reflexes: 20,
    aerial: 50,
  };
}

function createNewPlayer(index: number): PlayerData {
  const player = {
    id: uniqueId("world-player"),
    match_name: `NuevoJugador${index}`,
    full_name: "Nuevo Jugador",
    date_of_birth: "2005-01-01",
    nationality: "KR",
    football_nation: "KR",
    birth_country: "KR",
    profile_image_url: null,
    position: "Midfielder",
    natural_position: "Midfielder",
    alternate_positions: [],
    footedness: "Right",
    weak_foot: 2,
    training_focus: null,
    attributes: defaultPlayerAttributes(60),
    condition: 100,
    morale: 70,
    injury: null,
    team_id: null,
    contract_end: null,
    wage: 40_000,
    market_value: 0,
    stats: { assists: 0 },
    career: [],
    transfer_listed: true,
    loan_listed: false,
    transfer_offers: [],
    traits: [],
    potential_base: 75,
    potential_revealed: null,
    potential_research_started_on: null,
    potential_research_eta_days: null,
    champion_training_target: null,
    champion_training_targets: [],
  } as PlayerData;
  return { ...player, market_value: calculateSuggestedMarketValue(player) };
}

function createNewStaff(index: number): StaffData {
  return {
    id: uniqueId("world-staff"),
    first_name: "Nuevo",
    last_name: `Staff${index}`,
    date_of_birth: "1988-01-01",
    nationality: "KR",
    profile_image_url: null,
    role: "Coach",
    attributes: {
      coaching: 60,
      judging_ability: 60,
      judging_potential: 60,
      physiotherapy: 60,
    },
    team_id: null,
    specialization: null,
    wage: 12_000,
    contract_end: null,
  };
}

export default function WorldEditorTab({ onBack }: WorldEditorTabProps) {
  const [path, setPath] = useState("");
  const [mode, setMode] = useState<EditorMode>("players");
  const [playerScope, setPlayerScope] = useState<PlayerListScope>("all");
  const [query, setQuery] = useState("");
  const [world, setWorld] = useState<WorldDataEditorModel | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageCheckStatus, setImageCheckStatus] = useState<string | null>(null);
  const [excelImportText, setExcelImportText] = useState("");

  const selectedPlayer = world?.players.find((player) => player.id === selectedPlayerId) ?? null;
  const selectedStaff = world?.staff.find((staff) => staff.id === selectedStaffId) ?? null;

  async function loadWorld(sourcePath?: string): Promise<void> {
    setIsLoading(true);
    setError(null);
    setStatus(null);
    try {
      const loaded = await invoke<WorldDataEditorModel>("load_world_editor_database", {
        path: sourcePath ?? (path || null),
      });
      setWorld(loaded);
      setSelectedPlayerId(loaded.players[0]?.id ?? "");
      setSelectedStaffId(loaded.staff[0]?.id ?? "");
      if (sourcePath) setPath(sourcePath === "lec-default" ? "" : sourcePath);
      setStatus(`Mundo cargado: ${loaded.name}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function saveWorld(): Promise<void> {
    if (!world) return;
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      const savedPath = await invoke<string>("save_world_editor_database", {
        path,
        world,
      });
      setPath(savedPath);
      setStatus(`Base guardada en ${savedPath}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    void loadWorld("lec-default");
  }, []);

  const filteredPlayers = useMemo(() => {
    if (!world) return [];
    const normalized = query.trim().toLowerCase();
    return world.players
      .filter((player) => {
        if (playerScope === "freeAgents" && player.team_id) return false;
        if (playerScope === "academy" && !isAcademyPlayer(world, player)) return false;
        if (playerScope === "main" && (!player.team_id || isAcademyPlayer(world, player))) return false;
        if (!normalized) return true;
        return `${player.match_name} ${player.full_name} ${teamName(world, player.team_id)}`.toLowerCase().includes(normalized);
      })
      .slice(0, 160);
  }, [playerScope, query, world]);

  const playerScopeCounts = useMemo(() => {
    const players = world?.players ?? [];
    return {
      all: players.length,
      main: world ? players.filter((player) => player.team_id && !isAcademyPlayer(world, player)).length : 0,
      academy: world ? players.filter((player) => isAcademyPlayer(world, player)).length : 0,
      freeAgents: players.filter((player) => !player.team_id).length,
    };
  }, [world]);

  const filteredStaff = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (world?.staff ?? [])
      .filter((staff) => {
        if (!normalized) return true;
        return `${staff.first_name} ${staff.last_name} ${staff.role}`.toLowerCase().includes(normalized);
      })
      .slice(0, 160);
  }, [query, world?.staff]);

  function updatePlayer(playerId: string, update: (player: PlayerData) => PlayerData): void {
    setWorld((current) => {
      if (!current) return current;
      return {
        ...current,
        players: current.players.map((player) => player.id === playerId ? update(player) : player),
      };
    });
  }

  function updateStaff(staffId: string, update: (staff: StaffData) => StaffData): void {
    setWorld((current) => {
      if (!current) return current;
      return {
        ...current,
        staff: current.staff.map((staff) => staff.id === staffId ? update(staff) : staff),
      };
    });
  }

  function addNewPlayer(): void {
    setWorld((current) => {
      if (!current) return current;
      const player = createNewPlayer(current.players.length + 1);
      setSelectedPlayerId(player.id);
      setMode("players");
      setImageCheckStatus(null);
      return { ...current, players: [...current.players, player] };
    });
  }

  function addNewStaff(): void {
    setWorld((current) => {
      if (!current) return current;
      const staff = createNewStaff(current.staff.length + 1);
      setSelectedStaffId(staff.id);
      setMode("staff");
      setImageCheckStatus(null);
      return { ...current, staff: [...current.staff, staff] };
    });
  }

  function deleteSelectedPlayer(): void {
    if (!selectedPlayer) return;
    const confirmed = window.confirm(`Borrar jugador ${selectedPlayer.match_name}? Esta accion solo se confirma al guardar el JSON.`);
    if (!confirmed) return;

    setWorld((current) => {
      if (!current) return current;
      const players = current.players.filter((player) => player.id !== selectedPlayer.id);
      setSelectedPlayerId(players[0]?.id ?? "");
      setImageCheckStatus(null);
      return { ...current, players };
    });
    setStatus(`Jugador borrado: ${selectedPlayer.match_name}. Guardá el JSON para persistirlo.`);
  }

  function deleteSelectedStaff(): void {
    if (!selectedStaff) return;
    const confirmed = window.confirm(`Borrar staff ${selectedStaff.first_name} ${selectedStaff.last_name}? Esta accion solo se confirma al guardar el JSON.`);
    if (!confirmed) return;

    setWorld((current) => {
      if (!current) return current;
      const staff = current.staff.filter((staffMember) => staffMember.id !== selectedStaff.id);
      setSelectedStaffId(staff[0]?.id ?? "");
      setImageCheckStatus(null);
      return { ...current, staff };
    });
    setStatus(`Staff borrado: ${selectedStaff.first_name} ${selectedStaff.last_name}. Guardá el JSON para persistirlo.`);
  }

  function importPlayerRatingsFromExcel(): void {
    const rows = excelImportText
      .split(/\r?\n/)
      .filter((row) => row.trim().length > 0);

    if (rows.length < 2) {
      setError("Pegá al menos encabezado y una fila desde Excel.");
      return;
    }

    const headers = splitExcelRow(rows[0]).map(normalizeImportKey);
    const playerColumnIndex = headers.findIndex((header) => header === "player" || header === "jugador");
    if (playerColumnIndex < 0) {
      setError("No encontré la columna Player/Jugador en el Excel pegado.");
      return;
    }

    const importColumns = headers
      .map((header, index) => ({ field: EXCEL_PLAYER_IMPORT_HEADERS[header], index }))
      .filter((column): column is { field: ExcelImportField; index: number } => Boolean(column.field));

    if (importColumns.length === 0) {
      setError("No encontré columnas importables. Usá encabezados como Mecánicas, Laning/pathing, Teamfight, Macro, Consistencia, Shotcalling, Versatilidad, Disciplina, Mentalidad y POTENCIAL.");
      return;
    }

    setWorld((current) => {
      if (!current) return current;

      const playerByName = new Map(
        current.players.map((player) => [normalizeLookupName(player.match_name), player.id]),
      );
      let updated = 0;
      const missing: string[] = [];
      const updates = new Map<string, Partial<PlayerData["attributes"]> & { potential_base?: number }>();

      for (const row of rows.slice(1)) {
        const cells = splitExcelRow(row).map((cell) => cell.trim());
        const playerName = cells[playerColumnIndex] ?? "";
        if (!playerName) continue;

        const playerId = playerByName.get(normalizeLookupName(playerName));
        if (!playerId) {
          missing.push(playerName);
          continue;
        }

        const rowUpdate: Partial<PlayerData["attributes"]> & { potential_base?: number } = {};
        for (const column of importColumns) {
          const rawValue = cells[column.index];
          if (!rawValue) continue;
          const parsed = Number(rawValue.replace(",", "."));
          if (!Number.isFinite(parsed)) continue;
          rowUpdate[column.field] = clampRating(parsed) as never;
        }

        if (Object.keys(rowUpdate).length > 0) {
          updates.set(playerId, rowUpdate);
        }
      }

      const players = current.players.map((player) => {
        const update = updates.get(player.id);
        if (!update) return player;
        updated += 1;
        const { potential_base, ...attributeUpdates } = update;
        const nextPlayer = {
          ...player,
          attributes: {
            ...player.attributes,
            ...attributeUpdates,
          },
        };
        const nextOvr = calculateLolOvr(nextPlayer);
        return {
          ...nextPlayer,
          potential_base: potential_base == null ? player.potential_base : Math.max(potential_base, nextOvr),
        };
      });

      setError(null);
      setStatus(`Excel importado: ${updated} jugadores actualizados${missing.length > 0 ? `, ${missing.length} sin match (${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "..." : ""})` : ""}. Guardá el JSON para persistirlo.`);
      return { ...current, players };
    });
  }

  function recalculateAllMarketValues(): void {
    setWorld((current) => {
      if (!current) return current;
      return {
        ...current,
        players: current.players.map((player) => ({
          ...player,
          market_value: calculateSuggestedMarketValue(player, isAcademyPlayer(current, player)),
        })),
      };
    });
    setStatus("Valores de mercado recalculados para todos los jugadores. Guardá el JSON para persistirlo.");
  }

  function checkProfileImage(url: string | null): void {
    setImageCheckStatus(null);
    if (!url) {
      setImageCheckStatus("No hay URL para comprobar.");
      return;
    }

    const image = new window.Image();
    image.onload = () => setImageCheckStatus("Imagen cargada correctamente. Se va a ver en el perfil.");
    image.onerror = () => setImageCheckStatus("No se pudo cargar la imagen. Revisá la URL o el path.");
    image.src = url;
  }

  const playerPhoto = selectedPlayer ? resolvePlayerPhoto(selectedPlayer.id, selectedPlayer.match_name, selectedPlayer.profile_image_url) : null;
  const staffPhoto = selectedStaff ? resolveStaffPhoto(selectedStaff.profile_image_url) : null;
  const selectedPlayerIsAcademy = world && selectedPlayer ? isAcademyPlayer(world, selectedPlayer) : false;

  return (
    <div className="min-h-screen bg-gray-100 p-6 dark:bg-navy-900">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {onBack ? (
              <button type="button" onClick={onBack} className="rounded-lg p-2 text-gray-500 hover:bg-white dark:hover:bg-navy-800">
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : null}
            <div>
              <h1 className="font-heading text-2xl font-black uppercase tracking-wide text-gray-900 dark:text-white">World Editor</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Editor externo de base de mundo. No toca saves ni partidas activas.</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        <Card>
          <CardBody>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
              <TextField label="Path JSON del mundo" value={path} placeholder="src-tauri/databases/lec_world.json" onChange={setPath} />
              <button type="button" onClick={() => loadWorld("lec-default")} disabled={isLoading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-heading font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-50 dark:border-navy-600 dark:text-gray-200 dark:hover:bg-navy-700">
                <Database className="h-4 w-4" />
                Default
              </button>
              <button type="button" onClick={() => loadWorld()} disabled={isLoading || !path.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary-400 px-4 py-2 text-sm font-heading font-bold uppercase tracking-wider text-primary-600 hover:bg-primary-500/10 dark:text-primary-300">
                <Upload className="h-4 w-4" />
                Cargar Path
              </button>
              <button type="button" onClick={saveWorld} disabled={isSaving || !world} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-heading font-bold uppercase tracking-wider text-white hover:bg-primary-600 disabled:opacity-60">
                <Save className="h-4 w-4" />
                {isSaving ? "Guardando" : "Guardar JSON"}
              </button>
            </div>
            {status ? <p className="mt-3 text-sm text-primary-600 dark:text-primary-300">{status}</p> : null}
            {error ? <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p> : null}
          </CardBody>
        </Card>

        {world ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_1fr]">
            <Card>
              <CardBody>
                <div className="mb-4">
                  <h2 className="font-heading text-lg font-bold uppercase text-gray-900 dark:text-white">{world.name}</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{world.players.length} jugadores · {world.staff.length} staff · {world.teams.length} equipos</p>
                </div>
                <div className="mb-4 flex gap-2">
                  <ModeButton active={mode === "players"} onClick={() => setMode("players")}>Jugadores</ModeButton>
                  <ModeButton active={mode === "staff"} onClick={() => setMode("staff")}>Staff</ModeButton>
                </div>
                <div className="mb-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={addNewPlayer} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary-400 px-3 py-2 text-xs font-heading font-bold uppercase tracking-wider text-primary-600 hover:bg-primary-500/10 dark:text-primary-300">
                    <Plus className="h-3.5 w-3.5" /> Jugador
                  </button>
                  <button type="button" onClick={addNewStaff} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary-400 px-3 py-2 text-xs font-heading font-bold uppercase tracking-wider text-primary-600 hover:bg-primary-500/10 dark:text-primary-300">
                    <Plus className="h-3.5 w-3.5" /> Staff
                  </button>
                </div>
                <button type="button" onClick={recalculateAllMarketValues} className="mb-4 w-full rounded-lg border border-accent-400 px-3 py-2 text-xs font-heading font-bold uppercase tracking-wider text-accent-500 hover:bg-accent-500/10">
                  Recalcular todos los valores
                </button>
                {mode === "players" ? (
                  <div className="mb-4 grid grid-cols-2 gap-2">
                    <ScopeButton active={playerScope === "all"} onClick={() => setPlayerScope("all")}>Todos ({playerScopeCounts.all})</ScopeButton>
                    <ScopeButton active={playerScope === "main"} onClick={() => setPlayerScope("main")}>Main ({playerScopeCounts.main})</ScopeButton>
                    <ScopeButton active={playerScope === "academy"} onClick={() => setPlayerScope("academy")}>Academia ({playerScopeCounts.academy})</ScopeButton>
                    <ScopeButton active={playerScope === "freeAgents"} onClick={() => setPlayerScope("freeAgents")}>Free agents ({playerScopeCounts.freeAgents})</ScopeButton>
                  </div>
                ) : null}
                {mode === "players" ? (
                  <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-navy-600 dark:bg-navy-800/70">
                    <div className="mb-2 flex items-center gap-2 text-xs font-heading font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                      <FileSpreadsheet className="h-4 w-4" /> Importar Excel
                    </div>
                    <textarea
                      value={excelImportText}
                      onChange={(event) => setExcelImportText(event.target.value)}
                      placeholder="Pegá desde Excel: Player, Mecánicas, Laning/pathing, Teamfight, Macro, Consistencia, Shotcalling, Versatilidad, Disciplina, Mentalidad, POTENCIAL..."
                      className="h-24 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-navy-600 dark:bg-navy-900 dark:text-gray-100"
                    />
                    <button type="button" onClick={importPlayerRatingsFromExcel} disabled={!excelImportText.trim()} className="mt-2 w-full rounded-lg border border-primary-400 px-3 py-2 text-xs font-heading font-bold uppercase tracking-wider text-primary-600 hover:bg-primary-500/10 disabled:opacity-50 dark:text-primary-300">
                      Aplicar ratings por Player
                    </button>
                    <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">Busca por nombre in-game exacto normalizado. Ignora medias calculadas del Excel.</p>
                  </div>
                ) : null}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-navy-600 dark:bg-navy-800 dark:text-gray-100" />
                </div>
                <div className="max-h-[620px] space-y-1 overflow-y-auto pr-1">
                  {mode === "players" ? filteredPlayers.map((player) => (
                    <button key={player.id} type="button" onClick={() => setSelectedPlayerId(player.id)} className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${selectedPlayerId === player.id ? "bg-primary-500/15 text-primary-700 dark:text-primary-200" : "hover:bg-gray-100 dark:hover:bg-navy-700"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{player.match_name}</span>
                        <span className="text-xs font-heading font-bold text-accent-500">{calculateLolOvr(player)} OVR</span>
                      </div>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{teamName(world, player.team_id)}</p>
                    </button>
                  )) : filteredStaff.map((staff) => (
                    <button key={staff.id} type="button" onClick={() => setSelectedStaffId(staff.id)} className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${selectedStaffId === staff.id ? "bg-primary-500/15 text-primary-700 dark:text-primary-200" : "hover:bg-gray-100 dark:hover:bg-navy-700"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{staff.first_name} {staff.last_name}</span>
                        <span className="text-xs font-heading font-bold text-accent-500">{staffOvr(staff)} OVR</span>
                      </div>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{staff.role} · {teamName(world, staff.team_id)}</p>
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                {mode === "players" && selectedPlayer ? (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-[180px_1fr]">
                    <ProfilePreview photo={playerPhoto} fallbackIcon={<User className="h-12 w-12" />} title={selectedPlayer.match_name} subtitle="Jugador" />
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <EditorHeader title="Jugador" description="Estos cambios quedan en el JSON de mundo, no en una partida." />
                        <DeleteButton onClick={deleteSelectedPlayer}>Borrar jugador</DeleteButton>
                      </div>
                      <TextField label="Nombre in-game" value={selectedPlayer.match_name} onChange={(value) => updatePlayer(selectedPlayer.id, (player) => ({ ...player, match_name: value }))} />
                      <TextField label="Nombre completo" value={selectedPlayer.full_name} onChange={(value) => updatePlayer(selectedPlayer.id, (player) => ({ ...player, full_name: value }))} />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <TextField label="Fecha de nacimiento" type="date" value={selectedPlayer.date_of_birth} onChange={(value) => updatePlayer(selectedPlayer.id, (player) => ({ ...player, date_of_birth: value }))} />
                        <TextField label="Nacionalidad" value={selectedPlayer.nationality} placeholder="KR" onChange={(value) => updatePlayer(selectedPlayer.id, (player) => ({ ...player, nationality: value.trim().toUpperCase(), football_nation: (player.football_nation ?? player.nationality).trim().toUpperCase() || value.trim().toUpperCase() }))} />
                        <TextField label="País de nacimiento" value={selectedPlayer.birth_country ?? selectedPlayer.nationality} placeholder="KR" onChange={(value) => updatePlayer(selectedPlayer.id, (player) => ({ ...player, birth_country: normalizeOptionalUrl(value.toUpperCase()) }))} />
                      </div>
                      <TextField label="Nación competitiva" value={selectedPlayer.football_nation ?? selectedPlayer.nationality} placeholder="KR / EUN / PCS" onChange={(value) => updatePlayer(selectedPlayer.id, (player) => ({ ...player, football_nation: value.trim().toUpperCase() }))} />
                      <div className="rounded-xl border border-accent-400/25 bg-accent-500/10 px-4 py-3">
                        <p className="text-xs font-heading font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">OVR calculado</p>
                        <p className="mt-1 text-4xl font-heading font-black text-accent-500">{calculateLolOvr(selectedPlayer)}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Se calcula con el mismo promedio de stats LoL que usa el perfil del jugador.</p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {LOL_PLAYER_STATS.map((stat) => (
                          <TextField
                            key={stat.key}
                            label={stat.label}
                            type="number"
                            value={String(selectedPlayer.attributes[stat.key])}
                            onChange={(value) => updatePlayer(selectedPlayer.id, (player) => ({
                              ...player,
                              attributes: {
                                ...player.attributes,
                                [stat.key]: clampRating(value),
                              },
                            }))}
                          />
                        ))}
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <TextField label="Potencial" type="number" value={String(selectedPlayer.potential_base ?? calculateLolOvr(selectedPlayer))} onChange={(value) => updatePlayer(selectedPlayer.id, (player) => ({ ...player, potential_base: Math.max(clampRating(value), calculateLolOvr(player)), potential_revealed: player.potential_revealed == null ? player.potential_revealed : Math.max(clampRating(value), calculateLolOvr(player)) }))} />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <TextField label="Fin de contrato" type="date" value={selectedPlayer.contract_end ?? ""} onChange={(value) => updatePlayer(selectedPlayer.id, (player) => ({ ...player, contract_end: normalizeOptionalUrl(value) }))} />
                        <TextField label="Salario anual" type="number" value={String(selectedPlayer.wage)} onChange={(value) => updatePlayer(selectedPlayer.id, (player) => ({ ...player, wage: Math.max(0, Math.round(Number(value) || 0)) }))} />
                        <TextField label="Valor de mercado" type="number" value={String(selectedPlayer.market_value)} onChange={(value) => updatePlayer(selectedPlayer.id, (player) => ({ ...player, market_value: Math.max(0, Math.round(Number(value) || 0)) }))} />
                      </div>
                      <div className="rounded-xl border border-white/10 bg-navy-700/40 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-heading font-bold uppercase tracking-wider text-gray-400">Valor sugerido regularizado</p>
                            <p className="mt-1 text-2xl font-heading font-black text-primary-300">€{calculateSuggestedMarketValue(selectedPlayer, selectedPlayerIsAcademy).toLocaleString("de-DE")}</p>
                            {selectedPlayerIsAcademy ? <p className="mt-1 text-xs font-semibold text-accent-300">Academia: valor reducido por desarrollo pendiente.</p> : null}
                          </div>
                          <button type="button" onClick={() => updatePlayer(selectedPlayer.id, (player) => ({ ...player, market_value: calculateSuggestedMarketValue(player, selectedPlayerIsAcademy) }))} className="rounded-lg border border-primary-400 px-3 py-2 text-xs font-heading font-bold uppercase tracking-wider text-primary-300 hover:bg-primary-500/10">
                            Aplicar valor
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-gray-400">Fórmula por OVR, potencial, edad y contrato. Los jugadores de academia tienen una reducción adicional porque el potencial todavía no está desarrollado.</p>
                      </div>
                      <div>
                        <TextField label="Foto de perfil URL" value={selectedPlayer.profile_image_url ?? ""} placeholder="https://... o /data/lec/images/players/Faker.webp" onChange={(value) => updatePlayer(selectedPlayer.id, (player) => ({ ...player, profile_image_url: normalizeOptionalUrl(value) }))} />
                        <ImageCheckButton onClick={() => checkProfileImage(playerPhoto)} />
                      </div>
                    </div>
                  </div>
                ) : null}

                {mode === "staff" && selectedStaff ? (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-[180px_1fr]">
                    <ProfilePreview photo={staffPhoto} fallbackIcon={<UserCog className="h-12 w-12" />} title={`${selectedStaff.first_name} ${selectedStaff.last_name}`} subtitle={selectedStaff.role} />
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <EditorHeader title="Staff" description="Edición limitada para curar nombres, OVR agregado y foto." />
                        <DeleteButton onClick={deleteSelectedStaff}>Borrar staff</DeleteButton>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <TextField label="Nombre" value={selectedStaff.first_name} onChange={(value) => updateStaff(selectedStaff.id, (staff) => ({ ...staff, first_name: value }))} />
                        <TextField label="Apellido" value={selectedStaff.last_name} onChange={(value) => updateStaff(selectedStaff.id, (staff) => ({ ...staff, last_name: value }))} />
                      </div>
                      <TextField label="OVR" type="number" value={String(staffOvr(selectedStaff))} onChange={(value) => updateStaff(selectedStaff.id, (staff) => applyStaffOverall(staff, clampRating(value)))} />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <TextField label="Fin de contrato" type="date" value={selectedStaff.contract_end ?? ""} onChange={(value) => updateStaff(selectedStaff.id, (staff) => ({ ...staff, contract_end: normalizeOptionalUrl(value) }))} />
                        <TextField label="Salario anual" type="number" value={String(selectedStaff.wage)} onChange={(value) => updateStaff(selectedStaff.id, (staff) => ({ ...staff, wage: Math.max(0, Math.round(Number(value) || 0)) }))} />
                      </div>
                      <div>
                        <TextField label="Foto de perfil URL" value={selectedStaff.profile_image_url ?? ""} placeholder="https://..." onChange={(value) => updateStaff(selectedStaff.id, (staff) => ({ ...staff, profile_image_url: normalizeOptionalUrl(value) }))} />
                        <ImageCheckButton onClick={() => checkProfileImage(staffPhoto)} />
                      </div>
                    </div>
                  </div>
                ) : null}
                {imageCheckStatus ? <p className="mt-4 rounded-lg border border-white/10 bg-navy-700/50 px-3 py-2 text-sm text-gray-200">{imageCheckStatus}</p> : null}
              </CardBody>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`flex-1 rounded-lg px-3 py-2 text-xs font-heading font-bold uppercase tracking-wider ${active ? "bg-primary-500 text-white" : "bg-gray-100 text-gray-500 dark:bg-navy-700 dark:text-gray-300"}`}>{children}</button>;
}

function ScopeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-lg px-2 py-1.5 text-[11px] font-heading font-bold uppercase tracking-wider ${active ? "bg-accent-500 text-white" : "bg-gray-100 text-gray-500 dark:bg-navy-700 dark:text-gray-300"}`}>{children}</button>;
}

function DeleteButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-lg border border-red-400 px-3 py-2 text-xs font-heading font-bold uppercase tracking-wider text-red-500 hover:bg-red-500/10">
      <Trash2 className="h-4 w-4" />
      {children}
    </button>
  );
}

function EditorHeader({ title, description }: { title: string; description: string }) {
  return <div><h3 className="font-heading text-xl font-bold uppercase tracking-wide text-gray-900 dark:text-white">{title}</h3><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p></div>;
}

function TextField({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-heading font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</span>
      <input type={type} value={value} placeholder={placeholder} min={type === "number" ? 1 : undefined} max={type === "number" ? 99 : undefined} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-navy-600 dark:bg-navy-800 dark:text-gray-100" />
    </label>
  );
}

function ImageCheckButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-accent-400 px-3 py-2 text-xs font-heading font-bold uppercase tracking-wider text-accent-500 hover:bg-accent-500/10">
      <Image className="h-4 w-4" />
      Comprobar imagen
    </button>
  );
}

function ProfilePreview({ photo, fallbackIcon, title, subtitle }: { photo: string | null; fallbackIcon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center dark:border-navy-600 dark:bg-navy-800/70">
      <div className="mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-navy-700 text-gray-300">
        {photo ? <img src={photo} alt={title} className="h-full w-full object-cover" /> : fallbackIcon}
      </div>
      <p className="mt-3 truncate font-heading font-bold uppercase tracking-wide text-gray-900 dark:text-white">{title}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
    </div>
  );
}
