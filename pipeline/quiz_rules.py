"""
Connected-speech difficulty scoring for KiwiListen quiz mode.

Given a sentence (list of tokens), scores each word by how likely it is
to be hard for a non-native listener due to:
  - vowel reduction / schwa
  - t-glottaling / flapping (NZ: 'better' → 'beddah')
  - consonant cluster simplification
  - syllable reduction
  - word-final r-drop (NZ English)
  - adjacent-word linking / liaison
  - function-word swallowing
  - h-dropping (NZ: 'have' → ''ave')
  - w/v confusion (NZ: 'seven' → 'sevan')
  - vowel raising (NZ short-i → schwa)
  - Māori loan words (unfamiliar phonotactics)
  - th-stopping (NZ: 'that' → 'dat', 'think' → 'tink')
"""
from __future__ import annotations

import math
import random
import re

# ── Connected-speech rules ────────────────────────────────────────────────────

# Common reductions: full form → spoken form
REDUCTIONS = {
    "going to": "gonna",
    "want to": "wanna",
    "got to": "gotta",
    "kind of": "kinda",
    "sort of": "sorta",
    "out of": "outta",
    "a lot of": "a lotta",
    "have to": "hafta",
    "has to": "hasta",
    "must": "mus'",
    "can": "c'n",
    "just": "jus'",
    "because": "'cause",
    "there is": "there's",
    "there are": "there're",
    "going to be": "gonna be",
    "want to be": "wanna be",
}

# Words that are commonly reduced in NZ/fast speech
HIGH_REDUCTION_WORDS = {
    "have", "has", "had", "can", "could", "would", "should",
    "must", "do", "does", "did", "is", "are", "was", "were",
    "been", "being", "am", "the", "a", "an", "of", "to",
    "and", "but", "or", "for", "at", "by", "with", "from",
    "this", "that", "there", "it", "its", "he", "she",
    "him", "her", "his", "them", "they", "you", "your",
    "just", "also", "about", "into", "over", "then",
}

# Words with syllable-reduction patterns (3+ syllables, unstressed middle)
SLOW_TRAP_WORDS = {
    "comfortable", "vegetable", "chocolate", "interesting",
    "definitely", "temperature", "government", "environment",
    "particularly", "approximately", "unfortunately",
    "dictionary", "laboratory", "manufacture",
    "probably", "already", "actually", "basically",
    "obviously", "suddenly", "finally", "recently",
    "important", "importantly", "particularly",
    "celebration", "independence", "significance",
    "communication", "organization", "recognition",
}

# Words where final consonant cluster simplifies
CLUSTER_SIMPLIFY = {
    "last": "las", "just": "jus'", "best": "bes'",
    "next": "nex'", "test": "tes'", "fast": "fas'",
    "west": "wes'", "past": "pas'", "left": "lef'",
    "asked": "ast", "walked": "walked", "asked": "ast",
    "asked": "ast", "milk": "mil'",
    "fact": "fac'", "act": "ac'",
}

# Words with t-flapping or glottaling in NZ English
T_VARIANTS = {
    "better": ["bedder", "be'a"],
    "water": ["wadder", "wa'a"],
    "letter": ["ledder", "le'a"],
    "little": ["liddle", "li'a"],
    "get": ["ged"],
    "got": ["god"],
    "put": ["pud"],
    "lot": ["lod"],
    "not": ["nod"],
    "but": ["bud"],
    "what": ["wod"],
    "that": ["dha"],
    "right": ["rid"],
    "about": ["aboud"],
    "quite": ["quid"],
    "great": ["grad"],
    "matter": ["madder", "ma'a"],
    "city": ["ciddee"],
    "waiting": ["waiding"],
    "meeting": ["meeding"],
    "getting": ["gedding"],
    "sitting": ["sidding"],
}

# NZ-specific vowel shifts
NZ_VOWEL_SHIFTS = {
    "yes": ["yis", "yas"],
    "fish": ["fush"],
    "chips": ["chups"],
    "six": ["sux"],
    "pen": ["pin"],
    "ten": ["tin"],
    "bed": ["bid"],
    "get": ["git"],
    "deck": ["dick"],
    "back": ["beck"],
    "bag": ["beg"],
    "cat": ["ket"],
    "dad": "ded",
    "pan": "pen",
    "bag": "beg",
}

# ── NEW: h-dropping (NZ English drops initial h in function words) ──────────
H_DROPPERS = {
    "have", "has", "had", "him", "her", "his", "he",
    "her", "herself", "himself", "how", "here", "hear",
}

# ── NEW: th-stopping (NZ: 'that' → 'dat', 'think' → 'tink') ───────────────
TH_STOPPERS = {
    "that": "dat", "this": "dis", "them": "dem", "then": "den",
    "there": "dere", "they": "dey", "their": "deir", "theirs": "deirs",
    "think": "tink", "thing": "ting", "three": "tree", "through": "troo",
    "thought": "tort", "thousand": "tousand",
}

# ── NEW: w/v merge (NZ: 'seven' → 'sevan', 'very' → 'wery') ───────────────
WV_MERGERS = {
    "very": "wery", "seven": "sevan", "eleven": "eleven",
    "over": "over", "ever": "ewer", "never": "newer",
    "have": "hav", "give": "giv", "live": "liv",
    "love": "luv", "of": "ov", "drive": "driv",
    "five": "fiv", "move": "muv", "prove": "pruv",
}

# ── NEW: vowel raising (NZ short-i → schwa) ────────────────────────────────
VOWEL_RAISERS = {
    "six", "fix", "mix", "bits", "sits", "fits", "hits", "kids",
    "did", "bid", "hid", "lid", "rid", "grid", "skid",
    "bill", "fill", "hill", "kill", "mill", "pill", "till", "will",
    "bin", "din", "fin", "gin", "kin", "pin", "tin", "win",
    "bit", "fit", "hit", "kit", "lit", "pit", "sit", "wit",
    "ship", "chip", "dip", "flip", "grip", "rip", "sip", "tip", "zip",
}

# ── NEW: Māori loan words (unfamiliar vowel patterns for non-NZers) ────────
MAORI_WORDS = {
    "kiwi", "haka", "kia", "ora", "kai", "marae", "pakeha",
    "maori", "aotearoa", "tamaki", "motueka", "whanganui",
    "tangata", "whenua", "mana", "tapu", "kaimoana",
}

# ── NEW: r-dropping (NZ English drops non-rhotic r) ────────────────────────
R_DROPPERS = {
    "car", "far", "bar", "star", "hard", "card", "yard", "guard",
    "more", "for", "door", "floor", "four", "store", "shore",
    "here", "there", "where", "care", "dare", "fair", "share",
    "butter", "water", "better", "letter", "mutter", "utter",
}

# ── NEW: function-word elision (swallowed in fast speech) ──────────────────
ELISION_PAIRS = {
    ("want", "to"): "wanna",
    ("going", "to"): "gonna",
    ("got", "to"): "gotta",
    ("out", "of"): "outta",
    ("kind", "of"): "kinda",
    ("sort", "of"): "sorta",
    ("supposed", "to"): "s'posed to",
    ("used", "to"): "usta",
    ("supposed", "to"): "s'posed to",
    ("could", "have"): "coulda",
    ("would", "have"): "woulda",
    ("should", "have"): "shoulda",
    ("must", "have"): "musta",
    ("might", "have"): "mighta",
}

# ── NEW: difficulty tier thresholds ─────────────────────────────────────────
DIFFICULTY_TIERS = {
    "easy":   {"min_score": 3.0, "max_options": 4},
    "medium": {"min_score": 2.0, "max_options": 4},
    "hard":   {"min_score": 1.0, "max_options": 4},
}


def _syllable_count(word: str) -> int:
    """Rough syllable count for English words."""
    word = word.lower().strip()
    if not word:
        return 0
    # Vowel groups
    count = len(re.findall(r"[aeiouy]+", word))
    # Silent-e
    if word.endswith("e") and count > 1:
        count -= 1
    return max(1, count)


def _is_number(word: str) -> bool:
    """Check if word contains a two+ digit number."""
    clean = word.strip(".,!?;:'\"%")
    # Match two or more digits (e.g. "20", "100", "2025", "5.82")
    return bool(re.search(r"\d{2,}", clean))


def _has_vowel_reduction(word: str) -> bool:
    """Check if word is commonly reduced in connected speech."""
    return word.lower() in HIGH_REDUCTION_WORDS


def _is_syllable_trap(word: str) -> bool:
    """Multi-syllable words where middle syllables get swallowed."""
    return word.lower() in SLOW_TRAP_WORDS


def _has_t_variant(word: str) -> bool:
    """Words with t-flapping / glottaling."""
    return word.lower() in T_VARIANTS


def _has_cluster_simplification(word: str) -> bool:
    """Final consonant cluster gets simplified."""
    return word.lower() in CLUSTER_SIMPLIFY


def _links_to_next(word: str, next_word: str | None) -> bool:
    """Check if this word likely links to the next (liaison)."""
    if not next_word:
        return False
    # Vowel-ending + consonant-starting = liaison
    w1_ends_vowel = bool(re.search(r"[aeiou]$", word.lower()))
    w2_starts_consonant = bool(re.search(r"^[^aeiou]", next_word.lower()))
    return w1_ends_vowel and w2_starts_consonant


def _score_word(
    word: str,
    prev_word: str | None,
    next_word: str | None,
) -> float:
    """Score a single word from 0-10 for listening difficulty."""
    score = 0.0
    w = word.lower().strip(".,!?;:'\"")

    # ── Rule 1: Common function-word reduction ──────────────────────────────
    if _has_vowel_reduction(w):
        score += 2.0

    # ── Rule 2: Syllable trap (multi-syllable, swallow middle) ─────────────
    if _is_syllable_trap(w):
        syllables = _syllable_count(w)
        score += min(syllables * 1.0, 4.0)

    # ── Rule 3: t-flapping / glottaling (NZ accent) ───────────────────────
    if _has_t_variant(w):
        score += 3.0

    # ── Rule 4: Consonant cluster simplification ───────────────────────────
    if _has_cluster_simplification(w):
        score += 2.5

    # ── Rule 5: Liaison (linking to next word) ─────────────────────────────
    if _links_to_next(w, next_word):
        score += 1.5

    # ── Rule 6: NZ vowel shift ─────────────────────────────────────────────
    if w in NZ_VOWEL_SHIFTS:
        score += 3.5

    # ── Rule 7: Multi-syllable words (more syllables = harder) ─────────────
    syllables = _syllable_count(w)
    if syllables >= 4:
        score += 1.5
    elif syllables >= 3:
        score += 0.5

    # ── Rule 8: Short function words are swallowed entirely ─────────────────
    if w in HIGH_REDUCTION_WORDS and len(w) <= 3:
        score += 1.5

    # ── Bonus: adjacent linked pair (e.g. 'an apple' → 'anapple') ─────────
    if prev_word:
        pw = prev_word.lower().strip(".,!?")
        if pw in ("a", "an", "the") and w[0:1] not in "aeiou":
            # Article + consonant = elision
            score += 0.5

    # ── Rule 9: h-dropping (NZ: 'have' → ''ave') ──────────────────────────
    if w in H_DROPPERS:
        score += 1.5

    # ── Rule 10: th-stopping (NZ: 'that' → 'dat') ─────────────────────────
    if w in TH_STOPPERS:
        score += 2.5

    # ── Rule 11: w/v merge (NZ: 'very' → 'wery') ─────────────────────────
    if w in WV_MERGERS:
        score += 2.0

    # ── Rule 12: vowel raising (NZ short-i → schwa) ───────────────────────
    if w in VOWEL_RAISERS:
        score += 1.5

    # ── Rule 13: Māori loan words (unfamiliar phonotactics) ───────────────
    if w in MAORI_WORDS:
        score += 3.0

    # ── Rule 14: r-dropping (non-rhotic NZ English) ───────────────────────
    if w in R_DROPPERS:
        score += 1.5

    # ── Rule 15: elision pair (two words merged) ──────────────────────────
    if prev_word and (prev_word.lower().strip(".,!?"), w) in ELISION_PAIRS:
        score += 2.0
    if next_word and (w, next_word.lower().strip(".,!?")) in ELISION_PAIRS:
        score += 1.5

    # ── Rule 16: numbers (two+ digits are high priority) ─────────────────
    if _is_number(w):
        score += 4.0

    return round(min(score, 10.0), 2)


def score_sentence_tokens(tokens: list[str]) -> list[dict]:
    """Score each token in a sentence, return ranked list.

    Each dict: {"word": str, "score": float, "index": int}
    Sorted by score descending.
    """
    results = []
    for i, tok in enumerate(tokens):
        prev = tokens[i - 1] if i > 0 else None
        nxt  = tokens[i + 1] if i < len(tokens) - 1 else None
        score = _score_word(tok, prev, nxt)
        results.append({"word": tok, "score": score, "index": i})
    results.sort(key=lambda x: x["score"], reverse=True)
    return results


def pick_quiz_word(
    sentence_tokens: list[str],
    min_score: float = 1.5,
    difficulty: str = "medium",
) -> dict | None:
    """Pick the best word to blank out for a quiz question.

    Prefers content words (nouns, verbs, adjectives, adverbs) over function words.
    Returns {"word": str, "score": float, "index": int} or None
    if no word meets the difficulty threshold.
    """
    tier = DIFFICULTY_TIERS.get(difficulty, DIFFICULTY_TIERS["medium"])
    effective_min = min_score if min_score else tier["min_score"]

    ranked = score_sentence_tokens(sentence_tokens)

    # Stop words that should never be blanked (too boring / always guessable)
    STOP_WORDS = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "am", "do", "does", "did", "have", "has", "had", "can", "could",
        "would", "should", "must", "shall", "may", "might",
        "to", "of", "in", "for", "on", "with", "at", "by", "from",
        "it", "its", "he", "she", "him", "her", "his", "they", "them",
        "you", "your", "we", "us", "our", "i", "me", "my",
        "and", "but", "or", "so", "if", "than", "that", "this",
        "not", "no", "as", "just", "also", "very", "too",
        "there", "here", "where", "when", "how", "what", "which",
        "who", "whom", "whose",
    }

    # Content words: not a stop word AND (longer than 3 chars OR capitalized)
    def is_content_word(w: str) -> bool:
        clean = w.lower().strip(".,!?;:'\"")
        if clean in STOP_WORDS:
            return False
        if clean in HIGH_REDUCTION_WORDS:
            return False
        # Heuristic: content words are usually longer or proper nouns
        return len(clean) > 3 or w[0:1].isupper()

    # Priority 1: numbers with two+ digits
    number_candidates = [
        w for w in ranked
        if _is_number(w["word"])
    ]
    if number_candidates:
        return random.choice(number_candidates[:min(3, len(number_candidates))])

    # Priority 2: content words with high scores
    content_candidates = [
        w for w in ranked
        if w["score"] >= effective_min and is_content_word(w["word"])
    ]
    if content_candidates:
        top = content_candidates[:min(5, len(content_candidates))]
        return random.choice(top)

    # Fallback: any word with high enough score (excluding stop words)
    fallback = [
        w for w in ranked
        if w["score"] >= effective_min
        and w["word"].lower().strip(".,!?;:'\"") not in STOP_WORDS
    ]
    if fallback:
        top = fallback[:min(3, len(fallback))]
        return random.choice(top)

    # Last resort: longest content word
    content = [w for w in ranked if w["word"].lower() not in HIGH_REDUCTION_WORDS]
    if content:
        return max(content, key=lambda w: len(w["word"]))
    return ranked[0] if ranked else None


def generate_distractors(
    correct_word: str,
    sentence_tokens: list[str],
    n: int = 3,
) -> list[str]:
    """Generate plausible distractor options for the quiz.

    Strategy:
    1. Same part-of-speech from the same sentence (best)
    2. Similar length content words from same sentence
    3. Fallback: any content words
    """
    correct_lower = correct_word.lower().strip(".,!?;:'\"")
    distractors: list[str] = []

    # Strategy 1: other content words from same sentence (not stop words)
    content_words = [
        t for t in sentence_tokens
        if t.lower().strip(".,!?;:'\"") != correct_lower
        and len(t) > 3
        and t.lower() not in HIGH_REDUCTION_WORDS
        and t.lower().strip(".,!?;:'\"") not in {"the", "a", "an", "is", "are", "was", "were",
            "to", "of", "in", "for", "on", "with", "at", "by", "from",
            "and", "but", "or", "so", "that", "this", "it", "its"}
    ]
    random.shuffle(content_words)
    distractors.extend(content_words[:n])

    # Strategy 2: if not enough, add shorter words from same sentence
    if len(distractors) < n:
        short_words = [
            t for t in sentence_tokens
            if t.lower().strip(".,!?;:'\"") != correct_lower
            and t.lower().strip(".,!?;:'\"") not in [d.lower().strip(".,!?;:'\"") for d in distractors]
            and len(t) > 2
            and t.lower() not in HIGH_REDUCTION_WORDS
        ]
        random.shuffle(short_words)
        distractors.extend(short_words[:n - len(distractors)])

    # Deduplicate and trim
    seen = {correct_lower}
    unique: list[str] = []
    for d in distractors:
        key = d.lower().strip(".,!?;:'\"")
        if key not in seen:
            seen.add(key)
            unique.append(d)
        if len(unique) >= n:
            break

    return unique[:n]


def make_quiz_options(
    sentence_tokens: list[str],
    difficulty: str = "medium",
) -> dict | None:
    """Build a complete quiz question from a sentence.

    Returns:
        {
            "blanked_word": str,        # the word that was removed
            "correct_answer": str,      # same, for checking
            "options": [str, ...],      # 4 options including correct
            "hint_index": int,          # position in sentence where word was
        }
    """
    pick = pick_quiz_word(sentence_tokens, difficulty=difficulty)
    if not pick:
        return None

    distractors = generate_distractors(
        pick["word"], sentence_tokens, n=3
    )

    options = distractors + [pick["word"]]
    random.shuffle(options)

    return {
        "blanked_word": pick["word"],
        "correct_answer": pick["word"],
        "options": options,
        "blank_index": pick["index"],
        "difficulty_score": pick["score"],
    }


# ── Quick test ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    test_sentences = [
        "The government is going to have to get better at communicating.",
        "She was actually quite comfortable sitting in the little letter.",
        "He's going to the dairy to get some fish and chips for tea.",
        "New Zealand has a population of about five million people.",
        "They think that the three best kaimoana are from the harbour.",
        "I would have gone to the store but it was far and I was tired.",
    ]
    for sent in test_sentences:
        tokens = sent.split()
        for diff in ("easy", "medium", "hard"):
            q = make_quiz_options(tokens, difficulty=diff)
            if q:
                print(f"\n[{diff}] Sentence: {sent}")
                print(f"  Blanked: '{q['blanked_word']}' (score={q['difficulty_score']})")
                print(f"  Options: {q['options']}")
                break
