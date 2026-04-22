import type { Card, Review } from "../types/card";

const DB_NAME = "obsidian-memory-pwa";
const DB_VERSION = 1;

export type MetaRecord = {
  key: string;
  value: unknown;
};

export type BackupData = {
  version: number;
  exportedAt: string;
  cards: Card[];
  reviews: Review[];
  meta: MetaRecord[];
};

let dbPromise: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function withTransaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  handler: (stores: IDBObjectStore[]) => Promise<T> | T,
): Promise<T> {
  const database = await initDb();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  const transaction = database.transaction(names, mode);
  const stores = names.map((name) => transaction.objectStore(name));
  const result = await handler(stores);
  await transactionDone(transaction);
  return result;
}

export function initDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      const cardsStore = database.objectStoreNames.contains("cards")
        ? request.transaction?.objectStore("cards")
        : database.createObjectStore("cards", { keyPath: "id" });

      if (cardsStore && !cardsStore.indexNames.contains("dueAt")) {
        cardsStore.createIndex("dueAt", "dueAt", { unique: false });
      }
      if (cardsStore && !cardsStore.indexNames.contains("sourcePath")) {
        cardsStore.createIndex("sourcePath", "sourcePath", { unique: false });
      }

      const reviewsStore = database.objectStoreNames.contains("reviews")
        ? request.transaction?.objectStore("reviews")
        : database.createObjectStore("reviews", { keyPath: "id" });

      if (reviewsStore && !reviewsStore.indexNames.contains("cardId")) {
        reviewsStore.createIndex("cardId", "cardId", { unique: false });
      }
      if (reviewsStore && !reviewsStore.indexNames.contains("reviewedAt")) {
        reviewsStore.createIndex("reviewedAt", "reviewedAt", { unique: false });
      }

      if (!database.objectStoreNames.contains("meta")) {
        database.createObjectStore("meta", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    request.onblocked = () => reject(new Error("IndexedDB open request was blocked"));
  });

  return dbPromise;
}

export async function getAllCards(): Promise<Card[]> {
  return withTransaction("cards", "readonly", async ([store]) => {
    const cards = await requestToPromise(store.getAll() as IDBRequest<Card[]>);
    return cards.sort(
      (left, right) =>
        left.dueAt.localeCompare(right.dueAt) ||
        left.sourceTitle.localeCompare(right.sourceTitle) ||
        left.question.localeCompare(right.question),
    );
  });
}

export async function getDueCards(now: Date = new Date()): Promise<Card[]> {
  return withTransaction("cards", "readonly", async ([store]) => {
    const request = store.index("dueAt").getAll(IDBKeyRange.upperBound(now.toISOString()));
    const cards = await requestToPromise(request as IDBRequest<Card[]>);
    return cards.sort(
      (left, right) =>
        left.dueAt.localeCompare(right.dueAt) ||
        left.reviewCount - right.reviewCount ||
        left.question.localeCompare(right.question),
    );
  });
}

export async function getCard(id: string): Promise<Card | undefined> {
  return withTransaction("cards", "readonly", async ([store]) => {
    const result = await requestToPromise(store.get(id) as IDBRequest<Card | undefined>);
    return result;
  });
}

export async function upsertCards(cards: Card[]): Promise<void> {
  if (cards.length === 0) {
    return;
  }

  await withTransaction("cards", "readwrite", async ([store]) => {
    await Promise.all(
      cards.map((card) => requestToPromise(store.put(card) as IDBRequest<IDBValidKey>)),
    );
  });
}

export async function updateCard(card: Card): Promise<void> {
  await withTransaction("cards", "readwrite", async ([store]) => {
    await requestToPromise(store.put(card) as IDBRequest<IDBValidKey>);
  });
}

export async function deleteCard(id: string): Promise<void> {
  await withTransaction("cards", "readwrite", async ([store]) => {
    await requestToPromise(store.delete(id));
  });
}

export async function deleteCardsAndReviews(cardIds: string[]): Promise<void> {
  if (cardIds.length === 0) {
    return;
  }

  const uniqueIds = [...new Set(cardIds)];

  await withTransaction(["cards", "reviews"], "readwrite", async ([cardsStore, reviewsStore]) => {
    const reviews = await requestToPromise(reviewsStore.getAll() as IDBRequest<Review[]>);
    const reviewIds = reviews
      .filter((review) => uniqueIds.includes(review.cardId))
      .map((review) => review.id);

    await Promise.all([
      ...uniqueIds.map((id) => requestToPromise(cardsStore.delete(id))),
      ...reviewIds.map((id) => requestToPromise(reviewsStore.delete(id))),
    ]);
  });
}

export async function addReview(review: Review): Promise<void> {
  await withTransaction("reviews", "readwrite", async ([store]) => {
    await requestToPromise(store.put(review) as IDBRequest<IDBValidKey>);
  });
}

export async function getReviews(): Promise<Review[]> {
  return withTransaction("reviews", "readonly", async ([store]) => {
    const reviews = await requestToPromise(store.getAll() as IDBRequest<Review[]>);
    return reviews.sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt));
  });
}

export async function getReviewsByCardId(cardId: string): Promise<Review[]> {
  return withTransaction("reviews", "readonly", async ([store]) => {
    const request = store.index("cardId").getAll(IDBKeyRange.only(cardId));
    const reviews = await requestToPromise(request as IDBRequest<Review[]>);
    return reviews.sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt));
  });
}

export async function clearAllData(): Promise<void> {
  await withTransaction(["cards", "reviews", "meta"], "readwrite", async (stores) => {
    await Promise.all(stores.map((store) => requestToPromise(store.clear())));
  });
}

export async function exportAllData(): Promise<BackupData> {
  return withTransaction(["cards", "reviews", "meta"], "readonly", async (stores) => {
    const [cardsStore, reviewsStore, metaStore] = stores;
    const [cards, reviews, meta] = await Promise.all([
      requestToPromise(cardsStore.getAll() as IDBRequest<Card[]>),
      requestToPromise(reviewsStore.getAll() as IDBRequest<Review[]>),
      requestToPromise(metaStore.getAll() as IDBRequest<MetaRecord[]>),
    ]);

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      cards,
      reviews,
      meta,
    };
  });
}

export async function importBackupData(data: Partial<BackupData>): Promise<void> {
  const cards = Array.isArray(data.cards) ? data.cards : [];
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  const meta = Array.isArray(data.meta) ? data.meta : [];

  await withTransaction(["cards", "reviews", "meta"], "readwrite", async (stores) => {
    const [cardsStore, reviewsStore, metaStore] = stores;

    await Promise.all([
      requestToPromise(cardsStore.clear()),
      requestToPromise(reviewsStore.clear()),
      requestToPromise(metaStore.clear()),
    ]);

    await Promise.all([
      ...cards.map((card) => requestToPromise(cardsStore.put(card) as IDBRequest<IDBValidKey>)),
      ...reviews.map((review) =>
        requestToPromise(reviewsStore.put(review) as IDBRequest<IDBValidKey>),
      ),
      ...meta.map((entry) => requestToPromise(metaStore.put(entry) as IDBRequest<IDBValidKey>)),
    ]);
  });
}
