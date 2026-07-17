import React, { useState } from "react";
import { BookOpen, Star, Trash2, ArrowRight, Play, Eye, RotateCcw, Check, Sparkles, AlertCircle, Award, Volume2 } from "lucide-react";
import { VocabWord } from "../types";

interface VocabBookViewProps {
  vocabList: VocabWord[];
  onRemoveVocab: (id: string) => void;
  onUpdateMastery: (id: string, level: number) => void;
  playWordAudio: (word: string) => void;
}

type Mode = "list" | "cards" | "spelling";

export default function VocabBookView({
  vocabList,
  onRemoveVocab,
  onUpdateMastery,
  playWordAudio,
}: VocabBookViewProps) {
  const [mode, setMode] = useState<Mode>("list");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Flashcards state
  const [cardIndex, setCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [studiedCount, setStudiedCount] = useState(0);

  // Spelling state
  const [spellingIndex, setSpellingIndex] = useState(0);
  const [spellingInput, setSpellingInput] = useState("");
  const [spellingChecked, setSpellingChecked] = useState(false);
  const [spellingIsCorrect, setSpellingIsCorrect] = useState(false);
  const [spellingScore, setSpellingScore] = useState(0);

  // Filtered vocabulary list
  const filteredList = vocabList.filter(
    (item) =>
      item.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.translation.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.definition.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Active flashcard words (unmastered words preferred, or all words)
  const flashcardWords = vocabList.filter(w => w.mastery < 2);
  const activeCards = flashcardWords.length > 0 ? flashcardWords : vocabList;

  // Active spelling words
  const spellingWords = vocabList;

  const handleCardRating = (id: string, mastered: boolean) => {
    onUpdateMastery(id, mastered ? 2 : 1);
    setShowAnswer(false);
    setStudiedCount((prev) => prev + 1);
    if (cardIndex < activeCards.length - 1) {
      setCardIndex((prev) => prev + 1);
    } else {
      // Completed round
      setCardIndex(0);
    }
  };

  const startSpellingTest = () => {
    setSpellingIndex(0);
    setSpellingInput("");
    setSpellingChecked(false);
    setSpellingScore(0);
    setMode("spelling");
    // Auto-pronounce first word
    if (spellingWords.length > 0) {
      setTimeout(() => playWordAudio(spellingWords[0].word), 500);
    }
  };

  const handleCheckSpelling = () => {
    if (!spellingWords || spellingWords.length === 0) return;
    const currentWordObj = spellingWords[spellingIndex];
    const userAns = spellingInput.trim().toLowerCase().replace(/[^a-z']/g, "");
    const correctAns = currentWordObj.word.trim().toLowerCase().replace(/[^a-z']/g, "");

    const isCorrect = userAns === correctAns;
    setSpellingIsCorrect(isCorrect);
    setSpellingChecked(true);

    if (isCorrect) {
      setSpellingScore((prev) => prev + 1);
      onUpdateMastery(currentWordObj.id, 2); // Auto master on correct spelling!
    } else {
      onUpdateMastery(currentWordObj.id, 1); // Downgrade to learning
    }
  };

  const handleNextSpelling = () => {
    setSpellingChecked(false);
    setSpellingInput("");
    if (spellingIndex < spellingWords.length - 1) {
      const nextIdx = spellingIndex + 1;
      setSpellingIndex(nextIdx);
      setTimeout(() => playWordAudio(spellingWords[nextIdx].word), 300);
    } else {
      // Round complete
      setSpellingIndex(-1);
    }
  };

  return (
    <div className="bg-white/60 backdrop-blur-md border border-nat-tan rounded-3xl p-6 shadow-sm max-w-4xl mx-auto">
      {/* Title & Modes Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-nat-tan mb-6">
        <div>
          <h2 className="text-xl font-serif font-bold text-nat-dark tracking-tight flex items-center gap-2">
            <Star className="text-nat-gold fill-nat-gold" size={20} />
            <span>NZ Vocab Book (个人生词本)</span>
            <span className="text-xs bg-nat-sand text-nat-sage border border-nat-tan font-bold px-2 py-0.5 rounded-full">
              {vocabList.length} words
            </span>
          </h2>
          <p className="text-xs text-nat-sage/80 mt-1 font-medium">
            Review and study words collected during your listening practice.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex bg-nat-cream/70 border border-nat-tan p-1 rounded-xl self-stretch md:self-auto">
          <button
            onClick={() => setMode("list")}
            className={`flex-1 md:flex-none text-xs font-semibold px-4 py-2 rounded-lg transition-all cursor-pointer ${
              mode === "list"
                ? "bg-white text-nat-forest border border-nat-tan/40 shadow-sm font-bold"
                : "text-nat-sage hover:text-nat-dark"
            }`}
          >
            All Words
          </button>
          <button
            onClick={() => {
              setCardIndex(0);
              setShowAnswer(false);
              setStudiedCount(0);
              setMode("cards");
            }}
            disabled={vocabList.length === 0}
            className={`flex-1 md:flex-none text-xs font-semibold px-4 py-2 rounded-lg transition-all cursor-pointer ${
              vocabList.length === 0 ? "opacity-50 cursor-not-allowed" : ""
            } ${
              mode === "cards"
                ? "bg-white text-nat-forest border border-nat-tan/40 shadow-sm font-bold"
                : "text-nat-sage hover:text-nat-dark"
            }`}
          >
            Flashcards
          </button>
          <button
            onClick={startSpellingTest}
            disabled={vocabList.length === 0}
            className={`flex-1 md:flex-none text-xs font-semibold px-4 py-2 rounded-lg transition-all cursor-pointer ${
              vocabList.length === 0 ? "opacity-50 cursor-not-allowed" : ""
            } ${
              mode === "spelling"
                ? "bg-white text-nat-forest border border-nat-tan/40 shadow-sm font-bold"
                : "text-nat-sage hover:text-nat-dark"
            }`}
          >
            Spelling Dictation
          </button>
        </div>
      </div>

      {vocabList.length === 0 ? (
        <div className="text-center py-16 px-4">
          <BookOpen size={48} className="text-nat-tan mx-auto mb-4 stroke-1" />
          <h3 className="text-base font-serif font-bold text-nat-dark">Your Vocab Book is empty!</h3>
          <p className="text-xs text-nat-sage/80 max-w-sm mx-auto mt-2 leading-relaxed">
            While listening to the articles, you can click on any word in the text to view its definition, phonetic notation, and Kiwi accent shifts. Simply click the star button to save it here!
          </p>
        </div>
      ) : (
        <>
          {/* 1. VOCABULARY LIST MODE */}
          {mode === "list" && (
            <div>
              {/* Search bar */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search saved words, definitions, translations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-sm bg-white border border-nat-tan rounded-xl px-4 py-2.5 outline-none focus:border-nat-forest transition-colors text-nat-dark placeholder:text-nat-sage/60"
                />
              </div>

              {filteredList.length === 0 ? (
                <div className="text-center py-12 text-nat-sage font-medium text-xs">
                  No matching words found for "{searchTerm}".
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredList.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white/50 border border-nat-tan hover:border-nat-gold rounded-2xl p-4 transition-all hover:shadow-sm relative flex flex-col justify-between"
                    >
                      <div>
                        {/* Word, phonetic, volume */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-lg font-serif font-bold text-nat-dark">{item.word}</h4>
                              {item.isKiwiSlang && (
                                <span className="text-[9px] bg-nat-gold-light text-nat-dark border border-nat-gold/40 font-bold px-1.5 py-0.5 rounded">
                                  Kiwi Slang
                                </span>
                              )}
                            </div>
                            <p className="font-mono text-xs text-nat-sage mt-0.5">{item.phonetic}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => playWordAudio(item.word)}
                              className="p-1.5 bg-nat-cream hover:bg-nat-forest text-nat-sage hover:text-white rounded-lg transition-colors cursor-pointer"
                              title="Pronounce"
                            >
                              <Volume2 size={13} />
                            </button>
                            <button
                              onClick={() => onRemoveVocab(item.id)}
                              className="p-1.5 text-nat-sage/80 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete word"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Translation */}
                        <p className="text-xs font-bold text-nat-forest mb-1">{item.translation}</p>
                        {/* English definition */}
                        <p className="text-xs text-nat-text mb-3 line-clamp-2 leading-relaxed font-sans">{item.definition}</p>

                        {/* Kiwi Pronunciation tip */}
                        {item.kiwiPronunciation && (
                          <div className="text-[10px] text-nat-sage bg-nat-cream/40 p-2 rounded-lg border border-nat-tan/50 mb-3">
                            <span className="font-bold text-nat-dark">Pronunciation: </span>
                            {item.kiwiPronunciation}
                          </div>
                        )}
                      </div>

                      {/* Source context and mastery badge */}
                      <div className="pt-2 border-t border-nat-tan mt-2 flex justify-between items-center text-[10px]">
                        <span className="text-nat-sage/70 truncate max-w-[150px]" title={item.sentence}>
                          Context: "{item.sentence}"
                        </span>
                        
                        {/* Mastery selector */}
                        <div className="flex gap-1">
                          <button
                            onClick={() => onUpdateMastery(item.id, 0)}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer transition-all ${
                              item.mastery === 0
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : "bg-nat-cream/40 text-nat-sage/80"
                            }`}
                          >
                            New
                          </button>
                          <button
                            onClick={() => onUpdateMastery(item.id, 1)}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer transition-all ${
                              item.mastery === 1
                                ? "bg-nat-gold-light text-nat-dark border border-nat-gold/40"
                                : "bg-nat-cream/40 text-nat-sage/80"
                            }`}
                          >
                            Study
                          </button>
                          <button
                            onClick={() => onUpdateMastery(item.id, 2)}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer transition-all ${
                              item.mastery === 2
                                ? "bg-nat-sand text-nat-sage border border-nat-tan"
                                : "bg-nat-cream/40 text-nat-sage/80"
                            }`}
                          >
                            Master
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. FLASHCARDS ACTIVE RECALL MODE */}
          {mode === "cards" && activeCards.length > 0 && (
            <div className="max-w-md mx-auto py-4">
              <div className="flex justify-between items-center text-xs text-nat-sage font-bold mb-3">
                <span>Studied: {studiedCount} cards</span>
                <span>
                  Card {cardIndex + 1} of {activeCards.length}
                </span>
              </div>

              {/* The Card */}
              <div className="border border-nat-tan rounded-3xl p-6 min-h-[300px] flex flex-col justify-between shadow-sm relative overflow-hidden bg-gradient-to-br from-white to-nat-cream/20">
                {/* Slang Badge */}
                {activeCards[cardIndex].isKiwiSlang && (
                  <span className="absolute top-4 right-4 text-[9px] bg-nat-gold-light text-nat-dark border border-nat-gold/30 font-bold px-2 py-0.5 rounded-full">
                    Kiwi Slang
                  </span>
                )}

                {/* Front of Card */}
                <div className="text-center my-auto py-6">
                  <h3 className="text-3xl font-serif font-bold text-nat-dark tracking-tight">
                    {activeCards[cardIndex].word}
                  </h3>
                  <p className="font-mono text-sm text-nat-sage mt-1">
                    {activeCards[cardIndex].phonetic}
                  </p>
                  
                  <button
                    onClick={() => playWordAudio(activeCards[cardIndex].word)}
                    className="mt-3 p-2 bg-nat-cream hover:bg-nat-forest text-nat-sage hover:text-white rounded-full transition-colors mx-auto inline-flex cursor-pointer"
                  >
                    <Volume2 size={16} />
                  </button>
                </div>

                {/* Back of Card (Answer hidden by default) */}
                <div className={`transition-all duration-300 ${showAnswer ? "opacity-100 max-h-[1000px] border-t border-nat-tan pt-5 mt-4" : "opacity-0 max-h-0 overflow-hidden"}`}>
                  <div className="text-center mb-4">
                    <span className="text-[9px] font-bold text-nat-sage tracking-wider uppercase block mb-1">
                      Meaning / 含义
                    </span>
                    <p className="text-lg font-bold text-nat-dark">
                      {activeCards[cardIndex].translation}
                    </p>
                  </div>

                  <div className="text-xs text-nat-text space-y-2">
                    <div>
                      <span className="font-bold text-nat-sage block">Definition:</span>
                      <p className="font-sans">{activeCards[cardIndex].definition}</p>
                    </div>

                    {activeCards[cardIndex].kiwiPronunciation && (
                      <div className="bg-nat-gold-light/40 p-2 rounded-lg text-nat-sage border border-nat-gold/20">
                        <span className="font-bold text-nat-gold block">Kiwi Pronunciation:</span>
                        <p className="italic font-serif">{activeCards[cardIndex].kiwiPronunciation}</p>
                      </div>
                    )}

                    <div className="bg-white/40 border border-nat-tan p-2 rounded-lg">
                      <span className="font-bold text-nat-sage block">Context:</span>
                      <p className="italic font-serif">"{activeCards[cardIndex].sentence}"</p>
                    </div>
                  </div>
                </div>

                {/* Button actions */}
                <div className="mt-6">
                  {!showAnswer ? (
                    <button
                      onClick={() => setShowAnswer(true)}
                      className="w-full bg-nat-forest hover:bg-nat-dark text-white text-sm font-semibold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Eye size={16} />
                      <span>Reveal Meaning</span>
                    </button>
                  ) : (
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleCardRating(activeCards[cardIndex].id, false)}
                        className="flex-1 border border-nat-tan bg-white hover:bg-nat-cream text-nat-sage text-xs font-semibold py-2.5 rounded-xl transition-all cursor-pointer"
                      >
                        Still Reviewing
                      </button>
                      <button
                        onClick={() => handleCardRating(activeCards[cardIndex].id, true)}
                        className="flex-1 bg-nat-forest hover:bg-nat-dark text-white text-xs font-semibold py-2.5 rounded-xl shadow-sm transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Check size={14} />
                        <span>Got It! (Mastered)</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. SPELLING DICTATION GAME */}
          {mode === "spelling" && spellingWords.length > 0 && (
            <div className="max-w-md mx-auto py-4">
              {spellingIndex === -1 ? (
                /* Completed Screen */
                <div className="border border-nat-tan rounded-3xl p-8 text-center bg-nat-cream/40 shadow-sm">
                  <Award className="text-nat-gold mx-auto mb-4 stroke-1 animate-bounce" size={56} />
                  <h3 className="text-xl font-serif font-bold text-nat-dark">Dictation Session Complete!</h3>
                  <p className="text-sm text-nat-sage mt-2">
                    You spelled <span className="font-bold text-nat-forest">{spellingScore}</span> out of{" "}
                    <span className="font-bold text-nat-dark">{spellingWords.length}</span> words correctly!
                  </p>
                  
                  {spellingScore === spellingWords.length ? (
                    <p className="text-xs text-nat-forest font-bold mt-1 flex items-center justify-center gap-1">
                      <Sparkles size={14} /> Outstanding! Full marks, Kiwi champion!
                    </p>
                  ) : (
                    <p className="text-xs text-nat-sage/80 mt-1">Keep practicing to improve your vocabulary spelling!</p>
                  )}

                  <button
                    onClick={startSpellingTest}
                    className="mt-6 bg-nat-forest hover:bg-nat-dark text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-all flex items-center gap-2 mx-auto cursor-pointer"
                  >
                    <RotateCcw size={14} />
                    <span>Restart Test</span>
                  </button>
                </div>
              ) : (
                /* Active Test Card */
                <div>
                  <div className="flex justify-between items-center text-xs text-nat-sage font-bold mb-3">
                    <span>Score: {spellingScore} / {spellingIndex}</span>
                    <span>
                      Word {spellingIndex + 1} of {spellingWords.length}
                    </span>
                  </div>

                  <div className="border border-nat-tan rounded-3xl p-6 shadow-sm bg-white">
                    <div className="text-center pb-4 mb-4 border-b border-nat-tan">
                      <span className="text-[10px] font-bold text-nat-sage/80 tracking-widest uppercase block mb-1">
                        Listen and Type
                      </span>
                      <button
                        onClick={() => playWordAudio(spellingWords[spellingIndex].word)}
                        className="p-4 bg-nat-cream hover:bg-nat-forest text-nat-sage hover:text-white rounded-full transition-all inline-flex shadow-sm cursor-pointer"
                      >
                        <Volume2 size={24} />
                      </button>
                      <p className="text-[10px] text-nat-sage mt-2 font-medium">Click button to play word audio</p>
                    </div>

                    <div className="space-y-4">
                      {/* Hint Translation */}
                      <div className="bg-nat-gold-light/40 p-3 rounded-xl border border-nat-gold/20 text-center">
                        <span className="text-[9px] font-bold text-nat-sage tracking-wider uppercase block mb-1">
                          Hint Meaning / 释义提示
                        </span>
                        <p className="text-sm font-semibold text-nat-dark">
                          {spellingWords[spellingIndex].translation}
                        </p>
                      </div>

                      {/* Spell Input */}
                      <div>
                        <label className="text-xs font-bold text-nat-sage block mb-1">
                          Type word spelling:
                        </label>
                        <input
                          type="text"
                          value={spellingInput}
                          onChange={(e) => setSpellingInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !spellingChecked && spellingInput.trim()) {
                              handleCheckSpelling();
                            }
                          }}
                          disabled={spellingChecked}
                          autoFocus
                          placeholder="Spell the word here..."
                          className="w-full text-center text-lg font-serif font-bold bg-nat-cream/30 border border-nat-tan rounded-xl px-4 py-2.5 outline-none focus:border-nat-forest transition-colors text-nat-dark"
                        />
                      </div>

                      {/* Spelling Results */}
                      {spellingChecked && (
                        <div className={`p-3 rounded-xl border ${
                          spellingIsCorrect
                            ? "bg-nat-sand border-nat-tan text-nat-sage"
                            : "bg-red-50 border-red-100 text-red-800"
                        }`}>
                          <div className="flex items-center gap-1.5 font-bold text-xs mb-1">
                            {spellingIsCorrect ? (
                              <>
                                <Check size={16} />
                                <span>Spelled Correctly!</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle size={16} />
                                <span>Spelling Typo</span>
                              </>
                            )}
                          </div>
                          
                          <div className="text-xs mt-2 space-y-1">
                            <p>
                              Your spelling: <span className="font-mono font-bold">{spellingInput}</span>
                            </p>
                            <p>
                              Correct spelling: <span className="font-mono font-bold underline">{spellingWords[spellingIndex].word}</span>
                            </p>
                            <p className="italic text-nat-sage/80 mt-1 pt-1 border-t border-nat-tan/40">
                              Phonetic: {spellingWords[spellingIndex].phonetic}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Control buttons */}
                      <div className="pt-2">
                        {!spellingChecked ? (
                          <button
                            onClick={handleCheckSpelling}
                            disabled={!spellingInput.trim()}
                            className="w-full bg-nat-forest hover:bg-nat-dark disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-xl shadow-sm transition-all cursor-pointer"
                          >
                            Check Spelling
                          </button>
                        ) : (
                          <button
                            onClick={handleNextSpelling}
                            className="w-full bg-nat-dark hover:bg-nat-sage text-white text-sm font-semibold py-3 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <span>Next Word</span>
                            <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
