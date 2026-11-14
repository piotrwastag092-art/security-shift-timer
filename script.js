
const $ = id => document.getElementById(id);

const STORAGE_KEY = "securityShiftTimerSettings";

let shiftStart = null;
let shiftEnd = null;
let soundEnabled = true;
let alarmPlayed = false;
let audioContext = null;
let toastTimeout = null;

const elements = {
    days: $("days"),
    hours: $("hours"),
    minutes: $("minutes"),
    seconds: $("seconds"),
    progress: $("progress-fill"),
    percent: $("progress-percent"),
    startDisplay: $("start-display"),
    endDisplay: $("end-display"),
    totalTime: $("total-time"),
    elapsed: $("elapsed-time"),
    clock: $("current-clock"),
    date: $("current-date"),
    message: $("settings-message"),
    completion: $("completion-message"),
    startInput: $("start-input"),
    endInput: $("end-input")
};

// FORMATOWANIE DATY DO INPUTA

function toInputDate(date) {
    const pad = n => String(n).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(date) {
    return date.toLocaleTimeString("pl-PL", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatDate(date) {
    return date.toLocaleDateString("pl-PL", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
}

function formatDuration(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours} godz. ${String(minutes).padStart(2, "0")} min.`;
}

function formatElapsed(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// KOMUNIKATY

function showToast(message) {
    const toast = $("toast");

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

// DŹWIĘK

function playAlarm() {
    if (!soundEnabled) return;

    try {
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) return;

        audioContext ??= new AudioContextClass();

        if (audioContext.state === "suspended") {
            audioContext.resume();
        }

        const frequencies = [660, 880, 660];

        frequencies.forEach((frequency, index) => {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();

            oscillator.type = "sine";
            oscillator.frequency.value = frequency;

            gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(
                0.2,
                audioContext.currentTime + 0.05 + index * 0.35
            );

            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                audioContext.currentTime + 0.3 + index * 0.35
            );

            oscillator.connect(gain);
            gain.connect(audioContext.destination);

            oscillator.start(audioContext.currentTime + index * 0.35);
            oscillator.stop(audioContext.currentTime + 0.4 + index * 0.35);
        });
    } catch (error) {
        console.warn("Nie udało się odtworzyć alarmu.", error);
    }
}

function notifyCompletion() {
    if ("Notification" in window && Notification.permission === "granted") {
        try {
            new Notification("SECURITY SHIFT TIMER", {
                body: "Twoja służba dobiegła końca. Dobra robota!",
                tag: "shift-completed"
            });
        } catch (error) {
            console.warn("Powiadomienie niedostępne.", error);
        }
    }
}

// ZAPIS USTAWIEŃ

function saveSettings() {
    const startValue = elements.startInput.value;
    const endValue = elements.endInput.value;

    if (!startValue || !endValue) {
        showToast("Uzupełnij obie daty.");
        return;
    }

    const start = new Date(startValue);
    const end = new Date(endValue);

    if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end <= start
    ) {
        showToast("Godzina zakończenia musi być późniejsza niż rozpoczęcia.");
        return;
    }

    if (end <= new Date()) {
        showToast("Wybrana zmiana już się zakończyła.");
        return;
    }

    shiftStart = start;
    shiftEnd = end;
    alarmPlayed = false;

    const settings = {
        start: start.toISOString(),
        end: end.toISOString()
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

    $("settings-message").textContent =
        "Ustawienia zapisane. Odliczanie jest aktywne.";

    document.querySelectorAll(".preset-btn").forEach(btn => {
        btn.classList.remove("active");
    });

    updateTimer();
    showToast("Służba została skonfigurowana!");
}

// SZYBKIE PRESETY

function setPreset(hours) {
    const now = new Date();
    const end = new Date(now.getTime() + hours * 60 * 60 * 1000);

    elements.startInput.value = toInputDate(now);
    elements.endInput.value = toInputDate(end);

    document.querySelectorAll(".preset-btn").forEach(btn => {
        btn.classList.toggle(
            "active",
            Number(btn.dataset.hours) === hours
        );
    });

    saveSettings();
}

// ROZPOCZNIJ TERAZ

function startNow() {
    const now = new Date();

    elements.startInput.value = toInputDate(now);

    if (!elements.endInput.value ||
        new Date(elements.endInput.value) <= now) {
        const end = new Date(now.getTime() + 12 * 60 * 60 * 1000);
        elements.endInput.value = toInputDate(end);
    }

    saveSettings();
}

// AKTUALIZACJA LICZNIKA

function updateTimer() {
    const now = new Date();

    elements.clock.textContent = now.toLocaleTimeString("pl-PL");
    elements.date.textContent = formatDate(now);
    $("year").textContent = now.getFullYear();

    if (!shiftStart || !shiftEnd) {
        return;
    }

    const total = shiftEnd - shiftStart;
    const elapsed = now - shiftStart;
    const remaining = shiftEnd - now;

    const totalSeconds = Math.max(0, Math.floor(remaining / 1000));

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    elements.days.textContent = String(days).padStart(2, "0");
    elements.hours.textContent = String(hours).padStart(2, "0");
    elements.minutes.textContent = String(minutes).padStart(2, "0");
    elements.seconds.textContent = String(seconds).padStart(2, "0");

    const progress = Math.max(
        0,
        Math.min(100, (elapsed / total) * 100)
    );

    elements.progress.style.width = `${progress}%`;
    elements.percent.textContent = `${Math.floor(progress)}%`;

    elements.startDisplay.textContent =
        `START: ${formatTime(shiftStart)} • ${formatDate(shiftStart)}`;

    elements.endDisplay.textContent =
        `KONIEC: ${formatTime(shiftEnd)} • ${formatDate(shiftEnd)}`;

    elements.totalTime.textContent = formatDuration(total);

    elements.elapsed.textContent =
        formatElapsed(Math.min(Math.max(elapsed, 0), total));

    if (remaining <= 0) {
        elements.days.textContent = "00";
        elements.hours.textContent = "00";
        elements.minutes.textContent = "00";
        elements.seconds.textContent = "00";

        elements.progress.style.width = "100%";
        elements.percent.textContent = "100%";

        elements.completion.classList.add("show");
        document.body.classList.add("finished");

        if (!alarmPlayed) {
            alarmPlayed = true;
            playAlarm();
            notifyCompletion();
        }

        elements.message.textContent = "Służba została zakończona.";

    } else {
        elements.completion.classList.remove("show");
        document.body.classList.remove("finished");

        if (now < shiftStart) {
            elements.message.textContent =
                "Zmiana jeszcze się nie rozpoczęła. Odliczanie trwa do końca zaplanowanej służby.";
        } else {
            elements.message.textContent =
                "Odliczanie aktywne. Trzymaj się, już bliżej niż dalej!";
        }
    }
}

// WCZYTYWANIE ZAPISANYCH USTAWIEŃ

function loadSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (!saved) return;

        const settings = JSON.parse(saved);
        const start = new Date(settings.start);
        const end = new Date(settings.end);

        if (
            Number.isNaN(start.getTime()) ||
            Number.isNaN(end.getTime()) ||
            end <= start
        ) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }

        if (end <= new Date()) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }

        shiftStart = start;
        shiftEnd = end;

        elements.startInput.value = toInputDate(start);
        elements.endInput.value = toInputDate(end);

        elements.message.textContent =
            "Przywrócono ostatnio zapisane ustawienia służby.";

    } catch (error) {
        console.error("Błąd odczytu ustawień:", error);
        localStorage.removeItem(STORAGE_KEY);
    }
}

// PEŁNY EKRAN

async function toggleFullscreen() {
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        } else {
            await document.exitFullscreen();
        }
    } catch (error) {
        showToast("Pełny ekran nie jest dostępny w tej przeglądarce.");
    }
}

// DŹWIĘK ON/OFF

function toggleSound() {
    soundEnabled = !soundEnabled;

    $("sound-state").textContent =
        soundEnabled ? "WŁĄCZONY" : "WYŁĄCZONY";

    $("sound-icon").textContent =
        soundEnabled ? "♪" : "×";

    showToast(
        soundEnabled ? "Dźwięk włączony." : "Dźwięk wyłączony."
    );
}

// POWIADOMIENIA

async function enableNotifications() {
    if (!("Notification" in window)) {
        showToast("Ta przeglądarka nie obsługuje powiadomień.");
        return;
    }

    try {
        const permission = await Notification.requestPermission();

        if (permission === "granted") {
            showToast("Powiadomienia zostały włączone.");
        } else {
            showToast("Nie przyznano uprawnień do powiadomień.");
        }
    } catch (error) {
        showToast("Nie udało się włączyć powiadomień.");
    }
}

// RESET

function resetSettings() {
    if (!confirm("Czy na pewno chcesz usunąć ustawienia służby?")) {
        return;
    }

    localStorage.removeItem(STORAGE_KEY);

    shiftStart = null;
    shiftEnd = null;
    alarmPlayed = false;

    elements.startInput.value = "";
    elements.endInput.value = "";

    elements.days.textContent = "00";
    elements.hours.textContent = "00";
    elements.minutes.textContent = "00";
    elements.seconds.textContent = "00";

    elements.progress.style.width = "0%";
    elements.percent.textContent = "0%";
    elements.startDisplay.textContent = "START: --:--";
    elements.endDisplay.textContent = "KONIEC: --:--";
    elements.totalTime.textContent = "--";
    elements.elapsed.textContent = "00:00";

    elements.completion.classList.remove("show");
    document.body.classList.remove("finished");

    elements.message.textContent =
        "Ustaw godziny swojej zmiany, aby rozpocząć odliczanie.";

    document.querySelectorAll(".preset-btn").forEach(btn => {
        btn.classList.remove("active");
    });

    showToast("Ustawienia zostały wyczyszczone.");
}

// OBSŁUGA PRZYCISKÓW

$("save-btn").addEventListener("click", saveSettings);
$("now-btn").addEventListener("click", startNow);
$("fullscreen-btn").addEventListener("click", toggleFullscreen);
$("sound-btn").addEventListener("click", toggleSound);
$("notification-btn").addEventListener("click", enableNotifications);
$("reset-btn").addEventListener("click", resetSettings);

document.querySelectorAll(".preset-btn").forEach(button => {
    button.addEventListener("click", () => {
        setPreset(Number(button.dataset.hours));
    });
});

// URUCHOMIENIE

loadSettings();
updateTimer();

setInterval(updateTimer, 250);
