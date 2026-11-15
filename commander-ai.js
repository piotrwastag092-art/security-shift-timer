
"use strict";

/* ==========================================
   SECURITY SHIFT TERMINAL
   COMMANDER AI 2.0
========================================== */

(() => {
  const $ = id => document.getElementById(id);

  const ui = {
    form: $("commanderForm"),
    input: $("commanderInput"),
    log: $("commanderLog"),
    listen: $("commanderListenBtn"),
    stop: $("commanderStopBtn"),
    repeat: $("commanderRepeatBtn"),
    status: $("commanderAIStatus"),
    state: $("commanderAIState"),
    hint: $("commanderAIHint"),
    core: $("commanderCore"),
    wave: $("commanderWave")
  };

  if (Object.values(ui).some(item => !item)) {
    console.error("COMMANDER AI: Brakuje elementów HTML.");
    return;
  }

  const Recognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  let recognition = null;
  let listening = false;
  let lastAnswer = "";
  let restartBlocked = false;

  function addLog(message, type = "system") {
    const line = document.createElement("div");
    line.className = `ai-log-${type}`;
    line.textContent =
      `[${new Date().toLocaleTimeString("pl-PL")}] ${message}`;

    ui.log.appendChild(line);
    ui.log.scrollTop = ui.log.scrollHeight;

    while (ui.log.children.length > 40) {
      ui.log.removeChild(ui.log.firstChild);
    }
  }

  function setState(title, hint = "") {
    ui.state.textContent = title;
    ui.hint.textContent = hint;
  }

  function setCoreMode(mode) {
    ui.core.classList.remove("listening", "speaking", "processing");
    ui.wave.classList.remove("active");

    if (mode) ui.core.classList.add(mode);

    if (mode === "listening" || mode === "speaking") {
      ui.wave.classList.add("active");
    }
  }

  function speak(message) {
    lastAnswer = message;
    addLog("COMMANDER: " + message, "answer");

    setState("COMMANDER ODPOWIADA", "GENEROWANIE KOMUNIKATU GŁOSOWEGO");
    setCoreMode("speaking");

    if (!("speechSynthesis" in window)) {
      setState("ODPOWIEDŹ GOTOWA", "SYNTEZA MOWY NIEDOSTĘPNA");
      setCoreMode("");
      return;
    }

    if (recognition && listening) {
      restartBlocked = true;

      try {
        recognition.stop();
      } catch (_) {}
    }

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    const voices = speechSynthesis.getVoices();

    const polishVoice = voices.find(voice =>
      voice.lang && voice.lang.toLowerCase().startsWith("pl")
    );

    utterance.lang = polishVoice ? polishVoice.lang : "pl-PL";

    if (polishVoice) {
      utterance.voice = polishVoice;
    }

    utterance.rate = 0.92;
    utterance.pitch = 0.85;
    utterance.volume = 1;

    utterance.onend = resumeAfterSpeech;
    utterance.onerror = resumeAfterSpeech;

    speechSynthesis.speak(utterance);
  }

  function resumeAfterSpeech() {
    if (listening) {
      restartBlocked = false;
      setState("NASŁUCH AKTYWNY", "OCZEKIWANIE NA POLECENIE");
      setCoreMode("listening");
      restartRecognition();
    } else {
      setState("SYSTEM GOTOWY", "OCZEKIWANIE NA OPERATORA");
      setCoreMode("");
    }
  }

  function getShiftData() {
    const startInput = $("shiftStart")?.value;
    const endInput = $("shiftEnd")?.value;

    if (!startInput || !endInput) return null;

    const start = new Date(startInput);
    const end = new Date(endInput);
    const now = new Date();

    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start
    ) {
      return null;
    }

    const total = end.getTime() - start.getTime();

    const elapsed = Math.max(
      0,
      Math.min(now.getTime() - start.getTime(), total)
    );

    const remaining = Math.max(0, end.getTime() - now.getTime());
    const rate = Number($("hourlyRate")?.value || 0);
    const earnings = elapsed / 3600000 * rate;

    let status = "OCZEKUJE";

    if (now >= start && now < end) status = "AKTYWNA";
    if (now >= end) status = "ZAKOŃCZONA";

    return {
      start,
      end,
      now,
      total,
      elapsed,
      remaining,
      rate,
      earnings,
      status
    };
  }

  function numberToWords(number) {
    const ones = [
      "zero", "jeden", "dwa", "trzy", "cztery",
      "pięć", "sześć", "siedem", "osiem", "dziewięć"
    ];

    const teens = [
      "dziesięć", "jedenaście", "dwanaście", "trzynaście",
      "czternaście", "piętnaście", "szesnaście",
      "siedemnaście", "osiemnaście", "dziewiętnaście"
    ];

    const tens = [
      "", "", "dwadzieścia", "trzydzieści",
      "czterdzieści", "pięćdziesiąt"
    ];

    if (number < 10) return ones[number];
    if (number < 20) return teens[number - 10];

    const ten = Math.floor(number / 10);
    const one = number % 10;

    return tens[ten] + (one ? " " + ones[one] : "");
  }

  function spokenQuantity(number, forms) {
    const n = Math.abs(number);
    const last = n % 10;
    const lastTwo = n % 100;

    let form = forms[2];

    if (n === 1) {
      form = forms[0];
    } else if (
      last >= 2 &&
      last <= 4 &&
      !(lastTwo >= 12 && lastTwo <= 14)
    ) {
      form = forms[1];
    }

    return `${numberToWords(n)} ${form}`;
  }

  function spokenRemaining(milliseconds) {
    const totalMinutes = Math.max(
      0,
      Math.ceil(milliseconds / 60000)
    );

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0 && minutes === 0) {
      return "mniej niż minuta";
    }

    if (hours === 0) {
      return spokenQuantity(
        minutes,
        ["minuta", "minuty", "minut"]
      );
    }

    if (minutes === 0) {
      return spokenQuantity(
        hours,
        ["godzina", "godziny", "godzin"]
      );
    }

    return (
      spokenQuantity(hours, ["godzina", "godziny", "godzin"]) +
      " i " +
      spokenQuantity(minutes, ["minuta", "minuty", "minut"])
    );
  }

  function moneyToSpeech(value) {
    const safe = Math.max(0, Number(value) || 0);
    const rounded = safe.toFixed(2).split(".");
    return `${rounded[0]} złotych i ${rounded[1]} groszy`;
  }

  function normalize(text) {
    return text
      .toLowerCase()
      .replace(/[.,!?]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function setToggle(id, value) {
    const toggle = $(id);

    if (!toggle) return;

    toggle.checked = value;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function executeCommand(rawCommand) {
    const command = normalize(rawCommand);

    if (!command) return;

    addLog("OPERATOR: " + rawCommand, "user");

    setState("ANALIZA POLECENIA", "COMMANDER PRZETWARZA ZAPYTANIE");
    setCoreMode("processing");

    const data = getShiftData();

    // GODZINA
    if (
      command.includes("która godzina") ||
      command.includes("jaka godzina") ||
      command === "godzina"
    ) {
      const time = new Date().toLocaleTimeString("pl-PL", {
        hour: "2-digit",
        minute: "2-digit"
      });

      speak(`Aktualna godzina to ${time}.`);
      return;
    }

    // DATA
    if (
      command.includes("jaka data") ||
      command.includes("który dzisiaj") ||
      command.includes("jaki dzisiaj dzień")
    ) {
      const date = new Date().toLocaleDateString("pl-PL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      });

      speak(`Dzisiaj jest ${date}.`);
      return;
    }

    // STATUS SŁUŻBY
    if (
      command.includes("status") ||
      command.includes("raport służby") ||
      command.includes("jak wygląda służba")
    ) {
      if (!data) {
        speak("Nie mam skonfigurowanego harmonogramu. Ustaw początek i koniec służby.");
        return;
      }

      let message = `Status służby: ${data.status}. `;

      if (data.status === "AKTYWNA") {
        message += `Do końca pozostało ${spokenRemaining(data.remaining)}. `;
        message += `Przepracowano ${spokenRemaining(data.elapsed)}.`;
      } else if (data.status === "OCZEKUJE") {
        message += `Rozpoczęcie zaplanowano na ${data.start.toLocaleTimeString("pl-PL", {
          hour: "2-digit",
          minute: "2-digit"
        })}.`;
      } else {
        message += "Zaplanowana służba została zakończona.";
      }

      speak(message);
      return;
    }

    // CZAS DO KOŃCA
    if (
      command.includes("ile zostało") ||
      command.includes("ile jeszcze") ||
      command.includes("czas do końca") ||
      command.includes("koniec służby") ||
      command.includes("do końca")
    ) {
      if (!data) {
        speak("Nie mam zapisanej służby. Najpierw ustaw harmonogram.");
        return;
      }

      if (data.status === "OCZEKUJE") {
        speak("Służba jeszcze się nie rozpoczęła.");
        return;
      }

      if (data.status === "ZAKOŃCZONA") {
        speak("Służba jest już zakończona. Możesz odpocząć, operatorze.");
        return;
      }

      speak(`Do końca służby pozostało ${spokenRemaining(data.remaining)}.`);
      return;
    }

    // CZAS PRZEPRACOWANY
    if (
      command.includes("ile przepracowałem") ||
      command.includes("ile pracuję") ||
      command.includes("czas pracy") ||
      command.includes("ile już")
    ) {
      if (!data) {
        speak("Nie mam zapisanego harmonogramu.");
        return;
      }

      speak(`Do tej pory przepracowano ${spokenRemaining(data.elapsed)}.`);
      return;
    }

    // ZAROBKI
    if (
      command.includes("zarob") ||
      command.includes("ile pieniędzy")
    ) {
      if (!data) {
        speak("Nie mogę obliczyć wynagrodzenia. Najpierw skonfiguruj służbę.");
        return;
      }

      speak(
        `Szacunkowe wynagrodzenie za bieżącą służbę wynosi ${moneyToSpeech(data.earnings)}. Stawka godzinowa to ${data.rate} złotych.`
      );
      return;
    }

    // STAWKA
    if (
      command.includes("stawka") ||
      command.includes("ile za godzinę")
    ) {
      if (!data) {
        speak("Ustaw stawkę godzinową w konfiguracji służby.");
        return;
      }

      speak(`Twoja ustawiona stawka wynosi ${data.rate} złotych za godzinę.`);
      return;
    }

    // HUMOR
    if (command.includes("włącz humor")) {
      setToggle("humorToggle", true);
      speak("Humorystyczne komunikaty zostały włączone.");
      return;
    }

    if (command.includes("wyłącz humor")) {
      setToggle("humorToggle", false);
      speak("Humorystyczne komunikaty zostały wyłączone.");
      return;
    }

    // PATROL
    if (
      command.includes("włącz patrol") ||
      command.includes("włącz przypomnienie o patrolu")
    ) {
      setToggle("patrolToggle", true);
      speak("Przypomnienia o patrolu zostały włączone.");
      return;
    }

    if (
      command.includes("wyłącz patrol") ||
      command.includes("wyłącz przypomnienie o patrolu")
    ) {
      setToggle("patrolToggle", false);
      speak("Przypomnienia o patrolu zostały wyłączone.");
      return;
    }

    // RAPORT OBECNOŚCI
    if (command.includes("włącz raport obecności")) {
      setToggle("reportToggle", true);
      speak("Przypomnienia o raporcie obecności zostały włączone.");
      return;
    }

    if (command.includes("wyłącz raport obecności")) {
      setToggle("reportToggle", false);
      speak("Przypomnienia o raporcie obecności zostały wyłączone.");
      return;
    }

    // RAPORT DOWÓDCY
    if (
      command.includes("pełny raport") ||
      command.includes("raport dowódcy")
    ) {
      if (!data) {
        speak("Brak skonfigurowanego harmonogramu. Nie mogę wygenerować raportu.");
        return;
      }

      const remaining = data.status === "AKTYWNA"
        ? spokenRemaining(data.remaining)
        : data.status === "ZAKOŃCZONA"
          ? "zero"
          : "służba jeszcze się nie rozpoczęła";

      speak(
        `Raport COMMANDER. Status: ${data.status}. Pozostały czas: ${remaining}. Szacunkowe wynagrodzenie: ${moneyToSpeech(data.earnings)}. Stawka: ${data.rate} złotych za godzinę.`
      );
      return;
    }

    // POMOC
    if (
      command.includes("pomoc") ||
      command.includes("co potrafisz") ||
      command.includes("lista poleceń")
    ) {
      speak(
        "Mogę podać status służby, czas do końca, przepracowany czas, zarobki, stawkę i aktualną godzinę. Mogę też włączać i wyłączać humor, przypomnienia patrolu oraz raport obecności."
      );
      return;
    }

    // POWTÓRZ
    if (command.includes("powtórz")) {
      if (lastAnswer) {
        speak(lastAnswer);
      } else {
        speak("Nie ma jeszcze komunikatu do powtórzenia.");
      }
      return;
    }

    speak(
      "Nie rozpoznaję tego polecenia. Powiedz pomoc, aby usłyszeć listę dostępnych komend."
    );
  }

  // ROZPOZNAWANIE MOWY

  function restartRecognition() {
    if (!recognition || !listening || restartBlocked) return;

    try {
      recognition.start();
    } catch (_) {
      // Przeglądarka może kończyć poprzednią sesję.
    }
  }

  function startListening() {
    if (!Recognition) {
      addLog(
        "Ta przeglądarka nie obsługuje rozpoznawania mowy. Użyj pola tekstowego.",
        "error"
      );

      setState("MIKROFON NIEDOSTĘPNY", "UŻYJ POLECENIA TEKSTOWEGO");
      return;
    }

    if (listening) return;

    restartBlocked = false;
    recognition = new Recognition();

    recognition.lang = "pl-PL";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listening = true;
      ui.listen.disabled = true;
      ui.stop.disabled = false;
      ui.status.textContent = "LISTENING";

      setState("NASŁUCH AKTYWNY", "MÓW DO MIKROFONU");
      setCoreMode("listening");
    };

    recognition.onresult = event => {
      const result = event.results[event.results.length - 1];

      if (!result || !result[0]) return;

      const transcript = result[0].transcript.trim();

      if (transcript) executeCommand(transcript);
    };

    recognition.onerror = event => {
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        listening = false;
        restartBlocked = true;

        ui.listen.disabled = false;
        ui.stop.disabled = true;
        ui.status.textContent = "MICROPHONE BLOCKED";

        setState(
          "BRAK DOSTĘPU DO MIKROFONU",
          "SPRAWDŹ UPRAWNIENIA PRZEGLĄDARKI"
        );

        addLog("Brak zgody na mikrofon.", "error");
        return;
      }

      if (event.error !== "no-speech" && event.error !== "aborted") {
        addLog("Błąd rozpoznawania mowy: " + event.error, "error");
      }
    };

    recognition.onend = () => {
      if (listening && !restartBlocked) {
        setTimeout(restartRecognition, 300);
      } else if (!listening) {
        ui.listen.disabled = false;
        ui.stop.disabled = true;
        setCoreMode("");
        setState("SYSTEM GOTOWY", "OCZEKIWANIE NA OPERATORA");
      }
    };

    try {
      recognition.start();
      addLog("Uruchomiono nasłuch głosowy.");
    } catch (error) {
      listening = false;
      addLog("Nie udało się uruchomić mikrofonu: " + error.message, "error");
    }
  }

  function stopListening() {
    listening = false;
    restartBlocked = true;

    if (recognition) {
      try {
        recognition.stop();
      } catch (_) {}
    }

    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
    }

    ui.listen.disabled = false;
    ui.stop.disabled = true;
    ui.status.textContent = "AI READY";

    setCoreMode("");
    setState("NASŁUCH WYŁĄCZONY", "SYSTEM OCZEKUJE NA OPERATORA");

    addLog("Nasłuch głosowy został wyłączony.");
  }

  // OBSŁUGA INTERFEJSU

  ui.form.addEventListener("submit", event => {
    event.preventDefault();

    const command = ui.input.value.trim();

    if (!command) return;

    ui.input.value = "";
    executeCommand(command);
  });

  ui.listen.addEventListener("click", startListening);
  ui.stop.addEventListener("click", stopListening);

  ui.repeat.addEventListener("click", () => {
    if (lastAnswer) {
      speak(lastAnswer);
    } else {
      speak("Nie mam jeszcze komunikatu do powtórzenia.");
    }
  });

  document.querySelectorAll("[data-commander-command]").forEach(button => {
    button.addEventListener("click", () => {
      executeCommand(button.dataset.commanderCommand);
    });
  });

  window.addEventListener("pagehide", () => {
    listening = false;

    try {
      recognition?.stop();
    } catch (_) {}
  });

  addLog("COMMANDER AI 2.0: moduł załadowany.");
  addLog("Tryb: lokalne polecenia głosowe i tekstowe.");
  addLog("Wpisz 'pomoc', aby zobaczyć dostępne komendy.");

  setState("SYSTEM GOTOWY", "OCZEKIWANIE NA OPERATORA");

  console.info("COMMANDER AI 2.0: ONLINE");
})();
