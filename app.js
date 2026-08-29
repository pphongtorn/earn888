// EARN888 — Asian handicap prediction game for the Premier League.
// Fixture/result data: ESPN's public soccer scoreboard API (no key needed).
// Handicap odds: The Odds API (the-odds-api.com) — needs a free API key, set below.
// Shared data (users, codes, bets, balances) lives in Firestore so every
// phone sees the same data; localStorage is kept as an offline fallback cache.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDOMhr6dmpXNC5QxBCpa8kocK7t3Y9MZS0",
  authDomain: "earn888-9fd43.firebaseapp.com",
  projectId: "earn888-9fd43",
  storageBucket: "earn888-9fd43.firebasestorage.app",
  messagingSenderId: "644627928669",
  appId: "1:644627928669:web:4246f49a6030eb9ec0dfb4"
};
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
// Reuses the existing "premierPredictor" collection's open security rule,
// just under a different document name, to avoid needing a Firestore rules change.
const stateDocRef = doc(db, "premierPredictor", "earn888State");

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1";
const ODDS_API_BASE = "https://api.the-odds-api.com/v4/sports/soccer_epl/odds";
const ODDS_API_KEY = "dd78ce89124f42e4600fe9704624e0d1";

const DEFAULT_USERS = ["เอิน", "เสียง", "guru neung", "arm"];
// Static per-user verify codes — a casual gate between friends, not real security.
const DEFAULT_USER_CODES = {
  "เอิน": "EARN717",
  "เสียง": "TEE69",
  "guru neung": "1111",
  "arm": "arsenal"
};
const ADMIN_CODE = "Admin1234";
const STORAGE_KEY = "earn888State_v1";
const CALENDAR_CACHE_MS = 12 * 60 * 60 * 1000; // refresh the season calendar at most every 12h
const WEEKLY_CREDIT = 20000; // default THB credit each user gets, fresh every match week
const MIN_BET = 1000; // minimum THB stake per match

function loadState() {
  let state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? JSON.parse(raw) : null;
  } catch (e) { state = null; }

  if (!state) {
    state = {
      currentUser: DEFAULT_USERS[0],
      bets: {},            // { "season_round": { user: { matchId: { side, amount, line, odds } } } }
      weekBalances: {},    // { "season_round": { user: netProfitThb } }
      creditOverrides: {}, // { "season_round": { user: creditThb } } — admin overrides of the default 20,000
      seasonCalendar: null
    };
  }
  if (!Array.isArray(state.users)) state.users = DEFAULT_USERS.slice();
  if (!state.userCodes || typeof state.userCodes !== "object") state.userCodes = { ...DEFAULT_USER_CODES };
  if (!state.bets) state.bets = {};
  if (!state.weekBalances) state.weekBalances = {};
  if (!state.creditOverrides) state.creditOverrides = {};
  if (!state.users.includes(state.currentUser)) state.currentUser = state.users[0];
  return state;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const state = loadState();
const roundKey = (season, round) => `${season}_${round}`;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

// ---------- Cloud sync (Firestore) ----------
function sharedStateSnapshot() {
  return {
    users: state.users,
    userCodes: state.userCodes,
    bets: state.bets,
    weekBalances: state.weekBalances,
    creditOverrides: state.creditOverrides
  };
}

function applyCloudData(data) {
  if (!data) return;
  if (Array.isArray(data.users) && data.users.length) state.users = data.users;
  if (data.userCodes && typeof data.userCodes === "object") state.userCodes = data.userCodes;
  if (data.bets && typeof data.bets === "object") state.bets = data.bets;
  if (data.weekBalances && typeof data.weekBalances === "object") state.weekBalances = data.weekBalances;
  if (data.creditOverrides && typeof data.creditOverrides === "object") state.creditOverrides = data.creditOverrides;
  if (!state.users.includes(state.currentUser)) state.currentUser = state.users[0];
  saveState();
}

function syncToCloud(onFail) {
  saveState();
  return setDoc(stateDocRef, sharedStateSnapshot()).catch(err => {
    console.warn("cloud sync failed:", err);
    if (onFail) onFail(err);
  });
}

function startCloudSync() {
  onSnapshot(stateDocRef, (snap) => {
    if (snap.exists()) {
      applyCloudData(snap.data());
      renderUserSwitch();
      renderFixtureList();
      if (document.getElementById("tab-leaderboard").classList.contains("active")) renderLeaderboard();
      if (document.getElementById("tab-admin").classList.contains("active")) renderAdminPanel();
    } else {
      setDoc(stateDocRef, sharedStateSnapshot()).catch(err => console.warn("cloud seed failed:", err));
    }
  }, (err) => console.warn("cloud sync listener error:", err));
}

// ---------- Verify-code gates ----------
const verifiedUsers = new Set();

function ensureVerified(user) {
  if (verifiedUsers.has(user)) return true;
  const code = window.prompt(`กรอกรหัสยืนยันตัวตนของ ${user} เพื่อบันทึกโพย:`);
  if (code === null) return false;
  if (state.userCodes[user] && code.trim() === state.userCodes[user]) {
    verifiedUsers.add(user);
    return true;
  }
  window.alert("รหัสไม่ถูกต้อง");
  return false;
}

function ensureAdmin() {
  const code = window.prompt("กรอกรหัสแอดมิน:");
  if (code === null) return false;
  if (code.trim() === ADMIN_CODE) return true;
  window.alert("รหัสแอดมินไม่ถูกต้อง");
  return false;
}

// ---------- Team badge helpers ----------
function teamInitials(name) {
  if (!name) return "?";
  const words = name.replace(/^(AFC|FC)\s+/i, "").split(" ").filter(Boolean);
  return words.slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function teamColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 42%)`;
}

function teamBadgeHtml(name) {
  return `<span class="team-badge" style="background:${teamColor(name)}">${teamInitials(name)}</span>`;
}

// ---------- Kickoff / lock helpers ----------
function isKickedOff(match) {
  return Date.now() >= Date.parse(match.isoDateTime);
}

function formatKickoff(isoDateTime) {
  try {
    return new Date(isoDateTime).toLocaleString("th-TH", {
      weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
    });
  } catch (e) {
    return isoDateTime;
  }
}

// ---------- Season calendar (drives "Match Week N" -> date range) ----------
function clusterCalendarIntoWeeks(days) {
  if (!days.length) return [];
  const weeks = [];
  let current = [days[0]];
  for (let i = 1; i < days.length; i++) {
    const prevMs = Date.parse(days[i - 1] + "T00:00:00Z");
    const curMs = Date.parse(days[i] + "T00:00:00Z");
    const gapDays = Math.round((curMs - prevMs) / 86400000);
    if (gapDays <= 2) {
      current.push(days[i]);
    } else {
      weeks.push(current);
      current = [days[i]];
    }
  }
  weeks.push(current);
  return weeks;
}

function weekDateRange(weeks, round) {
  const week = weeks[round - 1];
  if (!week) return null;
  return { start: week[0], end: week[week.length - 1] };
}

function seasonKeyFromCalendar(calendar) {
  const firstDay = calendar.calendarDays[0];
  if (!firstDay) return "unknown";
  const y = parseInt(firstDay.slice(0, 4), 10);
  return `${y}-${y + 1}`;
}

function currentSeasonKey() {
  return state.seasonCalendar ? seasonKeyFromCalendar(state.seasonCalendar) : "unknown";
}

async function loadSeasonCalendar() {
  const cached = state.seasonCalendar;
  if (cached && Date.now() - cached.fetchedAt < CALENDAR_CACHE_MS) return cached;

  const res = await fetch(`${ESPN_BASE}/scoreboard`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  const league = (data.leagues || [])[0];
  const calendarDays = ((league && league.calendar) || []).map(s => s.slice(0, 10)).sort();
  const weeks = clusterCalendarIntoWeeks(calendarDays);

  const result = { calendarDays, weeks, fetchedAt: Date.now() };
  state.seasonCalendar = result;
  saveState();
  return result;
}

async function detectCurrentRound() {
  const calendar = await loadSeasonCalendar();
  const todayStr = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < calendar.weeks.length; i++) {
    const week = calendar.weeks[i];
    if (week[week.length - 1] >= todayStr) return i + 1;
  }
  return calendar.weeks.length || 1;
}

// ---------- Fixture/result fetching (ESPN) ----------
function normalizeEspnEvent(event) {
  const comp = event.competitions[0];
  const home = comp.competitors.find(c => c.homeAway === "home");
  const away = comp.competitors.find(c => c.homeAway === "away");
  const statusType = comp.status.type;
  const completed = !!statusType.completed;
  return {
    idEvent: event.id,
    strHomeTeam: home.team.displayName,
    strAwayTeam: away.team.displayName,
    isoDateTime: event.date,
    intHomeScore: completed ? home.score : null,
    intAwayScore: completed ? away.score : null,
    strStatus: statusType.shortDetail || statusType.description || ""
  };
}

async function fetchWeekMatches(round) {
  const calendar = await loadSeasonCalendar();
  const range = weekDateRange(calendar.weeks, round);
  if (!range) return [];
  const startStr = range.start.replace(/-/g, "");
  const endStr = range.end.replace(/-/g, "");
  const res = await fetch(`${ESPN_BASE}/scoreboard?dates=${startStr}-${endStr}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return (data.events || [])
    .map(normalizeEspnEvent)
    .sort((a, b) => a.isoDateTime.localeCompare(b.isoDateTime));
}

// ---------- Handicap odds fetching (The Odds API) + matching to ESPN fixtures ----------
function normalizeTeamName(name) {
  return (name || "").toLowerCase()
    .replace(/&/g, " and ") // ESPN uses "&" (e.g. "Brighton & Hove Albion"), Odds API spells "and" out
    .replace(/^afc\s+/, "").replace(/\s+fc$/, "")
    .replace(/[^a-z0-9]/g, "");
}

async function fetchAllAvailableOdds() {
  if (!ODDS_API_KEY) throw new Error("ยังไม่ได้ตั้งค่า API key สำหรับราคาต่อรอง");
  const url = `${ODDS_API_BASE}/?apiKey=${ODDS_API_KEY}&regions=eu&markets=spreads&oddsFormat=decimal`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API error ${res.status}`);
  return await res.json();
}

function findOddsEventForMatch(oddsEvents, match) {
  const normHome = normalizeTeamName(match.strHomeTeam);
  const normAway = normalizeTeamName(match.strAwayTeam);
  const matchTime = Date.parse(match.isoDateTime);
  return oddsEvents.find(ev => {
    const evHome = normalizeTeamName(ev.home_team);
    const evAway = normalizeTeamName(ev.away_team);
    const timeDiff = Math.abs(Date.parse(ev.commence_time) - matchTime);
    return evHome === normHome && evAway === normAway && timeDiff < 6 * 60 * 60 * 1000;
  }) || null;
}

function extractHandicapLines(oddsEvent) {
  if (!oddsEvent || !oddsEvent.bookmakers || !oddsEvent.bookmakers.length) return null;
  const bookmaker = oddsEvent.bookmakers.find(b => (b.markets || []).some(m => m.key === "spreads"));
  if (!bookmaker) return null;
  const market = bookmaker.markets.find(m => m.key === "spreads");
  const homeOutcome = market.outcomes.find(o => normalizeTeamName(o.name) === normalizeTeamName(oddsEvent.home_team));
  const awayOutcome = market.outcomes.find(o => normalizeTeamName(o.name) === normalizeTeamName(oddsEvent.away_team));
  if (!homeOutcome || !awayOutcome) return null;
  return {
    homeLine: homeOutcome.point, homeOdds: homeOutcome.price,
    awayLine: awayOutcome.point, awayOdds: awayOutcome.price,
    bookmaker: bookmaker.title
  };
}

function formatLine(line) {
  return line > 0 ? `+${line}` : `${line}`;
}

// ---------- Asian handicap settlement engine ----------
// Quarter lines (e.g. -0.25, -0.75) are a split bet across two adjacent
// whole/half lines; half the stake settles on each.
function isQuarterLine(line) {
  const q = Math.round(line * 4);
  return q % 2 !== 0;
}

function splitLine(line) {
  if (!isQuarterLine(line)) return [line];
  return [Math.round((line - 0.25) * 4) / 4, Math.round((line + 0.25) * 4) / 4];
}

function settleSubLine(adjustedMargin) {
  if (adjustedMargin > 0) return "win";
  if (adjustedMargin === 0) return "push";
  return "lose";
}

function settleHandicapBet({ amount, odds, line, side, homeGoals, awayGoals }) {
  const rawMargin = side === "H" ? (homeGoals - awayGoals) : (awayGoals - homeGoals);
  const subLines = splitLine(line);
  const portion = amount / subLines.length;
  let totalReturn = 0;
  subLines.forEach(subLine => {
    const outcome = settleSubLine(rawMargin + subLine);
    if (outcome === "win") totalReturn += portion * odds;
    else if (outcome === "push") totalReturn += portion;
  });
  return { stake: amount, return: totalReturn, profit: totalReturn - amount };
}

// ---------- Credit helpers ----------
function getWeekCredit(round, user) {
  const key = roundKey(currentSeasonKey(), round);
  const override = state.creditOverrides[key] && state.creditOverrides[key][user];
  return typeof override === "number" ? override : WEEKLY_CREDIT;
}

// ---------- Tabs ----------
document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  if (btn.dataset.tab === "leaderboard") renderLeaderboard();
  if (btn.dataset.tab === "admin") renderAdminPanel();
});

// ---------- User switch ----------
function renderUserSwitch() {
  const container = document.getElementById("userSwitch");
  container.innerHTML = state.users.map(u => `
    <button class="user-btn ${u === state.currentUser ? "active" : ""}" data-user="${escapeHtml(u)}">${escapeHtml(u)}</button>
  `).join("");
  document.getElementById("currentUserLabel").textContent = state.currentUser;
}

document.getElementById("userSwitch").addEventListener("click", (e) => {
  const btn = e.target.closest(".user-btn");
  if (!btn) return;
  state.currentUser = btn.dataset.user;
  saveState();
  resetDraftFromCommitted();
  renderUserSwitch();
  renderFixtureList();
});

// ---------- Predict / bet tab ----------
const predictRoundInput = document.getElementById("predictRound");

let currentFixtures = [];
let currentOddsMap = {}; // { matchId: { homeLine, homeOdds, awayLine, awayOdds } }
let currentRound = 1;
let draftBets = {}; // { matchId: { side, amount, line, odds } } — in-memory until submit

function committedBets(round, user) {
  const key = roundKey(currentSeasonKey(), round);
  return (state.bets[key] && state.bets[key][user]) || {};
}

function resetDraftFromCommitted() {
  draftBets = JSON.parse(JSON.stringify(committedBets(currentRound, state.currentUser)));
}

async function loadFixtures() {
  const round = parseInt(predictRoundInput.value, 10) || 1;
  const statusEl = document.getElementById("predictStatus");
  statusEl.textContent = "กำลังโหลดตารางแข่งและราคาต่อรอง...";
  try {
    const calendar = await loadSeasonCalendar();
    document.getElementById("predictSeasonLabel").textContent = seasonKeyFromCalendar(calendar);
    const events = await fetchWeekMatches(round);
    currentFixtures = events;
    currentRound = round;
    resetDraftFromCommitted();

    currentOddsMap = {};
    if (!events.length) {
      statusEl.textContent = "ไม่พบตารางแข่งสำหรับสัปดาห์นี้ ลองตรวจสอบสัปดาห์อีกครั้ง";
    } else {
      try {
        const oddsEvents = await fetchAllAvailableOdds();
        events.forEach(match => {
          const ev = findOddsEventForMatch(oddsEvents, match);
          const lines = extractHandicapLines(ev);
          if (lines) currentOddsMap[match.idEvent] = lines;
        });
        const withOdds = Object.keys(currentOddsMap).length;
        statusEl.textContent = `โหลดสำเร็จ: ${events.length} แมตช์ (มีราคาต่อรอง ${withOdds}/${events.length})`;
      } catch (oddsErr) {
        statusEl.textContent = `โหลดตารางแข่งสำเร็จ (${events.length} แมตช์) แต่โหลดราคาไม่สำเร็จ — ${oddsErr.message}`;
      }
    }
    renderFixtureList();
  } catch (err) {
    statusEl.textContent = "โหลดข้อมูลไม่สำเร็จ (เช็คอินเทอร์เน็ต) — " + err.message;
  }
}

function updateCreditBar() {
  const weekCredit = getWeekCredit(currentRound, state.currentUser);
  const totalBet = Object.values(draftBets).reduce((sum, b) => sum + (b.amount || 0), 0);
  const remaining = weekCredit - totalBet;
  const box = document.getElementById("creditBar");
  box.innerHTML = `
    <div class="credit-box"><div class="label">เครดิตสัปดาห์นี้</div><div class="value">${weekCredit.toLocaleString()} ฿</div></div>
    <div class="credit-box ${remaining < 0 ? "over" : ""}"><div class="label">คงเหลือ</div><div class="value">${remaining.toLocaleString()} ฿</div></div>
  `;
}

function renderFixtureList() {
  const committed = committedBets(currentRound, state.currentUser);
  const list = document.getElementById("fixtureList");
  list.innerHTML = "";

  currentFixtures.forEach(match => {
    const card = document.createElement("div");
    card.className = "fixture-card";
    const locked = isKickedOff(match);
    const odds = currentOddsMap[match.idEvent] || null;
    const bet = locked ? (committed[match.idEvent] || null) : (draftBets[match.idEvent] || null);

    let bodyHtml;
    if (locked) {
      bodyHtml = bet
        ? `<div class="locked-note">🔒 ปิดรับแทง — คุณแทง: ${bet.side === "H" ? match.strHomeTeam : match.strAwayTeam} (${formatLine(bet.line)}) ${bet.amount.toLocaleString()} ฿</div>`
        : `<div class="locked-note">🔒 ปิดรับแทง — คุณไม่ได้แทงแมตช์นี้</div>`;
    } else if (!odds) {
      bodyHtml = `<div class="no-odds">ยังไม่มีราคาต่อรองสำหรับแมตช์นี้ (ลองโหลดใหม่ใกล้วันแข่ง)</div>`;
    } else {
      bodyHtml = `
        <div class="odds-row">
          <button class="odds-btn ${bet && bet.side === "H" ? "selected" : ""}" data-side="H">
            <span class="line">${match.strHomeTeam} ${formatLine(odds.homeLine)}</span>
            <span class="price">@ ${odds.homeOdds.toFixed(2)}</span>
          </button>
          <button class="odds-btn ${bet && bet.side === "A" ? "selected" : ""}" data-side="A">
            <span class="line">${match.strAwayTeam} ${formatLine(odds.awayLine)}</span>
            <span class="price">@ ${odds.awayOdds.toFixed(2)}</span>
          </button>
        </div>
        <div class="bet-amount-row">
          <label>เดิมพัน (฿)</label>
          <input type="number" class="bet-amount-input" min="${MIN_BET}" step="100"
            placeholder="≥ ${MIN_BET.toLocaleString()}" value="${bet ? bet.amount || "" : ""}" ${bet ? "" : "disabled"}>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="fixture-teams">
        <span class="team home">${teamBadgeHtml(match.strHomeTeam)}<span class="team-name">${match.strHomeTeam}</span></span>
        <span class="vs">⚽</span>
        <span class="team away">${teamBadgeHtml(match.strAwayTeam)}<span class="team-name">${match.strAwayTeam}</span></span>
      </div>
      <div class="fixture-meta">${formatKickoff(match.isoDateTime)}${locked ? " · 🔒 ล็อคแล้ว" : ""}</div>
      ${bodyHtml}
    `;

    if (!locked && odds) {
      const amountInput = card.querySelector(".bet-amount-input");
      card.querySelectorAll(".odds-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          if (isKickedOff(match)) { renderFixtureList(); return; }
          const side = btn.dataset.side;
          const existing = draftBets[match.idEvent];
          draftBets[match.idEvent] = {
            side,
            amount: existing ? existing.amount : 0,
            line: side === "H" ? odds.homeLine : odds.awayLine,
            odds: side === "H" ? odds.homeOdds : odds.awayOdds
          };
          card.querySelectorAll(".odds-btn").forEach(b => b.classList.remove("selected"));
          btn.classList.add("selected");
          amountInput.disabled = false;
          updateCreditBar();
          updateSubmitState();
        });
      });
      amountInput.addEventListener("input", () => {
        if (isKickedOff(match)) { renderFixtureList(); return; }
        const val = parseInt(amountInput.value, 10) || 0;
        if (draftBets[match.idEvent]) draftBets[match.idEvent].amount = val;
        updateCreditBar();
        updateSubmitState();
      });
    }

    list.appendChild(card);
  });

  updateCreditBar();
  updateSubmitState();
}

function updateSubmitState() {
  // No minimum number of matches required — bet on as many or as few as you
  // like. Whatever bets ARE entered just need to be valid (side chosen,
  // amount >= MIN_BET) and fit within the week's credit.
  const submitBtn = document.getElementById("submitPredictionsBtn");
  const enteredBets = currentFixtures
    .filter(m => !isKickedOff(m))
    .map(m => draftBets[m.idEvent])
    .filter(Boolean);
  const allValid = enteredBets.every(b => b.side && b.amount >= MIN_BET);
  const totalBet = enteredBets.reduce((s, b) => s + (b.amount || 0), 0);
  const withinBudget = totalBet <= getWeekCredit(currentRound, state.currentUser);
  submitBtn.disabled = !(allValid && withinBudget);
}

document.getElementById("loadFixturesBtn").addEventListener("click", loadFixtures);

document.getElementById("detectRoundBtn").addEventListener("click", async () => {
  const statusEl = document.getElementById("predictStatus");
  statusEl.textContent = "กำลังตรวจสัปดาห์ปัจจุบัน...";
  try {
    const round = await detectCurrentRound();
    predictRoundInput.value = round;
    statusEl.textContent = `พบสัปดาห์ปัจจุบัน: สัปดาห์ ${round}`;
    loadFixtures();
  } catch (err) {
    statusEl.textContent = "ตรวจสอบไม่สำเร็จ — " + err.message;
  }
});

document.getElementById("submitPredictionsBtn").addEventListener("click", () => {
  if (!ensureVerified(state.currentUser)) return;
  const key = roundKey(currentSeasonKey(), currentRound);
  if (!state.bets[key]) state.bets[key] = {};
  state.bets[key][state.currentUser] = JSON.parse(JSON.stringify(draftBets));
  const statusEl = document.getElementById("predictStatus");
  const successMsg = `บันทึกโพยของ ${state.currentUser} สำหรับสัปดาห์นี้แล้ว ✅`;
  statusEl.textContent = successMsg;
  window.alert(successMsg);
  syncToCloud(() => {
    statusEl.textContent += " (⚠️ ซิงค์คลาวด์ไม่สำเร็จ บันทึกไว้ในเครื่องนี้เท่านั้น)";
  });
});

// ---------- Results tab ----------
const resultsRoundInput = document.getElementById("resultsRound");

document.getElementById("fetchResultsBtn").addEventListener("click", async () => {
  const round = parseInt(resultsRoundInput.value, 10) || 1;
  const statusEl = document.getElementById("resultsStatus");
  statusEl.textContent = "กำลังโหลดผลการแข่งขัน...";
  try {
    const calendar = await loadSeasonCalendar();
    document.getElementById("resultsSeasonLabel").textContent = seasonKeyFromCalendar(calendar);
    const events = await fetchWeekMatches(round);
    statusEl.textContent = events.length ? `โหลดสำเร็จ: ${events.length} แมตช์` : "ไม่พบข้อมูล";
    renderResults(round, events);
  } catch (err) {
    statusEl.textContent = "โหลดข้อมูลไม่สำเร็จ — " + err.message;
  }
});

function renderResults(round, events) {
  const key = roundKey(currentSeasonKey(), round);
  const list = document.getElementById("resultsList");
  list.innerHTML = "";

  const userBets = state.bets[key] || {};
  // Net +/- reflects ONLY settled (finished) bets — unbet matches and bets on
  // matches that haven't finished yet don't count toward this figure at all.
  const netProfit = {};
  state.users.forEach(u => netProfit[u] = 0);

  let anySettled = false;

  events.forEach(match => {
    const hs = match.intHomeScore, as = match.intAwayScore;
    const played = hs !== null && as !== null && hs !== undefined && as !== undefined && hs !== "" && as !== "";

    const card = document.createElement("div");
    card.className = "fixture-card";
    card.innerHTML = `
      <div class="fixture-teams">
        <span class="team home">${teamBadgeHtml(match.strHomeTeam)}<span class="team-name">${match.strHomeTeam}</span></span>
        <span class="vs">${played ? `${hs} - ${as}` : "⚽"}</span>
        <span class="team away">${teamBadgeHtml(match.strAwayTeam)}<span class="team-name">${match.strAwayTeam}</span></span>
      </div>
      <div class="fixture-meta">${formatKickoff(match.isoDateTime)} · ${match.strStatus || ""}</div>
    `;

    state.users.forEach(user => {
      const bet = (userBets[user] || {})[match.idEvent];
      const line = document.createElement("div");
      line.className = "result-line";
      let tagHtml;

      if (!bet) {
        tagHtml = `<span class="tag pending">ไม่ได้แทง</span>`;
      } else if (!played) {
        tagHtml = `<span class="tag pending">รอผล (แทง ${bet.amount.toLocaleString()}฿)</span>`;
      } else {
        anySettled = true;
        const settled = settleHandicapBet({
          amount: bet.amount, odds: bet.odds, line: bet.line, side: bet.side,
          homeGoals: parseInt(hs, 10), awayGoals: parseInt(as, 10)
        });
        netProfit[user] += settled.profit;
        const sideLabel = bet.side === "H" ? match.strHomeTeam : match.strAwayTeam;
        const profitRounded = Math.round(settled.profit);
        if (profitRounded > 0) {
          tagHtml = `<span class="tag correct">${escapeHtml(sideLabel)} ${formatLine(bet.line)} ชนะ +${profitRounded.toLocaleString()}฿</span>`;
        } else if (profitRounded < 0) {
          tagHtml = `<span class="tag wrong">${escapeHtml(sideLabel)} ${formatLine(bet.line)} แพ้ ${profitRounded.toLocaleString()}฿</span>`;
        } else {
          tagHtml = `<span class="tag push">${escapeHtml(sideLabel)} ${formatLine(bet.line)} เสมอ (คืนเงิน)</span>`;
        }
      }
      line.innerHTML = `<span>${escapeHtml(user)}</span>${tagHtml}`;
      card.appendChild(line);
    });

    list.appendChild(card);
  });

  const box = document.getElementById("roundScoreBox");
  if (!anySettled) {
    box.innerHTML = `<div class="pending-banner">⏳ สัปดาห์นี้ยังไม่มีแมตช์ที่แข่งจบ — ยอดจะอัปเดตอัตโนมัติหลังการแข่งขันจบแต่ละนัด</div>`;
  } else {
    const rounded = {};
    state.users.forEach(u => rounded[u] = Math.round(netProfit[u]));
    state.weekBalances[key] = rounded;
    syncToCloud();

    box.innerHTML = state.users.map(u => {
      const net = rounded[u];
      const cls = net > 0 ? "positive" : net < 0 ? "negative" : "";
      return `
        <div class="score-box">
          <div class="name">${escapeHtml(u)}</div>
          <div class="pts ${cls}">${net >= 0 ? "+" : ""}${net.toLocaleString()}฿</div>
        </div>
      `;
    }).join("");
  }
}

// ---------- Leaderboard tab ----------
function renderLeaderboard() {
  const thead = document.querySelector("#leaderboardTable thead");
  const tbody = document.querySelector("#leaderboardTable tbody");
  const tfoot = document.querySelector("#leaderboardTable tfoot");
  const emptyHint = document.getElementById("leaderboardEmptyHint");
  const rankingList = document.getElementById("rankingList");

  thead.innerHTML = `<tr><th>สัปดาห์</th>${state.users.map(u => `<th>${escapeHtml(u)}</th>`).join("")}</tr>`;
  tbody.innerHTML = "";
  tfoot.innerHTML = "";
  rankingList.innerHTML = "";

  const keys = Object.keys(state.weekBalances).sort();
  if (!keys.length) {
    emptyHint.style.display = "block";
    return;
  }
  emptyHint.style.display = "none";

  const cumulative = {};
  state.users.forEach(u => cumulative[u] = 0);

  keys.forEach(key => {
    const net = state.weekBalances[key];
    state.users.forEach(u => cumulative[u] += (net[u] || 0));
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${key.replace("_", " · สัปดาห์ ")}</td>` +
      state.users.map(u => {
        const v = net[u] || 0;
        return `<td>${v >= 0 ? "+" : ""}${v.toLocaleString()}฿</td>`;
      }).join("");
    tbody.appendChild(tr);
  });

  const tr = document.createElement("tr");
  tr.innerHTML = `<td>รวมทั้งหมด</td>` + state.users.map(u => {
    const v = cumulative[u];
    return `<td>${v >= 0 ? "+" : ""}${v.toLocaleString()}฿</td>`;
  }).join("");
  tfoot.appendChild(tr);

  const ranked = state.users.slice().sort((a, b) => cumulative[b] - cumulative[a]);
  const medals = ["🥇", "🥈", "🥉"];
  rankingList.innerHTML = ranked.map((u, i) => {
    const net = cumulative[u];
    const cls = net > 0 ? "positive" : net < 0 ? "negative" : "";
    return `
      <div class="ranking-row">
        <div class="rank">${medals[i] || (i + 1)}</div>
        <div class="rname">${escapeHtml(u)}</div>
        <div class="rnet ${cls}">${net >= 0 ? "+" : ""}${net.toLocaleString()}฿</div>
      </div>
    `;
  }).join("");
}

// ---------- Admin tab ----------
function renderAdminPanel() {
  const round = parseInt(document.getElementById("adminRound").value, 10) || 1;
  const key = roundKey(currentSeasonKey(), round);
  const list = document.getElementById("adminUserList");
  const statusEl = document.getElementById("adminStatus");

  list.innerHTML = state.users.map(u => `
    <div class="admin-row" data-user="${escapeHtml(u)}">
      <div class="admin-row-name">${escapeHtml(u)}</div>

      <div class="admin-row-section">
        <div class="admin-row-section-label">เครดิตปัจจุบันสัปดาห์ ${round}: ${getWeekCredit(round, u).toLocaleString()} ฿</div>
        <div class="admin-row-controls">
          <input type="number" class="admin-credit-input" placeholder="เครดิตใหม่ (฿)" min="0" step="500">
          <button class="admin-credit-btn" disabled>ตั้งค่าเครดิต</button>
        </div>
      </div>

      <div class="admin-row-section">
        <div class="admin-row-controls">
          <input type="text" class="admin-code-input" placeholder="รหัสใหม่">
          <button class="admin-update-btn" disabled>อัปเดตรหัส</button>
          <button class="admin-delete-btn">ลบผู้ใช้</button>
        </div>
      </div>
    </div>
  `).join("");

  list.querySelectorAll(".admin-row").forEach(row => {
    const user = row.dataset.user;
    const creditInput = row.querySelector(".admin-credit-input");
    const creditBtn = row.querySelector(".admin-credit-btn");
    const codeInput = row.querySelector(".admin-code-input");
    const codeBtn = row.querySelector(".admin-update-btn");
    const deleteBtn = row.querySelector(".admin-delete-btn");

    creditInput.addEventListener("input", () => {
      creditBtn.disabled = creditInput.value.trim().length === 0;
    });

    creditBtn.addEventListener("click", () => {
      const newCredit = parseInt(creditInput.value, 10);
      if (isNaN(newCredit) || newCredit < 0) return;
      if (!ensureAdmin()) return;
      if (!state.creditOverrides[key]) state.creditOverrides[key] = {};
      state.creditOverrides[key][user] = newCredit;
      const successMsg = `ตั้งเครดิตของ ${user} สัปดาห์ ${round} เป็น ${newCredit.toLocaleString()} บาท เรียบร้อย ✅`;
      statusEl.textContent = successMsg;
      window.alert(successMsg);
      renderAdminPanel();
      syncToCloud(() => { statusEl.textContent += " (⚠️ ซิงค์คลาวด์ไม่สำเร็จ)"; });
    });

    codeInput.addEventListener("input", () => {
      codeBtn.disabled = codeInput.value.trim().length === 0;
    });

    codeBtn.addEventListener("click", () => {
      const newCode = codeInput.value.trim();
      if (!newCode) return;
      if (!ensureAdmin()) return;
      state.userCodes[user] = newCode;
      verifiedUsers.delete(user); // old cached verification no longer matches the new code
      const successMsg = `อัปเดตรหัสของ ${user} เรียบร้อย ✅`;
      statusEl.textContent = successMsg;
      window.alert(successMsg);
      renderAdminPanel();
      syncToCloud(() => { statusEl.textContent += " (⚠️ ซิงค์คลาวด์ไม่สำเร็จ)"; });
    });

    deleteBtn.addEventListener("click", () => {
      if (state.users.length <= 1) {
        statusEl.textContent = "ต้องมีผู้ใช้อย่างน้อย 1 คน";
        return;
      }
      if (!ensureAdmin()) return;
      state.users = state.users.filter(u => u !== user);
      delete state.userCodes[user];
      verifiedUsers.delete(user);
      if (state.currentUser === user) {
        state.currentUser = state.users[0];
        resetDraftFromCommitted();
      }
      renderUserSwitch();
      renderFixtureList();
      renderAdminPanel();
      const successMsg = `ลบผู้ใช้ ${user} เรียบร้อย ✅`;
      statusEl.textContent = successMsg;
      window.alert(successMsg);
      syncToCloud(() => { statusEl.textContent += " (⚠️ ซิงค์คลาวด์ไม่สำเร็จ)"; });
    });
  });
}

document.getElementById("adminRound").addEventListener("input", renderAdminPanel);

function updateAdminCreateBtnState() {
  const name = document.getElementById("adminNewUserName").value.trim();
  const code = document.getElementById("adminNewUserCode").value.trim();
  document.getElementById("adminCreateBtn").disabled = !(name && code);
}

document.getElementById("adminNewUserName").addEventListener("input", updateAdminCreateBtnState);
document.getElementById("adminNewUserCode").addEventListener("input", updateAdminCreateBtnState);

document.getElementById("adminCreateBtn").addEventListener("click", () => {
  const nameInput = document.getElementById("adminNewUserName");
  const codeInput = document.getElementById("adminNewUserCode");
  const statusEl = document.getElementById("adminStatus");
  const name = nameInput.value.trim();
  const code = codeInput.value.trim();
  if (!name || !code) return;
  if (name.toLowerCase() === "admin") { statusEl.textContent = "ชื่อ admin ถูกสงวนไว้ ใช้ชื่ออื่น"; return; }
  if (state.users.includes(name)) { statusEl.textContent = "มีผู้ใช้ชื่อนี้อยู่แล้ว"; return; }
  if (!ensureAdmin()) return;
  state.users.push(name);
  state.userCodes[name] = code;
  nameInput.value = "";
  codeInput.value = "";
  updateAdminCreateBtnState();
  renderUserSwitch();
  renderAdminPanel();
  const successMsg = `เพิ่มผู้ใช้ ${name} เรียบร้อย ✅`;
  statusEl.textContent = successMsg;
  window.alert(successMsg);
  syncToCloud(() => { statusEl.textContent += " (⚠️ ซิงค์คลาวด์ไม่สำเร็จ)"; });
});

// ---------- Init ----------
async function initDefaultRound() {
  let round = 1;
  try {
    round = await detectCurrentRound(); // defaults to the current/latest match week, not always week 1
  } catch (e) { /* keep round 1 if detection fails (e.g. offline) */ }
  predictRoundInput.value = round;
  resultsRoundInput.value = round;
  document.getElementById("adminRound").value = round;
  loadFixtures();
}

renderUserSwitch();
initDefaultRound();
startCloudSync(); // begin listening for shared-state updates from other devices
