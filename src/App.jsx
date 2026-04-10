import { useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase, supabaseConfigError } from "./lib/supabase";

const SESSION_STORAGE_KEY = "cloud-bankroll-sessions-v1";
const BANKER_STORAGE_KEY = "cloud-banker-v1";
const BANKER_DAYS_STORAGE_KEY = "cloud-banker-days-v1";
const DEV_AUTH_BYPASS_STORAGE_KEY = "cloud-dev-auth-bypass-v1";

const GAME_OPTIONS = ["tourney", "cash game", "home game", "online", "other"];
const BANKER_GAME_OPTIONS = ["cash game", "home game", "online", "other"];
const RESULT_FILTERS = ["All", "Wins", "Losses", "Even"];

function getTodayLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

function formatSignedCurrency(value) {
  const amount = Number.isFinite(value) ? value : 0;
  if (amount === 0) {
    return formatCurrency(0);
  }

  return `${amount > 0 ? "+" : "-"}${formatCurrency(Math.abs(amount))}`;
}

function formatDisplayDate(dateString) {
  if (!dateString) {
    return "No date";
  }

  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function toTitleCase(value) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function getSessionLabel(session) {
  if (session.gameType === "other" && session.customGameType) {
    return toTitleCase(session.customGameType.trim());
  }

  return toTitleCase(session.gameType);
}

function getBankerGameLabel(day) {
  if (day.gameType === "other" && day.customGameType) {
    return toTitleCase(day.customGameType.trim());
  }

  return day.gameType ? toTitleCase(day.gameType) : "No game type";
}

function createDefaultForm() {
  return {
    date: getTodayLocalDate(),
    gameType: "",
    customGameType: "",
    buyIn: "",
    payout: "",
    cashOut: "",
    stakes: "",
    location: ""
  };
}

function sessionToForm(session) {
  return {
    date: session.date,
    gameType: session.gameType,
    customGameType: session.customGameType || "",
    buyIn: String(session.buyIn ?? ""),
    payout: session.payout === null || session.payout === undefined ? "" : String(session.payout),
    cashOut: session.cashOut === null || session.cashOut === undefined ? "" : String(session.cashOut),
    stakes: session.stakes || "",
    location: session.location || ""
  };
}

function createDefaultBankerState() {
  return {
    id: null,
    date: getTodayLocalDate(),
    gameType: "",
    customGameType: "",
    players: []
  };
}

function getAuthCallbackMessage() {
  if (typeof window === "undefined") {
    return "";
  }

  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return (
    url.searchParams.get("error_description") ||
    hashParams.get("error_description") ||
    url.searchParams.get("error") ||
    hashParams.get("error") ||
    ""
  );
}

function clearAuthCallbackUrl() {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState({}, document.title, window.location.pathname);
}

function getStoredDevAuthBypass() {
  if (typeof window === "undefined" || !import.meta.env.DEV) {
    return false;
  }

  return window.localStorage.getItem(DEV_AUTH_BYPASS_STORAGE_KEY) === "true";
}

function normalizeAuthUsername(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function usernameToEmail(value) {
  const username = normalizeAuthUsername(value);
  return username ? `${username}@cloudpoker.app` : "";
}

function getUserDisplayName(user) {
  if (!user) {
    return "";
  }

  const metadataName = user.user_metadata?.username || user.user_metadata?.display_username;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

  if (typeof user.email === "string" && user.email.endsWith("@cloudpoker.app")) {
    return user.email.replace(/@cloudpoker\.app$/, "");
  }

  return user.email || "signed in";
}

function normalizeBankerState(value) {
  const fallback = createDefaultBankerState();
  if (!value || typeof value !== "object") {
    return fallback;
  }

  return {
    id: value.id || null,
    date: value.date || fallback.date,
    gameType: value.gameType || "",
    customGameType: value.customGameType || "",
    players: Array.isArray(value.players) ? value.players : []
  };
}

function parseStoredJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function sortSessionsNewestFirst(items) {
  return [...items].sort((a, b) => {
    const byDate = new Date(b.date).getTime() - new Date(a.date).getTime();
    return byDate || (b.createdAt || 0) - (a.createdAt || 0);
  });
}

function sortBankerDaysNewestFirst(items) {
  return [...items].sort((a, b) => {
    const byDate = new Date(b.date).getTime() - new Date(a.date).getTime();
    return byDate || (b.savedAt || 0) - (a.savedAt || 0);
  });
}

function calculateStats(sessions) {
  const totalProfit = sessions.reduce((sum, session) => sum + session.net, 0);
  const wins = sessions.filter((session) => session.net > 0).length;
  const winRate = sessions.length ? Math.round((wins / sessions.length) * 100) : 0;

  return {
    totalProfit,
    winRate,
    sessions: sessions.length
  };
}

function calculatePlayerTotal(player) {
  return player.buyIns.reduce((sum, value) => sum + value, 0);
}

function calculateBankerTotals(players) {
  const totalBuyIns = players.reduce((sum, player) => sum + calculatePlayerTotal(player), 0);
  const totalCashOut = players.reduce((sum, player) => sum + (Number(player.cashOut) || 0), 0);

  return {
    totalBuyIns,
    totalCashOut,
    totalMoney: totalBuyIns - totalCashOut
  };
}

function truncateText(context, text, maxWidth) {
  if (context.measureText(text).width <= maxWidth) {
    return text;
  }

  let nextText = text;
  while (nextText.length && context.measureText(`${nextText}…`).width > maxWidth) {
    nextText = nextText.slice(0, -1);
  }

  return `${nextText || text.slice(0, 1)}…`;
}

function drawRoundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawSummaryStat(context, label, value, x, y, width) {
  drawRoundRect(context, x, y, width, 112, 28);
  context.fillStyle = "rgba(255, 255, 255, 0.82)";
  context.fill();
  context.strokeStyle = "rgba(138, 129, 224, 0.2)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = "#74658d";
  context.font = "700 24px Avenir Next, Segoe UI, sans-serif";
  context.fillText(label.toUpperCase(), x + 26, y + 38);
  context.fillStyle = "#2f2345";
  context.font = "800 34px Avenir Next, Segoe UI, sans-serif";
  context.fillText(value, x + 26, y + 82);
}

function createBankerSummaryImageBlob(day) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const totals = calculateBankerTotals(day.players);
  const width = 1080;
  const rowHeight = 98;
  const height = Math.max(980, 640 + day.players.length * rowHeight);

  canvas.width = width;
  canvas.height = height;

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#fcfbff");
  gradient.addColorStop(0.55, "#f3f0ff");
  gradient.addColorStop(1, "#f7f4ff");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(138, 129, 224, 0.18)";
  context.beginPath();
  context.arc(910, 120, 220, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(255, 255, 255, 0.68)";
  context.beginPath();
  context.arc(100, 860, 260, 0, Math.PI * 2);
  context.fill();

  drawRoundRect(context, 72, 72, 936, height - 144, 48);
  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  context.shadowColor = "rgba(109, 99, 207, 0.18)";
  context.shadowBlur = 34;
  context.shadowOffsetY = 16;
  context.fill();
  context.shadowColor = "transparent";

  context.textAlign = "center";

  context.fillStyle = "#2f2345";
  context.font = "800 48px Avenir Next, Segoe UI, sans-serif";
  context.fillText(`${getBankerGameLabel(day)} Summary`, width / 2, 180);

  context.fillStyle = "#74658d";
  context.font = "600 28px Avenir Next, Segoe UI, sans-serif";
  context.fillText(`${formatDisplayDate(day.date)} · ${getBankerGameLabel(day)}`, width / 2, 228);
  context.textAlign = "left";

  drawSummaryStat(context, "Buy Ins", formatCurrency(totals.totalBuyIns), 118, 300, 262);
  drawSummaryStat(context, "Cash Out", formatCurrency(totals.totalCashOut), 410, 300, 262);
  drawSummaryStat(context, "Balance", formatSignedCurrency(totals.totalMoney), 702, 300, 262);

  context.fillStyle = "#2f2345";
  context.font = "800 34px Avenir Next, Segoe UI, sans-serif";
  context.fillText("Players", 118, 492);

  let y = 528;
  day.players.forEach((player) => {
    const totalBuyIn = calculatePlayerTotal(player);
    const cashOut = Number(player.cashOut) || 0;
    const result = cashOut - totalBuyIn;

    drawRoundRect(context, 118, y, 844, 78, 24);
    context.fillStyle = "rgba(236, 233, 255, 0.58)";
    context.fill();

    context.fillStyle = "#2f2345";
    context.font = "800 30px Avenir Next, Segoe UI, sans-serif";
    context.fillText(truncateText(context, player.name, 330), 146, y + 34);

    context.fillStyle = "#74658d";
    context.font = "600 22px Avenir Next, Segoe UI, sans-serif";
    context.fillText(`${formatCurrency(totalBuyIn)} in · ${formatCurrency(cashOut)} out`, 146, y + 61);

    context.textAlign = "right";
    context.fillStyle = result > 0 ? "#277a58" : result < 0 ? "#b35374" : "#74658d";
    context.font = "900 34px Avenir Next, Segoe UI, sans-serif";
    context.fillText(formatSignedCurrency(result), 930, y + 49);
    context.textAlign = "left";

    y += rowHeight;
  });

  if (!day.players.length) {
    context.fillStyle = "#74658d";
    context.font = "600 28px Avenir Next, Segoe UI, sans-serif";
    context.fillText("No players added.", 118, y + 24);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 0.95);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getMonthKey(dateString) {
  return dateString ? dateString.slice(0, 7) : "";
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric"
  });
}

function calculateMonthlyAnalytics(sessions, monthKey) {
  const monthlySessions = sessions.filter((session) => getMonthKey(session.date) === monthKey);
  const totalProfit = monthlySessions.reduce((sum, session) => sum + session.net, 0);
  const wins = monthlySessions.filter((session) => session.net > 0).length;
  const losses = monthlySessions.filter((session) => session.net < 0).length;
  const even = monthlySessions.filter((session) => session.net === 0).length;
  const totalBuyIn = monthlySessions.reduce((sum, session) => sum + session.buyIn, 0);

  return {
    sessions: monthlySessions,
    totalProfit,
    wins,
    losses,
    even,
    totalBuyIn,
    averageProfit: monthlySessions.length ? totalProfit / monthlySessions.length : 0
  };
}

function getCalendarDays(monthKey) {
  if (!monthKey) {
    return [];
  }

  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const days = [];

  for (let index = 0; index < startOffset; index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(`${monthKey}-${String(day).padStart(2, "0")}`);
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function createBankerDaySnapshot(banker, savedAt) {
  return {
    id: banker.id || generateId(),
    date: banker.date,
    gameType: banker.gameType,
    customGameType: banker.customGameType,
    players: banker.players,
    savedAt
  };
}

function sessionFromRow(row) {
  return {
    id: row.id,
    date: row.date,
    gameType: row.game_type,
    customGameType: row.custom_game_type || "",
    buyIn: Number(row.buy_in),
    payout: row.payout === null ? null : Number(row.payout),
    cashOut: row.cash_out === null ? null : Number(row.cash_out),
    stakes: row.stakes || "",
    location: row.location || "",
    net: Number(row.net),
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
  };
}

function sessionToRow(session, userId) {
  return {
    id: session.id,
    user_id: userId,
    date: session.date,
    game_type: session.gameType,
    custom_game_type: session.customGameType || "",
    buy_in: session.buyIn,
    payout: session.payout,
    cash_out: session.cashOut,
    stakes: session.stakes || "",
    location: session.location || "",
    net: session.net,
    created_at: new Date(session.createdAt || Date.now()).toISOString()
  };
}

function bankerDayFromRow(row) {
  return {
    id: row.id,
    date: row.date,
    gameType: row.game_type || "",
    customGameType: row.custom_game_type || "",
    players: Array.isArray(row.players) ? row.players : [],
    savedAt: row.saved_at ? new Date(row.saved_at).getTime() : Date.now()
  };
}

function bankerDayToRow(day, userId) {
  return {
    id: day.id,
    user_id: userId,
    date: day.date,
    game_type: day.gameType || "",
    custom_game_type: day.customGameType || "",
    players: day.players,
    saved_at: new Date(day.savedAt || Date.now()).toISOString()
  };
}

function bankerDraftFromRow(row) {
  return normalizeBankerState({
    id: null,
    date: row.date,
    gameType: row.game_type || "",
    customGameType: row.custom_game_type || "",
    players: Array.isArray(row.players) ? row.players : []
  });
}

function bankerDraftToRow(banker, userId) {
  return {
    user_id: userId,
    date: banker.date,
    game_type: banker.gameType || "",
    custom_game_type: banker.customGameType || "",
    players: banker.players,
    updated_at: new Date().toISOString()
  };
}

function CloudIcon() {
  return (
    <svg className="cloud-icon" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="cloudGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#b3adf3" />
          <stop offset="100%" stopColor="#8a81e0" />
        </linearGradient>
      </defs>
      <path
        d="M21 49c-8.3 0-15-6.5-15-14.5 0-6.8 4.9-12.7 11.7-14.1C19.9 12.9 26.2 8 33.7 8c9.2 0 16.8 7.2 17.4 16.2 4.2 1.8 6.9 5.8 6.9 10.4C58 42.5 51.3 49 43 49H21z"
        fill="url(#cloudGradient)"
      />
    </svg>
  );
}

function Stat({ label, value, emphasis }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${emphasis || ""}`.trim()}>{value}</span>
    </div>
  );
}

function AuthView({
  authMode,
  setAuthMode,
  authUsername,
  setAuthUsername,
  authPassword,
  setAuthPassword,
  authMessage,
  authError,
  submitAuth,
  isAuthLoading,
  canUseDevBypass,
  enableDevBypass
}) {
  return (
    <main className="app-shell">
      <section className="auth-panel">
        <CloudIcon />

        <div className="tab-row auth-mode-row">
          <button
            className={`view-tab ${authMode === "sign-in" ? "active" : ""}`.trim()}
            onClick={() => setAuthMode("sign-in")}
            type="button"
          >
            Sign In
          </button>
          <button
            className={`view-tab ${authMode === "sign-up" ? "active" : ""}`.trim()}
            onClick={() => setAuthMode("sign-up")}
            type="button"
          >
            Create Account
          </button>
        </div>

        <label className="field">
          <span>Username</span>
          <input
            type="text"
            placeholder="username"
            value={authUsername}
            onChange={(event) => setAuthUsername(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            placeholder="password"
            value={authPassword}
            onChange={(event) => setAuthPassword(event.target.value)}
          />
        </label>

        {authMessage ? <div className="status-banner success-banner">{authMessage}</div> : null}
        {authError ? <div className="status-banner error-banner">{authError}</div> : null}

        <button className="primary-button" onClick={submitAuth} disabled={isAuthLoading}>
          {authMode === "sign-up" ? "Create Account" : "Sign In"}
        </button>

        {canUseDevBypass ? (
          <button className="secondary-button" onClick={enableDevBypass} disabled={isAuthLoading}>
            Use Local Mode For Testing
          </button>
        ) : null}
      </section>
    </main>
  );
}

function App() {
  const localSessions = useMemo(
    () => sortSessionsNewestFirst(parseStoredJson(SESSION_STORAGE_KEY, [])),
    []
  );
  const localBanker = useMemo(
    () => normalizeBankerState(parseStoredJson(BANKER_STORAGE_KEY, createDefaultBankerState())),
    []
  );
  const localBankerDays = useMemo(
    () => sortBankerDaysNewestFirst(parseStoredJson(BANKER_DAYS_STORAGE_KEY, [])),
    []
  );

  const [page, setPage] = useState("home");
  const [sessions, setSessions] = useState(localSessions);
  const [banker, setBanker] = useState(localBanker);
  const [bankerDays, setBankerDays] = useState(localBankerDays);
  const [form, setForm] = useState(createDefaultForm);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [errors, setErrors] = useState({});
  const [gameFilter, setGameFilter] = useState("All");
  const [resultFilter, setResultFilter] = useState("All");
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [expandedBankerDayId, setExpandedBankerDayId] = useState(null);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [playerBuyInInputs, setPlayerBuyInInputs] = useState({});
  const [playerCashOutInputs, setPlayerCashOutInputs] = useState({});
  const [detailsMode, setDetailsMode] = useState("sessions");
  const [analyticsMode, setAnalyticsMode] = useState("summary");
  const [authMode, setAuthMode] = useState("sign-in");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [cloudError, setCloudError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [user, setUser] = useState(null);
  const [useDevAuthBypass, setUseDevAuthBypass] = useState(getStoredDevAuthBypass);
  const useCloudSync = isSupabaseConfigured && !useDevAuthBypass;
  const [isAuthLoading, setIsAuthLoading] = useState(useCloudSync);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const cloudReadyRef = useRef(false);
  const bankerDraftTimeoutRef = useRef(null);

  useEffect(() => {
    if (useCloudSync) {
      return;
    }

    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions, useCloudSync]);

  useEffect(() => {
    if (useCloudSync) {
      return;
    }

    window.localStorage.setItem(BANKER_STORAGE_KEY, JSON.stringify(banker));
  }, [banker, useCloudSync]);

  useEffect(() => {
    if (useCloudSync) {
      return;
    }

    window.localStorage.setItem(BANKER_DAYS_STORAGE_KEY, JSON.stringify(bankerDays));
  }, [bankerDays, useCloudSync]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      DEV_AUTH_BYPASS_STORAGE_KEY,
      useDevAuthBypass ? "true" : "false"
    );
  }, [useDevAuthBypass]);

  useEffect(() => {
    if (!useCloudSync) {
      setUser(null);
      setIsAuthLoading(false);
      return;
    }

    let isMounted = true;

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setUser(nextSession?.user ?? null);
      setIsAuthLoading(false);
      setAuthMessage("");
      setAuthError("");
    });

    async function initializeAuth() {
      const callbackError = getAuthCallbackMessage();
      if (callbackError && isMounted) {
        setAuthError(callbackError);
      }

      const code = new URL(window.location.href).searchParams.get("code");
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!isMounted) {
          return;
        }

        if (error) {
          setAuthError(error.message);
          setUser(null);
          setIsAuthLoading(false);
          clearAuthCallbackUrl();
          return;
        }

        setUser(data.session?.user ?? null);
        setIsAuthLoading(false);
        clearAuthCallbackUrl();
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (!isMounted) {
        return;
      }

      if (error) {
        setAuthError(error.message);
      }

      setUser(data.session?.user ?? null);
      setIsAuthLoading(false);
    }

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [useCloudSync]);

  useEffect(() => {
    if (!useCloudSync || !user) {
      setShowWelcomeMessage(false);
      return;
    }

    setShowWelcomeMessage(true);
    const timeoutId = window.setTimeout(() => {
      setShowWelcomeMessage(false);
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [useCloudSync, user]);

  useEffect(() => {
    if (!useCloudSync || !user) {
      cloudReadyRef.current = false;
      if (useCloudSync && !user) {
        setSessions([]);
        setBanker(createDefaultBankerState());
        setBankerDays([]);
      }
      return;
    }

    let cancelled = false;

    async function loadCloudData() {
      setIsDataLoading(true);
      setCloudError("");

      const [
        sessionsResponse,
        bankerDaysResponse,
        bankerDraftResponse
      ] = await Promise.all([
        supabase
          .from("poker_sessions")
          .select("*")
          .order("date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("banker_days")
          .select("*")
          .order("date", { ascending: false })
          .order("saved_at", { ascending: false }),
        supabase
          .from("banker_drafts")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle()
      ]);

      if (cancelled) {
        return;
      }

      if (sessionsResponse.error || bankerDaysResponse.error || bankerDraftResponse.error) {
        setCloudError(
          sessionsResponse.error?.message ||
            bankerDaysResponse.error?.message ||
            bankerDraftResponse.error?.message ||
            "Could not load cloud data."
        );
        setIsDataLoading(false);
        return;
      }

      let nextSessions = sortSessionsNewestFirst(sessionsResponse.data.map(sessionFromRow));
      let nextBankerDays = sortBankerDaysNewestFirst(bankerDaysResponse.data.map(bankerDayFromRow));
      let nextBanker = bankerDraftResponse.data
        ? bankerDraftFromRow(bankerDraftResponse.data)
        : createDefaultBankerState();

      if (!nextSessions.length && localSessions.length) {
        const { error } = await supabase
          .from("poker_sessions")
          .insert(localSessions.map((session) => sessionToRow(session, user.id)));

        if (!error) {
          nextSessions = localSessions;
        }
      }

      if (!nextBankerDays.length && localBankerDays.length) {
        const { error } = await supabase
          .from("banker_days")
          .insert(localBankerDays.map((day) => bankerDayToRow(day, user.id)));

        if (!error) {
          nextBankerDays = localBankerDays;
        }
      }

      const hasRemoteDraft = Boolean(bankerDraftResponse.data);
      const hasLocalDraft =
        localBanker.players.length || localBanker.gameType || localBanker.customGameType;

      if (!hasRemoteDraft && hasLocalDraft) {
        const { error } = await supabase
          .from("banker_drafts")
          .upsert(bankerDraftToRow(localBanker, user.id), { onConflict: "user_id" });

        if (!error) {
          nextBanker = localBanker;
        }
      }

      if (cancelled) {
        return;
      }

      setSessions(nextSessions);
      setBanker(nextBanker);
      setBankerDays(nextBankerDays);
      setIsDataLoading(false);
      cloudReadyRef.current = true;
    }

    loadCloudData();

    return () => {
      cancelled = true;
    };
  }, [user, localSessions, localBanker, localBankerDays, useCloudSync]);

  useEffect(() => {
    if (!useCloudSync || !user || !cloudReadyRef.current) {
      return;
    }

    window.clearTimeout(bankerDraftTimeoutRef.current);
    bankerDraftTimeoutRef.current = window.setTimeout(async () => {
      const { error } = await supabase
        .from("banker_drafts")
        .upsert(bankerDraftToRow(banker, user.id), { onConflict: "user_id" });

      if (error) {
        setCloudError(error.message);
      }
    }, 500);

    return () => {
      window.clearTimeout(bankerDraftTimeoutRef.current);
    };
  }, [banker, user, useCloudSync]);

  const stats = useMemo(() => calculateStats(sessions), [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const matchesGame = gameFilter === "All" || getSessionLabel(session) === gameFilter;
      const matchesResult =
        resultFilter === "All" ||
        (resultFilter === "Wins" && session.net > 0) ||
        (resultFilter === "Losses" && session.net < 0) ||
        (resultFilter === "Even" && session.net === 0);

      return matchesGame && matchesResult;
    });
  }, [gameFilter, resultFilter, sessions]);

  const filteredSessionStats = useMemo(() => calculateStats(filteredSessions), [filteredSessions]);

  const availableGameFilters = useMemo(() => {
    const values = Array.from(new Set(sessions.map(getSessionLabel)));
    return ["All", ...values];
  }, [sessions]);

  const bankerTotals = useMemo(() => calculateBankerTotals(banker.players), [banker.players]);

  const availableMonths = useMemo(
    () => Array.from(new Set(sessions.map((session) => getMonthKey(session.date)))).sort().reverse(),
    [sessions]
  );

  useEffect(() => {
    if ((!selectedMonth || !availableMonths.includes(selectedMonth)) && availableMonths.length) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  const monthlyAnalytics = useMemo(
    () => calculateMonthlyAnalytics(sessions, selectedMonth),
    [selectedMonth, sessions]
  );

  const monthCalendarDays = useMemo(() => getCalendarDays(selectedMonth), [selectedMonth]);

  const dailyTotals = useMemo(() => {
    return monthlyAnalytics.sessions.reduce((map, session) => {
      const current = map.get(session.date) || 0;
      map.set(session.date, current + session.net);
      return map;
    }, new Map());
  }, [monthlyAnalytics.sessions]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  function openNewSessionForm() {
    setEditingSessionId(null);
    setForm(createDefaultForm());
    setErrors({});
    setCloudError("");
    setPage("log");
  }

  function openEditSession(session) {
    setEditingSessionId(session.id);
    setForm(sessionToForm(session));
    setErrors({});
    setCloudError("");
    setPage("log");
  }

  function validateForm() {
    const nextErrors = {};
    const buyIn = Number(form.buyIn);
    const outputValue = form.gameType === "tourney" ? Number(form.payout) : Number(form.cashOut);

    if (!form.date) {
      nextErrors.date = "Date is required.";
    }

    if (!form.gameType) {
      nextErrors.gameType = "Select a game type.";
    }

    if (form.gameType === "other" && !form.customGameType.trim()) {
      nextErrors.customGameType = "Enter the game type.";
    }

    if (!form.buyIn || Number.isNaN(buyIn) || buyIn < 0) {
      nextErrors.buyIn = "Enter a valid buy in.";
    }

    if (form.gameType !== "tourney" && !form.stakes.trim()) {
      nextErrors.stakes = "Stakes are required.";
    }

    if (
      form.gameType === "tourney" &&
      (form.payout === "" || Number.isNaN(outputValue) || outputValue < 0)
    ) {
      nextErrors.payout = "Enter a valid amount made.";
    }

    if (
      form.gameType !== "tourney" &&
      (form.cashOut === "" || Number.isNaN(outputValue) || outputValue < 0)
    ) {
      nextErrors.cashOut = "Enter a valid cash out.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSaveSession(event) {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    const buyIn = Number(form.buyIn);
    const payout = form.gameType === "tourney" ? Number(form.payout) : null;
    const cashOut = form.gameType === "tourney" ? null : Number(form.cashOut);
    const net = form.gameType === "tourney" ? payout - buyIn : cashOut - buyIn;

    const existingSession = editingSessionId
      ? sessions.find((session) => session.id === editingSessionId)
      : null;

    const nextSession = {
      id: editingSessionId || generateId(),
      date: form.date,
      gameType: form.gameType,
      customGameType: form.customGameType.trim(),
      buyIn,
      payout,
      cashOut,
      stakes: form.gameType === "tourney" ? "" : form.stakes.trim(),
      location: form.location.trim(),
      net,
      createdAt: existingSession?.createdAt || Date.now()
    };

    if (useCloudSync && user) {
      const row = sessionToRow(nextSession, user.id);
      const { error } = editingSessionId
        ? await supabase.from("poker_sessions").update(row).eq("id", editingSessionId)
        : await supabase.from("poker_sessions").insert(row);

      if (error) {
        setCloudError(error.message);
        return;
      }
    }

    setSessions((current) =>
      sortSessionsNewestFirst(
        editingSessionId
          ? current.map((session) => (session.id === editingSessionId ? nextSession : session))
          : [nextSession, ...current]
      )
    );
    setEditingSessionId(null);
    setForm(createDefaultForm());
    setErrors({});
    setPage("details");
  }

  async function deleteSession(id) {
    if (useCloudSync && user) {
      const { error } = await supabase.from("poker_sessions").delete().eq("id", id);
      if (error) {
        setCloudError(error.message);
        return;
      }
    }

    setSessions((current) => current.filter((session) => session.id !== id));
    if (editingSessionId === id) {
      setEditingSessionId(null);
      setForm(createDefaultForm());
      setPage("details");
    }
    if (expandedSessionId === id) {
      setExpandedSessionId(null);
    }
  }

  async function shareBankerSummary(day) {
    setShareMessage("");
    setCloudError("");

    try {
      const blob = await createBankerSummaryImageBlob(day);
      const filename = `home-game-${day.date || "summary"}.png`;
      const file = new File([blob], filename, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `${getBankerGameLabel(day)} Summary`,
          files: [file]
        });
      } else {
        downloadBlob(blob, filename);
        setShareMessage("Home game summary image downloaded.");
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        setCloudError(error.message || "Could not create the home game summary image.");
      }
    }
  }

  function addPlayer() {
    const trimmedName = newPlayerName.trim();
    if (!trimmedName) {
      return;
    }

    const exists = banker.players.some(
      (player) => player.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (exists) {
      return;
    }

    setBanker((current) => ({
      ...current,
      players: [
        ...current.players,
        {
          id: generateId(),
          name: trimmedName,
          buyIns: [],
          cashOut: 0
        }
      ]
    }));
    setNewPlayerName("");
  }

  function removePlayer(id) {
    setBanker((current) => ({
      ...current,
      players: current.players.filter((player) => player.id !== id)
    }));
    setExpandedPlayerId((current) => (current === id ? null : current));
    setPlayerBuyInInputs((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setPlayerCashOutInputs((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function addBuyIn(playerId) {
    const rawValue = playerBuyInInputs[playerId] ?? "";
    const amount = Number(rawValue);
    if (rawValue === "" || Number.isNaN(amount) || amount < 0) {
      return;
    }

    setBanker((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === playerId
          ? { ...player, buyIns: [...player.buyIns, amount] }
          : player
      )
    }));
    setPlayerBuyInInputs((current) => ({ ...current, [playerId]: "" }));
  }

  function updateCashOut(playerId, value) {
    const amount = Number(value);
    setBanker((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === playerId
          ? { ...player, cashOut: value === "" || Number.isNaN(amount) ? 0 : amount }
          : player
      )
    }));
  }

  function addCashOut(playerId) {
    const rawValue = playerCashOutInputs[playerId] ?? "";
    const amount = Number(rawValue);
    if (rawValue === "" || Number.isNaN(amount) || amount < 0) {
      return;
    }

    updateCashOut(playerId, rawValue);
    setPlayerCashOutInputs((current) => ({ ...current, [playerId]: "" }));
  }

  async function saveBankerDay() {
    if (
      !banker.players.length ||
      !banker.gameType ||
      (banker.gameType === "other" && !banker.customGameType.trim())
    ) {
      return;
    }

    const savedAt = Date.now();
    const snapshot = createBankerDaySnapshot(banker, savedAt);

    if (useCloudSync && user) {
      const { error } = await supabase
        .from("banker_days")
        .upsert(bankerDayToRow(snapshot, user.id), { onConflict: "id" });

      if (error) {
        setCloudError(error.message);
        return;
      }
    }

    setBankerDays((current) =>
      sortBankerDaysNewestFirst([snapshot, ...current.filter((item) => item.id !== snapshot.id)])
    );
    setBanker(createDefaultBankerState());
    setExpandedPlayerId(null);
    setPlayerBuyInInputs({});
    setPlayerCashOutInputs({});
  }

  function openBankerDay(day) {
    setBanker(
      normalizeBankerState({
        id: day.id,
        date: day.date,
        gameType: day.gameType || "",
        customGameType: day.customGameType || "",
        players: day.players
      })
    );
    setExpandedPlayerId(null);
    setPlayerBuyInInputs({});
    setPlayerCashOutInputs({});
    setPage("banker");
  }

  async function deleteBankerDay(id) {
    if (useCloudSync && user) {
      const { error } = await supabase.from("banker_days").delete().eq("id", id);
      if (error) {
        setCloudError(error.message);
        return;
      }
    }

    setBankerDays((current) => current.filter((day) => day.id !== id));
    setExpandedBankerDayId((current) => (current === id ? null : current));
    setBanker((current) => (current.id === id ? createDefaultBankerState() : current));
  }

  async function submitAuth() {
    const username = normalizeAuthUsername(authUsername);
    const password = authPassword;

    if (!username) {
      setAuthError("Enter a username first.");
      return;
    }

    if (!/^[a-z0-9._-]{3,20}$/.test(username)) {
      setAuthError("Use 3-20 letters, numbers, dots, underscores, or dashes.");
      return;
    }

    if (!password) {
      setAuthError("Enter a password first.");
      return;
    }

    if (authMode === "sign-up" && password.length < 6) {
      setAuthError("Password must be at least 6 characters.");
      return;
    }

    setAuthError("");
    setAuthMessage("");
    setIsAuthLoading(true);
    const email = usernameToEmail(username);

    const { error } =
      authMode === "sign-up"
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                username
              }
            }
          })
        : await supabase.auth.signInWithPassword({
            email,
            password
          });

    setIsAuthLoading(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthMessage(
      authMode === "sign-up"
        ? "Account created. You should now be signed in on this device."
        : "Signed in."
    );
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setCloudError(error.message);
    }
  }

  function enableDevBypass() {
    setUseDevAuthBypass(true);
    setAuthError("");
    setAuthMessage("");
    setCloudError("");
    setIsAuthLoading(false);
  }

  function disableDevBypass() {
    setUseDevAuthBypass(false);
    setAuthError("");
    setAuthMessage("");
    setCloudError("");
    setIsAuthLoading(true);
  }

  const bottomStatus = useCloudSync && user
    ? `Signed in as ${getUserDisplayName(user)}`
    : isSupabaseConfigured && useDevAuthBypass
      ? "Local testing mode active"
      : !isSupabaseConfigured
        ? "Local mode active"
        : "";

  const homeView = (
    <section className="landing-shell">
      {useCloudSync && user ? (
        <p className={`welcome-copy ${showWelcomeMessage ? "visible" : "hidden"}`.trim()}>
          Welcome back {getUserDisplayName(user)}
        </p>
      ) : null}
      <CloudIcon />
      <div className="stats-row">
        <Stat
          label="Total Profit"
          value={formatSignedCurrency(stats.totalProfit)}
          emphasis={stats.totalProfit > 0 ? "positive" : stats.totalProfit < 0 ? "negative" : ""}
        />
        <Stat label="Win Rate" value={`${stats.winRate}%`} />
        <Stat label="Sessions" value={stats.sessions} />
      </div>
      <div className="action-row">
        <button type="button" className="primary-button" onClick={openNewSessionForm}>
          Log Session
        </button>
        <button type="button" className="secondary-button" onClick={() => setPage("details")}>
          View Details
        </button>
        <button type="button" className="secondary-button" onClick={() => setPage("banker")}>
          Banker
        </button>
      </div>
    </section>
  );

  const logView = (
    <section className="panel">
      <div className="panel-header">
        <button className="ghost-button" onClick={() => setPage("home")}>
          Back
        </button>
        <h1>{editingSessionId ? "Edit Session" : "Log Session"}</h1>
      </div>

      <form className="form-grid" onSubmit={handleSaveSession}>
        {cloudError ? <div className="status-banner error-banner">{cloudError}</div> : null}

        <label className="field">
          <span>Date</span>
          <input type="date" value={form.date} onChange={(event) => updateForm("date", event.target.value)} />
          {errors.date ? <small>{errors.date}</small> : null}
        </label>

        <div className="field">
          <span>Game Type</span>
          <div className="chip-row">
            {GAME_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={form.gameType === option ? "chip active" : "chip"}
                onClick={() => updateForm("gameType", option)}
              >
                {option}
              </button>
            ))}
          </div>
          {errors.gameType ? <small>{errors.gameType}</small> : null}
        </div>

        {form.gameType ? (
          <>
            {form.gameType === "other" ? (
              <label className="field">
                <span>Custom Game Type</span>
                <input
                  type="text"
                  placeholder="What game type was it?"
                  value={form.customGameType}
                  onChange={(event) => updateForm("customGameType", event.target.value)}
                />
                {errors.customGameType ? <small>{errors.customGameType}</small> : null}
              </label>
            ) : null}

            <label className="field">
              <span>Buy In</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0"
                value={form.buyIn}
                onChange={(event) => updateForm("buyIn", event.target.value)}
              />
              {errors.buyIn ? <small>{errors.buyIn}</small> : null}
            </label>

            {form.gameType === "tourney" ? (
              <label className="field">
                <span>How Much You Made</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.payout}
                  onChange={(event) => updateForm("payout", event.target.value)}
                />
                {errors.payout ? <small>{errors.payout}</small> : null}
              </label>
            ) : (
              <>
                <label className="field">
                  <span>Cash Out</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                    value={form.cashOut}
                    onChange={(event) => updateForm("cashOut", event.target.value)}
                  />
                  {errors.cashOut ? <small>{errors.cashOut}</small> : null}
                </label>

                <label className="field">
                  <span>Stakes</span>
                  <input
                    type="text"
                    placeholder="1/3, 2/5, home .50/1"
                    value={form.stakes}
                    onChange={(event) => updateForm("stakes", event.target.value)}
                  />
                  {errors.stakes ? <small>{errors.stakes}</small> : null}
                </label>
              </>
            )}

            <label className="field">
              <span>Location</span>
              <input
                type="text"
                placeholder="Optional"
                value={form.location}
                onChange={(event) => updateForm("location", event.target.value)}
              />
            </label>
          </>
        ) : null}

        <div className="form-actions">
          <button className="primary-button" type="submit">
            {editingSessionId ? "Update Session" : "Save Session"}
          </button>
          {editingSessionId ? (
            <button className="delete-button" type="button" onClick={() => deleteSession(editingSessionId)}>
              Delete Session
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );

  const detailsView = (
    <section className="panel">
      <div className="panel-header">
        <button className="ghost-button" onClick={() => setPage("home")}>
          Back
        </button>
        <h1>View Details</h1>
        <button className="primary-button compact" onClick={openNewSessionForm}>
          Log Session
        </button>
      </div>

      <div className="details-tabs">
        <div className="tab-row">
          <button
            type="button"
            className={detailsMode === "sessions" ? "view-tab active" : "view-tab"}
            onClick={() => setDetailsMode("sessions")}
          >
            Sessions
          </button>
          <button
            type="button"
            className={detailsMode === "analytics" ? "view-tab active" : "view-tab"}
            onClick={() => setDetailsMode("analytics")}
          >
            Monthly Analytics
          </button>
        </div>
      </div>

      {detailsMode === "sessions" ? (
        <>
          <div className="banker-summary">
            <Stat label="Profit" value={formatSignedCurrency(filteredSessionStats.totalProfit)} />
            <Stat label="Win Rate" value={`${filteredSessionStats.winRate}%`} />
            <Stat label="Sessions" value={filteredSessionStats.sessions} />
          </div>

          <div className="filters">
            <label className="field inline-field">
              <span>Game</span>
              <select value={gameFilter} onChange={(event) => setGameFilter(event.target.value)}>
                {availableGameFilters.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field inline-field">
              <span>Result</span>
              <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value)}>
                {RESULT_FILTERS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="stack">
            {filteredSessions.length ? (
              filteredSessions.map((session) => {
                const expanded = expandedSessionId === session.id;
                const sessionLabel = getSessionLabel(session);
                const outputLabel = session.gameType === "tourney" ? "Made" : "Cash Out";
                const outputValue = session.gameType === "tourney" ? session.payout : session.cashOut;

                return (
                  <article key={session.id} className="card">
                    <div className="card-row">
                      <button
                        className="card-main"
                        onClick={() => setExpandedSessionId(expanded ? null : session.id)}
                      >
                        <div>
                          <h2>{sessionLabel}</h2>
                          <p>
                            {formatDisplayDate(session.date)}
                            {session.location ? <span className="meta-inline">· {session.location}</span> : null}
                          </p>
                        </div>
                        <div className="card-summary">
                          <strong className={session.net > 0 ? "positive" : session.net < 0 ? "negative" : ""}>
                            {formatSignedCurrency(session.net)}
                          </strong>
                          {session.stakes ? <em className="badge">{session.stakes}</em> : null}
                        </div>
                      </button>

                      <button className="secondary-button compact" onClick={() => openEditSession(session)}>
                        Edit
                      </button>
                    </div>

                    {expanded ? (
                      <div className="expanded">
                        <p>Buy In: {formatCurrency(session.buyIn)}</p>
                        <p>
                          {outputLabel}: {formatCurrency(outputValue)}
                        </p>
                        <p>Location: {session.location || "Not set"}</p>
                      </div>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <div className="empty-state">
                <p>No sessions match your filters yet.</p>
              </div>
            )}
          </div>
        </>
      ) : null}

      {detailsMode === "analytics" ? (
        availableMonths.length ? (
          <>
            <div className="analytics-subnav">
              <div className="segmented-control">
                <button
                  type="button"
                  className={analyticsMode === "summary" ? "segment-button active" : "segment-button"}
                  onClick={() => setAnalyticsMode("summary")}
                >
                  Summary
                </button>
                <button
                  type="button"
                  className={analyticsMode === "calendar" ? "segment-button active" : "segment-button"}
                  onClick={() => setAnalyticsMode("calendar")}
                  aria-label="Calendar view"
                  title="Calendar view"
                >
                  📅
                </button>
              </div>
            </div>

            <label className="field inline-field">
              <span>Month</span>
              <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
                {availableMonths.map((month) => (
                  <option key={month} value={month}>
                    {formatMonthLabel(month)}
                  </option>
                ))}
              </select>
            </label>

            {analyticsMode === "summary" ? (
              <>
                <div className="banker-summary">
                  <Stat label="Profit" value={formatSignedCurrency(monthlyAnalytics.totalProfit)} />
                  <Stat label="Sessions" value={monthlyAnalytics.sessions.length} />
                  <Stat label="Avg / Session" value={formatSignedCurrency(monthlyAnalytics.averageProfit)} />
                </div>

                <div className="analytics-grid">
                  <article className="card analytics-card">
                    <h2>{formatMonthLabel(selectedMonth)}</h2>
                    <p>Wins: {monthlyAnalytics.wins}</p>
                    <p>Losses: {monthlyAnalytics.losses}</p>
                    <p>Even: {monthlyAnalytics.even}</p>
                    <p>Total Buy In: {formatCurrency(monthlyAnalytics.totalBuyIn)}</p>
                  </article>

                  <article className="card analytics-card">
                    <h2>Game Breakdown</h2>
                    {monthlyAnalytics.sessions.length ? (
                      Array.from(
                        monthlyAnalytics.sessions.reduce((map, session) => {
                          const label = getSessionLabel(session);
                          map.set(label, (map.get(label) || 0) + session.net);
                          return map;
                        }, new Map())
                      ).map(([label, value]) => (
                        <p key={label}>
                          {label}: {formatSignedCurrency(value)}
                        </p>
                      ))
                    ) : (
                      <p>No sessions in this month.</p>
                    )}
                  </article>
                </div>
              </>
            ) : null}

            {analyticsMode === "calendar" ? (
              <>
                <div className="calendar-weekdays">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="calendar-weekday">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="calendar-grid compact-calendar-grid">
                  {monthCalendarDays.map((dateKey, index) => {
                    if (!dateKey) {
                      return <div key={`blank-${index}`} className="calendar-cell empty-calendar-cell" />;
                    }

                    const total = dailyTotals.get(dateKey) || 0;
                    const hasSessions = dailyTotals.has(dateKey);

                    return (
                      <article key={dateKey} className="calendar-cell">
                        <div className="calendar-date">{Number(dateKey.slice(-2))}</div>
                        <div
                          className={
                            total > 0
                              ? "calendar-total positive"
                              : total < 0
                                ? "calendar-total negative"
                                : "calendar-total"
                          }
                        >
                          {hasSessions ? formatSignedCurrency(total) : ""}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : null}
          </>
        ) : (
          <div className="empty-state">
            <p>Log a few sessions first to unlock monthly analytics.</p>
          </div>
        )
      ) : null}
    </section>
  );

  const bankerView = (
    <section className="panel">
      <div className="panel-header banker-header">
        <div className="header-side">
          <button className="ghost-button" onClick={() => setPage("home")}>
            Back
          </button>
        </div>
        <div className="header-center">
          <h1>Banker</h1>
          <p>{banker.id ? "Editing saved banker session" : "Current banker board"}</p>
        </div>
        <div className="header-side header-side-end">
          <button className="ghost-button compact" onClick={() => setPage("banker-history")}>
            Saved Sessions
          </button>
          <button
            className="secondary-button compact"
            onClick={() => shareBankerSummary(banker)}
            disabled={!banker.players.length}
          >
            Share
          </button>
          <button
            className="primary-button compact"
            onClick={saveBankerDay}
            disabled={
              !banker.players.length ||
              !banker.gameType ||
              (banker.gameType === "other" && !banker.customGameType.trim())
            }
          >
            {banker.id ? "Update Session" : "Save Session"}
          </button>
        </div>
      </div>

      <div className="banker-summary">
        <Stat label="Total Money" value={formatSignedCurrency(bankerTotals.totalMoney)} />
        <Stat label="Total Buy Ins" value={formatCurrency(bankerTotals.totalBuyIns)} />
        <Stat label="Date" value={formatDisplayDate(banker.date)} />
      </div>

      {shareMessage ? <div className="status-banner success-banner">{shareMessage}</div> : null}

      <label className="field">
        <span>Banker Date</span>
        <input
          type="date"
          value={banker.date}
          onChange={(event) => setBanker((current) => ({ ...current, date: event.target.value }))}
        />
      </label>

      <div className="field">
        <span>Game Type</span>
        <div className="chip-row">
          {BANKER_GAME_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={banker.gameType === option ? "chip active" : "chip"}
              onClick={() =>
                setBanker((current) => ({
                  ...current,
                  gameType: option,
                  customGameType: option === "other" ? current.customGameType : ""
                }))
              }
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {banker.gameType === "other" ? (
        <label className="field">
          <span>Custom Game Type</span>
          <input
            type="text"
            placeholder="What game was it?"
            value={banker.customGameType}
            onChange={(event) =>
              setBanker((current) => ({ ...current, customGameType: event.target.value }))
            }
          />
        </label>
      ) : null}

      <div className="player-add-row">
        <input
          type="text"
          placeholder="Add player name"
          value={newPlayerName}
          onChange={(event) => setNewPlayerName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addPlayer();
            }
          }}
        />
        <button className="primary-button compact" onClick={addPlayer}>
          Add Player
        </button>
      </div>

      <div className="stack">
        {banker.players.length
          ? banker.players.map((player) => {
              const totalBuyIn = calculatePlayerTotal(player);
              const cashOut = Number(player.cashOut) || 0;
              const result = cashOut - totalBuyIn;
              const expanded = expandedPlayerId === player.id;

              return (
                <article key={player.id} className="card banker-player-card">
                  <div className="card-row">
                    <button
                      className="card-main"
                      onClick={() => setExpandedPlayerId(expanded ? null : player.id)}
                    >
                      <div>
                        <h2>{player.name}</h2>
                        <p>{player.buyIns.length} buy-in{player.buyIns.length === 1 ? "" : "s"}</p>
                      </div>
                      <div className="card-summary">
                        <strong>{formatSignedCurrency(result)}</strong>
                        <span>{formatCurrency(cashOut)} left · {formatCurrency(totalBuyIn)} in</span>
                      </div>
                    </button>

                    <button className="delete-button compact banker-remove-button" onClick={() => removePlayer(player.id)}>
                      Remove
                    </button>
                  </div>

                  <div className="player-controls">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="Buy in"
                      value={playerBuyInInputs[player.id] ?? ""}
                      onChange={(event) =>
                        setPlayerBuyInInputs((current) => ({
                          ...current,
                          [player.id]: event.target.value
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addBuyIn(player.id);
                        }
                      }}
                    />
                    <button className="secondary-button compact buyin-button" onClick={() => addBuyIn(player.id)}>
                      Add Buy In
                    </button>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="Cashout"
                      value={playerCashOutInputs[player.id] ?? ""}
                      onChange={(event) =>
                        setPlayerCashOutInputs((current) => ({
                          ...current,
                          [player.id]: event.target.value
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addCashOut(player.id);
                        }
                      }}
                    />
                  </div>

                  {expanded ? (
                    <div className="expanded">
                      <p>
                        Buy-In History:{" "}
                        {player.buyIns.length
                          ? player.buyIns.map((value) => formatCurrency(value)).join(", ")
                          : "No buy-ins yet"}
                      </p>
                      <p>Winnings/Losses: {formatSignedCurrency(result)}</p>
                      <p>Amount Left: {formatCurrency(cashOut)}</p>
                    </div>
                  ) : null}
                </article>
              );
            })
          : null}
      </div>
    </section>
  );

  const bankerHistoryView = (
    <section className="panel">
      <div className="panel-header">
        <button className="ghost-button" onClick={() => setPage("banker")}>
          Back
        </button>
        <h1>Saved Banker Sessions</h1>
      </div>

      <div className="saved-section">
        {shareMessage ? <div className="status-banner success-banner">{shareMessage}</div> : null}

        <div className="stack">
          {bankerDays.length ? (
            bankerDays.map((day) => {
              const totals = calculateBankerTotals(day.players);
              const expanded = expandedBankerDayId === day.id;

              return (
                <article key={day.id} className="card">
                  <div className="card-row">
                    <button
                      className="card-main"
                      onClick={() => setExpandedBankerDayId(expanded ? null : day.id)}
                    >
                      <div>
                        <h2>{formatDisplayDate(day.date)}</h2>
                        <p>
                          {getBankerGameLabel(day)} · {day.players.length} player
                          {day.players.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="card-summary">
                        <strong>{formatSignedCurrency(totals.totalMoney)}</strong>
                        <span>{formatCurrency(totals.totalBuyIns)} total buy-ins</span>
                      </div>
                    </button>

                    <button className="secondary-button compact" onClick={() => openBankerDay(day)}>
                      Edit
                    </button>
                    <button className="secondary-button compact" onClick={() => shareBankerSummary(day)}>
                      Share
                    </button>
                    <button className="delete-button" onClick={() => deleteBankerDay(day.id)}>
                      Delete
                    </button>
                  </div>

                  {expanded ? (
                    <div className="expanded">
                      <p>Total Cash Out: {formatCurrency(totals.totalCashOut)}</p>
                      <p>
                        Players:{" "}
                        {day.players.length
                          ? day.players.map((player) => player.name).join(", ")
                          : "No players"}
                      </p>
                    </div>
                  ) : null}
                </article>
              );
            })
          ) : (
            <div className="empty-state">
              <p>No banker sessions saved yet.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );

  const shell = (
    <main className="app-shell">
      {cloudError ? <div className="top-banner error-banner">{cloudError}</div> : null}
      {!isSupabaseConfigured ? (
        <div className="top-banner neutral-banner">
          {supabaseConfigError || "Add your Supabase keys to enable cloud sync across devices."}
        </div>
      ) : null}

      {isDataLoading ? <div className="top-banner neutral-banner">Syncing your data…</div> : null}
      {page === "home" ? homeView : null}
      {page === "log" ? logView : null}
      {page === "details" ? detailsView : null}
      {page === "banker" ? bankerView : null}
      {page === "banker-history" ? bankerHistoryView : null}
      {bottomStatus ? <div className="bottom-status-note">{bottomStatus}</div> : null}
      {useCloudSync && user ? (
        <button className="ghost-button compact bottom-status-action" onClick={signOut}>
          Sign Out
        </button>
      ) : null}
      {isSupabaseConfigured && useDevAuthBypass ? (
        <button className="ghost-button compact bottom-status-action" onClick={disableDevBypass}>
          Re-enable Cloud Sync
        </button>
      ) : null}
    </main>
  );

  if (useCloudSync && !user) {
    return (
      <>
        {isAuthLoading ? (
          <main className="app-shell">
            <section className="auth-panel">
              <CloudIcon />
              <h1>Loading</h1>
              <p>Checking your sign-in session…</p>
            </section>
          </main>
        ) : (
          <AuthView
            authMode={authMode}
            setAuthMode={setAuthMode}
            authUsername={authUsername}
            setAuthUsername={setAuthUsername}
            authPassword={authPassword}
            setAuthPassword={setAuthPassword}
            authMessage={authMessage}
            authError={authError}
            submitAuth={submitAuth}
            isAuthLoading={isAuthLoading}
            canUseDevBypass={import.meta.env.DEV}
            enableDevBypass={enableDevBypass}
          />
        )}
      </>
    );
  }

  return shell;
}

export default App;
