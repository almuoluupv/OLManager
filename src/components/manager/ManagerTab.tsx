import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GameStateData, useGameStore } from "../../store/gameStore";
import { Card, CardHeader, CardBody, ProgressBar, CountryFlag, Button } from "../ui";
import { formatDate } from "../../lib/helpers";
import { useTranslation } from "react-i18next";
import { countryName, allNationalities } from "../../lib/countries";
import DashboardModalFrame from "../dashboard/DashboardModalFrame";
import { Settings, X, ChevronDown, Check } from "lucide-react";

interface ManagerTabProps {
  gameState: GameStateData;
}

export default function ManagerTab({ gameState }: ManagerTabProps) {
  const setGameState = useGameStore((state) => state.setGameState);
  const { t, i18n } = useTranslation();
  const mgr = gameState.manager;
  const myTeam = gameState.teams.find(tm => tm.id === mgr.team_id);
  const stats = mgr.career_stats;
  const fullName = `${mgr.first_name} ${mgr.last_name}`;
  const displayName = mgr.nickname?.trim() || fullName;
  const initialsSource = mgr.nickname?.trim() || fullName;
  const initials = initialsSource
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "M";

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    nickname: "",
    firstName: "",
    lastName: "",
    dob: "",
    nationality: "",
  });
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [nationalitySearch, setNationalitySearch] = useState("");
  const nationalityRef = useRef<HTMLDivElement>(null);
  const countriesList = allNationalities(i18n.language);

  const filteredNationalities = countriesList.filter((nat) => {
    const searchLower = nationalitySearch.toLowerCase();
    return nat.name.toLowerCase().includes(searchLower) || 
           nat.code.toLowerCase().includes(searchLower);
  });

  // Close nationality dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!nationalityOpen || !nationalityRef.current) return;
      const targetNode = e.target instanceof Node ? e.target : null;
      const clickedInside = targetNode ? nationalityRef.current.contains(targetNode) : false;
      if (!clickedInside) {
        setNationalityOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [nationalityOpen]);

  // Open settings modal and populate form with current values
  const handleOpenSettings = () => {
    setFormData({
      nickname: mgr.nickname || "",
      firstName: mgr.first_name,
      lastName: mgr.last_name,
      dob: mgr.date_of_birth,
      nationality: mgr.nationality,
    });
    setShowSettings(true);
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      // Update manager profile
      await invoke("update_manager_profile", {
        nickname: formData.nickname || null,
        firstName: formData.firstName || null,
        lastName: formData.lastName || null,
        dob: formData.dob || null,
        nationality: formData.nationality || null,
        avatarPath: null,
      });

      // Update local game state to reflect changes immediately
      const updatedManager = {
        ...mgr,
        nickname: formData.nickname || null,
        first_name: formData.firstName,
        last_name: formData.lastName,
        date_of_birth: formData.dob,
        nationality: formData.nationality,
      };
      
      setGameState({
        ...gameState,
        manager: updatedManager,
      });

      setShowSettings(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
      alert(t("manager.saveError", "Error al guardar: ") + String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5">
      {/* Profile card */}
      <Card accent="primary" className="md:col-span-3">
        <div className="bg-gradient-to-r from-navy-700 to-navy-800 p-6 rounded-t-xl flex items-center gap-6 relative">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-primary-500/20 flex items-center justify-center border-2 border-primary-500/30">
            <span className="text-2xl font-heading font-bold text-primary-300">{initials}</span>
          </div>
          <div>
            <h2 className="text-2xl font-heading font-bold text-white uppercase tracking-wide">{displayName}</h2>
            {mgr.nickname?.trim() ? (
              <p className="text-gray-400 text-xs mt-0.5 uppercase tracking-wide">{fullName}</p>
            ) : null}
            <p className="text-gray-400 text-sm mt-1">
              <CountryFlag code={mgr.nationality} locale={i18n.language} className="mr-1 text-sm leading-none" />
              {countryName(mgr.nationality, i18n.language)} • {t('manager.born')} {formatDate(mgr.date_of_birth, i18n.language)}
            </p>
            {myTeam && <p className="text-primary-400 text-sm font-semibold mt-0.5">{t('manager.managerOf', { team: myTeam.name })}</p>}
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-gray-400 font-heading uppercase tracking-wider">{t('manager.reputation')}</p>
              <p className="font-heading font-bold text-2xl text-accent-400">{mgr.reputation}</p>
            </div>
            <button
              onClick={handleOpenSettings}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors"
              title={t("manager.settings", "Settings")}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </Card>

      {/* Settings Modal */}
      {showSettings && (
        <DashboardModalFrame maxWidthClassName="max-w-lg">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-heading font-bold text-gray-900 dark:text-gray-100">
                {t("manager.editProfile", "Editar perfil")}
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-navy-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nickname */}
            <div>
              <label className="block text-xs font-heading font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                {t("createManager.nickname", "Nick")}
              </label>
              <input
                maxLength={20}
                className="w-full bg-gray-50 dark:bg-navy-900 border border-gray-300 dark:border-navy-600 text-gray-900 dark:text-white rounded-lg p-3 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                value={formData.nickname}
                onChange={(e) => setFormData((prev) => ({ ...prev, nickname: e.target.value }))}
              />
            </div>

            {/* Name fields */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-heading font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                  {t("createManager.firstName")}
                </label>
                <input
                  maxLength={30}
                  className="w-full bg-gray-50 dark:bg-navy-900 border border-gray-300 dark:border-navy-600 text-gray-900 dark:text-white rounded-lg p-3 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  value={formData.firstName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-heading font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                  {t("createManager.lastName")}
                </label>
                <input
                  maxLength={30}
                  className="w-full bg-gray-50 dark:bg-navy-900 border border-gray-300 dark:border-navy-600 text-gray-900 dark:text-white rounded-lg p-3 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  value={formData.lastName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))}
                />
              </div>
            </div>

            {/* Date of Birth */}
            <div>
              <label className="block text-xs font-heading font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                {t("createManager.dob")}
              </label>
              <input
                type="date"
                className="w-full bg-gray-50 dark:bg-navy-900 border border-gray-300 dark:border-navy-600 text-gray-900 dark:text-white rounded-lg p-3 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                value={formData.dob}
                onChange={(e) => setFormData((prev) => ({ ...prev, dob: e.target.value }))}
              />
            </div>

            {/* Nationality dropdown */}
            <div ref={nationalityRef} className={nationalityOpen ? "relative z-50" : undefined}>
              <label className="block text-xs font-heading font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                {t("createManager.countryOfOrigin", "Country/Region of Origin")}
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNationalityOpen(!nationalityOpen)}
                  className="w-full flex items-center justify-between bg-gray-50 dark:bg-navy-900 border border-gray-300 dark:border-navy-600 text-left rounded-lg p-3 outline-none transition-all hover:border-primary-500"
                >
                  <span className={formData.nationality ? "text-gray-900 dark:text-white" : "text-gray-400"}>
                    {formData.nationality ? (
                      <span className="flex items-center gap-2">
                        <CountryFlag code={formData.nationality} locale={i18n.language} className="text-lg leading-none" />
                        <span>{countryName(formData.nationality, i18n.language) || formData.nationality}</span>
                      </span>
                    ) : (
                      t("createManager.selectCountry", "Select Country/Region")
                    )}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${nationalityOpen ? "rotate-180" : ""}`} />
                </button>
                {nationalityOpen && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-navy-700 rounded-lg shadow-xl border border-gray-200 dark:border-navy-600 overflow-hidden max-h-[200px] overflow-y-auto">
                    <div className="p-2 border-b border-gray-100 dark:border-navy-600">
                      <input
                        type="text"
                        autoFocus
                        placeholder={t("createManager.searchNationalities")}
                        value={nationalitySearch}
                        onChange={(e) => setNationalitySearch(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-navy-800 border border-gray-200 dark:border-navy-600 text-gray-900 dark:text-white rounded-md px-3 py-2 text-sm outline-none focus:border-primary-500"
                      />
                    </div>
                    {filteredNationalities.map((nat) => (
                      <button
                        key={nat.code}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setFormData((prev) => ({ ...prev, nationality: nat.code }));
                          setNationalityOpen(false);
                          setNationalitySearch("");
                        }}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                          formData.nationality === nat.code
                            ? "bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400"
                            : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-navy-600"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <CountryFlag code={nat.code} locale={i18n.language} className="text-lg leading-none" />
                          <span>{nat.name}</span>
                        </div>
                        {formData.nationality === nat.code && <Check className="w-4 h-4 text-primary-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(false)}
                disabled={isSaving}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveSettings}
                disabled={isSaving}
              >
                {isSaving ? t("common.saving", "Guardando...") : t("common.save", "Guardar")}
              </Button>
            </div>
          </div>
        </DashboardModalFrame>
      )}

      {/* Career stats */}
      <Card accent="accent" className="md:col-span-2">
        <CardHeader>{t('manager.careerStats')}</CardHeader>
        <CardBody>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <StatBlock label={t('manager.matches')} value={stats.matches_managed} />
            <StatBlock label={t('manager.wins')} value={stats.wins} />
            <StatBlock label={t('manager.draws')} value={stats.draws} />
            <StatBlock label={t('manager.losses')} value={stats.losses} />
            <StatBlock label={t('manager.trophies')} value={stats.trophies} />
            <StatBlock label={t('manager.winPercent')} value={stats.matches_managed > 0 ? `${(stats.wins / stats.matches_managed * 100).toFixed(0)}%` : "—"} />
          </div>
        </CardBody>
      </Card>

      {/* Board satisfaction + Fan approval */}
      <Card>
        <CardHeader>{t('manager.boardStatus')}</CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-4">
            {/* Board */}
            <div>
              <div className="text-center mb-2">
                <p className="font-heading font-bold text-3xl text-gray-800 dark:text-gray-100">{mgr.satisfaction}%</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-heading uppercase tracking-wider mt-0.5">{t('manager.board')}</p>
              </div>
              <ProgressBar value={mgr.satisfaction} variant="auto" size="md" />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-2">
                {mgr.satisfaction >= 80 ? t('manager.boardVeryPleased') :
                 mgr.satisfaction >= 50 ? t('manager.boardSatisfied') :
                 mgr.satisfaction >= 30 ? t('manager.boardConcerns') :
                 t('manager.boardThreat')}
              </p>
            </div>
            {/* Fans */}
            <div>
              <div className="text-center mb-2">
                <p className="font-heading font-bold text-3xl text-gray-800 dark:text-gray-100">{mgr.fan_approval ?? 50}%</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-heading uppercase tracking-wider mt-0.5">{t('manager.fans')}</p>
              </div>
              <ProgressBar value={mgr.fan_approval ?? 50} variant="auto" size="md" />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-2">
                {(mgr.fan_approval ?? 50) >= 80 ? t('manager.fanAdore') :
                 (mgr.fan_approval ?? 50) >= 60 ? t('manager.fanBehind') :
                 (mgr.fan_approval ?? 50) >= 40 ? t('manager.fanMixed') :
                 (mgr.fan_approval ?? 50) >= 20 ? t('manager.fanRestless') :
                 t('manager.fanUnrest')}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Career history */}
      {mgr.career_history.length > 0 && (
        <Card className="md:col-span-3">
          <CardHeader>{t('manager.careerHistory')}</CardHeader>
          <CardBody className="p-0">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-navy-800 border-b border-gray-200 dark:border-navy-600 text-xs">
                  <th className="py-3 px-5 font-heading font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('manager.club')}</th>
                  <th className="py-3 px-5 font-heading font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('manager.period')}</th>
                  <th className="py-3 px-5 font-heading font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center">{t('common.played')}</th>
                  <th className="py-3 px-5 font-heading font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center">{t('common.won')}</th>
                  <th className="py-3 px-5 font-heading font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center">{t('common.drawn')}</th>
                  <th className="py-3 px-5 font-heading font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center">{t('common.lost')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-navy-600">
                {mgr.career_history.map((entry, i) => (
                  <tr key={i}>
                    <td className="py-3 px-5 font-semibold text-sm text-gray-800 dark:text-gray-200">{entry.team_name}</td>
                    <td className="py-3 px-5 text-sm text-gray-500 dark:text-gray-400">{entry.start_date.substring(0, 4)} — {entry.end_date?.substring(0, 4) || t('common.present')}</td>
                    <td className="py-3 px-5 text-center text-sm text-gray-600 dark:text-gray-400 tabular-nums">{entry.matches}</td>
                    <td className="py-3 px-5 text-center text-sm text-gray-600 dark:text-gray-400 tabular-nums">{entry.wins}</td>
                    <td className="py-3 px-5 text-center text-sm text-gray-600 dark:text-gray-400 tabular-nums">{entry.draws}</td>
                    <td className="py-3 px-5 text-center text-sm text-gray-600 dark:text-gray-400 tabular-nums">{entry.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-center p-3 bg-gray-50 dark:bg-navy-700 rounded-lg">
      <p className="font-heading font-bold text-xl text-gray-800 dark:text-gray-100 tabular-nums">{value}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 font-heading uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}
