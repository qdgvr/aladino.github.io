import { useState, type ChangeEvent } from "react";
import { clearAllData } from "../db/indexedDb";
import {
  downloadJson,
  exportBackupJson,
  parseBackupPayload,
  readJsonFile,
  restoreBackupJson,
} from "../lib/importExport";

type SettingsPageProps = {
  onDataChange: () => void;
};

export function SettingsPage({ onDataChange }: SettingsPageProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleExportBackup() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const backup = await exportBackupJson();
      downloadJson(`obsidian-memory-backup-${Date.now()}.json`, backup);
      setMessage("백업 JSON을 내보냈습니다.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "백업 내보내기에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleBackupImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const payload = await readJsonFile(file);
      const backup = parseBackupPayload(payload);
      await restoreBackupJson(backup);
      setMessage("백업 JSON을 복원했습니다.");
      onDataChange();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "백업 복원에 실패했습니다.");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  async function handleClearAll() {
    const confirmed = window.confirm("브라우저에 저장된 카드와 리뷰 데이터를 모두 삭제할까요?");
    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await clearAllData();
      setMessage("브라우저 데이터를 모두 초기화했습니다.");
      onDataChange();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "데이터 초기화에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="section-card">
        <div className="section-title">
          <h2>Backup and reset</h2>
          <p>카드와 리뷰 상태는 브라우저 IndexedDB에만 저장됩니다.</p>
        </div>

        <div className="settings-actions">
          <button type="button" className="secondary-button" disabled={loading} onClick={handleExportBackup}>
            전체 데이터 백업 export
          </button>

          <label className="file-input">
            <span>백업 JSON import</span>
            <input type="file" accept="application/json" onChange={handleBackupImport} />
          </label>

          <button type="button" className="danger-button" disabled={loading} onClick={handleClearAll}>
            전체 데이터 초기화
          </button>
        </div>

        {message ? <p className="success-text">{message}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="section-card">
        <div className="section-title">
          <h3>앱 정보</h3>
        </div>
        <ul className="bullet-list">
          <li>원본 Obsidian markdown은 읽기 전용으로 취급합니다.</li>
          <li>복습 상태는 서버 없이 브라우저에만 저장됩니다.</li>
          <li>Import 화면에서 generated cards JSON을 불러온 뒤 Today에서 복습을 시작하세요.</li>
          <li>원본 노트 열기 링크는 obsidian:// URI를 사용합니다.</li>
        </ul>
      </section>
    </div>
  );
}
