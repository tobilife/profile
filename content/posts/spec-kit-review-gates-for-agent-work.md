---
title: "GitHub Spec Kit: 에이전트 작업을 리뷰할 수 있게 만드는 것은 코드가 아니라 관문이다"
date: 2025-09-24
description: "spec, plan, tasks로 이어지는 Spec Kit의 흐름을 관문 설계의 눈으로 읽고, 스크립트가 강제하는 관문과 프롬프트에만 적힌 관문을 구분합니다."
category: 저장소 소개
tags: [오픈소스, 코딩 에이전트, HITL, 가드레일, 하네스]
draft: false
---

:::note
- `github/spec-kit`은 코딩 에이전트의 작업을 원칙, 명세, 계획, 작업 목록이라는 파일 단위로 끊어 놓는 템플릿과 스크립트 모음입니다. 모델이나 서버는 들어 있지 않습니다.
- 9월 하순 기준으로 `/clarify`와 `/analyze`가 추가되어, 계획 전과 구현 전에 각각 점검 단계가 생겼습니다.
- 관문은 두 종류입니다. 셸 스크립트가 강제하는 것은 파일과 브랜치의 존재뿐이고, 내용에 대한 관문은 전부 프롬프트 템플릿에 적힌 부탁입니다.
- 사람의 검토는 수천 줄짜리 코드에서 그 앞의 문서로 당겨집니다. 반드시 지켜야 하는 관문은 CI와 브랜치 보호 규칙으로 옮겨야 합니다.
:::

코딩 에이전트를 쓰는 팀에서 흔히 듣는 말이 있습니다. "프롬프트만 잘 쓰면 알아서 만들어 준다"는 것입니다.

만들어 주기는 합니다. 문제는 그 다음입니다. **에이전트가 만든 결과를 리뷰하기 어려운 이유는 코드가 길어서가 아니라, 무엇을 만들기로 했는지가 어디에도 고정되어 있지 않기 때문입니다.**

GitHub은 2025년 9월 2일 Spec Kit을 소개하는 글에서 같은 문제를 짚었습니다. 목표를 말하면 코드가 돌아오는데, 맞아 보이지만 제대로 동작하지 않는 일이 잦고, 원인은 에이전트의 코딩 능력이 아니라 접근 방식에 있다는 진단입니다. 글은 코딩 에이전트를 검색 엔진처럼 대하지 말고 말을 글자 그대로 받아들이는 페어 프로그래머처럼 대하라고 권합니다. [\[GitHub Blog: Spec-driven development with AI\]](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)

이 글은 저장소 사용법보다 구조를 봅니다. Spec Kit이 에이전트 작업의 어디에 관문을 세우는지, 그 관문 중 어떤 것이 실제로 강제되는지, 강제되지 않는 관문을 어떻게 보완할지가 관심사입니다. 내용은 2025년 9월 23일 커밋의 README, 템플릿, 스크립트를 기준으로 합니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 보험사 계약 관리 시스템을 맡은 누군가가 에이전트에게 이렇게 요청했다고 해봅시다.

```text
계약 조회 화면에 해지 환급금 예상 조회 기능을 추가해 줘.
```

한 시간 뒤 파일 30개가 바뀐 PR이 올라옵니다. 리뷰어는 코드를 읽기 시작하지만 금방 막힙니다.

조회 권한은 누구에게 주기로 한 것인지, 조회 이력은 남기는지, 기준일은 오늘인지 전 영업일인지, 미경과 보험료와 약관대출 상환액은 어떻게 반영하는지. 코드만 봐서는 "그렇게 구현되어 있다"는 사실만 알 수 있습니다. 그것이 요구사항이었는지, 에이전트의 추측이었는지는 알 수 없습니다.

GitHub 블로그의 표현으로는, 모호한 프롬프트는 모델이 말하지 않은 요구사항 수천 개를 추측하게 만들고, 그 추측 중 일부는 틀리며, 어느 것이 틀렸는지는 구현이 한참 진행된 뒤에야 드러나곤 합니다. [\[GitHub Blog: Spec-driven development with AI\]](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)

시스템 설계의 말로 옮기면 문제는 세 가지입니다.

- 의도와 구현 사이에 중간 산출물이 없어, 검증할 기준이 없는 상태로 최종 결과만 검토하게 되었습니다.
- 에이전트가 내린 가정이 어디에도 표시되지 않아, 추측과 요구사항이 구별되지 않았습니다.
- 사내 표준이나 개인정보 처리 원칙 같은 제약이 대화 밖에 있어, 에이전트가 그것을 알 길이 없었습니다.

이 글에서는 이 환급금 조회 기능을 끝까지 들고 가면서, Spec Kit의 각 단계가 이 세 가지를 어떻게 다루는지 보겠습니다.

## 1. 한 번의 생성을 일곱 개의 명령과 파일로 끊는다

### 저장소에 들어 있는 것

Spec Kit의 구성은 단순합니다. 프로젝트를 초기화하는 `specify` CLI, 에이전트용 슬래시 명령 템플릿, 산출물 템플릿, 그리고 Bash와 PowerShell로 된 스크립트입니다. 모델이나 서버는 없고, 글과 코드는 사용자가 이미 쓰는 코딩 에이전트가 만듭니다.

README의 설치 명령은 다음과 같습니다. [\[github/spec-kit README, 2025-09-23 커밋\]](https://github.com/github/spec-kit/blob/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/README.md)

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
specify init <PROJECT_NAME>
specify check
```

설치하지 않고 한 번만 실행할 수도 있습니다.

```bash
uvx --from git+https://github.com/github/spec-kit.git specify init <PROJECT_NAME>
```

`specify init`은 `--ai` 옵션으로 대상 에이전트를 고르고, `--script` 옵션으로 `sh`와 `ps` 중 스크립트 종류를 고릅니다. 같은 README의 지원 표에는 Claude Code, GitHub Copilot, Gemini CLI, Cursor 등 열한 개 에이전트가 올라 있고, Codex CLI는 슬래시 명령에 인자를 넘기지 못한다는 이유로 부분 지원으로 표시되어 있습니다.

여기서 눈여겨볼 점은 Spec Kit이 에이전트를 바꾸지 않는다는 것입니다. 같은 템플릿을 에이전트마다 다른 위치에 슬래시 명령으로 깔아 줄 뿐입니다. 그래서 이 저장소를 읽는다는 것은 곧 "에이전트에게 어떤 순서로 무엇을 쓰게 하는가"를 읽는 일이 됩니다.

### 명령과 산출물

초기화가 끝나면 에이전트 안에서 일곱 개의 명령을 쓸 수 있습니다. README의 명령 표를 산출물 중심으로 다시 정리했습니다.

| 명령 | 하는 일 | 남는 것 |
| --- | --- | --- |
| `/constitution` | 프로젝트 원칙과 개발 지침을 정한다 | `memory/constitution.md` |
| `/specify` | 무엇을, 왜 만드는지 정의한다 | 기능별 `spec.md`, 기능 브랜치 |
| `/clarify` | 명세의 빈 곳을 질문으로 메운다 | 명세 안의 Clarifications 절 |
| `/plan` | 기술 스택과 구조를 정한다 | `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` |
| `/tasks` | 계획을 작업 목록으로 쪼갠다 | `tasks.md` |
| `/analyze` | 세 문서의 일관성과 누락을 점검한다 | 분석 보고(파일 수정 없음) |
| `/implement` | 작업 목록대로 구현한다 | 코드, 완료 표시된 `tasks.md` |

### 한 기능이 지나는 길

환급금 조회 기능 하나가 이 흐름을 지나면 저장소에는 다음과 같은 흔적이 남습니다. 디렉터리 이름의 번호와 브랜치 이름은 스크립트가 정합니다. 아래 기능명은 예시입니다.

```text
/constitution ──> memory/constitution.md (원칙, 버전 붙음)
      │
/specify ──> 브랜치 003-surrender-value-inquiry
      │       specs/003-surrender-value-inquiry/spec.md
      │
/clarify ──> spec.md 안 ## Clarifications ──> (사람 검토: 요구사항)
      │
/plan ──> plan.md, research.md, data-model.md,
      │   contracts/, quickstart.md ──> (사람 검토: 설계)
      │
/tasks ──> tasks.md (T001, T002 ... [P] 표시)
      │
/analyze ──> 보고서 (CRITICAL / HIGH / MEDIUM / LOW) ──> (사람 검토: 정합성)
      │
/implement ──> 코드, tasks.md 완료 표시 ──> PR ──> (사람 검토: 코드)
```

9월 초 블로그는 Specify, Plan, Tasks, Implement의 네 단계를 소개했습니다. 3주 뒤 README에는 원칙을 정하는 단계와 두 개의 점검 단계가 더 붙어 있습니다. 생성 단계보다 점검 단계가 늘어나는 방향이라는 점이 이 저장소의 성격을 잘 보여 준다고 봅니다.

### 대가와 쓰지 말아야 할 때

명령이 일곱 개라는 것은 사람이 읽어야 할 문서가 그만큼 생긴다는 뜻입니다. GitHub 블로그도 앞으로 개선할 점으로 글 더미를 읽는 일이 지루할 수 있다는 것과 수많은 Markdown 파일을 조직 규모로 관리하는 문제를 직접 꼽았습니다. [\[GitHub Blog: Spec-driven development with AI\]](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)

그래서 저는 오타 수정, 문구 변경, 라이브러리 패치 버전 올리기 같은 일에는 이 흐름을 쓰지 않는 편이 낫다고 봅니다. 명세에 적을 요구사항이 한 줄이면 명세가 줄 수 있는 것도 한 줄입니다.

더 가벼운 대안도 있습니다. Anthropic은 4월에 낸 Claude Code 활용 가이드에서 탐색, 계획, 코딩, 커밋의 순서를 권하면서, 앞의 두 단계를 건너뛰면 Claude가 곧바로 코딩에 뛰어드는 경향이 있다고 적었습니다. [\[Anthropic: Claude Code Best Practices, 2025-06-02 스냅샷\]](https://web.archive.org/web/20250602202220/https://www.anthropic.com/engineering/claude-code-best-practices) 계획을 먼저 받고 확인한 뒤 코딩하게 하는 것만으로 충분한 변경이 많습니다. Spec Kit은 그 계획을 여러 파일로 나누고 각 파일에 관문을 붙인 무거운 형태라고 보면 됩니다.

## 2. 모호함은 추측하지 않고 표시하게 하고, 질문은 다섯 개로 묶는다

### 명세 템플릿이 모델에게 시키는 것

앞의 실패 상황에서 가장 아픈 부분은 에이전트의 추측이 코드 속에 조용히 묻힌 것이었습니다. Spec Kit의 명세 템플릿은 이 지점을 겨냥합니다.

템플릿의 AI 생성용 지침은 네 가지를 요구합니다. 가정이 필요한 곳마다 `[NEEDS CLARIFICATION: 구체적인 질문]` 표시를 남길 것, 추측하지 말 것, 테스터처럼 생각해서 모호한 요구사항은 체크리스트의 "테스트 가능하고 모호하지 않은가" 항목에서 떨어지게 할 것, 그리고 흔히 빠지는 영역을 살필 것입니다. 그 영역으로는 사용자 유형과 권한, 데이터 보존과 삭제 정책, 성능 목표와 규모, 오류 처리, 연동 요구사항, 보안과 규제 요구사항이 나열되어 있습니다. [\[spec-kit: spec-template.md\]](https://github.com/github/spec-kit/blob/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/templates/spec-template.md)

이 목록은 보험 업무 담당자가 보면 낯익을 것입니다. 앞의 환급금 조회에서 리뷰어가 막힌 질문들이 거의 그대로 들어 있습니다.

템플릿은 프로그램처럼 생긴 실행 흐름도 담고 있습니다. 사용자 설명이 비어 있으면 오류, 사용자 시나리오를 정할 수 없으면 오류, 표시가 남아 있으면 경고, 구현 세부가 들어 있으면 오류를 내라는 식입니다. 명세 끝에는 Review & Acceptance Checklist가 붙습니다. 구현 세부가 없는지, 비기술 이해관계자가 읽을 수 있는지, 요구사항이 테스트 가능한지, 성공 기준이 측정 가능한지, 범위가 닫혀 있는지, 표시가 남아 있지 않은지를 확인하는 항목들입니다.

환급금 조회 기능으로 `/specify`를 돌리면 명세에는 대략 이런 줄이 남는 것이 바람직합니다.

```text
[예시] specs/003-surrender-value-inquiry/spec.md 일부

### Functional Requirements
- FR-001: 시스템은 계약 번호로 해지 시 예상 환급금을 조회할 수 있어야 한다
- FR-002: 시스템은 조회 결과에 산출 기준일을 함께 표시해야 한다
- FR-003: 시스템은 조회 권한을 [NEEDS CLARIFICATION: 계약자 본인만? 상담원 포함? 설계사 포함?]
          에게만 허용해야 한다
- FR-004: 시스템은 조회 이력을 [NEEDS CLARIFICATION: 남기는가? 보존 기간은?] 기록해야 한다
- FR-005: 산출 기준일은 [NEEDS CLARIFICATION: 조회 당일인가, 전 영업일 마감 기준인가?]
```

코드 30개 파일 속에 묻혀 있던 가정 세 개가 명세 다섯 줄 안에 질문의 형태로 올라와 있습니다. 이것이 Spec Kit이 만드는 첫 번째 관문의 실체라고 봅니다.

### `/clarify`는 어떤 순서로 질문하는가

`/clarify`는 이 표시를 줄이는 단계입니다. 명령 템플릿에 적힌 절차가 꽤 구체적입니다. [\[spec-kit: clarify.md\]](https://github.com/github/spec-kit/blob/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/templates/commands/clarify.md)

1. 스크립트로 현재 기능의 명세 경로를 얻습니다.
2. 명세를 분류 체계에 따라 훑으며 범주마다 Clear, Partial, Missing 중 하나로 표시합니다. 범주에는 기능 범위, 도메인과 데이터 모델, 비기능 요구, 연동, 예외 흐름, 용어, 완료 신호 등이 있습니다.
3. 후보 질문을 우선순위 큐로 만들되, 영향도와 불확실성을 곱한 값으로 상위 다섯 개만 고릅니다.
4. 한 번에 정확히 하나의 질문만 냅니다. 답은 2~5개 선택지 중 하나이거나 다섯 단어 이내의 짧은 답이어야 합니다.
5. 답을 받을 때마다 명세의 `## Clarifications` 아래 날짜별 세션에 질문과 답을 한 줄로 기록하고, 그 답을 기능 요구사항, 데이터 모델, 예외 흐름 등 해당 절에 바로 반영합니다.
6. 끝나면 범주별로 Resolved, Deferred, Clear, Outstanding을 표로 보고하고, `/plan`으로 넘어가도 되는지 권고합니다.

질문은 아키텍처, 데이터 모델, 작업 분해, 테스트 설계, 운영 준비, 규제 검증에 실질적으로 영향을 주는 것으로 한정됩니다. 앞으로 낼 질문을 미리 보여 주지 말라는 규칙도 있습니다.

환급금 조회 기능이라면 세션 기록은 이런 모양이 됩니다. 질문과 답의 내용은 예시입니다.

```text
[예시] spec.md 의 Clarifications 절

## Clarifications
### Session 2025-09-24
- Q: 예상 환급금 조회 권한은 누구에게 주는가? → A: 계약자 본인, 콜센터 상담원
- Q: 조회 이력을 남기는가? → A: 남긴다, 5년 보존
- Q: 산출 기준일은? → A: 전 영업일 마감
```

기록과 동시에 FR-003부터 FR-005의 표시가 사라지고 확정된 문장으로 바뀌어야 합니다. 템플릿의 검증 단계는 답 하나당 기록이 정확히 한 줄인지, 모순되는 옛 문장이 남아 있지 않은지, 용어가 통일되었는지를 확인하라고 적습니다.

### 질문 수를 묶은 것이 왜 중요한가

저는 질문 수를 다섯 개로 제한한 점이 이 저장소에서 가장 잘된 설계라고 봅니다. 에이전트가 질문을 20개 쏟아내면 사람은 대충 답하게 되고, 그러면 관문은 형식만 남습니다. 영향도 순으로 다섯 개만 묻고 나머지는 Deferred로 남기게 하면, 사람의 주의를 가장 비싼 결정에 먼저 쓰게 됩니다.

README는 `/clarify`를 `/plan` 전에 실행하도록 안내하고, 건너뛰려면 그 의도를 명시하라고 적습니다. 탐색용 프로토타입처럼 건너뛰는 것이 맞는 경우가 있다는 점도 인정합니다. `/clarify`는 README에 예전 이름이 `/quizme`였다고 적혀 있습니다. [\[github/spec-kit README, 2025-09-23 커밋\]](https://github.com/github/spec-kit/blob/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/README.md)

### 이 단계가 깨지는 방식

첫째, 답하는 사람이 결정권자가 아닐 수 있습니다. 조회 이력 보존 기간은 개발자가 아니라 준법감시나 개인정보 보호 담당이 정할 일입니다. `/clarify`는 질문을 잘 고르지만, 누가 답해야 하는지는 모릅니다. 저는 범주별로 답할 사람을 미리 정해 두는 편이 안전하다고 봅니다.

둘째, 다섯 개 할당량이 차면 중요한 질문도 Deferred로 넘어갑니다. 템플릿은 그 경우 Deferred로 명시하고 이유를 적으라고 하지만, Deferred가 남은 명세로 `/plan`을 진행할지는 결국 사람이 보고서를 읽고 판단해야 합니다.

셋째, 체크리스트를 채우는 주체가 명세를 쓴 그 모델입니다. 자기가 쓴 글을 자기가 검사하는 구조이므로, 체크 표시는 검토가 끝났다는 증거가 아니라 검토할 목록일 뿐이라고 읽는 편이 맞습니다.

## 3. 계획과 작업 목록: 원칙은 점검 절로, 순서는 작업 번호로 고정한다

### constitution은 버전이 붙은 원칙 문서다

`/constitution`이 만드는 `memory/constitution.md`는 프로젝트의 원칙을 모아 두는 파일입니다. 저장소에 들어 있는 것은 원칙 이름과 설명이 빈칸으로 된 템플릿이고, 주석으로 테스트 우선이나 관측성 같은 예시가 달려 있습니다.

명령 템플릿은 이 문서를 고칠 때 시맨틱 버전을 올리라고 지시합니다. 원칙을 없애거나 재정의하면 MAJOR, 원칙을 추가하거나 크게 넓히면 MINOR, 문구 정리는 PATCH입니다. 고친 뒤에는 계획, 명세, 작업 템플릿이 새 원칙과 맞는지 확인하고, 무엇이 바뀌었는지를 Sync Impact Report로 파일 맨 위에 남기게 되어 있습니다. [\[spec-kit: templates 디렉터리\]](https://github.com/github/spec-kit/tree/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/templates)

방법론 문서인 `spec-driven.md`는 원칙의 예로 아홉 개 조항을 듭니다. 모든 기능을 독립 라이브러리로 시작한다는 조항, 모든 라이브러리가 텍스트 입출력 CLI를 갖춘다는 조항, 테스트 우선, 초기 구현은 프로젝트 세 개 이하로 하고 프레임워크를 감싸지 말고 직접 쓰라는 단순성 조항 등입니다. [\[spec-kit: spec-driven.md\]](https://github.com/github/spec-kit/blob/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/spec-driven.md)

이 조항들은 예시일 뿐이고, 보험사라면 전혀 다른 원칙이 들어갈 것입니다. 환급금 조회 기능에 적용될 만한 원칙을 constitution 형식으로 적어 보면 이렇습니다.

```text
[예시] memory/constitution.md 일부

### I. 사내 표준 프레임워크 우선
신규 기능은 사내 표준 프레임워크의 서비스 계층 규약을 따른다.
표준에 없는 라이브러리 도입은 아키텍처 위원회 승인을 받는다.

### II. 개인정보 조회 기록 (NON-NEGOTIABLE)
고객 개인정보 또는 계약 금액을 화면에 표시하는 모든 기능은
조회자, 조회 시각, 대상 계약 번호를 조회 이력 테이블에 남긴다.

### III. 산출 로직 단일화
보험료, 환급금 등 금액 산출은 기존 산출 모듈을 호출한다.
화면 계층에서 산출식을 다시 구현하지 않는다.

**Version**: 1.2.0 | **Ratified**: 2025-03-02 | **Last Amended**: 2025-09-10
```

### `/plan`은 명세를 확인하고, 원칙을 두 번 대조한다

`/plan` 명령 템플릿의 첫 단계가 흥미롭습니다. 명세에 Clarifications 절과 세션 기록이 있는지 먼저 보고, 없거나 모호한 곳이 남아 있으면 멈추고 사용자에게 `/clarify`를 먼저 실행하라고 안내하라는 지시입니다. 사용자가 명시적으로 건너뛰겠다고 하지 않는 한 계속하지 말고, 스스로 답을 지어내지도 말라고 적혀 있습니다.

그 다음 계획 템플릿의 실행 흐름을 따릅니다. 기술 맥락을 채우고, Constitution Check 절을 원칙 문서에 따라 채운 뒤 평가합니다. 이 절에는 리서치 전에 통과해야 하고 설계 뒤에 다시 확인한다는 문구가 붙어 있습니다. 위반이 있으면 Complexity Tracking 표에 무엇을 어겼는지, 왜 필요한지, 더 단순한 대안을 왜 버렸는지를 적어야 하고, 정당화할 수 없으면 접근을 단순화하라는 오류를 내라고 되어 있습니다. [\[spec-kit: templates 디렉터리\]](https://github.com/github/spec-kit/tree/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/templates)

리서치 단계는 `research.md`를, 설계 단계는 `data-model.md`, `contracts/`, `quickstart.md`를 남깁니다. 설계 단계에서는 `CLAUDE.md`나 `.github/copilot-instructions.md` 같은 에이전트별 지침 파일도 갱신합니다. 계획 명령은 작업 목록을 직접 만들지 않고 작업을 어떻게 만들지만 설명한 뒤 멈춥니다.

환급금 조회 기능이라면 원칙 III 때문에 Constitution Check에서 걸러져야 할 계획이 있습니다. 화면 쪽에 환급금 산출식을 새로 짜는 계획입니다. 이 경우 계획은 기존 산출 모듈을 호출하는 쪽으로 바뀌거나, Complexity Tracking에 그 이유가 남아야 합니다.

### `/tasks`는 번호와 병렬 표시로 순서를 고정한다

`/tasks`는 `plan.md`를 반드시 읽고, 있으면 데이터 모델과 계약, 리서치, quickstart 문서를 읽어 작업 목록을 만듭니다. 규칙은 기계적입니다. 계약 파일마다 계약 테스트 작업, 엔터티마다 모델 작업, 사용자 시나리오마다 통합 테스트 작업을 만들고, 서로 다른 파일을 건드리는 작업에만 병렬 표시 `[P]`를 붙이며, 같은 파일을 건드리는 작업은 순차로 둡니다. 순서는 준비, 테스트, 핵심 구현, 통합, 마무리 순입니다.

작업 템플릿은 테스트 단계에 강한 문구를 붙여 둡니다. 이 테스트들은 반드시 작성되어야 하고, 구현 전에 반드시 실패해야 한다는 것입니다. 작업마다 정확한 파일 경로를 적고, 병렬 작업끼리 같은 파일을 고치지 않는지 확인하는 검증 체크리스트도 끝에 붙어 있습니다. 명령 템플릿은 작업 목록이 추가 맥락 없이도 LLM이 완료할 수 있을 만큼 구체적이어야 한다고 적습니다.

환급금 조회 기능의 작업 목록은 대략 이렇게 나올 것입니다. 경로와 이름은 예시입니다.

```text
[예시] specs/003-surrender-value-inquiry/tasks.md 일부

## Phase 3.2: Tests First (TDD)
T004 [P] 계약 테스트 GET /contracts/{no}/surrender-estimate  tests/contract/SurrenderEstimateApiTest.java
T005 [P] 통합 테스트 상담원 권한 조회 시 이력 1건 기록          tests/integration/InquiryAuditTest.java
T006 [P] 통합 테스트 설계사 권한 조회 시 403                    tests/integration/InquiryAuthTest.java

## Phase 3.3: Core Implementation (테스트가 실패한 뒤에만)
T007     SurrenderEstimateService: 기존 산출 모듈 호출           src/.../SurrenderEstimateService.java
T008     InquiryAuditRepository: 조회 이력 저장                  src/.../InquiryAuditRepository.java
T009     SurrenderEstimateController                             src/.../SurrenderEstimateController.java
```

T005는 원칙 II에서, T006은 Clarifications의 권한 답에서, T007의 "기존 산출 모듈 호출"은 원칙 III에서 나왔습니다. 작업 하나하나가 앞 문서의 어느 줄에서 왔는지 따라갈 수 있다는 것이 이 단계의 쓸모입니다.

### 이 단계가 깨지는 방식

계획과 작업 단계의 관문은 모두 모델이 템플릿의 체크박스를 채우는 방식으로 동작합니다. 작업 템플릿의 검증 체크리스트 위에는 `main()`이 반환 전에 확인한다는 문구가 있지만, 실제로 그런 함수가 도는 것은 아닙니다. 프로그램처럼 쓰인 지시를 모델이 읽고 따르는 것입니다.

방법론 문서는 이런 점검 절을 아키텍처 원칙에 대한 컴파일 시점 검사에 비유합니다. [\[spec-kit: spec-driven.md\]](https://github.com/github/spec-kit/blob/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/spec-driven.md) 저는 이 비유를 조심해서 읽어야 한다고 봅니다. 컴파일러는 어기면 빌드를 멈추지만, 점검 절은 모델이 스스로 PASS라고 적으면 통과합니다.

테스트를 먼저 쓰고 실패를 확인하라는 지시도 같습니다. 모델이 테스트와 구현을 한 번에 쓰고 실패 단계를 건너뛰어도, 그것을 막는 장치는 저장소 안에 없습니다.

## 4. 관문에는 스크립트가 지키는 것과 프롬프트가 부탁하는 것이 있다

이 저장소를 볼 때 제가 가장 중요하게 보는 구분입니다. 관문이라고 불리는 것들이 모두 같은 강도로 지켜지지는 않습니다.

### 스크립트가 지키는 것

`scripts/` 아래의 셸 스크립트는 결정적으로 동작합니다. [\[spec-kit: scripts/bash 디렉터리\]](https://github.com/github/spec-kit/tree/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/scripts/bash)

`create-new-feature.sh`는 `specs/` 아래 기존 디렉터리의 번호 중 가장 큰 값에 1을 더해 세 자리 번호를 만들고, 기능 설명의 앞 단어 세 개를 붙여 브랜치 이름을 정합니다. 그 이름으로 Git 브랜치를 만들어 체크아웃하고, 같은 이름의 기능 디렉터리에 명세 템플릿을 복사합니다. `/specify` 명령 템플릿은 이 스크립트를 반드시 한 번만 실행하라고 적어 둡니다.

`check-prerequisites.sh`는 선행 산출물이 있는지 확인합니다. 기능 디렉터리가 없으면 `/specify`를 먼저 실행하라는 오류를, `plan.md`가 없으면 `/plan`을 먼저 실행하라는 오류를, 구현 단계에서 `tasks.md`가 없으면 `/tasks`를 먼저 실행하라는 오류를 내고 종료합니다.

공통 함수 파일에는 브랜치 이름 검사가 있습니다. 현재 브랜치가 세 자리 숫자와 하이픈으로 시작하지 않으면 기능 브랜치가 아니라는 오류를 냅니다. 기능 하나가 브랜치 하나, 디렉터리 하나에 대응한다는 규칙은 이 검사로 지켜집니다.

### 스크립트 관문에도 빈틈이 있다

스크립트가 강제하는 것도 생각보다 좁습니다.

- `/clarify`는 `--paths-only` 옵션으로 스크립트를 부릅니다. 이 옵션은 경로만 출력하고 선행 조건 검증은 하지 않습니다.
- Git 저장소가 아닌 곳에서는 브랜치 이름 검사가 경고만 남기고 통과합니다.
- 환경 변수 `SPECIFY_FEATURE`가 설정되어 있으면 현재 브랜치 대신 그 값을 기능 이름으로 씁니다.
- 무엇보다 스크립트가 확인하는 것은 파일이 있느냐이지, 내용이 맞느냐가 아닙니다. 빈 `plan.md`도 통과합니다.

### 프롬프트가 부탁하는 것

나머지 관문은 템플릿에 적힌 지시입니다. 앞 절에서 본 Constitution Check, 테스트 우선, `/plan`의 Clarifications 확인이 여기에 속합니다.

`/analyze`도 같습니다. 파일을 수정하지 않는 읽기 전용 점검으로 정의되어 있고, 원칙 문서와 충돌하는 항목은 자동으로 CRITICAL로 분류하며, CRITICAL이 있으면 `/implement` 전에 해결하라고 권고합니다. 수정안은 사용자가 명시적으로 승인해야 적용됩니다. [\[spec-kit: analyze.md\]](https://github.com/github/spec-kit/blob/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/templates/commands/analyze.md) 그러나 `/implement` 명령 템플릿은 작업 목록과 계획 파일의 존재만 스크립트로 확인할 뿐, 분석 보고의 결과를 읽지 않습니다.

정리하면 다음과 같습니다.

| 관문 | 강제 방식 | 어겼을 때 |
| --- | --- | --- |
| 기능별 번호, 브랜치, 디렉터리 | 셸 스크립트 | 구조 자체가 만들어지지 않음 |
| 기능 브랜치 위에서 작업 중인가 | 셸 스크립트 (Git 저장소일 때만) | 오류와 함께 중단 |
| 선행 산출물 존재 여부 | 셸 스크립트 | 오류 메시지와 함께 중단 |
| 명세의 모호함 해소 | `/plan` 템플릿의 지시 | 모델이 멈추고 안내하는지에 달림 |
| 원칙 준수 확인 | 계획 템플릿의 점검 절 | 모델이 스스로 PASS를 적는지에 달림 |
| 테스트 우선, 실패 확인 | 작업 템플릿의 지시 | 모델이 순서를 지키는지에 달림 |
| 문서 간 일관성 | `/analyze` 보고 | 사람이 보고를 읽고 판단 |

### 반드시 지켜야 할 관문은 바깥의 결정적 장치로 옮긴다

이것을 약점으로만 볼 필요는 없다고 봅니다. 템플릿은 모델이 올바른 순서로 일할 확률을 높여 주고, 그것만으로도 결과는 꽤 달라집니다. 다만 "관문이 있으니 안전하다"고 읽으면 안 됩니다. 정말 막아야 하는 것은 저장소 바깥의 결정적 장치에 두는 편이 안전합니다.

GitHub의 브랜치 보호 규칙은 그 자리로 쓰기 좋습니다. 보호된 브랜치에 병합하기 전에 정해진 수의 승인 리뷰를 요구할 수 있고, 코드 소유자가 지정된 경로를 건드리는 PR은 그 소유자의 승인을 받게 할 수 있으며, 지정한 상태 검사가 모두 통과해야 병합되게 할 수 있습니다. [\[GitHub Docs: About protected branches, 2025-09-15 스냅샷\]](http://web.archive.org/web/20250915230032/https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

프롬프트에만 있던 관문 두 개를 상태 검사로 옮기는 워크플로를 써 보면 이렇습니다.

```yaml
# 예시: .github/workflows/spec-gates.yml
name: spec-gates
on: pull_request
jobs:
  gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: 명세에 미해결 표시가 남아 있으면 실패
        run: |
          if grep -rn "NEEDS CLARIFICATION" specs/; then
            echo "미해결 질문이 남은 명세는 병합할 수 없습니다"; exit 1
          fi
      - name: 바뀐 기능 디렉터리에 tasks.md가 있고 미완료 작업이 없어야 함
        run: |
          for d in $(git diff --name-only origin/main... | grep '^specs/' | cut -d/ -f2 | sort -u); do
            test -f "specs/$d/tasks.md" || { echo "$d: tasks.md 없음"; exit 1; }
            if grep -n "^- \[ \]" "specs/$d/tasks.md"; then echo "$d: 미완료 작업"; exit 1; fi
          done
      - name: 단위 및 통합 테스트
        run: ./gradlew test
```

이 검사를 필수 상태 검사로 지정하고, `specs/`와 `memory/constitution.md`에 코드 소유자를 지정하면, 명세와 원칙의 변경은 사람의 승인 없이 병합되지 않습니다. 원칙 준수 여부를 기계가 판단할 수는 없지만, 원칙 문서가 바뀔 때 누가 승인하는지는 기계가 강제할 수 있습니다.

비교 삼아 보면, 7월에 공개된 에이전트형 IDE Kiro도 명세 기반 흐름을 내세우며 파일 저장이나 생성 같은 이벤트에 반응하는 hooks를 함께 소개했습니다. 다만 소개 글의 설명에 따르면 hooks는 이벤트가 생기면 에이전트가 백그라운드에서 작업을 실행하게 하는 장치입니다. [\[Kiro: Introducing Kiro\]](https://kiro.dev/blog/introducing-kiro/) 자동으로 실행된다는 것과 결정적으로 판정한다는 것은 다른 문제이므로, 어떤 도구를 쓰든 판정이 모델에게 있는지 코드에게 있는지를 따로 확인해야 한다고 봅니다.

## 5. 사람의 검토는 코드에서 문서로 당겨진다

### `/analyze`가 하는 일

`/analyze`는 `/tasks` 다음, `/implement` 전에 돌리는 점검입니다. 명령 템플릿이 정한 순서는 다음과 같습니다. [\[spec-kit: analyze.md\]](https://github.com/github/spec-kit/blob/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/templates/commands/analyze.md)

1. 스크립트로 세 문서의 경로를 얻고, 하나라도 없으면 중단합니다.
2. 명세에서 요구사항과 사용자 시나리오를, 계획에서 기술 선택과 제약을, 작업 목록에서 작업 번호와 파일 경로를 뽑아 목록을 만듭니다.
3. 각 작업을 요구사항에 대응시키고, 원칙 문서에서 MUST와 SHOULD 문장을 뽑습니다.
4. 중복, 모호함, 명세 부족, 원칙 위반, 커버리지 빈틈, 용어 불일치의 여섯 가지를 찾습니다.
5. 심각도를 CRITICAL, HIGH, MEDIUM, LOW로 매기고, 요구사항별로 대응하는 작업이 있는지 표로 보여 줍니다.

같은 입력이면 같은 번호와 같은 개수가 나오도록 하라는 규칙, 본문 표는 50건까지만 쓰고 나머지는 요약하라는 규칙도 있습니다. 보고 끝에서는 상위 문제에 대한 수정안을 제안할지 묻되, 자동으로 적용하지는 말라고 적혀 있습니다.

환급금 조회 기능의 보고서는 이런 모양일 수 있습니다. 내용은 예시입니다.

```text
[예시] /analyze 보고 일부

| ID | Category     | Severity | Location        | Summary                                  |
|----|--------------|----------|-----------------|------------------------------------------|
| C1 | Constitution | CRITICAL | plan.md:L48     | 화면 계층에 환급금 산출식 재구현 (원칙 III 위반) |
| G1 | Coverage     | HIGH     | spec.md FR-002  | 산출 기준일 표시에 대응하는 작업 없음        |
| T1 | Terminology  | MEDIUM   | spec / tasks    | "해지환급금"과 "surrender value" 혼용        |

Coverage: 요구사항 5건 중 4건에 작업 있음 (80%)
Next: CRITICAL 1건, /implement 전에 plan.md 수정 권장
```

이 보고에서 C1은 앞 절에서 Constitution Check가 걸러 냈어야 할 문제입니다. 계획 단계의 모델이 PASS를 적었더라도, 다른 시점에 다른 관점으로 같은 문서를 다시 읽으면 잡힐 수 있습니다. 저는 `/analyze`의 가치를 이 두 번째 시선에서 찾습니다. 다만 두 번째 시선도 같은 계열의 모델이므로, 놓친 것을 둘 다 놓칠 가능성은 남습니다.

### 리뷰어가 받는 것이 달라진다

GitHub 블로그는 사람의 역할을 방향 제시에서 끝내지 않고 검증이라고 못박습니다. 각 단계에 생성물을 비판하고 빈틈을 찾을 체크포인트가 있고, 구현 단계에서는 천 줄짜리 코드 덩어리 대신 특정 문제를 푸는 작은 변경을 검토하게 된다는 설명입니다. [\[GitHub Blog: Spec-driven development with AI\]](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)

환급금 조회 사례에서 리뷰어가 보는 순서는 이렇게 바뀝니다.

- `spec.md`: 조회 권한, 이력, 기준일이 확정된 문장으로 적혀 있는가. 답한 사람이 결정권자였는가.
- `plan.md`: 기존 산출 모듈을 재사용하는가. Complexity Tracking에 남은 예외가 있는가.
- `tasks.md`: 원칙 II에서 나온 이력 기록 테스트가 있는가. 각 작업이 어떤 요구사항에 대응하는가.
- `/analyze` 보고: CRITICAL과 HIGH가 처리되었는가.
- 코드: 작업 번호 단위로 나뉜 작은 변경이 테스트와 함께 들어왔는가.

틀린 가정을 코드 30개 파일에서 찾는 대신 명세 한 장에서 찾게 됩니다. 고치는 비용도 그 시점이 가장 쌉니다.

### 어디까지 적용할지 정하는 기준

모든 변경에 일곱 단계를 다 돌릴 필요는 없습니다. 제가 쓰는 기준을 표로 적으면 이렇습니다. 판단 기준은 제 의견입니다.

| 변경의 성격 | 권하는 수준 | 이유 |
| --- | --- | --- |
| 오타, 문구, 설정값 하나 | 계획 없이 바로 수정 | 명세에 적을 것이 없음 |
| 버그 수정, 원인이 분명함 | 계획 확인 후 구현 | 재현 테스트 하나면 충분 |
| 기존 시스템에 기능 추가 | `/specify`, `/clarify`, `/plan`, `/tasks` | 기존 구조와의 접점을 문서로 고정할 가치가 큼 |
| 개인정보, 금액, 권한이 걸린 기능 | 전 단계, `/analyze` 포함, CI 관문 추가 | 틀린 가정의 비용이 가장 큼 |
| 탐색용 프로토타입 | `/clarify` 생략을 명시 | 버릴 코드에 명세 비용을 쓰지 않음 |

GitHub 블로그는 이 방식이 잘 맞는 세 곳 가운데 기존 시스템에 기능을 추가하는 경우를 가장 강력한 자리로 꼽고, 그 경우에는 고급 컨텍스트 엔지니어링이 더 필요할 수 있다고 덧붙였습니다. 표의 세 번째 줄과 같은 판단입니다.

### 대가: 문서가 늘고, 도구는 아직 움직이고 있다

대가도 분명합니다. 읽어야 할 Markdown이 늘어납니다. 작은 수정에 이 흐름을 전부 적용하면 문서 검토 시간이 구현 시간보다 길어질 수 있습니다.

저장소의 성숙도도 고려해야 합니다. 첫 릴리스 v0.0.1이 2025년 8월 22일에 나왔고, 9월 21일에 v0.0.49가 나왔습니다. 한 달 사이 마흔 번 넘게 릴리스가 나갔다는 뜻입니다. README 스스로도 이 프로젝트의 목표를 실험적 목표라는 제목 아래 적어 둡니다. [\[github/spec-kit Releases\]](https://github.com/github/spec-kit/releases)

:::caution
버전이 0.0.x이고 명령 이름이 몇 주 사이에 바뀌는 단계입니다. 팀 표준 절차로 고정하기보다, 템플릿과 관문의 구조를 참고 자료로 읽고 필요한 부분만 가져오는 쪽을 권합니다.
:::

### 산출물 체계에 익숙한 조직이 얻을 것

보험이나 금융의 IT 조직은 요구사항 정의서, 설계서, 테스트 결과서를 단계별로 남기고 승인받는 데 익숙합니다. Spec Kit의 흐름은 그 체계와 모양이 닮았습니다.

| 익숙한 산출물 | Spec Kit의 자리 | 다른 점 |
| --- | --- | --- |
| 요구사항 정의서 | `spec.md` | 미확정 항목이 표시로 남고, 질의응답이 문서 안에 기록됨 |
| 사내 개발 표준, 보안 지침 | `constitution.md` | 계획과 분석 단계가 이 파일을 기준으로 삼음 |
| 설계서 | `plan.md`, `data-model.md`, `contracts/` | 원칙 위반의 사유가 표로 남음 |
| 작업 계획서 | `tasks.md` | 작업마다 파일 경로와 병렬 여부가 정해짐 |
| 테스트 결과서 | 테스트 코드와 CI 결과 | 문서가 아니라 실행 결과로 남김 |

제가 가장 다르다고 보는 점은 문서가 구현의 입력이라는 것입니다. 설계서와 코드가 따로 노는 문제는 문서가 보관용일 때 생깁니다. 에이전트가 `plan.md`를 읽고 구현한다면, 문서를 고치지 않고는 구현을 바꾸기 어렵습니다.

감사 관점에서는 기능마다 브랜치와 `specs/` 디렉터리가 남는다는 점이 쓸모 있습니다. 어떤 요구사항에서 어떤 계획이 나왔고, 누가 어떤 질문에 어떻게 답했고, 어떤 작업으로 쪼개졌는지가 Git 이력으로 남기 때문입니다.

다만 승인선을 대신해 주지는 않습니다. `/analyze`가 CRITICAL을 보고해도 `/implement`를 막는 장치는 프롬프트의 권고뿐입니다. 승인이 필요한 조직이라면 앞 절의 브랜치 보호와 코드 소유자 규칙처럼 이미 가진 통제에 연결해야 합니다.

## 6. 오늘 바로 적용할 수 있는 순서

1. 최근에 리뷰가 힘들었던 에이전트 PR 하나를 골라, 리뷰어가 추측해야 했던 요구사항을 적어 봅니다. 그 목록이 명세에 있어야 했던 내용이고, 대개 권한, 보존 기간, 기준일, 오류 처리에 몰려 있을 것입니다.
2. 도구를 도입하기 전에 `spec-template.md`의 AI 생성 지침과 체크리스트, 그리고 `/clarify`의 "영향도 순 다섯 개, 한 번에 하나" 규칙만 가져와 기존 프롬프트에 붙여 봅니다.
3. 사내 표준과 개인정보 원칙 중 계획 단계에서 꼭 대조해야 할 서너 개를 골라 constitution 형식으로 적고, 고칠 때 누가 승인하는지 정합니다.
4. 위험이 낮은 신규 기능 하나에 `/specify`부터 `/analyze`까지 돌려 보고, 문서 검토에 든 시간과 줄어든 재작업을 비교합니다.
5. 관문 표를 직접 만들어 스크립트, 프롬프트, 사람 중 누가 지키는지 구분하고, 프롬프트에만 있는 관문 중 반드시 지켜져야 하는 것은 CI의 필수 상태 검사와 코드 소유자 규칙으로 옮깁니다.

## 마치며

Spec Kit을 명세 생성기로 보면 문서가 늘어나는 도구로 보입니다. 관문의 배치로 보면, 에이전트의 추측이 코드에 묻히기 전에 질문의 형태로 드러나게 하는 장치로 보입니다. 어느 관문이 실제로 강제되고 어느 관문이 부탁에 그치는지를 구분하는 일은 사용자의 몫으로 남아 있습니다. 도구를 쓰든 쓰지 않든, 그 구분은 에이전트 작업을 설계할 때 그대로 가져갈 만합니다.

## 참고 자료

- [Spec-driven development with AI: Get started with a new open source toolkit](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)
- [github/spec-kit README (2025-09-23 커밋)](https://github.com/github/spec-kit/blob/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/README.md)
- [spec-kit: spec-driven.md (2025-09-23 커밋)](https://github.com/github/spec-kit/blob/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/spec-driven.md)
- [spec-kit: templates/spec-template.md](https://github.com/github/spec-kit/blob/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/templates/spec-template.md)
- [spec-kit: templates/commands/clarify.md](https://github.com/github/spec-kit/blob/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/templates/commands/clarify.md)
- [spec-kit: templates/commands/analyze.md](https://github.com/github/spec-kit/blob/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/templates/commands/analyze.md)
- [spec-kit: templates 디렉터리 (plan, tasks, constitution 템플릿)](https://github.com/github/spec-kit/tree/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/templates)
- [spec-kit: scripts/bash 디렉터리](https://github.com/github/spec-kit/tree/f1063321c6221db4d3d4cd178bc9c2fbe9272b8f/scripts/bash)
- [github/spec-kit Releases](https://github.com/github/spec-kit/releases)
- [GitHub Docs: About protected branches (2025-09-15 스냅샷)](http://web.archive.org/web/20250915230032/https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Claude Code: Best practices for agentic coding (2025-06-02 스냅샷)](https://web.archive.org/web/20250602202220/https://www.anthropic.com/engineering/claude-code-best-practices)
- [Introducing Kiro](https://kiro.dev/blog/introducing-kiro/)
