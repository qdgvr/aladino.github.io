import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { getAllCards, getDueCards, getReviews } from "../db/indexedDb";
import { filterPracticeCards } from "../lib/cardDeck";
import { getCourseId, getCourseLabel, sortCourseIds } from "../lib/course";
import type { Card } from "../types/card";

type PracticePageProps = {
  refreshToken: number;
  onStartReview: (courseId?: string | null) => void;
};

type PracticeState = {
  totalCards: number;
  allCards: Card[];
  dueCards: Card[];
  recentReviews: number;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function PracticePage({ refreshToken, onStartReview }: PracticePageProps) {
  const [state, setState] = useState<PracticeState>({
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

        const practiceCards = filterPracticeCards(cards);
        const duePracticeCards = filterPracticeCards(dueCards);
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recentReviews = reviews.filter(
          (review) => new Date(review.reviewedAt).getTime() >= dayAgo,
        ).length;

        if (active) {
          setState({
            totalCards: practiceCards.length,
            allCards: practiceCards,
            dueCards: duePracticeCards,
            recentReviews,
          });
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "practice 데이터를 불러오지 못했습니다.");
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
    return <section className="section-card">practice 데이터를 불러오는 중...</section>;
  }

  if (error) {
    return <section className="section-card error-text">{error}</section>;
  }

  const courseStats = sortCourseIds([
    ...new Set([
      ...state.allCards.map((card) => getCourseId(card)),
      ...state.dueCards.map((card) => getCourseId(card)),
    ]),
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
          <p className="eyebrow">práctica review</p>
          <h2>{state.dueCards.length}장의 práctica 카드가 준비되었습니다.</h2>
          <p>comentario, zettel형 설명 문제, open-ended 연습 카드를 따로 복습합니다.</p>
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={state.dueCards.length === 0}
          onClick={() => onStartReview(null)}
        >
          전체 práctica 시작
        </button>
      </section>

      <section className="stat-grid">
        <article className="stat-card">
          <span>Practice cards</span>
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
            <h3>과목별 práctica</h3>
            <p>과목 단위로 open-ended/práctica 카드만 따로 봅니다.</p>
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
                  {course.label} práctica
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.dueCards.length === 0 ? (
        <EmptyState
          title="복습할 práctica 카드가 없습니다."
          description="zettel/práctica 카드를 import한 뒤 다시 확인하세요."
        />
      ) : (
        <section className="section-card">
          <div className="section-title">
            <h3>지금 복습할 práctica</h3>
            <p>main review와 분리된 open-ended 카드입니다.</p>
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
