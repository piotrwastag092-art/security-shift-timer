
/*
 * SECURITY SHIFT TERMINAL — LIVE LINK
 * Transmisja audio-wideo przez WebRTC / PeerJS.
 * Jeden odbiorca na pokój.
 * Link jest prywatnym kluczem dostępu.
 */

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const ui = {
    status: $("liveStatus"),
    dot: $("liveStatusDot"),
    count: $("livePeerCount"),
    mode: $("liveModeLabel"),
    local: $("localVideo"),
    remote: $("remoteVideo"),
    localState: $("localVideoState"),
    remoteState: $("remoteVideoState"),
    start: $("liveStartBtn"),
    join: $("liveJoinBtn"),
    copy: $("liveCopyBtn"),
    stop: $("liveStopBtn"),
    linkWrap: $("liveLinkWrap"),
    url: $("liveShareUrl"),
    feedback: $("liveFeedback")
  };

  if (Object.values(ui).some(element => !element)) {
    console.error("LIVE LINK: brakuje elementów HTML.");
    return;
  }

  const params = new URLSearchParams(location.search);
  const hostId = params.get("watch");
  const invitation = params.get("key");
  const isHost = !hostId;

  let peer = null;
  let stream = null;
  let call = null;
  let dataConn = null;
  let guestId = null;
  let starting = false;

  ui.mode.textContent = isHost
    ? "TRYB NADAWCY"
    : "TRYB ODBIORCY";

  ui.start.hidden = !isHost;
  ui.join.hidden = isHost;

  function setStatus(message, active = false) {
    ui.status.textContent = message;
    ui.dot.classList.toggle("active", active);
  }

  function feedback(message) {
    ui.feedback.textContent = message;
  }

  function setConnected(value) {
    ui.count.textContent = value
      ? "1 POŁĄCZENIE"
      : "0 POŁĄCZEŃ";

    if (value) {
      setStatus("POŁĄCZENIE AUDIO-WIDEO AKTYWNE", true);
    }
  }

  function stopStream(mediaStream) {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
    }
  }

  function createPeer() {
    if (!window.Peer) {
      throw new Error(
        "Biblioteka PeerJS nie została załadowana. Odśwież stronę."
      );
    }

    return new Peer(undefined, { debug: 1 });
  }

  async function requestMedia() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Kamera wymaga HTTPS i nowoczesnej przeglądarki."
      );
    }

    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 30 }
      }
    });
  }

  function attachCall(incomingCall) {
    if (call && call !== incomingCall) {
      call.close();
    }

    call = incomingCall;

    call.on("stream", remoteStream => {
      ui.remote.srcObject = remoteStream;
      ui.remoteState.textContent = "ONLINE";

      ui.remote.play().catch(() => {});

      setConnected(true);

      feedback(
        "Połączenie działa. Obraz i dźwięk są przesyłane na żywo."
      );
    });

    call.on("close", () => {
      ui.remote.srcObject = null;
      ui.remoteState.textContent = "ROZŁĄCZONO";

      setConnected(false);

      feedback("Druga strona zakończyła połączenie.");
    });

    call.on("error", error => {
      feedback(
        "Błąd połączenia: " +
        (error.message || "spróbuj ponownie.")
      );
    });
  }

  function stopAll(message = "Transmisja została zakończona.") {
    try {
      if (call) call.close();
    } catch (_) {}

    try {
      if (dataConn) dataConn.close();
    } catch (_) {}

    try {
      if (peer && !peer.destroyed) peer.destroy();
    } catch (_) {}

    stopStream(stream);

    peer = null;
    stream = null;
    call = null;
    dataConn = null;
    guestId = null;

    ui.local.srcObject = null;
    ui.remote.srcObject = null;

    ui.localState.textContent = "OFFLINE";
    ui.remoteState.textContent = "OCZEKIWANIE";

    ui.linkWrap.hidden = true;
    ui.copy.disabled = true;
    ui.stop.disabled = true;

    ui.start.disabled = false;
    ui.join.disabled = false;

    setConnected(false);
    setStatus("TRANSMISJA ZAKOŃCZONA");

    feedback(message);
  }

  /* =====================================
     NADAWCA — TWOJA KAMERA
  ===================================== */

  async function startHost() {
    if (starting || peer) return;

    starting = true;
    ui.start.disabled = true;

    feedback(
      "Zezwól przeglądarce na dostęp do kamery i mikrofonu."
    );

    try {
      stream = await requestMedia();

      ui.local.srcObject = stream;
      ui.localState.textContent = "KAMERA I MIKROFON AKTYWNE";

      ui.local.play().catch(() => {});

      peer = createPeer();

      peer.on("open", id => {
        const key = (
          crypto.randomUUID
            ? crypto.randomUUID()
            : id + "-" + Math.random().toString(36).slice(2)
        );

        peer.metadata = { invitation: key };

        const shareUrl = new URL(location.href);

        shareUrl.search = "";
        shareUrl.hash = "";

        shareUrl.searchParams.set("watch", id);
        shareUrl.searchParams.set("key", key);

        ui.url.value = shareUrl.toString();

        ui.linkWrap.hidden = false;
        ui.copy.disabled = false;
        ui.stop.disabled = false;

        setStatus(
          "POKÓJ GOTOWY — OCZEKIWANIE NA GOŚCIA",
          true
        );

        feedback(
          "Kamera działa. Skopiuj link i wyślij go Marcinowi."
        );
      });

      peer.on("connection", connection => {
        if (dataConn || guestId) {
          connection.close();
          return;
        }

        dataConn = connection;

        connection.on("data", data => {
          const validInvitation =
            data &&
            data.type === "join" &&
            data.key === peer.metadata.invitation &&
            data.peerId;

          if (!validInvitation || guestId) {
            connection.close();
            dataConn = null;
            return;
          }

          guestId = data.peerId;

          feedback(
            "Gość dołączył. Uruchamiam kanał audio-wideo..."
          );

          const outgoingCall = peer.call(guestId, stream);

          if (outgoingCall) {
            attachCall(outgoingCall);
          }
        });

        connection.on("close", () => {
          dataConn = null;
          guestId = null;

          if (call) {
            call.close();
            call = null;
          }

          ui.remote.srcObject = null;
          ui.remoteState.textContent = "OCZEKIWANIE";

          setConnected(false);

          feedback(
            "Gość rozłączył się. Link nadal działa."
          );
        });
      });

      peer.on("error", error => {
        feedback(
          "Błąd transmisji: " +
          (error.message || error.type || "spróbuj ponownie.")
        );
      });

    } catch (error) {
      stopAll(
        "Nie udało się uruchomić transmisji: " +
        (error.message || error)
      );

    } finally {
      starting = false;
      ui.start.disabled = false;
    }
  }

  /* =====================================
     ODBIORCA — MARCIN
  ===================================== */

  async function joinRoom() {
    if (starting || peer) return;

    if (!hostId || !invitation) {
      feedback(
        "Link jest niepełny. Poproś nadawcę o nowy link."
      );
      return;
    }

    starting = true;
    ui.join.disabled = true;

    feedback(
      "Zezwól przeglądarce na dostęp do kamery i mikrofonu."
    );

    try {
      stream = await requestMedia();

      ui.local.srcObject = stream;
      ui.localState.textContent = "KAMERA I MIKROFON AKTYWNE";

      ui.local.play().catch(() => {});

      peer = createPeer();

      peer.on("open", () => {
        dataConn = peer.connect(hostId, {
          reliable: true
        });

        dataConn.on("open", () => {
          dataConn.send({
            type: "join",
            key: invitation,
            peerId: peer.id
          });

          setStatus("ŁĄCZENIE Z NADAWCĄ...", true);

          feedback(
            "Wysłano zgłoszenie. Oczekiwanie na transmisję."
          );
        });

        dataConn.on("error", error => {
          feedback(
            "Błąd kanału: " +
            (error.message || "spróbuj ponownie.")
          );
        });
      });

      peer.on("call", incomingCall => {
        incomingCall.answer(stream);
        attachCall(incomingCall);
      });

      peer.on("error", error => {
        feedback(
          "Nie można dołączyć: " +
          (error.message || error.type || "sprawdź link.")
        );
      });

      ui.stop.disabled = false;

    } catch (error) {
      stopAll(
        "Nie udało się dołączyć: " +
        (error.message || error)
      );

    } finally {
      starting = false;
      ui.join.disabled = false;
    }
  }

  /* =====================================
     PRZYCISKI
  ===================================== */

  ui.start.addEventListener("click", startHost);

  ui.join.addEventListener("click", joinRoom);

  ui.stop.addEventListener("click", () => {
    stopAll();
  });

  ui.copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(ui.url.value);

      feedback(
        "Link skopiowany. Wyślij go Marcinowi prywatnie."
      );

    } catch (_) {
      ui.url.focus();
      ui.url.select();

      feedback(
        "Link zaznaczony. Skopiuj go skrótem Ctrl+C."
      );
    }
  });

  /* =====================================
     INICJALIZACJA
  ===================================== */

  if (!isHost) {
    setStatus("POKÓJ NADAWCY — GOTOWY DO DOŁĄCZENIA");

    feedback(
      "Kliknij DOŁĄCZ, aby połączyć się z nadawcą."
    );

  } else {
    setStatus("OCZEKIWANIE NA URUCHOMIENIE");
  }

  window.addEventListener("pagehide", () => {
    stopAll("Karta została zamknięta — transmisja zakończona.");
  });

})();
