/**
 * KiwiListen Connected-Speech Quiz
 *
 * Quiz flow:
 *   1. For each question, play the sentence audio
 *   2. Show sentence with one word blanked (hardest to hear)
 *   3. User picks from 4 options
 *   4. Immediate feedback (correct/wrong)
 *   5. Next question
 *   6. Summary at the end
 */
(function () {
  "use strict";

  // ── State ───────────────────────────────────────────────────────────────────
  var currentQ   = 0;
  var score      = 0;
  var answered   = false;
  var audioUrl   = "/api/article/" + SLUG + "/audio";
  var playSpeed  = typeof SPEED !== "undefined" ? SPEED : 1.0;

  // ── Elements ────────────────────────────────────────────────────────────────
  var audioEl      = document.getElementById("quiz-audio");
  var sentenceEl   = document.getElementById("quiz-sentence");
  var optionsEl    = document.getElementById("quiz-options");
  var hintEl       = document.getElementById("quiz-hint");
  var playBtn      = document.getElementById("quiz-play");
  var nextBtn      = document.getElementById("quiz-next");
  var progressEl   = document.getElementById("quiz-progress");
  var scoreLabel   = document.getElementById("score-label");
  var qLabel       = document.getElementById("q-label");
  var cardEl       = document.getElementById("quiz-card");
  var summaryEl    = document.getElementById("quiz-summary");
  var summaryScore = document.getElementById("summary-score");
  var summaryMsg   = document.getElementById("summary-msg");

  // ── Build progress dots ─────────────────────────────────────────────────────
  var dots = [];
  for (var i = 0; i < TOTAL; i++) {
    var dot = document.createElement("div");
    dot.className = "quiz-dot";
    progressEl.appendChild(dot);
    dots.push(dot);
  }

  // ── Render question ─────────────────────────────────────────────────────────
  function renderQuestion(idx) {
    if (idx >= TOTAL) { showSummary(); return; }

    answered = false;
    currentQ = idx;
    var q = QUIZ_DATA[idx];
    var sentObj = SENTENCES[q.hint_index];
    var sentText = sentObj.text;

    // Build sentence HTML with blank at the correct word index
    var parts = sentText.split(/(\s+)/);
    var html = "";
    var wordIdx = 0;
    var blankCount = 0;
    for (var j = 0; j < parts.length; j++) {
      var part = parts[j];
      if (/^\s+$/.test(part)) { html += part; continue; }
      // Only blank the word at blank_index — show underscores, NOT the word
      if (wordIdx === q.blank_index && blankCount === 0) {
        html += '<span class="quiz-blank" id="blank-spot">______</span>';
        blankCount++;
      } else {
        html += '<span>' + part + '</span>';
      }
      wordIdx++;
    }
    if (blankCount === 0) {
      // Fallback: just show the sentence
      html = '<span>' + sentText + '</span> <span class="quiz-blank" id="blank-spot">???</span>';
    }
    sentenceEl.innerHTML = html;

    // Options
    optionsEl.innerHTML = "";
    q.options.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.className = "quiz-opt-btn";
      btn.textContent = opt;
      btn.addEventListener("click", function () { handleAnswer(opt, q); });
      optionsEl.appendChild(btn);
    });

    // Reset UI
    hintEl.textContent = "";
    nextBtn.style.display = "none";
    playBtn.classList.remove("playing");

    // Update progress
    dots.forEach(function (d, k) {
      d.classList.toggle("active", k === idx);
    });
    scoreLabel.textContent = "Score: " + score + " / " + idx;
    qLabel.textContent    = "Question " + (idx + 1) + " / " + TOTAL;

    // Auto-play sentence
    playSentence(q.hint_index);
  }

  // ── Play sentence audio ─────────────────────────────────────────────────────
  function playSentence(sentIdx) {
    var q = QUIZ_DATA[currentQ];
    var sent = SENTENCES[q.hint_index];
    var s = sent.start_sec;
    var e = sent.end_sec;

    audioEl.src = audioUrl;
    audioEl.currentTime = s;
    audioEl.playbackRate = playSpeed;
    playBtn.classList.add("playing");
    audioEl.play().catch(function () {});

    audioEl.ontimeupdate = function () {
      if (audioEl.currentTime >= e - 0.05) {
        audioEl.pause();
        playBtn.classList.remove("playing");
        audioEl.ontimeupdate = null;
      }
    };
  }

  // ── Handle answer ───────────────────────────────────────────────────────────
  function handleAnswer(picked, q) {
    if (answered) return;
    answered = true;

    var correct = picked.toLowerCase().replace(/[.,!?;:'"]/g, "") ===
                  q.correct_answer.toLowerCase().replace(/[.,!?;:'"]/g, "");

    // Highlight buttons
    var btns = optionsEl.querySelectorAll(".quiz-opt-btn");
    btns.forEach(function (b) {
      b.disabled = true;
      var isCorrect = b.textContent.toLowerCase().replace(/[.,!?;:'"]/g, "") ===
                      q.correct_answer.toLowerCase().replace(/[.,!?;:'"]/g, "");
      if (isCorrect) b.classList.add("correct-pick");
      if (b.textContent === picked && !correct) b.classList.add("wrong-pick");
    });

    // Reveal blank with correct word
    var blank = document.getElementById("blank-spot");
    if (blank) {
      blank.textContent = q.correct_answer;
      blank.classList.add(correct ? "revealed" : "wrong-reveal");
    }

    // Score
    if (correct) {
      score++;
      dots[currentQ].classList.add("correct");
      hintEl.textContent = "✓ Correct!";
      hintEl.style.color = "#16a34a";
    } else {
      dots[currentQ].classList.add("wrong");
      hintEl.textContent = "✗ The answer was: " + q.correct_answer;
      hintEl.style.color = "#dc2626";
    }

    // Show next button
    nextBtn.style.display = "inline-block";
    if (currentQ >= TOTAL - 1) {
      nextBtn.textContent = "See Results →";
    } else {
      nextBtn.textContent = "Next →";
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  function showSummary() {
    cardEl.style.display = "none";
    summaryEl.style.display = "block";
    summaryScore.textContent = score + " / " + TOTAL;

    var pct = Math.round((score / TOTAL) * 100);
    if (pct === 100) {
      summaryMsg.textContent = "Perfect score! You can hear connected speech like a Kiwi. 🥝";
    } else if (pct >= 70) {
      summaryMsg.textContent = "Great job! You're tuning your ear to NZ pronunciation.";
    } else if (pct >= 40) {
      summaryMsg.textContent = "Not bad — connected speech takes practice. Try again!";
    } else {
      summaryMsg.textContent = "Keep practicing! Listen to each sentence carefully and replay if needed.";
    }

    // Save score to server
    var fd = new FormData();
    fd.append("slug", SLUG);
    fd.append("score", score);
    fd.append("total", TOTAL);
    fd.append("difficulty", typeof DIFFICULTY !== "undefined" ? DIFFICULTY : "medium");
    fd.append("speed", typeof SPEED !== "undefined" ? SPEED : 1.0);
    fetch("/api/quiz-score", { method: "POST", body: fd }).catch(function () {});

    // Fetch and show past scores
    fetch("/api/quiz-stats/" + SLUG)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var el = document.getElementById("past-scores");
        if (!el || !data.recent || data.recent.length === 0) return;
        var html = '<div style="margin-top:8px;"><strong>Your recent attempts:</strong><br>';
        data.recent.forEach(function (s) {
          var d = new Date(s.created_at);
          var dateStr = d.toLocaleDateString();
          html += '<span style="display:inline-block;margin:2px 8px;">' +
            dateStr + ': ' + s.score + '/' + s.total +
            ' (' + s.difficulty + ')</span>';
        });
        html += '</div>';
        el.innerHTML = html;
      })
      .catch(function () {});
  }

  // ── Event listeners ─────────────────────────────────────────────────────────
  playBtn.addEventListener("click", function () {
    playSentence(QUIZ_DATA[currentQ].hint_index);
  });

  nextBtn.addEventListener("click", function () {
    renderQuestion(currentQ + 1);
  });

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.code === "Space" || e.code === "KeyP") {
      e.preventDefault();
      playSentence(QUIZ_DATA[currentQ].hint_index);
    }
    if (e.code === "Enter" && answered) {
      renderQuestion(currentQ + 1);
    }
    if (e.code >= "Digit1" && e.code <= "Digit4") {
      var idx = parseInt(e.code.replace("Digit", "")) - 1;
      var btns = optionsEl.querySelectorAll(".quiz-opt-btn:not(:disabled)");
      if (btns[idx]) btns[idx].click();
    }
  });

  // ── Settings restart ────────────────────────────────────────────────────────
  var applyBtn = document.getElementById("apply-settings");
  if (applyBtn) {
    applyBtn.addEventListener("click", function (e) {
      e.preventDefault();
      var diff = document.getElementById("sel-difficulty").value;
      var cnt  = document.getElementById("sel-count").value;
      var spd  = document.getElementById("sel-speed").value;
      window.location.href = "/quiz/" + SLUG + "?difficulty=" + diff + "&sentences=" + cnt + "&speed=" + spd;
    });
  }

  // ── Start ───────────────────────────────────────────────────────────────────
  renderQuestion(0);

})();