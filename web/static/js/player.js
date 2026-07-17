/**
 * KiwiListen seek-based player.
 *
 * Architecture:
 *   - One singleton HTMLAudioElement (audio-main)
 *   - On play: set src to /api/article/{slug}/audio, seek to sentence.start_sec, play()
 *   - ontimeupdate: if past sentence.end_sec → pause, optionally loop
 *   - Loop toggle: per-sentence, stored in loopSet
 */
(function () {
  "use strict";

  // ── Elements ───────────────────────────────────────────────────────────────
  const audioMain    = document.getElementById("audio-main");
  const progressFill = document.getElementById("progress-fill");
  const progressTrack= document.getElementById("progress-track");
  const timeCur      = document.getElementById("time-cur");
  const timeDur      = document.getElementById("time-dur");
  const speedBtns    = document.querySelectorAll(".spd-btn");

  // ── State ─────────────────────────────────────────────────────────────────
  let currentNum     = null;   // sentence_num of active play
  let loopActive     = false;  // loop toggle state
  let playbackRate   = 1.0;
  let isPlaying      = false;

  // ── Speed ────────────────────────────────────────────────────────────────
  speedBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      playbackRate = parseFloat(btn.dataset.speed);
      audioMain.playbackRate = playbackRate;
      speedBtns.forEach(function (b) { b.classList.remove("spd-active"); });
      btn.classList.add("spd-active");
    });
  });

  // ── Formatting helpers ────────────────────────────────────────────────────
  function fmtTime(sec) {
    if (!isFinite(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function setProgress(sec) {
    if (!audioMain.duration) return;
    const pct = (sec / audioMain.duration) * 100;
    progressFill.style.width = pct + "%";
    timeCur.textContent = fmtTime(sec);
  }

  // ── Play a sentence ───────────────────────────────────────────────────────
  function playSentence(num) {
    const sent = SENTENCES.find(function (s) { return s.sentence_num === num; });
    if (!sent) return;

    // Update current num
    currentNum = num;
    isPlaying  = true;

    // Highlight row
    document.querySelectorAll(".sentence-row").forEach(function (row) {
      row.classList.remove("row-active");
    });
    var activeRow = document.getElementById("row-" + num);
    if (activeRow) activeRow.classList.add("row-active");

    // Build audio URL
    var audioUrl = "/api/article/" + SLUG + "/audio";

    // If switching audio src, reload
    if (audioMain.src !== audioUrl) {
      audioMain.src = audioUrl;
    }

    // Seek to sentence start and play
    audioMain.currentTime = sent.start_sec;
    audioMain.playbackRate = playbackRate;
    audioMain.play().catch(function (e) {
      console.warn("Audio play failed:", e);
    });

    setProgress(sent.start_sec);
  }

  function stopPlayback() {
    audioMain.pause();
    isPlaying = false;
    currentNum = null;
    loopActive = false;
    document.querySelectorAll(".sentence-row").forEach(function (r) {
      r.classList.remove("row-active", "row-playing");
    });
  }

  // ── Audio event: timeupdate ────────────────────────────────────────────────
  audioMain.addEventListener("timeupdate", function () {
    if (currentNum === null) return;

    var sent = SENTENCES.find(function (s) { return s.sentence_num === currentNum; });
    if (!sent) return;

    var t = audioMain.currentTime;
    setProgress(t);

    // Check if sentence end reached
    if (t >= sent.end_sec - 0.05) {
      audioMain.pause();
      if (loopActive) {
        // Replay this sentence
        audioMain.currentTime = sent.start_sec;
        audioMain.play().catch(function () {});
      } else {
        // Move to next sentence or stop
        var nextSent = SENTENCES.find(function (s) { return s.sentence_num === currentNum + 1; });
        if (nextSent) {
          playSentence(currentNum + 1);
        } else {
          isPlaying = false;
          document
            .querySelectorAll(".sentence-row")
            .forEach(function (r) { r.classList.remove("row-playing"); });
        }
      }
    }
  });

  // ── Audio event: loadedmetadata ───────────────────────────────────────────
  audioMain.addEventListener("loadedmetadata", function () {
    timeDur.textContent = fmtTime(audioMain.duration);
    setProgress(0);
  });

  // ── Audio event: ended ────────────────────────────────────────────────────
  audioMain.addEventListener("ended", function () {
    if (!loopActive && currentNum !== null) {
      var nextSent = SENTENCES.find(function (s) { return s.sentence_num === currentNum + 1; });
      if (nextSent) {
        playSentence(currentNum + 1);
      } else {
        stopPlayback();
      }
    }
  });

  // ── Progress bar click ───────────────────────────────────────────────────
  if (progressTrack) {
    progressTrack.addEventListener("click", function (e) {
      if (!audioMain.duration) return;
      var rect   = progressTrack.getBoundingClientRect();
      var ratio  = (e.clientX - rect.left) / rect.width;
      var seekTo = ratio * audioMain.duration;
      audioMain.currentTime = seekTo;
      setProgress(seekTo);
      if (currentNum !== null) {
        // Keep playing from seeked position
        audioMain.play().catch(function () {});
      }
    });
  }

  // ── Button handlers ───────────────────────────────────────────────────────
  document.querySelectorAll(".play-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var num = parseInt(btn.dataset.num, 10);
      if (currentNum === num && isPlaying && !audioMain.paused) {
        stopPlayback();
      } else {
        playSentence(num);
        document
          .querySelectorAll(".sentence-row")
          .forEach(function (r) { r.classList.remove("row-playing"); });
        var row = document.getElementById("row-" + num);
        if (row) row.classList.add("row-playing");
      }
    });
  });

  document.querySelectorAll(".loop-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var num = parseInt(btn.dataset.num, 10);
      if (currentNum !== num) {
        // Activate loop and start playing this sentence
        loopActive = true;
        document
          .querySelectorAll(".sentence-row")
          .forEach(function (r) { r.classList.remove("row-looping"); });
        var row = document.getElementById("row-" + num);
        if (row) row.classList.add("row-looping");
        playSentence(num);
      } else {
        loopActive = !loopActive;
        var row = document.getElementById("row-" + num);
        if (row) row.classList.toggle("row-looping", loopActive);
      }
    });
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    if (e.code === "Space") {
      e.preventDefault();
      if (currentNum === null || audioMain.paused) {
        if (currentNum !== null) {
          playSentence(currentNum);
        } else {
          playSentence(1);
        }
      } else {
        audioMain.pause();
      }
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      if (currentNum !== null && currentNum < SENTENCES.length) {
        playSentence(currentNum + 1);
      }
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      if (currentNum !== null && currentNum > 1) {
        playSentence(currentNum - 1);
      }
    } else if (e.key === "l" || e.key === "L") {
      e.preventDefault();
      if (currentNum !== null) {
        loopActive = !loopActive;
        document
          .querySelectorAll(".sentence-row")
          .forEach(function (r) { r.classList.remove("row-looping"); });
        var row = document.getElementById("row-" + currentNum);
        if (row) row.classList.toggle("row-looping", loopActive);
      }
    }
  });

})();