---
title: "Agent Skills와 점진적 공개: 절차 지식은 프롬프트가 아니라 폴더에 둔다"
date: 2025-10-28
description: "절차 지식을 필요할 때만 읽히는 폴더로 포장하는 Agent Skills의 적재 구조, description 라우팅, 스크립트 배치, 배포와 검토 방법을 정리합니다."
category: 에이전트 엔지니어링
tags: [Agent Skills, 컨텍스트 엔지니어링, 하네스, MCP, Claude Code]
draft: false
---

:::note
- Agent Skills는 지침, 스크립트, 참고 자료를 폴더 하나로 묶고, 에이전트가 관련 있을 때만 읽게 하는 형식입니다.
- 핵심은 점진적 공개입니다. 항상 실리는 것은 이름과 설명뿐이고, 본문과 부속 파일은 필요해질 때 컨텍스트에 들어옵니다. 그래서 설명 한 줄이 라우팅 규칙이 됩니다.
- system prompt는 항상 필요한 규칙, Skill은 가끔 필요한 절차, MCP는 외부 시스템 연결을 담는다고 나눠 보면 설계가 쉬워집니다.
- Skill에는 실행되는 코드가 들어갑니다. 문서가 아니라 배포물로 보고, 출처 관리와 평가와 형상 관리를 붙여야 합니다.
:::

에이전트가 우리 팀 방식대로 일하게 만들고 싶을 때 가장 먼저 하는 일은 system prompt에 규칙을 적는 것입니다. 부족하면 더 적습니다. "적어 두면 따른다"는 믿음입니다.

처음에는 잘 동작합니다. 문제는 지식이 늘어날 때 생깁니다. **모든 지식을 매 턴 컨텍스트에 실어 두는 구조에서는, 지식이 늘수록 지금 필요한 지식이 덜 보이게 됩니다.**

Anthropic은 2025년 10월 16일 Agent Skills를 발표하면서 이 문제에 다른 답을 냈습니다. Skill은 지침, 스크립트, 리소스를 담은 폴더이고, Claude는 작업과 관련이 있을 때만 그 폴더를 읽습니다. 발표문은 Skill의 성질로 여러 개를 함께 쓸 수 있다는 것, 같은 형식이 Claude 앱과 Claude Code와 API에서 쓰인다는 것, 필요한 것만 필요할 때 읽는다는 것을 들었습니다. [\[Anthropic: Introducing Agent Skills\]](https://www.anthropic.com/news/skills)

같은 날 나온 엔지니어링 글은 이 설계의 중심 원칙에 이름을 붙였습니다. 점진적 공개(progressive disclosure)입니다. [\[Anthropic: Equipping agents for the real world with Agent Skills\]](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

이 글에서는 Skills를 제품 기능보다 설계 패턴으로 읽어 보려 합니다. 지식을 언제 싣고 언제 내려놓을지를 하네스가 어떻게 정하는가, 그리고 그 지식에 실행 코드가 섞일 때 무엇을 통제해야 하는가의 문제입니다. 컨텍스트 예산 일반론은 다른 글에서 다뤘으므로 여기서는 Skill이라는 포장 단위에 집중합니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 보험사 계정계 시스템을 맡은 팀의 코딩 에이전트 system prompt가 1년 동안 자랐다고 해봅시다. 배포 절차, Oracle SQL 변경 검토 기준, 장애 보고서 양식, 사내 프레임워크 사용법, 엑셀 산출물 서식 규칙이 한 파일에 들어 있습니다.

사용자가 오타 하나를 고쳐 달라고 합니다. 에이전트는 그 요청과 함께 장애 보고서 양식과 엑셀 서식 규칙까지 전부 읽습니다.

어느 날은 배포 전 DDL 스크립트 리뷰를 맡겼는데 검토 기준의 절반을 건너뜁니다. 대용량 테이블에 기본값이 있는 NOT NULL 컬럼을 추가하는 구문, 롤백 스크립트가 없는 변경이 그대로 통과합니다. 원인을 찾으려 해도 수천 줄 가운데 어느 문단이 무시됐는지, 어느 문단끼리 충돌했는지 알기 어렵습니다. 문단 하나를 고치는 것도 조심스럽습니다. 다른 작업에 어떤 영향을 줄지 모르기 때문입니다.

무엇이 잘못됐는지를 설계의 말로 옮기면 세 가지입니다.

- 적재 경계가 없습니다. 지금 필요한 지식과 아닌 지식이 구분 없이 실립니다.
- 소유 단위가 없습니다. 지식이 주제별로 나뉘어 있지 않아 누가 무엇을 고칠지 정할 수 없습니다.
- 결정적이어야 할 절차까지 문장으로 적혀 있어, 실행 결과가 매번 모델의 해석에 달립니다.

이 글에서는 이 SQL 변경 검토 지식을 하나의 Skill로 옮기는 과정을 끝까지 따라가 보겠습니다.

## 1. 지식을 세 층으로 나누고, 항상 싣는 것은 맨 위층뿐이다

### 폴더 하나와 frontmatter 두 줄

Skill은 `SKILL.md` 파일이 들어 있는 디렉터리입니다. 이 파일은 `name`과 `description`을 담은 YAML frontmatter로 시작해야 합니다. 에이전트는 시작할 때 설치된 모든 Skill의 이름과 설명만 system prompt에 미리 싣습니다. [\[Anthropic: Equipping agents for the real world with Agent Skills\]](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

필드 규칙은 짧습니다. 문서에 따르면 `name`은 64자 이내의 소문자, 숫자, 하이픈이어야 하고, "anthropic"이나 "claude" 같은 예약어를 쓸 수 없습니다. `description`은 비어 있으면 안 되고 1,024자 이내이며, 무엇을 하는지와 언제 써야 하는지를 함께 담아야 합니다. [\[Claude Docs: Agent Skills overview, 2025-10-26 스냅샷\]](https://web.archive.org/web/20251026050143/https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)

`anthropics/skills` 저장소에 함께 공개된 형식 문서는 몇 가지를 더 적습니다. `name`은 폴더 이름과 같아야 하고, 선택 필드로 `license`, `allowed-tools`, `metadata`가 있으며, Markdown 본문에는 제약이 없다는 것입니다. 문서의 버전 이력에는 2025년 10월 16일 공개가 1.0으로 적혀 있습니다. [\[anthropics/skills: agent_skills_spec.md, 2025-10-18 커밋\]](https://github.com/anthropics/skills/blob/c74d647e56e6daa12029b6acb11a821348ad044b/agent_skills_spec.md)

### 세 층의 적재 시점과 비용

필수인 것은 frontmatter뿐이고, 그 아래는 필요해질 때 열립니다. Claude 문서는 세 층의 적재 시점과 비용을 이렇게 정리합니다. [\[Claude Docs: Agent Skills overview, 2025-10-26 스냅샷\]](https://web.archive.org/web/20251026050143/https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)

| 층 | 언제 실리는가 | 토큰 비용 | 내용 |
| --- | --- | --- | --- |
| 1. 메타데이터 | 항상, 시작할 때 | Skill 하나당 약 100 토큰 | frontmatter의 `name`, `description` |
| 2. 지침 | Skill이 발동될 때 | 5천 토큰 미만 | `SKILL.md` 본문 |
| 3. 리소스와 코드 | 참조될 때 | 사실상 제한 없음 | 추가 문서, 스크립트, 템플릿 |

SQL 변경 검토 지식을 이 구조로 옮기면 이런 모양이 됩니다.

```text
sql-change-review/            (예시)
├── SKILL.md                  # 2층: 검토 절차 본문
├── oracle-checklist.md       # 3층: 세부 점검 항목, 필요할 때만 읽음
├── rollback-guide.md         # 3층: 롤백 스크립트 작성 기준
└── scripts/
    ├── lint_ddl.py           # 3층: 실행만 하고 읽지 않아도 되는 코드
    └── check_rollback.py     # 3층: 변경과 롤백의 짝 검사
```

엔지니어링 글의 비유로는 목차, 장, 부록 순으로 펼쳐 보는 매뉴얼입니다. 파일시스템과 코드 실행 도구가 있는 에이전트는 Skill 전체를 컨텍스트에 올릴 필요가 없으므로, Skill 하나에 담을 수 있는 분량은 사실상 제한이 없다고 설명합니다.

### 한 번의 요청에서 실제로 일어나는 일

문서는 Skill이 가상 머신의 디렉터리로 존재하고, Claude가 bash 명령으로 그 파일을 읽는다고 설명합니다. 요청이 설명과 맞으면 `SKILL.md`를 읽고, 본문이 다른 파일을 가리키면 그 파일도 추가로 읽으며, 스크립트는 내용을 읽지 않고 실행해 결과만 받습니다. 쓰지 않은 파일은 컨텍스트를 전혀 차지하지 않습니다.

배포 전 DDL 리뷰 요청 하나를 따라가 보면 다음과 같습니다.

```text
세션 시작
  system prompt += "sql-change-review: Oracle DDL과 DML 변경 스크립트를 ..." (약 100 토큰)
  system prompt += 다른 Skill 4개의 이름과 설명

사용자: "V2025_10_28__add_claim_status.sql 배포 전에 검토해 줘"
  │
  ├─ 모델: 설명과 요청이 맞음 → bash: cat sql-change-review/SKILL.md     (2층 적재)
  ├─ 본문 지시: "먼저 scripts/lint_ddl.py 실행"
  │     → bash: python scripts/lint_ddl.py V2025_10_28__add_claim_status.sql
  │     → 결과 JSON만 컨텍스트에 들어옴                                  (3층, 코드는 읽지 않음)
  ├─ lint 결과에 "대용량 테이블 컬럼 추가" 경고
  │     → bash: cat sql-change-review/oracle-checklist.md               (3층 문서 적재)
  ├─ bash: python scripts/check_rollback.py ...                         (3층)
  └─ 검토 의견 작성

오타 수정 요청이었다면: 2층과 3층은 한 줄도 실리지 않음
```

앞의 사례에서 오타 수정 요청에 장애 보고서 양식까지 실렸던 문제는 여기서 사라집니다. 오타 수정 요청에서 에이전트가 읽는 것은 Skill 다섯 개의 이름과 설명뿐입니다.

### 이 구조의 비용과 한계

첫째, 1층도 공짜는 아닙니다. Simon Willison은 발표 당일 글에서 Skill 하나가 수십 토큰 정도만 차지해 효율적이라고 평가했습니다. [\[Simon Willison: Claude Skills are awesome, maybe a bigger deal than MCP\]](https://simonwillison.net/2025/Oct/16/claude-skills/) 문서의 기준으로 잡아도 Skill 100개면 1만 토큰 안팎이 항상 실립니다. 개수가 늘수록 설명끼리 겹칠 가능성도 커지므로, 2절의 라우팅 문제가 함께 커집니다.

둘째, 실행 환경의 제약이 있습니다. 10월 하순 문서의 제약 절에 따르면 Skill은 코드 실행 컨테이너에서 돌고, 네트워크에 접근할 수 없으며, 실행 중에 패키지를 설치할 수 없고 미리 설치된 패키지만 쓸 수 있습니다. API에서 Skill을 쓰려면 코드 실행 도구 베타가 필요하다는 점은 발표문에도 적혀 있습니다. [\[Anthropic: Introducing Agent Skills\]](https://www.anthropic.com/news/skills) 사내 DB에 붙어야 하는 검증 스크립트는 이 환경에서 그대로 돌지 않습니다.

셋째, 파일시스템과 코드 실행 도구가 없는 에이전트에서는 3층이 성립하지 않습니다. 점진적 공개는 모델이 파일을 골라 읽을 수 있다는 전제 위에 있습니다.

넷째, 거의 매번 필요한 지식을 Skill로 빼면 오히려 손해입니다. 요청마다 모델이 발동 여부를 판단하고, 파일을 읽는 도구 호출을 한 번 더 하고, 그 결과가 컨텍스트에 들어옵니다. 매 턴 쓰이는 규칙이라면 처음부터 system prompt에 두는 편이 호출도 줄고 누락 위험도 없습니다. 점진적 공개는 가끔 쓰이는 지식을 위한 구조입니다.

## 2. description은 문서가 아니라 라우팅 규칙이다

### 고르는 것은 모델이다

이 구조에서 가장 약한 고리는 1층입니다. 에이전트가 Skill을 쓸지 말지를 판단하는 근거가 이름과 설명뿐이기 때문입니다.

Claude Code 문서는 Skill이 모델이 호출하는 방식이라고 설명합니다. 사용자가 직접 `/명령`을 입력하는 슬래시 명령과 달리, Claude가 요청과 Skill의 설명을 보고 스스로 사용 여부를 정합니다. [\[Claude Code Docs: Agent Skills, 2025-10-21 스냅샷\]](https://web.archive.org/web/20251021015044/https://docs.claude.com/en/docs/claude-code/skills)

그래서 설명이 모호하면 Skill은 있어도 발동하지 않습니다. 같은 문서의 문제 해결 절은 Claude가 Skill을 쓰지 않을 때 첫 번째 점검 항목으로 설명을 구체적으로 쓰라는 것을, 비슷한 Skill끼리 혼동될 때는 설명마다 서로 구별되는 발동 단어를 쓰라는 것을 듭니다.

### 설명 칸을 쓰는 규칙

작성 가이드가 설명 칸에 요구하는 것은 두 가지입니다. 무엇을 하는지와 언제 쓰는지를 함께 적을 것, 그리고 3인칭으로 쓸 것입니다. 설명은 system prompt에 주입되므로 시점이 섞이면 탐색에 문제가 생길 수 있다는 이유입니다. [\[Claude Docs: Skill authoring best practices, 2025-10-22 스냅샷\]](https://web.archive.org/web/20251022170425/https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices)

```yaml
# SKILL.md frontmatter (예시)
---
name: sql-change-review
description: Oracle DDL과 DML 변경 스크립트를 배포 기준에 맞춰 검토한다. 사용자가 변경 스크립트 리뷰, 배포 전 SQL 점검, 마이그레이션 파일 검토, 롤백 스크립트 확인을 요청할 때 사용한다. 조회용 SELECT 튜닝에는 사용하지 않는다.
---
```

저는 설명 칸을 문서의 요약이 아니라 라우팅 테이블의 한 줄로 보는 편이 맞다고 생각합니다. 사용자가 실제로 쓰는 표현이 들어 있어야 하고, 다른 Skill의 설명과 겹치면 안 됩니다. 마지막 문장처럼 쓰지 않을 경우를 적어 두는 것도 겹침을 줄이는 방법입니다. 같은 팀에 SQL 튜닝 Skill이 따로 있다면 두 설명의 경계가 여기서 갈립니다.

### 설명은 시험해서 고친다

라우팅 규칙이라면 시험할 수 있어야 합니다. 저는 Skill마다 발동해야 하는 요청과 발동하면 안 되는 요청을 몇 개씩 적어 두고, 설명을 고칠 때마다 다시 돌려 보는 편이 안전하다고 봅니다.

| 요청 | 기대 | 확인할 점 |
| --- | --- | --- |
| "이 마이그레이션 파일 배포 전에 봐 줘" | 발동 | "마이그레이션"이 설명에 있는가 |
| "롤백 스크립트 빠진 거 없는지 확인해 줘" | 발동 | 롤백만 언급해도 잡히는가 |
| "CLAIM 테이블에 컬럼 추가하는 DDL 짜 줘" | 판단 필요 | 작성 요청에도 검토 Skill을 쓸 것인가 |
| "이 SELECT가 느린데 튜닝해 줘" | 발동 안 함 | 튜닝 Skill과 경계가 지켜지는가 |
| "장애 보고서 써 줘" | 발동 안 함 | 무관한 요청에 끼어들지 않는가 |

세 번째 줄처럼 기대가 애매한 요청이 나오면, 그것은 설명보다 Skill의 범위를 먼저 정해야 한다는 신호입니다.

### 본문은 짧게, 참조는 한 단계로

같은 가이드의 점검표에는 본문 쪽 기준도 있습니다. `SKILL.md` 본문은 500줄 미만으로 두고, 세부 내용은 별도 파일로 빼고, 파일 참조는 `SKILL.md`에서 한 단계 깊이로 유지하라는 것입니다. 100줄이 넘는 참고 파일에는 맨 위에 목차를 두라고 합니다. 부분만 읽고 넘어가더라도 전체 범위를 볼 수 있게 하려는 것입니다. [\[Claude Docs: Skill authoring best practices, 2025-10-22 스냅샷\]](https://web.archive.org/web/20251022170425/https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices)

가이드는 기본 가정으로 Claude가 이미 충분히 똑똑하다는 점을 들고, 모델이 이미 아는 설명은 빼라고 권합니다. 본문이 일단 실리면 그 토큰은 대화 이력을 비롯한 다른 컨텍스트와 경쟁하기 때문입니다. SQL 변경 검토 Skill이라면 NOT NULL 제약이 무엇인지 설명할 필요는 없고, 우리 조직에서 어떤 테이블이 대용량으로 분류되는지가 필요합니다.

### 라우팅이 깨지는 방식

실패는 세 가지 모양으로 옵니다. 발동해야 할 때 발동하지 않는 것, 발동하지 말아야 할 때 발동하는 것, 비슷한 Skill 중 엉뚱한 것이 발동하는 것입니다.

첫 번째가 가장 조용하고 위험합니다. 앞의 사례에서 검토 기준이 건너뛰어진 것과 같은 결과가 나오는데, 이번에는 기준이 있었다는 사실조차 대화에 남지 않습니다. 그래서 정말 빠지면 안 되는 검토라면 Skill의 자동 발동에만 기대지 않는 편이 낫다고 봅니다. 배포 파이프라인이 같은 스크립트를 직접 돌리게 하거나, 사용자가 명시적으로 부르는 경로를 함께 두는 식입니다.

## 3. 결정적이어야 하는 일은 문장이 아니라 스크립트에 넣는다

### 효율과 결정성

Skill이 프롬프트 조각 모음과 다른 지점은 코드를 담을 수 있다는 점입니다.

엔지니어링 글은 이유를 두 가지로 듭니다. 효율과 결정성입니다. 토큰 생성으로 목록을 정렬하는 것은 정렬 알고리즘을 돌리는 것보다 훨씬 비싸고, 많은 응용은 코드만 줄 수 있는 결정적 신뢰성을 요구한다는 것입니다. 예로 든 PDF Skill에는 폼 필드를 추출하는 Python 스크립트가 들어 있고, Claude는 스크립트도 PDF도 컨텍스트에 올리지 않은 채 실행할 수 있습니다. [\[Anthropic: Equipping agents for the real world with Agent Skills\]](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

### 자유도를 일의 위험에 맞춘다

작성 가이드는 이것을 자유도의 문제로 다룹니다. 여러 접근이 모두 유효한 일에는 글로 된 지침을, 선호하는 패턴이 있는 일에는 매개변수가 있는 스크립트나 의사 코드를, 깨지기 쉬운 일에는 정해진 스크립트를 쓰라는 구분입니다. 가이드의 비유로는 양쪽이 절벽인 좁은 다리에서는 정확한 지시와 난간이 필요하고, 위험이 없는 들판에서는 방향만 주면 됩니다. 앞의 예로는 정해진 순서로 돌아야 하는 DB 마이그레이션을, 뒤의 예로는 맥락에 따라 최선이 달라지는 코드 리뷰를 듭니다. [\[Claude Docs: Skill authoring best practices, 2025-10-22 스냅샷\]](https://web.archive.org/web/20251022170425/https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices)

SQL 변경 검토 Skill에 대입하면 이렇습니다.

| 일 | 자유도 | 담는 방식 | 이유 |
| --- | --- | --- | --- |
| 리뷰 의견의 우선순위와 어조 | 높음 | 본문 지침 | 맥락에 따라 판단이 달라짐 |
| 검토 의견서 양식 | 중간 | 템플릿 파일 | 형식은 고정, 내용은 판단 |
| 금지 구문, 대용량 테이블 변경 탐지 | 낮음 | `lint_ddl.py` | 놓치면 운영 장애 |
| 변경마다 롤백이 짝지어 있는지 | 낮음 | `check_rollback.py` | 사람도 자주 놓치는 기계적 대조 |

세 번째와 네 번째를 문장으로 적어 두고 모델이 매번 올바르게 수행하기를 기대하는 것이 앞의 사례에서 검토 기준이 건너뛰어진 원인이라고 봅니다.

### 스크립트의 출력은 다음 판단의 입력이다

스크립트는 결과를 모델이 읽기 좋은 형태로 돌려줘야 합니다. 사람용 로그를 길게 찍으면 그 로그가 다시 컨텍스트를 채웁니다. 저는 판정, 위치, 근거 규칙만 담은 짧은 JSON을 권합니다.

```json
{
  "_comment": "예시: scripts/lint_ddl.py 의 출력",
  "file": "V2025_10_28__add_claim_status.sql",
  "verdict": "block",
  "findings": [
    {
      "line": 3,
      "rule": "LARGE_TABLE_ADD_NOT_NULL_DEFAULT",
      "detail": "CLAIM_MASTER는 대용량 테이블 목록에 있음. 기본값 있는 NOT NULL 컬럼 추가",
      "see": "oracle-checklist.md#대용량-테이블"
    }
  ],
  "rollback": { "required": true, "found": false }
}
```

`see` 필드가 3층 문서의 어느 절을 읽어야 하는지 가리킵니다. 스크립트가 다음에 읽을 문서를 정해 주므로, 모델이 체크리스트 전체를 읽을 필요가 없습니다.

### 위험한 작업은 계획, 검증, 실행으로 나눈다

작성 가이드에는 실수를 일찍 잡는 패턴이 하나 더 있습니다. 복잡하고 열린 작업에서는 모델이 먼저 구조화된 형식으로 계획 파일을 만들고, 스크립트로 그 계획을 검증한 뒤에 실행하라는 것입니다. 가이드는 이를 일괄 작업, 파괴적인 변경, 복잡한 검증 규칙, 위험이 큰 작업에 쓰라고 적습니다. 검증기를 돌리고, 오류를 고치고, 다시 돌리는 피드백 루프도 같은 맥락에서 권합니다. [\[Claude Docs: Skill authoring best practices, 2025-10-22 스냅샷\]](https://web.archive.org/web/20251022170425/https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices)

이것을 `SKILL.md` 본문에 녹이면 다음과 같습니다.

```text
[예시] sql-change-review/SKILL.md 본문 일부

## 검토 절차
아래 체크리스트를 응답에 복사하고 단계마다 표시한다.

1. scripts/lint_ddl.py <파일> 실행. verdict가 block이면 see 가 가리키는 절만 읽는다.
2. scripts/check_rollback.py <파일> 실행. 롤백이 없으면 rollback-guide.md 를 읽고
   롤백 초안을 review/rollback_plan.json 에 쓴다.
3. scripts/check_rollback.py --plan review/rollback_plan.json 으로 초안을 검증한다.
   실패하면 고치고 3을 반복한다.
4. 1~3의 결과로 검토 의견을 작성한다. 스크립트가 통과시킨 항목을 다시 판단하지 않는다.

## 하지 말 것
- 운영 DB에 접속하지 않는다. 이 Skill은 파일만 다룬다.
- 대용량 테이블 목록을 추측하지 않는다. lint 결과만 따른다.
```

마지막 지시가 중요하다고 봅니다. 스크립트가 판정한 것을 모델이 다시 문장으로 판단하기 시작하면 결정성이 사라집니다.

### 스크립트가 깨지는 방식

첫째, 실행 환경이 다릅니다. Claude Code에서는 로컬에서 돌던 스크립트가 API의 컨테이너에서는 네트워크도 없고 추가 패키지도 없는 환경에서 돌아야 합니다. 대용량 테이블 목록을 DB에서 조회하는 스크립트라면 API 쪽에서는 동작하지 않으므로, 목록을 파일로 Skill 안에 넣는 편이 낫습니다.

둘째, 스크립트도 코드이므로 테스트가 필요합니다. 금지 구문 규칙 하나가 틀리면 모든 검토가 같은 방향으로 틀립니다. 모델의 실수는 들쭉날쭉하지만 스크립트의 실수는 일관되게 반복된다는 점을 기억해야 합니다.

## 4. system prompt, Skill, 슬래시 명령, MCP는 서로 다른 것을 담는다

### 네 가지를 나누는 기준

Skills를 보면 MCP와 무엇이 다른가 하는 질문이 자연스럽게 나옵니다. 저는 둘이 경쟁하는 것이 아니라 담는 것이 다르다고 봅니다.

Anthropic도 엔지니어링 글에서 앞으로의 방향으로 Skill이 MCP 서버를 보완하는 방식을 들었습니다. 외부 도구와 소프트웨어가 얽힌 복잡한 워크플로를 Skill이 에이전트에게 가르친다는 그림입니다. [\[Anthropic: Equipping agents for the real world with Agent Skills\]](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

Claude Code 안에서는 슬래시 명령과의 구분도 필요합니다. Claude Code 문서는 슬래시 명령을 자주 쓰는 짧은 프롬프트를 파일 하나에 담아 사용자가 직접 부르는 것으로, Skill을 여러 단계의 워크플로와 스크립트와 여러 파일에 걸친 지식을 담아 맥락에 따라 자동으로 발견되는 것으로 나눕니다. [\[Claude Code Docs: Slash commands, 2025-10-26 스냅샷\]](https://web.archive.org/web/20251026191906/https://docs.claude.com/en/docs/claude-code/slash-commands)

아래 표는 제가 네 가지를 나누는 기준입니다.

| 수단 | 담는 것 | 실리는 시점 | 누가 부르는가 | 맞는 내용 |
| --- | --- | --- | --- | --- |
| system prompt, `CLAUDE.md` | 항상 유효한 규칙 | 매 턴 | 항상 | 금지 사항, 응답 언어, 프로젝트의 기본 구조 |
| 슬래시 명령 | 자주 쓰는 짧은 지시 | 부를 때 | 사용자 | 정해진 리뷰 요청, 반복 질문 |
| Skill | 가끔 필요한 절차 지식과 스크립트 | 관련 있을 때 | 모델 | 배포 절차, 검토 기준, 문서 양식, 검증 스크립트 |
| MCP 서버 | 외부 시스템에 대한 연결 | 서버를 붙일 때 | 모델 | 이슈 트래커 조회, DB 질의, 사내 API 호출 |

MCP는 "무엇에 닿을 수 있는가"를, Skill은 "닿아서 어떻게 일하는가"를 정합니다. 이슈 트래커 MCP 서버를 붙이는 것과 "우리 팀은 장애 티켓을 이런 순서로 처리한다"를 가르치는 것은 다른 일입니다.

### 판단 순서

새 지식이 생겼을 때 어디에 둘지 묻는 순서를 정해 두면 논쟁이 줄어듭니다. 아래 순서는 제 의견입니다.

```text
새로 생긴 지식이나 능력
  │
  ├─ 사람이 아니라 시스템에 물어야 답이 나오는가?  ── 예 ──> MCP 서버 (또는 CLI)
  │
  ├─ 대화 열 번 중 아홉 번 필요한가?              ── 예 ──> system prompt, CLAUDE.md
  │
  ├─ 사용자가 정해진 시점에 직접 부르는가?          ── 예 ──> 슬래시 명령
  │
  └─ 가끔 필요하고, 여러 단계나 파일이나 코드가 있는가? ── 예 ──> Skill
```

SQL 변경 검토는 네 번째에 해당합니다. 다만 "대용량 테이블 목록"을 실시간으로 DB에서 가져와야 한다면 그 부분만 MCP나 CLI로 떼고, Skill 본문에서 그 도구를 언제 어떻게 쓰는지를 가르치는 구성이 됩니다. 작성 가이드도 Skill에서 MCP 도구를 언급할 때는 서버 이름을 붙인 정식 이름으로 쓰라고 권합니다.

### 경계가 깨지는 방식

같은 내용이 `CLAUDE.md`와 Skill에 두 번 적히는 것이 가장 흔한 문제라고 봅니다. 한쪽만 고치면 둘이 어긋나고, 둘 다 실리는 순간 모델은 어느 쪽을 따를지 스스로 정합니다. 옮긴 내용은 원래 자리에서 지우고, 원래 자리에는 "SQL 변경 검토는 sql-change-review Skill을 따른다" 정도의 한 줄만 남기는 편이 낫습니다.

Skill이 특정 MCP 도구에 기대는 경우도 조심해야 합니다. Claude Code에서는 DB 조회 MCP 서버가 붙어 있어 잘 돌던 Skill이, 같은 서버가 없는 다른 표면이나 다른 동료의 환경에서는 도구를 찾지 못해 중간에 멈추거나 그 단계를 추측으로 메웁니다. 저는 `SKILL.md` 앞부분에 필요한 도구와 그 도구가 없을 때 할 일, 예를 들어 사용자에게 목록 파일을 요청하라는 지시를 적어 두는 편이 안전하다고 봅니다.

MCP 쪽의 무게도 함께 봐야 합니다. Simon Willison은 같은 글에서 GitHub의 공식 MCP 서버 하나만으로 컨텍스트 수만 토큰을 쓴다는 점을 MCP의 가장 큰 한계로 꼽았습니다. [\[Simon Willison: Claude Skills are awesome, maybe a bigger deal than MCP\]](https://simonwillison.net/2025/Oct/16/claude-skills/) Skill로 지식을 가볍게 만들어도 붙여 둔 MCP 서버의 도구 정의가 무거우면 효과가 상쇄됩니다.

## 5. Skill은 실행되는 배포물이다: 출처, 검토, 평가가 필요하다

### 위협 모델

Skill은 지침과 코드로 에이전트에게 새 능력을 줍니다. 같은 이유로 공격 경로가 됩니다.

Anthropic은 신뢰할 수 있는 출처의 Skill만 설치하라고 권하고, 그렇지 않은 경우에는 사용 전에 철저히 감사하라고 적습니다. 번들된 파일의 내용, 코드 의존성, 외부 네트워크에 연결하라는 지시를 특히 보라는 것입니다. [\[Anthropic: Equipping agents for the real world with Agent Skills\]](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

문서 쪽은 위험을 더 구체적으로 나눕니다. [\[Claude Docs: Agent Skills overview, 2025-10-26 스냅샷\]](https://web.archive.org/web/20251026050143/https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)

- 감사: `SKILL.md`, 스크립트, 이미지까지 모든 파일을 보고, 예상치 못한 네트워크 호출이나 Skill의 목적과 맞지 않는 파일 접근을 찾습니다.
- 외부 출처: 외부 URL에서 데이터를 가져오는 Skill은 가져온 내용에 악의적인 지시가 들어 있을 수 있어 특히 위험하고, 믿을 만한 Skill도 외부 의존성이 바뀌면 손상될 수 있습니다.
- 도구 오용과 데이터 노출: 악의적인 Skill은 파일 작업, bash, 코드 실행을 해로운 방식으로 부르거나 민감한 데이터를 바깥으로 흘릴 수 있습니다.
- 소프트웨어 설치처럼 다루기: 민감한 데이터나 중요한 운영에 닿는 시스템에 넣을 때 특히 조심합니다.

### 형상 관리와 소유자

보험이나 금융처럼 변경 통제가 엄격한 조직이라면 Skill을 라이브러리 반입과 같은 수준으로 다루는 편이 안전하다고 봅니다. 다행히 형식이 그 일을 쉽게 만듭니다.

- Claude Code에서 프로젝트 Skill은 `.claude/skills/` 아래에 두고 Git으로 팀과 공유합니다. 개인 Skill은 `~/.claude/skills/`에, 플러그인에 묶인 Skill은 플러그인과 함께 들어옵니다. [\[Claude Code Docs: Agent Skills, 2025-10-21 스냅샷\]](https://web.archive.org/web/20251021015044/https://docs.claude.com/en/docs/claude-code/skills)
- Skill 하나가 폴더 하나이므로 소유자를 정하기 쉽습니다. SQL 검토 Skill은 DBA 파트가, 배포 Skill은 운영 파트가 승인하는 식입니다.
- Claude Code에서는 frontmatter의 `allowed-tools`로 Skill이 활성화된 동안 쓸 수 있는 도구를 제한할 수 있습니다. 지정하지 않으면 평소의 권한 확인 절차를 따릅니다. 같은 문서는 `SKILL.md` 안에 버전 이력 절을 두어 변경을 추적하는 방법도 안내합니다.

SQL 변경 검토 Skill이라면 `allowed-tools`를 읽기, 검색, 스크립트 실행으로 좁히고, 폴더에 코드 소유자로 DBA 파트를 지정해 두면 됩니다. 검토 Skill이 검토 대상 파일을 고치는 일은 이 단계에서 막힙니다.

### 표면마다 배포 경로가 다르다

조직 단위 배포를 계획한다면 표면 사이의 차이를 먼저 봐야 합니다. 10월 하순 문서 기준으로 정리하면 이렇습니다. [\[Claude Docs: Agent Skills overview, 2025-10-26 스냅샷\]](https://web.archive.org/web/20251026050143/https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)

| 표면 | 커스텀 Skill을 넣는 방법 | 공유 범위 |
| --- | --- | --- |
| Claude.ai | 설정에서 zip 업로드 | 사용자 개인, 관리자 일괄 배포 없음 |
| Claude API | `/v1/skills` 엔드포인트로 업로드 | 워크스페이스 전체 |
| Claude Code | `~/.claude/skills/` 또는 `.claude/skills/` | 개인 또는 프로젝트(Git) |

:::caution
10월 하순 문서 기준으로 커스텀 Skill은 표면 사이에 동기화되지 않습니다. Claude.ai에 올린 Skill은 API에서 따로 올려야 하고, Claude Code의 Skill은 파일시스템 기반이라 둘과 별개입니다. 같은 Skill이 세 곳에서 서로 다른 버전으로 돌 수 있다는 뜻이므로, 원본 저장소 하나를 정하고 나머지는 거기서 배포하는 절차가 필요합니다.
:::

### 평가부터 만든다

검증도 미리 설계할 수 있습니다. 작성 가이드는 문서를 길게 쓰기 전에 평가부터 만들라고 권합니다. Skill 없이 대표 작업을 돌려 실패를 기록하고, 그 틈을 시험하는 시나리오 세 개를 만들고, Skill 없는 상태의 성능을 기준선으로 잰 뒤, 통과에 필요한 최소한의 지침만 쓰고, 기준선과 비교하며 고치라는 순서입니다. [\[Claude Docs: Skill authoring best practices, 2025-10-22 스냅샷\]](https://web.archive.org/web/20251022170425/https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices)

가이드는 Claude 인스턴스 하나와 함께 Skill을 만들고, 새로 띄운 다른 인스턴스에 그 Skill을 실어 실제 작업을 시켜 보며 고치는 방식도 소개합니다. 쓸 계획인 모델마다 시험해 보라는 권고도 있습니다. 큰 모델에서 잘 되는 지침이 작은 모델에는 부족할 수 있기 때문입니다.

SQL 변경 검토 Skill의 평가 시나리오 세 개를 예로 들면 이렇습니다.

- 대용량 테이블에 기본값 있는 NOT NULL 컬럼을 추가하는 스크립트: block 판정과 해당 체크리스트 절 인용을 기대합니다.
- 롤백 스크립트가 빠진 인덱스 재생성: 롤백 초안 작성과 검증 통과를 기대합니다.
- 문제없는 코드 테이블 데이터 추가: 통과 판정과 불필요한 지적이 없기를 기대합니다.

세 번째 시나리오를 빼먹기 쉽습니다. 검토 Skill은 지적을 많이 하는 쪽으로 기울기 쉬운데, 쓸데없는 지적이 쌓이면 사람이 검토 의견을 읽지 않게 됩니다.

### 참고할 실물

참고할 실물도 공개되어 있습니다. `anthropics/skills` 저장소에는 예제 Skill과 함께 Claude의 문서 생성 기능에 쓰이는 docx, pdf, pptx, xlsx Skill이 참고용으로 들어 있습니다. README에 따르면 예제 Skill은 Apache 2.0이고 문서 Skill은 소스 공개이되 오픈소스는 아니며, 특정 시점의 사본이라 계속 갱신되지는 않습니다. Claude Code에서는 다음 명령으로 플러그인 마켓플레이스로 등록할 수 있습니다. [\[anthropics/skills README, 2025-10-18 커밋\]](https://github.com/anthropics/skills/blob/c74d647e56e6daa12029b6acb11a821348ad044b/README.md)

```text
/plugin marketplace add anthropics/skills
```

문서 Skill들은 스크립트와 참고 문서를 어떻게 나누는지 보기에 좋은 예입니다. 다만 라이선스가 다르므로 사내 Skill에 코드를 옮겨 쓰기 전에 확인이 필요합니다.

### 표준 절차서를 가진 조직에서 Skill이 놓일 자리

보험사나 은행의 IT 조직에는 이미 비슷한 문서가 있습니다. 배포 절차서, DB 변경 검토 기준서, 장애 보고 양식 같은 표준 절차서입니다. 문제는 이 문서들이 사람이 찾아 읽는 위키에 있고, 에이전트에게는 누군가 system prompt에 옮겨 적은 사본만 전달된다는 점입니다. 사본은 원본이 바뀌어도 따라 바뀌지 않습니다.

저는 Skill을 표준 절차서의 실행 가능한 판으로 보는 편이 맞다고 봅니다. 그렇게 보면 운영 규칙도 자연스럽게 따라 나옵니다.

- 절차서의 개정 승인권자가 곧 해당 Skill 폴더의 코드 소유자가 됩니다.
- 절차서의 판 번호처럼 `SKILL.md`에 버전 이력을 두고, 스크립트 변경은 일반 코드와 같은 리뷰를 거칩니다.
- 평가 시나리오는 절차서의 점검 사례 역할을 합니다. 절차가 바뀌면 시나리오도 함께 바뀌어야 합니다.

기록의 관점에서도 이점이 있다고 봅니다. 문서 설명대로 Skill은 모델이 `SKILL.md`를 읽는 순간 발동하므로, 그 읽기는 대화 기록에 도구 호출로 남습니다. "이 검토에 어떤 기준이 적용되었는가"라는 질문에, system prompt 전체가 아니라 특정 Skill의 특정 버전이라고 답할 수 있게 됩니다. 반대로 그 읽기가 기록에 없다면 기준이 적용되지 않은 검토라는 뜻이므로, 이것을 사후 점검 항목으로 쓸 수도 있습니다.

## 6. 오늘 바로 적용할 수 있는 순서

1. 지금 쓰는 system prompt나 `CLAUDE.md`를 문단 단위로 나누고, 각 문단이 대화 열 번 중 몇 번 필요한지 표시합니다. 시스템에 물어야 답이 나오는 문단은 따로 표시합니다.
2. 한두 번만 필요한 문단 묶음 하나를 골라 Skill 폴더로 옮기고, 원래 자리에는 한 줄 안내만 남깁니다. 처음에는 `SKILL.md` 하나면 충분합니다.
3. `description`에 무엇을 하는지, 언제 쓰는지, 언제 쓰지 않는지를 적고, 발동해야 하는 요청과 발동하면 안 되는 요청 몇 개씩으로 시험합니다.
4. 본문에서 틀리면 안 되는 절차를 찾아 짧은 JSON을 내는 스크립트로 바꾸고, 본문에는 실행 순서와 "스크립트 판정을 다시 판단하지 않는다"는 규칙만 남깁니다. 평가 시나리오 세 개를 함께 만듭니다.
5. Skill 폴더를 저장소에 넣고, `allowed-tools`를 좁히고, 폴더마다 코드 소유자를 지정합니다. 다른 표면에도 쓴다면 원본 저장소에서 배포하는 절차를 정합니다.

## 마치며

Agent Skills의 형식은 폴더와 Markdown 파일로 이루어져 있어 새로울 것이 없어 보입니다. 눈여겨볼 것은 형식이 아니라 적재 시점을 설계 대상으로 삼았다는 점입니다. 무엇을 항상 싣고 무엇을 필요할 때만 실을지 나누면, 지식이 늘어도 컨텍스트는 그만큼 무거워지지 않습니다. 그리고 그 지식이 실행되는 코드를 포함하는 순간부터는 문서가 아니라 배포물로 다뤄야 합니다.

## 참고 자료

- [Introducing Agent Skills](https://www.anthropic.com/news/skills)
- [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Claude Docs: Agent Skills overview (2025-10-26 스냅샷)](https://web.archive.org/web/20251026050143/https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)
- [Claude Docs: Skill authoring best practices (2025-10-22 스냅샷)](https://web.archive.org/web/20251022170425/https://docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices)
- [Claude Code Docs: Agent Skills (2025-10-21 스냅샷)](https://web.archive.org/web/20251021015044/https://docs.claude.com/en/docs/claude-code/skills)
- [Claude Code Docs: Slash commands (2025-10-26 스냅샷)](https://web.archive.org/web/20251026191906/https://docs.claude.com/en/docs/claude-code/slash-commands)
- [anthropics/skills README (2025-10-18 커밋)](https://github.com/anthropics/skills/blob/c74d647e56e6daa12029b6acb11a821348ad044b/README.md)
- [anthropics/skills: agent_skills_spec.md (2025-10-18 커밋)](https://github.com/anthropics/skills/blob/c74d647e56e6daa12029b6acb11a821348ad044b/agent_skills_spec.md)
- [Simon Willison: Claude Skills are awesome, maybe a bigger deal than MCP](https://simonwillison.net/2025/Oct/16/claude-skills/)
