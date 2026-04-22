import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { ReviewCard } from "../components/ReviewCard";
import { addReview, getDueCards, updateCard } from "../db/indexedDb";
import { filterPracticeCards, filterStudyCards } from "../lib/cardDeck";
import { getCourseId, getCourseLabel } from "../lib/course";
import { scheduleReview } from "../lib/scheduler";
import type { Card, ExerciseType, Rating } from "../types/card";

type ReviewPageProps = {
  sessionId: number;
  courseId: string | null;
  mode: "study" | "practice";
  onDataChange: () => void;
  onDone: () => void;
};

function mixReviewQueue(cards: Card[]): Card[] {
  const grouped = new Map<ExerciseType, Card[]>();

  for (const card of cards) {
    const existing = grouped.get(card.exerciseType) ?? [];
    existing.push(card);
    grouped.set(card.exerciseType, existing);
  }

  const mixed: Card[] = [];
  const recentTypes: ExerciseType[] = [];

  while (mixed.length < cards.length) {
    const candidates = [...grouped.entries()].filter(([, queue]) => queue.length > 0);

    candidates.sort((left, right) => {
      const leftPenalty =
        (recentTypes[recentTypes.length - 1] === left[0] ? 2 : 0) +
        (recentTypes[recentTypes.length - 2] === left[0] ? 1 : 0);
      const rightPenalty =
        (recentTypes[recentTypes.length - 1] === right[0] ? 2 : 0) +
        (recentTypes[recentTypes.length - 2] === right[0] ? 1 : 0);

      if (leftPenalty !== rightPenalty) {
        return leftPenalty - rightPenalty;
      }

      if (right[1].length !== left[1].length) {
        return right[1].length - left[1].length;
      }

      const leftDue = left[1][0]?.dueAt ?? "";
      const rightDue = right[1][0]?.dueAt ?? "";
      if (leftDue !== rightDue) {
        return leftDue.localeCompare(rightDue);
      }

      return left[0].localeCompare(right[0]);
    });

    const selected =
      candidates.find(
        ([type]) =>
          type !== recentTypes[recentTypes.length - 1] &&
          type !== recentTypes[recentTypes.length - 2],
      ) ??
      candidates.find(([type]) => type !== recentTypes[recentTypes.length - 1]) ??
      candidates[0];

    const nextCard = selected?.[1].shift();
    if (!nextCard) {
      break;
    }

    mixed.push(nextCard);
    recentTypes.push(nextCard.exerciseType);
  }

  return mixed;
}

export function ReviewPage({ sessionId, courseId, mode, onDataChange, onDone }: ReviewPageProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadReviewQueue() {
      setLoading(true);
      setError(null);
      setCurrentIndex(0);
      setRevealed(false);

      try {
        const dueCards = await getDueCards(new Date());
        const deckCards = mode === "practice" ? filterPracticeCards(dueCards) : filterStudyCards(dueCards);
        const filteredCards = courseId
          ? deckCards.filter((card) => getCourseId(card) === courseId)
          : deckCards;
        if (active) {
          setCards(mixReviewQueue(filteredCards));
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "복습 큐를 불러오지 못했습니다.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadReviewQueue();

    return () => {
      active = false;
    };
  }, [courseId, mode, sessionId]);

  const reviewTargetLabel = courseId ? getCourseLabel(courseId) : "전체";

  async function handleRate(rating: Rating) {
    const currentCard = cards[currentIndex];
    if (!currentCard) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { updatedCard, review } = scheduleReview(currentCard, rating, new Date());
      await updateCard(updatedCard);
      await addReview(review);
      setCurrentIndex((value) => value + 1);
      setRevealed(false);
      onDataChange();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "복습 결과 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className="section-card">복습 카드를 준비하는 중...</section>;
  }

  if (error) {
    return <section className="section-card error-text">{error}</section>;
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        title="복습할 카드가 없습니다."
        description={
          courseId
            ? `${reviewTargetLabel} 과목에 현재 due 카드가 없습니다.`
            : mode === "practice"
              ? "Practice 또는 Import 화면으로 돌아가 práctica 카드를 준비하세요."
              : "Today 또는 Import 화면으로 돌아가 새 카드를 준비하세요."
        }
        actionLabel={mode === "practice" ? "Practice로 이동" : "Today로 이동"}
        onAction={onDone}
      />
    );
  }

  if (currentIndex >= cards.length) {
    return (
      <EmptyState
        title={
          courseId
            ? `${reviewTargetLabel} 복습을 끝냈습니다.`
            : mode === "practice"
              ? "오늘 práctica를 끝냈습니다."
              : "오늘 복습을 끝냈습니다."
        }
        description={`${cards.length}장의 카드를 처리했습니다. 새 due card가 생기면 다시 돌아오세요.`}
        actionLabel={mode === "practice" ? "Practice로 이동" : "Today로 이동"}
        onAction={onDone}
      />
    );
  }

  return (
    <div className="page-stack">
      {error ? <section className="section-card error-text">{error}</section> : null}
      <ReviewCard
        card={cards[currentIndex]}
        position={currentIndex}
        total={cards.length}
        revealed={revealed}
        pending={saving}
        onReveal={() => setRevealed(true)}
        onRate={handleRate}
      />
    </div>
  );
}
