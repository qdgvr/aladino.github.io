import { useEffect, useMemo, useRef, useState } from "react";
import { getDeckLabel } from "../lib/cardDeck";
import { getCourseLabelFromItem } from "../lib/course";
import type { Card, ExerciseType, Rating } from "../types/card";

type ReviewCardProps = {
  card: Card;
  revealed: boolean;
  pending?: boolean;
  position: number;
  total: number;
  onReveal: () => void;
  onRate: (rating: Rating) => void;
};

type FeedbackState = {
  tone: "correct" | "incorrect";
  message: string;
};

const EXERCISE_LABELS: Record<ExerciseType, string> = {
  basic: "Basic",
  "multiple-choice": "Choice",
  "cloze-typed": "Type",
  "word-bank-order": "Order",
  "match-pairs": "Match",
};

type TokenItem = {
  id: string;
  text: string;
};

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function shuffleDeterministically<T>(items: T[], seed: string): T[] {
  return [...items]
    .map((item, index) => ({
      item,
      score: hashString(`${seed}:${index}:${JSON.stringify(item)}`),
    }))
    .sort((left, right) => left.score - right.score)
    .map((entry) => entry.item);
}

function normalizeAnswer(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripEmbeddedContext(value: string): string {
  return value
    .replace(/\n+\s*>?\s*Contexto:\s*[\s\S]*$/i, "")
    .trim();
}

function answersMatch(left: string, right: string): boolean {
  return normalizeAnswer(left) === normalizeAnswer(right);
}

function getTokenItems(card: Card): TokenItem[] {
  const rawTokens = card.exerciseData?.tokens ?? [];
  return rawTokens.map((token, index) => ({
    id: `${index}-${token}`,
    text: token,
  }));
}

function getAcceptedAnswers(card: Card): string[] {
  if (card.exerciseType === "multiple-choice") {
    const correctChoices = card.exerciseData?.correctChoices ?? card.answer.split(/\r?\n/);
    return [
      ...new Set(
        correctChoices
          .map((choice) => stripEmbeddedContext(choice))
          .map((choice) => choice.trim())
          .filter(Boolean),
      ),
    ];
  }

  if (card.exerciseType === "match-pairs") {
    const pairs = card.exerciseData?.pairs ?? [];
    return pairs.map((pair) => `${pair.left} => ${pair.right}`);
  }

  const acceptedAnswers = card.exerciseData?.acceptedAnswers ?? [];
  return [
    ...new Set(
      [...acceptedAnswers, card.answer]
        .map((answer) => stripEmbeddedContext(answer))
        .filter(Boolean),
    ),
  ];
}

export function ReviewCard({
  card,
  revealed,
  pending,
  position,
  total,
  onReveal,
  onRate,
}: ReviewCardProps) {
  const [typedAnswer, setTypedAnswer] = useState("");
  const [selectedChoices, setSelectedChoices] = useState<string[]>([]);
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matchedPairs, setMatchedPairs] = useState<Array<{ left: string; right: string }>>([]);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null);
  const [awaitingNext, setAwaitingNext] = useState(false);
  const autoAdvanceTimerRef = useRef<number | null>(null);

  const choiceOptions = useMemo(() => {
    const choices = card.exerciseData?.choices ?? [];
    return shuffleDeterministically(choices, `${card.id}:choices`);
  }, [card.exerciseData?.choices, card.id]);

  const tokenItems = useMemo(() => {
    return shuffleDeterministically(getTokenItems(card), `${card.id}:tokens`);
  }, [card]);
  const matchPairs = useMemo(() => card.exerciseData?.pairs ?? [], [card.exerciseData?.pairs]);
  const leftOptions = useMemo(
    () => shuffleDeterministically(matchPairs.map((pair) => pair.left), `${card.id}:match-left`),
    [card.id, matchPairs],
  );
  const rightOptions = useMemo(
    () => shuffleDeterministically(matchPairs.map((pair) => pair.right), `${card.id}:match-right`),
    [card.id, matchPairs],
  );

  const selectedTokens = selectedTokenIds
    .map((id) => tokenItems.find((item) => item.id === id))
    .filter((item): item is TokenItem => item !== undefined);

  const availableTokens = tokenItems.filter((item) => !selectedTokenIds.includes(item.id));
  const acceptedAnswers = useMemo(() => getAcceptedAnswers(card), [card]);
  const isMultiChoice = card.exerciseType === "multiple-choice" && acceptedAnswers.length > 1;
  const exerciseContext = card.exerciseData?.context?.trim();

  useEffect(() => {
    setTypedAnswer("");
    setSelectedChoices([]);
    setSelectedTokenIds([]);
    setSelectedLeft(null);
    setMatchedPairs([]);
    setFeedback(null);
    setSubmittedAnswer(null);
    setAwaitingNext(false);

    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, [card.id]);

  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
    };
  }, []);

  function revealWithFeedback(nextFeedback: FeedbackState | null) {
    setFeedback(nextFeedback);
    onReveal();
  }

  function handleGiveUp(userAnswer = "") {
    setSubmittedAnswer(userAnswer);
    setAwaitingNext(true);
    revealWithFeedback({
      tone: "incorrect",
      message: "정답을 확인했습니다. 내 답과 정답을 비교해보세요.",
    });
  }

  function handleObjectiveResult(userAnswer: string, isCorrect: boolean) {
    setSubmittedAnswer(userAnswer);
    setAwaitingNext(!isCorrect);
    revealWithFeedback({
      tone: isCorrect ? "correct" : "incorrect",
      message: isCorrect
        ? "정답입니다. 곧 다음 카드로 넘어갑니다."
        : "틀렸습니다. 내 답과 정답을 비교해보세요.",
    });

    if (isCorrect) {
      autoAdvanceTimerRef.current = window.setTimeout(() => {
        onRate("good");
      }, 900);
      return;
    }
  }

  function handleTypedCheck() {
    if (!typedAnswer.trim()) {
      return;
    }

    const isCorrect = acceptedAnswers.some((answer) => answersMatch(typedAnswer, answer));
    handleObjectiveResult(typedAnswer, isCorrect);
  }

  function handleChoiceCheck() {
    if (selectedChoices.length === 0) {
      return;
    }

    const normalizedSelected = [...new Set(selectedChoices.map((choice) => normalizeAnswer(choice)))].sort();
    const normalizedCorrect = [...new Set(acceptedAnswers.map((choice) => normalizeAnswer(choice)))].sort();
    const isCorrect =
      normalizedSelected.length === normalizedCorrect.length &&
      normalizedSelected.every((value, index) => value === normalizedCorrect[index]);

    handleObjectiveResult(selectedChoices.join("\n"), isCorrect);
  }

  function handleWordBankCheck() {
    if (selectedTokens.length === 0) {
      return;
    }

    const attempt = selectedTokens.map((token) => token.text).join(" ");
    const isCorrect = answersMatch(attempt, card.answer);
    handleObjectiveResult(attempt, isCorrect);
  }

  function handleMatchPairSelect(right: string) {
    if (!selectedLeft) {
      return;
    }

    setMatchedPairs((current) => {
      const next = current
        .filter((entry) => entry.left !== selectedLeft && entry.right !== right)
        .concat({ left: selectedLeft, right });
      return next;
    });
    setSelectedLeft(null);
  }

  function handleMatchCheck() {
    if (matchedPairs.length !== matchPairs.length) {
      return;
    }

    const normalizedSelected = [...matchedPairs]
      .map((pair) => `${normalizeAnswer(pair.left)}=>${normalizeAnswer(pair.right)}`)
      .sort();
    const normalizedCorrect = [...matchPairs]
      .map((pair) => `${normalizeAnswer(pair.left)}=>${normalizeAnswer(pair.right)}`)
      .sort();
    const isCorrect =
      normalizedSelected.length === normalizedCorrect.length &&
      normalizedSelected.every((value, index) => value === normalizedCorrect[index]);

    handleObjectiveResult(
      matchedPairs.map((pair) => `${pair.left} => ${pair.right}`).join("\n"),
      isCorrect,
    );
  }

  function renderExerciseBody() {
    switch (card.exerciseType) {
      case "multiple-choice":
        return (
          <div className="exercise-stack">
            {isMultiChoice ? (
              <p className="helper-text">정답이 2개 이상일 수 있습니다.</p>
            ) : null}
            <div className="choice-grid">
              {choiceOptions.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={
                    selectedChoices.includes(choice) ? "choice-button selected" : "choice-button"
                  }
                  disabled={pending}
                  onClick={() =>
                    setSelectedChoices((current) => {
                      if (isMultiChoice) {
                        return current.includes(choice)
                          ? current.filter((entry) => entry !== choice)
                          : [...current, choice];
                      }

                      return current[0] === choice ? [] : [choice];
                    })
                  }
                >
                  {choice}
                </button>
              ))}
            </div>
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                disabled={selectedChoices.length === 0 || pending}
                onClick={handleChoiceCheck}
              >
                선택 확인
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={pending}
                onClick={() => handleGiveUp(selectedChoices.join("\n"))}
              >
                정답 보기
              </button>
            </div>
          </div>
        );
      case "basic":
      case "cloze-typed":
        return (
          <div className="exercise-stack">
            <input
              type="text"
              className="text-input"
              placeholder={
                card.exerciseType === "basic" ? "답을 입력" : "빈칸 답을 입력"
              }
              value={typedAnswer}
              onChange={(event) => setTypedAnswer(event.target.value)}
            />
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                disabled={!typedAnswer.trim() || pending}
                onClick={handleTypedCheck}
              >
                {card.exerciseType === "basic" ? "답 확인" : "입력 확인"}
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={pending}
                onClick={() => handleGiveUp(typedAnswer)}
              >
                정답 보기
              </button>
            </div>
          </div>
        );
      case "word-bank-order":
        return (
          <div className="exercise-stack">
            <div className="token-zone selected-zone">
              {selectedTokens.length > 0 ? (
                selectedTokens.map((token) => (
                  <button
                    key={token.id}
                    type="button"
                    className="token-button selected"
                    disabled={pending}
                    onClick={() =>
                      setSelectedTokenIds((current) => current.filter((entry) => entry !== token.id))
                    }
                  >
                    {token.text}
                  </button>
                ))
              ) : (
                <p className="helper-text">위쪽에 단어를 눌러 문장을 만드세요.</p>
              )}
            </div>
            <div className="token-zone">
              {availableTokens.map((token) => (
                <button
                  key={token.id}
                  type="button"
                  className="token-button"
                  disabled={pending}
                  onClick={() => setSelectedTokenIds((current) => [...current, token.id])}
                >
                  {token.text}
                </button>
              ))}
            </div>
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                disabled={selectedTokens.length === 0 || pending}
                onClick={handleWordBankCheck}
              >
                배열 확인
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={selectedTokens.length === 0 || pending}
                onClick={() => setSelectedTokenIds([])}
              >
                초기화
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={pending}
                onClick={() =>
                  handleGiveUp(selectedTokens.map((token) => token.text).join(" "))
                }
              >
                정답 보기
              </button>
            </div>
          </div>
        );
      case "match-pairs":
        return (
          <div className="exercise-stack">
            <div className="match-grid">
              <div className="match-column">
                {leftOptions.map((left) => {
                  const paired = matchedPairs.find((pair) => pair.left === left);
                  return (
                    <button
                      key={left}
                      type="button"
                      className={
                        selectedLeft === left ? "choice-button selected" : "choice-button"
                      }
                      disabled={pending || Boolean(paired)}
                      onClick={() => setSelectedLeft(left)}
                    >
                      <span>{left}</span>
                      {paired ? <span className="match-chip">{paired.right}</span> : null}
                    </button>
                  );
                })}
              </div>
              <div className="match-column">
                {rightOptions.map((right) => {
                  const paired = matchedPairs.some((pair) => pair.right === right);
                  return (
                    <button
                      key={right}
                      type="button"
                      className="choice-button"
                      disabled={pending || paired || !selectedLeft}
                      onClick={() => handleMatchPairSelect(right)}
                    >
                      {right}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                disabled={matchedPairs.length !== matchPairs.length || pending}
                onClick={handleMatchCheck}
              >
                매칭 확인
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={matchedPairs.length === 0 || pending}
                onClick={() => {
                  setMatchedPairs([]);
                  setSelectedLeft(null);
                }}
              >
                초기화
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={pending}
                onClick={() =>
                  handleGiveUp(matchedPairs.map((pair) => `${pair.left} => ${pair.right}`).join("\n"))
                }
              >
                정답 보기
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <section className="review-card">
      <div className="review-card__meta">
        <span className="pill">{position + 1}</span>
        <span>
          {position + 1} / {total}
        </span>
        <span className="pill">{getCourseLabelFromItem(card)}</span>
        <span className="pill">{getDeckLabel(card)}</span>
        <span className="pill">{EXERCISE_LABELS[card.exerciseType]}</span>
      </div>

      <header className="review-card__header">
        <h2>{card.sourceTitle}</h2>
        {card.sourceHeading ? <p>{card.sourceHeading}</p> : null}
      </header>

      <div className="review-card__content">
        <div className="review-block">
          <span className="review-label">Question</span>
          {exerciseContext ? (
            <div className="context-block">
              <span className="review-label">Context</span>
              <p>{exerciseContext}</p>
            </div>
          ) : null}
          <p>{card.question}</p>
        </div>

        {!revealed ? renderExerciseBody() : null}

        {feedback ? (
          <p className={feedback.tone === "correct" ? "success-text" : "error-text"}>
            {feedback.message}
          </p>
        ) : null}

        {revealed ? (
          <div className="answer-compare">
            <div className="compare-card">
              <span className="review-label">My Answer</span>
              <p>{submittedAnswer?.trim() ? submittedAnswer : "-"}</p>
            </div>
            <div className="compare-card">
              <span className="review-label">
                {acceptedAnswers.length > 1 ? "Accepted Answers" : "Correct Answer"}
              </span>
              <p>{acceptedAnswers.join("\n")}</p>
            </div>
          </div>
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

      {revealed && awaitingNext ? (
        <button
          type="button"
          className="primary-button"
          disabled={pending}
          onClick={() => onRate("again")}
        >
          다음 카드
        </button>
      ) : null}
    </section>
  );
}
