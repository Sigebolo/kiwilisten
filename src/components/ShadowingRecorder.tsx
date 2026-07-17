import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Play, Volume2, RotateCcw, AlertCircle, Headphones, Check, Sparkles } from "lucide-react";
import { Lesson } from "../types";

interface ShadowingRecorderProps {
  lesson: Lesson;
  playSentence: (text: string) => void;
  stopPlayback: () => void;
}

export default function ShadowingRecorder({
  lesson,
  playSentence,
  stopPlayback,
}: ShadowingRecorderProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);

  // Reset currentIdx and state when lesson changes
  useEffect(() => {
    setCurrentIdx(0);
    setRecordingUrl(null);
    setError(null);
    setIsPlayingRecording(false);
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current = null;
    }
  }, [lesson]);

  useEffect(() => {
    // Reset state on index change
    stopPlayback();
    setRecordingUrl(null);
    setError(null);
    setIsPlayingRecording(false);
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current = null;
    }
  }, [currentIdx]);

  useEffect(() => {
    return () => {
      if (playbackAudioRef.current) {
        playbackAudioRef.current.pause();
      }
    };
  }, []);

  const currentSentence = (lesson && lesson.sentences && lesson.sentences[currentIdx]) || (lesson && lesson.sentences && lesson.sentences[0]) || "";

  const startRecording = async () => {
    audioChunksRef.current = [];
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordingUrl(audioUrl);
        
        // Stop all track streams to release microphone
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      setError("Unable to access microphone. Please ensure you have granted microphone permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playUserRecording = () => {
    if (!recordingUrl) return;
    
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
    }

    const audio = new Audio(recordingUrl);
    playbackAudioRef.current = audio;
    setIsPlayingRecording(true);
    
    audio.play();
    audio.onended = () => {
      setIsPlayingRecording(false);
    };
  };

  return (
    <div className="bg-white/60 backdrop-blur-md border border-nat-tan rounded-3xl p-6 shadow-sm">
      {/* Title block */}
      <div className="flex items-center justify-between border-b border-nat-tan pb-3 mb-4">
        <span className="text-xs font-bold text-nat-sage uppercase tracking-widest">
          Aotearoa Shadowing Practice (口语跟读练习)
        </span>
        <span className="text-xs font-medium text-nat-sage/80">
          Sentence {currentIdx + 1} of {lesson.sentences.length}
        </span>
      </div>

      <div className="space-y-6">
        {/* Active sentence preview card */}
        <div className="bg-white border border-nat-tan rounded-2xl p-5 shadow-sm text-center">
          <span className="text-[10px] font-bold text-nat-sage/80 uppercase tracking-widest block mb-2">
            Target Sentence to Shadow
          </span>
          <p className="text-xl font-serif font-bold text-nat-dark leading-relaxed px-2">
            "{currentSentence}"
          </p>
        </div>

        {/* Action controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Step 1: Listen to Model */}
          <div className="bg-white border border-nat-tan rounded-2xl p-4 shadow-sm flex flex-col justify-between items-center text-center">
            <div>
              <span className="text-[10px] font-bold text-nat-sage uppercase tracking-wider block mb-1">
                Step 1: Listen to Native Model
              </span>
              <p className="text-xs text-nat-text opacity-80 mt-1 max-w-[200px]">
                Listen to the rhythm, intonation, and vowel shifts. Note how Kiwi speech connects syllables.
              </p>
            </div>
            
            <button
              onClick={() => playSentence(currentSentence)}
              className="mt-4 px-4 py-2.5 bg-nat-cream hover:bg-nat-gold-light border border-nat-tan text-nat-dark rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Volume2 size={14} />
              <span>Play Kiwi Accent</span>
            </button>
          </div>

          {/* Step 2: Record Yourself */}
          <div className="bg-white border border-nat-tan rounded-2xl p-4 shadow-sm flex flex-col justify-between items-center text-center">
            <div>
              <span className="text-[10px] font-bold text-nat-gold uppercase tracking-wider block mb-1">
                Step 2: Record & Analyze
              </span>
              <p className="text-xs text-nat-text opacity-80 mt-1 max-w-[200px]">
                Speak directly into your microphone, attempting to mimic the exact pronunciation.
              </p>
            </div>

            {error && (
              <div className="mt-2 text-[10px] text-red-600 font-semibold flex items-center gap-1">
                <AlertCircle size={10} />
                <span>{error}</span>
              </div>
            )}

            {!isRecording ? (
              <button
                onClick={startRecording}
                className="mt-4 px-4 py-2.5 bg-nat-gold-light hover:bg-nat-gold text-nat-dark border border-nat-gold/30 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Mic size={14} />
                <span>Start Recording Voice</span>
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="mt-4 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white animate-pulse rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Square size={14} className="fill-white" />
                <span>Stop Recording (Recording...)</span>
              </button>
            )}
          </div>
        </div>

        {/* Player Side-by-Side Analysis */}
        {recordingUrl && (
          <div className="bg-white border border-nat-tan rounded-2xl p-5 shadow-sm space-y-4">
            <span className="text-xs font-bold text-nat-sage block border-b border-nat-tan pb-2">
              Side-by-Side Pronunciation Review
            </span>

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Native player */}
              <button
                onClick={() => playSentence(currentSentence)}
                className="flex-1 border border-nat-tan bg-nat-cream hover:bg-nat-gold-light text-nat-dark py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Volume2 size={14} />
                <span>1. Listen Native Accent</span>
              </button>

              {/* User player */}
              <button
                onClick={playUserRecording}
                className={`flex-1 border cursor-pointer ${
                  isPlayingRecording 
                    ? "border-nat-gold bg-nat-gold-light text-nat-dark" 
                    : "border-nat-tan hover:bg-nat-cream text-nat-sage"
                } py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all`}
              >
                <Headphones size={14} />
                <span>{isPlayingRecording ? "Playing Recording..." : "2. Listen Your Voice"}</span>
              </button>
            </div>

            <div className="bg-nat-gold-light/40 p-3 rounded-xl flex gap-2 border border-nat-gold/20">
              <Sparkles size={16} className="text-nat-gold shrink-0 mt-0.5" />
              <p className="text-[11px] text-nat-sage leading-relaxed">
                <span className="font-bold text-nat-gold">Self-Evaluation Tip:</span> Listen to how you pronounce vowels. Did your <span className="font-semibold">'yis'</span> match their pronunciation of 'yes'? Did your <span className="font-semibold">'fush'</span> sound like their 'fish'? Practicing this accent imitation builds muscular motor-memory for rapid listening comprehension!
              </p>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setRecordingUrl(null)}
                className="text-[10px] text-nat-sage hover:text-nat-dark font-semibold flex items-center gap-0.5 cursor-pointer"
              >
                <RotateCcw size={10} /> Redo Recording
              </button>
            </div>
          </div>
        )}

        {/* Navigation row */}
        <div className="flex justify-between items-center border-t border-nat-tan pt-4 mt-2">
          <button
            onClick={() => {
              if (currentIdx > 0) setCurrentIdx((prev) => prev - 1);
            }}
            disabled={currentIdx === 0}
            className="text-xs bg-white border border-nat-tan px-4 py-2 rounded-xl text-nat-sage hover:bg-nat-cream disabled:opacity-40 transition-colors font-semibold cursor-pointer"
          >
            Previous
          </button>
          
          <button
            onClick={() => {
              if (currentIdx < lesson.sentences.length - 1) setCurrentIdx((prev) => prev + 1);
            }}
            disabled={currentIdx === lesson.sentences.length - 1}
            className="text-xs bg-nat-forest hover:bg-nat-dark px-4 py-2 rounded-xl text-white disabled:opacity-40 transition-colors font-semibold cursor-pointer"
          >
            Next Sentence
          </button>
        </div>
      </div>
    </div>
  );
}
