/**
 * =============================================================================
 * Wake Words Configuration
 * =============================================================================
 *
 * This file contains the wake words used for voice activation.
 * Multiple variations are included to handle speech-to-text inaccuracies.
 *
 * =============================================================================
 */
// TODO NEED TO COME BACK AND ADD MORE VARIATIONS.....
/**
 * Primary wake words for SOGA voice assistant
 * These are checked case-insensitively against incoming transcription
 * Note: Keep these simple - no apostrophes, commas, or colons
 */
export const WAKE_WORDS: string[] = [
  // Primary variations
  "hey soga",
  "hey saga",
  "hi soga",
  "hey soha",
  "soga",
  "saga",

  // Common mishearings
  "hey so go",
  "hey soda",
  "hey sogar",
  "hey solar",
  "hey soggy",
  "hey socket",
  "hey soccer",
  "hey soaker",
  "hey sauger",
  "hey sawyer",
  "hey soldier",
  "hey sugar",

  // Short forms
  "a soga",
  "yo soga",
  "oh soga",
  "uh soga",

  // Phonetic variations
  "he so good",
  "hes so good",
  "hay soga",
  "hay saga",
  "hey sagger",
  "hey sogga",
  "hey sogo",
  "hey soger",
  "hey sager",
  "hey seager",
  "hey seago",
  "hey silga",


  // Alternative pronunciations
  "say soga",
  "so soga",
  "the soga",
  "ey soga",
  "a saga",
  "eh soga",
  "ay soga",
  "hey ai",

  // With filler words
  "ok soga",
  "okay soga",
  "alright soga",
  "well soga",

  // Mishearings with similar sounds
  "hey sagar",
  "hey soja",
  "hey sofa",
  "hey sophia",
  "hey sonia",
  "hey soma",
  "hey soba",
  "hey yoga",
  "hey yoda",
  "hey coda",
  "hey cobra",
  "hey sasha",
  "hey sasha",
  "hey saga",
  "hey sega",
  "hey sigur",
  "hey sager",
  "hey sauger",

  // More phonetic mishearings
  "hey suger",
  "hey soger",
  "hey sogur",
  "hey sawga",
  "hey sauga",
  "hey souga",
  "hey sogah",
  "hey sugah",
  "hey sokka",
  "hey soko",
  "hey socko",
  "hey soko",

  // Single syllable variations
  "so ga",
  "so go",
  "so guh",
  "saw ga",
  "sew ga",

  // With different greetings
  "hello soga",
  "hiya soga",
  "heya soga",
  "sup soga",
  "whats up soga",

  // Common prefix mishearings
  "they soga",
  "way soga",
  "may soga",
  "day soga",
  "ray soga",
  "jay soga",
  "kay soga",
  "bay soga"
];

/**
 * Silence threshold in milliseconds
 * How long to wait after last transcription before processing the command
 */
export const SILENCE_THRESHOLD_MS = 3000; // 3 seconds

/**
 * Configuration for transcription processor
 */
export const TRANSCRIPTION_CONFIG = {
  wakeWords: WAKE_WORDS,
  silenceThresholdMs: SILENCE_THRESHOLD_MS,
};
