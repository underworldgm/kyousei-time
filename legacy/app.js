const STORAGE_KEY = "kyousei-time-state-v1";
const ringLength = 326.7;

const defaultState = {
  goalHours: 14,
  notifications: true,
  activeSession: null,
  selectedDate: toDateKey(new Date()),
  calendarCursor: {
    year: new Date().getFullYear(),
    month: new Date().getMonth()
  },
  records: seedRecords()
};

let state = loadState();
let tickTimer = null;

const els = {
  screens: document.querySelectorAll(".screen"),
  navButtons: document.querySelectorAll(".nav-button"),
  goalOutput: document.getElementById("goal-hours-output"),
  decreaseGoal: document.getElementById("decrease-goal"),
  increaseGoal: document.getElementById("increase-goal"),
  notificationToggle: document.getElementById("notification-toggle"),
  saveSettings: document.getElementById("save-settings"),
  stampPreviewButton: document.getElementById("stamp-preview-button"),
  todayGoal: document.getElementById("today-goal"),
  todayGoalSmall: document.getElementById("today-goal-small"),
  timerStatus: document.getElementById("timer-status"),
  remainingTime: document.getElementById("remaining-time"),
  todayWorn: document.getElementById("today-worn"),
  ringValue: document.getElementById("ring-value"),
  startTime: document.getElementById("start-time"),
  startCaption: document.getElementById("start-caption"),
  endTime: document.getElementById("end-time"),
  timerButton: document.getElementById("timer-button"),
  timerButtonLabel: document.getElementById("timer-button-label"),
  monthTitle: document.getElementById("month-title"),
  prevMonth: document.getElementById("prev-month"),
  nextMonth: document.getElementById("next-month"),
  calendarGrid: document.getElementById("calendar-grid"),
  selectedDateTitle: document.getElementById("selected-date-title"),
  selectedDuration: document.getElementById("selected-duration"),
  selectedResult: document.getElementById("selected-result"),
  selectedPraise: document.getElementById("selected-praise"),
  toast: document.getElementById("toast")
};

init();

function init() {
  els.navButtons.forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.screen));
  });
  els.decreaseGoal.addEventListener("click", () => changeGoal(-1));
  els.increaseGoal.addEventListener("click", () => changeGoal(1));
  els.notificationToggle.addEventListener("change", () => {
    state.notifications = els.notificationToggle.checked;
    saveState();
  });
  els.saveSettings.addEventListener("click", saveSettings);
  els.stampPreviewButton.addEventListener("click", () => showScreen("calendar-screen"));
  els.timerButton.addEventListener("click", toggleTimer);
  els.prevMonth.addEventListener("click", () => moveMonth(-1));
  els.nextMonth.addEventListener("click", () => moveMonth(1));

  render();
  tickTimer = window.setInterval(renderTimer, 1000);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(defaultState);
    return {
      ...structuredClone(defaultState),
      ...saved,
      calendarCursor: saved.calendarCursor || defaultState.calendarCursor,
      records: { ...defaultState.records, ...(saved.records || {}) }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function seedRecords() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const samples = [1, 2, 3, 5, 8, 10, 15, 17, 19, 23, 26, 29];
  const records = {};
  samples.forEach((day, index) => {
    const date = new Date(year, month, day);
    records[toDateKey(date)] = {
      totalMs: (13.5 + (index % 3) * 0.5) * 60 * 60 * 1000,
      goalHours: 14
    };
  });
  const highlighted = new Date(year, month, Math.min(12, daysInMonth(year, month)));
  records[toDateKey(highlighted)] = {
    totalMs: 14 * 60 * 60 * 1000 + 20 * 60 * 1000,
    goalHours: 14
  };
  return records;
}

function showScreen(screenId) {
  els.screens.forEach((screen) => screen.classList.toggle("active", screen.id === screenId));
  els.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.screen === screenId));
  if (screenId === "calendar-screen") renderCalendar();
}

function changeGoal(delta) {
  state.goalHours = clamp(state.goalHours + delta, 1, 24);
  saveState();
  render();
}

async function saveSettings() {
  state.notifications = els.notificationToggle.checked;
  saveState();
  if (state.notifications && "Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
  showToast("設定を保存しました");
}

function toggleTimer() {
  if (!state.activeSession) {
    startTimer();
  } else if (state.activeSession.pausedAt) {
    resumeTimer();
  } else {
    pauseTimer();
  }
}

function startTimer() {
  const now = Date.now();
  state.activeSession = {
    firstStart: now,
    start: now,
    accumulatedMs: 0,
    targetEnd: now + remainingGoalMs(0),
    notified: false,
    pausedAt: null
  };
  saveState();
  render();
  showToast("装着を開始しました");
}

function pauseTimer() {
  const session = state.activeSession;
  if (!session) return;
  const now = Date.now();
  session.accumulatedMs = sessionElapsed(now);
  session.pausedAt = now;
  session.start = null;
  saveState();
  render();
  showToast("一時停止しました");
}

function resumeTimer() {
  const session = state.activeSession;
  if (!session) return;
  const now = Date.now();
  session.start = now;
  session.pausedAt = null;
  session.targetEnd = now + remainingGoalMs(session.accumulatedMs || 0);
  saveState();
  render();
  showToast("装着を再開しました");
}

function addDuration(startDate, durationMs, goalHours) {
  const key = toDateKey(startDate);
  const current = state.records[key] || { totalMs: 0, goalHours };
  current.totalMs += Math.max(0, durationMs);
  current.goalHours = goalHours;
  state.records[key] = current;
  state.selectedDate = key;
  const date = new Date(startDate);
  state.calendarCursor = { year: date.getFullYear(), month: date.getMonth() };
}

function render() {
  els.goalOutput.value = state.goalHours;
  els.goalOutput.textContent = state.goalHours;
  els.notificationToggle.checked = state.notifications;
  els.todayGoal.textContent = state.goalHours;
  els.todayGoalSmall.textContent = `${state.goalHours}時間`;
  renderTimer();
  renderCalendar();
}

function renderTimer() {
  const todayKey = toDateKey(new Date());
  const record = state.records[todayKey] || { totalMs: 0, goalHours: state.goalHours };
  const sessionMs = state.activeSession ? sessionElapsed(Date.now()) : 0;
  const totalMs = record.totalMs + sessionMs;
  const goalMs = state.goalHours * 60 * 60 * 1000;
  const remainingMs = Math.max(0, goalMs - totalMs);
  const progress = clamp(totalMs / goalMs, 0, 1);

  els.todayWorn.textContent = formatDuration(totalMs);
  els.remainingTime.textContent = formatDuration(remainingMs);
  els.ringValue.style.strokeDashoffset = String(ringLength * (1 - progress));

  if (state.activeSession) {
    const session = state.activeSession;
    const start = new Date(session.firstStart || session.start || Date.now());
    const end = session.pausedAt ? null : new Date(session.targetEnd);
    els.timerStatus.textContent = session.pausedAt ? "一時停止中" : "装着中";
    els.startTime.textContent = formatTime(start);
    els.startCaption.textContent = session.pausedAt ? "再開すると続きます" : "自動で記録しました";
    els.endTime.textContent = end ? formatTime(end) : "--:--";
    els.timerButtonLabel.textContent = session.pausedAt ? "再開" : "一時停止";
    notifyIfNeeded();
  } else {
    els.timerStatus.textContent = progress >= 1 ? "達成！" : "待機中";
    els.startTime.textContent = "--:--";
    els.startCaption.textContent = "開始すると記録します";
    els.endTime.textContent = "--:--";
    els.timerButtonLabel.textContent = "装着開始";
  }
}

function notifyIfNeeded() {
  const session = state.activeSession;
  if (!session || session.pausedAt || session.notified || Date.now() < session.targetEnd) return;

  session.notified = true;
  addDuration(new Date(session.firstStart || session.start), sessionElapsed(Date.now()), state.goalHours);
  state.activeSession = null;
  saveState();
  render();
  showToast("目標時間になりました。よくできました！");
  if (!state.notifications || !("Notification" in window) || Notification.permission !== "granted") return;
  new Notification("きょうせいタイム", {
    body: "今日の目標時間になりました。おつかれさま！"
  });
}

function moveMonth(delta) {
  const next = new Date(state.calendarCursor.year, state.calendarCursor.month + delta, 1);
  state.calendarCursor = { year: next.getFullYear(), month: next.getMonth() };
  saveState();
  renderCalendar();
}

function renderCalendar() {
  const { year, month } = state.calendarCursor;
  const todayKey = toDateKey(new Date());
  els.monthTitle.textContent = `${year}年${month + 1}月`;
  els.calendarGrid.innerHTML = "";

  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = daysInMonth(year, month);
  const prevTotal = daysInMonth(year, month - 1);

  for (let index = 0; index < 42; index += 1) {
    const offset = index - firstDay + 1;
    const isCurrent = offset >= 1 && offset <= totalDays;
    const day = isCurrent ? offset : offset < 1 ? prevTotal + offset : offset - totalDays;
    const date = new Date(year, month, offset);
    const key = toDateKey(date);
    const record = dailyRecord(key);
    const reached = record && record.totalMs >= (record.goalHours || state.goalHours) * 60 * 60 * 1000;

    const cell = document.createElement("div");
    cell.className = "day-cell";
    if (!isCurrent) cell.classList.add("other-month");
    if (index % 7 === 0) cell.classList.add("weekend-sun");
    if (index % 7 === 6) cell.classList.add("weekend-sat");
    if (key === todayKey && isCurrent) cell.classList.add("today");
    if (key === state.selectedDate) cell.classList.add("selected");

    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", () => selectDate(key, date));
    button.innerHTML = `<span class="date-number">${day}</span>`;

    if (reached) {
      button.innerHTML += `<span class="stamp">${key === state.selectedDate ? "⭐" : "◎"}</span>`;
    }
    if (key === state.selectedDate && record) {
      button.innerHTML += `<span class="duration-label">${formatDuration(record.totalMs).replace("時間", "時間<br>")}</span>`;
    }

    cell.appendChild(button);
    els.calendarGrid.appendChild(cell);
  }
  renderSelectedResult();
}

function selectDate(key, date) {
  state.selectedDate = key;
  state.calendarCursor = { year: date.getFullYear(), month: date.getMonth() };
  saveState();
  renderCalendar();
}

function renderSelectedResult() {
  const record = dailyRecord(state.selectedDate);
  const selected = parseDateKey(state.selectedDate);
  const goalHours = record?.goalHours || state.goalHours;
  const achieved = record && record.totalMs >= goalHours * 60 * 60 * 1000;

  els.selectedDateTitle.textContent = `${selected.getMonth() + 1}月${selected.getDate()}日`;
  els.selectedDuration.textContent = record ? formatDuration(record.totalMs) : "0時間00分";
  els.selectedResult.textContent = achieved ? "目標達成！" : record ? "あと少し" : "これから";
  els.selectedResult.style.color = achieved ? "#ef746f" : "#6e7789";
  els.selectedPraise.textContent = achieved ? "よくできました！" : "今日も少しずつ進もう！";
}

function dailyRecord(key) {
  const base = state.records[key];
  const todayKey = toDateKey(new Date());
  if (key !== todayKey || !state.activeSession) return base;
  return {
    totalMs: (base?.totalMs || 0) + sessionElapsed(Date.now()),
    goalHours: base?.goalHours || state.goalHours
  };
}

function sessionElapsed(now) {
  const session = state.activeSession;
  if (!session) return 0;
  const accumulated = session.accumulatedMs || 0;
  if (session.pausedAt || !session.start) return accumulated;
  return accumulated + Math.max(0, now - session.start);
}

function remainingGoalMs(sessionMs) {
  const todayKey = toDateKey(new Date());
  const record = state.records[todayKey] || { totalMs: 0 };
  const goalMs = state.goalHours * 60 * 60 * 1000;
  return Math.max(0, goalMs - record.totalMs - sessionMs);
}

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}時間${String(mins).padStart(2, "0")}分`;
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}
