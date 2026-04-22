import { useEffect, useState } from "react";
import { getAllCards, getDueCards, getReviews } from "../db/indexedDb";
import { filterStudyCards } from "../lib/cardDeck";
import { getCourseId, getCourseLabel, sortCourseIds } from "../lib/course";
import type { Card } from "../types/card";
import { EmptyState } from "../components/EmptyState";

type TodayPageProps = {
  refreshToken: number;
  onStartReview: (courseId?: string | null) => void;
};

type TodayState = {
  totalCards: number;
  allCards: Card[];
  dueCards: Card[];
  recentReviews: number;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function TodayPage({ refreshToken, onStartReview }: TodayPageProps) {
  const [state, setState] = useState<TodayState>({
    totalCards: 0,
    allCards: [],
    dueCards: [],
    recentReviews: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPage() {
      setLoading(true);
      setError(null);

      try {
        const [cards, dueCards, reviews] = await Promise.all([
          getAllCards(),
          getDueCards(new Date()),
          getReviews(),
        ]);
        const studyCards = filterStudyCards(cards);
        const dueStudyCards = filterStudyCards(dueCards);

        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recentReviews = reviews.filter(
          (review) => new Date(review.reviewedAt).getTime() >= dayAgo,
        ).length;

        if (active) {
          setState({
            totalCards: studyCards.length,
            allCards: studyCards,
            dueCards: dueStudyCards,
            recentReviews,
          });
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "오늘 데이터를 불러오지 못했습니다.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      active = false;
    };
  }, [refreshToken]);

  if (loading) {
    return <section className="section-card">오늘 복습 데이터를 불러오는 중...</section>;
  }

  if (error) {
    return <section className="section-card error-text">{error}</section>;
  }

  const courseStats = sortCourseIds([
    ...new Set([...state.allCards.map((card) => getCourseId(card)), ...state.dueCards.map((card) => getCourseId(card))]),
  ]).map((courseId) => {
    const total = state.allCards.filter((card) => getCourseId(card) === courseId).length;
    const due = state.dueCards.filter((card) => getCourseId(card) === courseId).length;

    return {
      courseId,
      label: getCourseLabel(courseId),
      total,
      due,
    };
  });

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">오늘 복습</p>
          <h2>{state.dueCards.length}장의 카드가 준비되었습니다.</h2>
          <p>카드는 브라우저 IndexedDB에 저장되고, 원본 Obsidian 노트는 수정하지 않습니다.</p>
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={state.dueCards.length === 0}
          onClick={() => onStartReview(null)}
        >
          전체 복습 시작
        </button>
      </section>

      <section className="stat-grid">
        <article className="stat-card">
          <span>Total cards</span>
          <strong>{state.totalCards}</strong>
        </article>
        <article className="stat-card">
          <span>Due now</span>
          <strong>{state.dueCards.length}</strong>
        </article>
        <article className="stat-card">
          <span>Recent reviews</span>
          <strong>{state.recentReviews}</strong>
        </article>
      </section>

      {courseStats.length > 0 ? (
        <section className="section-card">
          <div className="section-title">
            <h3>과목별 복습</h3>
            <p>과목 단위로 due 카드와 전체 카드 수를 나눠서 봅니다.</p>
          </div>
          <ul className="compact-list course-list">
            {courseStats.map((course) => (
              <li key={course.courseId}>
                <div>
                  <strong>{course.label}</strong>
                  <p>
                    Due {course.due} · Total {course.total}
                  </p>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={course.due === 0}
                  onClick={() => onStartReview(course.courseId)}
                >
                  {course.label} 복습
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.dueCards.length === 0 ? (
        <EmptyState
          title="오늘 복습할 카드가 없습니다."
          description="Import 화면에서 cards.generated.json을 불러오거나, 새 generated cards 파일을 준비하세요."
        />
      ) : (
        <section className="section-card">
          <div className="section-title">
            <h3>지금 복습할 카드</h3>
            <p>dueAt이 현재 시각보다 이전인 카드만 표시합니다.</p>
          </div>
          <ul className="compact-list">
            {state.dueCards.map((card) => (
              <li key={card.id}>
                <div>
                  <strong>{card.question}</strong>
                  <p>
                    {getCourseLabel(getCourseId(card))} · {card.sourceTitle}
                    {card.sourceHeading ? ` · ${card.sourceHeading}` : ""}
                  </p>
                </div>
                <time>{formatDate(card.dueAt)}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
