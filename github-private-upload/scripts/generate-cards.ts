import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildObsidianUri } from "../src/lib/obsidianUri";
import type { CardSeed, ExerciseData, ExerciseType } from "../src/types/card";

type Heading = {
  level: number;
  text: string;
  lineNumber: number;
};

type NoteRecord = {
  filePath: string;
  title: string;
  tags: string[];
  headings: Heading[];
  body: string;
  contentHash: string;
};

type NotesIndex = {
  generatedAt: string;
  vaultPath: string;
  vaultName?: string;
  noteCount: number;
  notes: NoteRecord[];
};

type ExtractedCardDraft = {
  question: string;
  answer: string;
  sourceLine: number;
  exerciseType: ExerciseType;
  exerciseData?: ExerciseData;
};

const PROJECT_ROOT = process.cwd();
const VAULT_NAME = process.env.OBSIDIAN_VAULT_NAME ?? "MyVault";

function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function countWords(value: string): number {
  return normalizeText(value).split(/\s+/).filter(Boolean).length;
}

function getClosestHeading(headings: Heading[], lineNumber: number): string | undefined {
  return headings
    .filter((heading) => heading.lineNumber <= lineNumber)
    .sort((left, right) => right.lineNumber - left.lineNumber)[0]?.text;
}

function createCardId(
  sourcePath: string,
  question: string,
  answer: string,
  exerciseType: ExerciseType,
  exerciseData?: ExerciseData,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourcePath,
        question: normalizeText(question),
        answer: normalizeText(answer),
        exerciseType,
        exerciseData: exerciseData ?? null,
      }),
    )
    .digest("hex");
}

function createCardSeed(note: NoteRecord, draft: ExtractedCardDraft): CardSeed {
  const question = normalizeText(draft.question);
  const answer = normalizeText(draft.answer);
  const sourceHeading = getClosestHeading(note.headings, draft.sourceLine);

  return {
    id: createCardId(
      note.filePath,
      question,
      answer,
      draft.exerciseType,
      draft.exerciseData,
    ),
    question,
    answer,
    sourcePath: note.filePath,
    sourceTitle: note.title,
    sourceHeading,
    sourceHash: note.contentHash,
    obsidianUri: buildObsidianUri(VAULT_NAME, note.filePath),
    tags: note.tags,
    exerciseType: draft.exerciseType,
    exerciseData: draft.exerciseData,
    createdAt: new Date().toISOString(),
  };
}

function createContextSignature(card: Pick<CardSeed, "question" | "answer" | "sourceHeading" | "sourcePath">): string {
  return JSON.stringify({
    sourceHeading: card.sourceHeading ?? "",
    sourcePath: card.sourcePath.split("/").slice(0, -1).join("/"),
    question: normalizeText(card.question),
    answer: normalizeText(card.answer),
  });
}

function getCourseTag(tags: string[]): string | undefined {
  return tags.find((tag) => tag.startsWith("course/"));
}

function shouldPromoteBasicCard(card: CardSeed): boolean {
  if (card.exerciseType !== "basic") {
    return false;
  }

  const answerLength = normalizeText(card.answer).length;
  const answerWords = countWords(card.answer);
  return answerLength >= 140 || answerWords >= 18;
}

function scoreDistractorCandidate(answer: string, candidate: string): number {
  const answerWords = countWords(answer);
  const candidateWords = countWords(candidate);
  const wordPenalty = Math.abs(answerWords - candidateWords) * 12;
  const lengthPenalty = Math.abs(answer.length - candidate.length);
  return wordPenalty + lengthPenalty;
}

function selectMultipleChoiceDistractors(card: CardSeed, cards: CardSeed[]): string[] {
  const answer = normalizeText(card.answer);
  const courseTag = getCourseTag(card.tags);
  const candidates = cards
    .filter((candidate) => candidate.id !== card.id)
    .filter((candidate) => candidate.exerciseType === "basic" || candidate.exerciseType === "multiple-choice")
    .filter((candidate) => normalizeText(candidate.answer) !== answer)
    .filter((candidate) => {
      const candidateLength = normalizeText(candidate.answer).length;
      const candidateWords = countWords(candidate.answer);
      return candidateLength >= 40 && candidateLength <= 420 && candidateWords >= 4 && candidateWords <= 70;
    })
    .filter((candidate) => {
      if (!courseTag) {
        return true;
      }
      return getCourseTag(candidate.tags) === courseTag;
    })
    .sort((left, right) => {
      const sourceBoost =
        Number(left.sourcePath !== card.sourcePath) - Number(right.sourcePath !== card.sourcePath);
      if (sourceBoost !== 0) {
        return sourceBoost;
      }

      return (
        scoreDistractorCandidate(answer, normalizeText(left.answer)) -
        scoreDistractorCandidate(answer, normalizeText(right.answer))
      );
    });

  const selected: string[] = [];
  const seen = new Set<string>([answer]);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeText(candidate.answer);
    if (seen.has(normalizedCandidate)) {
      continue;
    }

    seen.add(normalizedCandidate);
    selected.push(normalizeText(candidate.answer));
    if (selected.length >= 4) {
      break;
    }
  }

  return selected;
}

function promoteLongBasicCards(cards: CardSeed[]): CardSeed[] {
  const promotedCards = cards.map((card) => ({ ...card, exerciseData: card.exerciseData ? { ...card.exerciseData } : undefined }));

  for (const card of promotedCards) {
    if (!shouldPromoteBasicCard(card)) {
      continue;
    }

    const distractors = selectMultipleChoiceDistractors(card, promotedCards);
    if (distractors.length < 4) {
      continue;
    }

    const exerciseData: ExerciseData = {
      ...(card.exerciseData?.context ? { context: card.exerciseData.context } : {}),
      choices: [normalizeText(card.answer), ...distractors].slice(0, 5),
      correctChoices: [normalizeText(card.answer)],
    };

    card.answer = normalizeText(card.answer);
    card.exerciseType = "multiple-choice";
    card.exerciseData = exerciseData;
    card.id = createCardId(card.sourcePath, card.question, card.answer, card.exerciseType, card.exerciseData);
  }

  return [...new Map(promotedCards.map((card) => [card.id, card])).values()];
}

function parseListBlock(rawBlock: string): string[] {
  return rawBlock
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+(.*)$/)?.[1]?.trim() ?? "")
    .filter(Boolean);
}

function parseAnswerListBlock(rawBlock: string): string[] {
  const trimmed = normalizeText(rawBlock);
  if (!trimmed) {
    return [];
  }

  const bulletValues = parseListBlock(rawBlock);
  if (bulletValues.length > 0) {
    return bulletValues.map((value) => normalizeText(value)).filter(Boolean);
  }

  return [trimmed];
}

function splitAnswerAndAcceptedAnswers(answerBlock: string): {
  answer: string;
  acceptedAnswers: string[];
} {
  const lines = answerBlock.split(/\r?\n/);
  const answerLines: string[] = [];
  const acceptedAnswers: string[] = [];
  let collectingAcceptedList = false;

  for (const line of lines) {
    const acceptMatch = line.match(/^\s*ACCEPT[.:]\s*(.*)$/i);
    if (acceptMatch) {
      const value = normalizeText(acceptMatch[1]);
      if (value) {
        acceptedAnswers.push(value);
      }
      collectingAcceptedList = false;
      continue;
    }

    if (/^\s*ACCEPTS:\s*$/i.test(line)) {
      collectingAcceptedList = true;
      continue;
    }

    if (collectingAcceptedList) {
      const bulletMatch = line.match(/^\s*-\s+(.*)$/);
      if (bulletMatch) {
        const value = normalizeText(bulletMatch[1]);
        if (value) {
          acceptedAnswers.push(value);
        }
        continue;
      }

      if (!line.trim()) {
        continue;
      }

      collectingAcceptedList = false;
    }

    answerLines.push(line);
  }

  const answer = normalizeText(answerLines.join("\n"));
  const finalAcceptedAnswers = [...new Set([answer, ...acceptedAnswers].filter(Boolean))];

  return {
    answer,
    acceptedAnswers: finalAcceptedAnswers,
  };
}

function splitWordTokens(answer: string): string[] {
  return normalizeText(answer)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function getExplicitContext(rawLine: string): string | undefined {
  const match = rawLine.trim().match(/^>?\s*Contexto:\s*(.*)$/i);
  if (!match) {
    return undefined;
  }

  const context = normalizeText(match[1]);
  return context || undefined;
}

function getExplicitContextBeforeIndex(lines: string[], index: number): string | undefined {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidateLine = lines[cursor].trim();
    if (!candidateLine) {
      continue;
    }

    if (/^#{1,6}\s+/.test(candidateLine)) {
      break;
    }

    return getExplicitContext(candidateLine);
  }

  return undefined;
}

function attachContext(
  draft: ExtractedCardDraft,
  context: string | undefined,
): ExtractedCardDraft {
  if (!context) {
    return draft;
  }

  return {
    ...draft,
    exerciseData: {
      ...(draft.exerciseData ?? {}),
      context,
    },
  };
}

function isUsefulClozeQuestion(question: string, context?: string): boolean {
  const normalizedQuestion = normalizeText(question);
  const words = normalizedQuestion
    .replace(/\[\.\.\.\]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (context) {
    return true;
  }

  if (normalizedQuestion.length < 20 || words.length < 5) {
    return false;
  }

  return !/^(esto|eso|esta|este|porque|pero|y)\s+/i.test(normalizedQuestion);
}

function parseBasicBlock(content: string, sourceLine: number): ExtractedCardDraft | null {
  const questionMatch = content.match(/(?:^|\n)Q[.:]\s*([\s\S]*?)\nA[.:]\s*/i);
  const answerMatch = content.match(/(?:^|\n)A[.:]\s*([\s\S]*)$/i);

  if (!questionMatch || !answerMatch) {
    return null;
  }

  const { answer, acceptedAnswers } = splitAnswerAndAcceptedAnswers(answerMatch[1]);
  if (!answer) {
    return null;
  }

  return {
    question: questionMatch[1],
    answer,
    sourceLine,
    exerciseType: "basic",
    exerciseData: {
      acceptedAnswers,
    },
  };
}

function parseMultipleChoiceBlock(content: string, sourceLine: number): ExtractedCardDraft | null {
  const questionMatch = content.match(/(?:^|\n)Q[.:]\s*([\s\S]*?)\nCHOICES:\s*\n/i);
  const choicesMatch = content.match(/(?:^|\n)CHOICES:\s*\n([\s\S]*?)\nA[.:]\s*/i);
  const answerMatch = content.match(/(?:^|\n)A[.:]\s*([\s\S]*)$/i);

  if (!questionMatch || !choicesMatch || !answerMatch) {
    return null;
  }

  const choices = parseListBlock(choicesMatch[1]);
  const correctChoices = [...new Set(parseAnswerListBlock(answerMatch[1]))];
  const answer = correctChoices.join("\n");

  if (
    choices.length < 2 ||
    correctChoices.length === 0 ||
    !correctChoices.every((correctChoice) =>
      choices.some((choice) => normalizeText(choice) === normalizeText(correctChoice)),
    )
  ) {
    return null;
  }

  return {
    question: questionMatch[1],
    answer,
    sourceLine,
    exerciseType: "multiple-choice",
    exerciseData: {
      choices,
      correctChoices,
    },
  };
}

function parseWordBankBlock(content: string, sourceLine: number): ExtractedCardDraft | null {
  const questionMatch = content.match(
    /(?:^|\n)Q[.:]\s*([\s\S]*?)(?:\nTOKENS:\s*\n|[\r\n]+A[.:]\s*)/i,
  );
  const tokensMatch = content.match(/(?:^|\n)TOKENS:\s*\n([\s\S]*?)\nA[.:]\s*/i);
  const answerMatch = content.match(/(?:^|\n)A[.:]\s*([\s\S]*)$/i);

  if (!questionMatch || !answerMatch) {
    return null;
  }

  const answer = normalizeText(answerMatch[1]);
  const tokens = tokensMatch ? parseListBlock(tokensMatch[1]) : splitWordTokens(answer);

  if (tokens.length === 0) {
    return null;
  }

  return {
    question: questionMatch[1],
    answer,
    sourceLine,
    exerciseType: "word-bank-order",
    exerciseData: {
      tokens,
    },
  };
}

function parseMatchPairsBlock(content: string, sourceLine: number): ExtractedCardDraft | null {
  const questionMatch = content.match(/(?:^|\n)Q[.:]\s*([\s\S]*?)\nPAIRS:\s*\n/i);
  const pairsMatch = content.match(/(?:^|\n)PAIRS:\s*\n([\s\S]*)$/i);

  if (!questionMatch || !pairsMatch) {
    return null;
  }

  const pairs = pairsMatch[1]
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s*(.*?)\s*=>\s*(.*?)\s*$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({
      left: normalizeText(match[1]),
      right: normalizeText(match[2]),
    }))
    .filter((pair) => pair.left && pair.right);

  if (pairs.length < 2) {
    return null;
  }

  return {
    question: questionMatch[1],
    answer: pairs.map((pair) => `${pair.left} => ${pair.right}`).join("\n"),
    sourceLine,
    exerciseType: "match-pairs",
    exerciseData: {
      pairs,
    },
  };
}

function parseFlashcardBlock(
  rawType: string | undefined,
  content: string,
  sourceLine: number,
): ExtractedCardDraft | null {
  const normalizedType = rawType?.trim().toLowerCase();
  switch (normalizedType) {
    case undefined:
    case "":
      return parseBasicBlock(content, sourceLine);
    case "mcq":
    case "multiple-choice":
      return parseMultipleChoiceBlock(content, sourceLine);
    case "wordbank":
    case "word-bank":
    case "word-bank-order":
      return parseWordBankBlock(content, sourceLine);
    case "match":
    case "matching":
    case "match-pairs":
      return parseMatchPairsBlock(content, sourceLine);
    default:
      return null;
  }
}

function extractFlashcardBlocks(note: NoteRecord): {
  drafts: ExtractedCardDraft[];
  blockedLines: Set<number>;
} {
  const lines = note.body.split(/\r?\n/);
  const drafts: ExtractedCardDraft[] = [];
  const blockedLines = new Set<number>();

  for (let index = 0; index < lines.length; index += 1) {
    const openingMatch = lines[index].trim().match(/^<!--\s*flashcard(?::([a-z-]+))?\s*-->$/i);
    if (!openingMatch) {
      continue;
    }

    const rawType = openingMatch[1];
    const startLine = index + 1;
    const explicitContext = getExplicitContextBeforeIndex(lines, index);
    const blockLines: string[] = [];
    blockedLines.add(startLine);
    index += 1;

    while (
      index < lines.length &&
      !/^<!--\s*\/flashcard(?::([a-z-]+))?\s*-->$/i.test(lines[index].trim())
    ) {
      blockedLines.add(index + 1);
      blockLines.push(lines[index]);
      index += 1;
    }

    if (index < lines.length) {
      blockedLines.add(index + 1);
    }

    const draft = parseFlashcardBlock(rawType, blockLines.join("\n"), startLine);
    if (draft) {
      drafts.push(attachContext(draft, explicitContext));
    }
  }

  return { drafts, blockedLines };
}

function extractQaCards(note: NoteRecord, blockedLines: Set<number>): ExtractedCardDraft[] {
  const drafts: ExtractedCardDraft[] = [];
  const lines = note.body.split(/\r?\n/);

  let questionLines: string[] = [];
  let answerLines: string[] = [];
  let startLine = 0;
  let pendingContext: string | undefined;

  const reset = () => {
    questionLines = [];
    answerLines = [];
    startLine = 0;
  };

  const finalize = () => {
    const question = normalizeText(questionLines.join("\n"));
    const answer = normalizeText(answerLines.join("\n"));

    if (question && answer && startLine > 0) {
      const { answer: normalizedAnswer, acceptedAnswers } = splitAnswerAndAcceptedAnswers(answer);
      if (!normalizedAnswer) {
        reset();
        return;
      }
      drafts.push({
        question,
        answer: normalizedAnswer,
        sourceLine: startLine,
        exerciseType: "basic",
        exerciseData: {
          acceptedAnswers,
          ...(pendingContext ? { context: pendingContext } : {}),
        },
      });
    }

    reset();
    pendingContext = undefined;
  };

  const peekNextNonEmptyLine = (startIndex: number): string | undefined => {
    for (let cursor = startIndex; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (!candidate.trim()) {
        continue;
      }
      return candidate;
    }

    return undefined;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const originalLine = lines[index];

    if (blockedLines.has(lineNumber)) {
      if (questionLines.length > 0 || answerLines.length > 0) {
        finalize();
      }
      continue;
    }

    if (/\{\{c\d+::/.test(originalLine)) {
      if (questionLines.length > 0 || answerLines.length > 0) {
        finalize();
      }
      continue;
    }

    const line = originalLine;

    if (/^\s*#{1,6}\s+/.test(line)) {
      finalize();
      pendingContext = undefined;
      continue;
    }

    const explicitContext = getExplicitContext(line);
    if (explicitContext && answerLines.length > 0) {
      finalize();
      pendingContext = explicitContext;
      continue;
    }

    if (explicitContext && questionLines.length === 0 && answerLines.length === 0) {
      pendingContext = explicitContext;
      continue;
    }

    const questionMatch = line.match(/^\s*Q[.:]\s*(.*)$/i);
    if (questionMatch) {
      if (questionLines.length > 0 || answerLines.length > 0) {
        finalize();
      }
      startLine = lineNumber;
      questionLines.push(questionMatch[1]);
      continue;
    }

    const answerMatch = line.match(/^\s*A[.:]\s*(.*)$/i);
    if (answerMatch && questionLines.length > 0) {
      answerLines.push(answerMatch[1]);
      continue;
    }

    if (answerLines.length > 0) {
      if (!line.trim()) {
        const nextNonEmptyLine = peekNextNonEmptyLine(index + 1);
        if (
          !nextNonEmptyLine ||
          getExplicitContext(nextNonEmptyLine) ||
          /^\s*Q[.:]\s*/i.test(nextNonEmptyLine) ||
          /^\s*#{1,6}\s+/.test(nextNonEmptyLine)
        ) {
          finalize();
          continue;
        }
      }

      answerLines.push(line);
      continue;
    }

    if (questionLines.length > 0) {
      questionLines.push(line);
      continue;
    }

    if (line.trim()) {
      pendingContext = undefined;
    }
  }

  finalize();
  return drafts;
}

function extractClozeCards(note: NoteRecord): ExtractedCardDraft[] {
  const drafts: ExtractedCardDraft[] = [];
  const lines = note.body.split(/\r?\n/);

  lines.forEach((line, index) => {
    const matches = [...line.matchAll(/\{\{c\d+::(.*?)(?:::[^}]+)?\}\}/g)];
    if (matches.length === 0) {
      return;
    }

    const context = getExplicitContextBeforeIndex(lines, index);

    matches.forEach((match) => {
      const answer = match[1]?.trim();
      if (!answer) {
        return;
      }

      const question = line.replace(/\{\{c\d+::(.*?)(?:::[^}]+)?\}\}/g, "[...]");
      if (!isUsefulClozeQuestion(question, context)) {
        return;
      }

      drafts.push({
        question,
        answer,
        sourceLine: index + 1,
        exerciseType: "cloze-typed" as const,
        exerciseData: context
          ? {
              context,
            }
          : undefined,
      });
    });
  });

  return drafts;
}

async function main() {
  const notesIndexPath = path.resolve(PROJECT_ROOT, "data/notes.index.json");
  const rawIndex = await readFile(notesIndexPath, "utf8");
  const parsed = JSON.parse(rawIndex) as NotesIndex;
  const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
  const cardsById = new Map<string, CardSeed>();

  for (const note of notes) {
    const noteLines = note.body.split(/\r?\n/);
    const { drafts: flashcardDrafts, blockedLines } = extractFlashcardBlocks(note);
    const qaDrafts = extractQaCards(note, blockedLines);
    const clozeDrafts = extractClozeCards(note);

    for (const draft of [...flashcardDrafts, ...qaDrafts, ...clozeDrafts]) {
      const hydratedDraft = draft.exerciseData?.context
        ? draft
        : attachContext(draft, getExplicitContextBeforeIndex(noteLines, draft.sourceLine - 1));
      const card = createCardSeed(note, hydratedDraft);
      cardsById.set(card.id, card);
    }
  }

  const cards = [...cardsById.values()];
  const contextBySignature = new Map<string, string>();

  for (const card of cards) {
    const context = card.exerciseData?.context?.trim();
    if (context) {
      contextBySignature.set(createContextSignature(card), context);
    }
  }

  for (const card of cards) {
    if (card.exerciseData?.context) {
      continue;
    }

    const inheritedContext = contextBySignature.get(createContextSignature(card));
    if (!inheritedContext) {
      continue;
    }

    card.exerciseData = {
      ...(card.exerciseData ?? {}),
      context: inheritedContext,
    };
  }

  const promotedCards = promoteLongBasicCards(cards);

  promotedCards.sort((left, right) => {
    return (
      left.sourcePath.localeCompare(right.sourcePath) ||
      left.question.localeCompare(right.question)
    );
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    vaultName: VAULT_NAME,
    cardCount: promotedCards.length,
    cards: promotedCards,
  };

  const dataDirectory = path.resolve(PROJECT_ROOT, "data");
  const publicDirectory = path.resolve(PROJECT_ROOT, "public");
  await mkdir(dataDirectory, { recursive: true });
  await mkdir(publicDirectory, { recursive: true });

  await Promise.all([
    writeFile(
      path.join(dataDirectory, "cards.generated.json"),
      JSON.stringify(payload, null, 2),
      "utf8",
    ),
    writeFile(
      path.join(publicDirectory, "cards.generated.json"),
      JSON.stringify(payload, null, 2),
      "utf8",
    ),
  ]);

  console.log(`[generate-cards] Extracted ${cards.length} cards from ${notes.length} notes.`);
}

void main().catch((error) => {
  console.error("[generate-cards] Failed:", error);
  process.exitCode = 1;
});
