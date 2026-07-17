export type Difficulty = "Beginner" | "Intermediate" | "Advanced";

export interface Lesson {
  id: string;
  title: string;
  text: string;
  sentences: string[];
  difficulty: Difficulty;
  culturalNotes?: string;
  isCustom?: boolean;
}

export interface VocabWord {
  id: string;
  word: string;
  phonetic: string;
  translation: string;
  definition: string;
  kiwiPronunciation?: string;
  isKiwiSlang?: boolean;
  kiwiContext?: string;
  sentence: string; // The sentence in which the word was clicked
  articleId: string;
  articleTitle: string;
  dateAdded: string;
  mastery: number; // 0 = New/Unfamiliar, 1 = Learning, 2 = Mastered
}

export interface DictationAttempt {
  id: string;
  articleId: string;
  sentenceIndex: number;
  userText: string;
  correctText: string;
  accuracy: number; // Percentage matching
  timestamp: string;
}
