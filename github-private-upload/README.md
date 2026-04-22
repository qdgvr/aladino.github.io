# Obsidian Memory

Obsidian markdown 노트에서 암기 카드를 추출하고 브라우저 안에서 복습하는 개인용 PWA 웹앱입니다.

이 폴더는 **private repository / private deploy용** 버전입니다.  
현재 실제 문제셋이 포함되어 있으므로 public repository로 올리면 안 됩니다.

## 포함된 것

- React + Vite + TypeScript 앱 소스
- Obsidian vault 스캔 스크립트
- 카드 생성 스크립트
- PWA manifest / service worker
- 실제 문제셋이 담긴 `public/cards.generated.json`
- placeholder `obsidian-vault-copy`

## 제외된 것

- `node_modules/`
- `dist/`
- 원본 수업 PDF / DOCX / PPTX / 오디오
- 실제 개인 vault 복사본 전체

## 설치

```bash
npm install
```

## 기본 경로

- vault 경로: `./obsidian-vault-copy`
- vault 이름: `MyVault`

## 휴대폰에서 같은 문제셋 쓰기

이 버전에는 현재 실제 문제셋이 이미 들어 있습니다.

- [public/cards.generated.json](/Users/macbookpro/Desktop/pdf/github-private-upload/public/cards.generated.json)

배포 후 휴대폰에서:

1. 웹앱 접속
2. `Import`
3. `내장 generated cards 불러오기`

그러면 지금 PC에서 쓰는 것과 같은 문제셋을 불러올 수 있습니다.

주의:

- 복습 기록은 브라우저 IndexedDB에 저장됩니다.
- 그래서 문제셋은 같아도 진도는 휴대폰/노트북이 자동 동기화되지 않습니다.

## 빠른 시작

```bash
npm install
npm run dev
```

## 배포 전 확인

```bash
npm install
npm run build
```

## GitHub에 올릴 때

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
- `obsidian-vault-copy/`
- `data/.gitkeep`
- `.gitignore`
- `README.md`

## GitHub Pages 배포

이 폴더는 **branch root를 직접 Pages로 내보내는 방식이 아니라, GitHub Actions로 `dist/`를 빌드해서 배포하는 방식**으로 맞춰져 있습니다.

이미 포함된 파일:

- `.github/workflows/deploy-pages.yml`

배포 순서:

1. 이 폴더 내용을 **private repository** 루트에 push
2. GitHub 저장소 `Settings -> Pages`
3. `Source`를 **GitHub Actions** 로 선택
4. `main` 브랜치에 push
5. Actions가 `npm ci -> npm run build -> dist 배포`를 수행

주의:

- `Pages -> Deploy from a branch`로 소스 루트를 바로 배포하면 404가 납니다.
- 휴대폰에서 처음 접속한 뒤에는 앱 안에서 `Import -> 내장 generated cards 불러오기`를 눌러야 실제 문제셋이 들어갑니다.

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
