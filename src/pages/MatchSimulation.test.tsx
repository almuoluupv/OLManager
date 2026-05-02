import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import MatchSimulation from "./MatchSimulation";

const liveWinnerQueue = vi.hoisted(() => [] as Array<"blue" | "red">);
const navigateMock = vi.fn();
const setGameStateMock = vi.fn();
let locationState: unknown = null;
let gameStoreState: {
  gameState: Record<string, unknown> | null;
  setGameState: typeof setGameStateMock;
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ state: locationState }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | { defaultValue?: string }) => {
      if (typeof options === "string") {
        return options;
      }

      if (options && typeof options === "object" && "defaultValue" in options) {
        return options.defaultValue ?? key;
      }

      return key;
    },
    i18n: { language: "en" },
  }),
}));

vi.mock("../store/gameStore", () => ({
  useGameStore: () => gameStoreState,
}));

vi.mock("../components/match/PreMatchSetup", () => ({
  default: ({
    snapshot,
    onStart,
  }: {
    snapshot: { home_team: { name: string } };
    onStart?: () => void;
  }) => (
    <div>
      <div data-testid="prematch">{snapshot.home_team.name}</div>
      <button data-testid="prematch-start" onClick={onStart}>
        Start Match
      </button>
    </div>
  ),
}));

vi.mock("../components/match/ChampionDraft", () => ({
  default: ({
    onComplete,
    lockedChampionIds,
  }: {
    onComplete?: (payload?: unknown) => void;
    lockedChampionIds?: string[];
  }) => (
    <button
      data-testid="champion-draft"
      onClick={() =>
        onComplete?.({
          blue: { picks: [{ role: "TOP", championId: "Aatrox" }] },
          red: { picks: [{ role: "TOP", championId: "Ahri" }] },
          history: ["Aatrox", "Ahri"],
        } as never)
      }
    >
      Complete Draft ({lockedChampionIds?.length ?? 0})
    </button>
  ),
}));

vi.mock("../components/match/MatchTacticsStage", () => ({
  default: ({
    onContinue,
    onSimulate,
    isSimulating,
    simulationFeedback,
  }: {
    onContinue?: () => void;
    onSimulate?: () => void;
    isSimulating?: boolean;
    simulationFeedback?: string | null;
  }) => (
    <div data-testid="tactics-stage">
      <button data-testid="tactics-run-sims" onClick={onSimulate} disabled={isSimulating}>
        Simulate
      </button>
      <button data-testid="tactics-continue" onClick={onContinue}>
        Continue to Live
      </button>
      <div data-testid="tactics-feedback">{simulationFeedback ?? "none"}</div>
    </div>
  ),
}));

vi.mock("../components/match/LolMatchLive", () => ({
  default: ({
    snapshot,
    onFullTime,
  }: {
    snapshot: { home_team: { name: string } };
    onFullTime?: (state?: unknown) => void;
  }) => (
    <button
      data-testid="match-live"
      onClick={() =>
        onFullTime?.({
          timeSec: 1800,
          running: false,
          winner: liveWinnerQueue.shift() ?? "blue",
          showWalls: false,
          champions: [],
          minions: [],
          structures: [],
          objectives: {},
          neutralTimers: {},
          stats: {
            blue: { kills: 1, towers: 0, dragons: 0, barons: 0, gold: 0 },
            red: { kills: 0, towers: 0, dragons: 0, barons: 0, gold: 0 },
          },
          events: [],
          speed: 1,
        } as never)
      }
    >
      {snapshot.home_team.name}
    </button>
  ),
}));

vi.mock("../components/match/HalfTimeBreak", () => ({
  default: () => <div data-testid="halftime" />,
}));

vi.mock("../components/match/LolResultScreen", () => ({
  default: ({
    onFinish,
    importantEvents,
  }: {
    onFinish?: () => void;
    importantEvents?: unknown;
  }) => (
    <div>
      <div data-testid="postmatch-round-summary">
        {importantEvents ? JSON.stringify(importantEvents) : "null"}
      </div>
      <button data-testid="postmatch-finish" onClick={onFinish}>
        Finish Match
      </button>
    </div>
  ),
}));

vi.mock("../components/match/DraftResultScreen", () => ({
  default: ({
    onContinue,
    onPressConference,
    result,
    seriesGames,
    seriesLength = 1,
    seriesGameIndex = 1,
    userSeriesWins,
    opponentSeriesWins,
  }: {
    onContinue?: () => void;
    onPressConference?: () => void;
    result?: { winnerSide?: "blue" | "red" };
    seriesGames?: Array<{ gameIndex: number; winnerSide?: "blue" | "red"; result?: { winnerSide?: "blue" | "red" } }>;
    seriesLength?: 1 | 3 | 5;
    seriesGameIndex?: number;
    userSeriesWins?: number;
    opponentSeriesWins?: number;
  }) => {
    const games = Array.isArray(seriesGames) && seriesGames.length > 0
      ? seriesGames
      : [{ gameIndex: Math.max(1, seriesGameIndex), winnerSide: result?.winnerSide, result }];
    const targetWins = seriesLength === 1 ? 1 : seriesLength === 3 ? 2 : 3;
    const winsFromGames = games.reduce(
      (score, entry) => {
        const winnerSide = entry.winnerSide ?? entry.result?.winnerSide;
        if (winnerSide === "blue") return { ...score, user: score.user + 1 };
        if (winnerSide === "red") return { ...score, opponent: score.opponent + 1 };
        return score;
      },
      { user: 0, opponent: 0 },
    );
    const propWins = (userSeriesWins ?? 0) + (opponentSeriesWins ?? 0);
    const gameWins = winsFromGames.user + winsFromGames.opponent;
    const propsClaimFinished = (userSeriesWins ?? 0) >= targetWins || (opponentSeriesWins ?? 0) >= targetWins;
    const propsSupportedByGames = propsClaimFinished && propWins <= seriesLength && gameWins >= propWins;
    const useGameScore = seriesLength > 1 && gameWins > 0 && (propWins === 0 || !propsSupportedByGames);
    const displayUserWins = useGameScore ? winsFromGames.user : (userSeriesWins ?? 0);
    const displayOpponentWins = useGameScore ? winsFromGames.opponent : (opponentSeriesWins ?? 0);
    const displayedWins = displayUserWins + displayOpponentWins;
    const isSeriesFinished =
      seriesLength <= 1 ||
      ((displayUserWins >= targetWins || displayOpponentWins >= targetWins) && gameWins >= displayedWins);
    const playedGames = Math.max(...games.map((entry) => entry.gameIndex), games.length, 1);

    return (
      <div>
        <div data-testid="postmatch-round-summary">
          {result ? JSON.stringify(result) : "null"}
        </div>
        <div data-testid="series-score">
          {displayUserWins}-{displayOpponentWins}
        </div>
        {onPressConference ? (
          <button data-testid="postmatch-press" onClick={onPressConference}>
            Press Conference
          </button>
        ) : null}
        <button data-testid="postmatch-finish" onClick={() => onContinue?.()}>
          {seriesLength > 1 && !isSeriesFinished
            ? `Game ${Math.min(seriesLength, playedGames + 1)}/${seriesLength}`
            : "Finish Match"}
        </button>
      </div>
    );
  },
}));

vi.mock("../components/match/PressConference", () => ({
  default: () => <div data-testid="press" />,
}));

const mockedInvoke = vi.mocked(invoke);

function makeEnginePlayer(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: "p1",
    name: "Player One",
    position: "Goalkeeper",
    condition: 100,
    pace: 50,
    stamina: 50,
    strength: 50,
    agility: 50,
    passing: 50,
    shooting: 50,
    tackling: 50,
    dribbling: 50,
    defending: 50,
    positioning: 50,
    vision: 50,
    decisions: 50,
    composure: 50,
    aggression: 50,
    teamwork: 50,
    leadership: 50,
    handling: 50,
    reflexes: 50,
    aerial: 50,
    traits: [],
    ...overrides,
  };
}

function makeSnapshot(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    phase: "PreKickOff",
    current_minute: 0,
    home_score: 0,
    away_score: 0,
    possession: "Home",
    ball_zone: "Midfield",
    home_team: {
      id: "home1",
      name: "Home FC",
      formation: "4-4-2",
      play_style: "Balanced",
      players: [makeEnginePlayer({ id: "home-p1", name: "Home Keeper" })],
    },
    away_team: {
      id: "away1",
      name: "Away FC",
      formation: "4-4-2",
      play_style: "Balanced",
      players: [makeEnginePlayer({ id: "away-p1", name: "Away Keeper" })],
    },
    home_bench: [],
    away_bench: [],
    home_possession_pct: 50,
    away_possession_pct: 50,
    events: [],
    home_subs_made: 0,
    away_subs_made: 0,
    max_subs: 5,
    home_set_pieces: {
      free_kick_taker: null,
      corner_taker: null,
      penalty_taker: null,
      captain: null,
    },
    away_set_pieces: {
      free_kick_taker: null,
      corner_taker: null,
      penalty_taker: null,
      captain: null,
    },
    substitutions: [],
    allows_extra_time: false,
    home_yellows: {},
    away_yellows: {},
    sent_off: [],
    ...overrides,
  };
}

function makeGameState(): Record<string, unknown> {
  return {
    clock: {
      current_date: "2026-08-01",
      start_date: "2026-08-01",
    },
    manager: {
      id: "mgr1",
      first_name: "Test",
      last_name: "Manager",
      date_of_birth: "1980-01-01",
      nationality: "GB",
      reputation: 50,
      satisfaction: 50,
      fan_approval: 50,
      team_id: "home1",
      career_stats: {
        matches_managed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        trophies: 0,
        best_finish: null,
      },
      career_history: [],
    },
    teams: [
      {
        id: "home1",
        name: "Home FC",
        short_name: "HOM",
        country: "England",
        city: "Home City",
        arena_name: "Home Ground",
        arena_capacity: 20000,
        finance: 1000000,
        manager_id: "mgr1",
        reputation: 50,
        wage_budget: 100000,
        transfer_budget: 500000,
        season_income: 0,
        season_expenses: 0,
        formation: "4-4-2",
        play_style: "Balanced",
        training_focus: "General",
        training_intensity: "Balanced",
        training_schedule: "Balanced",
        founded_year: 1900,
        colors: { primary: "#00ff00", secondary: "#ffffff" },
        starting_xi_ids: [],
        form: [],
        history: [],
      },
      {
        id: "away1",
        name: "Away FC",
        short_name: "AWY",
        country: "England",
        city: "Away City",
        arena_name: "Away Ground",
        arena_capacity: 20000,
        finance: 1000000,
        manager_id: null,
        reputation: 50,
        wage_budget: 100000,
        transfer_budget: 500000,
        season_income: 0,
        season_expenses: 0,
        formation: "4-4-2",
        play_style: "Balanced",
        training_focus: "General",
        training_intensity: "Balanced",
        training_schedule: "Balanced",
        founded_year: 1900,
        colors: { primary: "#0000ff", secondary: "#ffffff" },
        starting_xi_ids: [],
        form: [],
        history: [],
      },
    ],
    players: [],
    staff: [],
    messages: [],
    news: [],
    league: null,
    scouting_assignments: [],
    board_objectives: [],
  };
}

function makeGameStateWithSeriesFixture(
  fixture: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const gameState = makeGameState();
  gameState.league = {
    id: "league-1",
    name: "Test League",
    season: 1,
    fixtures: [
      {
        id: "fixture-series-1",
        matchday: 12,
        date: "2026-08-01",
        home_team_id: "home1",
        away_team_id: "away1",
        competition: "Playoffs",
        best_of: 3,
        status: "InProgress",
        result: {
          home_wins: 0,
          away_wins: 0,
        },
        ...fixture,
      },
    ],
    standings: [],
  };

  return gameState;
}

async function playOneDraftMap(): Promise<void> {
  await waitFor(function (): void {
    expect(screen.getByTestId("champion-draft")).toBeInTheDocument();
  });

  fireEvent.click(screen.getByTestId("champion-draft"));
  await waitFor(function (): void {
    expect(screen.getByTestId("tactics-stage")).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId("tactics-continue"));

  await waitFor(function (): void {
    expect(screen.getByTestId("match-live")).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId("match-live"));

  await waitFor(function (): void {
    expect(screen.getByTestId("postmatch-finish")).toBeInTheDocument();
  });
}

describe("MatchSimulation", function (): void {
  beforeEach(function resetState(): void {
    mockedInvoke.mockReset();
    navigateMock.mockReset();
    setGameStateMock.mockReset();
    locationState = null;
    gameStoreState = {
      gameState: makeGameState(),
      setGameState: setGameStateMock,
    };
    localStorage.clear();
    sessionStorage.clear();
    liveWinnerQueue.length = 0;
  });

  it("renders the current live snapshot when get_match_snapshot succeeds", async function (): Promise<void> {
    mockedInvoke.mockResolvedValueOnce(makeSnapshot());

    render(<MatchSimulation />);

    await waitFor(function (): void {
      expect(mockedInvoke).toHaveBeenCalledWith("get_match_snapshot");
    });

    expect(screen.getByTestId("prematch")).toHaveTextContent("Home FC");
  });

  it("restores the live match session when no snapshot exists but fixture index is provided", async function (): Promise<void> {
    locationState = {
      fixtureIndex: 4,
      mode: "live",
      snapshot: makeSnapshot({
        home_team: {
          id: "home1",
          name: "Boot Snapshot FC",
          formation: "4-4-2",
          play_style: "Balanced",
          players: [makeEnginePlayer({ id: "boot-p1", name: "Boot Keeper" })],
        },
      }),
    };

    mockedInvoke.mockRejectedValueOnce(new Error("No active live match"));
    mockedInvoke.mockResolvedValueOnce(
      makeSnapshot({
        home_team: {
          id: "home1",
          name: "Restored FC",
          formation: "4-4-2",
          play_style: "Balanced",
          players: [
            makeEnginePlayer({ id: "restore-p1", name: "Restore Keeper" }),
          ],
        },
      }),
    );

    render(<MatchSimulation />);

    await waitFor(function (): void {
      expect(mockedInvoke).toHaveBeenCalledWith("start_live_match", {
        allowsExtraTime: false,
        fixtureIndex: 4,
        mode: "live",
      });
    });

    expect(screen.getByTestId("prematch")).toHaveTextContent("Restored FC");
  });

  it("moves spectators straight into the live match stage", async function (): Promise<void> {
    locationState = {
      mode: "spectator",
      snapshot: makeSnapshot(),
    };

    mockedInvoke.mockResolvedValueOnce(makeSnapshot());

    render(<MatchSimulation />);

    await waitFor(function (): void {
      expect(screen.getByTestId("champion-draft")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("champion-draft"));

    await waitFor(function (): void {
      expect(screen.getByTestId("tactics-stage")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("tactics-continue"));

    await waitFor(function (): void {
      expect(screen.getByTestId("match-live")).toHaveTextContent("Home FC");
    });
  });

  it("moves from prematch to draft and then into live match", async function (): Promise<void> {
    mockedInvoke.mockResolvedValueOnce(makeSnapshot());

    render(<MatchSimulation />);

    await waitFor(function (): void {
      expect(screen.getByTestId("prematch")).toHaveTextContent("Home FC");
    });

    fireEvent.click(screen.getByTestId("prematch-start"));

    await waitFor(function (): void {
      expect(screen.getByTestId("champion-draft")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("champion-draft"));

    await waitFor(function (): void {
      expect(screen.getByTestId("tactics-stage")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("tactics-continue"));

    await waitFor(function (): void {
      expect(screen.getByTestId("match-live")).toHaveTextContent("Home FC");
    });
  });

  it("navigates away from postmatch after the finalized game has been stored", async function (): Promise<void> {
    locationState = {
      mode: "spectator",
      snapshot: makeSnapshot(),
    };

    const finishedGame = makeGameState();
    mockedInvoke.mockResolvedValueOnce(makeSnapshot()).mockResolvedValueOnce({
      game: finishedGame,
      round_summary: {
        matchday: 1,
        is_complete: true,
        pending_fixture_count: 0,
        completed_results: [],
        standings_delta: [],
        notable_upset: null,
        top_scorer_delta: [],
      },
    });

    render(<MatchSimulation />);

    await waitFor(function (): void {
      expect(screen.getByTestId("champion-draft")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("champion-draft"));
    await waitFor(function (): void {
      expect(screen.getByTestId("tactics-stage")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("tactics-continue"));

    await waitFor(function (): void {
      expect(screen.getByTestId("match-live")).toHaveTextContent("Home FC");
    });

    fireEvent.click(screen.getByTestId("match-live"));

    await waitFor(function (): void {
      expect(mockedInvoke).toHaveBeenLastCalledWith(
        "finish_live_match",
        expect.objectContaining({
          lolReport: expect.anything(),
        }),
      );
      expect(screen.getByTestId("postmatch-finish")).toBeInTheDocument();
    });

    expect(setGameStateMock).toHaveBeenCalledWith(finishedGame);

    fireEvent.click(screen.getByTestId("postmatch-finish"));

    await waitFor(function (): void {
      expect(navigateMock).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("finalizes the match on full time and passes the round summary into postmatch", async function (): Promise<void> {
    locationState = {
      mode: "spectator",
      snapshot: makeSnapshot(),
    };

    const finishedGame = makeGameState();
    const roundSummary = {
      matchday: 1,
      is_complete: true,
      pending_fixture_count: 0,
      completed_results: [],
      standings_delta: [],
      notable_upset: null,
      top_scorer_delta: [],
    };
    mockedInvoke.mockResolvedValueOnce(makeSnapshot()).mockResolvedValueOnce({
      game: finishedGame,
      round_summary: roundSummary,
    });

    render(<MatchSimulation />);

    await waitFor(function (): void {
      expect(screen.getByTestId("champion-draft")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("champion-draft"));
    await waitFor(function (): void {
      expect(screen.getByTestId("tactics-stage")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("tactics-continue"));

    await waitFor(function (): void {
      expect(screen.getByTestId("match-live")).toHaveTextContent("Home FC");
    });

    fireEvent.click(screen.getByTestId("match-live"));

    await waitFor(function (): void {
      expect(mockedInvoke).toHaveBeenLastCalledWith(
        "finish_live_match",
        expect.objectContaining({
          lolReport: expect.anything(),
        }),
      );
      expect(screen.getByTestId("postmatch-finish")).toBeInTheDocument();
    });

    expect(setGameStateMock).toHaveBeenCalledWith(finishedGame);

    expect(screen.getByTestId("postmatch-round-summary")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("postmatch-finish"));

    await waitFor(function (): void {
      expect(navigateMock).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("persists updated series scoreboard after each playoff map", async function (): Promise<void> {
    locationState = {
      mode: "spectator",
      snapshot: makeSnapshot(),
    };

    const gameStateWithPlayoff = makeGameState();
    gameStateWithPlayoff.league = {
      id: "league-1",
      name: "Test League",
      season: 1,
      fixtures: [
        {
          id: "fixture-playoff-1",
          matchday: 12,
          date: "2026-08-01",
          home_team_id: "home1",
          away_team_id: "away1",
          competition: "Playoffs",
          status: "InProgress",
          result: {
            home_wins: 1,
            away_wins: 1,
          },
        },
      ],
      standings: [],
    };

    gameStoreState = {
      gameState: gameStateWithPlayoff,
      setGameState: setGameStateMock,
    };

    localStorage.setItem(
      "fixture-draft-result:fixture-playoff-1",
      JSON.stringify({
        snapshot: makeSnapshot(),
        controlledSide: "blue",
        result: { winnerSide: "blue" },
        seriesGames: [
          { gameIndex: 1, result: { winnerSide: "blue" }, winnerSide: "blue" },
          { gameIndex: 2, result: { winnerSide: "red" }, winnerSide: "red" },
        ],
        homeSeriesWins: 1,
        awaySeriesWins: 1,
      }),
    );

    mockedInvoke.mockResolvedValueOnce(makeSnapshot()).mockResolvedValueOnce({
      game: gameStateWithPlayoff,
      round_summary: null,
    });

    render(<MatchSimulation />);

    await waitFor(function (): void {
      expect(screen.getByTestId("champion-draft")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("champion-draft"));
    await waitFor(function (): void {
      expect(screen.getByTestId("tactics-stage")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("tactics-continue"));

    await waitFor(function (): void {
      expect(screen.getByTestId("match-live")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("match-live"));

    await waitFor(function (): void {
      const stored = localStorage.getItem("fixture-draft-result:fixture-playoff-1");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored ?? "{}");
      expect(parsed.seriesGameIndex).toBe(3);
      expect(parsed.homeSeriesWins).toBe(2);
      expect(parsed.awaySeriesWins).toBe(1);
      expect(parsed.userSeriesWins).toBe(2);
      expect(parsed.opponentSeriesWins).toBe(1);
      expect(parsed.seriesGames).toHaveLength(3);
      expect(parsed.seriesGames.map((entry: { gameIndex: number }) => entry.gameIndex)).toEqual([1, 2, 3]);
      expect(parsed.seriesGames[2].winnerSide).toBe(parsed.result.winnerSide);
    });
  });

  it("completes a Bo3 after loss-win-win and does not request a fourth map", async function (): Promise<void> {
    locationState = {
      mode: "spectator",
      snapshot: makeSnapshot(),
    };

    const gameStateWithBo3 = makeGameStateWithSeriesFixture({
      id: "fixture-bo3-lww",
      best_of: 3,
    });
    const finishedGameStateWithBo3 = JSON.parse(JSON.stringify(gameStateWithBo3)) as Record<string, unknown>;
    const finishedLeague = finishedGameStateWithBo3.league as { fixtures: Array<Record<string, unknown>> };
    finishedLeague.fixtures[0] = {
      ...finishedLeague.fixtures[0],
      status: "Finished",
      result: { home_wins: 0, away_wins: 0 },
    };
    gameStoreState = {
      gameState: gameStateWithBo3,
      setGameState: setGameStateMock,
    };
    setGameStateMock.mockImplementation(function updateStore(nextGameState: Record<string, unknown>): void {
      gameStoreState = {
        gameState: nextGameState,
        setGameState: setGameStateMock,
      };
    });
    liveWinnerQueue.push("red", "blue", "blue");
    mockedInvoke.mockImplementation(async function (command: string): Promise<unknown> {
      if (command === "get_match_snapshot") return makeSnapshot();
      if (command === "finish_live_match") {
        return { game: finishedGameStateWithBo3, round_summary: null };
      }
      if (command === "apply_champion_mastery_from_draft") return gameStateWithBo3;
      return null;
    });

    const view = render(<MatchSimulation />);

    await playOneDraftMap();
    expect(screen.getByTestId("series-score")).toHaveTextContent("0-1");
    expect(screen.queryByTestId("postmatch-press")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("postmatch-finish"));

    await playOneDraftMap();
    expect(screen.getByTestId("series-score")).toHaveTextContent("1-1");
    expect(screen.queryByTestId("postmatch-press")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("postmatch-finish"));

    await playOneDraftMap();

    await waitFor(function (): void {
      expect(screen.getByTestId("series-score")).toHaveTextContent("2-1");
      expect(screen.getByTestId("postmatch-press")).toBeInTheDocument();
      expect(mockedInvoke).toHaveBeenCalledWith(
        "finish_live_match",
        expect.objectContaining({ lolReport: expect.anything() }),
      );
    });

    view.rerender(<MatchSimulation />);

    await waitFor(function (): void {
      expect(screen.getByTestId("series-score")).toHaveTextContent("2-1");
      expect(screen.getByTestId("series-score")).not.toHaveTextContent("0-0");
    });

    fireEvent.click(screen.getByTestId("postmatch-finish"));

    await waitFor(function (): void {
      expect(navigateMock).toHaveBeenCalledWith("/dashboard");
    });
    expect(screen.queryByTestId("champion-draft")).not.toBeInTheDocument();
  });

  it("completes a Bo5 once one team reaches three wins", async function (): Promise<void> {
    locationState = {
      mode: "spectator",
      snapshot: makeSnapshot(),
    };

    const gameStateWithBo5 = makeGameStateWithSeriesFixture({
      id: "fixture-bo5-three-wins",
      best_of: 5,
    });
    gameStoreState = {
      gameState: gameStateWithBo5,
      setGameState: setGameStateMock,
    };
    liveWinnerQueue.push("blue", "red", "blue", "blue");
    mockedInvoke.mockImplementation(async function (command: string): Promise<unknown> {
      if (command === "get_match_snapshot") return makeSnapshot();
      if (command === "finish_live_match") {
        return { game: gameStateWithBo5, round_summary: null };
      }
      if (command === "apply_champion_mastery_from_draft") return gameStateWithBo5;
      return null;
    });

    render(<MatchSimulation />);

    await playOneDraftMap();
    fireEvent.click(screen.getByTestId("postmatch-finish"));
    await playOneDraftMap();
    fireEvent.click(screen.getByTestId("postmatch-finish"));
    await playOneDraftMap();
    expect(screen.getByTestId("series-score")).toHaveTextContent("2-1");
    expect(screen.queryByTestId("postmatch-press")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("postmatch-finish"));

    await playOneDraftMap();

    await waitFor(function (): void {
      expect(screen.getByTestId("series-score")).toHaveTextContent("3-1");
      expect(screen.getByTestId("postmatch-press")).toBeInTheDocument();
      expect(mockedInvoke).toHaveBeenCalledWith(
        "finish_live_match",
        expect.objectContaining({ lolReport: expect.anything() }),
      );
    });
  });

  it("abandons incomplete stored series after app restart and resets locked champions", async function (): Promise<void> {
    locationState = {
      mode: "spectator",
      snapshot: makeSnapshot(),
    };

    const gameStateWithPlayoff = makeGameState();
    gameStateWithPlayoff.league = {
      id: "league-1",
      name: "Test League",
      season: 1,
      fixtures: [
        {
          id: "fixture-playoff-restart-reset",
          matchday: 12,
          date: "2026-08-01",
          home_team_id: "home1",
          away_team_id: "away1",
          competition: "Playoffs",
          best_of: 3,
          status: "InProgress",
          result: {
            home_wins: 0,
            away_wins: 0,
          },
        },
      ],
      standings: [],
    };

    gameStoreState = {
      gameState: gameStateWithPlayoff,
      setGameState: setGameStateMock,
    };

    localStorage.setItem(
      "fixture-draft-result:fixture-playoff-restart-reset",
      JSON.stringify({
        snapshot: makeSnapshot(),
        controlledSide: "blue",
        result: { winnerSide: "blue" },
        homeSeriesWins: 1,
        awaySeriesWins: 0,
        seriesUsedChampionIds: ["Aatrox", "Ahri"],
      }),
    );

    mockedInvoke.mockResolvedValueOnce(makeSnapshot());

    render(<MatchSimulation />);

    await waitFor(function (): void {
      expect(screen.getByTestId("champion-draft")).toHaveTextContent("Complete Draft (0)");
    });

    expect(
      localStorage.getItem("fixture-draft-result:fixture-playoff-restart-reset"),
    ).toBeNull();
  });

  it("returns to draft for next map while series is still open", async function (): Promise<void> {
    locationState = {
      mode: "spectator",
      snapshot: makeSnapshot(),
    };

    const gameStateWithPlayoff = makeGameState();
    gameStateWithPlayoff.league = {
      id: "league-1",
      name: "Test League",
      season: 1,
      fixtures: [
        {
          id: "fixture-playoff-open-series",
          matchday: 12,
          date: "2026-08-01",
          home_team_id: "home1",
          away_team_id: "away1",
          competition: "Playoffs",
          status: "InProgress",
          result: {
            home_wins: 0,
            away_wins: 0,
          },
        },
      ],
      standings: [],
    };

    gameStoreState = {
      gameState: gameStateWithPlayoff,
      setGameState: setGameStateMock,
    };

    mockedInvoke.mockResolvedValueOnce(makeSnapshot());

    render(<MatchSimulation />);

    await waitFor(function (): void {
      expect(screen.getByTestId("champion-draft")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("champion-draft"));
    await waitFor(function (): void {
      expect(screen.getByTestId("tactics-stage")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("tactics-continue"));
    await waitFor(function (): void {
      expect(screen.getByTestId("match-live")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("match-live"));

    await waitFor(function (): void {
      expect(screen.getByTestId("postmatch-finish")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("postmatch-press")).not.toBeInTheDocument();

    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "finish_live_match",
      expect.anything(),
    );

    fireEvent.click(screen.getByTestId("postmatch-finish"));

    await waitFor(function (): void {
      expect(screen.getByTestId("champion-draft")).toBeInTheDocument();
      expect(screen.getByText("Complete Draft (2)")).toBeInTheDocument();
    });

    expect(navigateMock).not.toHaveBeenCalledWith("/dashboard");
  });

  it("does not finalize a Bo3 after one map even when fixture result contains stale wins", async function (): Promise<void> {
    locationState = {
      mode: "spectator",
      snapshot: makeSnapshot(),
    };

    const gameStateWithStaleScore = makeGameStateWithSeriesFixture({
      id: "fixture-bo3-stale-one-map",
      best_of: 3,
      status: "InProgress",
      result: {
        home_wins: 1,
        away_wins: 0,
      },
    });
    gameStoreState = {
      gameState: gameStateWithStaleScore,
      setGameState: setGameStateMock,
    };

    mockedInvoke.mockImplementation(async function (command: string): Promise<unknown> {
      if (command === "get_match_snapshot") return makeSnapshot();
      if (command === "finish_live_match") {
        throw new Error("Bo3 should not finish after one map");
      }
      if (command === "apply_champion_mastery_from_draft") return gameStateWithStaleScore;
      return null;
    });

    render(<MatchSimulation />);

    await playOneDraftMap();

    expect(screen.getByTestId("series-score")).toHaveTextContent("1-0");
    expect(screen.queryByTestId("postmatch-press")).not.toBeInTheDocument();
    expect(screen.getByTestId("postmatch-finish")).toHaveTextContent("Game 2/3");
    expect(mockedInvoke).not.toHaveBeenCalledWith(
      "finish_live_match",
      expect.anything(),
    );

    fireEvent.click(screen.getByTestId("postmatch-finish"));

    await waitFor(function (): void {
      expect(screen.getByTestId("champion-draft")).toBeInTheDocument();
    });
    expect(navigateMock).not.toHaveBeenCalledWith("/dashboard");
  });

  it("rejects persisted Bo3 completion when stored games do not support the claimed score", async function (): Promise<void> {
    locationState = {
      mode: "spectator",
      snapshot: makeSnapshot(),
    };

    const gameStateWithInvalidCompletedBo3 = makeGameStateWithSeriesFixture({
      id: "fixture-bo3-invalid-complete",
      best_of: 3,
      status: "Finished",
      result: {
        home_wins: 2,
        away_wins: 0,
      },
    });
    gameStoreState = {
      gameState: gameStateWithInvalidCompletedBo3,
      setGameState: setGameStateMock,
    };

    localStorage.setItem(
      "fixture-draft-result:fixture-bo3-invalid-complete",
      JSON.stringify({
        snapshot: makeSnapshot(),
        controlledSide: "blue",
        result: { winnerSide: "blue" },
        seriesGames: [
          { gameIndex: 1, result: { winnerSide: "blue" }, winnerSide: "blue" },
        ],
        seriesLength: 3,
        seriesGameIndex: 1,
        homeSeriesWins: 2,
        awaySeriesWins: 0,
      }),
    );

    mockedInvoke.mockResolvedValueOnce(makeSnapshot());

    render(<MatchSimulation />);

    await waitFor(function (): void {
      expect(screen.getByTestId("champion-draft")).toBeInTheDocument();
    });

    expect(localStorage.getItem("fixture-draft-result:fixture-bo3-invalid-complete")).toBeNull();
    expect(screen.queryByTestId("postmatch-press")).not.toBeInTheDocument();
  });

  it("does not carry stored picked champions into a new BO1 draft", async function (): Promise<void> {
    locationState = {
      mode: "spectator",
      snapshot: makeSnapshot(),
    };

    const gameStateWithBo1 = makeGameState();
    gameStateWithBo1.league = {
      id: "league-1",
      name: "Test League",
      season: 1,
      fixtures: [
        {
          id: "fixture-bo1-clean",
          matchday: 4,
          date: "2026-08-01",
          home_team_id: "home1",
          away_team_id: "away1",
          competition: "Regular Season",
          best_of: 1,
          status: "Scheduled",
          result: {
            home_wins: 1,
            away_wins: 0,
          },
        },
      ],
      standings: [],
    };

    gameStoreState = {
      gameState: gameStateWithBo1,
      setGameState: setGameStateMock,
    };

    localStorage.setItem(
      "fixture-draft-result:fixture-bo1-clean",
      JSON.stringify({
        snapshot: makeSnapshot(),
        controlledSide: "blue",
        result: { winnerSide: "blue" },
        homeSeriesWins: 1,
        awaySeriesWins: 0,
        seriesUsedChampionIds: ["Aatrox", "Ahri"],
      }),
    );

    mockedInvoke.mockResolvedValueOnce(makeSnapshot());

    render(<MatchSimulation />);

    await waitFor(function (): void {
      expect(screen.getByTestId("champion-draft")).toHaveTextContent("Complete Draft (0)");
    });
  });
});
