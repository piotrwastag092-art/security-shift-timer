
"use strict";

/* ==========================================
   SECURITY SHIFT TERMINAL V2.0
   ========================================== */

const $ = id => document.getElementById(id);

const STORAGE_KEY = "securityShiftTerminal_v2";
const PREFS_KEY = "securityShiftTerminalPrefs_v2";

let shiftStart = null;
let shiftEnd = null;
let hourlyRate = 34;

let soundEnabled = true;
let voiceEnabled = false;
let alarmPlayed = false;
let shiftStartAnnounced = false;

let previousRemaining = null;
let lastAnnouncement = "";
let toastTimeout = null;
let audioContext = null;
let voiceList = [];

/* FORMATOWANIE */

function pad(number) {
    return String(number).padStart(2, "0");
}

function formatMoney(value, decimals = 2) {
    return new Intl.NumberFormat("pl-PL", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value) + " zł";
}

function formatDate(date) {
    return date.toLocaleDateString("pl-PL", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
}

function formatTime(date) {
    return date.toLocaleTimeString("pl-PL", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function toInputDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDuration(ms) {
    const minutes = Math.floor(Math.max(0, ms) / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return `${hours} godz. ${pad(remainingMinutes)} min.`;
}

function formatElapsed(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return `${pad(hours)}:${pad(minutes)}`;
}

function formatPaidTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`;
}

/* POWIADOMIENIA EKRANOWE */

function showToast(message) {
    const toast = $("toast");

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

/* SYSTEM DŹWIĘKOWY */

function playTone(frequency = 700, duration = 0.12, volume = 0.1) {
    if (!soundEnabled) return;

    try {
        const AudioClass =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioClass) return;

        if (!audioContext) {
            audioContext = new AudioClass();
        }

        if (audioContext.state === "suspended") {
            audioContext.resume();
        }

        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = frequency;

        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);

        gain.gain.exponentialRampToValueAtTime(
            volume,
            audioContext.currentTime + 0.02
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            audioContext.currentTime + duration
        );

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration + 0.03);

    } catch (error) {
        console.warn("Audio error:", error);
    }
}

function systemBeep() {
    playTone(720, 0.10);

    setTimeout(() => {
        playTone(960, 0.15);
    }, 170);
}

function completionBeep() {
    playTone(620, 0.2);

    setTimeout(() => playTone(820, 0.2), 250);
    setTimeout(() => playTone(1050, 0.35), 500);
}

/* ROBO-SECURITY – POLSKI GŁOS */

function loadVoices() {
    if (!("speechSynthesis" in window)) {
        voiceList = [];
        return;
    }

    voiceList = window.speechSynthesis.getVoices();

    console.info(
        "Robo-Security: dostępne głosy:",
        voiceList.map(v => `${v.name} (${v.lang})`)
    );
}

if ("speechSynthesis" in window) {
    loadVoices();

    window.speechSynthesis.onvoiceschanged = loadVoices;
}

function getPolishVoice() {
    loadVoices();

    return voiceList.find(v =>
        v.lang.toLowerCase() === "pl-pl"
    ) || voiceList.find(v =>
        v.lang.toLowerCase().startsWith("pl")
    ) || null;
}

function setVoiceStatus(status, message) {
    const state = $("voice-state");

    state.textContent = status;
    state.classList.toggle(
        "active",
        status === "ACTIVE" || status === "READY"
    );

    $("voice-message").textContent = message;
}

function speak(message) {
    if (!voiceEnabled) return;

    if (!("speechSynthesis" in window)) {
        setVoiceStatus(
            "ERROR",
            "Przeglądarka nie obsługuje syntezatora mowy."
        );
        return;
    }

    const synth = window.speechSynthesis;

    // Usunięcie poprzedniego komunikatu.
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(message);

    utterance.lang = "pl-PL";
    utterance.rate = 0.88;
    utterance.pitch = 0.78;
    utterance.volume = 1;

    const polishVoice = getPolishVoice();

    if (polishVoice) {
        utterance.voice = polishVoice;
    }

    utterance.onstart = () => {
        setVoiceStatus("ACTIVE", message);
    };

    utterance.onend = () => {
        if (voiceEnabled) {
            setVoiceStatus(
                "READY",
                "Robo-Security monitoruje Twoją służbę."
            );
        }
    };

    utterance.onerror = event => {
        console.error("Speech error:", event.error);

        setVoiceStatus(
            "ERROR",
            "Problem z odtworzeniem komunikatu głosowego."
        );
    };

    // Bez dodatkowego setTimeout: uruchomienie bezpośrednio
    // po akcji użytkownika pomaga uniknąć blokady przeglądarki.
    synth.resume();
    synth.speak(utterance);
}

function activateVoice() {
    if (!("speechSynthesis" in window)) {
        showToast("Brak obsługi syntezatora mowy.");
        return;
    }

    voiceEnabled = !voiceEnabled;

    if (voiceEnabled) {
        $("voice-btn").textContent = "WYŁĄCZ GŁOS";

        savePreferences();

        speak(
            "Robo Security aktywowany. Witaj na służbie. System monitorowania czasu został uruchomiony."
        );

        systemBeep();

        showToast("Robo-Security aktywowany.");

    } else {
        window.speechSynthesis.cancel();

        $("voice-btn").textContent = "AKTYWUJ GŁOS";

        setVoiceStatus(
            "STANDBY",
            "System głosowy wyłączony."
        );

        savePreferences();

        showToast("Głos został wyłączony.");
    }
}

function testVoice() {
    if (!voiceEnabled) {
        voiceEnabled = true;
        $("voice-btn").textContent = "WYŁĄCZ GŁOS";
        savePreferences();
    }

    if (!("speechSynthesis" in window)) {
        showToast("Przeglądarka nie obsługuje głosu.");
        return;
    }

    const polishVoice = getPolishVoice();

    if (!polishVoice) {
        showToast(
            "Nie wykryto polskiego głosu. Spróbuję użyć głosu systemowego."
        );
    }

    speak(
        "Test systemu Robo Security. Jeden. Dwa. Trzy. Komunikacja głosowa działa. Pozostań na posterunku."
    );

    systemBeep();
}

/* POLSKA ODMIANA CZASU */

function numberWord(n, singular, few, many) {
    if (n === 1) return singular;

    if (
        n % 10 >= 2 &&
        n % 10 <= 4 &&
        !(n % 100 >= 12 && n % 100 <= 14)
    ) {
        return few;
    }

    return many;
}

function remainingText(ms) {
    const totalMinutes = Math.max(0, Math.floor(ms / 60000));

    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    const parts = [];

    if (days > 0) {
        parts.push(
            `${days} ${numberWord(days, "dzień", "dni", "dni")}`
        );
    }

    if (hours > 0) {
        parts.push(
            `${hours} ${numberWord(hours, "godzina", "godziny", "godzin")}`
        );
    }

    if (minutes > 0 || parts.length === 0) {
        parts.push(
            `${minutes} ${numberWord(minutes, "minuta", "minuty", "minut")}`
        );
    }

    return parts.join(" i ");
}

function announceRemaining(ms, key) {
    if (!voiceEnabled || lastAnnouncement === key) return;

    lastAnnouncement = key;

    speak(
        `Uwaga. Do zakończenia służby pozostało ${remainingText(ms)}. Trzymaj posterunek.`
    );

    systemBeep();
}

function checkAnnouncements(remaining, now) {
    if (!shiftStart || !shiftEnd) return;

    if (now >= shiftStart && !shiftStartAnnounced) {
        shiftStartAnnounced = true;

        if (voiceEnabled) {
            speak(
                "Rozpoczęto służbę. System monitorowania aktywny."
            );
        }
    }

    if (previousRemaining === null) {
        previousRemaining = remaining;
        return;
    }

    if (remaining <= 0 || remaining >= previousRemaining) {
        previousRemaining = remaining;
        return;
    }

    // Komunikat na pełne godziny.
    const oldHours = Math.floor(previousRemaining / 3600000);
    const newHours = Math.floor(remaining / 3600000);

    if (oldHours > newHours && newHours >= 1) {
        announceRemaining(remaining, `hour-${newHours}`);
    }

    // Dodatkowe komunikaty przed zakończeniem.
    const milestones = [
        30 * 60000,
        15 * 60000,
        10 * 60000,
        5 * 60000,
        60 * 1000,
        30 * 1000
    ];

    for (const milestone of milestones) {
        if (
            previousRemaining > milestone &&
            remaining <= milestone
        ) {
            announceRemaining(
                remaining,
                `milestone-${milestone}`
            );

            break;
        }
    }

    previousRemaining = remaining;
}

/* LIVE PAYROLL – ZAROBKI */

function updateEarnings(now) {
    if (!shiftStart || !shiftEnd) {
        $("earned-money").textContent = formatMoney(0, 4);
        $("projected-money").textContent = formatMoney(0);
        $("rate-display").textContent = formatMoney(hourlyRate) + "/h";
        $("paid-time").textContent = "00:00:00";

        $("per-second-rate").textContent =
            `+${formatMoney(hourlyRate / 3600, 6)} / SEKUNDĘ`;

        return;
    }

    const totalMilliseconds = shiftEnd - shiftStart;

    const totalSeconds = Math.max(
        0,
        Math.floor(totalMilliseconds / 1000)
    );

    const workedSeconds = Math.max(
        0,
        Math.min(
            Math.floor((now.getTime() - shiftStart.getTime()) / 1000),
            totalSeconds
        )
    );

    // Stawka za jedną sekundę.
    const perSecond = hourlyRate / 3600;

    // Wynik wyliczamy z łącznego czasu, a nie dodajemy
    // zaokrąglonych kwot w pętli.
    const earned = workedSeconds * perSecond;

    const projected = totalSeconds * perSecond;

    $("earned-money").textContent =
        formatMoney(earned, 4);

    $("projected-money").textContent =
        formatMoney(projected);

    $("rate-display").textContent =
        formatMoney(hourlyRate) + "/h";

    $("paid-time").textContent =
        formatPaidTime(workedSeconds);

    $("per-second-rate").textContent =
        `+${formatMoney(perSecond, 6)} / SEKUNDĘ`;
}

/* KONFIGURACJA SŁUŻBY */

function saveSettings() {
    const startValue = $("start-input").value;
    const endValue = $("end-input").value;
    const rateValue = $("rate-input").value;

    if (!startValue || !endValue || rateValue === "") {
        showToast("Uzupełnij wszystkie pola.");
        return;
    }

    const start = new Date(startValue);
    const end = new Date(endValue);
    const rate = Number(rateValue);

    if (
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        end <= start
    ) {
        showToast("Nieprawidłowe godziny służby.");
        return;
    }

    if (end <= new Date()) {
        showToast("Wybrana zmiana już się zakończyła.");
        return;
    }

    if (
        !Number.isFinite(rate) ||
        rate < 0 ||
        rate > 100000
    ) {
        showToast("Wpisz prawidłową stawkę.");
        return;
    }

    shiftStart = start;
    shiftEnd = end;
    hourlyRate = rate;

    alarmPlayed = false;
    shiftStartAnnounced = new Date() >= shiftStart;

    previousRemaining = shiftEnd.getTime() - Date.now();
    lastAnnouncement = "";

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
            start: start.toISOString(),
            end: end.toISOString(),
            rate: hourlyRate
        })
    );

    $("settings-message").textContent =
        "KONFIGURACJA ZAPISANA • LIVE MONITORING AKTYWNY";

    document.querySelectorAll(".preset-btn").forEach(btn => {
        btn.classList.remove("active");
    });

    updateTimer();

    showToast("Parametry służby zapisane.");
}

function setPreset(hours) {
    const now = new Date();

    const end = new Date(
        now.getTime() + hours * 3600000
    );

    $("start-input").value = toInputDate(now);
    $("end-input").value = toInputDate(end);

    document.querySelectorAll(".preset-btn").forEach(btn => {
        btn.classList.toggle(
            "active",
            Number(btn.dataset.hours) === hours
        );
    });

    saveSettings();
}

function startNow() {
    const now = new Date();

    $("start-input").value = toInputDate(now);

    if (
        !$("end-input").value ||
        new Date($("end-input").value) <= now
    ) {
        $("end-input").value = toInputDate(
            new Date(now.getTime() + 12 * 3600000)
        );
    }

    saveSettings();
}

/* GŁÓWNY TIMER */

function updateTimer() {
    const now = new Date();

    $("current-clock").textContent =
        now.toLocaleTimeString("pl-PL");

    $("current-date").textContent = formatDate(now);
    $("year").textContent = now.getFullYear();

    if (!shiftStart || !shiftEnd) {
        updateEarnings(now);
        return;
    }

    const total = shiftEnd - shiftStart;
    const elapsed = now.getTime() - shiftStart.getTime();
    const remaining = shiftEnd.getTime() - now.getTime();

    const safeRemaining = Math.max(
        0,
        Math.floor(remaining / 1000)
    );

    const days = Math.floor(safeRemaining / 86400);
    const hours = Math.floor((safeRemaining % 86400) / 3600);
    const minutes = Math.floor((safeRemaining % 3600) / 60);
    const seconds = safeRemaining % 60;

    $("days").textContent = pad(days);
    $("hours").textContent = pad(hours);
    $("minutes").textContent = pad(minutes);
    $("seconds").textContent = pad(seconds);

    const progress = Math.max(
        0,
        Math.min(100, elapsed / total * 100)
    );

    $("progress-fill").style.width = `${progress}%`;

    $("progress-percent").textContent =
        `${Math.floor(progress)}%`;

    $("start-display").textContent =
        `START: ${formatTime(shiftStart)} • ${formatDate(shiftStart)}`;

    $("end-display").textContent =
        `KONIEC: ${formatTime(shiftEnd)} • ${formatDate(shiftEnd)}`;

    $("total-time").textContent =
        formatDuration(total);

    $("elapsed-time")?.textContent;

    updateEarnings(now);

    checkAnnouncements(remaining, now);

    if (remaining <= 0) {
        $("days").textContent = "00";
        $("hours").textContent = "00";
        $("minutes").textContent = "00";
        $("seconds").textContent = "00";

        $("progress-fill").style.width = "100%";
        $("progress-percent").textContent = "100%";

        $("completion-message").classList.add("show");
        document.body.classList.add("finished");

        if (!alarmPlayed) {
            alarmPlayed = true;

            completionBeep();

            if (voiceEnabled) {
                speak(
                    "Uwaga. Służba zakończona. Dziękujemy za zabezpieczenie obiektu."
                );
            }

            notifyCompletion();
        }

        $("settings-message").textContent =
            "SŁUŻBA ZAKOŃCZONA.";

    } else {
        $("completion-message").classList.remove("show");
        document.body.classList.remove("finished");

        $("settings-message").textContent =
            now < shiftStart
                ? "OCZEKIWANIE NA ROZPOCZĘCIE SŁUŻBY."
                : "LIVE MONITORING • NALICZANIE WYNAGRODZENIA AKTYWNE.";
    }
}

/* POWIADOMIENIA SYSTEMOWE */

function notifyCompletion() {
    if (
        "Notification" in window &&
        Notification.permission === "granted"
    ) {
        try {
            new Notification("SECURITY SHIFT TERMINAL", {
                body: "Twoja służba dobiegła końca. Dobra robota!",
                tag: "shift-completed"
            });
        } catch (error) {
            console.warn("Notification error:", error);
        }
    }
}

async function enableNotifications() {
    if (!("Notification" in window)) {
        showToast("Powiadomienia nie są obsługiwane.");
        return;
    }

    try {
        const permission = await Notification.requestPermission();

        showToast(
            permission === "granted"
                ? "Powiadomienia zostały aktywowane."
                : "Nie przyznano uprawnień."
        );
    } catch (error) {
        showToast("Nie udało się uruchomić powiadomień.");
    }
}

/* PEŁNY EKRAN */

async function toggleFullscreen() {
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        } else {
            await document.exitFullscreen();
        }
    } catch (error) {
        showToast("Pełny ekran niedostępny.");
    }
}

/* PREFERENCJE */

function savePreferences() {
    localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
            soundEnabled
        })
    );
}

function loadPreferences() {
    try {
        const prefs = JSON.parse(
            localStorage.getItem(PREFS_KEY) || "{}"
        );

        soundEnabled = prefs.soundEnabled !== false;

    } catch {
        soundEnabled = true;
    }

    voiceEnabled = false;

    $("sound-state").textContent =
        soundEnabled ? "ON" : "OFF";

    $("voice-btn").textContent = "AKTYWUJ GŁOS";

    setVoiceStatus(
        "STANDBY",
        "System głosowy oczekuje na aktywację."
    );
}

function toggleSound() {
    soundEnabled = !soundEnabled;

    $("sound-state").textContent =
        soundEnabled ? "ON" : "OFF";

    savePreferences();

    showToast(
        soundEnabled ? "Dźwięk włączony." : "Dźwięk wyłączony."
    );

    if (soundEnabled) systemBeep();
}

/* WCZYTYWANIE USTAWIEŃ */

function loadSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (!saved) return;

        const settings = JSON.parse(saved);

        const start = new Date(settings.start);
        const end = new Date(settings.end);
        const rate = Number(settings.rate);

        if (
            !Number.isFinite(start.getTime()) ||
            !Number.isFinite(end.getTime()) ||
            end <= start ||
            !Number.isFinite(rate) ||
            rate < 0 ||
            rate > 100000
        ) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }

        shiftStart = start;
        shiftEnd = end;
        hourlyRate = rate;

        $("start-input").value = toInputDate(start);
        $("end-input").value = toInputDate(end);
        $("rate-input").value = String(rate);

        alarmPlayed = end <= new Date();
        shiftStartAnnounced = new Date() >= start;

        previousRemaining = end.getTime() - Date.now();

        $("settings-message").textContent =
            "PRZYWRÓCONO ZAPISANĄ KONFIGURACJĘ SŁUŻBY.";

    } catch (error) {
        console.error("Storage error:", error);
        localStorage.removeItem(STORAGE_KEY);
    }
}

/* RESET SYSTEMU */

function resetSettings() {
    if (!confirm("Czy na pewno usunąć konfigurację służby?")) {
        return;
    }

    localStorage.removeItem(STORAGE_KEY);

    shiftStart = null;
    shiftEnd = null;

    hourlyRate = Number($("rate-input").value) || 34;

    alarmPlayed = false;
    shiftStartAnnounced = false;
    previousRemaining = null;
    lastAnnouncement = "";

    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    $("start-input").value = "";
    $("end-input").value = "";
    $("rate-input").value = "34";

    $("completion-message").classList.remove("show");
    document.body.classList.remove("finished");

    $("days").textContent = "00";
    $("hours").textContent = "00";
    $("minutes").textContent = "00";
    $("seconds").textContent = "00";

    $("progress-fill").style.width = "0%";
    $("progress-percent").textContent = "0%";

    $("start-display").textContent = "START: --:--";
    $("end-display").textContent = "KONIEC: --:--";
    $("total-time").textContent = "--";

    $("settings-message").textContent =
        "USTAW PARAMETRY NOWEJ SŁUŻBY.";

    document.querySelectorAll(".preset-btn").forEach(btn => {
        btn.classList.remove("active");
    });

    updateEarnings(new Date());

    showToast("Konfiguracja służby wyczyszczona.");
}

/* OBSŁUGA PRZYCISKÓW */

$("save-btn").addEventListener("click", saveSettings);
$("now-btn").addEventListener("click", startNow);
$("voice-btn").addEventListener("click", activateVoice);
$("voice-test-btn").addEventListener("click", testVoice);
$("sound-btn").addEventListener("click", toggleSound);
$("notification-btn").addEventListener("click", enableNotifications);
$("fullscreen-btn").addEventListener("click", toggleFullscreen);
$("reset-btn").addEventListener("click", resetSettings);

document.querySelectorAll(".preset-btn").forEach(button => {
    button.addEventListener("click", () => {
        setPreset(Number(button.dataset.hours));
    });
});

/* START SYSTEMU */

loadPreferences();
loadSettings();

updateTimer();

// Aktualizacja co sekundę.
setInterval(updateTimer, 1000);

console.info(
    "%c SECURITY SHIFT TERMINAL V2.0 ONLINE ",
    "background:#071E2B;color:#28F0B5;padding:8px;font-weight:bold;"
);
