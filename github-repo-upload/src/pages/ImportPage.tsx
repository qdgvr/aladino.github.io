import { useState, type ChangeEvent } from "react";
import { deleteCardsAndReviews, getAllCards, upsertCards } from "../db/indexedDb";
import { getCourseId, getCourseLabel, sortCourseIds } from "../lib/course";
import {
  fetchBuiltInCardSeeds,
  mergeCardSeeds,
  parseCardSeedCollection,
  readJsonFile,
} from "../lib/importExport";
import type { CardSeed } from "../types/card";

type ImportPageProps = {
  onDataChange: () => void;
};

type ImportMessage = {
  added: number;
  updated: number;
  total: number;
  label: string;
  courses: string;
};

export function ImportPage({ onDataChange }: ImportPageProps) {
  const [message, setMessage] = useState<ImportMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function importSeeds(seeds: CardSeed[], label: string) {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const existingCards = await getAllCards();
      const result = mergeCardSeeds(seeds, existingCards, new Date());
      await deleteCardsAndReviews(result.removedIds);
      await upsertCards(result.cards);
      setMessage({
        added: result.added,
        updated: result.updated,
        total: result.cards.length,
        label,
        courses: describeCourses(seeds),
      });
      onDataChange();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "카드 import에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const payload = await readJsonFile(file);
      const seeds = parseCardSeedCollection(payload);
      await importSeeds(seeds, file.name);
    } catch (fileError) {
      setError(
        fileError instanceof Error
          ? `파일을 처리하지 못했습니다: ${fileError.message}`
          : "파일을 처리하지 못했습니다.",
      );
    } finally {
      event.target.value = "";
    }
  }

  async function handleBuiltinImport() {
    try {
      const seeds = await fetchBuiltInCardSeeds("/cards.generated.json");
      await importSeeds(seeds, "public/cards.generated.json");
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? `내장 cards.generated.json을 불러오지 못했습니다: ${fetchError.message}`
          : "내장 generated cards를 불러오지 못했습니다.",
      );
    }
  }

  function describeCourses(seeds: CardSeed[]): string {
    const counts = new Map<string, number>();

    for (const seed of seeds) {
      const courseId = getCourseId(seed);
      counts.set(courseId, (counts.get(courseId) ?? 0) + 1);
    }

    return sortCourseIds([...counts.keys()])
      .map((courseId) => `${getCourseLabel(courseId)} ${counts.get(courseId) ?? 0}`)
      .join(" · ");
  }

  return (
    <div className="page-stack">
      <section className="section-card">
        <div className="section-title">
          <h2>Import cards</h2>
          <p>scan / generate 스크립트가 만든 cards.generated.json을 브라우저로 가져옵니다.</p>
        </div>

        <div className="import-actions">
          <label className="file-input">
            <span>JSON 파일 업로드</span>
            <input type="file" accept="application/json" onChange={handleFileChange} />
          </label>

          <button type="button" className="secondary-button" disabled={loading} onClick={handleBuiltinImport}>
            내장 generated cards 불러오기
          </button>
        </div>

        {message ? (
          <p className="success-text">
            {message.label}: {message.total}건 처리, 신규 {message.added}건, 업데이트 {message.updated}건. {message.courses}
          </p>
        ) : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="section-card">
        <div className="section-title">
          <h3>카드 JSON 기대 형식</h3>
          <p>배열 또는 {"{ cards: [...] }"} 형태를 지원합니다. 잘못된 JSON이면 명확한 오류를 보여줍니다.</p>
        </div>
      </section>
    </div>
  );
}
