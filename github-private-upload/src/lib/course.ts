import type { Card, CardSeed } from "../types/card";

type CourseLike = Pick<Card, "sourcePath" | "tags"> | Pick<CardSeed, "sourcePath" | "tags">;

const COURSE_LABELS: Record<string, string> = {
  codigo: "Código",
  estructura: "Estructura",
  hpe: "HPE",
  competencia: "Competencia",
  discurso: "Discurso",
};

function normalizeValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function getCourseIdFromTags(tags: string[]): string | undefined {
  const tag = tags.find((entry) => normalizeValue(entry).startsWith("course/"));
  if (!tag) {
    return undefined;
  }

  return normalizeValue(tag.replace(/^course\//i, ""));
}

function getCourseIdFromPath(sourcePath: string): string {
  const segments = sourcePath.split("/").filter(Boolean);
  const rootSegment = segments[0] ?? "";

  if (normalizeValue(rootSegment) === "flashcards" || normalizeValue(rootSegment) === "zettelkasten") {
    return normalizeValue(segments[1] ?? "general");
  }

  return normalizeValue(rootSegment || "general");
}

export function getCourseId(item: CourseLike): string {
  return getCourseIdFromTags(item.tags) ?? getCourseIdFromPath(item.sourcePath);
}

export function getCourseLabel(courseId: string): string {
  return COURSE_LABELS[courseId] ?? courseId.toUpperCase();
}

export function getCourseLabelFromItem(item: CourseLike): string {
  return getCourseLabel(getCourseId(item));
}

export function sortCourseIds(courseIds: string[]): string[] {
  return [...courseIds].sort((left, right) => getCourseLabel(left).localeCompare(getCourseLabel(right)));
}
