# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 현재 상태

이 리포지토리는 아직 **요구사항 설계 단계**이며 코드가 존재하지 않는다. 유일한 파일은 `doc/requirements.md`(요구사항/설계 문서, 한국어)이다. Expo 프로젝트 초기화는 아직 진행되지 않았다(마일스톤 Phase 1, 1번 — 착수 전). 따라서 빌드/린트/테스트 명령은 존재하지 않는다. 프로젝트가 스캐폴딩된 이후 이 섹션을 실제 명령으로 갱신할 것.

## 프로젝트 개요

**Cinematic Slideshow** — 기기 갤러리의 사진 앨범(폴더)을 선택해 Ken Burns 효과(줌·팬)와 전환 효과를 적용한 슬라이드쇼로 감상하는 **로컬 전용** React Native(Expo) 앱. 서버/클라우드 연동 없음. 패키지 ID: `com.ekjeong.cinematicslideshow`(배포 후 변경 불가, 확정).

**LumisShow(NAS 서버 기반 웹앱)와 완전히 별개의 독립 신규 프로젝트**다 — 기능적 연관성 없음, 브랜드도 의도적으로 분리(상세: `doc/requirements.md`의 앱 이름 선정 과정 8번 항목).

이 프로젝트의 진짜 목적은 기능 자체가 아니라 **앱스토어 배포 프로세스와 AdMob 광고 연동 프로세스를 실제로 완주하며 학습하는 것**이다. 이 목적이 아래 모든 설계 결정의 근거이므로, 기능 확장을 제안할 때는 "v1 범위를 벗어나는가"를 먼저 판단할 것.

## 기술 스택

- React Native (Expo), 로컬 DB `expo-sqlite`, 미디어 접근 `expo-media-library`
- iOS 빌드는 로컬 Mac 부재로 **EAS Build 클라우드 빌드로만** 진행
- Android 우선 배포, iOS는 추후 확장 — **개발 시점부터 Android 전용 네이티브 모듈 사용을 피할 것**(iOS 확장 가능성을 항상 염두에 둘 것)

## 아키텍처 핵심

- **사진/음악 원본을 앱이 복사·소유하지 않는다.** OS 미디어 라이브러리에 있는 그대로 두고 `expo-media-library`가 제공하는 참조(asset ID/URI)만 SQLite에 저장한다(LumisShow의 `PHOTO_ROOT` + `app.db` 구조를 로컬로 치환한 개념).
- DB에는 메타데이터만: 앨범 정의(참조 ID·표시명), 앨범별 슬라이드쇼 설정(전환간격/순서/반복), 배경음악 트랙 연결, 앱 전역 설정.
- 사진 참조 ID(iOS `PHAsset.localIdentifier`, Android MediaStore content URI)는 앱 재설치·OS 업데이트로 무효화될 수 있음 — 구현 시 "참조 무효화 감지 후 재연결 안내" 처리가 필요함(LumisShow의 mtime 기반 캐시 무효화와 개념적으로 유사).
- Android의 "앨범"은 폴더(bucket) 그 자체이고, iOS의 "앨범"은 폴더와 무관한 사용자 큐레이션 컬렉션이다 — **iOS 착수 시 앨범 선택 UX를 반드시 재검토**해야 함(그대로 이식 불가).
- 화면은 **3화면 구조**(홈 화면 없음, 앱 진입 시 바로 앨범 목록): 앨범 목록 → 앨범별 설정 → 슬라이드쇼 재생(전체화면). 재생 화면은 웹 버전(`frontend/assets/js/pages/slideshow.js`, LumisShow 리포 소속) 수준의 컨트롤(툴바 탭 노출, 스와이프, 뒤로가기 종료, Keep Awake 상시 적용)을 목표로 함.
- 권한(READ_MEDIA_IMAGES/AUDIO) 요청은 앱 최초 실행 시가 아니라 **"앨범 선택" 액션 시점**에, rationale 화면 → 시스템 요청 → 거부 시 설정 딥링크 순서로 처리한다. Android 14+ 부분 접근 모드는 폴더 단위 선택과 구조적으로 맞지 않아 **지원하지 않음**(감지 시 전체 허용 유도).

## v1 범위 제약 (기능 제안 시 준수)

- 단일 앨범만 지원 — 복수 앨범 병합, 개별 사진 다중선택 불가
- 앱 내 커스텀 컬렉션 기능 없음
- EXIF 오버레이, 테마 기능 없음
- 광고는 배너만(전면/보상형 제외), **슬라이드쇼 재생 화면에는 광고 노출 안 함**(앨범목록·설정 화면에만)
- IAP(광고 제거 등)는 v2로 보류 — AdMob 연동과 동시 진행하지 않음

## 참고 문서

- `doc/requirements.md` — 요구사항/설계 원본. 앱 이름 선정 히스토리, 마일스톤(Phase 1~4), 배포 계획(Google Play Console 내부→비공개→프로덕션 트랙, Apple Developer는 iOS 착수 시), 번들 기본 음원(Pixabay Music, 5개 무드) 등 상세 근거가 담겨 있음 — 설계 변경 전 반드시 참조할 것.

## 테스트 규칙

**스택: React Native(Expo) — Python/pytest 아님.** Expo 프로젝트 미착수 상태라 정확한 명령은 스캐폴딩 후 확정 필요. 아래는 착수 시 적용할 방침(Jest + React Native Testing Library 기준 placeholder), 실제 스크립트명은 `package.json` 구성 후 갱신할 것.

### 코드 생성 시 Unit Test 필수 작성
- **핵심 로직(DB 스키마·데이터 접근, 슬라이드쇼 재생 상태 관리, 권한 처리 흐름 등)을 신규 추가하거나 변경할 때는 반드시 해당 기능에 대한 Unit Test를 함께 작성한다.**
- 테스트 파일은 `__tests__/` 디렉토리 또는 대상 파일 옆 `*.test.ts(x)` 형식으로 관리한다(Expo/RN 관례).
- 테스트 대상: 정상 케이스, 경계값, 참조 무효화(asset ID 무효) 케이스, 권한 거부 케이스.

### Commit 전 Unit Test 실행 필수
- **commit 전에 반드시 전체 Unit Test가 통과하는지 확인한다.** 실행 명령은 `package.json`의 `test` 스크립트 구성 후 이 섹션에 확정 기재(예상: `npx jest` 계열).
- **하나라도 실패하면 commit을 진행하지 않고 실패 원인을 먼저 수정한다.**

---

## Git Rules

### 브랜치 전략
- **소스 수정 시 반드시 `main` 기반의 개발 브랜치를 생성하여 작업한다.**
  - 브랜치명 예시: `feat/기능명`, `fix/버그명`, `chore/작업명`
  - 작업 후 해당 브랜치에 commit · push한다.
- **`main` 브랜치는 릴리즈 시 PR을 통해서만 merge한다.** 직접 push 금지.

### 파일 포함/제외
- `doc/` 폴더는 `.gitignore`에 등록되어 있으므로 git에 포함하지 않는다. (세션 요약, todo, 설계 문서 등은 로컬에만 유지)
- `CHANGELOG.md`, `README.md`, 루트 `CLAUDE.md` 등 프로젝트 루트 문서 `.md` 파일은 git에 포함한다.
- When staging files, always include project root `.md` files. Never stage files under `doc/`.
- **`doc/` 하위 파일이 이미 git에 tracked된 것을 발견하면 즉시 `git rm -r --cached doc/`로 인덱스에서 제거한다.** (로컬 파일은 유지됨)
- commit 전 `git ls-files doc/` 결과가 비어 있는지 확인한다.

## Todo 관리 규칙

대화 중 발생하는 할 일·아이디어·개선 사항은 `doc/todo/todo.md` 파일로 관리한다.

### Todo 추가 시점
- 대화 중 "나중에", "다음에", "추후", "TODO", "개선 필요" 등의 표현이 나올 때
- 분석 결과 수정이 필요하지만 현재 세션에서 처리하지 않기로 한 항목
- 사용자가 명시적으로 todo로 남겨달라고 요청할 때

### todo.md 형식

```markdown
# Todo

## 미완료

- [ ] 항목 설명 <!-- YYYY-MM-DD 추가 -->

## 완료

- [x] 항목 설명 <!-- YYYY-MM-DD 완료 -->
```

- 날짜는 `<!-- YYYY-MM-DD -->` 주석 형식으로 줄 끝에 표기
- 새 항목은 "미완료" 섹션 맨 위에 추가
- `doc/todo/` 디렉토리가 없으면 생성 후 파일 작성

### Git Rules (todo)
- `doc/todo/todo.md`는 `doc/`가 gitignore 처리되어 있으므로 git에 포함하지 않는다. (로컬 전용)

## 세션 종료 규칙

사용자가 "종료", "끝", "bye", "exit", "마무리" 등 세션을 마치려는 의사를 표현하면:

1. 현재 대화에서 수행한 주요 작업을 한국어로 요약
2. 파일명 형식: `doc/context/YYYYMMDD_HHMM_요약제목.md`
   - 날짜/시간은 실제 현재 시각 사용
   - 요약제목은 작업 내용을 2~4단어로 압축
3. 파일 내용 구성:
   - 날짜/시간
   - 작업 목록 (bullet points)
   - 주요 결정 사항 또는 변경 내용
   - 미완료 작업 또는 다음 단계 (있을 경우)
4. `doc/todo/todo.md` 확인 후 이번 세션에서 완료한 항목을 `[x]`로 표시하고 완료 날짜 주석을 추가
5. 파일 저장 후 경로를 사용자에게 알림