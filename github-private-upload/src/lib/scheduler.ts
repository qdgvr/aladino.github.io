import type { Card, Rating, Review } from "../types/card";

export const DEFAULT_EASE = 2.5;

type ScheduleResult = {
  updatedCard: Card;
  review: Review;
};

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function roundEase(value: number): number {
  return Number(value.toFixed(2));
}

function createReviewId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `review-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function scheduleReview(
  card: Card,
  rating: Rating,
  reviewedAt: Date = new Date(),
): ScheduleResult {
  const previousInterval = Math.max(0, card.intervalDays);
  const previousEase = card.ease > 0 ? card.ease : DEFAULT_EASE;
  const isFirstReview = card.reviewCount === 0;

  let intervalDays = previousInterval;
  let ease = previousEase;
  let dueDate = new Date(reviewedAt);
  let lapseCount = card.lapseCount;

  switch (rating) {
    case "again":
      intervalDays = 0;
      dueDate = new Date(reviewedAt.getTime() + 10 * 60 * 1000);
      ease = roundEase(Math.max(1.3, previousEase - 0.2));
      lapseCount += 1;
      break;
    case "hard":
      intervalDays = Math.max(1, Math.round(Math.max(1, previousInterval) * 1.2));
      dueDate = addDays(reviewedAt, intervalDays);
      ease = roundEase(Math.max(1.3, previousEase - 0.1));
      break;
    case "good":
      intervalDays = isFirstReview
        ? 3
        : Math.max(3, Math.round(Math.max(1, previousInterval) * previousEase));
      dueDate = addDays(reviewedAt, intervalDays);
      break;
    case "easy":
      intervalDays = isFirstReview
        ? 7
        : Math.max(7, Math.round(Math.max(1, previousInterval) * previousEase * 1.4));
      dueDate = addDays(reviewedAt, intervalDays);
      ease = roundEase(previousEase + 0.15);
      break;
  }

  const reviewTimestamp = reviewedAt.toISOString();
  const nextDueAt = dueDate.toISOString();

  const updatedCard: Card = {
    ...card,
    intervalDays,
    dueAt: nextDueAt,
    ease,
    reviewCount: card.reviewCount + 1,
    lapseCount,
    updatedAt: reviewTimestamp,
  };

  const review: Review = {
    id: createReviewId(),
    cardId: card.id,
    rating,
    reviewedAt: reviewTimestamp,
    previousDueAt: card.dueAt,
    nextDueAt,
    intervalDays,
  };

  return { updatedCard, review };
}
