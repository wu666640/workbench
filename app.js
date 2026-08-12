const state = {
  settings: { name: "", title: "我的工作台" },
  focus: {},
  tasks: [],
  habits: [],
  checks: [],
  schedule: [],
  notes: [],
  assets: [],
  rooms: [],
  reviews: []
};

const LOCAL_STATE_KEY = "personal-workbench-local-v1";
const CLOUD_CONFIG_KEY = "personal-workbench-cloud-v1";
const DEFAULT_CLOUD_CONFIG = {
  url: "https://lqkdatdtgoxztawmtigj.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxa2RhdGR0Z294enRhd210aWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0OTM1NjIsImV4cCI6MjEwMjA2OTU2Mn0.-oSyoXCTkry5dJ5XyYrQwHk2LowPU5YAbbg-xESR3MY",
  bucket: "workbench"
};

let revision = 0;
let currentView = "today";
let taskFilter = "today";
let mobileDay = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
let editingTaskId = null;
let editingHabitId = null;
let editingCourseId = null;
let editingReviewId = null;
let selectedHabitIcon = "water";
let noteImageUrl = "";
let pendingImport = [];
let importTab = "html";
let importDraft = "";
let importFileText = "";
let importFileName = "";
let openRoomPeriods = new Set();
let roomAutoDone = false;
let syncStatus = "connecting";
let saveTimer = null;
let lastLocalStorageWarning = 0;
let cloudConfig = readCloudConfig();
let notificationEnabled = localStorage.getItem("workbench-notification-enabled") === "1";
let webReminderWatchTimer = null;
let webReminderQueue = [];
let reminderStatusText = "等待安排";
const REMINDER_TAG = "workbench-reminder";
const APP_VERSION = "1.1.0";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const HABIT_ICONS = ["water", "book", "walk", "sleep", "diet", "focus"];
const NEUQ_PERIODS = {
  1: ["08:00", "08:45"],
  2: ["08:50", "09:35"],
  3: ["10:05", "10:50"],
  4: ["10:55", "11:40"],
  5: ["14:00", "14:45"],
  6: ["14:50", "15:35"],
  7: ["16:05", "16:50"],
  8: ["16:55", "17:40"],
  9: ["18:40", "19:25"],
  10: ["19:30", "20:15"],
  11: ["20:25", "21:10"],
  12: ["21:15", "22:00"]
};

function periodNumberForTime(value, kind) {
  const entries = Object.entries(NEUQ_PERIODS);
  if (kind === "end") {
    for (const [num, [, end]] of entries) {
      if (end === value) return Number(num);
    }
    for (const [num, [, end]] of entries) {
      if (value <= end) return Number(num);
    }
    return 12;
  }
  for (const [num, [start]] of entries) {
    if (start === value) return Number(num);
  }
  let fallback = 1;
  for (const [num, [start]] of entries) {
    if (value >= start) fallback = Number(num);
  }
  return fallback;
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function isoFor(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad2(week)}`;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function weekdayIndex(date = new Date()) {
  return date.getDay() === 0 ? 6 : date.getDay() - 1;
}

function parseTime(value) {
  const [h, m] = String(value).split(":").map(Number);
  return h * 60 + m;
}

function timeLabel(minutes) {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

function remindLabel(minutes) {
  const value = Number(minutes);
  if (value === 0) return "准时";
  if (value % 1440 === 0) return `${value / 1440} 天`;
  if (value % 60 === 0) return `${value / 60} 小时`;
  return `${value} 分钟`;
}

function reminderOptions(selected) {
  const current = selected == null ? "none" : String(selected);
  const options = [
    ["none", "不提醒"],
    ["0", "准时提醒"],
    ["5", "提前 5 分钟"],
    ["10", "提前 10 分钟"],
    ["15", "提前 15 分钟"],
    ["30", "提前 30 分钟"],
    ["60", "提前 1 小时"],
    ["120", "提前 2 小时"],
    ["1440", "提前 1 天"]
  ];
  return options
    .map(([value, label]) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function reminderMeta(item) {
  if (!item.time || item.remind == null) return "";
  return `${item.time} · 提前 ${remindLabel(item.remind)}提醒`;
}

function localDateMs(dateISO, time) {
  const [hours, minutes] = String(time || "").split(":").map(Number);
  const date = new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 0;
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date.getTime();
}

function reminderId(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = ((hash << 5) - hash + char.codePointAt(0)) >>> 0;
  }
  return (hash % 2000000000) + 1;
}

function isNativeApp() {
  return Boolean(
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );
}

function notificationStatusText() {
  if (isNativeApp()) return notificationEnabled ? "已开启" : "未开启";
  if (!("Notification" in window)) return "浏览器不支持";
  if (Notification.permission === "granted") return "已开启";
  if (Notification.permission === "denied") return "已拒绝";
  return "未开启";
}

function refreshReminderStatus() {
  const status = $("#notification-status");
  if (status) status.textContent = notificationStatusText();
  const detail = $("#notification-detail");
  if (detail) detail.textContent = reminderStatusText;
}

function collectReminders() {
  const items = [];
  const now = Date.now();
  for (const task of state.tasks) {
    if (task.done || !task.time || task.remind == null) continue;
    const date = task.date || todayISO();
    const at = localDateMs(date, task.time) - Number(task.remind) * 60000;
    if (at > now) {
      items.push({
        id: `task-${task.id}`,
        title: task.title,
        body: `待办提醒 · ${task.time}`,
        at
      });
    }
  }
  for (const habit of state.habits) {
    if (!habit.time || habit.remind == null) continue;
    for (let day = 0; day < 7; day += 1) {
      const cursor = new Date();
      cursor.setDate(cursor.getDate() + day);
      const dateISO = isoFor(cursor);
      if (day === 0 && isDoneOn(dateISO, habit.history)) continue;
      const at = localDateMs(dateISO, habit.time) - Number(habit.remind) * 60000;
      if (at > now) {
        items.push({
          id: `habit-${habit.id}-${dateISO}`,
          title: habit.name,
          body: `习惯提醒 · ${habit.time}`,
          at
        });
      }
    }
  }
  return items.sort((a, b) => a.at - b.at);
}

function countExpiredReminders() {
  const now = Date.now();
  let count = 0;
  for (const task of state.tasks) {
    if (task.done || !task.time || task.remind == null) continue;
    if (localDateMs(task.date || todayISO(), task.time) <= now) count += 1;
  }
  for (const habit of state.habits) {
    if (!habit.time || habit.remind == null) continue;
    if (localDateMs(todayISO(), habit.time) <= now) count += 1;
  }
  return count;
}

function clearWebReminderTimers() {
  webReminderQueue = [];
  if (webReminderWatchTimer) {
    clearInterval(webReminderWatchTimer);
    webReminderWatchTimer = null;
  }
}

function fireDueWebReminders() {
  const now = Date.now();
  webReminderQueue = webReminderQueue.filter((item) => {
    if (item.at > now) return true;
    new Notification(item.title, {
      body: item.body,
      icon: "./assets/icons/icon-192.png",
      tag: REMINDER_TAG
    });
    return false;
  });
}

function startWebReminderWatcher() {
  if (webReminderWatchTimer) return;
  fireDueWebReminders();
  webReminderWatchTimer = setInterval(fireDueWebReminders, 20000);
}

async function scheduleReminders() {
  clearWebReminderTimers();
  const reminders = collectReminders();
  const expiredCount = countExpiredReminders();
  const expiredText = expiredCount ? `，${expiredCount} 条时间已过未安排` : "";
  const native = isNativeApp() && window.Capacitor?.Plugins?.LocalNotifications;
  if (native) {
    try {
      const pending = await native.getPending();
      if (pending?.notifications?.length) {
        await native.cancel({ notifications: pending.notifications });
      }
      if (reminders.length) {
        await native.schedule({
          notifications: reminders.map((item) => ({
            id: reminderId(item.id),
            title: item.title,
            body: item.body,
            schedule: { at: new Date(item.at), allowWhileIdle: true },
            channelId: "default",
            iconColor: "#D95F7E",
            smallIcon: "ic_stat_icon_config_sample"
          }))
        });
      }
      reminderStatusText = `已安排 ${reminders.length} 条提醒${expiredText}`;
      refreshReminderStatus();
      return;
    } catch (err) {
      reminderStatusText = `系统通知失败：${err.message || "未知错误"}`;
      refreshReminderStatus();
      // Fall back to web notifications when native scheduling fails.
    }
  }
  if (!("Notification" in window) || Notification.permission !== "granted") {
    reminderStatusText = "通知未开启";
    refreshReminderStatus();
    return;
  }
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration && "showTrigger" in Notification.prototype && "TimestampTrigger" in window) {
      const existing = await registration.getNotifications({ tag: REMINDER_TAG });
      existing.forEach((notification) => notification.close());
      for (const item of reminders) {
        registration.showNotification(item.title, {
          body: item.body,
          tag: `${REMINDER_TAG}-${reminderId(item.id)}`,
          icon: "./assets/icons/icon-192.png",
          showTrigger: new TimestampTrigger(item.at)
        });
      }
      reminderStatusText = `已安排 ${reminders.length} 条提醒${expiredText}`;
      refreshReminderStatus();
      return;
    }
  } catch (err) {
    // Use an in-page watcher when the browser cannot schedule via service worker.
  }
  webReminderQueue = reminders;
  startWebReminderWatcher();
  reminderStatusText = `已安排 ${reminders.length} 条提醒${expiredText}（打开时生效）`;
  refreshReminderStatus();
}

function scheduleRemindersSoon() {
  clearTimeout(scheduleRemindersSoon.timer);
  scheduleRemindersSoon.timer = setTimeout(() => scheduleReminders(), 350);
}

async function enableNotifications() {
  const native = isNativeApp() && window.Capacitor?.Plugins?.LocalNotifications;
  if (native) {
    try {
      const permission = await native.requestPermissions();
      if (permission?.display !== "granted") {
        toast("通知权限未开启，请到系统设置允许");
        return;
      }
      const exact = await native.checkExactNotificationSetting();
      if (exact?.exact_alarm === "denied") {
        try {
          await native.changeExactNotificationSetting();
        } catch (err) {
          // The user can still receive reminders with inexact timing.
        }
      }
      notificationEnabled = true;
      localStorage.setItem("workbench-notification-enabled", "1");
      await scheduleReminders();
      render();
      toast("通知已开启");
    } catch (err) {
      toast("通知开启失败，请重试");
    }
    return;
  }
  if (!("Notification" in window)) {
    toast("当前浏览器不支持通知");
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    notificationEnabled = true;
    localStorage.setItem("workbench-notification-enabled", "1");
    await scheduleReminders();
    render();
    toast("通知已开启");
  } else {
    toast("通知权限未开启");
  }
}

async function refreshNotificationPermission() {
  const native = isNativeApp() && window.Capacitor?.Plugins?.LocalNotifications;
  if (native) {
    try {
      const permission = await native.checkPermissions();
      if (permission?.display === "granted") {
        notificationEnabled = true;
        localStorage.setItem("workbench-notification-enabled", "1");
      }
    } catch (err) {
      // Keep the last known state when permission can't be checked.
    }
  } else if ("Notification" in window && Notification.permission === "granted") {
    notificationEnabled = true;
    localStorage.setItem("workbench-notification-enabled", "1");
  }
  refreshReminderStatus();
}

async function testNotification() {
  const native = isNativeApp() && window.Capacitor?.Plugins?.LocalNotifications;
  if (native) {
    try {
      await native.schedule({
        notifications: [{
          id: 999900001,
          title: "测试提醒",
          body: "你的工作台通知已经接通",
          schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true },
          channelId: "default",
          iconColor: "#D95F7E",
          smallIcon: "ic_stat_icon_config_sample"
        }]
      });
      toast("测试提醒已发送");
      return;
    } catch (err) {
      toast("测试提醒发送失败");
      return;
    }
  }
  if (!("Notification" in window) || Notification.permission !== "granted") {
    if ("Notification" in window && Notification.permission === "denied") {
      toast("通知权限已被拒绝，请到浏览器设置里允许");
    } else {
      toast("请先点“开启通知”");
    }
    return;
  }
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration) {
      await registration.showNotification("测试提醒", {
        body: "你的工作台通知已经接通",
        icon: "./assets/icons/icon-192.png",
        tag: `${REMINDER_TAG}-test`
      });
      toast("测试通知已发送");
      return;
    }
  } catch (err) {
    // Fall back to a page notification below.
  }
  try {
    new Notification("测试提醒", {
      body: "你的工作台通知已经接通",
      icon: "./assets/icons/icon-192.png"
    });
    toast("测试通知已发送");
  } catch (err) {
    toast("浏览器通知被阻止，请检查系统通知设置");
  }
}

function dayProgress() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, Math.min(100, ((minutes - 360) / 960) * 100));
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function icon(name, className = "icon") {
  return `<svg class="${className}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

function checkButton(done, id = "") {
  const idAttr = id ? ` data-id="${esc(id)}"` : "";
  return `<button class="check-btn ${done ? "is-done" : ""}" data-action="toggle-check"${idAttr} aria-label="${done ? "取消完成" : "标记完成"}">${icon("check")}</button>`;
}

function priorityLabel(priority) {
  return { high: "高", medium: "中", low: "低" }[priority] || "中";
}

function isDoneOn(dateISO, dates) {
  return Array.isArray(dates) && dates.includes(dateISO);
}

function todayTasks() {
  const today = todayISO();
  return state.tasks
    .filter((task) => task.date === today || (!task.date && !task.done))
    .sort((a, b) => Number(a.done) - Number(b.done));
}

function todaySchedule() {
  const day = weekdayIndex();
  return state.schedule
    .filter((item) => Number(item.weekday) === day && scheduleVisible(item))
    .sort((a, b) => parseTime(a.start) - parseTime(b.start));
}

function recentNotes(limit = 6) {
  return [...state.notes]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

function computeStreak(history) {
  const done = new Set(history || []);
  let streak = 0;
  let cursor = new Date();
  if (!done.has(todayISO())) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (done.has(isoFor(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function lastSevenDays() {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(isoFor(d));
  }
  return days;
}

function taskRows(taskList) {
  if (!taskList.length) {
    return `<div class="empty-note">还没有任务。写下第一件要做的事，让今天有个清楚的开始。</div>`;
  }
  return taskList
    .map((task) => {
      const done = Boolean(task.done);
      const dateText = task.date ? formatDate(task.date) : "未设定日期";
      const timeText = task.time ? ` · ${esc(task.time)}` : "";
      const remindText = reminderMeta(task) ? ` · ${esc(reminderMeta(task))}` : "";
      return `<li class="task-row ${done ? "is-done" : ""}">
        <button class="check-btn ${done ? "is-done" : ""}" data-action="toggle-task" data-id="${esc(task.id)}" aria-label="${done ? "恢复任务" : "完成任务"}">${icon("check")}</button>
        <div class="task-main">
          <span class="task-title">${esc(task.title)}</span>
          <span class="task-meta"><span class="priority priority-${esc(task.priority || "medium")}">${priorityLabel(task.priority)}</span> · ${esc(dateText)}${timeText}${remindText}</span>
        </div>
        <div class="task-actions">
          <button class="btn-icon" data-action="edit-task" data-id="${esc(task.id)}" aria-label="编辑任务">${icon("edit")}</button>
          <button class="btn-icon btn-danger" data-action="delete-task" data-id="${esc(task.id)}" aria-label="删除任务">${icon("trash")}</button>
        </div>
      </li>`;
    })
    .join("");
}

function habitTile(habit, compact = false) {
  const today = todayISO();
  const done = isDoneOn(today, habit.history);
  const streak = computeStreak(habit.history);
  const days = lastSevenDays();
  const remindText = reminderMeta(habit) ? ` · ${esc(reminderMeta(habit))}` : "";
  const dots = days
    .map((day) => `<span class="week-dot ${isDoneOn(day, habit.history) ? "is-on" : ""}"></span>`)
    .join("");
  return `<article class="habit-tile ${done ? "is-done" : ""}">
    <div class="habit-icon">${icon(habit.icon || "focus")}</div>
    <div class="habit-name">${esc(habit.name)}</div>
    <div class="habit-meta">${done ? "今天已完成" : "今天还没打卡"} · 连续 ${streak} 天${remindText}</div>
    ${compact ? `<div class="week-dots">${dots}</div>` : ""}
    <div class="form-actions">
      <button class="btn-icon" data-action="toggle-habit" data-id="${esc(habit.id)}" aria-label="${done ? "取消打卡" : "今日打卡"}">${icon(done ? "check" : "plus")}</button>
      ${compact ? "" : `<button class="btn-icon" data-action="edit-habit" data-id="${esc(habit.id)}" aria-label="编辑习惯">${icon("edit")}</button>`}
      ${compact ? "" : `<button class="btn-icon btn-danger" data-action="delete-habit" data-id="${esc(habit.id)}" aria-label="删除习惯">${icon("trash")}</button>`}
    </div>
  </article>`;
}

function scheduleItemRow(item, mobile = false) {
  return `<li class="schedule-item">
    <span class="schedule-time">${esc(item.start)}–${esc(item.end)}</span>
    <div class="schedule-name">
      <span class="color-chip ${esc(item.color || "cobalt")}"></span>
      ${esc(item.title)}
      ${scheduleMeta(item) ? `<span class="schedule-location">${esc(scheduleMeta(item))}</span>` : ""}
    </div>
    <div class="task-actions">
      ${mobile ? `<button class="btn-icon" data-action="edit-course" data-id="${esc(item.id)}" aria-label="编辑安排">${icon("edit")}</button>` : ""}
      <button class="btn-icon btn-danger" data-action="delete-course" data-id="${esc(item.id)}" aria-label="删除安排">${icon("trash")}</button>
    </div>
  </li>`;
}

function scheduleMeta(item) {
  return [item.location, item.teacher, item.weeks ? `${item.weeks}周` : ""]
    .filter(Boolean)
    .join(" · ");
}

function currentWeekNumber() {
  const week = Number(state.settings.currentWeek);
  return Number.isInteger(week) && week >= 1 ? week : 0;
}

function courseInWeek(item, week) {
  if (!week) return true;
  const rule = String(item.weeks || "").trim();
  if (!rule) return true;
  const parts = rule.split(/[、,，;；]/).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const oddOnly = /单/.test(part);
    const evenOnly = /双/.test(part);
    const range = part.match(/(\d{1,2})\s*[-—–~～至]\s*(\d{1,2})/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (week < start || week > end) continue;
      if (oddOnly && week % 2 !== 1) continue;
      if (evenOnly && week % 2 !== 0) continue;
      return true;
    }
    const single = part.match(/\d{1,2}/);
    if (single && Number(single[0]) === week) {
      if (oddOnly && week % 2 !== 1) continue;
      if (evenOnly && week % 2 !== 0) continue;
      return true;
    }
  }
  return false;
}

function isOffWeekCourse(item) {
  const week = currentWeekNumber();
  return Boolean(week && item.weeks && !courseInWeek(item, week));
}

function scheduleVisible(item) {
  return !isOffWeekCourse(item);
}

function layoutDayBlocks(blocks) {
  const items = blocks
    .map((item) => ({
      item,
      start: parseTime(item.start),
      end: Math.max(parseTime(item.start) + 1, parseTime(item.end))
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const groups = [];
  let current = [];
  let currentEnd = -1;
  for (const entry of items) {
    if (!current.length || entry.start < currentEnd) {
      current.push(entry);
      currentEnd = Math.max(currentEnd, entry.end);
    } else {
      groups.push(current);
      current = [entry];
      currentEnd = entry.end;
    }
  }
  if (current.length) {
    groups.push(current);
  }

  const layout = new Map();
  for (const group of groups) {
    const columns = [];
    for (const entry of group) {
      let column = 0;
      while (
        columns.some(
          (existing) =>
            existing.column === column &&
            entry.start < existing.entry.end &&
            existing.entry.start < entry.end
        )
      ) {
        column += 1;
      }
      entry.column = column;
      columns.push({ entry, column });
    }
    const columnCount = Math.max(...group.map((entry) => entry.column), 0) + 1;
    for (const entry of group) {
      layout.set(entry.item.id, {
        left: (entry.column / columnCount) * 100,
        width: 100 / columnCount
      });
    }
  }
  return layout;
}

function cleanCellText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:div|p|li|tr|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;|&ensp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\u3000]+/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function weekdayFromText(value) {
  const text = String(value ?? "")
    .replace(/\s+/g, "")
    .trim();
  const names = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6, 七: 6 };
  const matched = text.match(/星期([一二三四五六日天])/) ||
    text.match(/周([一二三四五六日天])/) ||
    text.match(/^([一二三四五六日天])$/);
  if (matched && names[matched[1]] !== undefined) return names[matched[1]];
  const number = text.match(/^(?:星期|周)?([1-7])$/);
  if (number) return Number(number[1]) - 1;
  return -1;
}

function chineseNumberToInt(value) {
  const text = String(value || "").trim();
  if (/^\d+$/.test(text)) return Number(text);
  const digits = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (text === "十") return 10;
  if (text.startsWith("十")) return 10 + (digits[text[1]] || 0);
  if (text.endsWith("十")) return (digits[text[0]] || 0) * 10;
  if (text.includes("十")) {
    const [tens, ones] = text.split("十");
    return (digits[tens] || 0) * 10 + (digits[ones] || 0);
  }
  return digits[text] || 0;
}

function periodNumberFromLabel(value) {
  const matched = String(value || "").match(/第([一二三四五六七八九十\d]+)\s*节/);
  return matched ? chineseNumberToInt(matched[1]) : 0;
}

function periodRanges(text, explicitOnly = false) {
  const ranges = [];
  const explicitMulti = /(?:第)?(\d{1,2})\s*(?:[-—–~～至])\s*(\d{1,2})\s*节/g;
  let match;
  while ((match = explicitMulti.exec(text))) {
    ranges.push([Number(match[1]), Number(match[2])]);
  }
  if (!ranges.length) {
    const explicitSingle = String(text).match(/第\s*([一二三四五六七八九十\d]+)\s*节/);
    if (explicitSingle) {
      const number = chineseNumberToInt(explicitSingle[1]);
      if (number) ranges.push([number, number]);
    }
  }
  if (ranges.length || explicitOnly) return ranges;

  const withoutWeeks = String(text).replace(
    /周次\s*[:：]?\s*[\d,，、\-—–~～至]+/g,
    "\u0000"
  ).replace(
    /(?:第|周次)?\s*\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?(?:\s*[、,，]\s*\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?)*(?:\s*周\s*[单双]?|\s*[单双]\s*周?)/g,
    "\u0000"
  );
  const multi = /(?:第)?(\d{1,2})\s*(?:[-—–~～至])\s*(\d{1,2})\s*(?:节)?(?!\s*[单双周])/g;
  while ((match = multi.exec(withoutWeeks))) {
    ranges.push([Number(match[1]), Number(match[2])]);
  }
  return ranges;
}

function periodRangeTimes(startNum, endNum, periodTable = NEUQ_PERIODS) {
  const start = periodTable[startNum];
  const end = periodTable[endNum];
  if (start && end) return { start: start[0], end: end[1] };
  const fallbackStart = Math.min(23, Math.max(6, 6 + (startNum - 1) * 2));
  const fallbackEnd = Math.min(23, 6 + endNum * 2);
  return {
    start: `${pad2(fallbackStart)}:00`,
    end: `${pad2(fallbackEnd)}:00`
  };
}

function parsePeriodTimesFromHTML(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const times = {};
  for (const cell of Array.from(doc.querySelectorAll("td, th"))) {
    const text = cleanCellText(cell.textContent);
    const matched = text.match(/第([一二三四五六七八九十\d]+)节\s+(\d{1,2}:\d{2})\s*[~～至-]\s*(\d{1,2}:\d{2})/);
    if (matched) {
      const number = chineseNumberToInt(matched[1]);
      if (number) times[number] = [matched[2], matched[3]];
    }
  }
  return Object.keys(times).length ? times : null;
}

function normalizeWeeks(value) {
  return String(value ?? "")
    .replace(/第|周次|周|[:：\s]/g, "")
    .replace(/,/g, "、")
    .replace(/(\d)\s*[-—–~～至]\s*(\d)/g, "$1-$2")
    .trim();
}

function matchWeeks(text) {
  const matched =
    text.match(/周次\s*[:：]?\s*(\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?(?:\s*[、,，]\s*\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?)*)/) ||
    text.match(/(?:第|周次)?\s*(\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?(?:\s*[、,，]\s*\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?)*)(?:\s*周\s*[单双]?|\s*[单双]\s*周?)/);
  if (!matched) return "";
  let weeks = normalizeWeeks(matched[1]);
  if (/[单双]$/.test(matched[0]) && !/[单双]$/.test(weeks)) weeks += matched[0].slice(-1);
  const after = text.slice(matched.index + matched[0].length, matched.index + matched[0].length + 4);
  const marker = after.match(/[单双]/);
  if (marker && !/[单双]$/.test(weeks)) weeks += marker[0];
  return weeks;
}

function looksLikeLocation(value) {
  const text = String(value || "").trim();
  return /(?:楼|馆|教室|实验室|操场|体育馆|图书馆|校区)[A-Za-z0-9]|^[A-Za-z]?\d{2,}|线上|腾讯会议|钉钉|zoom/i.test(text);
}

function extractLocation(value) {
  const text = String(value || "").trim();
  const building = text.match(/([A-Za-z\u4e00-\u9fa5]*?(?:教学楼|实验楼|综合楼|外语楼|宿舍楼|楼|馆|教室|实验室|图书馆|体育馆|操场)\s*[A-Za-z]?\d{0,4})/);
  if (building) return building[1].trim();
  const simple = text.match(/[A-Za-z]?\d{2,}/);
  return simple ? simple[0] : "";
}

function stripCourseFields(text) {
  return String(text)
    .replace(/(?:教师|老师|任课教师|授课教师)\s*[:：][^;\n]+/g, "\u0000")
    .replace(/(?:地点|教室|上课地点|上课教室)\s*[:：][^;\n]+/g, "\u0000")
    .replace(/(?:第)?\d{1,2}\s*[-—–~～至]\s*\d{1,2}\s*(?:节)?(?!\s*[单双周])/g, "\u0000")
    .replace(/第\s*\d{1,2}\s*节/g, "\u0000")
    .replace(/周次\s*[:：]?\s*[\d,，、\-—–~～至]+/g, "\u0000")
    .replace(
      /(?:第|周次)?\s*\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?(?:\s*[、,，]\s*\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?)*(?:\s*周\s*[单双]?|\s*[单双]\s*周?)/g,
      "\u0000"
    )
    .replace(/[;；]/g, "\u0000");
}

function courseColor(title) {
  const palette = ["cobalt", "rose", "day"];
  let hash = 0;
  for (const char of String(title || "")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return palette[hash % palette.length];
}

function parseCourseSegment(segment, weekday, periodLabel, periodTable = NEUQ_PERIODS) {
  let ranges = periodRanges(segment, true);
  if (!ranges.length) {
    const periodNumber = periodNumberFromLabel(periodLabel);
    if (periodNumber) ranges = [[periodNumber, periodNumber]];
  }
  if (!ranges.length) return [];
  const lines = segment
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  let weeks = lines.map((line) => matchWeeks(line)).find(Boolean) || matchWeeks(segment);
  let teacher = "";
  let location = "";
  const weekLocation = segment.match(/\((\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?(?:单|双)?)(?:\s+((?:[^()]|\([^)]*\))*))?\)/);
  if (weekLocation) {
    if (!weeks) weeks = normalizeWeeks(weekLocation[1]);
    if (!location && weekLocation[2]) location = weekLocation[2].trim();
  }
  const teacherMatch = segment.match(/(?:教师|老师|任课教师|授课教师)\s*[:：]\s*([^;\n]+)/);
  if (teacherMatch) teacher = teacherMatch[1].trim();
  const locationMatch = segment.match(/(?:地点|教室|上课地点|上课教室)\s*[:：]\s*([^;\n]+)/);
  if (locationMatch) location = locationMatch[1].trim();

  const parts = stripCourseFields(segment)
    .split("\u0000")
    .map((part) => part.trim())
    .filter(Boolean);
  const rawTitle = lines[0] || parts[0] || "";
  let title = rawTitle;
  title = title.replace(/\s*\([\d.]{6,}\)\s*/g, " ").replace(/\s+/g, " ").trim();

  for (const line of lines) {
    if (line === rawTitle || line === title || periodRanges(line).length || matchWeeks(line)) continue;
    if (/\(\d{4,}\.\d+\)/.test(line)) continue;
    if (/教师|老师|地点|教室/.test(line)) continue;
    const located = extractLocation(line);
    if (!location && located) {
      location = located;
      const rest = line.replace(located, " ").replace(/\s+/g, " ").trim();
      if (rest && !teacher) teacher = rest;
      continue;
    }
    if (!teacher && line !== location) teacher = line;
  }
  teacher = teacher.replace(/^\(|\)$/g, "").trim();
  if (!location) {
    const tailText = parts.slice(1).filter((part) => part !== title).join(" ");
    const located = extractLocation(tailText);
    if (located) {
      location = located;
      const rest = tailText.replace(located, " ").replace(/\s+/g, " ").trim();
      if (rest && !teacher) teacher = rest;
    }
  }

  return ranges.map(([startNum, endNum]) => {
    const times = periodRangeTimes(startNum, endNum, periodTable);
    return {
      title: title || "未命名课程",
      weekday,
      start: times.start,
      end: times.end,
      location,
      teacher,
      weeks,
      color: courseColor(title)
    };
  });
}

function isWeekLocationOnly(value) {
  return /^\(\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?(?:单|双)?\s+/.test(String(value || "").trim());
}

function parseCourseCell(raw, weekday, periodLabel, periodTable = NEUQ_PERIODS) {
  const text = cleanCellText(raw);
  if (!text || text === "&nbsp;" || weekday < 0) return [];
  if (periodRanges(text, true).length === 0 && !periodNumberFromLabel(periodLabel)) return [];
  const segments = text
    .split(/\n\s*\n/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const courses = [];
  let lastCourse = null;
  for (const segment of segments) {
    if (lastCourse && isWeekLocationOnly(segment)) {
      const weekLocation = segment.match(/\((\d{1,2}(?:\s*[-—–~～至]\s*\d{1,2})?(?:单|双)?)(?:\s+((?:[^()]|\([^)]*\))*))?\)/);
      if (weekLocation) {
        if (!lastCourse.weeks) lastCourse.weeks = normalizeWeeks(weekLocation[1]);
        if (!lastCourse.location && weekLocation[2]) lastCourse.location = weekLocation[2].trim();
        continue;
      }
    }
    const parsed = parseCourseSegment(segment, weekday, periodLabel, periodTable);
    for (const course of parsed) {
      courses.push(course);
      lastCourse = course;
    }
  }
  return courses;
}

function dedupeCourses(courses) {
  const seen = new Set();
  const unique = courses.filter((course) => {
    const key = [
      course.title,
      course.weekday,
      course.start,
      course.end,
      course.location || "",
      course.teacher || "",
      course.weeks || ""
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return mergeAdjacentCourses(unique);
}

function mergeAdjacentCourses(courses) {
  const groups = {};
  for (const course of courses) {
    const key = [
      course.title,
      course.weekday,
      course.location || "",
      course.teacher || "",
      course.weeks || ""
    ].join("|");
    groups[key] = groups[key] || [];
    groups[key].push(course);
  }
  const merged = [];
  for (const group of Object.values(groups)) {
    group.sort((a, b) => parseTime(a.start) - parseTime(b.start));
    let current = null;
    for (const course of group) {
      const previousEnd = current ? periodNumberForTime(current.end, "end") : 0;
      const nextStart = periodNumberForTime(course.start, "start");
      if (current && previousEnd + 1 === nextStart) {
        current.end = course.end;
        current.endPeriod = Number(course.endPeriod) || periodNumberForTime(course.end, "end");
      } else {
        current = {
          ...course,
          startPeriod: Number(course.startPeriod) || periodNumberForTime(course.start, "start"),
          endPeriod: Number(course.endPeriod) || periodNumberForTime(course.end, "end")
        };
        merged.push(current);
      }
    }
  }
  return merged;
}

function rowCellMap(row) {
  const map = [];
  let index = 0;
  for (const cell of Array.from(row.cells)) {
    const span = Number(cell.colSpan) || 1;
    for (let i = 0; i < span; i += 1) map[index++] = cell;
  }
  return map;
}

function parseScheduleHTML(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  if (!tables.length) return [];
  const periodTable = parsePeriodTimesFromHTML(html) || NEUQ_PERIODS;

  let best = tables[0];
  let bestWeekdayCount = -1;
  let bestCellCount = -1;
  for (const table of tables) {
    const rows = Array.from(table.rows || []);
    let weekdayCount = 0;
    let cellCount = 0;
    for (const row of rows) {
      for (const cell of Array.from(row.cells)) {
        if (weekdayFromText(cell.textContent) >= 0) weekdayCount += 1;
        if (cleanCellText(cell.textContent)) cellCount += 1;
      }
    }
    if (
      weekdayCount > bestWeekdayCount ||
      (weekdayCount === bestWeekdayCount && cellCount > bestCellCount)
    ) {
      bestWeekdayCount = weekdayCount;
      bestCellCount = cellCount;
      best = table;
    }
  }

  const rows = Array.from(best.rows || []);
  const courses = [];
  let headerRowIndex = -1;
  let headerCells = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const found = [];
    Array.from(rows[rowIndex].cells).forEach((cell, cellIndex) => {
      const weekday = weekdayFromText(cell.textContent);
      if (weekday >= 0) found.push({ cellIndex, weekday });
    });
    if (found.length >= 5) {
      headerRowIndex = rowIndex;
      headerCells = found;
      break;
    }
  }

  if (headerRowIndex >= 0) {
    for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const map = rowCellMap(rows[rowIndex]);
      for (const header of headerCells) {
        const cell = map[header.cellIndex];
        const periodLabel = map[0] ? map[0].textContent : "";
        if (cell) courses.push(...parseCourseCell(cell.innerHTML, header.weekday, periodLabel, periodTable));
      }
    }
    return dedupeCourses(courses);
  }

  // Fallback: first column is a time/period label, remaining columns are Mon-Sun.
  if (rows[0] && Array.from(rows[0].cells).length >= 7) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const cells = Array.from(rows[rowIndex].cells);
      const periodLabel = cells[0] ? cleanCellText(cells[0].innerHTML) : "";
      for (let index = 1; index <= 7; index += 1) {
        const cell = cells[index];
        if (cell) courses.push(...parseCourseCell(cell.innerHTML, index - 1, periodLabel, periodTable));
      }
    }
  }
  return dedupeCourses(courses);
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text || "").replace(/^\ufeff/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === "," || char === "\t") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function parseWeekdayNumber(value) {
  const text = String(value || "").trim();
  const number = Number(text);
  if (Number.isInteger(number) && number >= 1 && number <= 7) return number - 1;
  return weekdayFromText(text);
}

function parseWakeUpCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const header = rows[0].map((cell) => cleanCellText(cell));
  const hasHeader = header.some((cell) => /课程|名称|星期|节数|周数|老师|教师/.test(cell));
  const startRow = hasHeader ? 1 : 0;
  const findIndex = (patterns) => {
    const pattern = patterns.find((item) => header.some((cell) => cell.includes(item)));
    return pattern ? header.findIndex((cell) => cell.includes(pattern)) : -1;
  };
  const columns = hasHeader
    ? {
        title: findIndex(["课程名称", "课程", "名称"]),
        weekday: findIndex(["星期", "周几"]),
        start: findIndex(["开始节数", "开始", "节次开始"]),
        end: findIndex(["结束节数", "结束", "节次结束"]),
        teacher: findIndex(["老师", "教师"]),
        location: findIndex(["地点", "教室"]),
        weeks: findIndex(["周数", "周次"])
      }
    : { title: 0, weekday: 1, start: 2, end: 3, teacher: 4, location: 5, weeks: 6 };

  const courses = [];
  for (let rowIndex = startRow; rowIndex < rows.length; rowIndex += 1) {
    const cells = rows[rowIndex];
    const cellAt = (index) => (index >= 0 ? cells[index] || "" : "");
    const title = cleanCellText(cellAt(columns.title));
    const weekday = parseWeekdayNumber(cellAt(columns.weekday));
    const startNum = Number(String(cellAt(columns.start)).trim());
    const endNum = Number(String(cellAt(columns.end)).trim());
    if (!title || weekday < 0 || !Number.isInteger(startNum) || !Number.isInteger(endNum)) continue;
    const times = periodRangeTimes(startNum, endNum);
    const location = cleanCellText(cellAt(columns.location));
    courses.push({
      title,
      weekday,
      start: times.start,
      end: times.end,
      location: location && location !== "无" ? location : "",
      teacher: cleanCellText(cellAt(columns.teacher)),
      weeks: normalizeWeeks(cellAt(columns.weeks)),
      color: courseColor(title)
    });
  }
  return dedupeCourses(courses);
}

function parseImportText(text, kind) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  return kind === "csv" ? parseWakeUpCSV(raw) : parseScheduleHTML(raw);
}

function renderImportModal() {
  const preview = pendingImport.length
    ? `<div class="import-summary">
        <strong>解析到 ${pendingImport.length} 条课程</strong>
        <span>确认后会合并到现有课表，重复条目自动跳过</span>
      </div>
      <ul class="import-list">
        ${pendingImport
          .map(
            (course, index) => `<li>
              <label class="import-check">
                <input type="checkbox" data-index="${index}" checked>
                <span class="color-chip ${esc(course.color || "cobalt")}"></span>
                <span class="import-course">
                  <strong>${esc(course.title)}</strong>
                  <small>${WEEKDAYS[course.weekday]} · ${esc(course.start)}–${esc(course.end)}${course.location ? " · " + esc(course.location) : ""}${course.teacher ? " · " + esc(course.teacher) : ""}${course.weeks ? " · " + esc(course.weeks) + "周" : ""}</small>
                </span>
              </label>
            </li>`
          )
          .join("")}
      </ul>`
    : `<div class="empty-note">还没有解析结果。</div>`;

  const editor =
    importTab === "file"
      ? `<div class="import-editor file-mode">
          <input id="import-file" type="file" accept=".html,.htm,.xls,.csv,text/html,text/csv" hidden>
          <label class="btn" for="import-file">${icon("upload")}选择课表文件</label>
          <span class="panel-meta">${esc(importFileName) || "支持 .html / .xls / .csv"}</span>
        </div>`
      : `<div class="import-editor">
          <textarea id="import-text" rows="9" placeholder="${importTab === "csv" ? "课程名称, 星期, 开始节数, 结束节数, 老师, 地点, 周数" : "在这里粘贴教务课表网页内容…"}">${esc(importDraft)}</textarea>
          <div class="form-actions">
            <button class="btn btn-primary" data-action="parse-import">${icon("refresh")}解析课表</button>
          </div>
        </div>`;

  return `<div class="modal-card" role="dialog" aria-modal="true" aria-label="从官网导入课表">
    <div class="modal-head">
      <div>
        <h2>从官网导入课表</h2>
        <p>复制教务课表后粘贴，或上传 HTML / XLS / WakeUp CSV。</p>
      </div>
      <button class="btn-icon" data-action="close-import" aria-label="关闭">${icon("x")}</button>
    </div>

    <div class="import-school">
      <div class="school-badge">${icon("calendar")}</div>
      <div class="school-copy">
        <strong>东北大学秦皇岛分校</strong>
        <span>教务系统 · EAMS</span>
      </div>
      <a class="btn" href="http://jwxt.neuq.edu.cn/eams/localLogin.action" target="_blank" rel="noopener">${icon("link")}打开教务官网</a>
    </div>

    <div class="import-tabs" role="tablist" aria-label="导入方式">
      <button class="import-tab ${importTab === "html" ? "is-active" : ""}" data-action="import-tab" data-tab="html">粘贴网页表格</button>
      <button class="import-tab ${importTab === "csv" ? "is-active" : ""}" data-action="import-tab" data-tab="csv">WakeUp CSV</button>
      <button class="import-tab ${importTab === "file" ? "is-active" : ""}" data-action="import-tab" data-tab="file">上传文件</button>
    </div>

    ${editor}

    <div class="import-preview">${preview}</div>

    <div class="form-actions modal-actions">
      <button class="btn" data-action="close-import">取消</button>
      <button class="btn btn-primary" data-action="confirm-import" ${pendingImport.length ? "" : "disabled"}>${icon("plus")}确认导入${pendingImport.length ? ` ${pendingImport.length} 条` : ""}</button>
    </div>
  </div>`;
}

function openImport() {
  pendingImport = [];
  importTab = "html";
  importDraft = "";
  importFileText = "";
  importFileName = "";
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.id = "import-modal";
  overlay.innerHTML = renderImportModal();
  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");
}

function rerenderImport() {
  const overlay = $("#import-modal");
  if (!overlay) return;
  const textarea = $("#import-text");
  if (textarea) importDraft = textarea.value;
  overlay.innerHTML = renderImportModal();
}

function closeImport() {
  const overlay = $("#import-modal");
  if (overlay) overlay.remove();
  document.body.classList.remove("modal-open");
  pendingImport = [];
}

function openImageViewer(url) {
  const existing = $("#image-viewer");
  if (existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.className = "image-viewer";
  overlay.id = "image-viewer";
  overlay.innerHTML = `
    <button class="image-viewer-close" data-action="close-image-viewer" aria-label="关闭">${icon("x")}</button>
    <div class="image-viewer-toolbar">
      <button class="btn-icon" data-action="zoom-image" data-step="-0.5" aria-label="缩小">${icon("minus")}</button>
      <span class="image-viewer-zoom" id="image-viewer-zoom">100%</span>
      <button class="btn-icon" data-action="zoom-image" data-step="0.5" aria-label="放大">${icon("plus")}</button>
      <button class="btn" data-action="reset-image-zoom">原始大小</button>
    </div>
    <div class="image-viewer-stage">
      <img id="image-viewer-img" src="${esc(url)}" alt="查看大图">
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");
  const image = $("#image-viewer-img");
  if (image) {
    image.dataset.scale = "1";
    image.addEventListener("dblclick", () => {
      if (Number(image.dataset.scale) > 1.1) resetImageZoom();
      else zoomImageViewer(1);
    });
  }
}

function closeImageViewer() {
  const overlay = $("#image-viewer");
  if (overlay) overlay.remove();
  document.body.classList.remove("modal-open");
}

function zoomImageViewer(step) {
  const image = $("#image-viewer-img");
  if (!image) return;
  const next = Math.max(0.5, Math.min(4, Number(image.dataset.scale || 1) + Number(step || 0)));
  image.dataset.scale = String(next);
  image.style.transform = `scale(${next})`;
  const label = $("#image-viewer-zoom");
  if (label) label.textContent = `${Math.round(next * 100)}%`;
}

function resetImageZoom() {
  const image = $("#image-viewer-img");
  if (!image) return;
  image.dataset.scale = "1";
  image.style.transform = "scale(1)";
  const label = $("#image-viewer-zoom");
  if (label) label.textContent = "100%";
}

function sameCourse(left, right) {
  return (
    String(left.title || "").trim() === String(right.title || "").trim() &&
    Number(left.weekday) === Number(right.weekday) &&
    left.start === right.start &&
    left.end === right.end &&
    String(left.location || "").trim() === String(right.location || "").trim() &&
    String(left.weeks || "").trim() === String(right.weeks || "").trim()
  );
}

function confirmImport() {
  const checked = Array.from($$("#import-modal input[type=checkbox]:checked"));
  if (!checked.length) {
    toast("请至少选择一门课程");
    return;
  }
  let added = 0;
  let skipped = 0;
  for (const box of checked) {
    const course = pendingImport[Number(box.dataset.index)];
    if (!course) continue;
    if (state.schedule.some((item) => sameCourse(item, course))) {
      skipped += 1;
      continue;
    }
    state.schedule.push({
      id: uid("course"),
      title: course.title,
      start: course.start,
      end: course.end,
      startPeriod: Number(course.startPeriod) || periodNumberForTime(course.start, "start"),
      endPeriod: Number(course.endPeriod) || periodNumberForTime(course.end, "end"),
      weekday: Number(course.weekday),
      location: course.location || "",
      teacher: course.teacher || "",
      weeks: course.weeks || "",
      color: course.color || "cobalt"
    });
    added += 1;
  }
  scheduleSave();
  closeImport();
  render();
  toast(`已导入 ${added} 门课程${skipped ? `，跳过 ${skipped} 条重复` : ""}`);
}

function noteCard(note) {
  return `<article class="note-card">
    ${note.image ? `<button class="image-open" data-action="open-image" data-url="${esc(note.image)}" aria-label="查看大图"><img class="note-card-img" src="${esc(note.image)}" alt="" loading="lazy"></button>` : ""}
    <div class="note-card-body">
      <h3>${esc(note.title)}</h3>
      <p>${esc(note.body)}</p>
      <span class="note-card-date">${esc(formatDate(note.date))}</span>
      <div class="form-actions">
        <button class="btn-icon btn-danger" data-action="delete-note" data-id="${esc(note.id)}" aria-label="删除记录">${icon("trash")}</button>
      </div>
    </div>
  </article>`;
}

function renderToday() {
  const today = todayISO();
  const name = state.settings.name || "今天";
  const focus = state.focus && state.focus.date === today ? state.focus.text : "";
  const checks = state.checks
    .map((check) => {
      const done = isDoneOn(today, check.doneDates);
      const timeLabel = { morning: "早晨", day: "白天", evening: "晚上" }[check.time] || "全天";
      return `<li class="check-row">
        ${checkButton(done, check.id)}
        <span class="check-label">${esc(check.label)}</span>
        <span class="check-time">${timeLabel}</span>
      </li>`;
    })
    .join("");
  const tasks = todayTasks();
  const schedule = todaySchedule();
  const rooms = todayRoomEntry();
  const roomOpenSet = roomOpenSetFor(rooms);
  const habits = state.habits.map((habit) => habitTile(habit, true)).join("");
  const notes = recentNotes();
  const progress = Math.round(dayProgress());

  return `
    <section class="hero-band">
      <div class="greeting">
        <h1>${greeting()}，${esc(name)}</h1>
        <p class="date-line">${esc(formatDate(today))} · 现在 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</p>
      </div>
      <div class="horizon-progress">
        <div class="horizon-caption"><span>一天进度</span><span>${progress}%</span></div>
        <div class="horizon-track" style="--p: ${progress}%"></div>
      </div>
    </section>

    <div class="focus-strip">
      <div>
        <label for="focus-input">今日专注</label>
        <input id="focus-input" value="${esc(focus)}" placeholder="今天最重要的一件事" autocomplete="off">
      </div>
      <button class="btn btn-primary" data-action="save-focus">${icon("save")}保存</button>
    </div>

    <div class="grid">
      <section class="panel checks-panel">
        <div class="panel-head">
          <h2>每日自检</h2>
          <span class="panel-meta">${state.checks.filter((check) => isDoneOn(today, check.doneDates)).length}/${state.checks.length}</span>
        </div>
        ${state.checks.length ? `<ul class="check-list">${checks}</ul>` : `<div class="empty-note">还没有自检项，可以在设置里载入示例，或稍后扩展。</div>`}
      </section>

      <section class="panel tasks-panel">
        <div class="panel-head">
          <h2>今日任务</h2>
          <span class="panel-meta">${tasks.filter((task) => !task.done).length} 件待完成</span>
        </div>
        <form class="quick-add" id="today-task-form">
          <input id="today-task-input" placeholder="写下今天要完成的事" autocomplete="off">
          <button class="btn btn-primary" type="submit">${icon("plus")}添加</button>
        </form>
        <ul class="task-list">${taskRows(tasks)}</ul>
      </section>

      <section class="panel schedule-panel">
        <div class="panel-head">
          <h2>今日课表</h2>
          <span class="panel-meta">${schedule.length ? "下一个：" + esc(schedule[0].title) : "无安排"}</span>
        </div>
        ${schedule.length ? `<ul class="schedule-list">${schedule.map((item) => scheduleItemRow(item)).join("")}</ul>` : `<div class="empty-note">今天没有安排。需要的话可以去课表添加课程或时间块。</div>`}
      </section>

      ${rooms ? `<section class="panel rooms-panel">
        <div class="panel-head">
          <h2>今日空教室</h2>
          <span class="panel-meta">${Object.keys(rooms.periods || {}).length} 个时段</span>
        </div>
        <div class="rooms-compact">${roomPeriodsHtml(rooms.periods, rooms.id, roomOpenSet)}</div>
      </section>` : `<section class="panel rooms-panel">
        <div class="panel-head">
          <h2>今日空教室</h2>
          <span class="panel-meta">未导入</span>
        </div>
        <div class="empty-note">今天还没导入空教室，去“自习室”粘贴即可。</div>
      </section>`}

      <section class="panel habits-panel">
        <div class="panel-head">
          <h2>今日习惯</h2>
          <span class="panel-meta">${state.habits.filter((habit) => isDoneOn(today, habit.history)).length}/${state.habits.length} 已打卡</span>
        </div>
        ${state.habits.length ? `<div class="habit-grid">${habits}</div>` : `<div class="empty-note">还没有习惯，去习惯页面添加第一个每日习惯。</div>`}
      </section>

      <section class="panel notes-snap">
        <div class="panel-head">
          <h2>最近记录</h2>
          <span class="panel-meta">${notes.length} 条</span>
        </div>
        ${notes.length ? `<div class="note-strip">${notes.map(noteCard).join("")}</div>` : `<div class="empty-note">还没有记录。灵感、课业或任何想留住的内容，都可以写在记录里。</div>`}
      </section>
    </div>
  `;
}

function renderTasks() {
  const filtered = state.tasks.filter((task) => {
    if (taskFilter === "today") return task.date === todayISO() || (!task.date && !task.done);
    if (taskFilter === "done") return task.done;
    return true;
  });
  const undone = state.tasks.filter((task) => !task.done).length;
  return `
    <div class="page-head">
      <div>
        <h1>待办</h1>
        <p>把要完成的事放在这里，按优先级和日期推进。</p>
      </div>
      <span class="panel-meta">${undone} 件未完成</span>
    </div>

    <div class="task-editor">
      <div class="form-row">
        <label class="field-label">任务
          <input id="task-title" placeholder="例如：整理明天的计划" autocomplete="off">
        </label>
        <label class="field-label">日期
          <input id="task-date" type="date" value="${todayISO()}">
        </label>
        <label class="field-label">优先级
          <select id="task-priority">
            <option value="high">高</option>
            <option value="medium" selected>中</option>
            <option value="low">低</option>
          </select>
        </label>
      </div>
      <div class="form-row form-row-two">
        <label class="field-label">时间
          <input id="task-time" type="time">
        </label>
        <label class="field-label">提醒
          <select id="task-remind">${reminderOptions()}</select>
        </label>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" data-action="save-task">${icon("plus")}${editingTaskId ? "保存修改" : "添加任务"}</button>
        ${editingTaskId ? `<button class="btn" data-action="cancel-edit">${icon("x")}取消</button>` : ""}
      </div>
    </div>

    <div class="toolbar">
      <div class="filter-tabs" role="tablist" aria-label="任务筛选">
        <button class="filter-tab ${taskFilter === "today" ? "is-active" : ""}" data-action="filter-task" data-filter="today">今天</button>
        <button class="filter-tab ${taskFilter === "all" ? "is-active" : ""}" data-action="filter-task" data-filter="all">全部</button>
        <button class="filter-tab ${taskFilter === "done" ? "is-active" : ""}" data-action="filter-task" data-filter="done">已完成</button>
      </div>
      <span class="panel-meta">${filtered.length} 条</span>
    </div>

    <ul class="task-list">${taskRows(filtered)}</ul>
  `;
}

function renderHabits() {
  const today = todayISO();
  const doneToday = state.habits.filter((habit) => isDoneOn(today, habit.history)).length;
  const picker = HABIT_ICONS.map(
    (name) => `<button class="icon-pick ${selectedHabitIcon === name ? "is-active" : ""}" data-action="set-icon" data-icon="${name}" aria-label="${name} 图标">${icon(name)}</button>`
  ).join("");
  return `
    <div class="page-head">
      <div>
        <h1>习惯</h1>
        <p>每天做一点点，让好习惯自己长出来。</p>
      </div>
      <span class="panel-meta">今天 ${doneToday}/${state.habits.length}</span>
    </div>

    <div class="form-grid">
      <div class="form-row">
        <label class="field-label">习惯名称
          <input id="habit-name" placeholder="例如：喝水、阅读、早睡" autocomplete="off">
        </label>
      </div>
      <div class="form-row form-row-two">
        <label class="field-label">时间
          <input id="habit-time" type="time">
        </label>
        <label class="field-label">提醒
          <select id="habit-remind">${reminderOptions()}</select>
        </label>
      </div>
      <div class="field-label">图标
        <div class="icon-picker">${picker}</div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" data-action="save-habit">${icon("plus")}${editingHabitId ? "保存修改" : "添加习惯"}</button>
        ${editingHabitId ? `<button class="btn" data-action="cancel-edit">${icon("x")}取消</button>` : ""}
      </div>
    </div>

    ${state.habits.length ? `<div class="big-grid">${state.habits.map((habit) => habitTile(habit)).join("")}</div>` : `<div class="panel"><div class="empty-note">还没有习惯。先添加一个喝水或阅读，明天就能开始打卡。</div></div>`}
  `;
}

function renderSchedule() {
  const blocksByDay = WEEKDAYS.map((_, day) =>
    state.schedule
      .filter((item) => Number(item.weekday) === day && scheduleVisible(item))
      .sort((a, b) => parseTime(a.start) - parseTime(b.start))
  );
  const layoutsByDay = blocksByDay.map(layoutDayBlocks);
  const timeSlots = Object.entries(NEUQ_PERIODS).map(([num, [start, end]]) => `
    <div class="time-slot">
      <span>第 ${num} 节</span>
      <span>${start}–${end}</span>
    </div>`
  ).join("");
  const todayIndex = weekdayIndex();
  const dayHeads = WEEKDAYS.map((name, day) => `
    <div class="day-head ${day === todayIndex ? "is-today" : ""}" style="grid-column:${day + 2}">${name}</div>
  `).join("");
  const dayCols = WEEKDAYS.map((name, day) => {
    const blocks = blocksByDay[day]
      .map((item) => {
        const startPeriod = Number(item.startPeriod) || periodNumberForTime(item.start, "start");
        const endPeriod = Number(item.endPeriod) || periodNumberForTime(item.end, "end");
        const position = layoutsByDay[day].get(item.id) || { left: 0, width: 100 };
        const colStart = Math.max(1, Math.min(10, Math.round((position.left || 0) / 10) + 1));
        const colSpan = Math.max(1, Math.min(10 - colStart + 1, Math.round((position.width || 100) / 10)));
        const narrow = position.width < 70 ? " is-narrow" : "";
        return `<div class="course-block ${esc(item.color || "cobalt")}${narrow}" style="grid-row:${Math.max(1, startPeriod)} / ${Math.min(12, endPeriod) + 1};grid-column:${colStart} / span ${colSpan};" data-action="edit-course" data-id="${esc(item.id)}" title="编辑">
          <strong>${esc(item.title)}</strong>
          <span>${esc(item.start)}–${esc(item.end)}${scheduleMeta(item) ? " · " + esc(scheduleMeta(item)) : ""}</span>
          <button class="course-delete" data-action="delete-course" data-id="${esc(item.id)}" aria-label="删除安排">${icon("trash")}</button>
        </div>`;
      })
      .join("");
    return `<div class="day-col ${day === todayIndex ? "is-today" : ""}" style="grid-column:${day + 2};grid-row:2 / 14;">
      ${Array.from({ length: 12 }, (_, periodIndex) => `<div class="period-cell" style="grid-row:${periodIndex + 1};grid-column:1 / -1;"></div>`).join("")}
      ${blocks}
    </div>`;
  }).join("");

  const mobileItems = blocksByDay[mobileDay].length
    ? blocksByDay[mobileDay].map((item) => scheduleItemRow(item, true)).join("")
    : `<div class="empty-note">${WEEKDAYS[mobileDay]}还没有安排。</div>`;

  return `
    <div class="page-head">
      <div>
        <h1>课表</h1>
        <p>课程、运动和固定安排，按周查看。</p>
      </div>
      <div class="page-actions">
        <span class="panel-meta">${state.schedule.length} 个固定安排</span>
        <label class="week-picker">
          <span>当前周</span>
          <select id="current-week" aria-label="当前教学周">
            <option value="">未设置</option>
            ${Array.from({ length: 20 }, (_, index) => `<option value="${index + 1}" ${currentWeekNumber() === index + 1 ? "selected" : ""}>第 ${index + 1} 周</option>`).join("")}
          </select>
        </label>
        <button class="btn" data-action="open-import">${icon("upload")}从官网导入</button>
      </div>
    </div>

    <div class="form-grid">
      <div class="form-row">
        <label class="field-label">名称
          <input id="course-title" placeholder="例如：数据结构" autocomplete="off">
        </label>
        <label class="field-label">星期
          <select id="course-weekday">${WEEKDAYS.map((name, index) => `<option value="${index}" ${index === mobileDay ? "selected" : ""}>${name}</option>`).join("")}</select>
        </label>
        <label class="field-label">颜色
          <select id="course-color">
            <option value="cobalt" selected>钴蓝</option>
            <option value="rose">玫瑰</option>
            <option value="day">晨白</option>
          </select>
        </label>
      </div>
      <div class="form-row">
        <label class="field-label">开始
          <input id="course-start" type="time" value="08:00">
        </label>
        <label class="field-label">结束
          <input id="course-end" type="time" value="09:40">
        </label>
        <label class="field-label">地点
          <input id="course-location" placeholder="例如：教学楼 A301" autocomplete="off">
        </label>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" data-action="save-course">${icon("plus")}${editingCourseId ? "保存修改" : "添加安排"}</button>
        ${editingCourseId ? `<button class="btn" data-action="cancel-edit">${icon("x")}取消</button>` : ""}
      </div>
    </div>

    <div class="timetable-scroll">
      <div class="timetable-desktop">
        <div class="time-axis">
          <div class="time-axis-head">节次</div>
          ${timeSlots}
        </div>
        ${dayHeads}
        ${dayCols}
      </div>
    </div>

    <div class="schedule-mobile">
      <div class="day-chips">
        ${WEEKDAYS.map((name, index) => `<button class="day-chip ${index === mobileDay ? "is-active" : ""}" data-action="choose-day" data-day="${index}">${name}</button>`).join("")}
      </div>
      <ul class="schedule-list">${mobileItems}</ul>
    </div>
  `;
}

function renderNotes() {
  const sorted = [...state.notes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return `
    <div class="page-head">
      <div>
        <h1>记录</h1>
        <p>灵感、想法、课业摘录，都可以带图留住。</p>
      </div>
      <span class="panel-meta">${state.notes.length} 条</span>
    </div>

    <div class="task-editor">
      <div class="form-row wide">
        <label class="field-label">标题
          <input id="note-title" placeholder="这条记录叫什么" autocomplete="off">
        </label>
      </div>
      <div class="form-row wide">
        <label class="field-label">内容
          <textarea id="note-body" placeholder="写下想留住的内容……"></textarea>
        </label>
      </div>
      <div class="form-actions">
        <div class="upload-zone">
          <button class="btn" data-action="choose-file">${icon("upload")}选择图片</button>
          ${noteImageUrl ? `<button class="btn-icon btn-danger" data-action="clear-image" aria-label="移除图片">${icon("x")}</button>` : ""}
          <input id="note-image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
          <img id="note-image-preview" class="upload-preview ${noteImageUrl ? "is-visible" : ""}" src="${esc(noteImageUrl)}" alt="图片预览">
        </div>
        <button class="btn btn-primary" data-action="save-note">${icon("save")}保存记录</button>
      </div>
    </div>

    ${sorted.length ? `<div class="big-grid">${sorted.map(noteCard).join("")}</div>` : `<div class="panel"><div class="empty-note">还没有记录。今天的第一条灵感，可以从这里开始。</div></div>`}
  `;
}

function renderReview() {
  const currentWeek = isoWeekKey(new Date());
  const existing = state.reviews.find((review) => review.week === currentWeek);
  const sorted = [...state.reviews].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return `
    <div class="page-head">
      <div>
        <h1>复盘</h1>
        <p>每周停下来看一次：做成了什么、卡在哪里、下周怎么走。</p>
      </div>
      <span class="panel-meta">${currentWeek}</span>
    </div>

    <div class="form-grid review-form">
      <div class="form-row">
        <label class="field-label">本周收获
          <textarea id="review-wins" placeholder="做成的事、值得记住的瞬间……">${esc(existing ? existing.wins : "")}</textarea>
        </label>
      </div>
      <div class="form-row">
        <label class="field-label">遇到的问题
          <textarea id="review-problems" placeholder="哪里卡住了，或者哪里反复消耗精力……">${esc(existing ? existing.problems : "")}</textarea>
        </label>
      </div>
      <div class="form-row">
        <label class="field-label">下周行动
          <textarea id="review-next" placeholder="下一周最想推进的一两件事……">${esc(existing ? existing.next : "")}</textarea>
        </label>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" data-action="save-review">${icon("save")}${existing ? "更新本周复盘" : "保存复盘"}</button>
        ${editingReviewId ? `<button class="btn" data-action="cancel-edit">${icon("x")}取消</button>` : ""}
      </div>
    </div>

    ${sorted.length ? `<div class="settings-list">${sorted.map((review) => `
      <section class="settings-row">
        <div>
          <h2>${esc(review.week)}</h2>
          <p><strong>收获：</strong>${esc(review.wins)}</p>
          <p><strong>问题：</strong>${esc(review.problems)}</p>
          <p><strong>下周：</strong>${esc(review.next)}</p>
        </div>
        <div class="form-actions">
          <button class="btn" data-action="edit-review" data-id="${esc(review.id)}">${icon("edit")}编辑</button>
          <button class="btn-icon btn-danger" data-action="delete-review" data-id="${esc(review.id)}" aria-label="删除复盘">${icon("trash")}</button>
        </div>
      </section>`).join("")}</div>` : `<div class="panel"><div class="empty-note">还没有复盘。周末花五分钟写一次，比记十页计划更有用。</div></div>`}
  `;
}

function assetCard(asset) {
  return `<figure class="asset-card">
    <button class="image-open" data-action="open-image" data-url="${esc(asset.url)}" aria-label="查看大图">
      <img src="${esc(asset.url)}" alt="${esc(asset.title || "资料图片")}" loading="lazy">
    </button>
    <figcaption>
      <span>${esc(asset.title || "资料图片")}</span>
      <small>${esc(formatDate(asset.date))}</small>
      <button class="btn-icon btn-danger" data-action="delete-asset" data-id="${esc(asset.id)}" aria-label="删除图片">${icon("trash")}</button>
    </figcaption>
  </figure>`;
}

function renderAssets() {
  const sorted = [...state.assets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return `
    <div class="page-head">
      <div>
        <h1>资料库</h1>
        <p>课程资料、截图和灵感图，集中放在这里。</p>
      </div>
      <div class="page-actions">
        <span class="panel-meta">${state.assets.length} 张图片</span>
        <button class="btn btn-primary" data-action="choose-asset">${icon("upload")}上传图片</button>
      </div>
    </div>
    <input id="asset-image" type="file" accept="image/*" multiple hidden>
    ${sorted.length
      ? `<div class="asset-grid">${sorted.map(assetCard).join("")}</div>`
      : `<div class="panel"><div class="empty-note">还没有图片。把课程资料、截图或灵感图传上来，集中存到这里。</div></div>`}
  `;
}

function roomDateFromText(value) {
  const matched = String(value || "").match(/(20\d{2})[.\-/年]\s*(\d{1,2})[.\-/月]\s*(\d{1,2})/);
  return matched ? `${matched[1]}-${pad2(matched[2])}-${pad2(matched[3])}` : "";
}

function parseRoomText(text, fallbackDate = "") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const periods = {};
  let currentKey = "";
  for (const line of lines) {
    const heading = line.match(/^([\d一二三四五六七八九十]+(?:[-—–~～至][\d一二三四五六七八九十]+)+节)\s*[：:]/);
    if (heading) {
      currentKey = heading[1].replace(/[—–~～至]/g, "-");
      periods[currentKey] = periods[currentKey] || [];
      continue;
    }
    if (!currentKey) continue;
    const rooms = line.match(/\bG\d{3}\b/gi);
    if (rooms) {
      const unique = new Set(periods[currentKey]);
      rooms.forEach((room) => unique.add(room.toUpperCase()));
      periods[currentKey] = Array.from(unique);
    }
  }
  const date = roomDateFromText(text) || fallbackDate || todayISO();
  return { date, periods };
}

function todayRoomEntry() {
  return state.rooms.find((entry) => entry.date === todayISO()) || null;
}

function currentPeriodNumber() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  for (const [number, [start, end]] of Object.entries(NEUQ_PERIODS)) {
    const startMinutes = parseTime(start);
    const endMinutes = parseTime(end);
    if (minutes >= startMinutes && minutes < endMinutes) return Number(number);
  }
  return 0;
}

function roomPeriodTimeLabel(key) {
  const numbers = String(key || "").match(/\d+/g) || [];
  const first = Number(numbers[0]);
  const last = Number(numbers[numbers.length - 1] || numbers[0]);
  const start = NEUQ_PERIODS[first] && NEUQ_PERIODS[first][0];
  const end = NEUQ_PERIODS[last] && NEUQ_PERIODS[last][1];
  return start && end ? `${start}~${end}` : "";
}

function roomPeriodKeyForNow(periods) {
  const current = currentPeriodNumber();
  if (!current) return "";
  let bestKey = "";
  let bestSpan = 99;
  for (const key of Object.keys(periods || {})) {
    const numbers = key.match(/\d+/g) || [];
    const first = Number(numbers[0]);
    const last = Number(numbers[1] || numbers[0]);
    if (current >= first && current <= last) {
      const span = last - first;
      if (span < bestSpan) {
        bestSpan = span;
        bestKey = key;
      }
    }
  }
  return bestKey;
}

function roomOpenSetFor(entry) {
  const openSet = new Set(openRoomPeriods);
  if (!roomAutoDone && entry) {
    const autoKey = roomPeriodKeyForNow(entry.periods);
    if (autoKey) {
      const key = `${entry.id}:${autoKey}`;
      openRoomPeriods.add(key);
      openSet.add(key);
    }
    roomAutoDone = true;
  }
  return openSet;
}

function roomPeriodsHtml(periods, entryId = "", openSet = null) {
  const entries = Object.entries(periods || {});
  if (!entries.length) return `<div class="empty-note">这条记录里没有解析到节次。</div>`;
  return entries
    .map(([label, rooms]) => {
      const open = !entryId || !openSet || openSet.has(`${entryId}:${label}`);
      return `<div class="room-period">
        <button class="room-period-toggle ${open ? "is-open" : ""}" data-action="${entryId ? "toggle-room-period" : ""}" data-entry="${esc(entryId)}" data-key="${esc(label)}" aria-expanded="${open ? "true" : "false"}">
          <span class="room-period-label">${esc(label)}<small>${esc(roomPeriodTimeLabel(label))}</small></span>
          <span class="room-count">${rooms.length} 间</span>
          ${entryId ? icon(open ? "x" : "plus") : ""}
        </button>
        ${open ? `<div class="room-chips">
          ${rooms.map((room) => `<button class="room-chip" data-action="copy-room" data-room="${esc(room)}">${esc(room)}</button>`).join("")}
        </div>` : ""}
      </div>`;
    })
    .join("");
}

function roomEntryCard(entry, openSet) {
  return `<article class="room-entry">
    <div class="room-entry-head">
      <strong>${esc(formatDate(entry.date))}</strong>
      <span class="panel-meta">${Object.keys(entry.periods || {}).length} 个时段</span>
    </div>
    ${roomPeriodsHtml(entry.periods, entry.id, openSet)}
  </article>`;
}

function saveRoomEntry() {
  const textarea = $("#room-import-text");
  const text = textarea ? textarea.value.trim() : "";
  if (!text) {
    toast("先粘贴空教室信息");
    return;
  }
  const fallbackDate = $("#room-import-date")?.value || todayISO();
  const parsed = parseRoomText(text, fallbackDate);
  if (!Object.keys(parsed.periods).length) {
    toast("没有识别到节次，请确认粘贴了完整内容");
    return;
  }
  const existing = state.rooms.find((entry) => entry.date === parsed.date);
  if (existing) {
    Object.assign(existing, {
      periods: parsed.periods,
      sourceText: text,
      updatedAt: new Date().toISOString()
    });
  } else {
    state.rooms.unshift({
      id: uid("room"),
      date: parsed.date,
      periods: parsed.periods,
      sourceText: text,
      createdAt: new Date().toISOString()
    });
  }
  scheduleSave();
  render();
  toast(`已保存 ${formatDate(parsed.date)} 的空教室`);
}

function locateRoomTime() {
  const sorted = [...state.rooms].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) {
    toast("还没有空教室记录");
    return;
  }
  const key = roomPeriodKeyForNow(sorted[0].periods);
  if (!key) {
    toast("当前不在上课时段");
    return;
  }
  openRoomPeriods.add(`${sorted[0].id}:${key}`);
  render();
  requestAnimationFrame(() => {
    const target = document.querySelector(`.room-period-toggle[data-entry="${sorted[0].id}"][data-key="${CSS.escape(key)}"]`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function renderRooms() {
  const sorted = [...state.rooms].sort((a, b) => b.date.localeCompare(a.date));
  const openSet = roomOpenSetFor(sorted[0]);
  return `
    <div class="page-head">
      <div>
        <h1>自习室</h1>
        <p>每天的空教室信息粘贴进来，自动按节次整理。</p>
      </div>
      <div class="page-actions">
        <span class="panel-meta">${state.rooms.length} 天记录</span>
        <button class="btn" data-action="locate-room-time">${icon("clock")}定位当前时段</button>
      </div>
    </div>

    <div class="form-grid room-editor">
      <div class="form-row">
        <label class="field-label">日期
          <input id="room-import-date" type="date" value="${todayISO()}">
        </label>
        <label class="field-label wide">空教室信息
          <textarea id="room-import-text" rows="10" placeholder="粘贴“不洗碗工作室”那种空教室文字…"></textarea>
        </label>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" data-action="save-room">${icon("save")}解析并保存</button>
      </div>
    </div>

    ${sorted.length
      ? `<div class="room-history">${sorted.map((entry) => roomEntryCard(entry, openSet)).join("")}</div>`
      : `<div class="panel"><div class="empty-note">还没有空教室记录。每天把文字粘贴到上方，保存后就能直接查看。</div></div>`}
  `;
}

function renderSettings() {
  return `
    <div class="page-head">
      <div>
        <h1>设置</h1>
        <p>名字、标题、同步和数据都由你控制。</p>
      </div>
      <span class="panel-meta">版本 ${APP_VERSION}</span>
    </div>

    <div class="settings-list">
      <section class="settings-row">
        <div>
          <h2>名字与标题</h2>
          <p>首页问候和工作台名称会跟随这里。</p>
          <label class="field-label">显示名字
            <input id="set-name" value="${esc(state.settings.name)}" placeholder="你的名字或昵称" autocomplete="off">
          </label>
          <label class="field-label">工作台标题
            <input id="set-title" value="${esc(state.settings.title)}" placeholder="我的工作台" autocomplete="off">
          </label>
        </div>
        <button class="btn btn-primary" data-action="save-settings">${icon("save")}保存</button>
      </section>

      <section class="settings-row">
        <div>
          <h2>云端同步</h2>
          <p>填好免费云端地址和密钥后，网页和手机共用同一份数据，电脑不用一直开着。</p>
          <label class="field-label">项目地址
            <input id="cloud-url" value="${esc(cloudConfig?.url || "")}" placeholder="https://xxxx.supabase.co" autocomplete="off">
          </label>
          <label class="field-label">匿名密钥
            <input id="cloud-key" value="${esc(cloudConfig?.key || "")}" placeholder="粘贴 anon public key" autocomplete="off">
          </label>
          <div class="form-actions">
            <button class="btn btn-primary" data-action="save-cloud">${icon("save")}${cloudEnabled() ? "保存并同步" : "开启云端"}</button>
            ${cloudEnabled() ? `<button class="btn" data-action="clear-cloud">${icon("x")}关闭云端</button>` : ""}
          </div>
          ${cloudEnabled() ? "" : `<div class="server-address">${icon("link")}<span>本机地址 http://${esc(location.host)}</span></div>`}
        </div>
        <span class="panel-meta" id="settings-sync">${syncStatus === "synced" ? "已同步" : syncStatus === "syncing" ? "同步中" : syncStatus === "offline" ? "已存本机" : "正在连接"}</span>
      </section>

      <section class="settings-row">
        <div>
          <h2>提醒通知</h2>
          <span class="panel-meta" id="notification-status">${notificationStatusText()}</span>
          <span class="panel-meta" id="notification-detail">${esc(reminderStatusText)}</span>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" data-action="enable-notifications">${icon("check")}开启通知</button>
          <button class="btn" data-action="test-notification">${icon("clock")}测试提醒</button>
          <button class="btn" data-action="resync-notifications">${icon("refresh")}重新安排</button>
        </div>
      </section>

      <section class="settings-row">
        <div>
          <h2>数据</h2>
          <p>示例数据用于看看工作台长什么样；清空会把任务、习惯、课表、记录和复盘都重置。</p>
        </div>
        <div class="form-actions">
          <button class="btn" data-action="load-demo">${icon("refresh")}载入示例</button>
          <button class="btn btn-danger" data-action="clear-data">${icon("trash")}清空数据</button>
        </div>
      </section>
    </div>
  `;
}

function render(scrollToTop = false) {
  const view = $("#view");
  const previousScrollY = window.scrollY;
  const htmlByView = {
    today: renderToday,
    tasks: renderTasks,
    habits: renderHabits,
    schedule: renderSchedule,
    notes: renderNotes,
    assets: renderAssets,
    rooms: renderRooms,
    review: renderReview,
    settings: renderSettings
  };
  view.innerHTML = htmlByView[currentView]();
  if (scrollToTop) {
    window.scrollTo({ top: 0, behavior: "auto" });
  } else {
    window.scrollTo(0, previousScrollY);
  }

  $$(".nav-btn, .dock-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === currentView);
  });
  $("#brand-title").textContent = state.settings.title || "我的工作台";
  document.title = `${state.settings.title || "我的工作台"}`;
  $("#topbar-date").textContent = `${formatDate(todayISO())} · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  document.body.classList.toggle("dock-hidden", Boolean(state.settings.hideMobileNav));
  const dockToggle = $("#dock-toggle");
  if (dockToggle) dockToggle.textContent = state.settings.hideMobileNav ? "展开导航" : "收起导航";
  refreshReminderStatus();
  scheduleRemindersSoon();
}

function setSync(status) {
  syncStatus = status;
  $$(".sync-dot").forEach((dot) => {
    dot.classList.remove("is-synced", "is-offline");
    if (status === "synced") dot.classList.add("is-synced");
    if (status === "offline") dot.classList.add("is-offline");
  });
  const text = status === "synced" ? "已同步" : status === "syncing" ? "同步中" : status === "offline" ? "已存本机" : "正在连接";
  $$("#sync-text, #rail-sync-text").forEach((el) => {
    el.textContent = text;
  });
  const settingsSync = $("#settings-sync");
  if (settingsSync) settingsSync.textContent = text;
}

function readLocalState() {
  try {
    const raw = localStorage.getItem(LOCAL_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    return null;
  }
}

function readCloudConfig() {
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.disabled) return null;
      if (parsed && parsed.url && parsed.key) {
        return {
          url: String(parsed.url).replace(/\/+$/, ""),
          key: String(parsed.key),
          bucket: parsed.bucket || "workbench"
        };
      }
    }
  } catch (err) {
    // fall through to the built-in cloud account
  }
  return { ...DEFAULT_CLOUD_CONFIG };
}

function writeCloudConfig(config) {
  try {
    localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch (err) {
    return false;
  }
}

function cloudEnabled() {
  return Boolean(cloudConfig);
}

function cloudHeaders(json = false) {
  const headers = {
    apikey: cloudConfig.key,
    Authorization: `Bearer ${cloudConfig.key}`
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

function cloudTable() {
  return `${cloudConfig.url}/rest/v1/workbench_state`;
}

function writeLocalState() {
  try {
    localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({ revision, state }));
    return true;
  } catch (err) {
    const now = Date.now();
    if (now - lastLocalStorageWarning > 12000) {
      lastLocalStorageWarning = now;
      toast("本机存储空间不足，建议删掉一些大图片");
    }
    return false;
  }
}

function fileToLocalDataUrl(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      const isPng = file.type === "image/png";
      let dataUrl = canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.82);
      if (!isPng && dataUrl.length > 2200000) {
        dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      }
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("image-too-large"));
      reader.readAsDataURL(file);
    };
    img.src = objectUrl;
  });
}

function toast(message) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("is-visible"), 2400);
}

function scheduleSave() {
  setSync("syncing");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 450);
}

async function loadCloudState() {
  const res = await fetch(`${cloudTable()}?id=eq.personal-workbench&select=id,revision,state&limit=1`, {
    headers: cloudHeaders()
  });
  if (!res.ok) throw new Error("cloud-load-failed");
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  revision = Number(row.revision) || 0;
  Object.assign(state, row.state || {});
  return row;
}

async function cloudSaveState() {
  try {
    const check = await fetch(`${cloudTable()}?id=eq.personal-workbench&select=id,revision&limit=1`, {
      headers: cloudHeaders()
    });
    let remoteRevision = 0;
    let rowExists = false;
    if (check.ok) {
      const rows = await check.json();
      rowExists = Boolean(rows?.[0]);
      remoteRevision = Number(rows?.[0]?.revision) || 0;
    }
    if (remoteRevision > revision) {
      await loadCloudState();
      writeLocalState();
      setSync("synced");
      render();
      toast("内容已在另一台设备更新，已同步到最新");
      return;
    }
    const nextRevision = Math.max(revision, remoteRevision) + 1;
    revision = nextRevision;
    writeLocalState();
    const payload = {
      revision: nextRevision,
      state,
      updated_at: new Date().toISOString()
    };
    let res;
    if (rowExists) {
      res = await fetch(`${cloudTable()}?id=eq.personal-workbench&revision=eq.${remoteRevision}`, {
        method: "PATCH",
        headers: {
          ...cloudHeaders(true),
          Prefer: "return=representation"
        },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(cloudTable(), {
        method: "POST",
        headers: {
          ...cloudHeaders(true),
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          id: "personal-workbench",
          ...payload
        })
      });
    }
    if (!res.ok) {
      if (rowExists && res.status === 404) {
        await loadCloudState();
        writeLocalState();
        setSync("synced");
        render();
        toast("内容已在另一台设备更新，已同步到最新");
        return;
      }
      throw new Error("cloud-save-failed");
    }
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    revision = Number(row?.revision) || nextRevision;
    writeLocalState();
    setSync("synced");
  } catch (err) {
    writeLocalState();
    setSync("offline");
  }
}

async function pollCloudState() {
  const res = await fetch(`${cloudTable()}?id=eq.personal-workbench&select=id,revision,state&limit=1`, {
    headers: cloudHeaders()
  });
  if (!res.ok) throw new Error("cloud-poll-failed");
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return;
  const remoteRevision = Number(row.revision) || 0;
  if (remoteRevision > revision) {
    revision = remoteRevision;
    Object.assign(state, row.state || {});
    writeLocalState();
    setSync("synced");
    render();
    toast("已同步到最新内容");
  } else if (remoteRevision < revision) {
    scheduleSave();
  } else {
    setSync("synced");
  }
}

async function saveNow() {
  if (cloudEnabled()) {
    await cloudSaveState();
    return;
  }
  try {
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision, state })
    });
    if (res.status === 409) {
      const data = await res.json();
      revision = data.revision;
      Object.assign(state, data.state);
      setSync("synced");
      render();
      toast("内容已在另一台设备更新，已同步到最新");
      return;
    }
    const data = await res.json();
    revision = data.revision;
    setSync("synced");
  } catch (err) {
    writeLocalState();
    setSync("offline");
  }
}

async function loadState() {
  setSync("syncing");
  if (cloudEnabled()) {
    try {
      const row = await loadCloudState();
      if (row) {
        const local = readLocalState();
        const localRevision = Number(local?.revision) || 0;
        if (localRevision > Number(row.revision)) {
          revision = localRevision;
          Object.assign(state, local.state || {});
          scheduleSave();
        } else {
          revision = Number(row.revision) || 0;
          Object.assign(state, row.state || {});
          writeLocalState();
          setSync("synced");
        }
      } else {
        const local = readLocalState();
        if (local) {
          revision = Number(local.revision) || 0;
          Object.assign(state, local.state || {});
        }
        setSync("synced");
      }
      render();
    } catch (err) {
      const local = readLocalState();
      if (local) {
        revision = Number(local.revision) || 0;
        Object.assign(state, local.state || {});
      }
      setSync("offline");
      render();
    }
    return;
  }
  try {
    const res = await fetch("/api/state");
    const data = await res.json();
    revision = data.revision;
    Object.assign(state, data.state);
    writeLocalState();
    setSync("synced");
    render();
  } catch (err) {
    const local = readLocalState();
    if (local) {
      revision = Number(local.revision) || 0;
      Object.assign(state, local.state || {});
    }
    setSync("offline");
    render();
  }
}

function startPolling() {
  setInterval(async () => {
    if (document.hidden) return;
    if (cloudEnabled()) {
      try {
        await pollCloudState();
      } catch (err) {
        setSync("offline");
      }
      return;
    }
    try {
      const res = await fetch("/api/state");
      const data = await res.json();
      if (data.revision !== revision) {
        revision = data.revision;
        Object.assign(state, data.state);
        setSync("synced");
        render();
        toast("已同步到最新内容");
      }
    } catch (err) {
      setSync("offline");
    }
  }, 25000);
}

function toggleTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.done = !task.done;
  scheduleSave();
  render();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((task) => task.id !== id);
  if (editingTaskId === id) editingTaskId = null;
  scheduleSave();
  render();
}

function startEditTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  editingTaskId = id;
  render();
  $("#task-title").value = task.title;
  $("#task-date").value = task.date || todayISO();
  $("#task-priority").value = task.priority || "medium";
  $("#task-time").value = task.time || "";
  $("#task-remind").value = task.remind == null ? "none" : String(task.remind);
  $("#task-title").focus();
}

function saveTask() {
  const title = $("#task-title").value.trim();
  if (!title) return;
  const date = $("#task-date").value || todayISO();
  const priority = $("#task-priority").value;
  const time = $("#task-time").value;
  const remindRaw = $("#task-remind").value;
  const remind = time && remindRaw !== "none" ? Number(remindRaw) : null;
  const taskFields = { title, date, priority, time, remind };
  if (time && remind != null && localDateMs(date, time) <= Date.now()) {
    toast("这个时间已经过了，不会发提醒");
  }
  if (editingTaskId) {
    const task = state.tasks.find((item) => item.id === editingTaskId);
    if (task) Object.assign(task, taskFields);
  } else {
    state.tasks.unshift({
      id: uid("task"),
      ...taskFields,
      done: false,
      createdAt: new Date().toISOString()
    });
  }
  editingTaskId = null;
  scheduleSave();
  render();
}

function toggleCheck(id) {
  const check = state.checks.find((item) => item.id === id);
  if (!check) return;
  check.doneDates = check.doneDates || [];
  const index = check.doneDates.indexOf(todayISO());
  if (index >= 0) check.doneDates.splice(index, 1);
  else check.doneDates.push(todayISO());
  scheduleSave();
  render();
}

function toggleHabit(id) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  habit.history = habit.history || [];
  const index = habit.history.indexOf(todayISO());
  if (index >= 0) habit.history.splice(index, 1);
  else habit.history.push(todayISO());
  habit.streak = computeStreak(habit.history);
  scheduleSave();
  render();
}

function deleteHabit(id) {
  if (!confirm("确定删除这个习惯吗？打卡记录也会一起删除。")) return;
  state.habits = state.habits.filter((habit) => habit.id !== id);
  if (editingHabitId === id) editingHabitId = null;
  scheduleSave();
  render();
}

function saveHabit() {
  const name = $("#habit-name").value.trim();
  if (!name) return;
  const time = $("#habit-time").value;
  const remindRaw = $("#habit-remind").value;
  const remind = time && remindRaw !== "none" ? Number(remindRaw) : null;
  const habitFields = { name, icon: selectedHabitIcon, time, remind };
  if (time && remind != null && localDateMs(todayISO(), time) <= Date.now()) {
    toast("今天的提醒时间已过，明天开始提醒");
  }
  if (editingHabitId) {
    const habit = state.habits.find((item) => item.id === editingHabitId);
    if (habit) Object.assign(habit, habitFields);
    editingHabitId = null;
  } else {
    state.habits.push({
      id: uid("habit"),
      ...habitFields,
      streak: 0,
      history: []
    });
  }
  $("#habit-name").value = "";
  $("#habit-time").value = "";
  $("#habit-remind").value = "none";
  scheduleSave();
  render();
}

function startEditHabit(id) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  editingHabitId = id;
  selectedHabitIcon = habit.icon || "focus";
  render();
  $("#habit-name").value = habit.name;
  $("#habit-time").value = habit.time || "";
  $("#habit-remind").value = habit.remind == null ? "none" : String(habit.remind);
  $("#habit-name").focus();
}

function saveCourse() {
  const title = $("#course-title").value.trim();
  if (!title) return;
  const start = $("#course-start").value;
  const end = $("#course-end").value;
  if (parseTime(end) <= parseTime(start)) {
    toast("结束时间需要晚于开始时间");
    return;
  }
  const weekday = Number($("#course-weekday").value);
  const color = $("#course-color").value;
  const location = $("#course-location").value.trim();
  if (editingCourseId) {
    const item = state.schedule.find((entry) => entry.id === editingCourseId);
    if (item) {
      Object.assign(item, {
        title,
        start,
        end,
        weekday,
        color,
        location,
        teacher: item.teacher || "",
        weeks: item.weeks || ""
      });
    }
  } else {
    state.schedule.push({
      id: uid("course"),
      title,
      start,
      end,
      weekday,
      color,
      location,
      teacher: "",
      weeks: ""
    });
  }
  editingCourseId = null;
  scheduleSave();
  render();
}

function startEditCourse(id) {
  const item = state.schedule.find((entry) => entry.id === id);
  if (!item) return;
  editingCourseId = id;
  render();
  $("#course-title").value = item.title;
  $("#course-weekday").value = item.weekday;
  $("#course-start").value = item.start;
  $("#course-end").value = item.end;
  $("#course-location").value = item.location || "";
  $("#course-color").value = item.color || "cobalt";
  $("#course-title").focus();
}

function deleteCourse(id) {
  if (!confirm("确定删除这个安排吗？")) return;
  state.schedule = state.schedule.filter((item) => item.id !== id);
  if (editingCourseId === id) editingCourseId = null;
  scheduleSave();
  render();
}

async function uploadImage(file) {
  if (cloudEnabled()) {
    try {
      const extMatch = String(file.name || "").match(/\.[a-zA-Z0-9]+$/);
      const ext = (extMatch ? extMatch[0] : ".png").toLowerCase();
      const name = `w${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const res = await fetch(`${cloudConfig.url}/storage/v1/object/${cloudConfig.bucket}/${name}`, {
        method: "POST",
        headers: {
          ...cloudHeaders(),
          "Content-Type": file.type || "application/octet-stream"
        },
        body: file
      });
      if (!res.ok) throw new Error("cloud-upload-failed");
      return `${cloudConfig.url}/storage/v1/object/public/${cloudConfig.bucket}/${name}`;
    } catch (err) {
      return fileToLocalDataUrl(file);
    }
  }
  try {
    const res = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      body: file
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data.url;
  } catch (err) {
    return fileToLocalDataUrl(file);
  }
}

function saveNote() {
  const title = $("#note-title").value.trim();
  const body = $("#note-body").value.trim();
  if (!title && !body) {
    toast("写点什么再保存");
    return;
  }
  state.notes.unshift({
    id: uid("note"),
    title: title || "无标题记录",
    body,
    image: noteImageUrl,
    date: todayISO(),
    createdAt: new Date().toISOString()
  });
  noteImageUrl = "";
  $("#note-title").value = "";
  $("#note-body").value = "";
  scheduleSave();
  render();
}

function deleteNote(id) {
  if (!confirm("确定删除这条记录吗？")) return;
  state.notes = state.notes.filter((note) => note.id !== id);
  scheduleSave();
  render();
}

async function uploadAssetFiles(files) {
  const images = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
  if (!images.length) {
    toast("请选择图片文件");
    return;
  }
  setSync("syncing");
  let added = 0;
  for (const file of images) {
    try {
      const url = await uploadImage(file);
      state.assets.push({
        id: uid("asset"),
        title: file.name.replace(/\.[^.]+$/, "") || "资料图片",
        url,
        date: todayISO(),
        createdAt: new Date().toISOString()
      });
      added += 1;
    } catch (err) {
      setSync("offline");
    }
  }
  if (added) {
    scheduleSave();
    render();
    toast(`已上传 ${added} 张图片`);
  } else {
    toast("图片上传失败，请重试");
  }
}

function deleteAsset(id) {
  if (!confirm("确定删除这张图片吗？")) return;
  state.assets = state.assets.filter((asset) => asset.id !== id);
  scheduleSave();
  render();
}

function saveReview() {
  const wins = $("#review-wins").value.trim();
  const problems = $("#review-problems").value.trim();
  const next = $("#review-next").value.trim();
  if (!wins && !problems && !next) {
    toast("至少写一项再保存");
    return;
  }
  const week = isoWeekKey(new Date());
  if (editingReviewId) {
    const review = state.reviews.find((item) => item.id === editingReviewId);
    if (review) Object.assign(review, { wins, problems, next });
  } else {
    const existing = state.reviews.find((item) => item.week === week);
    if (existing) Object.assign(existing, { wins, problems, next, createdAt: new Date().toISOString() });
    else state.reviews.unshift({ id: uid("review"), week, wins, problems, next, createdAt: new Date().toISOString() });
  }
  editingReviewId = null;
  scheduleSave();
  render();
  toast("复盘已保存");
}

function startEditReview(id) {
  const review = state.reviews.find((item) => item.id === id);
  if (!review) return;
  editingReviewId = id;
  render();
  $("#review-wins").value = review.wins || "";
  $("#review-problems").value = review.problems || "";
  $("#review-next").value = review.next || "";
}

function deleteReview(id) {
  if (!confirm("确定删除这份复盘吗？")) return;
  state.reviews = state.reviews.filter((review) => review.id !== id);
  if (editingReviewId === id) editingReviewId = null;
  scheduleSave();
  render();
}

function saveSettings() {
  state.settings.name = $("#set-name").value.trim();
  state.settings.title = $("#set-title").value.trim() || "我的工作台";
  scheduleSave();
  render();
  toast("设置已保存");
}

function saveCloud() {
  const url = $("#cloud-url").value.trim().replace(/\/+$/, "");
  const key = $("#cloud-key").value.trim();
  if (!url || !key) {
    toast("请填写项目地址和密钥");
    return;
  }
  cloudConfig = { url, key, bucket: "workbench" };
  writeCloudConfig(cloudConfig);
  scheduleSave();
  render();
  toast("云端同步已开启");
}

function clearCloud() {
  if (!confirm("确定关闭云端同步吗？本机数据会保留，之后修改不再上传。")) return;
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify({ disabled: true }));
  cloudConfig = null;
  render();
  toast("已切换回本机模式");
}

function toggleDock() {
  state.settings.hideMobileNav = !state.settings.hideMobileNav;
  document.body.classList.toggle("dock-hidden", state.settings.hideMobileNav);
  const dockToggle = $("#dock-toggle");
  if (dockToggle) dockToggle.textContent = state.settings.hideMobileNav ? "展开导航" : "收起导航";
  scheduleSave();
}

function saveFocus() {
  const input = $("#focus-input");
  if (!input) return;
  state.focus = { date: todayISO(), text: input.value.trim() };
  scheduleSave();
  render();
  toast("今日专注已保存");
}

function addTodayTask() {
  const input = $("#today-task-input");
  const title = input.value.trim();
  if (!title) return;
  state.tasks.unshift({
    id: uid("task"),
    title,
    date: todayISO(),
    priority: "medium",
    time: "",
    remind: null,
    done: false,
    createdAt: new Date().toISOString()
  });
  input.value = "";
  scheduleSave();
  render();
}

async function loadDemo() {
  if (cloudEnabled()) {
    const today = todayISO();
    const checks = state.checks.length ? state.checks : [
      { id: "check-1", label: "写下今天最重要的三件事", time: "morning", doneDates: [] },
      { id: "check-2", label: "完成今日核心任务", time: "day", doneDates: [] },
      { id: "check-3", label: "睡前 5 分钟复盘", time: "evening", doneDates: [] }
    ];
    Object.assign(state, {
      settings: { ...state.settings },
      focus: { date: today, text: "完成今天的核心三件事" },
      tasks: [
        { id: uid("task"), title: "整理今日计划", done: false, date: today, priority: "high", createdAt: new Date().toISOString() },
        { id: uid("task"), title: "阅读 30 分钟", done: false, date: today, priority: "medium", createdAt: new Date().toISOString() },
        { id: uid("task"), title: "晚上复盘并写明天计划", done: false, date: today, priority: "low", createdAt: new Date().toISOString() }
      ],
      habits: [
        { id: uid("habit"), name: "喝水", icon: "water", streak: 3, history: [] },
        { id: uid("habit"), name: "阅读", icon: "book", streak: 5, history: [] },
        { id: uid("habit"), name: "早睡", icon: "sleep", streak: 2, history: [] }
      ],
      checks,
      schedule: [],
      notes: [
        {
          id: uid("note"),
          title: "示例：今天的一个小灵感",
          body: "把课表、自检和待办放在同一屏，打开工作台就能进入状态。",
          image: "",
          date: today,
          createdAt: new Date().toISOString()
        }
      ],
      assets: [],
      rooms: [],
      reviews: []
    });
    writeLocalState();
    scheduleSave();
    render();
    toast("示例数据已载入，可直接删除");
    return;
  }
  setSync("syncing");
  try {
    const res = await fetch("/api/demo", { method: "POST" });
    const data = await res.json();
    revision = data.revision;
    Object.assign(state, data.state);
    setSync("synced");
    render();
    toast("示例数据已载入，可直接删除");
  } catch (err) {
    setSync("offline");
    toast("载入示例失败");
  }
}

async function clearData() {
  if (!confirm("确定清空全部数据吗？此操作会重置任务、习惯、课表、记录和复盘。")) return;
  state.settings = { name: state.settings.name, title: state.settings.title };
  state.focus = {};
  state.tasks = [];
  state.habits = [];
  state.checks = [
    { id: "check-1", label: "写下今天最重要的三件事", time: "morning", doneDates: [] },
    { id: "check-2", label: "完成今日核心任务", time: "day", doneDates: [] },
    { id: "check-3", label: "睡前 5 分钟复盘", time: "evening", doneDates: [] }
  ];
  state.schedule = [];
  state.notes = [];
  state.assets = [];
  state.rooms = [];
  state.reviews = [];
  scheduleSave();
  render();
  toast("数据已清空");
}

function handleClick(event) {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;
  if (action === "goto-view") {
    currentView = el.dataset.view;
    render(true);
    return;
  }
  if (action === "filter-task") {
    taskFilter = el.dataset.filter;
    render();
    return;
  }
  if (action === "choose-day") {
    mobileDay = Number(el.dataset.day);
    render();
    return;
  }
  if (action === "open-import") return openImport();
  if (action === "close-import") return closeImport();
  if (action === "open-image") return openImageViewer(el.dataset.url);
  if (action === "close-image-viewer") return closeImageViewer();
  if (action === "zoom-image") return zoomImageViewer(Number(el.dataset.step));
  if (action === "reset-image-zoom") return resetImageZoom();
  if (action === "import-tab") {
    const textarea = $("#import-text");
    if (textarea) importDraft = textarea.value;
    importTab = el.dataset.tab;
    rerenderImport();
    return;
  }
  if (action === "parse-import") {
    const textarea = $("#import-text");
    const raw = importTab === "file" ? importFileText : textarea ? textarea.value : importDraft;
    pendingImport = parseImportText(raw, importTab === "csv" ? "csv" : "html");
    if (!pendingImport.length) toast("没有识别到课程，请确认复制的是课表表格或 CSV 格式");
    rerenderImport();
    return;
  }
  if (action === "confirm-import") return confirmImport();
  if (action === "set-icon") {
    selectedHabitIcon = el.dataset.icon;
    $$(".icon-pick").forEach((pick) => pick.classList.toggle("is-active", pick.dataset.icon === selectedHabitIcon));
    return;
  }
  if (action === "toggle-task") return toggleTask(id);
  if (action === "edit-task") return startEditTask(id);
  if (action === "delete-task") return deleteTask(id);
  if (action === "save-task") return saveTask();
  if (action === "toggle-check") return toggleCheck(id);
  if (action === "toggle-habit") return toggleHabit(id);
  if (action === "edit-habit") return startEditHabit(id);
  if (action === "delete-habit") return deleteHabit(id);
  if (action === "save-habit") return saveHabit();
  if (action === "save-course") return saveCourse();
  if (action === "edit-course") return startEditCourse(id);
  if (action === "delete-course") return deleteCourse(id);
  if (action === "save-note") return saveNote();
  if (action === "delete-note") return deleteNote(id);
  if (action === "choose-asset") {
    $("#asset-image").click();
    return;
  }
  if (action === "delete-asset") return deleteAsset(id);
  if (action === "save-room") return saveRoomEntry();
  if (action === "locate-room-time") return locateRoomTime();
  if (action === "toggle-room-period") {
    const key = `${el.dataset.entry}:${el.dataset.key}`;
    if (openRoomPeriods.has(key)) openRoomPeriods.delete(key);
    else openRoomPeriods.add(key);
    render();
    return;
  }
  if (action === "copy-room") {
    const room = el.dataset.room || "";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(room).then(() => toast(`已复制 ${room}`)).catch(() => toast(room));
    } else {
      toast(room);
    }
    return;
  }
  if (action === "save-review") return saveReview();
  if (action === "edit-review") return startEditReview(id);
  if (action === "delete-review") return deleteReview(id);
  if (action === "save-settings") return saveSettings();
  if (action === "save-cloud") return saveCloud();
  if (action === "clear-cloud") return clearCloud();
  if (action === "enable-notifications") return enableNotifications();
  if (action === "test-notification") return testNotification();
  if (action === "resync-notifications") {
    scheduleReminders().then(() => {
      render();
      toast("提醒已重新安排");
    });
    return;
  }
  if (action === "toggle-dock") return toggleDock();
  if (action === "save-focus") return saveFocus();
  if (action === "load-demo") return loadDemo();
  if (action === "clear-data") return clearData();
  if (action === "cancel-edit") {
    editingTaskId = null;
    editingHabitId = null;
    editingCourseId = null;
    editingReviewId = null;
    render();
    return;
  }
  if (action === "choose-file") {
    $("#note-image").click();
    return;
  }
  if (action === "clear-image") {
    noteImageUrl = "";
    render();
    return;
  }
}

document.addEventListener("click", handleClick);

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (form.id === "today-task-form") {
    event.preventDefault();
    addTodayTask();
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.id === "import-file") {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      importFileText = String(reader.result || "");
      importFileName = file.name;
      pendingImport = parseImportText(
        importFileText,
        file.name.toLowerCase().endsWith(".csv") ? "csv" : "html"
      );
      rerenderImport();
      if (!pendingImport.length) toast("没有识别到课程，请换一个文件");
    };
    reader.readAsText(file);
    return;
  }
  if (event.target.id === "current-week") {
    state.settings.currentWeek = event.target.value ? Number(event.target.value) : 0;
    scheduleSave();
    render();
    return;
  }
  if (event.target.id === "asset-image") {
    uploadAssetFiles(event.target.files);
    event.target.value = "";
    return;
  }
  if (event.target.id !== "note-image") return;
  const file = event.target.files[0];
  if (!file) return;
  setSync("syncing");
  try {
    noteImageUrl = await uploadImage(file);
    const preview = $("#note-image-preview");
    preview.src = noteImageUrl;
    preview.classList.add("is-visible");
    setSync("synced");
    toast("图片已上传");
  } catch (err) {
    setSync("offline");
    toast("图片上传失败，请换一张试试");
  }
});

$$(".nav-btn, .dock-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentView = btn.dataset.view;
    render(true);
  });
});

function dismissLaunchCover() {
  const cover = $("#launch-cover");
  if (!cover || cover.classList.contains("is-leaving")) return;
  cover.classList.add("is-leaving");
  cover.setAttribute("aria-hidden", "true");
  document.body.classList.remove("cover-open");
}

function initLaunchCover() {
  const cover = $("#launch-cover");
  if (!cover) return;
  document.body.classList.add("cover-open");
  const title = $("#cover-title");
  if (title) title.textContent = state.settings.title || "我的工作台";
  const date = $("#cover-date");
  if (date) {
    date.textContent = new Date().toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long"
    });
  }
  const enter = $("#cover-enter");
  if (enter) enter.addEventListener("click", dismissLaunchCover);
  window.setTimeout(dismissLaunchCover, 1800);
}

function scheduleDayRefresh() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  window.setTimeout(() => {
    render();
    scheduleDayRefresh();
  }, Math.max(1000, next.getTime() - now.getTime()));
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

initLaunchCover();
scheduleDayRefresh();
loadState();
startPolling();
refreshNotificationPermission();
