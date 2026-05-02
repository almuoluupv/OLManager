import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FixtureData, GameStateData, TeamData } from "../../store/gameStore";
import ScheduleCalendarView from "./ScheduleCalendarView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string, params?: Record<string, string | number>) => {
      if (key === "schedule.scrimVs") return `Scrim vs ${params?.team}`;
      return typeof params?.defaultValue === "string" ? params.defaultValue : key;
    },
  }),
}));

function createTeam(overrides: Partial<TeamData> = {}): TeamData {
  return {
    id: "team-1",
    name: "Alpha FC",
    short_name: "ALP",
    country: "GB",
    city: "London",
    arena_name: "Alpha Ground",
    arena_capacity: 30000,
    finance: 500000,
    manager_id: "manager-1",
    reputation: 50,
    wage_budget: 50000,
    transfer_budget: 250000,
    season_income: 0,
    season_expenses: 0,
    formation: "4-4-2",
    play_style: "Balanced",
    training_focus: "Scrims",
    training_intensity: "Balanced",
    training_schedule: "Balanced",
    founded_year: 1900,
    colors: { primary: "#000000", secondary: "#ffffff" },
    starting_xi_ids: [],
    form: [],
    history: [],
    ...overrides,
  };
}

function createFixture(overrides: Partial<FixtureData> = {}): FixtureData {
  return {
    id: "fixture-1",
    matchday: 1,
    date: "2026-08-15",
    home_team_id: "team-1",
    away_team_id: "team-2",
    competition: "League",
    status: "Scheduled",
    result: undefined,
    ...overrides,
  };
}

function createGameState(userTeamOverrides: Partial<TeamData> = {}): GameStateData {
  const userTeam = createTeam(userTeamOverrides);
  const opponent = createTeam({
    id: "team-2",
    name: "Beta FC",
    short_name: "BET",
    manager_id: null,
  });

  return {
    clock: {
      current_date: "2026-08-10T00:00:00Z",
      start_date: "2026-07-01T00:00:00Z",
    },
    manager: {
      id: "manager-1",
      first_name: "Jane",
      last_name: "Doe",
      date_of_birth: "1980-01-01",
      nationality: "GB",
      reputation: 50,
      satisfaction: 50,
      fan_approval: 50,
      team_id: "team-1",
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
    teams: [userTeam, opponent],
    players: [],
    staff: [],
    messages: [],
    news: [],
    league: {
      id: "league-1",
      name: "League",
      season: 1,
      fixtures: [createFixture()],
      standings: [],
    },
    scouting_assignments: [],
    board_objectives: [],
  };
}

describe("ScheduleCalendarView", () => {
  it("shows selected weekly scrims in the calendar", () => {
    render(
      <ScheduleCalendarView
        gameState={createGameState({ weekly_scrim_opponent_ids: ["team-2", "", "", ""] })}
        fixtures={[createFixture()]}
        onOpenFixtureResult={vi.fn()}
      />,
    );

    expect(screen.getByText("Scrim vs Beta FC")).toBeInTheDocument();
  });

  it("does not show empty scrim slots as calendar events", () => {
    render(
      <ScheduleCalendarView
        gameState={createGameState({ weekly_scrim_opponent_ids: ["", "", "", ""] })}
        fixtures={[createFixture()]}
        onOpenFixtureResult={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Scrim vs/i)).not.toBeInTheDocument();
  });
});
