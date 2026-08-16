const state = {
  settings: { name: "", title: "我的工作台", hideMobileNav: true, dailyPushEnabled: false, dailyPushTime: "08:00", currentScheduleSet: "", semesterStart: "", currentWeekAuto: true },
  focus: {},
  tasks: [],
  habits: [],
  checks: [],
  schedule: [],
  notes: [],
  assets: [],
  rooms: [],
  reviews: [],
  anniversaries: []
};

const LOCAL_STATE_KEY = "personal-workbench-local-v1";
const LOCAL_STATE_MIGRATED_KEY = "workbench-local-state-migrated-v1";
const CLOUD_CONFIG_KEY = "personal-workbench-cloud-v1";
const AI_CONFIG_KEY = "workbench-ai-config-v1";
const AUTH_STORAGE_KEY = "workbench-auth-v1";
const ADMIN_KEY_STORAGE_KEY = "workbench-admin-key-v1";
const USERNAME_EMAIL_MAP_KEY = "workbench-username-email-map-v1";
const NAV_DEFAULT_KEY = "workbench-nav-default-v1";
const DEFAULT_CLOUD_CONFIG = {
  url: "https://lqkdatdtgoxztawmtigj.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxa2RhdGR0Z294enRhd210aWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0OTM1NjIsImV4cCI6MjEwMjA2OTU2Mn0.-oSyoXCTkry5dJ5XyYrQwHk2LowPU5YAbbg-xESR3MY",
  bucket: "workbench"
};

let revision = 0;
let currentView = "today";
let taskFilter = "today";
let scheduleSemester = "";
let mobileDay = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
let editingTaskId = null;
let editingHabitId = null;
let editingCourseId = null;
let editingReviewId = null;
let editingAnniversaryId = null;
let selectedHabitIcon = "water";
let noteImageUrl = "";
let anniversaryImageUrl = "";
let pendingImport = [];
let importTab = "html";
let importDraft = "";
let importFileText = "";
let importFileName = "";
let importSetName = "";
let openRoomPeriods = new Set();
let roomAutoDone = false;
let roomFilterStart = 1;
let roomFilterEnd = 12;
let roomFilterDate = "";
let syncStatus = "connecting";
let saveTimer = null;
let lastLocalStorageWarning = 0;
let cloudConfig = readCloudConfig();
let aiConfig = readAIConfig();
let authSession = readAuthSession();
let currentSpaceId = authSession?.user?.id || "personal-workbench";
let adminKey = localStorage.getItem(ADMIN_KEY_STORAGE_KEY) || "";
let notificationEnabled = localStorage.getItem("workbench-notification-enabled") === "1";
let webReminderWatchTimer = null;
let webReminderQueue = [];
let reminderStatusText = "等待安排";
let updateStatusText = "未检查";
const REMINDER_TAG = "workbench-reminder";
const APP_VERSION = "1.8.0";
const GITHUB_REPO = "wu666640/workbench";
const AUTH_HELPER_URL = "https://6a7d87c0c1ab2018e4bf2f56--timely-raindrop-c922c1.netlify.app/.netlify/functions/auth-admin";
const UPDATE_MANIFEST_URL = "https://wu666640.github.io/workbench/latest.json";
let pendingRoomScreenshot = null;

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

const HIT_SAMPLE_CSV = [
  "课程名称,星期,开始节数,结束节数,老师,地点,周数",
  "微积分D（2）,一,1,2,史晓冉,B51,2-15",
  "习近平新时代中国特色社会主义思想概论,一,5,6,刘文超,B51,3-12",
  "生命科学基础,二,5,6,张凤伟,B41,\"10-12,13\"",
  "实用形象礼仪,日,9,10,谢琦,B107,\"7单,8,10,11\""
].join("\n");

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
  if (state.settings.dailyPushEnabled && state.settings.dailyPushTime) {
    for (let day = 0; day < 7; day += 1) {
      const cursor = new Date();
      cursor.setDate(cursor.getDate() + day);
      const dateISO = isoFor(cursor);
      const at = localDateMs(dateISO, state.settings.dailyPushTime);
      if (at > now) {
        const quote = dailyQuote(dateISO);
        items.push({
          id: `daily-${dateISO}`,
          title: "每日一句",
          body: `${quote.zh} ${quote.en}`,
          at
        });
      }
    }
  }
  for (const anniversary of state.anniversaries) {
    if (anniversary.remindEnabled === false || !anniversary.date) continue;
    for (let day = 0; day < 7; day += 1) {
      const cursor = new Date();
      cursor.setDate(cursor.getDate() + day);
      const dateISO = isoFor(cursor);
      const label = anniversaryLabelOn(anniversary, cursor);
      if (!label) continue;
      const at = localDateMs(dateISO, anniversary.remindTime || "08:00");
      if (at > now) {
        items.push({
          id: `anniv-${anniversary.id}-${dateISO}`,
          title: `纪念日 · ${anniversary.name}`,
          body: label,
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

function refreshUpdateStatus() {
  const status = $("#update-status");
  if (status) status.textContent = updateStatusText;
}

function versionParts(value) {
  return String(value || "")
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number(part) || 0);
}

function isNewerVersion(latest, current) {
  const left = versionParts(latest);
  const right = versionParts(current);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] || 0;
    const b = right[index] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function fetchUpdateManifest(url) {
  const httpPlugin = window.Capacitor?.Plugins?.CapacitorHttp;
  if (httpPlugin) {
    const nativeRes = await httpPlugin.request({
      url,
      method: "GET",
      responseType: "json",
      connectTimeout: 15000,
      readTimeout: 30000
    });
    if (nativeRes.status !== 200) throw new Error("check-failed");
    return typeof nativeRes.data === "string" ? JSON.parse(nativeRes.data) : nativeRes.data;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("check-failed");
  return res.json();
}

async function checkForUpdate() {
  updateStatusText = "正在检查更新…";
  refreshUpdateStatus();
  try {
    let release = null;
    try {
      release = await fetchUpdateManifest(UPDATE_MANIFEST_URL);
    } catch (err) {
      release = null;
    }
    if (!release || !release.version) {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json" }
      });
      if (!res.ok) throw new Error("check-failed");
      release = await res.json();
    }
    const tag = String(release.version || release.tag_name || "").replace(/^v/i, "");
    const asset = release.apkUrl || (release.assets || []).find((item) => /workbench-android-.*\.apk/i.test(item.name || ""))?.browser_download_url || "";
    const downloadUrl = asset || release.html_url || "";
    const announcement = String(release.announcement || release.body || "").trim();
    if (!isNewerVersion(tag, APP_VERSION)) {
      updateStatusText = "已是最新版本";
      refreshUpdateStatus();
      toast("已是最新版本");
      return;
    }
    updateStatusText = `发现新版本 ${tag}`;
    refreshUpdateStatus();
    const prompt = `发现新版本 ${tag}，是否现在下载安装？${announcement ? `\n\n更新公告：\n${announcement}` : ""}`;
    if (!confirm(prompt)) {
      updateStatusText = `发现新版本 ${tag}，未下载`;
      refreshUpdateStatus();
      return;
    }
    const native = isNativeApp() && window.Capacitor?.Plugins?.Filesystem && window.Capacitor?.Plugins?.FileOpener;
    if (!native) {
      window.open(downloadUrl, "_blank");
      updateStatusText = "请在浏览器中下载安装";
      refreshUpdateStatus();
      return;
    }
    updateStatusText = `正在下载 ${tag}…`;
    refreshUpdateStatus();
    const fileName = `workbench-update-${tag}.apk`;
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    let apkBase64 = "";
    const httpPlugin = window.Capacitor?.Plugins?.CapacitorHttp;
    if (httpPlugin) {
      const nativeRes = await httpPlugin.request({
        url: downloadUrl,
        method: "GET",
        responseType: "arraybuffer",
        connectTimeout: 30000,
        readTimeout: 120000
      });
      if (nativeRes.status !== 200 || !nativeRes.data) throw new Error("download-failed");
      apkBase64 = nativeRes.data;
    } else {
      const apkResponse = await fetch(downloadUrl);
      if (!apkResponse.ok) throw new Error("download-failed");
      apkBase64 = arrayBufferToBase64(await apkResponse.arrayBuffer());
    }
    const writeResult = await Filesystem.writeFile({
      path: fileName,
      data: apkBase64,
      directory: "CACHE"
    });
    const filePath = writeResult?.uri || (await Filesystem.getUri({ path: fileName, directory: "CACHE" })).uri;
    updateStatusText = "已下载，正在打开安装…";
    refreshUpdateStatus();
    await window.Capacitor.Plugins.FileOpener.open({
      filePath,
      contentType: "application/vnd.android.package-archive"
    });
    updateStatusText = "已开始安装";
    refreshUpdateStatus();
    toast("已开始安装");
  } catch (err) {
    updateStatusText = "检查更新失败";
    refreshUpdateStatus();
    toast("检查更新失败，请重试");
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
    .filter((item) => Number(item.weekday) === day && scheduleVisible(item) && scheduleInSemester(item))
    .sort((a, b) => parseTime(a.start) - parseTime(b.start));
}

function scheduleSemesterList() {
  const semesters = new Set();
  for (const item of state.schedule) {
    if (item.semester) semesters.add(item.semester);
  }
  return Array.from(semesters).sort((a, b) => String(b).localeCompare(String(a), "zh-CN"));
}

function setScheduleSet(name) {
  scheduleSemester = name || "";
  state.settings.currentScheduleSet = scheduleSemester;
}

function semesterOptions() {
  const options = scheduleSemesterList()
    .map((semester) => `<option value="${esc(semester)}" ${scheduleSemester === semester ? "selected" : ""}>${esc(semester)}</option>`)
    .join("");
  return `<option value="">全部课表</option>${options}`;
}

function scheduleInSemester(item) {
  return !scheduleSemester || item.semester === scheduleSemester;
}

function scheduleSetCourses() {
  return state.schedule.filter((item) => scheduleInSemester(item));
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

function autoCurrentWeek() {
  const start = String(state.settings.semesterStart || "").trim();
  if (!start) return 0;
  const startDate = new Date(`${start}T00:00:00`);
  if (Number.isNaN(startDate.getTime())) return 0;
  const today = new Date(`${todayISO()}T00:00:00`);
  const diffDays = Math.round((today.getTime() - startDate.getTime()) / 86400000);
  if (diffDays < 0) return 1;
  return Math.floor(diffDays / 7) + 1;
}

function currentWeekNumber() {
  if (state.settings.currentWeekAuto !== false && state.settings.semesterStart) {
    const auto = autoCurrentWeek();
    if (auto) return auto;
  }
  const week = Number(state.settings.currentWeek);
  return Number.isInteger(week) && week >= 1 ? week : 0;
}

function autoWeekLabel() {
  if (!state.settings.semesterStart) return "自动（未设置开学日期）";
  const auto = autoCurrentWeek();
  return auto ? `自动（第 ${auto} 周）` : "自动";
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
  return /(?:楼|馆|教室|实验室|操场|体育场|体育馆|图书馆|文体中心|中心|校区)[A-Za-z0-9]|^[A-Za-z]?\d{2,}|线上|腾讯会议|钉钉|zoom/i.test(text);
}

function extractLocation(value) {
  const text = String(value || "").trim();
  const building = text.match(/([A-Za-z\u4e00-\u9fa5]*?(?:教学楼|实验楼|综合楼|外语楼|宿舍楼|楼|馆|教室|实验室|图书馆|体育馆|体育场|操场|文体中心|中心|校区)\s*[A-Za-z]?\d{0,4})/);
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
    const labelRange = periodRangeFromLabel(periodLabel);
    if (labelRange) ranges = [labelRange];
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
  if (periodRanges(text, true).length === 0 && !periodRangeFromLabel(periodLabel)) return [];
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
        const periodLabelCell =
          !periodRangeFromLabel(periodLabel) && map[1] && periodRangeFromLabel(map[1].textContent)
            ? map[1].textContent
            : periodLabel;
        if (cell) {
          const effectiveLabel = expandPeriodLabelForRowSpan(periodLabelCell, cell.rowSpan);
          courses.push(...parseCourseCell(cell.innerHTML, header.weekday, effectiveLabel, periodTable));
        }
      }
    }
    return dedupeCourses(courses);
  }

  // Fallback: first column is a time/period label, remaining columns are Mon-Sun.
  if (rows[0] && Array.from(rows[0].cells).length >= 7) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const cells = Array.from(rows[rowIndex].cells);
      const periodLabel = cells[0] ? cleanCellText(cells[0].innerHTML) : "";
        const periodLabelCell =
          !periodRangeFromLabel(periodLabel) && cells[1] && periodRangeFromLabel(cells[1].textContent)
            ? cleanCellText(cells[1].innerHTML)
            : periodLabel;
      for (let index = 1; index <= 7; index += 1) {
        const cell = cells[index];
        if (cell) {
          const effectiveLabel = expandPeriodLabelForRowSpan(periodLabelCell, cell.rowSpan);
          courses.push(...parseCourseCell(cell.innerHTML, index - 1, effectiveLabel, periodTable));
        }
      }
    }
  }
  return dedupeCourses(courses);
}

function detectSemesterFromRows(rows, fileName) {
  for (const row of rows) {
    for (const cell of row) {
      const text = cleanCellText(cell);
      const yearSeason = text.match(/(20\d{2})\s*[-—–~]\s*(20\d{2})\s*学年\s*(春季|夏季|秋季|冬季)/);
      if (yearSeason) return `${yearSeason[1]}-${yearSeason[2]}学年${yearSeason[3]}`;
      const matched = text.match(/(20\d{2})\s*(春季|夏季|秋季|冬季)?\s*学期/);
      if (matched) return `${matched[1]}${matched[2] || ""}学期`;
    }
  }
  const fileMatch = String(fileName || "").match(/(20\d{2}).*?(春季|夏季|秋季|冬季)?\s*学期/);
  if (fileMatch) return `${fileMatch[1]}${fileMatch[2] || ""}学期`;
  return "未命名学期";
}

function parseHitCourseV2(cellText, weekday, startPeriod, endPeriod) {
  const text = cleanCellText(cellText);
  if (!text || text === "&nbsp;") return [];
  const tokens = text.split(/\s+/).filter(Boolean);
  const blocks = [];
  let current = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1] || "";
    if (current.length && next.includes("[") && !token.includes("[")) {
      blocks.push(current);
      current = [token];
    } else {
      current.push(token);
    }
  }
  if (current.length) blocks.push(current);

  const courses = [];
  for (const block of blocks) {
    const title = block[0];
    if (!title) continue;
    const content = block.slice(1).join(" ");
    const weekMatches = Array.from(content.matchAll(/\[([^\]]+)\](单|双)?周?/g));
    const weeks = weekMatches.map((match) => `${normalizeWeeks(match[1])}${match[2] || ""}`).join(",");
    const teacherMatches = Array.from(content.matchAll(/([\u4e00-\u9fa5·A-Za-z]{1,16})(?=\[)/g));
    const teacher = Array.from(new Set(teacherMatches.map((match) => match[1]))).join("，");
    const withoutBrackets = content.replace(/\[[^\]]+\](单|双)?周?/g, " ");
    const locations = [];
    for (const chunk of withoutBrackets.split(/[，,;；]+/)) {
      const location = extractLocation(chunk);
      if (location && !locations.includes(location)) locations.push(location);
    }
    const times = periodRangeTimes(startPeriod, endPeriod);
    courses.push({
      title,
      weekday,
      start: times.start,
      end: times.end,
      startPeriod,
      endPeriod,
      location: locations.join("、"),
      teacher,
      weeks,
      color: courseColor(title)
    });
  }
  return dedupeCourses(courses);
}

function parseNeuqCourseLine(line, weekday, startPeriod, endPeriod) {
  const matched = String(line || "").trim().match(
    /^(.+?)\s+\((\d{10,}\.\d{2})\)\s*\(([^()]*)\)\s*\(([\s\S]*)\)$/
  );
  if (!matched) return null;
  const tail = String(matched[4] || "").trim();
  const times = periodRangeTimes(startPeriod, endPeriod);
  return {
    title: matched[1].trim(),
    weekday,
    start: times.start,
    end: times.end,
    startPeriod,
    endPeriod,
    location: extractLocation(tail),
    teacher: String(matched[3] || "").trim(),
    weeks: normalizeWeeks(String(tail).split(/\s+/)[0] || ""),
    color: courseColor(matched[1].trim())
  };
}

function parseHitCourseCell(cellText, weekday, startPeriod, endPeriod) {
  const text = cleanCellText(cellText).replace(/\)\)(?=[\u4e00-\u9fa5A-Za-z])/g, "))\n");
  if (!text || text === "&nbsp;") return [];
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const structured = [];
  for (const line of lines) {
    const course = parseNeuqCourseLine(line, weekday, startPeriod, endPeriod);
    if (course) structured.push(course);
  }
  if (structured.length) return structured;
  const rawCourses = [];
  let current = null;
  for (const line of lines) {
    const hasWeeks = /\[[^\]]+\]\s*(单|双)?周/.test(line);
    const location = extractLocation(line);
    const isLocationLine = Boolean(location) && (looksLikeLocation(line) || location === line.trim());
    if (!current || (!hasWeeks && !isLocationLine)) {
      if (current) rawCourses.push(current);
      current = { title: line.replace(/\s+/g, " ").trim(), content: line };
    } else {
      current.content += "\n" + line;
    }
  }
  if (current) rawCourses.push(current);
  const results = [];
  for (const raw of rawCourses) {
    const title = raw.title;
    if (!title) continue;
    const weekMatches = Array.from(raw.content.matchAll(/\[([^\]]+)\]\s*(单|双)?周/g));
    const weeks = weekMatches
      .map((match) => `${String(match[1] || "").replace(/[，、]/g, ",").trim()}${match[2] || ""}`)
      .join(",");
    const withoutWeeks = raw.content.replace(/\[[^\]]+\]\s*(单|双)?周/g, " ");
    const location = extractLocation(withoutWeeks);
    const teacherParts = [];
    for (const line of raw.content.split("\n").slice(1)) {
      let cleaned = line.replace(/\[[^\]]+\]\s*(单|双)?周/g, " ");
      if (location) cleaned = cleaned.replace(location, " ");
      cleaned = cleaned.replace(/[，,]/g, "，").trim();
      if (!cleaned) continue;
      for (const part of cleaned.split("，")) {
        const name = part.trim().match(/^([\u4e00-\u9fa5·A-Za-z]{1,16})/);
        if (name && !teacherParts.includes(name[1])) teacherParts.push(name[1]);
      }
    }
    const times = periodRangeTimes(startPeriod, endPeriod);
    const course = {
      title,
      weekday,
      start: times.start,
      end: times.end,
      startPeriod,
      endPeriod,
      location,
      teacher: teacherParts.join("，"),
      weeks,
      color: courseColor(title)
    };
    const existing = results.find(
      (item) =>
        item.title === course.title &&
        item.location === course.location &&
        item.teacher === course.teacher &&
        item.start === course.start &&
        item.end === course.end
    );
    if (existing) {
      const combined = new Set([...existing.weeks.split(","), ...course.weeks.split(",")].filter(Boolean));
      existing.weeks = Array.from(combined).join(",");
    } else {
      results.push(course);
    }
  }
  return results;
}

function periodRangeFromLabel(label) {
  const text = String(label || "").replace(/\s+/g, "");
  let matched = text.match(/第(\d{1,2})[,，](\d{1,2})节/);
  if (matched) return [Number(matched[1]), Number(matched[2])];
  matched = text.match(/第(\d{1,2})[-—–~～至](\d{1,2})节/);
  if (matched) return [Number(matched[1]), Number(matched[2])];
  matched = text.match(/第([一二三四五六七八九十\d]+)节/);
  if (matched) {
    const number = chineseNumberToInt(matched[1]);
    if (number) return [number, number];
  }
  return null;
}

function expandPeriodLabelForRowSpan(label, rowSpan) {
  const span = Number(rowSpan) || 1;
  if (span <= 1) return label;
  const range = periodRangeFromLabel(label);
  if (!range) return label;
  const end = range[0] + span - 1;
  return end > range[1] ? `第${range[0]}-${end}节` : label;
}

function findWeekdayHeaderRow(rows) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const found = {};
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      const weekday = weekdayFromText(row[colIndex]);
      if (weekday >= 0) found[weekday] = colIndex;
    }
    if (Object.keys(found).length >= 7) return { rowIndex, cols: found };
  }
  return null;
}

function parseGridXlsRows(rows, merges, fileName, sheetName, school) {
  const semester = detectSemesterFromRows(rows, fileName) || detectSemesterFromRows(rows, sheetName) || "未命名学期";
  const header = findWeekdayHeaderRow(rows);
  if (!header) return { semester, courses: [] };
  const hasNeuqCode = rows.some((row) =>
    (row || []).some((cell) => /\(\d{10,}\.\d{2}\)/.test(cleanCellText(cell)))
  );
  const useHit = school === "hit" || (school !== "neuq" && !hasNeuqCode);
  const courses = [];
  for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const label = `${cleanCellText(row[0] || "")} ${cleanCellText(row[1] || "")}`;
    const range = periodRangeFromLabel(label);
    if (!range) continue;
    const [startPeriod, labelEnd] = range;
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const colIndex = header.cols[weekday];
      if (colIndex == null) continue;
      const cell = cleanCellText(row[colIndex]);
      if (!cell || cell === "&nbsp;") continue;
      let endPeriod = labelEnd;
      const merge = (merges || []).find((item) => item.s.r === rowIndex && item.s.c === colIndex);
      if (merge) endPeriod = startPeriod + (merge.e.r - merge.s.r);
      const parsed = useHit
        ? parseHitCourseV2(cell, weekday, startPeriod, endPeriod)
        : parseHitCourseCell(cell, weekday, startPeriod, endPeriod);
      for (const course of parsed) {
        course.semester = semester;
        courses.push(course);
      }
    }
  }
  return { semester, courses: dedupeCourses(courses) };
}

function parseXlsSchedule(buffer, fileName) {
  if (typeof XLSX === "undefined") {
    return { semester: "", courses: [], error: "缺少表格解析组件" };
  }
  const workbook = XLSX.read(buffer, { type: "array" });
  const school = state.settings.scheduleSchool || "";
  let best = null;
  let semester = "";
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const parsed = parseGridXlsRows(rows, sheet["!merges"] || [], fileName, sheetName, school);
    if (!semester) {
      const found = detectSemesterFromRows(rows, fileName) || detectSemesterFromRows(rows, sheetName);
      if (found) semester = found;
    }
    if (!parsed.courses.length) continue;
    if (!best || parsed.courses.length > best.courses.length) best = parsed;
  }
  if (best && (!best.semester || best.semester === "未命名学期")) {
    best.semester = semester || "未命名学期";
  }
  return best || { semester: semester || "未命名学期", courses: [] };
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

function scheduleSchoolLabel(school) {
  return school === "hit" ? "哈尔滨工业大学" : "东北大学秦皇岛分校";
}

function setScheduleSchool(school) {
  state.settings.scheduleSchool = school === "hit" ? "hit" : "neuq";
  scheduleSave();
  rerenderImport();
  toast(`已切换为${scheduleSchoolLabel(state.settings.scheduleSchool)}`);
}

function loadHitSample() {
  importTab = "csv";
  importDraft = HIT_SAMPLE_CSV;
  importFileText = "";
  importFileName = "";
  pendingImport = parseImportText(importDraft, "csv");
  rerenderImport();
  toast("已载入哈工大样例");
}

function renderImportModal() {
  const school = state.settings.scheduleSchool || "neuq";
  const preview = pendingImport.length
    ? `<div class="import-summary">
        <strong>解析到 ${pendingImport.length} 条课程${pendingImport[0]?.semester ? `（${esc(pendingImport[0].semester)}）` : ""}</strong>
        <span>会保存为独立一套课表，不覆盖现有课表</span>
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
                  <small>${WEEKDAYS[course.weekday]} · ${esc(course.start)}–${esc(course.end)}${course.semester ? " · " + esc(course.semester) : ""}${course.location ? " · " + esc(course.location) : ""}${course.teacher ? " · " + esc(course.teacher) : ""}${course.weeks ? " · " + esc(course.weeks) + "周" : ""}</small>
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
        <strong>${scheduleSchoolLabel(school)}</strong>
        <span>${school === "hit" ? "教务系统 · 本科教学" : "教务系统 · EAMS"}</span>
      </div>
      <div class="school-switch">
        <button class="school-option ${school !== "hit" ? "is-active" : ""}" data-action="set-school" data-school="neuq">东北大学秦皇岛分校</button>
        <button class="school-option ${school === "hit" ? "is-active" : ""}" data-action="set-school" data-school="hit">哈尔滨工业大学</button>
      </div>
      <div class="school-actions">
        ${school === "hit"
          ? `<button class="btn" data-action="load-hit-sample">${icon("refresh")}哈工大样例</button>`
          : `<a class="btn" href="https://eone.neuq.edu.cn" target="_blank" rel="noopener">${icon("link")}打开一网通办课表</a>`}
      </div>
    </div>
    ${school === "neuq" ? `<p class="import-hint">先登录一网通办，进入“教务管理系统/教学服务”里的课表页，用浏览器“另存为 HTML”保存，再上传这个文件；也可以直接上传学校导出的 xls 课表。</p>` : ""}

    <div class="import-set-row">
      <label class="field-label">保存为课表
        <input id="import-set-name" value="${esc(importSetName)}" placeholder="例如：2026春季学期" autocomplete="off">
      </label>
      <span class="panel-meta">没识别出年份学期就自己命名，新课表会是空白的一套</span>
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
  importSetName = "";
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
  const setNameInput = $("#import-set-name");
  if (setNameInput) importSetName = setNameInput.value.trim();
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
  const setName = $("#import-set-name")?.value.trim() || pendingImport[0]?.semester || "未命名课表";
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
      semester: setName,
      location: course.location || "",
      teacher: course.teacher || "",
      weeks: course.weeks || "",
      color: course.color || "cobalt"
    });
    added += 1;
  }
  setScheduleSet(setName);
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

const DAILY_QUOTE_KEY = "workbench-daily-quote-v1";
const DAILY_NEWS_KEY = "workbench-daily-news-v1";
const DAILY_NEWS_URL = "https://60s.viki.moe/v2/60s";
const DAILY_QUOTES = [
  { zh: "博观而约取，厚积而薄发。", en: "Learn widely, choose what matters, and let deep accumulation find its moment.", author: "苏轼", source: "苏轼《稼说送张琥》" },
  { zh: "知者不惑，仁者不忧，勇者不惧。", en: "The wise are free from doubt, the humane from anxiety, the brave from fear.", author: "孔子", source: "《论语·子罕》" },
  { zh: "路漫漫其修远兮，吾将上下而求索。", en: "The road ahead is long and far; I will search high and low.", author: "屈原", source: "屈原《离骚》" },
  { zh: "纸上得来终觉浅，绝知此事要躬行。", en: "What you get from books is shallow; real understanding demands practice.", author: "陆游", source: "陆游《冬夜读书示子聿》" },
  { zh: "海内存知己，天涯若比邻。", en: "A true friend stays close even when the world separates you.", author: "王勃", source: "王勃《送杜少府之任蜀州》" },
  { zh: "千淘万漉虽辛苦，吹尽狂沙始到金。", en: "After endless washing, only gold remains among the sand.", author: "刘禹锡", source: "刘禹锡《浪淘沙》" },
  { zh: "读书破万卷，下笔如有神。", en: "Read ten thousand volumes, and your writing will flow as if inspired.", author: "杜甫", source: "杜甫《奉赠韦左丞丈二十二韵》" },
  { zh: "勿以恶小而为之，勿以善小而不为。", en: "Do not do evil because it is small; do not leave good undone because it is small.", author: "刘备", source: "《三国志·蜀书·先主传》" },
  { zh: "锲而不舍，金石可镂。", en: "With relentless effort, even metal and stone can be carved.", author: "荀子", source: "《荀子·劝学》" },
  { zh: "会当凌绝顶，一览众山小。", en: "Climb to the summit, and all other mountains grow small.", author: "杜甫", source: "杜甫《望岳》" },
  { zh: "非淡泊无以明志，非宁静无以致远。", en: "Without calm detachment, ambition blurs; without quiet, vision cannot reach far.", author: "诸葛亮", source: "诸葛亮《诫子书》" },
  { zh: "宝剑锋从磨砺出，梅花香自苦寒来。", en: "A sharp blade comes from grinding; plum blossom fragrance comes from bitter cold.", author: "古语", source: "《警世贤文》" },
  { zh: "天生我材必有用。", en: "Heaven gave me talents; they will find their use.", author: "李白", source: "李白《将进酒》" },
  { zh: "苟日新，日日新，又日新。", en: "If you can renew yourself one day, renew yourself anew each day.", author: "曾子", source: "《礼记·大学》" },
  { zh: "山重水复疑无路，柳暗花明又一村。", en: "Hills and rivers may seem to block the way, yet a bright village lies beyond the willows.", author: "陆游", source: "陆游《游山西村》" },
  { zh: "少年易老学难成，一寸光阴不可轻。", en: "Youth fades quickly and learning takes time; do not treat an inch of time lightly.", author: "朱熹", source: "朱熹《偶成》" },
  { zh: "The only way to do great work is to love what you do.", en: "唯一做出伟大工作的方式，是热爱你所做的事。", author: "Steve Jobs", source: "Steve Jobs 2005 年斯坦福毕业演讲" },
  { zh: "Success is not final, failure is not fatal: it is the courage to continue that counts.", en: "成功不是终点，失败也非末日，重要的是继续前行的勇气。", author: "Winston Churchill", source: "温斯顿·丘吉尔 1941 年演讲" },
  { zh: "The future belongs to those who believe in the beauty of their dreams.", en: "未来属于相信梦想之美的人。", author: "Eleanor Roosevelt", source: "埃莉诺·罗斯福" },
  { zh: "It always seems impossible until it is done.", en: "在完成之前，一切看起来都像不可能。", author: "Nelson Mandela", source: "纳尔逊·曼德拉" },
  { zh: "Do not go where the path may lead; go instead where there is no path and leave a trail.", en: "不要走现成的路，去无路之处留下足迹。", author: "Ralph Waldo Emerson", source: "拉尔夫·爱默生" },
  { zh: "A journey of a thousand miles begins with a single step.", en: "千里之行，始于足下。", author: "老子", source: "《道德经·第六十四章》" },
  { zh: "The best time to plant a tree was 20 years ago. The second best time is now.", en: "种树最好的时间是二十年前，其次是现在。", author: "谚语", source: "英文谚语" },
  { zh: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", en: "我们就是反复所做之事。卓越不是一次行动，而是一种习惯。", author: "Aristotle", source: "亚里士多德" },
  { zh: "The secret of getting ahead is getting started.", en: "领先的秘诀是开始。", author: "Mark Twain", source: "马克·吐温" },
  { zh: "Small deeds done are better than great deeds planned.", en: "做成的小事，胜过计划中的大事。", author: "谚语", source: "英文谚语" },
  { zh: "Don't count the days, make the days count.", en: "别数日子，让日子有意义。", author: "Muhammad Ali", source: "穆罕默德·阿里" },
  { zh: "Whether you think you can or you think you can't, you're right.", en: "你认为自己行或不行，你都是对的。", author: "Henry Ford", source: "亨利·福特" },
  { zh: "The harder I work, the luckier I get.", en: "我越努力，运气越好。", author: "Gary Player", source: "加里·普莱尔" },
  { zh: "Well begun is half done.", en: "好的开始是成功的一半。", author: "谚语", source: "英文谚语" },
  { zh: "The only limit to our realization of tomorrow will be our doubts of today.", en: "实现明日目标的唯一限制，是我们今日的怀疑。", author: "Franklin D. Roosevelt", source: "富兰克林·罗斯福" },
  { zh: "It is during our darkest moments that we must focus to see the light.", en: "越在黑暗时刻，越要专注寻找光。", author: "Aristotle", source: "亚里士多德" },
  { zh: "Stay hungry, stay foolish.", en: "求知若饥，虚心若愚。", author: "Steve Jobs", source: "Steve Jobs 2005 年斯坦福毕业演讲" },
  { zh: "Every day is a new beginning. Take a deep breath and start again.", en: "每一天都是新的开始，深呼吸，重新出发。", author: "佚名", source: "佚名" },
  { zh: "The best way to predict the future is to create it.", en: "预测未来的最好方式，就是亲手创造它。", author: "Peter Drucker", source: "彼得·德鲁克" },
  { zh: "Nothing great was ever achieved without enthusiasm.", en: "没有热情，成就不了任何伟大的事。", author: "Ralph Waldo Emerson", source: "拉尔夫·爱默生" }
];

const FESTIVAL_QUOTES = {
  "元旦节": { zh: "新的一年，愿你步履不停，也常有欢喜。", en: "A new year, steady steps and everyday joy.", source: "元旦祝福" },
  "春节": { zh: "岁岁常欢愉，年年皆胜意。", en: "May every year bring joy and everything go your way.", source: "春节祝福" },
  "元宵节": { zh: "灯火可亲，团团圆圆。", en: "Warm lights and a round reunion.", source: "元宵节祝福" },
  "清明节": { zh: "慎终追远，也珍惜眼前春光。", en: "Honor the past, and treasure the spring before you.", source: "清明节寄语" },
  "劳动节": { zh: "每一份认真都值得被看见。", en: "Every sincere effort deserves to be seen.", source: "劳动节祝福" },
  "端午节": { zh: "愿你乘风破浪，也安康顺遂。", en: "May you ride the waves and stay safe and well.", source: "端午节祝福" },
  "七夕节": { zh: "所爱隔山海，山海皆可平。", en: "Love crosses mountains and seas.", source: "七夕祝福" },
  "中秋节": { zh: "但愿人长久，千里共婵娟。", en: "May we live long and share the moon across a thousand miles.", source: "苏轼《水调歌头》" },
  "重阳节": { zh: "登高望远，岁岁安康。", en: "Climb high, see far, and stay well every year.", source: "重阳节祝福" },
  "国庆节": { zh: "山河锦绣，国泰民安。", en: "May the land be beautiful and the people live in peace.", source: "国庆节祝福" },
  "除夕": { zh: "旧岁已展千重锦，新年再进百尺竿。", en: "The old year closes in splendor; the new year climbs higher.", source: "除夕祝福" },
  "情人节": { zh: "爱是平常日子里的一束光。", en: "Love is a beam of light in ordinary days.", source: "情人节寄语" },
  "妇女节": { zh: "愿你独立且自由，温柔而坚定。", en: "Be independent and free, gentle and steady.", source: "妇女节祝福" },
  "母亲节": { zh: "谢谢您把最好的时光给了我。", en: "Thank you for giving me your best days.", source: "母亲节祝福" },
  "父亲节": { zh: "谢谢您一直站在我身后。", en: "Thank you for always standing behind me.", source: "父亲节祝福" },
  "教师节": { zh: "一朝沐杏雨，一生念师恩。", en: "A day in your rain of wisdom, a lifetime of gratitude.", source: "教师节祝福" },
  "圣诞节": { zh: "愿平安喜乐，常伴左右。", en: "May peace and joy stay with you.", source: "圣诞祝福" },
  "光棍节": { zh: "一个人也要把日子过得热气腾腾。", en: "Live one day warmly, even on your own.", source: "节日祝福" }
};

function todayFestivalName(date = new Date()) {
  try {
    if (window.Lunar && window.Solar) {
      const solar = Solar.fromDate(date);
      const lunar = solar.getLunar();
      const names = [
        ...(solar.getFestivals() || []),
        ...(lunar.getFestivals() || []),
        ...(lunar.getOtherFestivals() || [])
      ];
      return names.find((name) => FESTIVAL_QUOTES[name]) || "";
    }
  } catch (err) {
    // fall through when the lunar library is unavailable
  }
  return "";
}

function festivalQuote(date = new Date()) {
  const name = todayFestivalName(date);
  if (!name) return null;
  return { ...FESTIVAL_QUOTES[name], festival: name };
}

function hashString(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = ((hash << 5) - hash + char.codePointAt(0)) >>> 0;
  }
  return hash;
}

function readDailyQuotePick(dateISO) {
  try {
    const raw = localStorage.getItem(DAILY_QUOTE_KEY);
    const pick = raw ? JSON.parse(raw) : null;
    if (pick && pick.date === dateISO && Number.isInteger(pick.index)) return pick;
  } catch (err) {
    return null;
  }
  return null;
}

function dailyQuoteIndex(dateISO) {
  const pick = readDailyQuotePick(dateISO);
  if (pick) return pick.index;
  return hashString(dateISO || todayISO()) % DAILY_QUOTES.length;
}

function dailyQuote(dateISO = todayISO()) {
  const pick = readDailyQuotePick(dateISO);
  if (pick) return DAILY_QUOTES[pick.index] || DAILY_QUOTES[0];
  const festival = festivalQuote(new Date(`${dateISO}T12:00:00`));
  if (festival) return festival;
  return DAILY_QUOTES[dailyQuoteIndex(dateISO)];
}

function shiftDailyQuote() {
  const dateISO = todayISO();
  const next = (dailyQuoteIndex(dateISO) + 1) % DAILY_QUOTES.length;
  try {
    localStorage.setItem(DAILY_QUOTE_KEY, JSON.stringify({ date: dateISO, index: next }));
  } catch (err) {
    // keep the date-based quote when storage is unavailable
  }
  render();
  toast("已换一句");
}

function readCachedDailyNews() {
  try {
    const raw = localStorage.getItem(DAILY_NEWS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.date === todayISO() ? parsed : null;
  } catch (err) {
    return null;
  }
}

function writeCachedDailyNews(data) {
  try {
    localStorage.setItem(DAILY_NEWS_KEY, JSON.stringify({ ...data, date: todayISO(), savedAt: Date.now() }));
  } catch (err) {
    // cache is best-effort
  }
}

async function fetchDailyNews(force = false) {
  const cached = readCachedDailyNews();
  if (cached && !force) return cached;
  try {
    const res = await fetch(DAILY_NEWS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("news-failed");
    const payload = await res.json();
    if (payload?.code !== 200 || !Array.isArray(payload.data?.news)) throw new Error("news-shape");
    const data = {
      news: payload.data.news.slice(0, 15),
      tip: String(payload.data.tip || "").trim(),
      link: String(payload.data.link || ""),
      created: String(payload.data.created || ""),
      source: "每日60秒读懂世界"
    };
    writeCachedDailyNews(data);
    return data;
  } catch (err) {
    return cached || null;
  }
}

function dailyNewsListHtml(data) {
  const items = (data?.news || []).map((title, index) => `
    <a class="news-item" href="${data.link || "#"}" target="_blank" rel="noopener">
      <span class="news-index">${pad2(index + 1)}</span>
      <span class="news-title">${esc(title)}</span>
    </a>`).join("");
  const tip = data?.tip
    ? `<div class="news-tip">${icon("quote")}<span>${esc(data.tip)}</span></div>`
    : "";
  return `${items}${tip}`;
}

function renderDaily() {
  const quote = dailyQuote();
  const cached = readCachedDailyNews();
  return `
    <div class="page-head">
      <div>
        <h1>每日灵感</h1>
        <p>每天一句好话，一条重点新闻，让早晨更清醒。</p>
      </div>
      <div class="page-actions">
        <span class="panel-meta">${esc(formatDate(todayISO()))}</span>
        <button class="btn btn-compact" data-action="shift-quote">${icon("refresh")}换一句</button>
        <button class="btn btn-compact" data-action="refresh-daily-news">${icon("refresh")}刷新新闻</button>
      </div>
    </div>

    <section class="panel daily-quote-card">
      <div class="quote-eyebrow">${quote.festival ? `${esc(quote.festival)} · 节日祝福` : "DAILY QUOTE · 每日一句"}</div>
      <blockquote class="daily-quote-body">
        <p class="quote-zh">${esc(quote.zh)}</p>
        <p class="quote-en">${esc(quote.en)}</p>
      </blockquote>
      <footer class="quote-author">出处：${esc(quote.source || quote.author || "佚名")}</footer>
    </section>

    <section class="panel news-panel">
      <div class="panel-head">
        <h2>重点新闻</h2>
        <div class="panel-head-actions">
          <span class="panel-meta">${cached ? `${cached.news.length} 条 · ${esc(cached.created || "今日")}` : "等待加载"}</span>
          ${cached?.link ? `<a class="btn btn-compact" href="${esc(cached.link)}" target="_blank" rel="noopener">${icon("link")}原文</a>` : ""}
        </div>
      </div>
      <div id="daily-news-body" class="news-body">${cached ? dailyNewsListHtml(cached) : `<div class="empty-note">正在获取今天的重点新闻…</div>`}</div>
    </section>
  `;
}

function mountDailyNews() {
  if (currentView !== "daily") return;
  const body = $("#daily-news-body");
  if (!body) return;
  fetchDailyNews(false).then((data) => {
    if (currentView !== "daily") return;
    const target = $("#daily-news-body");
    if (!target) return;
    target.innerHTML = data
      ? dailyNewsListHtml(data)
      : `<div class="empty-note">今天暂时取不到新闻，可以稍后点“刷新新闻”，或直接打开 <a href="https://60s.viki.moe" target="_blank" rel="noopener">60秒读世界</a>。</div>`;
  });
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
  const quote = dailyQuote(today);

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

    <section class="quote-strip">
      <div class="quote-strip-mark">${icon("quote")}</div>
      <blockquote>
        ${quote.festival ? `<span class="quote-festival">${esc(quote.festival)} · 节日祝福</span>` : ""}
        <p class="quote-strip-zh">${esc(quote.zh)}</p>
        <p class="quote-strip-en">${esc(quote.en)}</p>
        <span class="quote-strip-source">出处：${esc(quote.source || quote.author || "佚名")}</span>
      </blockquote>
      <div class="quote-strip-actions">
        <button class="btn btn-compact" data-action="shift-quote">${icon("refresh")}换一句</button>
        <button class="btn btn-compact" data-action="goto-daily">${icon("link")}今日灵感</button>
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
          <div class="panel-head-actions">
            <span class="panel-meta">${Object.keys(rooms.periods || {}).length} 个时段</span>
            <button class="btn btn-compact" data-action="goto-rooms-all-day">${icon("clock")}全天无课</button>
          </div>
        </div>
        <div class="rooms-compact">${roomPeriodsHtml(rooms.periods, rooms.id, roomOpenSet)}</div>
      </section>` : `<section class="panel rooms-panel">
        <div class="panel-head">
          <h2>今日空教室</h2>
          <div class="panel-head-actions">
            <span class="panel-meta">未导入</span>
            <button class="btn btn-compact" data-action="goto-rooms-all-day">${icon("clock")}全天无课</button>
          </div>
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
      <div class="page-actions">
        <span class="panel-meta">${undone} 件未完成</span>
        <button class="btn btn-compact" data-action="clear-page" data-page="tasks">${icon("trash")}一键清空</button>
      </div>
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
      <div class="page-actions">
        <span class="panel-meta">今天 ${doneToday}/${state.habits.length}</span>
        <button class="btn btn-compact" data-action="clear-page" data-page="habits">${icon("trash")}一键清空</button>
      </div>
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
      .filter((item) => Number(item.weekday) === day && scheduleVisible(item) && scheduleInSemester(item))
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
        <span class="panel-meta">${scheduleSetCourses().length} 个固定安排${scheduleSemester ? ` · ${esc(scheduleSemester)}` : ""}</span>
        <label class="week-picker">
          <span>课表</span>
          <select id="semester-filter">${semesterOptions()}</select>
        </label>
        <button class="btn btn-compact" data-action="new-schedule-set">${icon("plus")}新建课表</button>
        <label class="week-picker">
          <span>当前周</span>
          <select id="current-week" aria-label="当前教学周">
            <option value="" ${state.settings.currentWeekAuto !== false ? "selected" : ""}>${autoWeekLabel()}</option>
            ${Array.from({ length: 20 }, (_, index) => `<option value="${index + 1}" ${state.settings.currentWeekAuto === false && currentWeekNumber() === index + 1 ? "selected" : ""}>第 ${index + 1} 周</option>`).join("")}
          </select>
        </label>
        <button class="btn" data-action="open-import">${icon("upload")}从官网导入</button>
        <button class="btn btn-compact" data-action="clear-page" data-page="schedule">${icon("trash")}一键清空</button>
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
      <div class="form-row wide">
        <label class="field-label">课表名称
          <span class="set-name-line">
            <input id="course-semester" list="course-semester-list" value="${esc(scheduleSemester || "")}" placeholder="例如：2026春季学期" autocomplete="off">
            <datalist id="course-semester-list">${scheduleSemesterList().map((semester) => `<option value="${esc(semester)}"></option>`).join("")}</datalist>
            <button class="btn btn-compact" data-action="save-schedule-name">${icon("save")}保存课表名</button>
          </span>
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
      <div class="page-actions">
        <span class="panel-meta">${state.notes.length} 条</span>
        <button class="btn btn-compact" data-action="clear-page" data-page="notes">${icon("trash")}一键清空</button>
      </div>
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

function parseAnniversaryIntervals(value) {
  return String(value || "")
    .split(/[，,、\s]+/)
    .map((part) => Number(part))
    .filter((number) => Number.isInteger(number) && number > 0)
    .sort((a, b) => a - b);
}

function anniversaryStart(item) {
  const date = new Date(`${String(item.date || "")}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function anniversaryDaysSince(item) {
  const start = anniversaryStart(item);
  if (!start) return null;
  const todayStart = new Date(`${todayISO()}T00:00:00`);
  return Math.round((todayStart - start) / 86400000);
}

function anniversaryNext(item) {
  const start = anniversaryStart(item);
  if (!start) return null;
  const todayStart = new Date(`${todayISO()}T00:00:00`);
  const candidates = [];
  if (item.yearly) {
    const yearly = new Date(todayStart.getFullYear(), start.getMonth(), start.getDate());
    if (yearly < todayStart) yearly.setFullYear(yearly.getFullYear() + 1);
    candidates.push({ date: yearly, label: "周年纪念" });
  }
  const daysSince = Math.round((todayStart - start) / 86400000);
  for (const interval of item.intervals || []) {
    const k = daysSince >= 0 ? Math.floor(daysSince / interval) + 1 : 1;
    const next = new Date(start);
    next.setDate(next.getDate() + k * interval);
    candidates.push({ date: next, label: `${interval} 天纪念` });
  }
  candidates.sort((a, b) => a.date - b.date);
  return candidates[0] || null;
}

function anniversaryLabelOn(item, date) {
  const start = anniversaryStart(item);
  if (!start) return "";
  const dayStart = new Date(`${isoFor(date)}T00:00:00`);
  const daysSince = Math.round((dayStart - start) / 86400000);
  if (item.yearly && date.getMonth() === start.getMonth() && date.getDate() === start.getDate()) {
    const years = date.getFullYear() - start.getFullYear();
    return years > 0 ? `${years} 周年纪念` : "纪念日";
  }
  for (const interval of item.intervals || []) {
    if (daysSince > 0 && daysSince % interval === 0) return `${daysSince} 天纪念（${interval} 天节点）`;
  }
  return "";
}

function anniversaryCard(item) {
  const days = anniversaryDaysSince(item);
  const next = anniversaryNext(item);
  const daysLeft = next ? Math.max(0, Math.round((next.date - new Date(`${todayISO()}T00:00:00`)) / 86400000)) : null;
  const intervals = (item.intervals || []).join("、");
  const showDay = item.dayTextEnabled !== false && days != null && days >= 0;
  const dayText = showDay ? `第 ${days} 天` : "";
  const imageMode = item.imageMode === "fit" ? "fit" : "crop";
  const photo = item.image
    ? imageMode === "fit"
      ? `<div class="anniv-photo-wrap is-fit">
          <div class="anniv-photo">
            <button class="anniv-photo-open" data-action="open-image" data-url="${esc(item.image)}" aria-label="查看完整图片">
              <img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">
            </button>
          </div>
          ${dayText ? `<span class="anniv-photo-caption">${esc(item.name)} · ${esc(dayText)}</span>` : ""}
        </div>`
      : `<div class="anniv-photo-wrap ${dayText ? "has-day" : ""}">
          <div class="anniv-photo">
            <button class="anniv-photo-open" data-action="open-image" data-url="${esc(item.image)}" aria-label="查看完整图片">
              <img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">
            </button>
          </div>
          ${dayText ? `<span class="anniv-photo-text">${esc(item.name)} · ${esc(dayText)}</span>` : ""}
        </div>`
    : "";
  return `<article class="panel anniv-card">
    ${photo}
    <div class="anniv-main">
      <strong>${esc(item.name)}</strong>
      <span class="panel-meta">起点 ${esc(formatDate(item.date))}${days != null ? ` · ${days >= 0 ? `第 ${days} 天` : `还有 ${-days} 天开始`}` : ""}</span>
    </div>
    <div class="anniv-next">
      ${next
        ? `<span>下一个：${esc(next.label)}</span><strong>${daysLeft} 天后</strong>`
        : `<span class="panel-meta">没有设置提醒节点</span>`}
    </div>
    <div class="anniv-meta">
      ${item.yearly ? "每年提醒" : "不按年提醒"}${intervals ? ` · 间隔 ${esc(intervals)} 天` : ""}${item.remindEnabled ? ` · 通知 ${esc(item.remindTime || "08:00")}` : " · 未开通知"}
    </div>
    <div class="form-actions">
      <button class="btn btn-compact" data-action="toggle-anniv-day-text" data-id="${esc(item.id)}">${icon(item.dayTextEnabled !== false ? "x" : "check")}${item.dayTextEnabled !== false ? "隐藏天数" : "显示天数"}</button>
      <button class="btn-icon" data-action="edit-anniversary" data-id="${esc(item.id)}" aria-label="编辑">${icon("edit")}</button>
      <button class="btn-icon btn-danger" data-action="delete-anniversary" data-id="${esc(item.id)}" aria-label="删除">${icon("trash")}</button>
    </div>
  </article>`;
}

function renderAnniversaries() {
  const sorted = [...state.anniversaries].sort((a, b) => {
    const aNext = anniversaryNext(a)?.date || Infinity;
    const bNext = anniversaryNext(b)?.date || Infinity;
    return aNext - bNext;
  });
  return `
    <div class="page-head">
      <div>
        <h1>纪念日</h1>
        <p>每年提醒、100 天、365 天……重要的日子都放在这里。</p>
      </div>
      <div class="page-actions">
        <span class="panel-meta">${state.anniversaries.length} 个纪念日</span>
        <button class="btn btn-compact" data-action="clear-page" data-page="anniversaries">${icon("trash")}一键清空</button>
      </div>
    </div>

    <div class="form-grid">
      <div class="form-row">
        <label class="field-label">名称
          <input id="anniv-name" placeholder="例如：在一起、生日、入学" autocomplete="off">
        </label>
        <label class="field-label">起始日期
          <input id="anniv-date" type="date">
        </label>
      </div>
      <div class="form-row">
        <label class="field-label">间隔提醒（天，多个用逗号）
          <input id="anniv-intervals" placeholder="例如：100, 200, 365" autocomplete="off">
        </label>
        <label class="field-label">提醒时间
          <input id="anniv-remind-time" type="time" value="08:00">
        </label>
      </div>
      <div class="form-row">
        <label class="switch-line"><input type="checkbox" id="anniv-yearly"> 每年提醒（生日、周年）</label>
        <label class="switch-line"><input type="checkbox" id="anniv-remind" checked> 开启通知</label>
      </div>
      <div class="form-row wide">
        <label class="field-label">纪念日图片
          <div class="upload-zone">
            <button class="btn" data-action="choose-anniv-image">${icon("upload")}选择图片</button>
            ${anniversaryImageUrl ? `<button class="btn-icon btn-danger" data-action="clear-anniv-image" aria-label="移除图片">${icon("x")}</button>` : ""}
            <input id="anniv-image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
            <img id="anniv-image-preview" class="upload-preview ${anniversaryImageUrl ? "is-visible" : ""}" src="${esc(anniversaryImageUrl)}" alt="纪念日图片预览">
          </div>
          <select id="anniv-image-mode">
            <option value="crop">裁剪预览（固定高度可滚动）</option>
            <option value="fit">完整显示（不裁剪）</option>
          </select>
        </label>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" data-action="save-anniversary">${icon("plus")}${editingAnniversaryId ? "保存修改" : "添加纪念日"}</button>
        ${editingAnniversaryId ? `<button class="btn" data-action="cancel-anniversary">${icon("x")}取消</button>` : ""}
      </div>
    </div>

    ${sorted.length
      ? `<div class="big-grid">${sorted.map(anniversaryCard).join("")}</div>`
      : `<div class="panel"><div class="empty-note">还没有纪念日。把重要日期和间隔节点加进来，到点提醒你。</div></div>`}
  `;
}

function saveAnniversary() {
  const name = $("#anniv-name").value.trim();
  const date = $("#anniv-date").value;
  if (!name || !date) {
    toast("请填写名称和起始日期");
    return;
  }
  const payload = {
    name,
    date,
    yearly: Boolean($("#anniv-yearly")?.checked),
    intervals: parseAnniversaryIntervals($("#anniv-intervals")?.value),
    remindEnabled: Boolean($("#anniv-remind")?.checked),
    remindTime: $("#anniv-remind-time")?.value || "08:00",
    image: anniversaryImageUrl,
    imageMode: $("#anniv-image-mode")?.value === "fit" ? "fit" : "crop"
  };
  if (editingAnniversaryId) {
    const item = state.anniversaries.find((entry) => entry.id === editingAnniversaryId);
    if (item) Object.assign(item, payload);
  } else {
    state.anniversaries.unshift({ id: uid("anniv"), ...payload });
  }
  editingAnniversaryId = null;
  anniversaryImageUrl = "";
  scheduleSave();
  scheduleRemindersSoon();
  render();
  toast("纪念日已保存");
}

function startEditAnniversary(id) {
  const item = state.anniversaries.find((entry) => entry.id === id);
  if (!item) return;
  editingAnniversaryId = id;
  anniversaryImageUrl = item.image || "";
  render();
  $("#anniv-name").value = item.name;
  $("#anniv-date").value = item.date || "";
  $("#anniv-intervals").value = (item.intervals || []).join(", ");
  $("#anniv-yearly").checked = Boolean(item.yearly);
  $("#anniv-remind").checked = item.remindEnabled !== false;
  $("#anniv-remind-time").value = item.remindTime || "08:00";
  $("#anniv-image-mode").value = item.imageMode === "fit" ? "fit" : "crop";
  $("#anniv-name").focus();
}

function toggleAnniversaryDayText(id) {
  const item = state.anniversaries.find((entry) => entry.id === id);
  if (!item) return;
  item.dayTextEnabled = item.dayTextEnabled === false;
  scheduleSave();
  render();
  toast(item.dayTextEnabled === false ? "已隐藏天数文字" : "已显示天数文字");
}

function deleteAnniversary(id) {
  if (!confirm("确定删除这个纪念日吗？")) return;
  state.anniversaries = state.anniversaries.filter((entry) => entry.id !== id);
  if (editingAnniversaryId === id) editingAnniversaryId = null;
  scheduleSave();
  scheduleRemindersSoon();
  render();
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
      <div class="page-actions">
        <span class="panel-meta">${currentWeek}</span>
        <button class="btn btn-compact" data-action="clear-page" data-page="reviews">${icon("trash")}一键清空</button>
      </div>
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
        <button class="btn btn-compact" data-action="clear-page" data-page="assets">${icon("trash")}一键清空</button>
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
    const rooms = line.match(/\bG\d{3}\b|(?:[\u4e00-\u9fa5A-Za-z]{1,8})\d{2,4}/gi);
    if (rooms) {
      const unique = new Set(periods[currentKey]);
      rooms.forEach((room) => unique.add(room.replace(/\s+/g, "").toUpperCase()));
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

function roomPeriodNumbers(label) {
  const numbers = String(label || "").match(/\d+/g) || [];
  const first = Number(numbers[0]);
  const last = Number(numbers[1] || numbers[0]);
  return { first, last };
}

function roomFreeRoomsForPeriod(entry, periodNumber) {
  const free = new Set();
  for (const [label, rooms] of Object.entries(entry?.periods || {})) {
    const { first, last } = roomPeriodNumbers(label);
    if (first <= periodNumber && periodNumber <= last) {
      rooms.forEach((room) => free.add(room));
    }
  }
  return free;
}

function roomPeriodHasData(entry, periodNumber) {
  return Object.keys(entry?.periods || {}).some((label) => {
    const { first, last } = roomPeriodNumbers(label);
    return first <= periodNumber && periodNumber <= last;
  });
}

function roomsFreeInRange(entry, start, end) {
  if (!entry) return { missing: [], rooms: [] };
  let result = null;
  const missing = [];
  for (let period = start; period <= end; period += 1) {
    if (!roomPeriodHasData(entry, period)) {
      missing.push(period);
      continue;
    }
    const free = roomFreeRoomsForPeriod(entry, period);
    if (result === null) {
      result = new Set(free);
    } else {
      result = new Set([...result].filter((room) => free.has(room)));
    }
  }
  return {
    missing,
    rooms: result ? Array.from(result).sort() : []
  };
}

function roomRangeLabel(start, end) {
  const startTime = NEUQ_PERIODS[start]?.[0] || "";
  const endTime = NEUQ_PERIODS[end]?.[1] || "";
  return `第 ${start}~${end} 节${startTime && endTime ? `（${startTime}~${endTime}）` : ""}`;
}

function roomFilterResultHtml(entry) {
  if (!entry) return `<div class="empty-note">还没有空教室记录。</div>`;
  const { missing, rooms } = roomsFreeInRange(entry, roomFilterStart, roomFilterEnd);
  if (missing.length) {
    return `<div class="empty-note">所选区间缺少第 ${missing.join("、")} 节的空教室数据，暂时无法判断。</div>`;
  }
  if (!rooms.length) {
    return `<div class="empty-note">${roomRangeLabel(roomFilterStart, roomFilterEnd)}没有同时空闲的教室。</div>`;
  }
  return `
    <div class="room-filter-count">${esc(formatDate(entry.date))} · ${esc(roomRangeLabel(roomFilterStart, roomFilterEnd))} · ${rooms.length} 间</div>
    <div class="room-chips">${rooms.map((room) => `<button class="room-chip" data-action="copy-room" data-room="${esc(room)}">${esc(room)}</button>`).join("")}</div>
  `;
}

function applyRoomFilter() {
  const start = Number($("#room-filter-start")?.value) || 1;
  const end = Number($("#room-filter-end")?.value) || 12;
  const date = $("#room-filter-date")?.value || "";
  if (start > end) {
    toast("开始节次不能晚于结束节次");
    return;
  }
  roomFilterStart = start;
  roomFilterEnd = end;
  if (date) roomFilterDate = date;
  render();
  toast(`已筛选${roomRangeLabel(start, end)}`);
}

function setRoomAllDay() {
  roomFilterStart = 1;
  roomFilterEnd = 12;
  const date = $("#room-filter-date")?.value || roomFilterDate;
  if (date) roomFilterDate = date;
  render();
  toast("已显示全天无课教室");
}

function gotoRoomsAllDay() {
  roomFilterStart = 1;
  roomFilterEnd = 12;
  currentView = "rooms";
  render(true);
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

async function openRoomScreenshot(file) {
  if (!file || !file.type.startsWith("image/")) {
    toast("请选择图片文件");
    return;
  }
  const dataUrl = await fileToLocalDataUrl(file);
  pendingRoomScreenshot = { dataUrl, date: todayISO() };
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.id = "room-shot-modal";
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <div>
          <h2>截图识别空教室</h2>
          <p>AI 自动识别后会填入结果，你可以先确认再导入。</p>
        </div>
        <button class="btn-icon" data-action="close-room-screenshot" aria-label="关闭">${icon("x")}</button>
      </div>
      <img class="room-shot-preview" src="${esc(dataUrl)}" alt="空教室截图预览">
      <div class="form-row">
        <label class="field-label">日期
          <input id="room-shot-date" type="date" value="${todayISO()}">
        </label>
        <label class="field-label">状态
          <span class="panel-meta" id="room-shot-status">等待识别</span>
        </label>
      </div>
      <div class="form-row wide">
        <label class="field-label">识别结果
          <textarea id="room-shot-result" rows="10" placeholder="识别完成后自动填入，可手动修正…"></textarea>
        </label>
      </div>
      <div class="form-actions modal-actions">
        <button class="btn" data-action="close-room-screenshot">取消</button>
        <button class="btn" data-action="run-room-ai">${icon("refresh")}开始识别</button>
        <button class="btn btn-primary" data-action="save-room-shot">${icon("save")}确认导入</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");
}

function closeRoomScreenshot() {
  const overlay = $("#room-shot-modal");
  if (overlay) overlay.remove();
  document.body.classList.remove("modal-open");
  pendingRoomScreenshot = null;
}

function loadCanvasFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d").drawImage(image, 0, 0);
      resolve(canvas);
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function clusterCenters(values, minGap, minSize) {
  const sorted = Array.from(new Set(values)).sort((a, b) => a - b);
  const clusters = [];
  let current = [];
  for (const value of sorted) {
    if (current.length && value - current[current.length - 1] > minGap) {
      clusters.push(current);
      current = [value];
    } else {
      current.push(value);
    }
  }
  if (current.length) clusters.push(current);
  return clusters
    .filter((cluster) => cluster.length >= (minSize || 1))
    .map((cluster) => cluster[Math.floor(cluster.length / 2)]);
}

function getRoomRowCenters(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const stripWidth = Math.max(60, Math.round(width * 0.13));
  const startY = Math.round(height * 0.15);
  const endY = Math.round(height * 0.98);
  const data = canvas.getContext("2d").getImageData(0, startY, stripWidth, endY - startY).data;
  const counts = [];
  for (let y = 0; y < endY - startY; y += 1) {
    let dark = 0;
    for (let x = 0; x < stripWidth; x += 1) {
      const index = (y * stripWidth + x) * 4;
      if (data[index] < 120 && data[index + 1] < 120 && data[index + 2] < 120) dark += 1;
    }
    counts.push(dark);
  }
  const values = [];
  counts.forEach((count, y) => {
    if (count > 4) values.push(startY + y);
  });
  return clusterCenters(values, 4, 8);
}

function getOrangeColumnCenters(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  const values = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      if (r > 140 && g < 190 && b < 130 && r - g > 40 && r - b > 50) values.push(x);
    }
  }
  let centers = clusterCenters(values, 6, 8);
  if (centers.length !== 42 && centers.length > 24) {
    const first = centers[0];
    const last = centers[centers.length - 1];
    centers = Array.from({ length: 42 }, (_, index) => Math.round(first + ((last - first) * index) / 41));
  }
  return centers;
}

function countOrangeAround(imageData, x, y, width, height) {
  let count = 0;
  for (let dy = -12; dy <= 12; dy += 1) {
    for (let dx = -10; dx <= 10; dx += 1) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const index = (py * width + px) * 4;
      const r = imageData.data[index];
      const g = imageData.data[index + 1];
      const b = imageData.data[index + 2];
      if (r > 140 && g < 190 && b < 130 && r - g > 40 && r - b > 50) count += 1;
    }
  }
  return count;
}

async function ocrRoomNamesFromCanvas(canvas) {
  const width = Math.max(80, Math.round(canvas.width * 0.14));
  const startY = Math.round(canvas.height * 0.15);
  const endY = Math.round(canvas.height * 0.98);
  const crop = document.createElement("canvas");
  crop.width = width;
  crop.height = endY - startY;
  crop.getContext("2d").drawImage(canvas, 0, startY, width, endY - startY, 0, 0, width, endY - startY);
  const scaled = document.createElement("canvas");
  scaled.width = width * 2;
  scaled.height = (endY - startY) * 2;
  scaled.getContext("2d").drawImage(crop, 0, 0, width, endY - startY, 0, 0, width * 2, (endY - startY) * 2);
  const response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${aiConfig.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: aiConfig.model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "逐行输出图片里的教室名，一行一个，不要解释，不要编号。" },
          { type: "image_url", image_url: { url: scaled.toDataURL("image/jpeg", 0.92) } }
        ]
      }]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
  const content = String(data?.choices?.[0]?.message?.content || "");
  return content
    .split(/\n+/)
    .map((line) => line.replace(/^\s*\d+[.、\s]+/, "").trim())
    .filter((line) => /[\u4e00-\u9fa5A-Za-z]+\d{2,4}/.test(line));
}

async function analyzeRoomScreenshot(dataUrl) {
  const canvas = await loadCanvasFromDataUrl(dataUrl);
  let rows = getRoomRowCenters(canvas);
  const columns = getOrangeColumnCenters(canvas);
  let roomNames = [];
  try {
    roomNames = await ocrRoomNamesFromCanvas(canvas);
  } catch (err) {
    // Room names can still be edited manually in the preview.
  }
  if (roomNames.length && rows.length > roomNames.length) {
    rows = rows.slice(rows.length - roomNames.length);
  }
  const imageData = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  const isOccupied = (rowIndex, colIndex) => {
    const rowY = rows[rowIndex];
    const colX = columns[colIndex];
    if (rowY == null || colX == null) return true;
    return countOrangeAround(imageData, colX, rowY, canvas.width, canvas.height) > 8;
  };
  return { rows, columns, roomNames, isOccupied };
}

async function recognizeRoomScreenshot() {
  if (!pendingRoomScreenshot || !aiConfig.apiKey) {
    toast("请先在设置里填写 AI API Key");
    return;
  }
  const date = $("#room-shot-date")?.value || todayISO();
  const weekdayIndexValue = weekdayIndex(new Date(`${date}T00:00:00`));
  const weekday = WEEKDAYS[weekdayIndexValue];
  const status = $("#room-shot-status");
  if (status) status.textContent = "识别中…";
  try {
    const parsed = await analyzeRoomScreenshot(pendingRoomScreenshot.dataUrl);
    if (parsed.columns.length < 42) {
      if (status) status.textContent = "表格不完整";
      toast("没有识别到完整的 7 天 × 6 时段表格，请放大截图后重试");
      return;
    }
    const periodGroups = ["1-2", "3-4", "5-6", "7-8", "9-10", "11-12"];
    const lines = [];
    for (let group = 0; group < 6; group += 1) {
      const colIndex = weekdayIndexValue * 6 + group;
      const free = [];
      for (let rowIndex = 0; rowIndex < parsed.roomNames.length; rowIndex += 1) {
        if (!parsed.isOccupied(rowIndex, colIndex)) free.push(parsed.roomNames[rowIndex]);
      }
      if (free.length) lines.push(`${periodGroups[group]}节：${free.join(" ")}`);
    }
    if (!parsed.roomNames.length) {
      if (status) status.textContent = "教室名识别失败";
      toast("教室名识别失败，请检查 AI 模型和 Key");
      return;
    }
    const result = $("#room-shot-result");
    if (result) result.value = lines.join("\n");
    if (status) status.textContent = `已识别 ${weekday}，请确认`;
    toast(`已识别 ${weekday}，请确认`);
  } catch (err) {
    if (status) status.textContent = "识别失败";
    toast(`识别失败：${err.message || "请检查 Key 和网络"}`);
  }
}

function saveRoomShot() {
  const date = $("#room-shot-date")?.value || todayISO();
  const text = $("#room-shot-result")?.value.trim() || "";
  const parsed = parseRoomText(text, date);
  if (!Object.keys(parsed.periods).length) {
    toast("没有识别到有效节次，请修正后再导入");
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
  closeRoomScreenshot();
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
  if (!roomFilterDate || !state.rooms.some((entry) => entry.date === roomFilterDate)) {
    roomFilterDate = sorted[0]?.date || "";
  }
  const filterEntry = state.rooms.find((entry) => entry.date === roomFilterDate) || sorted[0] || null;
  const periodOption = (number, selected) => `<option value="${number}"${selected ? " selected" : ""}>第 ${number} 节</option>`;
  const numbers = Array.from({ length: 12 }, (_, index) => index + 1);
  const startOptions = numbers.map((number) => periodOption(number, number === roomFilterStart)).join("");
  const endOptions = numbers.map((number) => periodOption(number, number === roomFilterEnd)).join("");
  const dateOptions = sorted.map((entry) => `<option value="${esc(entry.date)}" ${entry.date === roomFilterDate ? "selected" : ""}>${esc(formatDate(entry.date))}</option>`).join("");
  return `
    <div class="page-head">
      <div>
        <h1>自习室</h1>
        <p>每天的空教室信息粘贴进来，自动按节次整理。</p>
      </div>
      <div class="page-actions">
        <span class="panel-meta">${state.rooms.length} 天记录</span>
        <button class="btn" data-action="locate-room-time">${icon("clock")}定位当前时段</button>
        <button class="btn btn-compact" data-action="clear-page" data-page="rooms">${icon("trash")}一键清空</button>
        <button class="btn btn-primary" data-action="open-room-screenshot">${icon("upload")}截图导入</button>
      </div>
    </div>
    <input id="room-screenshot" type="file" accept="image/*" hidden>

    ${sorted.length ? `
    <section class="panel room-filter-panel">
      <div class="panel-head">
        <h2>区间筛选空教室</h2>
        <span class="panel-meta">${filterEntry ? esc(formatDate(filterEntry.date)) : "无记录"}</span>
      </div>
      <div class="room-filter-form">
        <label class="field-label">日期
          <select id="room-filter-date">${dateOptions}</select>
        </label>
        <label class="field-label">从
          <select id="room-filter-start">${startOptions}</select>
        </label>
        <label class="field-label">到
          <select id="room-filter-end">${endOptions}</select>
        </label>
        <div class="form-actions">
          <button class="btn btn-primary" data-action="apply-room-filter">${icon("check")}显示</button>
          <button class="btn" data-action="set-room-all-day">${icon("clock")}全天无课</button>
        </div>
      </div>
      <div class="room-filter-result">${roomFilterResultHtml(filterEntry)}</div>
    </section>
    ` : ""}

    <div class="form-grid room-editor">
      <div class="form-row">
        <label class="field-label">日期
          <input id="room-import-date" type="date" value="${todayISO()}">
        </label>
        <label class="field-label wide">空教室信息
          <textarea id="room-import-text" rows="10" placeholder="粘贴空教室文字，或用上方截图导入自动识别…"></textarea>
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
          <label class="field-label">当前学期开学日期
            <input id="semester-start" type="date" value="${esc(state.settings.semesterStart || "")}">
          </label>
          <span class="panel-meta">设置后课表会按日期自动显示当前周，也可在课表页手动切换。</span>
        </div>
        <button class="btn btn-primary" data-action="save-settings">${icon("save")}保存</button>
      </section>

      <section class="settings-row">
        <div>
          <h2>账号</h2>
          ${authSession
            ? `<p>当前登录：${esc(authSession.user?.user_metadata?.username || authSession.user?.email || "已登录")}</p>`
            : `<label class="field-label">邮箱
                <input id="account-email" type="email" placeholder="you@example.com" autocomplete="email">
              </label>
              <label class="field-label">密码
                <input id="account-password" type="password" placeholder="至少 6 位" autocomplete="current-password">
              </label>`}
        </div>
        <div class="form-actions">
          ${authSession
            ? `<button class="btn btn-danger" data-action="logout-account">${icon("x")}退出登录</button>`
            : `<button class="btn btn-primary" data-action="login-account">${icon("check")}登录</button>
               <button class="btn" data-action="register-account">${icon("plus")}注册</button>`}
        </div>
      </section>

      <section class="settings-row">
        <div>
          <h2>项目</h2>
          <label class="field-label">新项目名称
            <input id="project-name" placeholder="例如：班级共享课表" autocomplete="off">
          </label>
          <label class="field-label">邀请码
            <input id="project-code" placeholder="6 位邀请码" autocomplete="off">
          </label>
          <div class="project-list" id="project-list">${authSession ? `<button class="btn ${currentSpaceId === authSession.user.id ? "is-active" : ""}" data-action="switch-personal-space">${icon("user")}私人工作台</button>` : `<span class="panel-meta">登录后可查看项目</span>`}</div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" data-action="create-project">${icon("plus")}创建</button>
          <button class="btn" data-action="join-project">${icon("link")}加入</button>
          <button class="btn" data-action="refresh-projects">${icon("refresh")}刷新</button>
        </div>
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
          <label class="switch-line">
            <input type="checkbox" id="daily-push-enabled" ${state.settings.dailyPushEnabled ? "checked" : ""}>
            每日精句推送
          </label>
          <label class="field-label">推送时间
            <input type="time" id="daily-push-time" value="${esc(state.settings.dailyPushTime || "08:00")}">
          </label>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" data-action="enable-notifications">${icon("check")}开启通知</button>
          <button class="btn" data-action="save-daily-push">${icon("save")}保存每日推送</button>
          <button class="btn" data-action="test-notification">${icon("clock")}测试提醒</button>
          <button class="btn" data-action="resync-notifications">${icon("refresh")}重新安排</button>
        </div>
      </section>

      <section class="settings-row">
        <div>
          <h2>版本更新</h2>
          <span class="panel-meta">当前版本 ${APP_VERSION}</span>
          <span class="panel-meta" id="update-status">${esc(updateStatusText)}</span>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" data-action="check-update">${icon("refresh")}检查更新</button>
        </div>
      </section>

      <section class="settings-row">
        <div>
          <h2>AI 识别</h2>
          <label class="field-label">接口地址
            <input id="ai-base-url" value="${esc(aiConfig.baseUrl)}" placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" autocomplete="off">
          </label>
          <label class="field-label">模型
            <input id="ai-model" value="${esc(aiConfig.model)}" placeholder="qwen-vl-ocr-latest" autocomplete="off">
          </label>
          <label class="field-label">API Key
            <input id="ai-api-key" type="password" value="${esc(aiConfig.apiKey)}" placeholder="只在你的设备上保存" autocomplete="off">
          </label>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" data-action="save-ai">${icon("save")}保存</button>
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
  if (state.settings && typeof state.settings.currentScheduleSet === "string") {
    scheduleSemester = state.settings.currentScheduleSet;
  }
  const htmlByView = {
    today: renderToday,
    tasks: renderTasks,
    habits: renderHabits,
    schedule: renderSchedule,
    notes: renderNotes,
    assets: renderAssets,
    rooms: renderRooms,
    daily: renderDaily,
    anniversaries: renderAnniversaries,
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
  applyNavDefaultOnce();
  document.body.classList.toggle("dock-hidden", Boolean(state.settings.hideMobileNav));
  const dockToggle = $("#dock-toggle");
  if (dockToggle) dockToggle.textContent = state.settings.hideMobileNav ? "展开导航" : "收起导航";
  refreshReminderStatus();
  refreshUpdateStatus();
  if (currentView === "settings" && authSession) refreshProjectList();
  mountDailyNews();
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

function localStateKey() {
  return `${LOCAL_STATE_KEY}:${cloudRowId()}`;
}

function migrateLegacyLocalState() {
  try {
    if (localStorage.getItem(LOCAL_STATE_MIGRATED_KEY)) return;
    const legacyRaw = localStorage.getItem(LOCAL_STATE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      if (parsed && typeof parsed === "object") {
        localStorage.setItem(localStateKey(), legacyRaw);
      }
    }
    localStorage.setItem(LOCAL_STATE_MIGRATED_KEY, "1");
  } catch (err) {
    // storage may be unavailable; cloud copy still loads
  }
}

function readLocalState() {
  try {
    const raw = localStorage.getItem(localStateKey());
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

function readAIConfig() {
  const defaults = {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-vl-ocr-latest",
    apiKey: ""
  };
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        baseUrl: parsed.baseUrl || defaults.baseUrl,
        model: parsed.model || defaults.model,
        apiKey: parsed.apiKey || ""
      };
    }
  } catch (err) {
    // fall through to defaults
  }
  return { ...defaults };
}

function writeAIConfig(config) {
  try {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch (err) {
    return false;
  }
}

function readAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.access_token && parsed.user) return parsed;
  } catch (err) {
    // fall through
  }
  return null;
}

function writeAuthSession(session) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    authSession = session;
    return true;
  } catch (err) {
    return false;
  }
}

function clearAuthSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  authSession = null;
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
  const token = authSession?.access_token || cloudConfig.key;
  const headers = {
    apikey: cloudConfig.key,
    Authorization: `Bearer ${token}`
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

function authTokenExpired() {
  if (!authSession?.access_token) return false;
  if (authSession.expires_at) {
    return Date.now() / 1000 > Number(authSession.expires_at) - 60;
  }
  try {
    const payloadPart = String(authSession.access_token).split(".")[1] || "";
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized));
    return Date.now() / 1000 > Number(payload.exp || 0) - 60;
  } catch (err) {
    return false;
  }
}

async function refreshAuthToken() {
  const refreshToken = authSession?.refresh_token;
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${cloudConfig.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: cloudConfig.key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.access_token) return false;
    writeAuthSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_at: data.expires_at || 0,
      user: data.user || authSession.user
    });
    rememberAuthUsernameEmail();
    return true;
  } catch (err) {
    return false;
  }
}

let authExpiredHandled = false;

async function handleExpiredAuth() {
  if (authExpiredHandled || !authSession) return;
  authExpiredHandled = true;
  clearAuthSession();
  currentSpaceId = "personal-workbench";
  writeLocalState();
  render();
  showAuthScreen();
  toast("登录已过期，请重新登录");
}

async function cloudFetch(url, options = {}) {
  if (authSession && authTokenExpired()) {
    await refreshAuthToken();
  }
  const buildHeaders = () => ({
    ...(options.headers || {}),
    ...cloudHeaders(Boolean(options.body))
  });
  let res = await fetch(url, { ...options, headers: buildHeaders() });
  if (res.status === 401 && authSession) {
    const refreshed = authSession.refresh_token ? await refreshAuthToken() : false;
    if (refreshed) {
      res = await fetch(url, { ...options, headers: buildHeaders() });
    } else {
      await handleExpiredAuth();
    }
  }
  return res;
}

function cloudRowId() {
  return currentSpaceId || authSession?.user?.id || "personal-workbench";
}

function cloudTable() {
  return `${cloudConfig.url}/rest/v1/workbench_state`;
}

function writeLocalState() {
  try {
    localStorage.setItem(localStateKey(), JSON.stringify({ revision, state }));
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
  const res = await cloudFetch(`${cloudTable()}?id=eq.${cloudRowId()}&select=id,revision,state&limit=1`);
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
    const check = await cloudFetch(`${cloudTable()}?id=eq.${cloudRowId()}&select=id,revision&limit=1`);
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
      res = await cloudFetch(`${cloudTable()}?id=eq.${cloudRowId()}&revision=eq.${remoteRevision}`, {
        method: "PATCH",
        headers: {
          Prefer: "return=representation"
        },
        body: JSON.stringify(payload)
      });
    } else {
      res = await cloudFetch(cloudTable(), {
        method: "POST",
        headers: {
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          id: cloudRowId(),
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
  const res = await cloudFetch(`${cloudTable()}?id=eq.${cloudRowId()}&select=id,revision,state&limit=1`);
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
        semester: $("#course-semester").value.trim() || item.semester || "",
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
      semester: $("#course-semester").value.trim() || "",
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
  $("#course-semester").value = item.semester || "";
  $("#course-title").focus();
}

function saveScheduleName() {
  const name = $("#course-semester")?.value.trim();
  if (!name) {
    toast("先输入课表名称");
    return;
  }
  const oldName = scheduleSemester;
  if (oldName === name) {
    toast("课表名称没有变化");
    return;
  }
  if (state.schedule.some((item) => item.semester === name)) {
    toast(`已存在同名课表：${name}`);
    return;
  }
  let renamed = 0;
  for (const item of state.schedule) {
    if (oldName ? item.semester === oldName : !item.semester) {
      item.semester = name;
      renamed += 1;
    }
  }
  setScheduleSet(name);
  scheduleSave();
  render();
  toast(oldName ? `课表已重命名为：${name}` : `已创建课表：${name}${renamed ? `（迁移 ${renamed} 门课程）` : ""}`);
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
  state.settings.semesterStart = $("#semester-start")?.value.trim() || "";
  scheduleSave();
  render();
  toast("设置已保存");
}

function saveDailyPush() {
  state.settings.dailyPushEnabled = Boolean($("#daily-push-enabled")?.checked);
  state.settings.dailyPushTime = $("#daily-push-time")?.value || "08:00";
  scheduleSave();
  scheduleRemindersSoon();
  render();
  toast(state.settings.dailyPushEnabled ? "每日精句推送已开启" : "每日精句推送已关闭");
}

function saveAIConfig() {
  aiConfig = {
    baseUrl: $("#ai-base-url").value.trim().replace(/\/+$/, "") || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: $("#ai-model").value.trim() || "qwen-vl-ocr-latest",
    apiKey: $("#ai-api-key").value.trim()
  };
  writeAIConfig(aiConfig);
  render();
  toast(aiConfig.apiKey ? "AI 识别已保存" : "AI 配置已保存，Key 留空则不可用");
}

async function migratePersonalRowToUser() {
  const anonHeaders = {
    apikey: cloudConfig.key,
    Authorization: `Bearer ${cloudConfig.key}`
  };
  const oldRes = await fetch(`${cloudTable()}?id=eq.personal-workbench&select=revision,state&limit=1`, {
    headers: anonHeaders
  });
  const oldRows = oldRes.ok ? await oldRes.json() : [];
  const oldRow = Array.isArray(oldRows) ? oldRows[0] : null;
  if (!oldRow) return;
  const userRes = await fetch(`${cloudTable()}?id=eq.${cloudRowId()}&select=id&limit=1`, {
    headers: anonHeaders
  });
  const userRows = userRes.ok ? await userRes.json() : [];
  if (!Array.isArray(userRows) || userRows.length) return;
  await fetch(cloudTable(), {
    method: "POST",
    headers: {
      ...anonHeaders,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      id: cloudRowId(),
      revision: Number(oldRow.revision) || 0,
      state: oldRow.state || {},
      updated_at: new Date().toISOString()
    })
  });
}

function authEmailValue() {
  return $("#auth-email")?.value ?? $("#account-email")?.value ?? "";
}

function authPasswordValue() {
  return $("#auth-password")?.value ?? $("#account-password")?.value ?? "";
}

function authUsernameValue() {
  return $("#auth-username")?.value.trim() ?? "";
}

function usernameToEmail(username) {
  const normalized = String(username || "").trim().toLowerCase();
  let hash = 5381;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(index)) >>> 0;
  }
  const suffix = hash.toString(36).padStart(7, "0");
  return `u${suffix}@example.com`;
}

function readUsernameEmailMap() {
  try {
    const raw = localStorage.getItem(USERNAME_EMAIL_MAP_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function writeUsernameEmailMap(map) {
  try {
    localStorage.setItem(USERNAME_EMAIL_MAP_KEY, JSON.stringify(map));
  } catch (err) {
    // storage may be unavailable; mapping still works for this session
  }
}

function rememberUsernameEmail(username, email) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!normalized || !email) return;
  const map = readUsernameEmailMap();
  map[normalized] = email;
  writeUsernameEmailMap(map);
}

function emailForUsername(username) {
  const normalized = String(username || "").trim().toLowerCase();
  const map = readUsernameEmailMap();
  return map[normalized] || "";
}

function rememberAuthUsernameEmail() {
  const user = authSession?.user;
  if (!user) return;
  const username = user.user_metadata?.username || "";
  if (username && user.email) rememberUsernameEmail(username, user.email);
}

function applyNavDefaultOnce() {
  try {
    if (localStorage.getItem(NAV_DEFAULT_KEY) === "1") return;
    localStorage.setItem(NAV_DEFAULT_KEY, "1");
  } catch (err) {
    return;
  }
  state.settings.hideMobileNav = true;
  scheduleSave();
}

async function resolveAuthEmail() {
  const raw = authEmailValue().trim();
  const username = authUsernameValue();
  const identifier = raw || username;
  if (!identifier) return "";
  if (identifier.includes("@")) return identifier;
  const remembered = emailForUsername(identifier);
  if (remembered) return remembered;
  if (AUTH_HELPER_URL) {
    try {
      const res = await fetch(AUTH_HELPER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup", username: identifier })
      });
      const data = await res.json();
      if (res.ok && data.ok && data.email) {
        rememberUsernameEmail(identifier, data.email);
        return data.email;
      }
    } catch (err) {
      // fall through to the deterministic email
    }
  }
  return usernameToEmail(identifier);
}

function authAdminKeyValue() {
  return $("#auth-admin-key")?.value.trim() ?? "";
}

function saveAdminKey(key) {
  adminKey = key;
  try {
    if (key) {
      localStorage.setItem(ADMIN_KEY_STORAGE_KEY, key);
    } else {
      localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
    }
  } catch (err) {
    // storage may be unavailable; key still applies for this session
  }
}

function saveAdminKeySetting() {
  const value = $("#admin-key-setting")?.value.trim() ?? "";
  saveAdminKey(value);
  render();
  toast(value ? "管理密钥已保存" : "管理密钥已清除");
}

function ensureCloudForAuth() {
  if (!cloudConfig) {
    cloudConfig = { ...DEFAULT_CLOUD_CONFIG };
    writeCloudConfig(cloudConfig);
  }
}

function showAuthScreen() {
  if ($("#auth-screen")) return;
  const overlay = document.createElement("div");
  overlay.className = "auth-screen";
  overlay.id = "auth-screen";
  overlay.innerHTML = `
    <div class="auth-card">
      <div class="auth-mark">${icon("sun")}</div>
      <h1>我的工作台</h1>
      <p>登录后进入你的工作台</p>
      <label class="field-label">用户名
        <input id="auth-username" placeholder="你的用户名" autocomplete="username">
      </label>
      <label class="field-label">邮箱
        <input id="auth-email" type="email" placeholder="可留空，用用户名注册" autocomplete="email">
      </label>
      <label class="field-label">密码
        <input id="auth-password" type="password" placeholder="至少 6 位" autocomplete="current-password">
      </label>
      <div class="form-actions">
        <button class="btn btn-primary" data-action="login-account">${icon("check")}登录</button>
        <button class="btn" data-action="register-account">${icon("plus")}注册</button>
      </div>
      <span class="panel-meta" id="auth-status">未登录</span>
      <button class="auth-skip" data-action="dismiss-auth">先跳过，稍后登录</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("auth-open");
  const usernameInput = $("#auth-username");
  if (usernameInput) usernameInput.focus();
}

function dismissAuthScreen() {
  const overlay = $("#auth-screen");
  if (overlay) overlay.remove();
  document.body.classList.remove("auth-open");
}

async function loginAccount() {
  ensureCloudForAuth();
  const email = await resolveAuthEmail();
  const password = authPasswordValue();
  if (!email || !password) {
    toast("请输入用户名和密码");
    return;
  }
  try {
    const res = await fetch(`${cloudConfig.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: cloudConfig.key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) throw new Error(data?.error_description || data?.error || "登录失败");
    const loggedInUsername = data.user?.user_metadata?.username || (!email.includes("@") ? authUsernameValue() : "");
    if (loggedInUsername) rememberUsernameEmail(loggedInUsername, data.user?.email || email);
    writeAuthSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      user: data.user
    });
    authExpiredHandled = false;
    currentSpaceId = data.user.id;
    await migratePersonalRowToUser();
    await loadState();
    render();
    dismissAuthScreen();
    toast("登录成功");
  } catch (err) {
    toast(err.message || "登录失败");
  }
}

async function registerAccount() {
  ensureCloudForAuth();
  const email = await resolveAuthEmail();
  const username = authUsernameValue() || email.split("@")[0];
  const password = authPasswordValue();
  if (!email || !password) {
    toast("请输入用户名和密码");
    return;
  }
  if (password.length < 6) {
    toast("密码至少 6 位");
    return;
  }
  try {
    if (AUTH_HELPER_URL) {
      const helperRes = await fetch(AUTH_HELPER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", email, password, username })
      });
      const helperData = await helperRes.json().catch(() => ({}));
      if (!helperRes.ok) {
        const helperMessage = helperData?.msg || helperData?.error_description || helperData?.error || "注册服务暂时不可用";
        if (helperData?.code === 422 || helperData?.error_code === "email_exists" || /already been registered/i.test(helperMessage)) {
          toast("这个用户名已经注册，请直接登录");
          return;
        }
        throw new Error(helperMessage);
      }
    } else {
      const res = await fetch(`${cloudConfig.url}/auth/v1/signup`, {
        method: "POST",
        headers: {
          apikey: cloudConfig.key,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password,
          options: { data: { username } }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error_description || data?.error || "注册失败");
      if (data.access_token) {
        rememberUsernameEmail(username, email);
        await finishAuth(data.user.id, data.access_token, data.user, data.refresh_token, data.expires_at);
        toast("注册成功");
        return;
      }
      const userId = data.user?.id;
      if (!userId) {
        toast("注册已创建，请查收邮箱完成验证后登录");
        return;
      }
      const key = adminKey || authAdminKeyValue();
      if (!key) {
        const status = $("#auth-status");
        if (status) status.textContent = "注册已创建，请填写管理密钥完成自动确认";
        toast("请填写管理密钥完成自动确认");
        return;
      }
      const confirmRes = await fetch(`${cloudConfig.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: {
          apikey: cloudConfig.key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email_confirm: true })
      });
      const confirmData = await confirmRes.json().catch(() => ({}));
      if (!confirmRes.ok) {
        throw new Error(confirmData?.msg || confirmData?.error_description || confirmData?.error || "自动确认失败，请检查管理密钥");
      }
      saveAdminKey(key);
      rememberUsernameEmail(username, email);
    }
    const loginRes = await fetch(`${cloudConfig.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: cloudConfig.key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok || !loginData.access_token) {
      throw new Error("账号可能已存在，请直接登录，或检查密码后重试");
    }
    rememberUsernameEmail(username, email);
    await finishAuth(loginData.user.id, loginData.access_token, loginData.user, loginData.refresh_token, loginData.expires_at);
    toast("注册成功");
  } catch (err) {
    toast(err.message || "注册失败");
  }
}

async function finishAuth(userId, accessToken, user, refreshToken = "", expiresAt = 0) {
  writeAuthSession({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    user
  });
  authExpiredHandled = false;
  rememberAuthUsernameEmail();
  currentSpaceId = userId;
  await migratePersonalRowToUser();
  await loadState();
  render();
  dismissAuthScreen();
}

async function logoutAccount() {
  try {
    await saveNow();
  } catch (err) {
    // keep local data even if saving fails
  }
  clearAuthSession();
  currentSpaceId = "personal-workbench";
  await loadState();
  render();
  showAuthScreen();
  toast("已退出登录");
}

function emptyState() {
  return {
    settings: { name: "", title: "我的工作台", hideMobileNav: true, dailyPushEnabled: false, dailyPushTime: "08:00", currentScheduleSet: "", semesterStart: "", currentWeekAuto: true },
    focus: {},
    tasks: [],
    habits: [],
    checks: [],
    schedule: [],
    notes: [],
    assets: [],
    rooms: [],
    reviews: [],
    anniversaries: []
  };
}

function makeInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function ensureProjectState(projectId) {
  const rowId = `project:${projectId}`;
  const check = await cloudFetch(`${cloudTable()}?id=eq.${rowId}&select=id&limit=1`);
  const rows = check.ok ? await check.json() : [];
  if (Array.isArray(rows) && rows.length) return;
  await cloudFetch(cloudTable(), {
    method: "POST",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      id: rowId,
      revision: 0,
      state: emptyState(),
      updated_at: new Date().toISOString()
    })
  });
}

async function createProject() {
  if (!authSession) {
    toast("请先登录");
    return;
  }
  const name = $("#project-name")?.value.trim();
  if (!name) {
    toast("请输入项目名称");
    return;
  }
  try {
    const res = await cloudFetch(`${cloudConfig.url}/rest/v1/projects`, {
      method: "POST",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        name,
        owner_id: authSession.user.id,
        invite_code: makeInviteCode()
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "创建项目失败");
    const project = Array.isArray(data) ? data[0] : data;
    await ensureProjectState(project.id);
    await saveNow();
    currentSpaceId = `project:${project.id}`;
    Object.assign(state, emptyState());
    render();
    toast(`已创建项目 ${project.name}`);
  } catch (err) {
    toast(err.message || "创建项目失败");
  }
}

async function joinProject() {
  if (!authSession) {
    toast("请先登录");
    return;
  }
  const code = $("#project-code")?.value.trim().toUpperCase();
  if (!code) {
    toast("请输入邀请码");
    return;
  }
  try {
    const res = await cloudFetch(`${cloudConfig.url}/rest/v1/rpc/join_project_by_code`, {
      method: "POST",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify({ code })
    });
    const project = await res.json().catch(() => ({}));
    if (!res.ok || !project?.id) {
      if (project?.message === "INVITE_EXPIRED") throw new Error("邀请码已过期，请让项目创建者重新生成");
      throw new Error("邀请码不存在");
    }
    await ensureProjectState(project.id);
    await saveNow();
    currentSpaceId = `project:${project.id}`;
    await loadState();
    render();
    toast(`已加入项目 ${project.name}`);
  } catch (err) {
    toast(err.message || "加入项目失败");
  }
}

async function refreshProjectList() {
  const list = $("#project-list");
  if (!list) return;
  if (!authSession) {
    list.innerHTML = `<span class="panel-meta">登录后可查看项目</span>`;
    return;
  }
  const personalButton = `<button class="btn ${currentSpaceId === authSession.user.id ? "is-active" : ""}" data-action="switch-personal-space">${icon("user")}私人工作台</button>`;
  let rows = [];
  let withExpiry = false;
  try {
    const res = await cloudFetch(`${cloudConfig.url}/rest/v1/projects?select=id,name,invite_code,invite_expires_at&order=created_at`);
    const data = await res.json();
    if (!res.ok) throw new Error("读取项目失败");
    rows = Array.isArray(data) ? data : [];
    withExpiry = true;
  } catch (err) {
    try {
      const res = await cloudFetch(`${cloudConfig.url}/rest/v1/projects?select=id,name,invite_code&order=created_at`);
      const data = await res.json();
      if (!res.ok) throw new Error("读取项目失败");
      rows = Array.isArray(data) ? data : [];
    } catch (err2) {
      list.innerHTML = `${personalButton} <span class="panel-meta">${esc(err2.message || "读取项目失败")}</span>`;
      return;
    }
  }
  const projectRows = rows
    .map((project) => {
      const expiresAt = withExpiry && project.invite_expires_at ? new Date(project.invite_expires_at) : null;
      const expired = Boolean(expiresAt && expiresAt.getTime() <= Date.now());
      const remainMinutes = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : 0;
      const inviteState = project.invite_code
        ? (expired ? "已过期" : `${remainMinutes} 分钟后过期`)
        : "";
      return `
        <div class="project-row">
          <div class="project-main">
            <button class="btn ${currentSpaceId === `project:${project.id}` ? "is-active" : ""}" data-action="switch-project" data-id="${esc(project.id)}">${esc(project.name)}</button>
            <span class="project-invite">邀请码：${esc(project.invite_code || "暂无")}${inviteState ? ` · ${esc(inviteState)}` : ""}</span>
            <div class="project-actions">
              <button class="btn btn-compact" data-action="copy-project-invite" data-code="${esc(project.invite_code || "")}">${icon("link")}复制邀请码</button>
              ${withExpiry ? `<button class="btn btn-compact" data-action="regenerate-invite" data-id="${esc(project.id)}">${icon("refresh")}重新生成</button>` : ""}
            </div>
          </div>
          <button class="btn-icon btn-danger" data-action="delete-project" data-id="${esc(project.id)}" aria-label="删除项目">${icon("trash")}</button>
        </div>`;
    })
    .join(" ");
  list.innerHTML = `${personalButton} ${projectRows || `<span class="panel-meta">还没有项目</span>`}`;
}

async function switchProject(id) {
  if (!id) return;
  try {
    await saveNow();
  } catch (err) {
    // keep going even if save fails
  }
  currentSpaceId = `project:${id}`;
  await loadState();
  render();
  toast("已切换项目");
}

async function switchPersonalSpace() {
  try {
    await saveNow();
  } catch (err) {
    // keep going even if save fails
  }
  currentSpaceId = authSession?.user?.id || "personal-workbench";
  await loadState();
  render();
  toast("已切换到私人工作台");
}

async function deleteProject(id) {
  if (!id) return;
  if (!confirm("确定删除这个项目吗？项目里的共享数据会一起删除，其他成员也会失去访问权限。")) return;
  try {
    const projectRes = await cloudFetch(`${cloudConfig.url}/rest/v1/projects?id=eq.${id}`, {
      method: "DELETE"
    });
    if (!projectRes.ok && projectRes.status !== 404) throw new Error("删除项目失败");
    await cloudFetch(`${cloudTable()}?id=eq.project:${id}`, { method: "DELETE" });
    if (currentSpaceId === `project:${id}`) {
      currentSpaceId = authSession?.user?.id || "personal-workbench";
      await loadState();
    }
    render();
    toast("项目已删除");
  } catch (err) {
    toast(err.message || "删除项目失败");
  }
}

function copyProjectInvite(code) {
  if (!code) {
    toast("还没有邀请码，先重新生成");
    return;
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code).then(() => toast("邀请码已复制")).catch(() => {
      prompt("复制邀请码", code);
    });
  } else {
    prompt("复制邀请码", code);
  }
}

async function regenerateInvite(id) {
  if (!id) return;
  const code = makeInviteCode();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  try {
    const res = await cloudFetch(`${cloudConfig.url}/rest/v1/projects?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ invite_code: code, invite_expires_at: expiresAt })
    });
    if (!res.ok) throw new Error("重新生成失败");
    await refreshProjectList();
    toast("已生成新邀请码，30 分钟内有效");
  } catch (err) {
    toast(err.message || "重新生成邀请码失败");
  }
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
  state.settings = { name: state.settings.name, title: state.settings.title, hideMobileNav: true, dailyPushEnabled: false, dailyPushTime: "08:00", currentScheduleSet: "", semesterStart: "", currentWeekAuto: true };
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
  state.anniversaries = [];
  scheduleSave();
  render();
  toast("数据已清空");
}

function clearPageData(page) {
  const map = {
    tasks: { key: "tasks", label: "全部待办" },
    habits: { key: "habits", label: "全部习惯" },
    schedule: { key: "schedule", label: "当前课表" },
    notes: { key: "notes", label: "全部记录" },
    assets: { key: "assets", label: "全部资料图片" },
    rooms: { key: "rooms", label: "全部空教室记录" },
    reviews: { key: "reviews", label: "全部复盘" },
    anniversaries: { key: "anniversaries", label: "全部纪念日" }
  };
  const target = map[page];
  if (!target) return;
  if (page === "schedule" && scheduleSemester) {
    if (!confirm(`确定清空课表“${scheduleSemester}”吗？其他课表不受影响。`)) return;
    state.schedule = state.schedule.filter((item) => item.semester !== scheduleSemester);
    scheduleSave();
    render();
    toast(`课表“${scheduleSemester}”已清空`);
    return;
  }
  if (!confirm(`确定清空${target.label}吗？此操作不可撤销。`)) return;
  state[target.key] = [];
  scheduleSave();
  render();
  toast(`${target.label}已清空`);
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
  if (action === "goto-daily") {
    currentView = "daily";
    render(true);
    return;
  }
  if (action === "shift-quote") return shiftDailyQuote();
  if (action === "refresh-daily-news") {
    const body = $("#daily-news-body");
    if (body) body.innerHTML = `<div class="empty-note">正在刷新新闻…</div>`;
    fetchDailyNews(true).then((data) => {
      const target = $("#daily-news-body");
      if (!target) return;
      if (data) {
        target.innerHTML = dailyNewsListHtml(data);
        toast("新闻已更新");
      } else {
        target.innerHTML = `<div class="empty-note">刷新失败，请稍后再试。</div>`;
        toast("刷新失败，请稍后再试");
      }
    });
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
  if (action === "new-schedule-set") {
    const name = prompt("给新课表起个名字", "");
    if (!name || !name.trim()) return;
    setScheduleSet(name.trim());
    scheduleSave();
    render();
    toast(`已新建空白课表：${name.trim()}`);
    return;
  }
  if (action === "open-room-screenshot") {
    $("#room-screenshot").click();
    return;
  }
  if (action === "close-room-screenshot") return closeRoomScreenshot();
  if (action === "run-room-ai") return recognizeRoomScreenshot();
  if (action === "save-room-shot") return saveRoomShot();
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
    if (importTab === "file" && !importFileText) {
      if (!pendingImport.length) toast("请先选择课表文件");
    } else {
      const textarea = $("#import-text");
      const raw = importTab === "file" ? importFileText : textarea ? textarea.value : importDraft;
      pendingImport = parseImportText(raw, importTab === "csv" ? "csv" : "html");
      if (!pendingImport.length) toast("没有识别到课程，请确认复制的是课表表格或 CSV 格式");
      if (pendingImport[0]?.semester) importSetName = pendingImport[0].semester;
    }
    rerenderImport();
    return;
  }
  if (action === "set-school") return setScheduleSchool(el.dataset.school);
  if (action === "load-hit-sample") return loadHitSample();
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
  if (action === "save-schedule-name") return saveScheduleName();
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
  if (action === "apply-room-filter") return applyRoomFilter();
  if (action === "set-room-all-day") return setRoomAllDay();
  if (action === "goto-rooms-all-day") return gotoRoomsAllDay();
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
  if (action === "save-anniversary") return saveAnniversary();
  if (action === "edit-anniversary") return startEditAnniversary(id);
  if (action === "delete-anniversary") return deleteAnniversary(id);
  if (action === "toggle-anniv-day-text") return toggleAnniversaryDayText(id);
  if (action === "choose-anniv-image") {
    $("#anniv-image")?.click();
    return;
  }
  if (action === "clear-anniv-image") {
    anniversaryImageUrl = "";
    render();
    return;
  }
  if (action === "cancel-anniversary") {
    editingAnniversaryId = null;
    render();
    return;
  }
  if (action === "save-settings") return saveSettings();
  if (action === "save-ai") return saveAIConfig();
  if (action === "login-account") return loginAccount();
  if (action === "register-account") return registerAccount();
  if (action === "logout-account") return logoutAccount();
  if (action === "save-admin-key") return saveAdminKeySetting();
  if (action === "dismiss-auth") return dismissAuthScreen();
  if (action === "create-project") return createProject();
  if (action === "join-project") return joinProject();
  if (action === "refresh-projects") return refreshProjectList();
  if (action === "switch-project") return switchProject(id);
  if (action === "switch-personal-space") return switchPersonalSpace();
  if (action === "delete-project") return deleteProject(id);
  if (action === "copy-project-invite") return copyProjectInvite(el.dataset.code);
  if (action === "regenerate-invite") return regenerateInvite(id);
  if (action === "save-cloud") return saveCloud();
  if (action === "clear-cloud") return clearCloud();
  if (action === "enable-notifications") return enableNotifications();
  if (action === "test-notification") return testNotification();
  if (action === "save-daily-push") return saveDailyPush();
  if (action === "check-update") return checkForUpdate();
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
  if (action === "clear-page") return clearPageData(el.dataset.page);
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
    const lowerName = file.name.toLowerCase();
    const buffer = await file.arrayBuffer();
    const signature = new Uint8Array(buffer.slice(0, 8));
    const isOle = signature[0] === 0xd0 && signature[1] === 0xcf && signature[2] === 0x11 && signature[3] === 0xe0;
    if (lowerName.endsWith(".xls") || lowerName.endsWith(".xlsx")) {
      const parsed = parseXlsSchedule(buffer, file.name);
      if (parsed.courses?.length || parsed.error || isOle) {
        importFileText = "";
        importFileName = file.name;
        pendingImport = parsed.courses || [];
        if (parsed.semester) importSetName = parsed.semester;
        rerenderImport();
        if (parsed.error) toast(parsed.error);
        else if (!pendingImport.length) toast("没有识别到课程，请确认是学生课表文件");
        return;
      }
    }
    const reader = new FileReader();
    reader.onload = () => {
      importFileText = String(reader.result || "");
      importFileName = file.name;
      pendingImport = parseImportText(
        importFileText,
        file.name.toLowerCase().endsWith(".csv") ? "csv" : "html"
      );
      if (pendingImport[0]?.semester) importSetName = pendingImport[0].semester;
      rerenderImport();
      if (!pendingImport.length) toast("没有识别到课程，请换一个文件");
    };
    reader.readAsText(file);
    return;
  }
  if (event.target.id === "room-screenshot") {
    const file = event.target.files[0];
    if (file) openRoomScreenshot(file);
    event.target.value = "";
    return;
  }
  if (event.target.id === "current-week") {
    state.settings.currentWeekAuto = event.target.value === "";
    state.settings.currentWeek = event.target.value ? Number(event.target.value) : 0;
    scheduleSave();
    render();
    return;
  }
  if (event.target.id === "semester-filter") {
    setScheduleSet(event.target.value);
    scheduleSave();
    render();
    return;
  }
  if (event.target.id === "asset-image") {
    uploadAssetFiles(event.target.files);
    event.target.value = "";
    return;
  }
  if (event.target.id === "anniv-image") {
    const file = event.target.files[0];
    if (!file) return;
    setSync("syncing");
    uploadImage(file)
      .then((url) => {
        anniversaryImageUrl = url;
        setSync("synced");
        render();
        toast("纪念日图片已上传");
      })
      .catch(() => {
        setSync("offline");
        toast("图片上传失败，请重试");
      });
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
migrateLegacyLocalState();
loadState();
startPolling();
refreshNotificationPermission();
rememberAuthUsernameEmail();
if (!authSession) {
  setTimeout(showAuthScreen, 1700);
}
