# Obsidian Memory

Obsidian markdown 노트에서 암기 카드를 추출하고 브라우저 안에서 복습하는 개인용 PWA 웹앱입니다.

이 폴더는 GitHub repository 업로드용으로 정리된 버전입니다.  
원본 수업 자료, 개인 vault 복사본, 생성된 개인 카드 데이터는 제외했습니다.

## 포함된 것

- React + Vite + TypeScript 앱 소스
- Obsidian vault 스캔 스크립트
- 카드 생성 스크립트
- PWA manifest / service worker
- 예제 vault note 1개

## 제외된 것

- `node_modules/`
- `dist/`
- 개인용 `obsidian-vault-copy` 실데이터
- 생성된 실제 카드 JSON
- 수업 원본 PDF / DOCX / PPTX / 오디오

## 설치

```bash
npm install
```

## 기본 경로

- vault 경로: `./obsidian-vault-copy`
- vault 이름: `MyVault`

## 빠른 시작

```bash
npm run prepare:cards
npm run dev
```

## 예제 vault

기본으로 아래 예제 note가 들어 있습니다.

- [Example Flashcards.md](/Users/macbookpro/Desktop/pdf/github-repo-ready/obsidian-vault-copy/Sample/Example%20Flashcards.md)

실사용할 때는 **원본 Obsidian vault를 직접 넣지 말고**, 복사본을 `./obsidian-vault-copy`에 두는 방식을 권장합니다.

## 카드 작성 문법

### Q/A

```md
Q: 스페인 내전은 언제 시작됐는가?
A: 1936년.
```

### flashcard block

```md
<!-- flashcard -->
Q: 스페인 내전의 주요 양대 세력은?
A: 공화파와 국민파.
<!-- /flashcard -->
```

### 객관식

```md
<!-- flashcard:mcq -->
Q: 스페인 내전은 언제 시작됐는가?
CHOICES:
- 1914년
- 1936년
- 1945년
- 1978년
A: 1936년
<!-- /flashcard:mcq -->
```

### 단어 배열

```md
<!-- flashcard:wordbank -->
Q: 문장을 올바른 순서로 배열하라.
TOKENS:
- El
- periodismo
- es
- un
- servicio
- publico
A: El periodismo es un servicio publico
<!-- /flashcard:wordbank -->
```

### cloze

```md
스페인 내전은 {{c1::1936년}}에 시작됐다.
```

## GitHub에 올릴 때 권장

이 폴더 전체를 repository 루트로 올리면 됩니다.

업로드 대상:

- `package.json`
- `package-lock.json`
- `index.html`
- `vite.config.ts`
- `tsconfig.json`
- `src/`
- `scripts/`
- `public/`
- `obsidian-vault-copy/` 안의 placeholder / sample만
- `data/.gitkeep`
- `.gitignore`
- `README.md`

## GitHub Pages용

정적 배포는 아래 순서로 합니다.

```bash
npm install
npm run build
```

그 뒤 생성되는 `dist/`를 Pages나 다른 정적 호스팅에 배포하면 됩니다.

## 주의

- 실제 개인 노트나 생성 카드 JSON은 공개 저장소에 올리지 않는 편이 맞습니다.
- 실데이터를 사용한 뒤에는 `obsidian-vault-copy/`와 `data/` 내용을 커밋하기 전에 확인하세요.
