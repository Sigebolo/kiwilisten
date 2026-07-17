import React, { useState, useEffect, useRef } from "react";
import { DEFAULT_LESSONS } from "./data/articles";
import { Lesson, VocabWord } from "./types";
import DictionaryPanel from "./components/DictionaryPanel";
import VocabBookView from "./components/VocabBookView";
import DictationExercise from "./components/DictationExercise";
import ShadowingRecorder from "./components/ShadowingRecorder";
import {
  Volume2,
  BookOpen,
  VolumeX,
  FileAudio,
  Star,
  Settings,
  Plus,
  Loader2,
  CheckCircle,
  HelpCircle,
  Award,
  ChevronRight,
  BookMarked,
  Sparkles,
  RefreshCw,
  Clock,
  Check,
  Languages,
  X,
  AlertCircle,
} from "lucide-react";

// Client-side cache for premium speech audio blob URLs to prevent redundant API calls and respect rate limits
const premiumAudioCache = new Map<string, string>();

export default function App() {
  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<"materials" | "dictation" | "shadowing" | "vocab">("materials");
  const [lessons, setLessons] = useState<Lesson[]>(DEFAULT_LESSONS);
  const [selectedLessonId, setSelectedLessonId] = useState<string>("nz-slang-accent");
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [speechEngine, setSpeechEngine] = useState<"system" | "premium">("premium");
  const [premiumVoice, setPremiumVoice] = useState<string>("Kore"); // Prebuilt voices

  // Vocab State
  const [vocabList, setVocabList] = useState<VocabWord[]>([]);
  
  // Interactive word selection state
  const [selectedWord, setSelectedWord] = useState<string>("");
  const [selectedWordSentence, setSelectedWordSentence] = useState<string>("");

  // Custom lesson generator state
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [generatingCustom, setGeneratingCustom] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // HTML5 audio state for premium voice engine
  const [premiumAudio, setPremiumAudio] = useState<HTMLAudioElement | null>(null);
  const premiumAudioRef = useRef<HTMLAudioElement | null>(null);
  const [showAudioNotice, setShowAudioNotice] = useState<boolean>(true);

  // Initialize data on mount
  useEffect(() => {
    // 1. Load vocabulary list
    try {
      const savedVocab = localStorage.getItem("kiwi_vocab_list");
      if (savedVocab) {
        const parsed = JSON.parse(savedVocab);
        if (Array.isArray(parsed)) {
          setVocabList(parsed);
        }
      }
    } catch (e) {
      console.error("Failed to parse vocab list from local storage:", e);
    }

    // 2. Load custom lessons
    try {
      const savedLessons = localStorage.getItem("kiwi_custom_lessons");
      if (savedLessons) {
        const parsedCustom = JSON.parse(savedLessons);
        if (Array.isArray(parsedCustom)) {
          setLessons([...DEFAULT_LESSONS, ...parsedCustom]);
        } else {
          setLessons(DEFAULT_LESSONS);
        }
      } else {
        setLessons(DEFAULT_LESSONS);
      }
    } catch (e) {
      console.error("Failed to parse custom lessons from local storage:", e);
      setLessons(DEFAULT_LESSONS);
    }
  }, []);

  // Sync Vocab list to LocalStorage
  const updateVocabList = (newList: VocabWord[]) => {
    setVocabList(newList);
    localStorage.setItem("kiwi_vocab_list", JSON.stringify(newList));
  };

  // Helper: Trigger browser system TTS
  const speakSystem = (text: string, speed: number) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speed;

    // Look for New Zealand English voice first
    const voices = window.speechSynthesis.getVoices();
    const nzVoice = voices.find(
      (v) => v.lang === "en-NZ" || v.lang.startsWith("en-AU") || v.lang.startsWith("en-GB")
    );
    if (nzVoice) {
      utterance.voice = nzVoice;
    }
    window.speechSynthesis.speak(utterance);
  };

  // Helper: Trigger Premium AI TTS via server endpoint
  const speakPremium = async (text: string, speed: number, voice: string) => {
    if (premiumAudioRef.current) {
      premiumAudioRef.current.pause();
    }
    if (premiumAudio) {
      premiumAudio.pause();
    }

    const cacheKey = `${voice}-${text}`;
    let url = premiumAudioCache.get(cacheKey);

    try {
      if (!url) {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text, voice }),
        });

        if (!response.ok) {
          throw new Error("Failed to synthesize premium audio");
        }

        const blob = await response.blob();
        url = URL.createObjectURL(blob);
        premiumAudioCache.set(cacheKey, url);
      }

      const audio = new Audio(url);
      audio.playbackRate = speed;
      premiumAudioRef.current = audio;
      setPremiumAudio(audio);
      audio.play();
    } catch (error) {
      console.error("Premium speaking failed, falling back to system speech:", error);
      speakSystem(text, speed);
    }
  };

  // Unified speech speaker
  const playSentence = (text: string) => {
    if (speechEngine === "premium") {
      speakPremium(text, playbackSpeed, premiumVoice);
    } else {
      speakSystem(text, playbackSpeed);
    }
  };

  const stopPlayback = () => {
    if (premiumAudioRef.current) {
      premiumAudioRef.current.pause();
    }
    if (premiumAudio) {
      premiumAudio.pause();
    }
    window.speechSynthesis.cancel();
  };

  // Word Click Handlers
  const handleWordClick = (word: string, sentence: string) => {
    const sanitizedWord = word.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$|'s$/g, "");
    if (sanitizedWord.length > 0) {
      setSelectedWord(sanitizedWord);
      setSelectedWordSentence(sentence);
    }
  };

  // Vocab management handlers
  const handleAddVocab = (vocab: Omit<VocabWord, "id" | "dateAdded">) => {
    const id = `${vocab.word.toLowerCase()}-${Date.now()}`;
    const dateAdded = new Date().toISOString();
    const newWord: VocabWord = { ...vocab, id, dateAdded };
    
    // Ensure no duplicates of the same word in the same context
    const exists = vocabList.some(
      (v) => v.word.toLowerCase() === vocab.word.toLowerCase() && v.sentence === vocab.sentence
    );
    if (!exists) {
      updateVocabList([newWord, ...vocabList]);
    }
  };

  const handleRemoveVocab = (id: string) => {
    const filtered = vocabList.filter((v) => v.id !== id);
    updateVocabList(filtered);
  };

  const handleUpdateMastery = (id: string, level: number) => {
    const updated = vocabList.map((v) => (v.id === id ? { ...v, mastery: level } : v));
    updateVocabList(updated);
  };

  // Custom lesson generator handler
  const handleGenerateCustomLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPrompt.trim()) return;

    setGeneratingCustom(true);
    setGenerationError(null);

    try {
      const response = await fetch("/api/generate-lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: customPrompt }),
      });

      if (!response.ok) {
        throw new Error("Unable to contact AI Lesson developer.");
      }

      const generatedLesson = await response.json();
      const customId = `custom-${Date.now()}`;
      
      const newLesson: Lesson = {
        id: customId,
        title: generatedLesson.title,
        text: generatedLesson.text,
        sentences: generatedLesson.sentences,
        difficulty: generatedLesson.difficulty,
        culturalNotes: generatedLesson.culturalNotes,
        isCustom: true,
      };

      // Save custom lesson to local storage
      const savedLessons = localStorage.getItem("kiwi_custom_lessons");
      const currentCustoms = savedLessons ? JSON.parse(savedLessons) : [];
      const updatedCustoms = [newLesson, ...currentCustoms];
      localStorage.setItem("kiwi_custom_lessons", JSON.stringify(updatedCustoms));

      // Update state
      setLessons([...DEFAULT_LESSONS, ...updatedCustoms]);
      setSelectedLessonId(customId);
      setCustomPrompt("");
      setActiveTab("materials");
    } catch (err: any) {
      console.error("Failed to generate custom lesson:", err);
      setGenerationError(err.message || "An error occurred during AI lesson compiling.");
    } finally {
      setGeneratingCustom(false);
    }
  };

  const selectedLesson = lessons.find((l) => l.id === selectedLessonId) || lessons[0];

  // Render sentence with clickable words
  const renderSentenceWithClickableWords = (sentence: string) => {
    const parts = sentence.split(/(\s+)/);
    return (
      <span className="leading-relaxed inline-block font-serif text-lg md:text-xl text-nat-dark">
        {parts.map((part, partIdx) => {
          if (/\s+/.test(part)) {
            return <React.Fragment key={partIdx}>{part}</React.Fragment>;
          }
          const cleanWord = part.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$|'s$/g, "");
          const isInteractable = cleanWord.length > 0;
          const isCurrentlySelected = selectedWord.toLowerCase() === cleanWord.toLowerCase() && selectedWordSentence === sentence;

          return (
            <span
              key={partIdx}
              onClick={() => isInteractable && handleWordClick(cleanWord, sentence)}
              className={`inline-block select-none rounded px-0.5 transition-all ${
                isInteractable
                  ? isCurrentlySelected
                    ? "bg-nat-gold text-nat-dark shadow-sm scale-102 cursor-pointer font-bold px-1.5 py-0.5 rounded-lg"
                    : "hover:bg-nat-gold-light text-nat-dark cursor-pointer underline decoration-nat-gold decoration-2 underline-offset-4 font-semibold"
                  : "text-nat-text opacity-70"
              }`}
            >
              {part}
            </span>
          );
        })}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-nat-bg text-nat-text font-sans flex flex-col">
      {/* 1. TOP HEADER SECTION */}
      <header className="bg-nat-bg border-b border-nat-tan sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Logo brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-nat-forest text-white rounded-lg flex items-center justify-center font-bold text-xl shadow-sm">
              K
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-nat-dark flex items-center gap-1.5">
                KiwiListen
                <span className="text-xs font-normal opacity-60 italic">Aotearoa English</span>
              </h1>
              <p className="text-[10px] font-bold text-nat-sage tracking-wider uppercase">
                Personal Pronunciation & Dictation Coach
              </p>
            </div>
          </div>

          {/* Navigation items */}
          <nav className="flex bg-nat-cream border border-nat-tan p-1 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setActiveTab("materials")}
              className={`flex-1 sm:flex-none text-xs font-bold px-4 py-2 rounded-lg transition-all ${
                activeTab === "materials"
                  ? "bg-nat-forest text-white shadow-sm"
                  : "text-nat-sage hover:text-nat-dark"
              }`}
            >
              Lessons
            </button>
            <button
              onClick={() => setActiveTab("dictation")}
              className={`flex-1 sm:flex-none text-xs font-bold px-4 py-2 rounded-lg transition-all ${
                activeTab === "dictation"
                  ? "bg-nat-forest text-white shadow-sm"
                  : "text-nat-sage hover:text-nat-dark"
              }`}
            >
              Dictation
            </button>
            <button
              onClick={() => setActiveTab("shadowing")}
              className={`flex-1 sm:flex-none text-xs font-bold px-4 py-2 rounded-lg transition-all ${
                activeTab === "shadowing"
                  ? "bg-nat-forest text-white shadow-sm"
                  : "text-nat-sage hover:text-nat-dark"
              }`}
            >
              Shadowing
            </button>
            <button
              onClick={() => setActiveTab("vocab")}
              className={`flex-1 sm:flex-none text-xs font-bold px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "vocab"
                  ? "bg-nat-forest text-white shadow-sm"
                  : "text-nat-sage hover:text-nat-dark"
              }`}
            >
              <Star size={12} className={vocabList.length > 0 ? "fill-nat-gold stroke-nat-gold" : ""} />
              <span>Vocab ({vocabList.length})</span>
            </button>
          </nav>
        </div>
      </header>

      {/* 2. MAIN CORE LAYOUT CONTAINER */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        {showAudioNotice && (
          <div className="mb-6 bg-amber-50/95 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 shadow-sm text-amber-900 relative pr-10 animate-fade-in">
            <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={16} />
            <div className="text-xs leading-relaxed">
              <span className="font-bold">💡 Audio Playback Tip:</span> If speech synthesis or dictation does not play any sound, it is because modern browsers block media and Web Speech API calls inside sandboxed preview iframes. Please click the <span className="font-bold text-amber-950">"Open in New Tab"</span> button at the top-right of your screen to bypass iframe security policies!
            </div>
            <button
              onClick={() => setShowAudioNotice(false)}
              className="absolute top-3 right-3 text-amber-600 hover:text-amber-900 rounded-full hover:bg-amber-100/50 p-1 transition-all"
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )}
        
        {/* TAB 1: ARTICLES READING & COMPREHENSION */}
        {activeTab === "materials" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left sidebar: Articles & AI topic generator */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Presets Lesson List */}
              <div className="bg-white/60 backdrop-blur-md border border-nat-tan rounded-3xl p-5 shadow-sm space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-nat-sage/80 block mb-1">
                  Kiwi Audio Materials
                </h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {lessons.map((les) => (
                    <button
                      key={les.id}
                      onClick={() => {
                        setSelectedLessonId(les.id);
                        setSelectedWord("");
                        stopPlayback();
                      }}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                        selectedLessonId === les.id
                          ? "bg-nat-gold-light border-nat-gold text-nat-dark"
                          : "bg-white/40 border-nat-tan hover:bg-white/80 text-nat-text"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                          les.difficulty === "Beginner"
                            ? "bg-nat-sand text-nat-sage"
                            : les.difficulty === "Intermediate"
                            ? "bg-nat-clay text-nat-sage font-semibold"
                            : "bg-red-50 text-red-800 border border-red-100"
                        }`}>
                          {les.difficulty}
                        </span>
                        {les.isCustom && (
                          <span className="text-[9px] bg-purple-50 text-purple-800 font-extrabold px-2 py-0.5 rounded border border-purple-100">
                            AI Custom
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold leading-snug line-clamp-2">
                        {les.title}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Lesson Generator Form */}
              <div className="bg-white/60 backdrop-blur-md border border-nat-tan rounded-3xl p-5 shadow-sm">
                <div className="flex items-center gap-1.5 text-nat-sage font-bold text-xs mb-1 uppercase tracking-widest">
                  <Sparkles size={12} className="text-nat-gold animate-pulse" />
                  <span>AI NZ Material Generator</span>
                </div>
                <p className="text-xs text-nat-text/80 mb-3.5 leading-relaxed">
                  Enter any topic or scenario (e.g. "Visiting Lake Tekapo", "Applying for NZ Work Visa") to generate a custom listening text!
                </p>

                <form onSubmit={handleGenerateCustomLesson} className="space-y-3">
                  <input
                    type="text"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    disabled={generatingCustom}
                    placeholder="e.g., Ordering food at a Kiwi pub"
                    className="w-full text-xs bg-white border border-nat-tan rounded-xl px-3 py-2.5 outline-none focus:border-nat-forest focus:ring-1 focus:ring-nat-forest/30 transition-all"
                  />

                  {generationError && (
                    <p className="text-[10px] text-red-600 font-medium">
                      {generationError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={generatingCustom || !customPrompt.trim()}
                    className="w-full bg-nat-forest hover:bg-nat-dark disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold py-2.5 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {generatingCustom ? (
                      <>
                        <Loader2 className="animate-spin" size={12} />
                        <span>AI Generating Lesson...</span>
                      </>
                    ) : (
                      <>
                        <Plus size={12} />
                        <span>Generate Lesson</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* TTS Global Settings */}
              <div className="bg-white/60 backdrop-blur-md border border-nat-tan rounded-3xl p-5 shadow-sm space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-nat-sage/80 block">
                  Audio & Voice Settings
                </h3>

                {/* Speed Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs font-semibold text-nat-text">
                    <span>Playback Speed:</span>
                    <span className="font-bold font-mono text-nat-gold">{playbackSpeed}x</span>
                  </div>
                  <div className="flex gap-1">
                    {[0.5, 0.75, 1.0, 1.25, 1.5].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => {
                          setPlaybackSpeed(speed);
                          if (premiumAudio) premiumAudio.playbackRate = speed;
                        }}
                        className={`flex-1 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                          playbackSpeed === speed
                            ? "bg-nat-forest border-nat-forest text-white shadow-sm"
                            : "bg-white border-nat-tan hover:bg-nat-cream text-nat-sage"
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Speech engine choice */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-nat-text block">
                    Speech Engine Mode:
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSpeechEngine("system");
                        stopPlayback();
                      }}
                      className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${
                        speechEngine === "system"
                          ? "bg-nat-gold-light border-nat-gold text-nat-dark"
                          : "bg-white border-nat-tan hover:bg-nat-cream text-nat-sage"
                      }`}
                    >
                      System TTS (Fast)
                    </button>
                    <button
                      onClick={() => {
                        setSpeechEngine("premium");
                        stopPlayback();
                      }}
                      className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${
                        speechEngine === "premium"
                          ? "bg-nat-gold-light border-nat-gold text-nat-dark"
                          : "bg-white border-nat-tan hover:bg-nat-cream text-nat-sage"
                      }`}
                    >
                      Premium AI Voice
                    </button>
                  </div>
                </div>

                {/* Prebuilt Premium Voice List */}
                {speechEngine === "premium" && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-stone-400 font-bold block uppercase">
                      Select AI Premium Accent:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { key: "Kore", label: "Kore (Female)" },
                        { key: "Puck", label: "Puck (Male)" },
                        { key: "Fenrir", label: "Fenrir (Crisp)" },
                        { key: "Zephyr", label: "Zephyr (Deep)" },
                      ].map((voiceObj) => (
                        <button
                          key={voiceObj.key}
                          onClick={() => {
                            setPremiumVoice(voiceObj.key);
                            stopPlayback();
                          }}
                          className={`py-1 px-2 text-[10px] font-semibold rounded-lg border transition-all text-left truncate ${
                            premiumVoice === voiceObj.key
                              ? "bg-amber-50 border-amber-200 text-amber-900"
                              : "bg-stone-50 border-stone-100 hover:bg-stone-100 text-stone-600"
                          }`}
                        >
                          {voiceObj.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Central Panel: Story details & Clicking definitions */}
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-12 gap-8">
              
              {/* Text / Sentences loop area */}
              <div className="md:col-span-7 bg-white/50 backdrop-blur-md border border-nat-tan rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  {/* Article Title */}
                  <div className="border-b border-nat-tan pb-3 mb-4 flex justify-between items-start">
                    <div>
                      <span className="bg-nat-sand text-nat-sage text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        Source: Radio New Zealand
                      </span>
                      <h2 className="text-2xl md:text-3xl font-serif text-nat-dark leading-snug tracking-tight mt-2">
                        {selectedLesson.title}
                      </h2>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] bg-nat-clay text-nat-sage font-bold px-2 py-0.5 rounded">
                          {selectedLesson.difficulty} Level
                        </span>
                        <span className="text-[10px] text-nat-sage/80 font-medium">
                          {selectedLesson.sentences.length} Kiwi Sentences
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sentences list with interactive playback on left hover */}
                  <div className="space-y-4">
                    {selectedLesson.sentences.map((sent, idx) => (
                      <div
                        key={idx}
                        className="group flex items-start gap-3 p-3 hover:bg-nat-cream/40 rounded-2xl border-l-2 border-transparent hover:border-nat-gold transition-all"
                      >
                        {/* Play button next to sentence */}
                        <button
                          onClick={() => playSentence(sent)}
                          className="mt-1 p-2 bg-nat-cream hover:bg-nat-forest text-nat-sage hover:text-white rounded-xl transition-all shadow-sm shrink-0 cursor-pointer"
                          title="Speak sentence"
                        >
                          <Volume2 size={13} />
                        </button>
                        
                        {/* Interactive Clicking words */}
                        <div className="flex-1 text-sm text-nat-dark leading-relaxed">
                          {renderSentenceWithClickableWords(sent)}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* New Zealand Cultural Notes box */}
                  {selectedLesson.culturalNotes && (
                    <div className="mt-8 bg-nat-gold-light border-l-4 border-nat-gold rounded-r-2xl p-4 py-3">
                      <h4 className="text-xs font-bold text-nat-gold uppercase tracking-widest mb-1">
                        Kiwi Cultural & Language Notes
                      </h4>
                      <p className="text-xs text-nat-sage leading-relaxed">
                        {selectedLesson.culturalNotes}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-nat-tan text-[11px] text-nat-sage/60 flex items-center justify-between">
                  <span className="flex items-center gap-1 font-medium">
                    <HelpCircle size={12} /> Click any word to explain vocabulary
                  </span>
                  <span className="font-semibold">Aotearoa English Suite</span>
                </div>
              </div>

              {/* Dictionary Sidebar right side */}
              <div className="md:col-span-5">
                <DictionaryPanel
                  word={selectedWord}
                  sentence={selectedWordSentence}
                  articleId={selectedLesson.id}
                  articleTitle={selectedLesson.title}
                  onAddVocab={handleAddVocab}
                  isSaved={vocabList.some(
                    (v) =>
                      v.word.toLowerCase() === selectedWord.toLowerCase() &&
                      v.sentence === selectedWordSentence
                  )}
                  onClose={() => {
                    setSelectedWord("");
                    setSelectedWordSentence("");
                  }}
                  playWordAudio={playSentence}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DICTATION EXERCISE PRACTICE */}
        {activeTab === "dictation" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="text-center mb-4">
              <h2 className="text-2xl font-serif text-nat-dark tracking-tight">Listening Dictation Challenge</h2>
              <p className="text-xs text-nat-sage/80 mt-1 max-w-md mx-auto">
                Listen to the Kiwi native speaker sentence, transcribe it down, and view detailed alignment and accuracy reports!
              </p>
            </div>

            {/* Lesson selector header */}
            <div className="bg-white/60 backdrop-blur-md border border-nat-tan rounded-2xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <BookMarked size={16} className="text-nat-sage" />
                <span className="text-xs font-bold text-nat-text">Practicing Lesson:</span>
                <span className="text-xs font-bold text-nat-dark">{selectedLesson.title}</span>
              </div>
              <select
                value={selectedLessonId}
                onChange={(e) => setSelectedLessonId(e.target.value)}
                className="text-xs bg-white border border-nat-tan rounded-lg p-1.5 outline-none font-bold text-nat-dark"
              >
                {lessons.map((les) => (
                  <option key={les.id} value={les.id}>
                    {les.title}
                  </option>
                ))}
              </select>
            </div>

            <DictationExercise
              lesson={selectedLesson}
              playbackSpeed={playbackSpeed}
              playSentence={playSentence}
              stopPlayback={stopPlayback}
            />
          </div>
        )}

        {/* TAB 3: SHADOWING SPEAKING PRACTICE */}
        {activeTab === "shadowing" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="text-center mb-4">
              <h2 className="text-2xl font-serif text-nat-dark tracking-tight">Aotearoa Accent Shadowing</h2>
              <p className="text-xs text-nat-sage/80 mt-1 max-w-md mx-auto">
                Train your speaking muscles and ear! Record your voice and play it back side-by-side with the native model to perfect your Kiwi vowel shifts and rhythm.
              </p>
            </div>

            {/* Lesson selector header */}
            <div className="bg-white/60 backdrop-blur-md border border-nat-tan rounded-2xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <BookMarked size={16} className="text-nat-sage" />
                <span className="text-xs font-bold text-nat-text">Practicing Lesson:</span>
                <span className="text-xs font-bold text-nat-dark">{selectedLesson.title}</span>
              </div>
              <select
                value={selectedLessonId}
                onChange={(e) => setSelectedLessonId(e.target.value)}
                className="text-xs bg-white border border-nat-tan rounded-lg p-1.5 outline-none font-bold text-nat-dark"
              >
                {lessons.map((les) => (
                  <option key={les.id} value={les.id}>
                    {les.title}
                  </option>
                ))}
              </select>
            </div>

            <ShadowingRecorder
              lesson={selectedLesson}
              playSentence={playSentence}
              stopPlayback={stopPlayback}
            />
          </div>
        )}

        {/* TAB 4: VOCABULARY BOOK STUDY & REVIEW */}
        {activeTab === "vocab" && (
          <VocabBookView
            vocabList={vocabList}
            onRemoveVocab={handleRemoveVocab}
            onUpdateMastery={handleUpdateMastery}
            playWordAudio={playSentence}
          />
        )}
      </main>

      {/* 3. FOOTER SECTION */}
      <footer className="bg-nat-bg border-t border-nat-tan py-6 px-6 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-nat-sage/80">
          <p>© 2026 KiwiListen Coach. Developed to master New Zealand English listening & accents.</p>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-nat-dark transition-colors font-semibold">Terms</a>
            <a href="#" className="hover:text-nat-dark transition-colors font-semibold">Māori Language Core</a>
            <a href="#" className="hover:text-nat-dark transition-colors font-semibold">Settings</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
