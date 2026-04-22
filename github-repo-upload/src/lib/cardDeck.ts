import type { Card, CardSeed, ExerciseData } from "../types/card";

type CardLike =
  | Pick<Card, "sourcePath" | "tags" | "question" | "sourceTitle" | "sourceHeading" | "exerciseData">
  | Pick<CardSeed, "sourcePath" | "tags" | "question" | "sourceTitle" | "sourceHeading" | "exerciseData">;

function normalizeValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function hasTag(tags: string[], expected: string): boolean {
  const normalizedExpected = normalizeValue(expected);
  return tags.some((tag) => normalizeValue(tag) === normalizedExpected);
}

function normalizeBlob(values: Array<string | undefined>): string {
  return normalizeValue(values.filter(Boolean).join(" "));
}

function isComentarioPractice(item: CardLike): boolean {
  const blob = normalizeBlob([
    item.sourcePath,
    item.sourceTitle,
    item.sourceHeading,
    item.question,
    (item.exerciseData as ExerciseData | undefined)?.context,
  ]);

  return [
    "comentario de texto",
    "comentario empieza por autoria medio y capital",
    "subrayar el texto",
    "hecho informativo",
    "finalidad del texto",
    "autoria medio y capital",
    "autoría medio y capital",
    "quien firma",
    "quien escribe el texto",
    "estructura del texto",
    "analisis del texto",
    "analisis de texto",
    "pintarraquear el texto",
  ].some((pattern) => blob.includes(normalizeValue(pattern)));
}

export function isPracticeCard(item: CardLike): boolean {
  return (
    hasTag(item.tags, "deck/practice") ||
    hasTag(item.tags, "type/zettel") ||
    item.sourcePath.startsWith("Practicas/") ||
    isComentarioPractice(item)
  );
}

export function filterStudyCards<T extends CardLike>(items: T[]): T[] {
  return items.filter((item) => !isPracticeCard(item));
}

export function filterPracticeCards<T extends CardLike>(items: T[]): T[] {
  return items.filter((item) => isPracticeCard(item));
}

export function getDeckLabel(item: CardLike): "Study" | "Practice" {
  return isPracticeCard(item) ? "Practice" : "Study";
}
