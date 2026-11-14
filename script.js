
"use strict";

/* =========================================
   SECURITY SHIFT TERMINAL - VERSION 3.1
   ========================================= */

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "securityShiftTerminalV3";

let settings = {
  start: "",
  end: "",
  rate: 34,
  patrolEnabled: true,
  reportEnabled: true,
  soundEnabled: true
};

let voiceEnabled = false;
let lastPatrolKey = "";
let lastReportKey = "";
let lastShiftStartKey = "";
let toastTimeout = null;
let lastMinuteChecked = "";
let lastHourlyAnnouncement = "";

const formatter = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/* ---------- ZAPIS I ODCZYT ---------- */

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      settings = { ...settings, ...JSON.parse(saved) };
    }
  } catch (error) {
    console.warn("Nie udało się odczytać ustawień:", error);
  }

  $("shiftStart").value = settings.start || "";
  $("shiftEnd").value = settings.end || "";
  $("hourlyRate").value = settings.rate ?? 34;
  $("patrolToggle").checked = settings.patrolEnabled !== false;
  $("reportToggle").checked = settings.reportEnabled !== false;

  updateSettingsStatus();
}

function saveSettings() {
  settings.start = $("shiftStart").value;
  settings.end = $("shiftEnd").value;
  settings.rate = Math.max(0, Number($("hourlyRate").value) || 0);
  settings.patrolEnabled = $("patrolToggle").checked;
  settings.reportEnabled = $("reportToggle").checked;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Nie udało się zapisać ustawień:", error);
  }

  lastPatrolKey = "";
  lastReportKey = "";

  $("saveMessage").textContent = "USTAWIENIA ZAPISANE";
  showToast("Ustawienia służby zostały zapisane.");
  updateSettingsStatus();

  setTimeout(() => {
    $("saveMessage").textContent = "";
  }, 3000);

  updateInterface();
}

function updateSettingsStatus() {
  const anyReminder = settings.patrolEnabled || settings.reportEnabled;
  $("reminderStatus").textContent = anyReminder ? "AKTYWNE" : "WYŁĄCZONE";
  $("reminderStatus").style.color = anyReminder ? "#51d6a0" : "#8295a8";
}

/* ---------- CZAS I FORMATOWANIE ---------- */

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function isValidShift() {
  if (!settings.start || !settings.end) return false;

  const start = new Date(settings.start).getTime();
  const end = new Date(settings.end).getTime();

  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

function getShiftTimes() {
  if (!isValidShift()) return null;

  return {
    start: new Date(settings.start).getTime(),
    end: new Date(settings.end).getTime()
  };
}

function isShiftActive(now = Date.now()) {
  const shift = getShiftTimes();
  return shift && now >= shift.start && now < shift.end;
}

/* ---------- ZEGAR ---------- */

function updateClock() {
  const now = new Date();

  $("currentClock").textContent = now.toLocaleTimeString("pl-PL", {
    hour12: false
  });

  $("currentDate").textContent = now.toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  $("footerTime").textContent =
    "SYSTEM TIME: " + now.toLocaleTimeString("pl-PL", { hour12: false });
}

/* ---------- LICZNIK SŁUŻBY ---------- */

function updateTimer(now = Date.now()) {
  const shift = getShiftTimes();

  if (!shift) {
    setCountdown(0, 0, 0, 0);
    $("shiftStatus").textContent = "SKONFIGURUJ GODZINY SŁUŻBY";
    $("shiftStatusDot").classList.remove("active");
    $("progressText").textContent = "0%";
    $("progressFill").style.width = "0%";
    $("startDisplay").textContent = "--:--";
    $("endDisplay").textContent = "--:--";
    $("durationDisplay").textContent = "--";
    $("workedDisplay").textContent = "0h 00m";
    $("earnings").textContent = formatter.format(0);
    return;
  }

  const { start, end } = shift;
  const total = end - start;
  const remaining = Math.max(0, end - now);
  const worked = Math.max(0, Math.min(now, end) - start);
  const parts = formatDuration(remaining);
  const progress = Math.min(100, Math.max(0, (worked / total) * 100));

  setCountdown(parts.days, parts.hours, parts.minutes, parts.seconds);

  $("startDisplay").textContent = new Date(start).toLocaleTimeString("pl-PL", {
    hour: "2-digit", minute: "2-digit"
  });
  $("endDisplay").textContent = new Date(end).toLocaleTimeString("pl-PL", {
    hour: "2-digit", minute: "2-digit"
  });

  $("durationDisplay").textContent = `${Math.floor(total / 3600000)}h ${Math.floor((total % 3600000) / 60000)}m`;
  $("workedDisplay").textContent = `${Math.floor(worked / 3600000)}h ${pad(Math.floor((worked % 3600000) / 60000))}m`;
  $("progressText").textContent = `${progress.toFixed(1).replace(".", ",")}%`;
  $("progressFill").style.width = `${progress}%`;

  const earnings = (worked / 3600000) * Number(settings.rate || 0);
  $("earnings").textContent = formatter.format(earnings);
  $("rateDisplay").textContent = formatter.format(Number(settings.rate || 0)) + " zł";

  if (now < start) {
    $("shiftStatus").textContent = "SŁUŻBA JESZCZE SIĘ NIE ROZPOCZĘŁA";
    $("shiftStatusDot").classList.remove("active");
  } else if (now < end) {
    $("shiftStatus").textContent = "SŁUŻBA AKTYWNA";
    $("shiftStatusDot").classList.add("active");
  } else {
    $("shiftStatus").textContent = "SŁUŻBA ZAKOŃCZONA";
    $("shiftStatusDot").classList.remove("active");
    setCountdown(0, 0, 0, 0);
  }
}

function setCountdown(days, hours, minutes, seconds) {
  $("days").textContent = pad(days);
  $("hours").textContent = pad(hours);
  $("minutes").textContent = pad(minutes);
  $("seconds").textContent = pad(seconds);
}

/* ---------- POWIADOMIENIA ---------- */

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 4200);
}

function playNotificationSound() {
  if (!settings.soundEnabled) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.setValueAtTime(880, context.currentTime + 0.12);

    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start();
    oscillator.stop(context.currentTime + 0.46);
    oscillator.onended = () => context.close();
  } catch (error) {
    console.warn("Dźwięk niedostępny:", error);
  }
}

function sendBrowserNotification(title, message) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification(title, {
      body: message,
      icon: ""
    });
  }
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    showToast("Ta przeglądarka nie obsługuje powiadomień.");
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      showToast("Powiadomienia przeglądarki aktywowane.");
    } else {
      showToast("Powiadomienia nie zostały włączone.");
    }
  } catch (error) {
    showToast("Nie udało się włączyć powiadomień.");
  }
}

/* ---------- ASYSTENT GŁOSOWY ---------- */

function speak(message) {
  if (!voiceEnabled || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "pl-PL";
  utterance.rate = 0.94;
  utterance.pitch = 0.9;
  utterance.volume = 1;

  const voices = window.speechSynthesis.getVoices();
  const polishVoice = voices.find(voice => voice.lang.toLowerCase().startsWith("pl"));

  if (polishVoice) utterance.voice = polishVoice;

  window.speechSynthesis.speak(utterance);
}

function activateVoice() {
  if (!("speechSynthesis" in window)) {
    showToast("Ta przeglądarka nie obsługuje syntezy mowy.");
    return;
  }

  voiceEnabled = !voiceEnabled;

  if (voiceEnabled) {
    $("voiceBtn").innerHTML = 'WYŁĄCZ GŁOS <span>◖</span>';
    $("voiceStatus").textContent = "AKTYWNY";
    $("voiceStatus").style.color = "#51d6a0";
    $("assistantMessage").textContent = "Asystent głosowy został uruchomiony. Jestem gotowy do działania.";
    speak("Robo Security aktywny. Witaj na służbie.");
    showToast("Asystent głosowy aktywowany.");
  } else {
    window.speechSynthesis.cancel();
    $("voiceBtn").innerHTML = 'URUCHOM GŁOS <span>◖</span>';
    $("voiceStatus").textContent = "GOTOWY";
    $("voiceStatus").style.color = "";
    $("assistantMessage").textContent = "Asystent głosowy jest wyłączony. Możesz go ponownie uruchomić.";
    showToast("Asystent głosowy wyłączony.");
  }
}

function testVoice() {
  const message = "Test systemu Robo Security. Łączność głosowa działa prawidłowo.";
  $("assistantMessage").textContent = message;

  if (!voiceEnabled) {
    showToast("Najpierw uruchom asystenta głosowego.");
    return;
  }

  speak(message);
}

/* ---------- PRZYPOMNIENIA GODZINOWE ---------- */

function announceReminder(type, hourKey) {
  if (type === "patrol") {
    const message = "Przypomnienie. Czas na obchód lub patrol.";
    $("assistantMessage").textContent = message;
    showToast("PRZYPOMNIENIE: czas na obchód / patrol.");
    sendBrowserNotification("SECURITY SHIFT TERMINAL", message);
    playNotificationSound();
    speak(message);
    lastPatrolKey = hourKey;
  }

  if (type === "report") {
    const message = "Przypomnienie. Czas na raport obecności.";
    $("assistantMessage").textContent = message;
    showToast("PRZYPOMNIENIE: raport obecności.");
    sendBrowserNotification("SECURITY SHIFT TERMINAL", message);
    playNotificationSound();
    speak(message);
    lastReportKey = hourKey;
  }
}

function checkShiftStart(now, shift) {
  if (!shift || now < shift.start || now >= shift.end) return;

  const key = new Date(shift.start).toISOString();

  if (lastShiftStartKey !== key) {
    lastShiftStartKey = key;
    const message = "Rozpoczęła się zaplanowana służba. Powodzenia.";
    $("assistantMessage").textContent = message;
    speak(message);
  }
}

function checkPatrolReminders(now) {
  const shift = getShiftTimes();
  if (!shift || now < shift.start || now >= shift.end) return;

  const date = new Date(now);
  const minute = date.getMinutes();
  const hourKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;

  // Raport obecności: pełna godzina.
  if (settings.reportEnabled && minute === 0 && lastReportKey !== hourKey) {
    announceReminder("report", hourKey);
  }

  // Obchód: pięć minut po pełnej godzinie.
  if (settings.patrolEnabled && minute === 5 && lastPatrolKey !== hourKey) {
    announceReminder("patrol", hourKey);
  }
}

/* ---------- OBSŁUGA INTERFEJSU ---------- */

function clearShift() {
  if (!confirm("Czy na pewno wyczyścić ustawienia bieżącej służby?")) return;

  settings.start = "";
  settings.end = "";

  $("shiftStart").value = "";
  $("shiftEnd").value = "";

  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

  lastPatrolKey = "";
  lastReportKey = "";
  lastShiftStartKey = "";

  updateInterface();
  showToast("Ustawienia służby zostały wyczyszczone.");
}

function updateInterface() {
  updateClock();
  updateTimer();
  updateSettingsStatus();
}

function initializeNavigation() {
  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach(item => item.classList.remove("active"));
      link.classList.add("active");
    });
  });
}

function initializeFullscreen() {
  $("fullscreenBtn").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      showToast("Pełny ekran jest niedostępny.");
    }
  });
}

function initializeEvents() {
  $("saveShift").addEventListener("click", () => {
    const start = $("shiftStart").value;
    const end = $("shiftEnd").value;

    if (!start || !end) {
      showToast("Uzupełnij datę rozpoczęcia i zakończenia.");
      return;
    }

    if (new Date(end).getTime() <= new Date(start).getTime()) {
      showToast("Koniec służby musi być późniejszy niż jej rozpoczęcie.");
      return;
    }

    saveSettings();
  });

  $("clearShift").addEventListener("click", clearShift);

  $("patrolToggle").addEventListener("change", () => {
    settings.patrolEnabled = $("patrolToggle").checked;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    updateSettingsStatus();
    showToast(settings.patrolEnabled ? "Przypomnienie o obchodach włączone." : "Przypomnienie o obchodach wyłączone.");
  });

  $("reportToggle").addEventListener("change", () => {
    settings.reportEnabled = $("reportToggle").checked;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    updateSettingsStatus();
    showToast(settings.reportEnabled ? "Przypomnienie o raporcie włączone." : "Przypomnienie o raporcie wyłączone.");
  });

  $("voiceBtn").addEventListener("click", activateVoice);
  $("testVoiceBtn").addEventListener("click", testVoice);

  initializeFullscreen();
  initializeNavigation();

  // Pierwsze kliknięcie w terminal może aktywować zgodę na powiadomienia.
  document.addEventListener("click", function askForNotifications() {
    if ("Notification" in window && Notification.permission === "default") {
      requestNotificationPermission();
    }
    document.removeEventListener("click", askForNotifications);
  }, { once: true });
}

/* ---------- START SYSTEMU ---------- */

function startTerminal() {
  loadSettings();
  initializeEvents();

  updateInterface();

  setInterval(() => {
    const now = Date.now();
    updateClock();
    updateTimer(now);

    const currentMinute = Math.floor(now / 60000);
    const minuteKey = String(currentMinute);

    if (minuteKey !== lastMinuteChecked) {
      lastMinuteChecked = minuteKey;
      checkPatrolReminders(now);
      checkShiftStart(now, getShiftTimes());
    }
  }, 1000);

  // Pierwsze sprawdzenie po uruchomieniu strony.
  const now = Date.now();
  checkShiftStart(now, getShiftTimes());

  console.log("SECURITY SHIFT TERMINAL 3.1: SYSTEM ONLINE");
}

document.addEventListener("DOMContentLoaded", startTerminal);
