import { useEffect, useMemo, useState } from "react";
import { CardList } from "../components/CardList";
import { EmptyState } from "../components/EmptyState";
import { getAllCards } from "../db/indexedDb";
import { filterPracticeCards, filterStudyCards } from "../lib/cardDeck";
import { getCourseId, getCourseLabel, sortCourseIds } from "../lib/course";
import type { Card, ExerciseType } from "../types/card";

type CardsPageProps = {
  refreshToken: number;
};

const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  basic: "Basic",
  "cloze-typed": "Type",
  "multiple-choice": "Choice",
  "word-bank-order": "Order",
  "match-pairs": "Match",
};

export function CardsPage({ refreshToken }: CardsPageProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [search, setSearch] = useState("");
  const [selectedDeck, setSelectedDeck] = useState<"all" | "study" | "practice">("all");
  const [selectedCourse, setSelectedCourse] = useState("all");
  const [selectedExerciseType, setSelectedExerciseType] = useState<"all" | ExerciseType>("all");
  const [selectedTag, setSelectedTag] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCards() {
      setLoading(true);
      setError(null);

      try {
        const nextCards = await getAllCards();
        if (active) {
          setCards(nextCards);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "카드를 불러오지 못했습니다.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadCards();

    return () => {
      active = false;
    };
  }, [refreshToken]);

  const courseIds = useMemo(() => {
    const deckCards =
      selectedDeck === "practice"
        ? filterPracticeCards(cards)
        : selectedDeck === "study"
          ? filterStudyCards(cards)
          : cards;
    return sortCourseIds([...new Set(deckCards.map((card) => getCourseId(card)))]);
  }, [cards, selectedDeck]);

  const exerciseTypes = useMemo(() => {
    const deckCards =
      selectedDeck === "practice"
        ? filterPracticeCards(cards)
        : selectedDeck === "study"
          ? filterStudyCards(cards)
          : cards;
    return [...new Set(deckCards.map((card) => card.exerciseType))].sort((left, right) =>
      EXERCISE_TYPE_LABELS[left].localeCompare(EXERCISE_TYPE_LABELS[right]),
    );
  }, [cards, selectedDeck]);

  const cardsForTagFilter = useMemo(() => {
    const deckCards =
      selectedDeck === "practice"
        ? filterPracticeCards(cards)
        : selectedDeck === "study"
          ? filterStudyCards(cards)
          : cards;

    return deckCards.filter((card) => {
      const matchesCourse = selectedCourse === "all" || getCourseId(card) === selectedCourse;
      const matchesExerciseType =
        selectedExerciseType === "all" || card.exerciseType === selectedExerciseType;

      return matchesCourse && matchesExerciseType;
    });
  }, [cards, selectedCourse, selectedDeck, selectedExerciseType]);

  const tags = useMemo(() => {
    return [...new Set(cardsForTagFilter.flatMap((card) => card.tags))].sort((left, right) =>
      left.localeCompare(right),
    );
  }, [cardsForTagFilter]);

  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const deckCards =
      selectedDeck === "practice"
        ? filterPracticeCards(cards)
        : selectedDeck === "study"
          ? filterStudyCards(cards)
          : cards;

    return deckCards.filter((card) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [card.question, card.answer, card.sourceTitle, card.sourcePath]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesCourse =
        selectedCourse === "all" || getCourseId(card) === selectedCourse;
      const matchesExerciseType =
        selectedExerciseType === "all" || card.exerciseType === selectedExerciseType;
      const matchesTag = selectedTag === "all" || card.tags.includes(selectedTag);

      return matchesSearch && matchesCourse && matchesExerciseType && matchesTag;
    });
  }, [cards, search, selectedCourse, selectedDeck, selectedExerciseType, selectedTag]);

  const groupedCards = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const card of filteredCards) {
      const courseId = getCourseId(card);
      const existing = map.get(courseId) ?? [];
      existing.push(card);
      map.set(courseId, existing);
    }

    return sortCourseIds([...map.keys()]).map((courseId) => ({
      courseId,
      label: getCourseLabel(courseId),
      cards: map.get(courseId) ?? [],
    }));
  }, [filteredCards]);

  if (loading) {
    return <section className="section-card">카드 목록을 불러오는 중...</section>;
  }

  if (error) {
    return <section className="section-card error-text">{error}</section>;
  }

  return (
    <div className="page-stack">
      <section className="section-card">
        <div className="section-title">
          <h2>All cards</h2>
          <p>{cards.length}장의 카드가 브라우저에 저장되어 있습니다.</p>
        </div>
        <div className="filters">
          <input
            type="search"
            className="text-input"
            placeholder="질문, 답변, 소스 제목 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="select-input"
            value={selectedDeck}
            onChange={(event) => {
              setSelectedDeck(event.target.value as "all" | "study" | "practice");
              setSelectedCourse("all");
              setSelectedExerciseType("all");
              setSelectedTag("all");
            }}
          >
            <option value="all">모든 덱</option>
            <option value="study">Study</option>
            <option value="practice">Practice</option>
          </select>
          <select
            className="select-input"
            value={selectedCourse}
            onChange={(event) => {
              setSelectedCourse(event.target.value);
              setSelectedTag("all");
            }}
          >
            <option value="all">모든 과목</option>
            {courseIds.map((courseId) => (
              <option key={courseId} value={courseId}>
                {getCourseLabel(courseId)}
              </option>
            ))}
          </select>
          <select
            className="select-input"
            value={selectedExerciseType}
            onChange={(event) => {
              setSelectedExerciseType(event.target.value as "all" | ExerciseType);
              setSelectedTag("all");
            }}
          >
            <option value="all">모든 유형</option>
            {exerciseTypes.map((exerciseType) => (
              <option key={exerciseType} value={exerciseType}>
                {EXERCISE_TYPE_LABELS[exerciseType]}
              </option>
            ))}
          </select>
          <select
            className="select-input"
            value={selectedTag}
            onChange={(event) => setSelectedTag(event.target.value)}
          >
            <option value="all">모든 태그</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                #{tag}
              </option>
            ))}
          </select>
        </div>
      </section>

      {filteredCards.length === 0 ? (
        <EmptyState
          title="표시할 카드가 없습니다."
          description="검색어나 태그 필터를 조정하거나 Import 화면에서 카드를 불러오세요."
        />
      ) : (
        groupedCards.map((group) => (
          <section key={group.courseId} className="section-card">
            <div className="section-title">
              <h3>{group.label}</h3>
              <p>{group.cards.length}장의 카드</p>
            </div>
            <CardList cards={group.cards} />
          </section>
        ))
      )}
    </div>
  );
}
