import { useMemo, useState } from "react";
import { getDeckLabel } from "../lib/cardDeck";
import { getCourseLabelFromItem } from "../lib/course";
import type { Card } from "../types/card";

type CardListProps = {
  cards: Card[];
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function getExerciseLabel(card: Card): string {
  switch (card.exerciseType) {
    case "multiple-choice":
      return "Choice";
    case "cloze-typed":
      return "Type";
    case "word-bank-order":
      return "Order";
    case "match-pairs":
      return "Match";
    case "basic":
    default:
      return "Basic";
  }
}

export function CardList({ cards }: CardListProps) {
  const [openIds, setOpenIds] = useState<string[]>([]);

  const openIdSet = useMemo(() => new Set(openIds), [openIds]);

  function toggleCard(id: string) {
    setOpenIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  return (
    <ul className="list-stack">
      {cards.map((card) => {
        const isOpen = openIdSet.has(card.id);

        return (
          <li key={card.id} className="list-item">
            <div className="list-item__header">
              <div>
                <p className="list-item__eyebrow">
                  {getCourseLabelFromItem(card)} · {card.sourceTitle}
                </p>
                <h3>{card.question}</h3>
                <p className="list-item__meta">
                  Due {formatDate(card.dueAt)} · Reviews {card.reviewCount} · {getExerciseLabel(card)} · {getDeckLabel(card)}
                </p>
              </div>

              <button type="button" className="ghost-button" onClick={() => toggleCard(card.id)}>
                {isOpen ? "접기" : "보기"}
              </button>
            </div>

            {isOpen ? (
              <div className="list-item__details">
                <p>
                  <strong>Answer:</strong> {card.answer}
                </p>
                <p>
                  <strong>Source:</strong> {card.sourcePath}
                </p>
                {card.sourceHeading ? (
                  <p>
                    <strong>Heading:</strong> {card.sourceHeading}
                  </p>
                ) : null}
                {card.tags.length > 0 ? (
                  <div className="tag-row">
                    {card.tags.map((tag) => (
                      <span key={tag} className="tag">
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {card.obsidianUri ? (
                  <a className="inline-link" href={card.obsidianUri}>
                    원본 노트 열기
                  </a>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
