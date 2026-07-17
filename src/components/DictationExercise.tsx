import React, { useState, useEffect } from "react";
import { Volume2, Play, Pause, Square, RotateCcw, Check, Sparkles, AlertCircle, HelpCircle, ArrowLeft, ArrowRight, BookOpen, Clock } from "lucide-react";
import { Lesson } from "../types";

interface DictationExerciseProps {
  lesson: Lesson;
  playbackSpeed: number;
  playSentence: (text: string) => void;
  stopPlayback: () => void;
}

interface DiffPart {
  word: string;
  status: "correct" | "incorrect" | "missing" | "extra";
}

export default function DictationExercise({
  lesson,
  playbackSpeed,
  playSentence,
  stopPlayback,
}: DictationExerciseProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userText, setUserText] = useState("");
  const [checked, setChecked] = useState(false);
  const [diffResults, setDiffResults] = useState<DiffPart[]>([]);
  const [accuracy, setAccuracy] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [playbackActive, setPlaybackActive] = useState(false);

  // Reset currentIdx and state when lesson changes
  useEffect(() => {
    setCurrentIdx(0);
    setUserText("");
    setChecked(false);
    setDiffResults([]);
    setIsLooping(false);
    setPlaybackActive(false);
  }, [lesson]);

  // Stop playback when changing sentence or unmounting
  useEffect(() => {
    stopPlayback();
    setUserText("");
    setChecked(false);
    setDiffResults([]);
    setIsLooping(false);
    setPlaybackActive(false);
  }, [currentIdx]);

  useEffect(() => {
    let loopInterval: NodeJS.Timeout | null = null;
    const sentenceText = lesson.sentences[currentIdx] || lesson.sentences[0] || "";
    
    if (isLooping && playbackActive && sentenceText) {
      // Estimate playing time based on character length + slow factor
      const durationMs = Math.max(3000, sentenceText.length * 100 * (1 / playbackSpeed));
      
      loopInterval = setInterval(() => {
        playSentence(sentenceText);
      }, durationMs);
    }

    return () => {
      if (loopInterval) clearInterval(loopInterval);
    };
  }, [isLooping, playbackActive, currentIdx, playbackSpeed, lesson]);

  const handlePlay = () => {
    const sentenceText = lesson.sentences[currentIdx] || lesson.sentences[0] || "";
    if (sentenceText) {
      playSentence(sentenceText);
      setPlaybackActive(true);
    }
  };

  const handleStop = () => {
    stopPlayback();
    setPlaybackActive(false);
    setIsLooping(false);
  };

  const toggleLoop = () => {
    const nextLoopState = !isLooping;
    setIsLooping(nextLoopState);
    if (nextLoopState) {
      const sentenceText = lesson.sentences[currentIdx] || lesson.sentences[0] || "";
      if (sentenceText) {
        playSentence(sentenceText);
        setPlaybackActive(true);
      }
    }
  };

  // Safe split that filters punctuation
  const cleanWord = (w: string) => w.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "").trim();

  const handleCheckAnswer = () => {
    const correctStr = lesson.sentences[currentIdx] || lesson.sentences[0] || "";
    const userStr = userText;

    const correctWords = correctStr.split(/\s+/).filter(Boolean);
    const userWords = userStr.split(/\s+/).filter(Boolean);

    const result: DiffPart[] = [];
    let cIdx = 0;
    let uIdx = 0;
    let correctCount = 0;

    while (cIdx < correctWords.length || uIdx < userWords.length) {
      if (cIdx < correctWords.length && uIdx < userWords.length) {
        const cClean = cleanWord(correctWords[cIdx]);
        const uClean = cleanWord(userWords[uIdx]);

        if (cClean === uClean) {
          result.push({ word: correctWords[cIdx], status: "correct" });
          correctCount++;
          cIdx++;
          uIdx++;
        } else {
          // Look ahead in correct words (user missed some words)
          let foundMatchAhead = false;
          for (let look = cIdx + 1; look < Math.min(cIdx + 4, correctWords.length); look++) {
            if (cleanWord(correctWords[look]) === uClean) {
              // Mark prior correct words as missing
              for (let m = cIdx; m < look; m++) {
                result.push({ word: correctWords[m], status: "missing" });
              }
              result.push({ word: correctWords[look], status: "correct" });
              correctCount++;
              cIdx = look + 1;
              uIdx++;
              foundMatchAhead = true;
              break;
            }
          }

          if (!foundMatchAhead) {
            // Look ahead in user words (user added some extra words)
            for (let look = uIdx + 1; look < Math.min(uIdx + 4, userWords.length); look++) {
              if (cClean === cleanWord(userWords[look])) {
                // Mark prior user words as extra
                for (let e = uIdx; e < look; e++) {
                  result.push({ word: userWords[e], status: "extra" });
                }
                result.push({ word: correctWords[cIdx], status: "correct" });
                correctCount++;
                cIdx++;
                uIdx = look + 1;
                foundMatchAhead = true;
                break;
              }
            }
          }

          if (!foundMatchAhead) {
            // If they just made a typo, display expected/actual side by side
            result.push({
              word: `${correctWords[cIdx]} (expected) / ${userWords[uIdx]} (typed)`,
              status: "incorrect"
            });
            cIdx++;
            uIdx++;
          }
        }
      } else if (cIdx < correctWords.length) {
        result.push({ word: correctWords[cIdx], status: "missing" });
        cIdx++;
      } else if (uIdx < userWords.length) {
        result.push({ word: userWords[uIdx], status: "extra" });
        uIdx++;
      }
    }

    // Calculate accuracy percentage
    const maxWords = Math.max(correctWords.length, 1);
    const calculatedAccuracy = Math.round((correctCount / maxWords) * 100);

    setAccuracy(calculatedAccuracy);
    setDiffResults(result);
    setChecked(true);
  };

  const handleNext = () => {
    if (currentIdx < lesson.sentences.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx((prev) => prev - 1);
    }
  };

  return (
    <div className="bg-white/60 backdrop-blur-md border border-nat-tan rounded-3xl p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-nat-tan pb-3 mb-4">
        <div className="flex items-center gap-2 text-nat-sage">
          <BookOpen size={18} />
          <span className="font-bold text-sm">Sentence {currentIdx + 1} of {lesson.sentences.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrev}
            disabled={currentIdx === 0}
            className="p-1.5 bg-white border border-nat-tan hover:bg-nat-cream disabled:opacity-40 text-nat-sage rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
          </button>
          <button
            onClick={handleNext}
            disabled={currentIdx === lesson.sentences.length - 1}
            className="p-1.5 bg-white border border-nat-tan hover:bg-nat-cream disabled:opacity-40 text-nat-sage rounded-lg transition-colors cursor-pointer"
          >
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Playback Controls Container */}
        <div className="bg-nat-cream/40 border border-nat-tan rounded-2xl p-5 shadow-inner flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-bold text-nat-sage/80 uppercase tracking-widest block mb-2">
            Audio Dictation Controller
          </span>
          
          <div className="flex items-center gap-3">
            {/* Play Button */}
            <button
              onClick={handlePlay}
              className="p-3 bg-nat-gold hover:bg-nat-gold-light text-nat-dark rounded-full transition-all flex items-center justify-center cursor-pointer shadow-sm"
              title="Play Sentence"
            >
              <Play size={20} className="fill-nat-dark" />
            </button>

            {/* Loop Toggle Button */}
            <button
              onClick={toggleLoop}
              className={`px-4 py-2 text-xs font-semibold rounded-full border transition-all flex items-center gap-1.5 cursor-pointer ${
                isLooping
                  ? "bg-nat-forest border-nat-forest text-white shadow-sm"
                  : "bg-white hover:bg-nat-cream border-nat-tan text-nat-sage"
              }`}
            >
              <Clock size={13} className={isLooping ? "animate-spin" : ""} />
              <span>{isLooping ? "Loop Playing..." : "Toggle Infinite Loop"}</span>
            </button>

            {/* Stop Button */}
            <button
              onClick={handleStop}
              className="p-3 bg-red-50 hover:bg-red-100 text-red-700 rounded-full transition-all flex items-center justify-center cursor-pointer"
              title="Stop Playback"
            >
              <Square size={16} className="fill-red-700 stroke-red-700" />
            </button>
          </div>

          <p className="text-[11px] text-nat-sage/80 mt-3 max-w-sm leading-relaxed">
            {isLooping 
              ? "The sentence will play repeatedly with spacing to allow you to write." 
              : "Listen carefully to the spoken sentence, then write it exactly down below."}
          </p>
        </div>

        {/* Text Input Block */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-nat-sage block">
            Your Listening Transcript:
          </label>
          <textarea
            value={userText}
            onChange={(e) => setUserText(e.target.value)}
            disabled={checked}
            placeholder="Type what you hear. Pay close attention to punctuation, contraction words, and spellings..."
            rows={4}
            className="w-full text-sm bg-white border border-nat-tan rounded-2xl p-4 outline-none focus:border-nat-forest transition-colors shadow-inner resize-none leading-relaxed text-nat-dark"
          />
        </div>

        {/* Correct Answer Diff Block */}
        {checked && (
          <div className="bg-white border border-nat-tan rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-nat-tan pb-2.5">
              <span className="text-xs font-bold text-nat-sage">Listening Analysis</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-nat-sage/80 font-medium">Accuracy Rating:</span>
                <span className={`text-sm font-bold px-2.5 py-0.5 rounded ${
                  accuracy >= 90
                    ? "bg-nat-sand text-nat-sage border border-nat-tan"
                    : accuracy >= 70
                    ? "bg-nat-gold-light text-nat-dark border border-nat-gold/40"
                    : "bg-red-50 text-red-800 border border-red-100"
                }`}>
                  {accuracy}%
                </span>
              </div>
            </div>

            {/* Word Alignment Visualizer */}
            <div>
              <span className="text-[10px] font-bold text-nat-sage/80 uppercase tracking-widest block mb-2">
                Word-by-word spelling review (单词比对)
              </span>
              <div className="flex flex-wrap gap-x-2 gap-y-1.5 p-3.5 bg-nat-cream/40 border border-nat-tan rounded-xl font-medium text-sm leading-relaxed text-nat-dark">
                {diffResults.map((part, idx) => {
                  if (part.status === "correct") {
                    return (
                      <span key={idx} className="text-nat-forest bg-nat-gold-light/40 px-1 py-0.5 rounded border border-nat-tan" title="Correct">
                        {part.word}
                      </span>
                    );
                  } else if (part.status === "missing") {
                    return (
                      <span key={idx} className="text-nat-sage/50 bg-stone-100/30 px-1 py-0.5 rounded border border-nat-tan/40 line-through" title="Missed word">
                        {part.word}
                      </span>
                    );
                  } else if (part.status === "extra") {
                    return (
                      <span key={idx} className="text-nat-gold bg-nat-gold-light px-1 py-0.5 rounded border border-nat-gold/40" title="Extra inserted word">
                        {part.word}
                      </span>
                    );
                  } else {
                    return (
                      <span key={idx} className="text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 font-bold" title="Misspelled/Incorrect word">
                        {part.word}
                      </span>
                    );
                  }
                })}
              </div>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-nat-sage font-bold px-1">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded bg-nat-forest block"></span> Correct
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded bg-red-500 block"></span> Misspelled / Wrong
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded bg-nat-sage/40 block"></span> Missed
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded bg-nat-gold block"></span> Extra Input
                </div>
              </div>
            </div>

            {/* Explanation Feedback message */}
            <div className="p-3 bg-nat-cream/40 rounded-xl flex gap-2 border border-nat-tan/50">
              {accuracy >= 90 ? (
                <>
                  <Sparkles size={16} className="text-nat-sage shrink-0" />
                  <p className="text-xs text-nat-dark leading-relaxed">
                    <span className="font-bold text-nat-forest">Spectacular Kiwi ear!</span> You transcribed this sentence almost flawlessly. Proceed to the next sentence!
                  </p>
                </>
              ) : accuracy >= 60 ? (
                <>
                  <AlertCircle size={16} className="text-nat-gold shrink-0" />
                  <p className="text-xs text-nat-dark leading-relaxed">
                    <span className="font-bold text-nat-gold">Pretty close!</span> You've got the general idea. Toggle <span className="font-semibold">Loop Playing</span> and slow down the speed slider to check the specific syllables you missed!
                  </p>
                </>
              ) : (
                <>
                  <AlertCircle size={16} className="text-red-500 shrink-0" />
                  <p className="text-xs text-nat-dark leading-relaxed">
                    <span className="font-bold text-red-700">Good attempt!</span> New Zealand accents can have strong vowel shifts. Try using the <span className="font-semibold">Premium AI Voice Engine</span> or slow down playback speed to <span className="font-bold">0.75x</span> to practice again!
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Submit Actions */}
        <div className="flex justify-between items-center gap-3">
          {!checked ? (
            <button
              onClick={handleCheckAnswer}
              disabled={!userText.trim()}
              className="w-full bg-nat-forest hover:bg-nat-dark disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check size={16} />
              <span>Submit & Compare Transcript</span>
            </button>
          ) : (
            <div className="flex gap-3 w-full">
              <button
                onClick={() => {
                  setChecked(false);
                  setDiffResults([]);
                }}
                className="flex-1 border border-nat-tan bg-white hover:bg-nat-cream text-nat-sage text-xs font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>Retry Sentence</span>
              </button>
              {currentIdx < lesson.sentences.length - 1 && (
                <button
                  onClick={() => {
                    handleNext();
                  }}
                  className="flex-1 bg-nat-forest hover:bg-nat-dark text-white text-xs font-semibold py-3 rounded-xl shadow-sm transition-all flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>Next Sentence</span>
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
