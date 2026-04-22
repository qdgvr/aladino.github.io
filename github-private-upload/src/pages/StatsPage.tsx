import { useEffect, useState } from "react";
import { getAllCards, getDueCards, getReviews } from "../db/indexedDb";
import { EmptyState } from "../components/EmptyState";
import { filterPracticeCards, filterStudyCards } from "../lib/cardDeck";
import { getCourseId, getCourseLabel, sortCourseIds } from "../lib/course";
import type { Card, ExerciseType, Review } from "../types/card";

type StatsPageProps = {
  refreshToken: number;
};

type StatsState = {
  cards: Card[];
  dueCards: Card[];
  reviews: Review[];
};

const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  basic: "Basic",
  "cloze-typed": "Type",
  "multiple-choice": "Choice",
  "word-bank-order": "Order",
  "match-pairs": "Match",
};

export function StatsPage({ refreshToken }: StatsPageProps) {
  const [state, setState] = useState<StatsState>({ cards: [], dueCards: [], reviews: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStats() {
      setLoading(true);
      setError(null);

      try {
        const [cards, dueCards, reviews] = await Promise.all([
          getAllCards(),
          getDueCards(new Date()),
          getReviews(),
        ]);
        if (active) {
          setState({ cards, dueCards, reviews });
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "통계를 불러오지 못했습니다.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadStats();

    return () => {
      active = false;
    };
  }, [refreshToken]);

  if (loading) {
    return <section className="section-card">통계를 계산하는 중...</section>;
  }

  if (error) {
    return <section className="section-card error-text">{error}</section>;
  }

  if (state.cards.length === 0) {
    return (
      <EmptyState
        title="통계를 표시할 카드가 없습니다."
        description="먼저 Import 화면에서 generated cards를 불러오세요."
      />
    );
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const studyCards = filterStudyCards(state.cards);
  const practiceCards = filterPracticeCards(state.cards);
  const dueStudyCards = filterStudyCards(state.dueCards);
  const duePracticeCards = filterPracticeCards(state.dueCards);
  const recentReviews = state.reviews.filter(
    (review) => new Date(review.reviewedAt).getTime() >= weekAgo,
  ).length;
  const difficultCards = state.cards.filter((card) => card.lapseCount >= 2).length;
  const exerciseTypeStats = Object.entries(
    state.cards.reduce<Record<string, number>>((accumulator, card) => {
      accumulator[card.exerciseType] = (accumulator[card.exerciseType] ?? 0) + 1;
      return accumulator;
    }, {}),
  )
    .map(([exerciseType, count]) => ({
      exerciseType: exerciseType as ExerciseType,
      label: EXERCISE_TYPE_LABELS[exerciseType as ExerciseType],
      count,
    }))
    .sort((left, right) => right.count - left.count);
  const courseStats = sortCourseIds([...new Set(state.cards.map((card) => getCourseId(card)))]).map((courseId) => ({
    courseId,
    label: getCourseLabel(courseId),
    total: state.cards.filter((card) => getCourseId(card) === courseId).length,
    due: state.dueCards.filter((card) => getCourseId(card) === courseId).length,
  }));
  const sourceCounts = [...state.cards.reduce((map, card) => {
    map.set(card.sourcePath, (map.get(card.sourcePath) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8);

  return (
    <div className="page-stack">
      <section className="stat-grid">
        <article className="stat-card">
          <span>Total cards</span>
          <strong>{state.cards.length}</strong>
        </article>
        <article className="stat-card">
          <span>Study due</span>
          <strong>{dueStudyCards.length}</strong>
        </article>
        <article className="stat-card">
          <span>Practice due</span>
          <strong>{duePracticeCards.length}</strong>
        </article>
        <article className="stat-card">
          <span>Total reviews</span>
          <strong>{state.reviews.length}</strong>
        </article>
        <article className="stat-card">
          <span>Reviews in 7 days</span>
          <strong>{recentReviews}</strong>
        </article>
        <article className="stat-card">
          <span>Difficult cards</span>
          <strong>{difficultCards}</strong>
        </article>
      </section>

      <section className="section-card">
        <div className="section-title">
          <h3>덱별 카드 수</h3>
          <p>main study와 práctica deck을 분리해서 봅니다.</p>
        </div>
        <ul className="compact-list">
          <li>
            <span>Study</span>
            <strong>
              {studyCards.length} / due {dueStudyCards.length}
            </strong>
          </li>
          <li>
            <span>Practice</span>
            <strong>
              {practiceCards.length} / due {duePracticeCards.length}
            </strong>
          </li>
        </ul>
      </section>

      <section className="section-card">
        <div className="section-title">
          <h3>유형별 카드 수</h3>
          <p>현재 브라우저에 저장된 문제 유형 분포입니다.</p>
        </div>
        <ul className="compact-list">
          {exerciseTypeStats.map((entry) => (
            <li key={entry.exerciseType}>
              <span>{entry.label}</span>
              <strong>{entry.count}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="section-card">
        <div className="section-title">
          <h3>과목별 카드 수</h3>
          <p>과목별 전체 카드와 due 카드 수입니다.</p>
        </div>
        <ul className="compact-list">
          {courseStats.map((course) => (
            <li key={course.courseId}>
              <span>{course.label}</span>
              <strong>
                {course.total} / due {course.due}
              </strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="section-card">
        <div className="section-title">
          <h3>sourcePath별 카드 수</h3>
          <p>상위 경로만 표시합니다.</p>
        </div>
        <ul className="compact-list">
          {sourceCounts.map(([sourcePath, count]) => (
            <li key={sourcePath}>
              <span>{sourcePath}</span>
              <strong>{count}</strong>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
