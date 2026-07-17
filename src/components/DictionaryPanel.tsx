import React, { useState, useEffect } from "react";
import { Loader2, BookOpen, Volume2, Plus, Check, Star, HelpCircle, ChevronRight, MessageSquare, AlertCircle } from "lucide-react";
import { VocabWord } from "../types";

interface DictionaryPanelProps {
  word: string;
  sentence: string;
  articleId: string;
  articleTitle: string;
  onAddVocab: (vocab: Omit<VocabWord, "id" | "dateAdded">) => void;
  isSaved: boolean;
  onClose: () => void;
  playWordAudio: (word: string) => void;
}

interface WordExplanation {
  word: string;
  phonetic: string;
  translation: string;
  definition: string;
  kiwiPronunciation?: string;
  isKiwiSlang?: boolean;
  kiwiContext?: string;
  examples: string[];
}

export default function DictionaryPanel({
  word,
  sentence,
  articleId,
  articleTitle,
  onAddVocab,
  isSaved,
  onClose,
  playWordAudio,
}: DictionaryPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<WordExplanation | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!word) return;

    const fetchExplanation = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/explain-word", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ word, sentence }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch dictionary definition");
        }

        const data = await response.json();
        setExplanation(data);
      } catch (err: any) {
        console.error("Dictionary lookup error:", err);
        setError(err.message || "Unable to retrieve word definition. Please check your internet connection.");
      } finally {
        setLoading(false);
      }
    };

    fetchExplanation();
  }, [word, sentence]);

  const handleSave = () => {
    if (!explanation) return;
    setAdding(true);
    onAddVocab({
      word: explanation.word,
      phonetic: explanation.phonetic,
      translation: explanation.translation,
      definition: explanation.definition,
      kiwiPronunciation: explanation.kiwiPronunciation,
      isKiwiSlang: explanation.isKiwiSlang,
      kiwiContext: explanation.kiwiContext,
      sentence: sentence,
      articleId: articleId,
      articleTitle: articleTitle,
      mastery: 0,
    });
    setTimeout(() => setAdding(false), 800);
  };

  return (
    <div className="bg-white/60 backdrop-blur-md border border-nat-tan rounded-3xl p-5 shadow-sm h-full flex flex-col min-h-[400px]">
      <div className="flex items-center justify-between pb-3 border-b border-nat-tan mb-4">
        <div className="flex items-center gap-2 text-nat-sage font-bold text-xs uppercase tracking-widest">
          <BookOpen size={16} />
          <span>Kia Ora Dictionary</span>
        </div>
        <button
          onClick={onClose}
          className="text-nat-sage hover:text-nat-dark p-1 hover:bg-nat-cream rounded-lg transition-colors text-xs font-semibold"
        >
          Close
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-nat-sage">
          <Loader2 className="animate-spin text-nat-gold mb-3" size={32} />
          <p className="text-xs font-bold">Analyzing Kiwi pronunciation & context...</p>
          <p className="text-[10px] opacity-70 mt-1">Consulting Gemini Linguist</p>
        </div>
      )}

      {error && (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center px-4">
          <AlertCircle className="text-red-500 mb-3" size={36} />
          <p className="text-xs text-nat-dark font-medium mb-2">{error}</p>
          <button
            onClick={() => {
              // Trigger reload
              const currentWord = word;
              setExplanation(null);
              setLoading(true);
              setTimeout(() => {
                setError(null);
                // Re-run
                fetch("/api/explain-word", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ word: currentWord, sentence }),
                })
                  .then((res) => res.json())
                  .then((data) => setExplanation(data))
                  .catch((e) => setError(e.message))
                  .finally(() => setLoading(false));
              }, 100);
            }}
            className="text-xs bg-nat-cream hover:bg-nat-clay text-nat-dark border border-nat-tan font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Retry Lookup
          </button>
        </div>
      )}

      {!loading && !error && !explanation && (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-nat-sage/80 text-center">
          <HelpCircle size={40} className="stroke-1 mb-3 text-nat-tan" />
          <p className="text-xs font-bold text-nat-dark uppercase tracking-wider">Interactive Reading Mode</p>
          <p className="text-[11px] max-w-[200px] mt-2 leading-relaxed">
            Click on any word in the transcript to instantly look up its pronunciation, translation, and Kiwi slang notes!
          </p>
        </div>
      )}

      {!loading && !error && explanation && (
        <div className="flex-1 flex flex-col overflow-y-auto pr-1">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-2xl font-serif font-bold text-nat-dark tracking-tight">{explanation.word}</h3>
              <p className="font-mono text-xs text-nat-sage opacity-80 mt-0.5">{explanation.phonetic}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => playWordAudio(explanation.word)}
                className="p-2 bg-nat-cream hover:bg-nat-forest text-nat-sage hover:text-white rounded-xl transition-all cursor-pointer"
                title="Pronounce word"
              >
                <Volume2 size={16} />
              </button>
              <button
                onClick={handleSave}
                disabled={isSaved || adding}
                className={`p-2 rounded-xl transition-all cursor-pointer ${
                  isSaved
                    ? "bg-nat-forest text-white"
                    : "bg-nat-cream hover:bg-nat-gold-light border border-nat-tan text-nat-sage hover:text-nat-dark"
                }`}
                title={isSaved ? "Saved to Vocab Book" : "Add to Vocab Book"}
              >
                {isSaved ? <Star size={16} className="fill-white" /> : <Plus size={16} />}
              </button>
            </div>
          </div>

          {/* Translation */}
          <div className="bg-nat-gold-light border border-nat-gold/60 rounded-xl p-3 mb-4">
            <span className="text-[9px] font-bold text-nat-sage tracking-wider uppercase block mb-1">
              Chinese Contextual Translation / 中文释义
            </span>
            <p className="text-sm font-semibold text-nat-dark">{explanation.translation}</p>
          </div>

          {/* English definition */}
          <div className="mb-4">
            <span className="text-[9px] font-bold text-nat-sage/80 tracking-wider uppercase block mb-1">
              Definition / 英文定义
            </span>
            <p className="text-xs text-nat-text leading-relaxed">{explanation.definition}</p>
          </div>

          {/* Kiwi Slang / Accent Specific Tips */}
          {explanation.isKiwiSlang && (
            <div className="bg-nat-clay/30 border border-nat-tan rounded-xl p-3 mb-4">
              <div className="flex items-center gap-1 text-nat-gold font-bold text-xs mb-1">
                <Star size={12} className="fill-nat-gold stroke-nat-gold" />
                <span>Kiwi Slang or Māori Word / 新西兰特色词汇</span>
              </div>
              {explanation.kiwiContext && (
                <p className="text-xs text-nat-sage leading-relaxed">{explanation.kiwiContext}</p>
              )}
            </div>
          )}

          {explanation.kiwiPronunciation && (
            <div className="bg-nat-cream/70 border border-nat-tan rounded-xl p-3 mb-4">
              <span className="text-[9px] font-bold text-nat-sage tracking-wider uppercase block mb-1">
                Kiwi Accent Shift / 新西兰特色发音提示
              </span>
              <p className="text-xs text-nat-text leading-relaxed font-semibold">
                {explanation.kiwiPronunciation}
              </p>
            </div>
          )}

          {/* Examples */}
          {explanation.examples && explanation.examples.length > 0 && (
            <div className="mb-4">
              <span className="text-[9px] font-bold text-nat-sage/80 tracking-wider uppercase block mb-1">
                Example Sentences / 例句
              </span>
              <div className="space-y-2 mt-1">
                {explanation.examples.map((ex, idx) => (
                  <div key={idx} className="flex gap-1 text-xs text-nat-text bg-white/40 p-2 rounded-lg border border-nat-tan">
                    <span className="text-nat-gold font-bold">{idx + 1}.</span>
                    <p className="leading-relaxed font-serif">{ex}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Context sentence where the user found it */}
          {sentence && (
            <div className="border-t border-nat-tan pt-3 mt-auto">
              <span className="text-[9px] font-bold text-nat-sage/80 tracking-wider uppercase block mb-1">
                Source Context / 来源上下文
              </span>
              <p className="text-xs text-nat-sage italic leading-relaxed bg-white/30 p-2 rounded-lg">
                "{sentence}"
              </p>
              <p className="text-[9px] text-nat-sage/80 mt-1 text-right">
                From: {articleTitle}
              </p>
            </div>
          )}
        </div>
      )}

      {explanation && !loading && !error && (
        <div className="mt-4 pt-3 border-t border-nat-tan flex justify-between items-center text-[10px] text-nat-sage/80">
          <span>Source: Google Gemini 2.5</span>
          {isSaved ? (
            <span className="text-nat-forest font-bold flex items-center gap-0.5">
              <Check size={12} /> Added to Vocab Book
            </span>
          ) : (
            <button
              onClick={handleSave}
              className="text-nat-forest hover:text-nat-dark font-bold hover:underline cursor-pointer"
            >
              Add to Vocab Book
            </button>
          )}
        </div>
      )}
    </div>
  );
}
