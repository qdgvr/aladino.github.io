import { exportAllData, importBackupData, type BackupData } from "../db/indexedDb";
import type { Card, CardSeed, ExerciseData, ExerciseType, MatchPair, Review } from "../types/card";
import { DEFAULT_EASE } from "./scheduler";

type ImportResult = {
  cards: Card[];
  added: number;
  updated: number;
  removedIds: string[];
};

const EXERCISE_TYPES: ExerciseType[] = [
  "basic",
  "multiple-choice",
  "cloze-typed",
  "word-bank-order",
  "match-pairs",
];

function normalizeComparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasGeneratedTag(tags: string[]): boolean {
  return tags.some((tag) => normalizeComparable(tag) === "flashcards generated");
}

function createLegacyCardSignature(input: Pick<CardSeed | Card, "sourcePath" | "sourceHeading" | "question">): string {
  return [
    normalizeComparable(input.sourcePath),
    normalizeComparable(input.sourceHeading ?? ""),
    normalizeComparable(input.question),
  ].join("::");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function ensureString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  return value;
}

function ensureOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return ensureString(value, label);
}

function ensureStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }

  return value;
}

function ensureMatchPairArray(value: unknown, label: string): MatchPair[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`${label}[${index}] must be an object.`);
    }

    return {
      left: ensureString(entry.left, `${label}[${index}].left`),
      right: ensureString(entry.right, `${label}[${index}].right`),
    };
  });
}

function normalizeExerciseType(value: unknown): ExerciseType {
  if (typeof value !== "string") {
    return "basic";
  }

  return EXERCISE_TYPES.includes(value as ExerciseType) ? (value as ExerciseType) : "basic";
}

function normalizeExerciseData(value: unknown): ExerciseData | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const choices = Array.isArray(value.choices)
    ? ensureStringArray(value.choices, "exerciseData.choices")
    : undefined;
  const tokens = Array.isArray(value.tokens)
    ? ensureStringArray(value.tokens, "exerciseData.tokens")
    : undefined;
  const acceptedAnswers = Array.isArray(value.acceptedAnswers)
    ? ensureStringArray(value.acceptedAnswers, "exerciseData.acceptedAnswers")
    : undefined;
  const correctChoices = Array.isArray(value.correctChoices)
    ? ensureStringArray(value.correctChoices, "exerciseData.correctChoices")
    : undefined;
  const pairs = Array.isArray(value.pairs)
    ? ensureMatchPairArray(value.pairs, "exerciseData.pairs")
    : undefined;
  const context = typeof value.context === "string" ? value.context : undefined;

  if (!choices && !tokens && !acceptedAnswers && !correctChoices && !context && !pairs) {
    return undefined;
  }

  return {
    choices,
    tokens,
    acceptedAnswers,
    correctChoices,
    context,
    pairs,
  };
}

function normalizeCardSeed(input: unknown): CardSeed {
  if (!isRecord(input)) {
    throw new Error("Each card seed must be an object.");
  }

  return {
    id: ensureString(input.id, "cardSeed.id"),
    question: ensureString(input.question, "cardSeed.question"),
    answer: ensureString(input.answer, "cardSeed.answer"),
    sourcePath: ensureString(input.sourcePath, "cardSeed.sourcePath"),
    sourceTitle: ensureString(input.sourceTitle, "cardSeed.sourceTitle"),
    sourceHeading: ensureOptionalString(input.sourceHeading, "cardSeed.sourceHeading"),
    sourceHash: ensureString(input.sourceHash, "cardSeed.sourceHash"),
    obsidianUri: ensureString(input.obsidianUri, "cardSeed.obsidianUri"),
    tags: ensureStringArray(input.tags, "cardSeed.tags"),
    exerciseType: normalizeExerciseType(input.exerciseType),
    exerciseData: normalizeExerciseData(input.exerciseData),
    createdAt: ensureString(input.createdAt, "cardSeed.createdAt"),
  };
}

function normalizeCard(input: unknown): Card {
  if (!isRecord(input)) {
    throw new Error("Each card must be an object.");
  }

  return {
    id: ensureString(input.id, "card.id"),
    question: ensureString(input.question, "card.question"),
    answer: ensureString(input.answer, "card.answer"),
    sourcePath: ensureString(input.sourcePath, "card.sourcePath"),
    sourceTitle: ensureString(input.sourceTitle, "card.sourceTitle"),
    sourceHeading: ensureOptionalString(input.sourceHeading, "card.sourceHeading"),
    sourceHash: ensureString(input.sourceHash, "card.sourceHash"),
    obsidianUri: ensureOptionalString(input.obsidianUri, "card.obsidianUri"),
    tags: ensureStringArray(input.tags, "card.tags"),
    exerciseType: normalizeExerciseType(input.exerciseType),
    exerciseData: normalizeExerciseData(input.exerciseData),
    dueAt: ensureString(input.dueAt, "card.dueAt"),
    intervalDays: Number(input.intervalDays ?? 0),
    ease: Number(input.ease ?? DEFAULT_EASE),
    reviewCount: Number(input.reviewCount ?? 0),
    lapseCount: Number(input.lapseCount ?? 0),
    createdAt: ensureString(input.createdAt, "card.createdAt"),
    updatedAt: ensureString(input.updatedAt, "card.updatedAt"),
  };
}

function normalizeReview(input: unknown): Review {
  if (!isRecord(input)) {
    throw new Error("Each review must be an object.");
  }

  const rating = ensureString(input.rating, "review.rating");
  if (!["again", "hard", "good", "easy"].includes(rating)) {
    throw new Error("review.rating must be one of again, hard, good, easy.");
  }

  return {
    id: ensureString(input.id, "review.id"),
    cardId: ensureString(input.cardId, "review.cardId"),
    rating: rating as Review["rating"],
    reviewedAt: ensureString(input.reviewedAt, "review.reviewedAt"),
    previousDueAt: ensureString(input.previousDueAt, "review.previousDueAt"),
    nextDueAt: ensureString(input.nextDueAt, "review.nextDueAt"),
    intervalDays: Number(input.intervalDays ?? 0),
  };
}

export function parseCardSeedCollection(payload: unknown): CardSeed[] {
  const rawItems =
    Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.cards) ? payload.cards : null;

  if (!rawItems) {
    throw new Error("Card JSON must be an array or an object with a cards array.");
  }

  return rawItems.map((item) => normalizeCardSeed(item));
}

export function mergeCardSeeds(
  seeds: CardSeed[],
  existingCards: Card[],
  now: Date = new Date(),
): ImportResult {
  const timestamp = now.toISOString();
  const existingMap = new Map(existingCards.map((card) => [card.id, card]));
  const existingByLegacySignature = new Map(
    existingCards.map((card) => [createLegacyCardSignature(card), card]),
  );
  const uniqueSeeds = [...new Map(seeds.map((seed) => [seed.id, seed])).values()];
  const matchedExistingIds = new Set<string>();
  const replaceGeneratedCards = uniqueSeeds.some((seed) => hasGeneratedTag(seed.tags));

  let added = 0;
  let updated = 0;

  const cards: Card[] = uniqueSeeds.map((seed) => {
    const existing =
      existingMap.get(seed.id) ?? existingByLegacySignature.get(createLegacyCardSignature(seed));

    if (existing) {
      updated += 1;
      matchedExistingIds.add(existing.id);

      return {
        ...existing,
        question: seed.question,
        answer: seed.answer,
        sourcePath: seed.sourcePath,
        sourceTitle: seed.sourceTitle,
        sourceHeading: seed.sourceHeading,
        sourceHash: seed.sourceHash,
        obsidianUri: seed.obsidianUri,
        tags: seed.tags,
        exerciseType: seed.exerciseType,
        exerciseData: seed.exerciseData,
        updatedAt: timestamp,
      };
    }

    added += 1;

    return {
      id: seed.id,
      question: seed.question,
      answer: seed.answer,
      sourcePath: seed.sourcePath,
      sourceTitle: seed.sourceTitle,
      sourceHeading: seed.sourceHeading,
      sourceHash: seed.sourceHash,
      obsidianUri: seed.obsidianUri,
      tags: seed.tags,
      exerciseType: seed.exerciseType,
      exerciseData: seed.exerciseData,
      dueAt: timestamp,
      intervalDays: 0,
      ease: DEFAULT_EASE,
      reviewCount: 0,
      lapseCount: 0,
      createdAt: seed.createdAt || timestamp,
      updatedAt: timestamp,
    };
  });

  const removedIds = replaceGeneratedCards
    ? existingCards
        .filter((card) => hasGeneratedTag(card.tags))
        .filter((card) => !matchedExistingIds.has(card.id))
        .map((card) => card.id)
    : [];

  return { cards, added, updated, removedIds };
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `JSON parse failed: ${error.message}`
        : "JSON parse failed for the selected file.",
    );
  }
}

export async function fetchBuiltInCardSeeds(url = "/cards.generated.json"): Promise<CardSeed[]> {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Could not load built-in cards from ${url}.`);
  }

  const payload = (await response.json()) as unknown;
  return parseCardSeedCollection(payload);
}

export function parseBackupPayload(payload: unknown): BackupData {
  if (!isRecord(payload)) {
    throw new Error("Backup JSON must be an object.");
  }

  const cards = Array.isArray(payload.cards) ? payload.cards.map((item) => normalizeCard(item)) : [];
  const reviews = Array.isArray(payload.reviews)
    ? payload.reviews.map((item) => normalizeReview(item))
    : [];
  const meta = Array.isArray(payload.meta)
    ? payload.meta
        .filter(isRecord)
        .map((entry) => ({
          key: ensureString(entry.key, "meta.key"),
          value: entry.value,
        }))
    : [];

  return {
    version: Number(payload.version ?? 1),
    exportedAt: ensureString(payload.exportedAt ?? new Date().toISOString(), "backup.exportedAt"),
    cards,
    reviews,
    meta,
  };
}

export async function exportBackupJson(): Promise<BackupData> {
  return exportAllData();
}

export async function restoreBackupJson(data: BackupData): Promise<void> {
  await importBackupData(data);
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
