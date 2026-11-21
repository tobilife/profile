---
title: "hyperframes-community-skills: Skill 하나가 폴더 하나일 때 배포 단위가 된다"
date: 2026-08-30
description: "HeyGen이 연 커뮤니티 skill 저장소의 폴더 규칙, 설치 경로, curated와 community의 구분, CI 검증, 신뢰 경계 선언을 보고 skill 배포 단위 설계를 정리합니다."
category: 저장소 소개
tags: [오픈소스, Agent Skills, 영상 생성, 보안, 가드레일]
draft: false
---

:::note
- hyperframes-community-skills는 HyperFrames용 커뮤니티 skill을 모으는 저장소로, 2026년 8월 25일에 만들어졌습니다. 이 글은 8월 27일 커밋을 기준으로 합니다.
- 규칙은 단순합니다. skill 하나는 자기완결적인 폴더 하나이고, 폴더 사이에 공유 코드가 없습니다. 이 규칙 덕분에 skill 하나만 설치하고, 하나만 리뷰하고, 하나만 믿을지 판단할 수 있습니다.
- 공식 지원하는 curated skill과 커뮤니티 skill을 저장소 수준에서 가르고, 지원 범위와 위험을 README 첫 화면에 적습니다.
- 구조 규칙과 금지 항목은 CI 스크립트가 검사하고, 기계가 못 보는 부분은 code owner 승인과 skill 안의 신뢰 경계 선언으로 메웁니다.
:::

Agent skill을 처음 접하면 흔히 이렇게 생각합니다. "skill은 Markdown 파일이니까 복사해서 쓰면 된다."

절반만 맞습니다. skill은 에이전트에게 명령을 실행하고, 파일을 읽고, 네트워크를 호출하게 만드는 지시문입니다. 스크립트와 의존성이 딸려 오기도 합니다. Anthropic도 Agent Skills를 소개하며 악의적인 skill은 실행 환경에 취약점을 만들거나 데이터를 빼내게 할 수 있으니, 신뢰할 수 있는 출처의 skill만 설치하고 그렇지 않으면 번들된 파일과 코드 의존성까지 꼼꼼히 감사하라고 권합니다. [\[Anthropic: Equipping agents for the real world with Agent Skills\]](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

**skill을 남에게 나눠 주려면 문서가 아니라 배포 단위로 다뤄야 하고, 그러려면 경계와 검증이 필요합니다.**

HeyGen이 연 `heygen-com/hyperframes-community-skills`는 그 경계를 어떻게 긋는지 보여 주는 작은 저장소입니다. README는 첫 화면에서 커뮤니티 skill이 에이전트에게 명령 실행, 파일 읽기, 네트워크 호출, 비용 지출을 지시할 수 있으니 쓰기 전에 `SKILL.md`, 스크립트, 의존성, 요구 권한을 검토하라고 경고합니다. [\[hyperframes-community-skills: README\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/README.md)

HyperFrames 자체는 두 문장으로 충분합니다. HTML, CSS, 미디어, 탐색 가능한 애니메이션을 결정적인 MP4 영상으로 바꾸는 오픈소스 프레임워크입니다. CLI로 직접 쓰거나, skill을 설치한 AI 코딩 에이전트를 통해 씁니다. [\[HyperFrames: README\]](https://github.com/heygen-com/hyperframes/blob/af1cb1c10da33bade100db8233435c7591b7c0bc/README.md)

이 글은 저장소가 만들어진 직후인 2026년 8월 27일 커밋을 기준으로 씁니다. 생성일은 8월 25일이고 라이선스는 Apache-2.0입니다. [\[GitHub: heygen-com/hyperframes-community-skills\]](https://github.com/heygen-com/hyperframes-community-skills) 영상 도구에 관심이 없어도, 사내에서 skill을 나눠 쓰기 시작하는 팀이라면 이 저장소의 규칙을 거의 그대로 가져다 쓸 수 있다고 봅니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 보험사 IT 조직에서 각 팀이 만든 skill을 사내 저장소 하나에 모으기 시작했다고 해봅시다. 이 글 전체에서 쓸 예시입니다.

청구팀의 한 개발자가 고객용 청구 서류 안내를 1분짜리 설명 영상으로 만드는 `claim-doc-explainer` skill을 만들었고, 옆 팀이 그 폴더를 자기 프로젝트로 복사해 왔습니다. 에이전트에게 그 skill을 쓰라고 하자 두 가지 일이 생깁니다.

첫째, 스크립트가 실패합니다. 원래 저장소의 루트에 있던 공용 유틸리티를 import하고 있었는데, 폴더만 복사했기 때문입니다.

둘째, 며칠 뒤 음성 합성 API 요금이 청구됩니다. skill 안의 한 단계가 유료 API로 내레이션을 만들고 있었지만 문서 어디에도 적혀 있지 않았고, 그 API에는 안내문 원문이 그대로 전송되었습니다.

시스템 설계 관점에서 보면 두 문제의 뿌리는 같습니다.

- 배포 단위의 경계가 정의되지 않았다. 폴더 하나로 동작하는지 아무도 보장하지 않았다.
- 신뢰 경계가 적혀 있지 않았다. 이 skill이 어디에 접속하고, 무엇을 보내고, 무엇을 쓰고, 얼마를 쓰는지 사용자가 알 방법이 없었다.
- 둘 다 검사하는 장치가 없었다. 사람의 기억과 선의에 맡겨져 있었다.

이 저장소의 규칙은 대부분 이 세 가지를 막는 데 쓰입니다.

## 1. 폴더 하나가 skill 하나: 자기완결이 배포의 전제다

README가 밝힌 구조는 이것이 전부입니다. [\[hyperframes-community-skills: README\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/README.md)

```text
skills/
└── <skill-name>/
    ├── SKILL.md          필수. 지시문과 메타데이터
    ├── scripts/          선택. 읽을 수 있는 소스 코드
    ├── references/       선택. 보조 문서
    └── assets/           선택. 작고 재배포 가능한 자산
```

### 규칙 세 가지

- 폴더 이름은 소문자 kebab-case이고 `SKILL.md`의 `name` 필드와 같아야 한다.
- 루트 skill이 없다.
- skill 사이에 공유하는 런타임 의존성이 없다.

첫 번째 규칙은 이 저장소만의 것이 아닙니다. Agent Skills 명세도 `name`은 소문자, 숫자, 하이픈만 쓰고 상위 디렉터리 이름과 같아야 한다고 정합니다. 같은 명세는 `scripts/`, `references/`, `assets/`를 선택 디렉터리로 두고, 이 파일들은 필요할 때만 읽히는 세 번째 단계의 자원으로 설명합니다. [\[Agent Skills Specification\]](https://web.archive.org/web/20260723004319/https://agentskills.io/specification) 저장소의 구조가 명세의 기본 모양을 그대로 따른 것입니다.

### 왜 공유 코드를 금지하나

세 번째 규칙이 핵심입니다. 기여 가이드는 `skills/` 아래나 저장소 루트에 공유 런타임 코드를 두지 말라고 하고, 그 skill 폴더만 읽은 에이전트가 따라 하는 데 필요한 것을 모두 갖고 있어야 한다고 적습니다. skill 안의 파일은 상대 경로로 가리키라는 규칙도 같은 이유입니다. [\[hyperframes-community-skills: CONTRIBUTING\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/CONTRIBUTING.md)

이 규칙이 왜 필요한지는 skill이 실제로 어떻게 소비되는지를 단계로 보면 분명해집니다.

1. 설치기가 저장소에서 폴더 하나를 골라 사용자의 에이전트 디렉터리로 복사하거나 링크합니다.
2. 에이전트는 시작할 때 그 폴더의 `SKILL.md` 머리말에서 이름과 설명만 읽습니다.
3. 작업이 관련 있다고 판단하면 `SKILL.md` 본문을 읽습니다.
4. 본문이 가리키는 `references/`의 문서와 `scripts/`의 코드를 필요할 때 읽고 실행합니다.

어느 단계에도 저장소 루트는 등장하지 않습니다. 에이전트가 보는 세계는 폴더 하나입니다. 폴더 밖의 파일을 import하는 순간, 1번 단계에서 그 파일이 따라오지 않으니 4번 단계에서 깨집니다. 예시의 `claim-doc-explainer`가 정확히 이렇게 깨졌습니다.

개발자의 감각으로는 중복 코드가 거슬릴 수 있습니다. 공용 유틸리티를 뽑아내고 싶어집니다. 하지만 배포 단위로 보면 판단이 달라집니다. 공유 코드가 생기는 순간 skill 하나만 설치할 수 없게 되고, 공유 코드의 변경이 모든 skill의 동작을 바꿉니다. 리뷰어도 skill 하나의 동작을 그 폴더만 보고 판단할 수 없게 됩니다.

### 8월 27일의 skill 목록

8월 27일 기준으로 들어 있는 skill은 세 개입니다.

| skill | README가 설명하는 용도 | 폴더 안에 든 것 |
| --- | --- | --- |
| `p5-paint-animation` | 글, 사진, 짧은 영상을 결정적인 p5.js 손글씨, 페인팅, 움직이는 그림 애니메이션으로 변환 | 렌더링 스크립트, 스케치, 자체 `package-lock.json`, 설치 스크립트 |
| `vox-explainer` | 주제나 문서, 링크로 60에서 90초짜리 콜라주 스타일 설명 영상 제작 | 단계별 참조 문서, 이음매 검증 스크립트 |
| `x-posting-license` | X 프로필로 10초짜리 면허증 카드 영상을 고정된 템플릿에서 렌더링 | 빌드 스크립트, HTML 템플릿 |

셋 다 범위가 좁습니다. README는 이 저장소를 특정 워크플로, 도구, 용도에 맞춘 일회성 skill을 위한 곳이라고 설명합니다.

자기완결 규칙은 의존성에도 적용되어 있습니다. `p5-paint-animation`은 자기 폴더 안의 `scripts/package-lock.json`으로 고정된 의존성 트리를 설치하고, 저장소의 dependabot 설정도 저장소 루트가 아니라 그 폴더 하나만 감시합니다. 의존성까지 폴더 단위로 닫혀 있습니다.

### 실패 모드와 비용

- 여러 skill에 같은 버그 수정이 필요하면 폴더마다 고쳐야 합니다. 공유 코드가 없는 대가입니다.
- skill 하나가 커지면 리뷰도 어려워집니다. 기여 가이드가 리뷰어가 전체 동작과 신뢰 경계를 이해할 수 있을 만큼 작게 만들라고 따로 적은 이유라고 봅니다.
- 여러 skill이 함께 움직여야 하는 큰 워크플로에는 이 구조가 맞지 않습니다. 그런 경우는 HyperFrames 본체처럼 라우터 skill과 도메인 skill을 하나의 배포물로 관리하는 편이 낫습니다. 이 차이는 3절에서 다시 봅니다.

## 2. 설치기는 폴더를 고르는 도구다

구조가 고정되면 설치 도구가 단순해집니다. 이 저장소는 HyperFrames 본체와 같은 `skills` 설치기를 씁니다. [\[hyperframes-community-skills: README\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/README.md)

설치하지 않고 목록만 보는 명령입니다.

```bash
npx skills add heygen-com/hyperframes-community-skills --list
```

skill 하나만 설치합니다.

```bash
npx skills add heygen-com/hyperframes-community-skills --skill <skill-name>
```

전부 설치합니다.

```bash
npx skills add heygen-com/hyperframes-community-skills --all
```

README에 따르면 기본 동작은 현재 프로젝트에 설치하면서 대상 에이전트를 묻는 것이고, 전역 설치나 비대화형 설치는 `--global`, `--agent`, `--yes` 옵션으로 합니다. 공개 저장소라 설치에 GitHub 인증은 필요 없습니다.

### 설치기가 skill을 찾는 방식

README는 `skills/` 구조를 그대로 따른 덕분에 설치기가 `--full-depth`로 저장소 전체를 깊이 훑지 않고도 skill 모음을 찾는다고 설명합니다.

설치기 쪽 문서를 보면 이 말의 뜻이 구체적으로 보입니다. 8월 27일 기준 `vercel-labs/skills`의 README에 따르면, 설치기는 저장소 루트와 `skills/`, `skills/.curated/`, `skills/.experimental/`, 그리고 에이전트별 `.claude/skills/` 같은 정해진 컨테이너 디렉터리에서만 `SKILL.md`를 찾고, 각 컨테이너를 세 단계 깊이까지 내려갑니다. 그 밖의 위치, 예를 들어 `examples/`나 `tests/` 아래의 `SKILL.md`는 `--full-depth`를 줘야 찾습니다. 설치 범위는 프로젝트가 기본이고 `-g`를 주면 사용자 홈 아래로 가며, 각 에이전트 디렉터리에 심볼릭 링크를 거는 방식이 권장이고 복사도 고를 수 있습니다. [\[vercel-labs/skills: README\]](https://github.com/vercel-labs/skills/blob/3dba29adc5013c60c4aabb545b0a8f034377e287/README.md)

구조 규약이 곧 도구와의 인터페이스입니다. 폴더 규칙을 지키면 설치기가 추가 설정 없이 그 폴더를 하나의 단위로 다룹니다.

### 설치기 없이 받는 길

설치기를 쓰지 않는 경로도 문서에 있습니다. sparse checkout으로 폴더 하나만 내려받는 방법입니다.

```bash
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/heygen-com/hyperframes-community-skills.git
cd hyperframes-community-skills
git sparse-checkout set skills/<skill-name>
```

이 명령이 성립하는 이유가 앞 절의 규칙입니다. 폴더 하나만 받아도 동작하도록 만들었기 때문에 폴더 하나만 받는 설치가 가능합니다. 사내 보안 정책상 `npx`로 외부 패키지를 바로 실행하기 어려운 환경에서는 이쪽이 현실적인 경로라고 봅니다.

### 업데이트는 코드 업데이트처럼

업데이트에 대한 문장도 눈여겨볼 만합니다. clone을 갱신할 때는 `git pull --ff-only`를 쓰고, 설치하거나 복사하기 전에 들어온 변경을 검토하라고 적혀 있습니다. skill 업데이트를 코드 업데이트처럼 다루라는 뜻입니다.

예시의 사내 저장소라면 `claim-doc-explainer`의 새 버전이 나왔을 때, 옆 팀은 그 차이를 보고 나서 받아야 합니다. 새 버전이 유료 API를 하나 더 부르기 시작했다면 그것은 기능 추가가 아니라 신뢰 경계의 변경입니다.

### 설치기 자체도 검토 대상이다

보수적인 조직이라면 설치기 자체도 한 번 봐야 합니다. 같은 설치기 README에는 익명 사용 telemetry가 있고, 공개 저장소로 확인된 GitHub 저장소에 대해서만 저장소와 skill 식별자를 보내며, `DISABLE_TELEMETRY=1`이나 `DO_NOT_TRACK=1`로 끌 수 있다고 적혀 있습니다. [\[vercel-labs/skills: README\]](https://github.com/vercel-labs/skills/blob/3dba29adc5013c60c4aabb545b0a8f034377e287/README.md) 커뮤니티 저장소가 skill 안의 조용한 telemetry를 금지하는 것과는 별개로, 도구 체인 전체에서 무엇이 밖으로 나가는지를 확인해야 한다는 뜻입니다.

### 실패 모드와 비용

- `--all`은 편하지만 검토하지 않은 skill까지 들입니다. 설치기는 고른 것을 설치할 뿐, 고른 것이 안전한지는 판단하지 않습니다.
- 심볼릭 링크 방식은 원본이 바뀌면 설치된 쪽도 바로 바뀝니다. 업데이트를 검토 후 반영하려면 복사 방식이나 고정된 커밋에서 받는 방식이 맞습니다.
- 프로젝트 범위 설치는 skill을 저장소에 커밋하게 만듭니다. 팀 전체가 같은 skill을 쓰게 되는 장점이 있는 대신, skill 변경이 코드 리뷰를 거치지 않고 들어올 여지도 생깁니다.

## 3. Curated와 community는 지원 범위를 가르는 선이다

README의 마지막 부분은 두 종류의 skill을 구분합니다. 공통적이고 지원되는 워크플로에는 curated HyperFrames skill을 쓰고, 사용자층이 작아 공개 세트에 넣기 어려운 특수하거나 실험적인 워크플로에는 이 저장소를 쓰라는 것입니다. 여기 들어왔다고 curated로 승격된다는 뜻은 아니라고 덧붙입니다. [\[hyperframes-community-skills: README\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/README.md)

### 두 배포물의 모양

같은 주의 HyperFrames 본체 README를 보면 curated 쪽의 모양이 다릅니다. 8월 28일 기준 HyperFrames는 skill 20개를 배포하고, `/hyperframes`라는 라우터 skill을 먼저 읽게 합니다. 기본으로 권하는 것은 라우터와 도메인 skill로 된 핵심 세트이고, 제작 워크플로 skill은 라우터가 필요할 때 설치합니다. [\[HyperFrames: README\]](https://github.com/heygen-com/hyperframes/blob/af1cb1c10da33bade100db8233435c7591b7c0bc/README.md)

| 구분 | curated skill | community skill |
| --- | --- | --- |
| 위치 | HyperFrames 본 저장소 | 이 저장소 |
| 대상 | 일반적이고 지원되는 워크플로 | 특수하거나 실험적인 워크플로 |
| 구성 | 라우터와 도메인 skill이 하나의 세트로 움직임 | 서로 독립된 일회성 skill |
| 설치 | `npx skills add heygen-com/hyperframes` 또는 `npx hyperframes skills update` | `npx skills add heygen-com/hyperframes-community-skills --skill <이름>` |
| 승격 | 해당 없음 | 여기 들어왔다고 curated로 올라간다는 뜻은 아님 |

### 왜 저장소 수준에서 나누나

플러그인 생태계를 운영해 본 조직이라면 익숙한 구분입니다. 핵심은 선을 저장소 수준에서 그었다는 점입니다.

한 저장소 안에서 폴더나 태그로 가르면 사용자는 설치할 때 그 차이를 놓치기 쉽습니다. 저장소를 나누면 설치 명령에 적는 이름부터 달라집니다. 사용자가 어느 쪽을 설치하는지 모를 수가 없습니다.

설치기 README가 `skills/.curated/`와 `skills/.experimental/`을 찾는 위치로 따로 두고 있는 것을 보면, 한 저장소 안에서 폴더로 나누는 방식도 도구 차원에서 지원은 됩니다. [\[vercel-labs/skills: README\]](https://github.com/vercel-labs/skills/blob/3dba29adc5013c60c4aabb545b0a8f034377e287/README.md) 그래도 지원 책임과 리뷰 주체가 다르다면, 저장소를 나누는 편이 설치하는 사람에게 더 분명한 신호를 준다고 봅니다.

### 책임의 경계를 문서로 밝힌다

README는 저장소의 리뷰와 자동 검사가 위험을 줄이기는 하지만 보안을 보장하지는 않는다고 덧붙입니다. 보안 정책 문서는 범위를 더 좁게 적습니다. skill의 지시문과 스크립트, 의존성과 공급망 위험, 저장소 자동화, 그리고 skill이 밝힌 것보다 더 많이 접근하거나 바꿀 수 있는 경로를 이 저장소의 보고 대상으로 두고, HeyGen이나 HyperFrames 제품 자체의 취약점은 별도 주소로 보내라고 합니다. 지원하는 것은 현재 기본 브랜치뿐이라고도 밝힙니다. [\[hyperframes-community-skills: SECURITY.md\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/SECURITY.md)

예시의 사내 저장소에 옮기면, 아키텍처 팀이 관리하는 표준 skill 저장소와 각 팀의 실험 skill 저장소를 나누고, 실험 저장소의 README 첫 줄에 "운영 업무 적용 전 별도 검토 필요"를 적는 모양이 됩니다.

### 실패 모드와 비용

- 저장소가 둘이면 관리 비용도 둘입니다. CI, 리뷰어, 보안 보고 경로를 각각 운영해야 합니다.
- 승격 기준이 없으면 실험 저장소에 쓸 만한 skill이 계속 쌓이기만 합니다. 이 저장소가 "승격을 뜻하지 않는다"고 미리 적은 것은 기대를 관리하는 장치이지 승격 절차는 아닙니다. 사내라면 승격 조건을 따로 정해 두는 편이 낫습니다.

## 4. 규칙은 문서가 아니라 CI가 지킨다

구조 규칙을 README에만 적어 두면 시간이 지나며 무너집니다. 이 저장소는 규칙을 셸 스크립트 하나로 옮겼습니다. [\[hyperframes-community-skills: validate-skills.sh\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/.github/scripts/validate-skills.sh)

### 검사기가 하는 일

스크립트의 흐름은 이렇습니다. 저장소 전체에서 심볼릭 링크를 찾고, `skills/` 바로 아래의 파일을 찾은 뒤, `skills/` 아래 폴더를 하나씩 돌며 아래 항목을 검사합니다. 실패를 만나도 바로 멈추지 않고 모든 실패를 모아 출력한 뒤 마지막에 실패 코드로 끝납니다. 기여자가 한 번 돌려서 고칠 것을 전부 볼 수 있게 한 것입니다.

| 검사 | 막으려는 것 |
| --- | --- |
| 심볼릭 링크 금지 | 폴더 밖을 가리키는 숨은 의존 |
| `skills/` 바로 아래 파일 금지 | skill 사이의 공유 코드 |
| 폴더 이름 kebab-case, 따옴표 없는 `name` 필드와 정확히 일치 | 설치기와 명세와의 규약 위반 |
| `SKILL.md` 존재, 50줄 안에서 닫히는 frontmatter, 비어 있지 않은 description | 메타데이터 없는 skill |
| README의 skill 표에 `(skills/<이름>/)` 링크 존재 | 목록에 없는 skill |
| 5MiB 초과 파일 금지 | 저장소 비대화 |
| 실행 파일, 라이브러리, 바이트코드, 압축 파일 확장자 금지 | 읽을 수 없는 코드 |
| `.env`, SSH 개인키, 인증서 키 파일 금지 | 자격 증명 유출 |

### 워크플로 자체의 방어

워크플로 파일을 보면 이 스크립트가 pull request와 기본 브랜치 push마다 돌고, 이어서 변경된 커밋을 대상으로 TruffleHog 비밀 정보 스캔을 실행합니다. 스캔 결과는 검증된 것과 검증 여부를 알 수 없는 것을 모두 보고하도록 설정되어 있습니다. 워크플로 권한은 저장소 내용 읽기만 허용하고, 사용하는 action은 태그가 아니라 커밋 SHA로 고정되어 있습니다. [\[hyperframes-community-skills: validate.yml\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/.github/workflows/validate.yml)

skill 저장소는 외부 기여를 받는 곳입니다. 검사 워크플로가 쓰기 권한을 갖고 있거나, 태그가 옮겨질 수 있는 action을 쓰면 검사 장치 자체가 공격 경로가 됩니다. 이 두 줄은 그것을 막는 설정입니다.

### 규칙을 먼저, 내용은 나중에

커밋 이력도 순서를 말해 줍니다. 8월 25일 초기 커밋 다음에 들어온 첫 변경이 문서와 가드레일이었고, 첫 skill은 그다음에 들어왔습니다. 공개 기여를 받기 위한 준비 커밋이 두 번째 skill보다 먼저입니다. 규칙을 먼저 세우고 내용을 받았습니다.

### 기계가 못 잡는 것은 사람의 절차로

검사기는 구조를 볼 뿐 동작을 보지 않습니다. 읽을 수 있는 소스로 쓰인 악의적인 스크립트는 이 검사를 모두 통과합니다. 그래서 나머지는 사람의 절차로 남겼습니다.

기여 가이드에 따르면 필수 검사가 모두 통과해야 하고, code owner가 정확히 그 head 커밋을 승인해야 하며, 리뷰 스레드를 해결해야 병합됩니다. 기본 브랜치에 직접 push하는 것은 금지입니다. [\[hyperframes-community-skills: CONTRIBUTING\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/CONTRIBUTING.md)

승인 후에 커밋이 추가되면 승인이 유효하지 않다는 뜻입니다. skill은 한 줄만 바뀌어도 에이전트의 행동이 달라지므로 합리적인 조건이라고 봅니다.

PR 양식은 리뷰어가 볼 것을 기여자가 먼저 적게 합니다. 무엇을 바꾸는지, 왜 curated가 아니라 여기에 속하는지에 이어 "신뢰 경계" 칸이 있고, 명령, 파일 접근, 네트워크 목적지, 자격 증명, 유료 작업, 외부에 보이는 부수 효과를 나열하고 해당 없으면 "없음"이라고 쓰라고 합니다. 확인 목록에는 제출한 skill의 모든 지시문과 스크립트를 직접 읽었는지, 새 에이전트 세션에서 정상 경로와 실패나 취소 경로를 시험했는지가 들어 있습니다. [\[hyperframes-community-skills: PR 양식\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/.github/pull_request_template.md) 새 skill 제안용 이슈 양식에도 같은 신뢰 경계 칸이 필수 항목으로 들어 있습니다.

정리하면 검사의 분담은 이렇습니다.

| 확인할 것 | 기계 (CI) | 사람 (리뷰) |
| --- | --- | --- |
| 폴더 구조, 이름, 메타데이터 | 검사기가 전부 | 볼 필요 없음 |
| 바이너리, 키 파일, 큰 파일 | 확장자와 크기로 | 예외 판단 |
| 커밋에 섞인 비밀 정보 | TruffleHog | 오탐 판단 |
| 스크립트가 실제로 하는 일 | 못 함 | 전부 읽기 |
| 선언한 신뢰 경계와 실제 동작의 일치 | 못 함 | PR 설명과 코드 대조 |
| 승인 후 변경 | head 커밋 승인 규칙 | 재승인 |

### 실패 모드와 비용

- 확장자 기반 검사는 이름만 바꾸면 피할 수 있습니다. 검사기는 실수를 막는 장치이지 공격을 막는 장치가 아니라고 보는 편이 맞습니다.
- code owner가 적으면 리뷰가 병목이 됩니다. 8월 27일 기준 CODEOWNERS에는 개인 한 명과 팀 하나가 저장소 전체의 소유자로 지정되어 있습니다. 기여가 늘면 이 줄이 처리량의 상한이 됩니다.
- 검사가 엄격하면 기여의 문턱이 높아집니다. 이 저장소는 그 문턱을 의도적으로 택한 것으로 보입니다.

## 5. Skill은 실행 권한을 가진 문서다: 신뢰 경계를 skill 안에 적는다

기여 가이드는 `SKILL.md`가 설명해야 할 다섯 가지를 정합니다. [\[hyperframes-community-skills: CONTRIBUTING\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/CONTRIBUTING.md)

- 언제 쓰고 언제 쓰지 않는가
- 필요한 입력, 도구, 의존성, 자격 증명
- 작업 흐름과 기대 산출물
- 네트워크 호출, 유료 작업, 파일 변경 같은 부수 효과
- 에이전트와 리뷰어가 성공을 확인하는 방법

네트워크 서비스가 필요하다면 서비스 이름, 보내는 데이터, 쓰는 자격 증명, 비용 발생 여부를 밝히라는 규칙도 함께 있습니다.

### 실제 skill들은 어떻게 적었나

네 번째 항목이 실제 skill에서 어떻게 쓰이는지 보면 이해가 쉽습니다. 세 skill은 같은 요구를 각자의 성격에 맞게 적었습니다.

| skill | 신뢰 경계를 적은 방식 | 눈에 띄는 점 |
| --- | --- | --- |
| `x-posting-license` | "네트워크와 부수 효과 전체 목록" 절에 접속 호스트를 하나씩 용도와 함께 나열. 자격 증명, 유료 작업, telemetry 없음 | 렌더링 시 애니메이션 라이브러리를 CDN에서 받으므로 완전한 오프라인이 아니라고 명시. 빌드 스크립트는 프로필 문자열을 이스케이프하고 지정한 출력 디렉터리 안에만 씀 |
| `vox-explainer` | "신뢰 경계와 요구 사항" 절 | 음성 합성이나 전사 API를 쓰기 전에 사용자에게 묻고, 제공자, 보내는 데이터, 필요한 자격 증명, 가능한 비용을 먼저 알리라고 에이전트에게 지시. 비공개 문서와 URL은 다른 서비스로 보내지 말 것 |
| `p5-paint-animation` | "요구 사항과 부수 효과" 절 | 설치 스크립트는 사람이 직접 한 번 실행하고 설치 시점에 자동 실행되지 않음. 고정 버전 의존성만 받음. 렌더링은 샌드박스 브라우저에서 돌고 스케치의 네트워크와 로컬 파일 요청은 차단 |

출처는 각 skill의 `SKILL.md`입니다. [\[x-posting-license: SKILL.md\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/skills/x-posting-license/SKILL.md) [\[vox-explainer: SKILL.md\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/skills/vox-explainer/SKILL.md) [\[p5-paint-animation: SKILL.md\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/skills/p5-paint-animation/SKILL.md)

`p5-paint-animation`의 네트워크 차단은 선언에 그치지 않고 코드로 구현되어 있습니다. 폴더 안의 작은 파일 하나가 브라우저의 모든 요청을 가로채, `about:`, `blob:`, `data:` 프로토콜 외의 요청은 모두 막습니다. 스케치는 입력을 데이터 URL로 받습니다. 선언한 신뢰 경계를 실행 환경이 강제하는 모양입니다.

`x-posting-license`의 규칙에도 배울 점이 있습니다. 프로필 데이터를 신뢰할 수 없는 입력으로 보고, 템플릿에 손으로 값을 넣지 말고 반드시 검증과 이스케이프를 하는 빌드 스크립트를 거치라고 에이전트에게 지시합니다. 외부에서 긁어 온 텍스트가 에이전트를 거쳐 HTML에 들어가는 경로를 하나로 좁힌 것입니다.

예시의 `claim-doc-explainer`에 `vox-explainer`의 한 절이 있었다면, 에이전트는 음성 합성 API를 부르기 전에 "이 단계는 외부 음성 합성 서비스에 안내문 원문을 보내고 비용이 발생합니다. 진행할까요?"라고 물었을 것입니다. 앞의 사례에서 요금과 데이터 전송이 몰래 일어난 문제는 이 한 절로 막을 수 있었습니다.

### 성공 확인도 skill 안에 적는다

다섯 번째 항목, 성공을 확인하는 방법도 세 skill 모두 구체적으로 적어 두었습니다. 이 칸이 비어 있으면 에이전트는 "완성했습니다"라고 말하는 것 외에 끝을 알릴 방법이 없습니다.

`x-posting-license`는 HyperFrames CLI의 검사 명령이 오류 0건으로 통과하고, 결과 MP4가 약 10.3초이며, 약 6.5초에 카드가 뒤집히고 약 9.9초에 화면 밖으로 나가는지를 확인 기준으로 둡니다. [\[x-posting-license: SKILL.md\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/skills/x-posting-license/SKILL.md) `p5-paint-animation`은 마지막 프레임에 그림이 완성되어 있어야 하고, 같은 seed로 다시 실행하면 캔버스가 바이트 단위로 같아야 한다고 적고, 리뷰에 쓴 스모크 테스트 명령까지 그대로 남깁니다. [\[p5-paint-animation: SKILL.md\]](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/skills/p5-paint-animation/SKILL.md)

두 번째 기준이 특히 쓸모 있다고 봅니다. 같은 입력에 같은 결과가 나온다는 것을 확인 기준으로 적어 두면, 리뷰어는 결과물을 눈으로 평가하기 전에 재현성부터 기계적으로 확인할 수 있습니다. 결정적 렌더링을 내세우는 HyperFrames의 성격이 skill의 검증 방법에도 그대로 이어진 셈입니다.

예시의 `claim-doc-explainer`라면 결과 영상의 길이, 마스킹 대상 필드가 화면에 없는지, 같은 안내문으로 다시 만들었을 때 자막 타이밍이 같은지가 그 기준이 될 것입니다.

### 금지 목록과 시험 방법

기여 가이드의 금지 목록도 같은 방향입니다. 난독화되거나 minify되거나 생성된 코드, 설치 시점 실행, 선언하지 않은 다운로드, 조용한 telemetry나 추적이나 데이터 유출, 안전한 기본값과 명시적 확인이 없는 파괴적 동작, 명시적 확인 없는 유료이거나 외부에 보이는 동작, 워크플로에 필요 없는 넓은 파일시스템과 셸과 네트워크 접근, 고정하지 않은 의존성, 인증이나 샌드박스를 약하게 만드는 지시가 들어 있으면 병합하지 않습니다.

AI의 도움을 받은 기여도 환영하지만 모든 지시문과 스크립트의 책임은 제출자에게 있고, 읽고 이해하고 시험하지 않은 동작은 제출하지 말라는 문장도 있습니다.

테스트 방법도 skill의 성격에 맞춰져 있습니다. 그 skill과 문서에 적힌 의존성만 접근할 수 있는 새 에이전트 세션에서 시험하고, 정상 경로와 함께 실패나 취소 경로를 적어도 하나 확인하라고 합니다. 자기완결 규칙을 실제로 검증하는 방법입니다. 예시의 skill이라면 사용자가 음성 합성 비용 안내에 "아니오"라고 답했을 때 skill이 어떻게 끝나는지가 그 실패 경로가 됩니다.

### 사내 skill 저장소에 옮긴다면

보수적인 조직에서 사내 skill 저장소를 만든다면 이 구조를 거의 그대로 가져올 수 있다고 봅니다. 사내 표준 skill과 부서별 실험 skill을 저장소로 나누고, 부수 효과 선언을 필수로 하고, 구조 검사와 비밀 정보 스캔을 CI에 넣는 것입니다.

여기에 사내 환경에 맞는 항목을 더하면 신뢰 경계 절은 이런 모양이 될 것입니다. 아래는 제가 만든 예시입니다.

```text
## 신뢰 경계와 부수 효과 (전체 목록)

- 네트워크: tts.vendor.example (내레이션 생성). 안내문 원문 전송. 호출 전 사용자 확인 필수.
- 자격 증명: TTS_API_KEY (사내 비밀 저장소에서 주입). skill은 키를 파일에 쓰지 않음.
- 비용: 내레이션 1분당 과금. 실행 전 예상 비용을 사용자에게 표시.
- 사내 시스템: 청구 서류 템플릿 조회 API, 읽기 전용 계정.
- 파일 쓰기: 사용자가 지정한 출력 디렉터리 안에만.
- 개인정보: 고객 이름, 증권번호는 렌더링 전 마스킹. 실제 청구 데이터로 시험하지 않음.
- 성공 확인: 출력 MP4 길이 55~65초, 마스킹된 필드가 화면에 없을 것.
```

skill이 사내 시스템에 접속한다면 어느 시스템에 어떤 권한으로 접속하는지가 `SKILL.md`에 적혀 있어야 보안 검토와 감사가 가능합니다. 이 절이 있으면 보안 담당자는 코드 전체를 읽기 전에 무엇을 확인해야 할지 압니다.

### 실패 모드와 비용

- 선언과 실제 동작이 어긋나도 기계는 모릅니다. 선언은 리뷰어가 대조할 기준을 줄 뿐, 대조는 여전히 사람의 일입니다.
- 선언이 길어지면 아무도 읽지 않습니다. "전체 목록"처럼 형식을 고정하고 항목을 짧게 유지하는 편이 낫습니다.
- 외부 서비스가 바뀌면 선언도 바뀌어야 합니다. 신뢰 경계 절의 변경은 PR 설명에 따로 적게 하는 규칙을 두면 리뷰어가 놓치지 않습니다.

## 6. 오늘 바로 적용할 수 있는 순서

1. 지금 쓰는 skill 하나를 골라 폴더만 다른 위치로 복사하고, 새 에이전트 세션에서 동작하는지 확인합니다. 깨진다면 숨은 의존이 있는 것입니다.
2. 그 skill의 `SKILL.md`에 신뢰 경계 절을 추가합니다. 접속하는 호스트와 보내는 데이터, 쓰는 자격 증명, 비용 발생 여부, 파일을 쓰는 위치, 사용자에게 먼저 물어야 하는 단계를 적습니다.
3. skill 저장소가 있다면 폴더 이름과 `name` 필드 일치, 공유 코드 금지, 심볼릭 링크와 바이너리와 자격 증명 파일 금지를 검사하는 스크립트를 CI에 넣고, 워크플로 권한은 읽기 전용으로, action은 커밋 SHA로 고정합니다.
4. 공식 지원하는 skill과 실험적인 skill을 저장소로 나누고, 지원 범위와 위험을 README 첫 화면에 적습니다.
5. skill 변경도 코드 변경처럼 리뷰하고, 승인한 커밋과 병합되는 커밋이 같은지 확인합니다. 업데이트를 받을 때도 차이를 먼저 봅니다.

## 마치며

이 저장소에는 대단한 기술이 들어 있지 않습니다. 폴더 규칙, 설치 명령 몇 줄, 셸 스크립트 하나, PR 양식 하나가 전부에 가깝습니다. 그런데 그 단순한 규칙 덕분에 skill을 하나씩 설치하고, 하나씩 리뷰하고, 하나씩 믿을지 판단할 수 있게 됩니다. skill을 나눠 쓰기 시작하는 팀이라면 내용을 채우기 전에 이 정도의 경계부터 정해 두는 편이 좋다고 봅니다.

## 참고 자료

- [heygen-com/hyperframes-community-skills 저장소](https://github.com/heygen-com/hyperframes-community-skills)
- [README (2026-08-27 커밋)](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/README.md)
- [CONTRIBUTING.md](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/CONTRIBUTING.md)
- [SECURITY.md](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/SECURITY.md)
- [.github/scripts/validate-skills.sh](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/.github/scripts/validate-skills.sh)
- [.github/workflows/validate.yml](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/.github/workflows/validate.yml)
- [.github/pull_request_template.md](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/.github/pull_request_template.md)
- [skills/x-posting-license/SKILL.md](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/skills/x-posting-license/SKILL.md)
- [skills/vox-explainer/SKILL.md](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/skills/vox-explainer/SKILL.md)
- [skills/p5-paint-animation/SKILL.md](https://github.com/heygen-com/hyperframes-community-skills/blob/0e20fd38537454da5da836a149301631918a4b54/skills/p5-paint-animation/SKILL.md)
- [heygen-com/hyperframes README (2026-08-28 커밋)](https://github.com/heygen-com/hyperframes/blob/af1cb1c10da33bade100db8233435c7591b7c0bc/README.md)
- [vercel-labs/skills README (2026-08-27 커밋)](https://github.com/vercel-labs/skills/blob/3dba29adc5013c60c4aabb545b0a8f034377e287/README.md)
- [Anthropic: Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Agent Skills Specification (2026-07-23 보관본)](https://web.archive.org/web/20260723004319/https://agentskills.io/specification)
