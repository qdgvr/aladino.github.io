export type Rating = "again" | "hard" | "good" | "easy";

export type MatchPair = {
  left: string;
  right: string;
};

export type ExerciseType =
  | "basic"
  | "multiple-choice"
  | "cloze-typed"
  | "word-bank-order"
  | "match-pairs";

export type ExerciseData = {
  choices?: string[];
  tokens?: string[];
  acceptedAnswers?: string[];
  correctChoices?: string[];
  context?: string;
  pairs?: MatchPair[];
};

export type Card = {
  id: string;
  question: string;
  answer: string;
  sourcePath: string;
  sourceTitle: string;
  sourceHeading?: string;
  sourceHash: string;
  obsidianUri?: string;
  tags: string[];
  exerciseType: ExerciseType;
  exerciseData?: ExerciseData;
  dueAt: string;
  intervalDays: number;
  ease: number;
  reviewCount: number;
  lapseCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Review = {
  id: string;
  cardId: string;
  rating: Rating;
  reviewedAt: string;
  previousDueAt: string;
  nextDueAt: string;
  intervalDays: number;
};

export type CardSeed = {
  id: string;
  question: string;
  answer: string;
  sourcePath: string;
  sourceTitle: string;
  sourceHeading?: string;
  sourceHash: string;
  obsidianUri: string;
  tags: string[];
  exerciseType: ExerciseType;
  exerciseData?: ExerciseData;
  createdAt: string;
};
