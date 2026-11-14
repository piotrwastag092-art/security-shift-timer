
"use strict";

const STORAGE_KEY = "securityShiftTerminalV32";

const $ = (id) => document.getElementById(id);

const elements = {
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
  systemStatus: $("systemStatus")
};

let shift = { start: null, end: null, rate: 34 };
let voiceEnabled = false;
let selectedVoice = null;
let speechQueue = [];
let isSpeaking = false;
let lastRandomMessage = "";
let nextRandomAt = 0;
let lastElapsedHour = 0;
let lastReminderMinute = "";
let lastShiftState = "";
let shiftEndAnnounced = false;
let voicesReady = false;

const funnyMessages = [
  "Operatorze, wykryto krytyczny niedobór kofeiny. Zalecam natychmiastową interwencję w postaci kawy.",
  "Skanowanie zakończone. Nie wykryto zagrożeń. Wykryto natomiast człowieka, który bardzo chce już iść do domu.",
  "Operatorze, Twoja cierpliwość została sklasyfikowana jako zasób strategiczny.",
  "Uwaga. Poziom nudy przekroczył dopuszczalne normy. Proszę zachować spokój i nie zasnąć na stanowisku.",
  "System informuje, że krzesło nadal działa prawidłowo. Operator również, choć wymaga dalszej obserwacji.",
  "Nie wykryto intruzów. Wykryto za to podejrzanie częste spoglądanie na zegarek.",
  "Operatorze, pamiętaj. Kawa nie rozwiązuje wszystkich problemów. Ale zdecydowanie poprawia sytuację.",
  "Raport systemowy: obiekt spokojny, monitoring aktywny, operator prawdopodobnie myśli o jedzeniu.",
  "Wszystkie systemy sprawne. Jedynym wykrytym zagrożeniem jest kolejna godzina służby.",
  "Proszę nie regulować odbiornika. To tylko ja. Twój ulubiony głos z centrum dowodzenia.",
  "Operatorze, wykryto anomalię. Czas płynie podejrzanie wolno. Trwa dalsza analiza.",
  "Jeśli służba wydaje się długa, proszę pamiętać, że dinozaury też kiedyś musiały czekać na koniec zmiany.",
  "System podtrzymuje gotowość bojową. Operator może rozważyć uzupełnienie zapasów przekąsek.",
  "Nie ma powodów do paniki. To tylko kolejna godzina. Prawdopodobnie jedna z wielu.",
  "Wykryto próbę negocjacji z zegarem. Informuję, że zegar nie przyjmuje reklamacji.",
  "Operatorze, utrzymuj czujność. Nawet ekspres do kawy może dziś potrzebować ochrony."
];

const hourMessages = [
  "Minęła {hour} godzina służby. Do zakończenia pozostało {remaining}.",
  "Raport czasowy. Za Tobą już {hour} godzin służby. Pozostały czas: {remaining}.",
  "Operatorze, kolejny etap za nami. Minęło {hour} godzin. Do końca zmiany: {remaining}.",
  "Aktualizacja systemowa. Przepracowano {hour} godzin. Pozostało {remaining}."
];

const milestoneMessages = {
  3: "Zostały trzy godziny do zakończenia służby. Ostatnia prosta powoli się rozpoczyna.",
  2: "Dwie godziny do końca. Operatorze, utrzymuj gotowość. Meta jest już blisko.",
  1: "Pozostała ostatnia godzina służby. System odlicza końcowy etap.",
  0.25: "Piętnaście minut do zakończenia służby. Przygotuj się do przekazania stanowiska."
};

function formatDateTime(value) {
  if (!value) return "---";
  return new Date(value).toLocaleString("pl-PL", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h ${minutes}m`;
  }
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatRemaining(ms) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} minut`;
  if (minutes === 0) return `${hours} godzin`;
  return `${hours} godzin i ${minutes} minut`;
}

function formatMoney(value) {
  return value.toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " zł";
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

    if (saved.start) {
      shift.start = new Date(saved.start);
      elements.shiftStart.value = toLocalInput(shift.start);
    }
    if (saved.end) {
      shift.end = new Date(saved.end);
      elements.shiftEnd.value = toLocalInput(shift.end);
    }
    if (Number.isFinite(Number(saved.rate))) {
      shift.rate = Number(saved.rate);
    }

    elements.hourlyRate.value = shift.rate;
    elements.patrolToggle.checked = saved.patrol === true;
    elements.reportToggle.checked = saved.report === true;
    elements.humorToggle.checked = saved.humor !== false;
    elements.timeToggle.checked = saved.time !== false;
  } catch (error) {
    console.warn("Nie udało się wczytać ustawień.", error);
  }
}

function toLocalInput(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function saveSettings() {
  const data = {
    start: shift.start ? shift.start.toISOString() : null,
    end: shift.end ? shift.end.toISOString() : null,
    rate: shift.rate,
    patrol: elements.patrolToggle.checked,
    report: elements.reportToggle.checked,
    humor: elements.humorToggle.checked,
    time: elements.timeToggle.checked
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function showMessage(message) {
  elements.assistantMessage.textContent = "COMMANDER 01: " + message;
}

function setSettingsMessage(message, error = false) {
  elements.settingsMessage.textContent = message;
  elements.settingsMessage.style.color = error ? "#ff7379" : "";
}

function isValidShift() {
  return shift.start instanceof Date &&
    shift.end instanceof Date &&
    !Number.isNaN(shift.start.getTime()) &&
    !Number.isNaN(shift.end.getTime()) &&
    shift.end > shift.start;
}

function saveShift() {
  const startValue = elements.shiftStart.value;
  const endValue = elements.shiftEnd.value;
  const rateValue = Number(elements.hourlyRate.value);

  if (!startValue || !endValue) {
    setSettingsMessage("Uzupełnij datę i godzinę rozpoczęcia oraz zakończenia.", true);
    return;
  }

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (end <= start) {
    setSettingsMessage("Koniec służby musi przypadać po jej rozpoczęciu.", true);
    return;
  }

  if (!Number.isFinite(rateValue) || rateValue < 0) {
    setSettingsMessage("Podaj prawidłową stawkę godzinową.", true);
    return;
  }

  shift = { start, end, rate: rateValue };
  lastElapsedHour = Math.max(0, Math.floor((Date.now() - start.getTime()) / 3600000));
  lastReminderMinute = "";
  shiftEndAnnounced = false;
  lastShiftState = "";
  saveSettings();
  render();
  setSettingsMessage("Ustawienia zapisane. Terminal gotowy do pracy.");
  showMessage("Konfiguracja służby została zaktualizowana. Jestem gotowy, operatorze.");
}

function clearShift() {
  shift = { start: null, end: null, rate: 34 };
  elements.shiftStart.value = "";
  elements.shiftEnd.value = "";
  elements.hourlyRate.value = "34";
  lastElapsedHour = 0;
  lastReminderMinute = "";
  shiftEndAnnounced = false;
  lastShiftState = "";
  saveSettings();
  render();
  setSettingsMessage("Dane służby zostały wyczyszczone.");
  showMessage("Dane służby usunięte. Oczekuję na nową konfigurację.");
}

function updateClock() {
  const now = new Date();
  elements.clock.textContent = now.toLocaleTimeString("pl-PL");
  elements.date.textContent = now.toLocaleDateString("pl-PL", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  }).toUpperCase();
}

function render() {
  const now = Date.now();
  updateClock();

  if (!isValidShift()) {
    elements.days.textContent = "00";
    elements.hours.textContent = "00";
    elements.minutes.textContent = "00";
    elements.seconds.textContent = "00";
    elements.progressText.textContent = "0%";
    elements.progressFill.style.width = "0%";
    elements.startDisplay.textContent = "---";
    elements.endDisplay.textContent = "---";
    elements.durationDisplay.textContent = "---";
    elements.earnings.textContent = "0,00 zł";
    elements.rateDisplay.textContent = `${shift.rate} zł/h`;
    elements.workedDisplay.textContent = "0h 00m";
    elements.shiftStatus.textContent = "NIEAKTYWNA";
    elements.systemStatus.textContent = "GOTOWY";
    return;
  }

  const start = shift.start.getTime();
  const end = shift.end.getTime();
  const total = end - start;
  const elapsed = Math.max(0, Math.min(now - start, total));
  const remaining = Math.max(0, end - now);
  const percent = Math.min(100, Math.max(0, (elapsed / total) * 100));

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  elements.days.textContent = String(days).padStart(2, "0");
  elements.hours.textContent = String(hours).padStart(2, "0");
  elements.minutes.textContent = String(minutes).padStart(2, "0");
  elements.seconds.textContent = String(seconds).padStart(2, "0");

  elements.progressText.textContent = `${percent.toFixed(1)}%`;
  elements.progressFill.style.width = `${percent}%`;
  elements.startDisplay.textContent = formatDateTime(shift.start);
  elements.endDisplay.textContent = formatDateTime(shift.end);
  elements.durationDisplay.textContent = formatDuration(total);
  elements.rateDisplay.textContent = `${shift.rate.toFixed(2)} zł/h`;
  elements.workedDisplay.textContent = formatDuration(elapsed);

  const earned = (elapsed / 3600000) * shift.rate;
  elements.earnings.textContent = formatMoney(earned);

  if (now < start) {
    elements.shiftStatus.textContent = "OCZEKIWANIE";
    elements.systemStatus.textContent = "GOTOWY";
  } else if (now < end) {
    elements.shiftStatus.textContent = "AKTYWNA";
    elements.systemStatus.textContent = "MONITORING";
  } else {
    elements.shiftStatus.textContent = "ZAKOŃCZONA";
    elements.systemStatus.textContent = "GOTOWY";
  }
}

function shiftIsActive() {
  const now = Date.now();
  return isValidShift() && now >= shift.start.getTime() && now < shift.end.getTime();
}

/* VOICE ENGINE */

function getPolishVoice() {
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  if (!voices.length) return null;

  const polish = voices.filter(voice => voice.lang && voice.lang.toLowerCase().startsWith("pl"));
  if (!polish.length) return voices[0] || null;

  const preferred = [
    /paulina/i, /marek/i, /google.*polish/i, /polish/i,
    /microsoft.*polski/i, /ewa/i, /zosia/i
  ];

  for (const pattern of preferred) {
    const found = polish.find(voice => pattern.test(voice.name));
    if (found) return found;
  }

  return polish.find(voice => !voice.name.toLowerCase().includes("compact")) || polish[0];
}

function refreshVoices() {
  selectedVoice = getPolishVoice();
  voicesReady = true;
}

if ("speechSynthesis" in window) {
  refreshVoices();
  speechSynthesis.onvoiceschanged = refreshVoices;
}

function updateVoiceUI() {
  elements.voiceStatus.textContent = voiceEnabled ? "AKTYWNY" : "OCZEKUJE";
  elements.voiceIndicator.classList.toggle("active", voiceEnabled);
  elements.voiceBtn.textContent = voiceEnabled ? "WYŁĄCZ GŁOS" : "AKTYWUJ GŁOS";
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
    enqueueSpeech("COMMANDER 01 online. Operatorze, kanał komunikacyjny został aktywowany.", 3);
    scheduleRandomMessage();
  } else {
    speechQueue = [];
    speechSynthesis.cancel();
    isSpeaking = false;
    nextRandomAt = 0;
    updateVoiceUI();
    showMessage("Kanał głosowy wyłączony. Przypomnienia tekstowe pozostają aktywne.");
  }
}

function enqueueSpeech(text, priority = 1) {
  if (!voiceEnabled || !text) return;

  // Ważne komunikaty mają pierwszeństwo przed żartami.
  if (priority >= 2) {
    speechQueue = speechQueue.filter(item => item.priority >= priority);
    if (isSpeaking && priority >= 3) {
      speechSynthesis.cancel();
      isSpeaking = false;
    }
  }

  speechQueue.push({ text, priority });
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

function scheduleRandomMessage() {
  nextRandomAt = Date.now() + (20 + Math.random() * 20) * 60000;
}

function announceRandomMessage() {
  if (!voiceEnabled || !elements.humorToggle.checked || !shiftIsActive()) return;
  if (document.hidden) return;

  let message = funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
  if (funnyMessages.length > 1) {
    while (message === lastRandomMessage) {
      message = funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
    }
  }

  lastRandomMessage = message;
  enqueueSpeech(message, 0);
  scheduleRandomMessage();
}

/* RAPORTY CZASOWE */

function announceElapsedHour() {
  if (!voiceEnabled || !elements.timeToggle.checked || !shiftIsActive()) return;

  const elapsedMs = Date.now() - shift.start.getTime();
  const elapsedHours = Math.floor(elapsedMs / 3600000);

  if (elapsedHours <= lastElapsedHour) return;

  lastElapsedHour = elapsedHours;

  const remaining = formatRemaining(shift.end.getTime() - Date.now());
  const template = hourMessages[Math.floor(Math.random() * hourMessages.length)];
  const hourWord = elapsedHours === 1 ? "jedna" : String(elapsedHours);

  enqueueSpeech(
    template.replace("{hour}", hourWord).replace("{remaining}", remaining),
    2
  );

  const hoursLeft = (shift.end.getTime() - Date.now()) / 3600000;
  const milestone = Object.keys(milestoneMessages)
    .map(Number)
    .find(value => Math.abs(hoursLeft - value) < (1 / 120));

  if (milestone !== undefined) {
    enqueueSpeech(milestoneMessages[milestone], 2);
  }
}

function checkMilestones() {
  if (!voiceEnabled || !elements.timeToggle.checked || !shiftIsActive()) return;

  const remaining = shift.end.getTime() - Date.now();
  const hoursLeft = remaining / 3600000;

  const thresholds = [
    { value: 3, key: "3h", text: milestoneMessages[3] },
    { value: 2, key: "2h", text: milestoneMessages[2] },
    { value: 1, key: "1h", text: milestoneMessages[1] },
    { value: 0.25, key: "15m", text: milestoneMessages[0.25] }
  ];

  thresholds.forEach(item => {
    if (hoursLeft <= item.value && !milestoneAnnounced.has(item.key)) {
      milestoneAnnounced.add(item.key);
      enqueueSpeech(item.text, 2);
    }
  });
}

const milestoneAnnounced = new Set();

function checkShiftTransitions() {
  if (!isValidShift()) return;

  const now = Date.now();
  const start = shift.start.getTime();
  const end = shift.end.getTime();

  if (now >= start && now < end && lastShiftState !== "active") {
    lastShiftState = "active";
    if (voiceEnabled) {
      enqueueSpeech("Rozpoczęcie służby. Operatorze, system przechodzi w tryb aktywny. Życzę spokojnej i bezpiecznej zmiany.", 3);
    }
  }

  if (now >= end && !shiftEndAnnounced) {
    shiftEndAnnounced = true;
    lastShiftState = "ended";
    if (voiceEnabled) {
      enqueueSpeech("Służba zakończona. Dobra robota, operatorze. System przechodzi w tryb oczekiwania. Czas na odpoczynek.", 3);
    }
  }
}

/* PRZYPOMNIENIA GODZINOWE */

function checkReminders() {
  if (!shiftIsActive()) return;

  const now = new Date();
  const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

  if (minuteKey === lastReminderMinute) return;
  lastReminderMinute = minuteKey;

  if (now.getMinutes() === 0 && elements.reportToggle.checked) {
    notify("Raport obecności", "Operatorze, przypomnienie o raporcie obecności.");
    enqueueSpeech("Przypomnienie. Czas na raport obecności.", 2);
  }

  if (now.getMinutes() === 5 && elements.patrolToggle.checked) {
    notify("Obchód / patrol", "Operatorze, przypomnienie o obchodzie obiektu.");
    enqueueSpeech("Przypomnienie. Czas na obchód lub patrol obiektu.", 2);
  }
}

function notify(title, body) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch (error) {
    console.warn("Powiadomienie niedostępne.", error);
  }
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch (error) {
      console.warn("Nie udało się uzyskać zgody na powiadomienia.", error);
    }
  }
}

/* URUCHOMIENIE */

elements.saveShift.addEventListener("click", saveShift);
elements.clearShift.addEventListener("click", clearShift);
elements.voiceBtn.addEventListener("click", activateVoice);
elements.testVoiceBtn.addEventListener("click", testVoice);

elements.fullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
});

[
  elements.patrolToggle,
  elements.reportToggle,
  elements.humorToggle,
  elements.timeToggle
].forEach(toggle => {
  toggle.addEventListener("change", () => {
    saveSettings();
    if (toggle === elements.humorToggle && toggle.checked) {
      scheduleRandomMessage();
    }
  });
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && voiceEnabled && !nextRandomAt) {
    scheduleRandomMessage();
  }
});

loadSettings();
refreshVoices();
updateVoiceUI();
render();

setInterval(() => {
  render();
  checkShiftTransitions();
  checkReminders();
  announceElapsedHour();
  checkMilestones();

  if (voiceEnabled && elements.humorToggle.checked && shiftIsActive()) {
    if (!nextRandomAt) scheduleRandomMessage();
    if (Date.now() >= nextRandomAt) announceRandomMessage();
  }
}, 1000);

requestNotificationPermission();
