import { useEffect, useState } from "react";
import { Layout, type PageKey } from "./components/Layout";
import { initDb } from "./db/indexedDb";
import { CardsPage } from "./pages/CardsPage";
import { ImportPage } from "./pages/ImportPage";
import { PracticePage } from "./pages/PracticePage";
import { ReviewPage } from "./pages/ReviewPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatsPage } from "./pages/StatsPage";
import { TodayPage } from "./pages/TodayPage";

type ReviewMode = "study" | "practice";

export default function App() {
  const [page, setPage] = useState<PageKey>("today");
  const [refreshToken, setRefreshToken] = useState(0);
  const [reviewSessionId, setReviewSessionId] = useState(0);
  const [reviewCourseId, setReviewCourseId] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<ReviewMode>("study");
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    initDb().catch((error) => {
      setDbError(error instanceof Error ? error.message : "IndexedDB를 초기화하지 못했습니다.");
    });
  }, []);

  function bumpRefreshToken() {
    setRefreshToken((current) => current + 1);
  }

  function handleStartReview(courseId: string | null = null, mode: ReviewMode = "study") {
    setReviewCourseId(courseId);
    setReviewMode(mode);
    setReviewSessionId((current) => current + 1);
    setPage("review");
  }

  function renderPage() {
    if (dbError) {
      return <section className="section-card error-text">{dbError}</section>;
    }

    switch (page) {
      case "today":
        return <TodayPage refreshToken={refreshToken} onStartReview={handleStartReview} />;
      case "practice":
        return <PracticePage refreshToken={refreshToken} onStartReview={(courseId) => handleStartReview(courseId, "practice")} />;
      case "review":
        return (
          <ReviewPage
            sessionId={reviewSessionId}
            courseId={reviewCourseId}
            mode={reviewMode}
            onDataChange={bumpRefreshToken}
            onDone={() => setPage(reviewMode === "practice" ? "practice" : "today")}
          />
        );
      case "cards":
        return <CardsPage refreshToken={refreshToken} />;
      case "import":
        return <ImportPage onDataChange={bumpRefreshToken} />;
      case "stats":
        return <StatsPage refreshToken={refreshToken} />;
      case "settings":
        return <SettingsPage onDataChange={bumpRefreshToken} />;
      default:
        return null;
    }
  }

  return (
    <Layout page={page} onNavigate={setPage}>
      {renderPage()}
    </Layout>
  );
}
