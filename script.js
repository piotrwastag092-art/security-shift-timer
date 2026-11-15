
"use strict";

/* ==========================================
   SECURITY SHIFT TERMINAL 3.3
   COMMANDER 01 / LIVE ENGINE
========================================== */

const STORAGE_KEY = "securityShiftTerminalV33";
const HUMOR_HISTORY_KEY = "securityShiftTerminalHumorHistoryV1";

const $ = id => document.getElementById(id);

const el = {
  clock: $("currentClock"),
  date: $("currentDate"),
  days: $("days"),
  hours: $("hours"),
  minutes: $("minutes"),
  seconds: $("seconds"),
  progressText: $("progressText"),
  progressFill: $("progressFill"),
  startDisplay: $("startDisplay"),
  endDisplay: $("endDisplay"),
  durationDisplay: $("durationDisplay"),
  earnings: $("earnings"),
  rateDisplay: $("rateDisplay"),
  workedDisplay: $("workedDisplay"),
  shiftStart: $("shiftStart"),
  shiftEnd: $("shiftEnd"),
  hourlyRate: $("hourlyRate"),
  saveShift: $("saveShift"),
  clearShift: $("clearShift"),
  patrolToggle: $("patrolToggle"),
  reportToggle: $("reportToggle"),
  humorToggle: $("humorToggle"),
  timeToggle: $("timeToggle"),
  voiceBtn: $("voiceBtn"),
  testVoiceBtn: $("testVoiceBtn"),
  assistantMessage: $("assistantMessage"),
  voiceStatus: $("voiceStatus"),
  voiceIndicator: $("voiceIndicator"),
  shiftStatus: $("shiftStatus"),
  settingsMessage: $("settingsMessage"),
  systemStatus: $("systemStatus"),
  fullscreenBtn: $("fullscreenBtn")
};

let shift = {
  start: null,
  end: null,
  rate: 34
};

let voiceEnabled = false;
let selectedVoice = null;
let speechQueue = [];
let isSpeaking = false;

let lastElapsedHour = 0;
let lastReminderMinute = "";
let lastShiftState = "initial";
let lastRandomMessage = "";
let nextRandomAt = 0;
let previousRemaining = null;
let shiftEndAnnounced = false;

let playedFunnyMessages = [];

const announcedMilestones = new Set();

/* ==========================================
   HUMOR MESSAGES
========================================== */

const funnyMessages = [
  // ŻYCIE NA POSTERUNKU
  "Operatorze, wykryto krytyczny niedobór kofeiny. Zalecam natychmiastową interwencję w postaci kawy.",
  "Kawa została uznana za oficjalny element wyposażenia stanowiska.",
  "Status posterunku: spokojnie. Podejrzanie spokojnie. Zachowujemy czujność.",
  "System informuje, że krzesło nadal działa prawidłowo. Operator również, choć wymaga dalszej obserwacji.",
  "Wykryto wzmożoną aktywność operatora w kierunku ekspresu do kawy.",
  "Kolejna godzina służby za nami. System sugeruje dumę i ewentualnie kawę.",
  "Nie odnotowano zagrożeń. Odnotowano natomiast wyraźną potrzebę odpoczynku.",

  // NOCNA SŁUŻBA
  "Jest już ta godzina, kiedy nawet drukarka brzmi podejrzanie.",
  "Nocna zmiana trwa. Ktoś musi pilnować, żeby budynek nie uciekł.",
  "Wykryto ciszę na obiekcie. Niepokojące, ale zgodne z planem.",
  "Jeśli słyszysz dziwne dźwięki, najpierw sprawdź, czy to nie klimatyzacja.",
  "Noc jest młoda. Operator trochę mniej.",
  "System podtrzymuje gotowość operacyjną. Operator może wspomóc się kawą."
];

const hourMessages = [
  "Za Tobą już {hourPhrase} służby. Do zakończenia pozostało {remaining}.",
  "Raport czasowy. Przepracowano {hourPhrase}. Pozostały czas: {remaining}.",
  "Operatorze, kolejny etap za nami. Za Tobą {hourPhrase} służby. Do końca zmiany: {remaining}.",
  "Aktualizacja systemowa. Za Tobą {hourPhrase} służby. Pozostało {remaining}."
];

const milestones = [
  {
    key: "3h",
    ms: 3 * 60 * 60 * 1000,
    text: "Zostały trzy godziny do zakończenia służby. Ostatnia prosta powoli się rozpoczyna."
  },
  {
    key: "2h",
    ms: 2 * 60 * 60 * 1000,
    text: "Zostały dwie godziny do końca. Operatorze, utrzymuj gotowość. Meta jest już blisko."
  },
  {
    key: "1h",
    ms: 60 * 60 * 1000,
    text: "Pozostała ostatnia godzina służby. System odlicza końcowy etap."
  },
  {
    key: "15m",
    ms: 15 * 60 * 1000,
    text: "Pozostało piętnaście minut do zakończenia służby. Przygotuj się do przekazania stanowiska."
  }
];

/* ==========================================
   DATA AND TIME HELPERS
========================================== */

function pad(value) {
  return String(value).padStart(2, "0");
}

function validDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isValidShift() {
  return validDate(shift.start) &&
    validDate(shift.end) &&
    shift.end.getTime() > shift.start.getTime();
}

function shiftIsActive() {
  if (!isValidShift()) return false;

  const now = Date.now();

  return now >= shift.start.getTime() &&
    now < shift.end.getTime();
}

function formatDateTime(date) {
  if (!validDate(date)) return "---";

  return date.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${pad(minutes)}m`;
  }

  return `${hours}h ${pad(minutes)}m`;
}

/* ==========================================
   POLISH GRAMMAR ENGINE
========================================== */

// Poprawna odmiana liczebników w języku polskim.
function polishQuantity(value, forms) {
  const number = Math.abs(value);
  const lastDigit = number % 10;
  const lastTwoDigits = number % 100;

  if (number === 1) {
    return `${number} ${forms[0]}`;
  }

  if (
    lastDigit >= 2 &&
    lastDigit <= 4 &&
    !(lastTwoDigits >= 12 && lastTwoDigits <= 14)
  ) {
    return `${number} ${forms[1]}`;
  }

  return `${number} ${forms[2]}`;
}

// Naturalny zapis pozostałego czasu do końca służby.
function formatRemaining(milliseconds) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000));

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const hoursText = polishQuantity(
    hours,
    ["godzina", "godziny", "godzin"]
  );

  const minutesText = polishQuantity(
    minutes,
    ["minuta", "minuty", "minut"]
  );

  if (hours === 0) {
    return minutesText;
  }

  if (minutes === 0) {
    return hoursText;
  }

  return `${hoursText} i ${minutesText}`;
}

function formatMoney(value) {
  return value.toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " zł";
}

function toLocalInput(date) {
  const offset = date.getTimezoneOffset();

  return new Date(date.getTime() - offset * 60000)
    .toISOString()
    .slice(0, 16);
}

/* ==========================================
   LOCAL STORAGE
========================================== */

function saveSettings() {
  const data = {
    start: validDate(shift.start) ? shift.start.toISOString() : null,
    end: validDate(shift.end) ? shift.end.toISOString() : null,
    rate: shift.rate,
    patrol: el.patrolToggle.checked,
    report: el.reportToggle.checked,
    humor: el.humorToggle.checked,
    time: el.timeToggle.checked
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Nie udało się zapisać ustawień:", error);
  }
}

function loadSettings() {
  let saved = {};

  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch (error) {
    console.warn("Nie udało się odczytać ustawień:", error);
  }

  const start = saved.start ? new Date(saved.start) : null;
  const end = saved.end ? new Date(saved.end) : null;

  shift.start = validDate(start) ? start : null;
  shift.end = validDate(end) ? end : null;

  const rate = Number(saved.rate);
  shift.rate = Number.isFinite(rate) && rate >= 0 ? rate : 34;

  el.shiftStart.value = shift.start ? toLocalInput(shift.start) : "";
  el.shiftEnd.value = shift.end ? toLocalInput(shift.end) : "";
  el.hourlyRate.value = shift.rate;

  el.patrolToggle.checked = saved.patrol === true;
  el.reportToggle.checked = saved.report === true;
  el.humorToggle.checked = saved.humor !== false;
  el.timeToggle.checked = saved.time !== false;

  if (shiftIsActive()) {
    lastElapsedHour = Math.floor(
      (Date.now() - shift.start.getTime()) / 3600000
    );
    lastShiftState = "active";
  } else {
    lastElapsedHour = 0;
    lastShiftState = "initial";
  }

  if (isValidShift()) {
    previousRemaining = shift.end.getTime() - Date.now();
  }
}

function loadHumorHistory() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(HUMOR_HISTORY_KEY) || "{}"
    );

    if (Array.isArray(saved.played)) {
      playedFunnyMessages = saved.played.filter(index =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < funnyMessages.length
      );
    } else {
      playedFunnyMessages = [];
    }
  } catch (error) {
    console.warn("Nie udało się wczytać historii humoru:", error);
    playedFunnyMessages = [];
  }
}

function saveHumorHistory() {
  try {
    localStorage.setItem(
      HUMOR_HISTORY_KEY,
      JSON.stringify({
        played: playedFunnyMessages
      })
    );
  } catch (error) {
    console.warn("Nie udało się zapisać historii humoru:", error);
  }
}

/* ==========================================
   UI MESSAGES
========================================== */

function showMessage(message) {
  if (el.assistantMessage) {
    el.assistantMessage.textContent = "COMMANDER 01: " + message;
  }
}

function setSettingsMessage(message, isError = false) {
  el.settingsMessage.textContent = message;
  el.settingsMessage.style.color = isError ? "#ff7379" : "";
}

/* ==========================================
   SHIFT CONFIGURATION
========================================== */

function resetShiftTracking() {
  lastElapsedHour = shiftIsActive()
    ? Math.floor((Date.now() - shift.start.getTime()) / 3600000)
    : 0;

  lastReminderMinute = "";
  lastShiftState = shiftIsActive() ? "active" : "initial";
  shiftEndAnnounced = false;
  previousRemaining = isValidShift()
    ? shift.end.getTime() - Date.now()
    : null;

  announcedMilestones.clear();
  nextRandomAt = 0;
  lastRandomMessage = "";
}

function saveShift() {
  const startValue = el.shiftStart.value;
  const endValue = el.shiftEnd.value;
  const rateValue = Number(el.hourlyRate.value);

  if (!startValue || !endValue) {
    setSettingsMessage(
      "Uzupełnij datę i godzinę rozpoczęcia oraz zakończenia.",
      true
    );
    return;
  }

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (!validDate(start) || !validDate(end) || end <= start) {
    setSettingsMessage(
      "Data zakończenia musi przypadać po rozpoczęciu służby.",
      true
    );
    return;
  }

  if (!Number.isFinite(rateValue) || rateValue < 0) {
    setSettingsMessage("Podaj prawidłową stawkę godzinową.", true);
    return;
  }

  shift = {
    start,
    end,
    rate: rateValue
  };

  resetShiftTracking();
  saveSettings();
  render();

  setSettingsMessage("Ustawienia zapisane. Terminal jest gotowy.");
  showMessage("Konfiguracja służby została zaktualizowana, operatorze.");

  if (voiceEnabled) {
    enqueueSpeech(
      "Nowy harmonogram służby został zapisany. System gotowy.",
      3
    );
  }
}

function clearShift() {
  shift = {
    start: null,
    end: null,
    rate: 34
  };

  el.shiftStart.value = "";
  el.shiftEnd.value = "";
  el.hourlyRate.value = "34";

  resetShiftTracking();
  saveSettings();
  render();

  setSettingsMessage("Dane służby zostały wyczyszczone.");
  showMessage("Dane służby usunięte. Oczekuję na nową konfigurację.");

  if (voiceEnabled) {
    enqueueSpeech("Harmonogram został wyczyszczony.", 3);
  }
}

/* ==========================================
   LIVE CLOCK
========================================== */

function updateClock() {
  const now = new Date();

  el.clock.textContent = now.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  el.date.textContent = now.toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).toUpperCase();
}

/* ==========================================
   LIVE COUNTDOWN AND EARNINGS
========================================== */

function render() {
  const now = Date.now();

  updateClock();

  if (!isValidShift()) {
    el.days.textContent = "00";
    el.hours.textContent = "00";
    el.minutes.textContent = "00";
    el.seconds.textContent = "00";

    el.progressText.textContent = "0%";
    el.progressFill.style.width = "0%";

    el.startDisplay.textContent = "---";
    el.endDisplay.textContent = "---";
    el.durationDisplay.textContent = "---";

    el.earnings.textContent = "0,00 zł";
    el.rateDisplay.textContent = `${shift.rate.toFixed(2)} zł/h`;
    el.workedDisplay.textContent = "0h 00m";

    el.shiftStatus.textContent = "NIEAKTYWNA";
    el.systemStatus.textContent = "GOTOWY";

    return;
  }

  const start = shift.start.getTime();
  const end = shift.end.getTime();
  const total = end - start;

  const elapsed = Math.max(0, Math.min(now - start, total));
  const remaining = Math.max(0, end - now);

  const totalSeconds = Math.ceil(remaining / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const progress = Math.max(0, Math.min(100, (elapsed / total) * 100));

  el.days.textContent = pad(days);
  el.hours.textContent = pad(hours);
  el.minutes.textContent = pad(minutes);
  el.seconds.textContent = pad(seconds);

  el.progressText.textContent = `${progress.toFixed(1)}%`;
  el.progressFill.style.width = `${progress}%`;

  el.startDisplay.textContent = formatDateTime(shift.start);
  el.endDisplay.textContent = formatDateTime(shift.end);
  el.durationDisplay.textContent = formatDuration(total);

  el.workedDisplay.textContent = formatDuration(elapsed);
  el.rateDisplay.textContent = `${shift.rate.toFixed(2)} zł/h`;

  const earnings = (elapsed / 3600000) * shift.rate;
  el.earnings.textContent = formatMoney(earnings);

  if (now < start) {
    el.shiftStatus.textContent = "OCZEKIWANIE";
    el.systemStatus.textContent = "GOTOWY";
  } else if (now < end) {
    el.shiftStatus.textContent = "AKTYWNA";
    el.systemStatus.textContent = "MONITORING";
  } else {
    el.shiftStatus.textContent = "ZAKOŃCZONA";
    el.systemStatus.textContent = "GOTOWY";
  }
}

/* ==========================================
   SPEECH VOICE ENGINE
========================================== */

function getPolishVoice() {
  if (!("speechSynthesis" in window)) return null;

  const voices = speechSynthesis.getVoices();

  if (!voices.length) return null;

  const polishVoices = voices.filter(voice =>
    voice.lang && voice.lang.toLowerCase().startsWith("pl")
  );

  if (!polishVoices.length) return voices[0] || null;

  const preferredNames = [
    /microsoft.*polish/i,
    /google.*polish/i,
    /polish/i,
    /paulina/i,
    /marek/i,
    /ewa/i,
    /zosia/i
  ];

  for (const pattern of preferredNames) {
    const match = polishVoices.find(voice => pattern.test(voice.name));
    if (match) return match;
  }

  return polishVoices[0];
}

function refreshVoices() {
  selectedVoice = getPolishVoice();
}

if ("speechSynthesis" in window) {
  refreshVoices();
  speechSynthesis.addEventListener("voiceschanged", refreshVoices);
}

function updateVoiceUI() {
  el.voiceStatus.textContent = voiceEnabled ? "AKTYWNY" : "OCZEKUJE";
  el.voiceIndicator.classList.toggle("active", voiceEnabled);
  el.voiceBtn.textContent = voiceEnabled ? "WYŁĄCZ GŁOS" : "AKTYWUJ GŁOS";
}

function activateVoice() {
  if (!("speechSynthesis" in window)) {
    showMessage("Ta przeglądarka nie obsługuje syntezy mowy.");
    return;
  }

  voiceEnabled = !voiceEnabled;

  if (voiceEnabled) {
    refreshVoices();
    updateVoiceUI();

    showMessage("Kanał głosowy aktywny. COMMANDER 01 melduje gotowość.");

    enqueueSpeech(
      "COMMANDER 01 online. Operatorze, kanał komunikacyjny został aktywowany.",
      3
    );

    if (el.humorToggle.checked && shiftIsActive()) {
      scheduleRandomMessage();
    } else {
      nextRandomAt = 0;
    }
  } else {
    speechQueue = [];
    speechSynthesis.cancel();
    isSpeaking = false;
    nextRandomAt = 0;

    updateVoiceUI();
    showMessage("Kanał głosowy wyłączony. Liczniki i przypomnienia nadal działają.");
  }
}

function enqueueSpeech(message, priority = 1) {
  if (!voiceEnabled || !message) return;

  if (priority >= 2) {
    speechQueue = speechQueue.filter(item => item.priority >= priority);
  }

  speechQueue.push({
    text: message,
    priority
  });

  speechQueue.sort((a, b) => b.priority - a.priority);

  processSpeechQueue();
}

function processSpeechQueue() {
  if (!voiceEnabled || isSpeaking || speechQueue.length === 0) return;
  if (!("speechSynthesis" in window)) return;

  const item = speechQueue.shift();
  const utterance = new SpeechSynthesisUtterance(item.text);

  selectedVoice = selectedVoice || getPolishVoice();

  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang || "pl-PL";
  } else {
    utterance.lang = "pl-PL";
  }

  utterance.rate = 0.88;
  utterance.pitch = 0.78;
  utterance.volume = 1;

  isSpeaking = true;
  showMessage(item.text);

  utterance.onend = () => {
    isSpeaking = false;
    processSpeechQueue();
  };

  utterance.onerror = () => {
    isSpeaking = false;
    processSpeechQueue();
  };

  speechSynthesis.speak(utterance);
}

function testVoice() {
  if (!voiceEnabled) {
    showMessage("Najpierw aktywuj kanał głosowy.");
    return;
  }

  enqueueSpeech(
    "Tu COMMANDER 01. System kontroli służby działa prawidłowo. Operatorze, słyszymy się doskonale. Możesz kontynuować misję.",
    3
  );
}

/* ==========================================
   RANDOM HUMOR MESSAGES
========================================== */

function scheduleRandomMessage() {
  const delay = (25 + Math.random() * 25) * 60000;
  nextRandomAt = Date.now() + delay;
}

function announceRandomMessage() {
  if (!voiceEnabled || !el.humorToggle.checked || !shiftIsActive()) {
    return;
  }

  if (document.hidden) {
    scheduleRandomMessage();
    return;
  }

  let availableMessages = funnyMessages
    .map((message, index) => index)
    .filter(index => !playedFunnyMessages.includes(index));

  if (availableMessages.length === 0) {
    playedFunnyMessages = [];
    saveHumorHistory();

    availableMessages = funnyMessages.map((message, index) => index);
  }

  const randomPosition = Math.floor(
    Math.random() * availableMessages.length
  );

  const selectedIndex = availableMessages[randomPosition];
  const message = funnyMessages[selectedIndex];

  playedFunnyMessages.push(selectedIndex);
  lastRandomMessage = message;

  saveHumorHistory();

  enqueueSpeech(message, 0);

  scheduleRandomMessage();
}

/* ==========================================
   HOURLY TIME REPORTS
========================================== */

function announceElapsedHour() {
  if (!voiceEnabled || !el.timeToggle.checked || !shiftIsActive()) return;

  const elapsedMs = Date.now() - shift.start.getTime();
  const elapsedHours = Math.floor(elapsedMs / 3600000);

  if (elapsedHours <= lastElapsedHour) return;

  lastElapsedHour = elapsedHours;

  const remaining = formatRemaining(
    shift.end.getTime() - Date.now()
  );

  const hourPhrase = polishQuantity(
    elapsedHours,
    ["godzina", "godziny", "godzin"]
  );

  const template = hourMessages[
    Math.floor(Math.random() * hourMessages.length)
  ];

  const message = template
    .replace("{hourPhrase}", hourPhrase)
    .replace("{remaining}", remaining);

  enqueueSpeech(message, 2);
}

/* ==========================================
   MILESTONE ANNOUNCEMENTS
========================================== */

function checkMilestones() {
  if (!voiceEnabled || !el.timeToggle.checked || !shiftIsActive()) {
    return;
  }

  const remaining = shift.end.getTime() - Date.now();

  if (previousRemaining === null) {
    previousRemaining = remaining;
    return;
  }

  milestones.forEach(milestone => {
    const crossed =
      previousRemaining > milestone.ms &&
      remaining <= milestone.ms;

    if (crossed && !announcedMilestones.has(milestone.key)) {
      announcedMilestones.add(milestone.key);
      enqueueSpeech(milestone.text, 2);
    }
  });

  previousRemaining = remaining;
}

/* ==========================================
   SHIFT START AND END ANNOUNCEMENTS
========================================== */

function checkShiftTransitions() {
  if (!isValidShift()) return;

  const now = Date.now();
  const start = shift.start.getTime();
  const end = shift.end.getTime();

  if (now >= start && now < end && lastShiftState !== "active") {
    lastShiftState = "active";

    lastElapsedHour = Math.floor((now - start) / 3600000);
    previousRemaining = end - now;

    if (voiceEnabled) {
      enqueueSpeech(
        "Rozpoczęcie służby. Operatorze, system przechodzi w tryb aktywny. Życzę spokojnej i bezpiecznej zmiany.",
        3
      );
    }
  }

  if (now >= end && !shiftEndAnnounced) {
    shiftEndAnnounced = true;
    lastShiftState = "ended";

    if (voiceEnabled) {
      enqueueSpeech(
        "Służba zakończona. Dobra robota, operatorze. System przechodzi w tryb oczekiwania. Czas na odpoczynek.",
        3
      );
    }
  }
}

/* ==========================================
   HOURLY REMINDERS
========================================== */

function checkReminders() {
  if (!shiftIsActive()) return;

  const now = new Date();

  const minuteKey = [
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes()
  ].join("-");

  if (minuteKey === lastReminderMinute) return;

  lastReminderMinute = minuteKey;

  if (now.getMinutes() === 0 && el.reportToggle.checked) {
    notify(
      "Raport obecności",
      "Operatorze, przypomnienie o raporcie obecności."
    );

    enqueueSpeech(
      "Przypomnienie. Czas na raport obecności.",
      2
    );
  }

  if (now.getMinutes() === 5 && el.patrolToggle.checked) {
    notify(
      "Obchód / patrol",
      "Operatorze, przypomnienie o obchodzie obiektu."
    );

    enqueueSpeech(
      "Przypomnienie. Czas na obchód lub patrol obiektu.",
      2
    );
  }
}

function notify(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    new Notification(title, { body });
  } catch (error) {
    console.warn("Powiadomienie niedostępne:", error);
  }
}

/* ==========================================
   FULLSCREEN
========================================== */

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(error => {
      console.warn("Nie udało się uruchomić pełnego ekranu:", error);
    });
  } else {
    document.exitFullscreen?.().catch(error => {
      console.warn("Nie udało się opuścić pełnego ekranu:", error);
    });
  }
}

/* ==========================================
   EVENT LISTENERS
========================================== */

function bindEvents() {
  el.saveShift.addEventListener("click", saveShift);
  el.clearShift.addEventListener("click", clearShift);
  el.voiceBtn.addEventListener("click", activateVoice);
  el.testVoiceBtn.addEventListener("click", testVoice);
  el.fullscreenBtn.addEventListener("click", toggleFullscreen);

  [
    el.patrolToggle,
    el.reportToggle,
    el.humorToggle,
    el.timeToggle
  ].forEach(toggle => {
    toggle.addEventListener("change", () => {
      saveSettings();

      if (toggle === el.humorToggle) {
        if (toggle.checked && voiceEnabled && shiftIsActive()) {
          scheduleRandomMessage();
        } else {
          nextRandomAt = 0;
          speechQueue = speechQueue.filter(item => item.priority > 0);
        }
      }
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && voiceEnabled && el.humorToggle.checked) {
      if (!nextRandomAt && shiftIsActive()) {
        scheduleRandomMessage();
      }
    }
  });
}

/* ==========================================
   MAIN LIVE ENGINE
========================================== */

function liveUpdate() {
  const now = Date.now();

  render();
  checkShiftTransitions();
  checkReminders();
  announceElapsedHour();
  checkMilestones();

  if (
    voiceEnabled &&
    el.humorToggle.checked &&
    shiftIsActive()
  ) {
    if (!nextRandomAt) {
      scheduleRandomMessage();
    }

    if (now >= nextRandomAt) {
      announceRandomMessage();
    }
  } else if (!shiftIsActive()) {
    nextRandomAt = 0;
  }

  if (!shiftIsActive() && isValidShift()) {
    previousRemaining = shift.end.getTime() - now;
  }
}

/* ==========================================
   START APPLICATION
========================================== */

function initializeApp() {
  const missing = Object.entries(el)
    .filter(([, element]) => !element)
    .map(([name]) => name);

  if (missing.length) {
    console.error(
      "SECURITY TERMINAL: Brakuje elementów HTML:",
      missing.join(", ")
    );

    return;
  }

  loadSettings();
  loadHumorHistory();
  refreshVoices();
  updateVoiceUI();
  bindEvents();

  render();

  if (isValidShift()) {
    previousRemaining = shift.end.getTime() - Date.now();
  }

  setInterval(liveUpdate, 250);

  liveUpdate();

  console.info("SECURITY SHIFT TERMINAL 3.3: SYSTEM ONLINE");
}

initializeApp();
