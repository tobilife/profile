---
title: "vercel-labs/skills: 에이전트마다 다른 스킬 경로를 명령 한 줄로 맞춘다"
date: 2026-01-29
description: "npx skills CLI가 푸는 문제와 설치 흐름, 코드로 확인한 lock 파일과 텔레메트리의 실제 동작, 고정하지 않는 것을 remotion-dev/skills 사례와 함께 살펴봅니다."
category: 저장소 소개
tags: [Agent Skills, 오픈소스, 코딩 에이전트, 하네스, 영상 생성]
draft: false
---

:::note
- Agent Skills는 형식이 명세로 정리됐지만, 스킬 폴더를 어디에 두어야 하는지는 에이전트마다 다릅니다. `vercel-labs/skills`는 그 경로 표를 CLI 안에 넣어 둔 설치 도구이고, 2주 만에 대상 에이전트가 4개에서 33개가 됐습니다.
- 이 도구가 고정해 주는 것은 하나의 원본 폴더와 각 에이전트 경로의 링크, 경로 탐색 검사, 그리고 출처와 폴더 해시를 적은 lock 파일입니다. 다만 1월 27일 커밋의 코드를 보면 lock 기록은 전역 설치에만 남습니다.
- 고정해 주지 않는 것도 분명합니다. 스킬의 내용은 검토하지 않고, 업데이트 확인은 외부 서버에 의존하며, 텔레메트리는 README의 설명과 코드의 동작이 다릅니다.
- `remotion-dev/skills`는 라이브러리 벤더가 자기 제품의 올바른 사용법을 스킬로 배포하는 방식을 보여 줍니다. 스킬 설치는 의존성 추가와 같은 무게로 다뤄야 합니다.
:::

Agent Skills를 처음 보면 배포는 문제가 아닌 것처럼 보입니다. `SKILL.md`가 든 폴더 하나이니 복사해서 넣으면 끝이라는 생각입니다.

하지만 **형식은 하나로 모였는데 설치 위치는 에이전트 수만큼 갈라져 있고, 설치한 뒤의 추적은 아무도 해 주지 않습니다.**

형식 쪽은 Agent Skills 명세가 정리합니다. 스킬은 최소한 `SKILL.md` 하나를 담은 디렉터리이고, `SKILL.md`는 `name`과 `description`이 필수인 YAML frontmatter와 본문으로 이루어지며, 선택적으로 `scripts/`, `references/`, `assets/` 디렉터리를 둡니다. [\[Agent Skills: Specification\]](https://web.archive.org/web/20260126112236/https://agentskills.io/specification)

위치 쪽은 사정이 다릅니다. `vercel-labs/skills`의 README에는 에이전트별 설치 경로 표가 있는데, 2026년 1월 27일 시점에 이미 30개가 넘는 에이전트가 올라 있습니다. [\[vercel-labs/skills README\]](https://github.com/vercel-labs/skills/blob/f04e7abd4bd5d019a83c320eaeaaf554521dcbeb/README.md)

이 글은 2026년 1월 27일 커밋(`f04e7ab`) 기준의 저장소를 봅니다. README의 설명과 함께 소스 코드를 직접 읽어, 문서에 적힌 것과 코드가 실제로 하는 것을 구분해 정리합니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 보험사 디지털 채널 팀이 React 기반 영상 라이브러리 Remotion으로 상품 안내 영상을 만든다고 해봅시다. 팀원 중 한 명은 Claude Code를, 한 명은 Cursor를, 한 명은 Codex를 씁니다. 이 글은 끝까지 이 팀을 예로 씁니다.

한 명이 Remotion 작업에 쓸 만한 스킬 저장소를 발견하고 폴더를 내려받아 프로젝트의 `.claude/skills/` 아래에 복사합니다. 본인 에이전트는 자막 타이밍과 전환 효과를 훨씬 정확하게 씁니다.

다른 에이전트를 쓰는 동료는 같은 저장소를 받아도 스킬이 보이지 않습니다. 그 에이전트가 찾는 디렉터리가 다르기 때문입니다. 동료는 폴더를 한 번 더 복사합니다.

두 주 뒤 원본 저장소가 규칙 파일을 고칩니다. 복사본 두 벌은 그대로입니다. 누가 어느 시점의 내용을 쓰고 있는지, 원본이 어디였는지 기록도 없습니다. 그리고 준법감시 담당자가 묻습니다. "외부에서 받은 지시문이 에이전트에 들어가 있다는데, 누가 검토했나요?"

시스템 설계 용어로 말하면, **패키지 형식은 있는데 패키지 매니저가 없는 상태**입니다. 빠진 것은 네 가지입니다. 설치 경로 해석, 단일 원본, 출처 기록, 그리고 반입 검토입니다. 앞의 셋은 이 도구가 다루고, 마지막 하나는 다루지 않습니다.

## 1. 문제는 형식이 아니라 배포다: 경로 표를 CLI가 들고 있다

### 2주 동안의 이력

저장소의 커밋 이력과 공개 자료로 이 도구가 자리를 잡은 과정을 정리하면 이렇습니다. [\[vercel-labs/skills 커밋 이력\]](https://github.com/vercel-labs/skills/commits/main/?since=2026-01-14&until=2026-01-27)

| 날짜 | 일 |
| --- | --- |
| 1월 14일 | 저장소 생성. 첫 커밋의 패키지 이름은 `add-skill`(1.0.4), 설명은 OpenCode, Claude Code, Codex, Cursor에 스킬을 설치한다는 것 |
| 1월 16일~18일 | Gemini CLI 등 에이전트 추가, 로컬 경로 설치 지원 |
| 1월 20일 | Vercel changelog가 CLI `skills`와 디렉터리 겸 순위표 skills.sh를 함께 공개 |
| 1월 21일 | git 저장소가 아닌 원격 호스팅 `SKILL.md` 설치 지원 (Mintlify부터) |
| 1월 26일 | 비공개였던 `skills` 저장소를 `add-skill`로 옮겨 합치는 커밋 |
| 1월 27일 | 패키지 이름 `skills` 1.1.8, `add-skill` 명령도 별칭으로 유지. README는 "OpenCode, Claude Code, Codex, Cursor 외 29개"를 지원한다고 적음 |

Vercel은 1월 20일 changelog에서 스킬 패키지를 설치하고 관리하는 CLI `skills`를 공개하면서, 그때까지 이 도구로 스킬이 설치된 에이전트로 amp, antigravity, claude-code, codex, cursor, gemini-cli, github-copilot, windsurf 등을 나열했습니다. 같은 날 공개한 skills.sh는 스킬을 찾고, 범주와 인기도로 둘러보고, 생태계 전반의 사용 통계와 설치 수를 추적하는 곳이라고 소개했습니다. [\[Vercel: Introducing skills\]](https://vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem)

2주 만에 대상 에이전트가 4개에서 33개가 된 셈입니다.

### 경로 표가 이 저장소의 핵심 자산이다

README의 표에서 몇 줄만 옮기면 문제의 모양이 보입니다.

| 에이전트 | `--agent` 값 | 프로젝트 경로 | 전역 경로 |
| --- | --- | --- | --- |
| Claude Code | `claude-code` | `.claude/skills/` | `~/.claude/skills/` |
| Cursor | `cursor` | `.cursor/skills/` | `~/.cursor/skills/` |
| Codex | `codex` | `.codex/skills/` | `~/.codex/skills/` |
| Antigravity | `antigravity` | `.agent/skills/` | `~/.gemini/antigravity/global_skills/` |
| Amp, Kimi Code CLI | `amp`, `kimi-cli` | `.agents/skills/` | `~/.config/agents/skills/` |
| GitHub Copilot | `github-copilot` | `.github/skills/` | `~/.copilot/skills/` |

규칙성이 없습니다. 프로젝트 경로와 전역 경로의 이름이 다른 경우도 있습니다. 사람이 외울 표가 아니라 도구가 들고 있어야 할 표입니다. README는 CLI가 설치된 코딩 에이전트를 자동으로 감지하고, 감지되지 않으면 어느 에이전트에 설치할지 묻는다고 설명합니다.

이 저장소의 핵심 자산은 화려한 기능이 아니라 이 표라고 봅니다. 실제로 이 기간 커밋 이력의 상당수가 새 에이전트 지원을 추가하거나 "README와 package.json을 최신 에이전트 목록으로 갱신"하는 커밋입니다.

### 실패 모드: 표가 틀리면 조용히 안 보인다

경로 표를 도구가 들고 있다는 것은, 표가 틀리면 도구가 틀린다는 뜻이기도 합니다. 1월 26일 커밋 중에는 Antigravity의 전역 스킬 경로를 바로잡는 수정이 있습니다. 그 전에 전역 설치한 사람은 설치가 "성공"했는데 에이전트가 스킬을 읽지 못하는 상황을 겪었을 수 있습니다.

README에는 Kiro CLI 사용자는 설치 후 스킬을 커스텀 에이전트 설정의 `resources`에 직접 추가해야 한다는 안내도 있습니다. 경로에 파일을 놓는 것만으로 모든 에이전트가 스킬을 읽는 것은 아니라는 뜻입니다.

그래서 저는 설치 직후 각 에이전트에서 스킬 목록을 확인하는 단계를 팀 절차에 넣는 편을 권합니다. 예시의 팀이라면 세 사람이 각자 "Remotion 스킬이 보이는가"를 한 번씩 확인하는 것입니다.

## 2. 설치 흐름: 소스 해석, 스킬 탐색, 대상 선택, 링크

### 명령과 옵션

기본 명령은 README에 이렇게 나와 있습니다.

```bash
npx skills add vercel-labs/agent-skills
```

소스는 GitHub 축약형 말고도 여러 형태를 받습니다. 아래도 README의 예입니다.

```bash
# 저장소 안의 특정 스킬 경로
npx skills add https://github.com/vercel-labs/agent-skills/tree/main/skills/frontend-design

# GitLab URL
npx skills add https://gitlab.com/org/repo

# 임의의 git URL
npx skills add git@github.com:vercel-labs/agent-skills.git

# 로컬 경로
npx skills add ./my-local-skills
```

설치 전에 내용을 확인하거나 대상을 좁히는 옵션도 있습니다.

```bash
# 저장소에 어떤 스킬이 있는지 목록만 보기
npx skills add vercel-labs/agent-skills --list

# 특정 스킬만, 특정 에이전트에만
npx skills add vercel-labs/agent-skills --skill frontend-design -a claude-code -a opencode

# 비대화형 (CI/CD 용)
npx skills add vercel-labs/agent-skills --skill frontend-design -g -a claude-code -y
```

`add` 말고도 README가 정리한 명령은 `find`(검색), `check`(업데이트 확인), `update`(갱신), `init`(새 `SKILL.md` 템플릿), `generate-lock`(설치된 스킬을 소스와 맞춰 추적 대상으로 등록)입니다.

### 한 번의 설치가 지나가는 단계

README 설명과 `src/installer.ts`, `src/add.ts`를 함께 읽어 흐름을 그리면 이렇습니다. [\[vercel-labs/skills: installer.ts\]](https://github.com/vercel-labs/skills/blob/f04e7abd4bd5d019a83c320eaeaaf554521dcbeb/src/installer.ts)

```text
소스 인자 (owner/repo, URL, 로컬 경로)
      |
      v
스킬 탐색: 루트의 SKILL.md, skills/, skills/.curated/, .claude/skills/ 등 정해진 위치
           -> 없으면 재귀 탐색
      |
      v
frontmatter 확인: name, description 이 있어야 스킬로 인정
           metadata.internal: true 인 스킬은 INSTALL_INTERNAL_SKILLS=1 일 때만 노출
      |
      v
대상 에이전트: 설치된 에이전트 자동 감지 -> 없으면 선택 요청
      |
      v
범위: 프로젝트(기본) 또는 전역(-g)
      |
      v
경로 안전 검사: 스킬 이름이 기준 디렉터리 밖을 가리키면 중단 (path traversal)
      |
      v
방식: 심볼릭 링크(기본) -> .agents/skills/<이름> 에 원본 복사 후 각 에이전트 경로에 링크
      복사 -> 각 에이전트 경로에 독립 사본
      |
      v
(전역 설치일 때만) ~/.agents/.skill-lock.json 에 출처와 폴더 해시 기록
```

마지막 칸의 괄호가 중요합니다. 3절에서 자세히 봅니다.

### 링크 구조: 원본은 .agents/skills에 하나

`installer.ts`를 보면 심볼릭 링크 방식의 실제 구조가 드러납니다. 스킬을 먼저 `.agents/skills/<스킬 이름>`이라는 정본 위치에 복사하고, 각 에이전트의 스킬 디렉터리에서 그 정본으로 상대 경로 링크를 겁니다. 전역 설치면 이 정본이 홈 디렉터리 아래에, 프로젝트 설치면 프로젝트 아래에 생깁니다.

몇 가지 세부 동작도 코드에 있습니다.

- Windows에서는 디렉터리 링크로 junction을 씁니다.
- 링크 생성이 실패하면 복사로 대체합니다.
- 기존에 깨진 링크나 순환 링크가 있으면 정리한 뒤 다시 만듭니다.
- 스킬 이름이 기준 디렉터리 밖을 가리키면 "path traversal 가능성"을 이유로 설치를 거부합니다.

예시의 팀에 적용하면, 프로젝트 범위로 설치했을 때 저장소에는 `.agents/skills/remotion-best-practices/`라는 원본 하나와, `.claude/skills/`, `.cursor/skills/`, `.codex/skills/` 아래의 링크 세 개가 생깁니다. 앞의 상황에서 복사본 두 벌이 갈라지던 문제가 여기서 풀립니다.

### 범위의 기본값은 프로젝트다

범위의 기본값이 프로젝트라는 점이 마음에 듭니다. README는 프로젝트 범위를 "프로젝트와 함께 커밋되어 팀과 공유되는" 용도로, 전역 범위를 모든 프로젝트에서 쓰는 용도로 설명합니다. 스킬이 저장소 안에 들어오면 코드 리뷰와 변경 이력이라는 기존 통제를 그대로 탑니다. 반대로 전역 설치는 개인 홈 디렉터리에 남아 팀이 볼 수 없으므로, 같은 저장소에서 일하는 두 사람의 에이전트가 서로 다른 지시문을 읽고 있을 수 있습니다. 예시의 팀처럼 결과물을 함께 만드는 경우라면 프로젝트 범위가 기본이어야 한다고 봅니다.

### 설치 뒤에 에이전트가 실제로 보는 것

설치가 끝났다고 스킬 내용이 매번 에이전트의 컨텍스트에 들어가는 것은 아닙니다. 명세가 설명하는 점진적 공개 구조에 따르면, 에이전트가 세션을 시작할 때 읽는 것은 설치된 모든 스킬의 `name`과 `description`뿐입니다. 본문은 모델이 그 설명을 보고 이 작업에 해당 스킬이 필요하다고 판단해 활성화할 때 읽히고, 나머지 파일은 본문이 가리킬 때 읽힙니다.

이 구조에서 두 가지가 따라 나옵니다.

- `description`이 사실상 스킬의 호출 조건입니다. 명세는 이 필드가 스킬이 무엇을 하고 언제 써야 하는지를 설명해야 하며 1,024자 이하라고 정합니다. 설명이 모호하면 필요한 순간에 활성화되지 않고, 너무 넓으면 상관없는 작업에도 끼어듭니다.
- 스킬 수가 늘수록 모든 세션의 시작 컨텍스트가 조금씩 늘어납니다. 스킬 하나당 약 100토큰이라도, 팀이 전역으로 수십 개를 쌓아 두면 매 세션이 그만큼을 먼저 읽고 시작합니다.

명세는 `name`에 대해서도 기계적인 규칙을 둡니다. 1~64자, 소문자와 숫자와 하이픈만, 하이픈으로 시작하거나 끝나지 않고 연속 하이픈 금지, 그리고 상위 디렉터리 이름과 일치해야 한다는 것입니다. 명세는 `skills-ref validate`로 이를 검사하라고 안내합니다. 이 CLI가 확인하는 것은 두 필드의 존재 정도이므로, 사내에서 스킬을 만든다면 명세의 검증 도구를 CI에 따로 거는 편이 낫다고 봅니다.

예시의 팀이라면 Remotion 스킬 하나만 설치했을 때는 문제가 없지만, 디자인, 접근성, 사내 규칙 스킬을 계속 추가하다 보면 서로 설명이 겹쳐 엉뚱한 스킬이 활성화되는 일이 생길 수 있습니다. 설치 목록을 주기적으로 정리하는 것도 하네스 관리의 일부입니다.

### 실패 모드: 링크가 복사로 바뀌는 순간

링크가 실패하면 복사로 대체된다는 동작은 편리하지만, 사용자가 모르는 사이에 "단일 원본"이 깨질 수 있다는 뜻이기도 합니다. 링크를 지원하지 않는 파일시스템이나 권한 환경에서는 에이전트마다 독립 사본이 생기고, 이후 원본을 고쳐도 사본에는 반영되지 않습니다.

저장소에 커밋할 때도 주의가 필요합니다. git은 심볼릭 링크를 링크로 저장하지만, Windows에서 core.symlinks 설정이 꺼져 있는 팀원이 받으면 링크가 일반 텍스트 파일로 보일 수 있습니다. 혼합 OS 팀이라면 설치 후 커밋하기 전에 다른 OS에서 한 번 받아 보는 편이 안전하다고 봅니다.

## 3. 고정하는 것과 고정하지 않는 것을 구분해서 써야 한다

하네스 관점에서 이 도구가 결정적으로 만들어 주는 것과 그렇지 않은 것을 나눠 봅니다.

### 고정하는 것: 출처 기록과 폴더 해시

출처 기록은 `src/skill-lock.ts`에 있습니다. `~/.agents/.skill-lock.json`에 스킬별로 출처, 출처 유형, URL, 저장소 안 경로, 폴더 해시, 설치·갱신 시각을 적습니다. [\[vercel-labs/skills: skill-lock.ts\]](https://github.com/vercel-labs/skills/blob/f04e7abd4bd5d019a83c320eaeaaf554521dcbeb/src/skill-lock.ts)

아래는 그 필드 구성을 보여 주는 예시이고, 값은 제가 채운 것입니다.

```json
{
  "version": 3,
  "skills": {
    "remotion-best-practices": {
      "source": "remotion-dev/skills",
      "sourceType": "github",
      "sourceUrl": "https://github.com/remotion-dev/skills",
      "skillPath": "skills/remotion/SKILL.md",
      "skillFolderHash": "<스킬 폴더의 GitHub tree SHA>",
      "installedAt": "2026-01-28T09:00:00.000Z",
      "updatedAt": "2026-01-28T09:00:00.000Z"
    }
  }
}
```

`skillFolderHash`는 코드 주석에 따르면 스킬 폴더 전체의 GitHub tree SHA이고, 폴더 안의 어떤 파일이 바뀌어도 값이 달라집니다. 설치할 때 GitHub Trees API로 이 값을 가져옵니다. 버전 번호가 아니라 내용 해시이므로, 벤더가 버전을 올리지 않고 파일만 고쳐도 변경을 감지할 수 있습니다.

코드에는 스키마 버전 처리도 있습니다. 현재 버전은 3이고 폴더 해시가 이 버전에서 추가됐으며, 읽은 lock 파일이 이전 버전이면 지우고 새로 시작한다고 주석에 적혀 있습니다. 하위 호환을 포기한 변경이라는 설명도 붙어 있습니다.

이것은 lock 파일을 감사 기록으로 쓰려는 사람에게 중요한 성질입니다. CLI를 새 버전으로 올리는 순간 이전 설치 기록이 사라질 수 있습니다. lock 파일은 "업데이트를 확인하기 위한 작업 상태"이지 "무엇을 언제 어디서 받았는가의 영구 기록"이 아니라고 보는 편이 정확합니다.

출처 유형도 git 저장소만 있는 것이 아닙니다. 1월 21일에 추가된 원격 호스팅 `SKILL.md` 설치는 Mintlify 같은 문서 사이트가 내놓는 단일 파일 스킬을 받습니다. 코드 주석에 따르면 이런 스킬은 파일이 하나뿐이라 서버 쪽에서 내용 해시를 채웁니다. 다만 출처가 git 커밋이 아니라 웹 페이지이므로, 같은 URL의 내용이 이력 없이 바뀔 수 있다는 점은 git 소스와 다릅니다.

### 그러나 lock은 전역 설치에만 남는다

여기서 README만 읽어서는 알기 어려운 동작이 있습니다. `src/add.ts`의 git 소스 설치 경로를 보면, lock 파일에 기록하는 블록 바로 위에 "업데이트 추적을 위해 lock 파일에 추가 (전역 설치에만)"라는 주석이 있고, 실제 조건도 전역 설치일 때만 실행되도록 되어 있습니다. [\[vercel-labs/skills: add.ts\]](https://github.com/vercel-labs/skills/blob/f04e7abd4bd5d019a83c320eaeaaf554521dcbeb/src/add.ts)

즉 1월 27일 커밋 기준으로, 기본값인 프로젝트 범위로 설치한 스킬은 lock 파일에 출처가 남지 않고, 아래의 `check`와 `update` 대상이 되지 않습니다. 해시도 GitHub 소스일 때만 계산되므로, GitLab이나 임의의 git URL로 설치한 스킬은 해시가 비어 있고 `check`에서 "재설치 필요"로 건너뜁니다.

이 사실은 설계 판단을 바꿉니다. 프로젝트 범위로 설치해 커밋하는 팀에게 출처 기록은 이 도구의 lock이 아니라 저장소의 git 이력입니다. 어느 커밋에서 어떤 스킬 파일이 들어왔고 누가 리뷰했는지가 곧 기록입니다.

### check와 update는 외부 서버에 묻는다

전역 설치한 스킬의 업데이트 확인은 이렇게 동작합니다. `src/cli.ts`의 `runCheck`를 읽고 정리한 흐름입니다. [\[vercel-labs/skills: cli.ts\]](https://github.com/vercel-labs/skills/blob/f04e7abd4bd5d019a83c320eaeaaf554521dcbeb/src/cli.ts)

```text
npx skills check
   |
   v
~/.agents/.skill-lock.json 읽기
   |  skillFolderHash 가 없는 항목은 건너뜀 ("재설치 필요")
   v
스킬 이름, 출처, 경로, 폴더 해시 목록을
https://add-skill.vercel.sh/check-updates 로 POST
   |
   v
서버가 현재 해시와 최신 해시를 비교해 업데이트 목록 응답
   |
   v
npx skills update -> 바뀐 스킬을 다시 받아 설치
```

```bash
# 설치한 스킬에 업데이트가 있는지 확인
npx skills check

# 전부 최신으로 갱신
npx skills update
```

업데이트 판정이 Vercel이 운영하는 서버를 거친다는 점은 알아 둘 만합니다. 사내망에서 외부 접속이 막혀 있으면 `check`가 작동하지 않고, 작동한다면 설치한 스킬의 출처 목록이 그 서버로 전송됩니다.

### 검색과 lock 재생성도 skills.sh에 기댄다

외부 서비스에 기대는 명령은 `check`만이 아닙니다. `src/find.ts`를 보면 `npx skills find`는 skills.sh의 검색 API에 질의해 상위 10개 결과를 설치 수와 함께 보여 주고, 사용자가 고르면 그대로 `add` 흐름으로 넘어갑니다. 검색 서버 주소는 `SKILLS_API_URL` 환경 변수로 바꿀 수 있게 되어 있습니다. [\[vercel-labs/skills: find.ts\]](https://github.com/vercel-labs/skills/blob/f04e7abd4bd5d019a83c320eaeaaf554521dcbeb/src/find.ts)

`generate-lock`도 비슷합니다. 디스크에 설치된 스킬 이름을 모아 skills.sh 쪽 데이터베이스와 대조하고, 이름이 정확히 일치한 것만 lock 파일에 추가합니다. 폴더 해시는 이 단계에서 비워 두고 첫 확인 때 서버가 채운다고 주석에 적혀 있습니다. `--dry-run`으로 쓰기 전에 결과를 미리 볼 수 있습니다.

정리하면 명령마다 외부와 닿는 정도가 다릅니다.

| 명령 | 외부 접속 | 사내망에서 |
| --- | --- | --- |
| `add` (로컬 경로, 사내 git) | 소스 저장소, 텔레메트리 | 텔레메트리를 끄면 사내에서 완결 |
| `add` (GitHub 소스, 전역) | GitHub, GitHub API(폴더 해시), 텔레메트리 | GitHub 접근이 필요 |
| `find` | skills.sh 검색 API | 사내 검색 서버로 바꾸지 않으면 쓸 수 없음 |
| `check`, `update` | add-skill.vercel.sh, 소스 저장소 | 외부 허용 없이는 작동하지 않음 |
| `generate-lock` | skills.sh | 공개 목록에 없는 사내 스킬은 일치하지 않음 |
| `init` | 없음 | 그대로 사용 가능 |

이름이 정확히 일치하는 것만 기록한다는 규칙에도 함정이 있다고 봅니다. 사내 스킬 이름이 우연히 공개 스킬 이름과 같다면, 디스크의 사내 스킬이 공개 스킬의 출처로 기록될 수 있습니다. 사내 스킬에는 회사 접두사를 붙이는 식으로 이름 충돌을 피하는 편이 안전합니다.

### 고정하지 않는 것: 스킬의 내용

반대쪽도 분명히 해야 합니다. README에서 확인되는 검증은 frontmatter에 `name`과 `description`이 있는지 정도입니다. 스킬 본문이 에이전트에게 무엇을 시키는지, 딸려 온 스크립트가 무엇을 실행하는지는 이 도구의 관심사가 아닙니다.

Anthropic은 2025년 10월 Agent Skills를 소개한 글에서 이 위험을 직접 적었습니다. 악의적인 스킬이 사용 환경에 취약점을 만들거나 Claude가 데이터를 빼내고 의도하지 않은 행동을 하도록 지시할 수 있으므로, 신뢰할 수 있는 출처의 스킬만 설치하고, 덜 신뢰하는 출처라면 사용 전에 번들된 파일, 특히 코드 의존성과 스크립트, 외부 네트워크 접속을 지시하는 부분을 꼼꼼히 감사하라고 권합니다. [\[Anthropic: Equipping agents for the real world with Agent Skills\]](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

그래서 저는 스킬 설치를 npm 패키지 추가와 같은 무게로 봐야 한다고 생각합니다. 다만 npm 패키지와 달리 실행 주체가 내 권한을 가진 에이전트이고, 지시문은 코드 리뷰 도구가 위험 패턴으로 잡아 주지도 않습니다.

심볼릭 링크와 `update`의 조합도 양면이 있습니다. 한 번의 갱신이 모든 에이전트에 동시에 반영된다는 것은 편리함이면서, 검토하지 않은 변경이 한꺼번에 들어오는 경로이기도 합니다. 갱신 전에 무엇이 바뀌는지 원본 저장소의 diff로 먼저 보는 습관이 필요합니다.

호환성도 완전하지 않습니다. README의 호환성 표는 기본 스킬은 공통으로 작동하지만 `allowed-tools`, `context: fork`, Hook 같은 기능은 에이전트에 따라 지원 여부가 다르다고 표시합니다. `context: fork`는 표에서 Claude Code만, Hook은 Claude Code와 Cline만 지원합니다. 명세에서도 `allowed-tools`는 실험적 필드로 표시되어 있습니다. 스킬이 특정 에이전트의 기능에 기대어 있다면 다른 에이전트에서는 조용히 덜 작동할 수 있습니다.

### 텔레메트리: README와 코드가 다르다

README는 이 CLI가 익명 사용 데이터를 수집하고 개인정보는 수집하지 않으며, CI 환경에서는 자동으로 꺼진다고 밝힙니다. `DISABLE_TELEMETRY`나 `DO_NOT_TRACK` 환경 변수로 끌 수 있다고도 적습니다.

같은 커밋의 `src/telemetry.ts`를 읽으면 한 가지가 다릅니다. 전송을 끄는 조건은 두 환경 변수뿐이고, CI 환경 변수를 감지하면 전송을 멈추는 대신 요청에 CI 표시(`ci=1`)를 붙입니다. 설치 이벤트에는 소스, 스킬 이름, 대상 에이전트 목록이 담겨 `add-skill.vercel.sh`로 보내집니다. [\[vercel-labs/skills: telemetry.ts\]](https://github.com/vercel-labs/skills/blob/f04e7abd4bd5d019a83c320eaeaaf554521dcbeb/src/telemetry.ts)

제가 읽은 범위에서는 CI에서 자동으로 꺼지는 경로를 찾지 못했습니다. 사내망 정책이 엄격한 조직이라면 README의 문장에 기대지 말고 `DISABLE_TELEMETRY`를 명시적으로 설정하는 편이 안전합니다. skills.sh 순위표의 설치 수가 이런 설치 이벤트에서 집계되는 것으로 보이는데, 그렇다면 사내 스킬 저장소 이름이 외부 집계에 들어갈 수 있다는 점도 함께 고려해야 한다고 봅니다.

### 상황별로 설치 방식을 고른다

| 상황 | 권하는 방식 | 이유 |
| --- | --- | --- |
| 팀이 같은 스킬을 함께 쓴다 | 프로젝트 범위 + 커밋 | git 이력이 출처 기록이 되고 리뷰를 거친다 |
| 개인이 여러 프로젝트에서 실험한다 | 전역 범위 | lock 기록과 `check`, `update`를 쓸 수 있다 |
| 사내 git 서버의 스킬 | 프로젝트 범위 + 커밋, 텔레메트리 끔 | 해시 추적과 외부 업데이트 확인이 작동하지 않는다 |
| CI에서 스킬을 설치한다 | `-y`와 고정된 커밋 경로, 텔레메트리 끔 | 매번 같은 내용을 설치하고 외부 전송을 막는다 |
| 링크가 불안정한 환경 | 복사 방식을 명시 | 대체 복사가 조용히 일어나는 것보다 낫다 |

## 4. 사례: remotion-dev/skills, 벤더가 자기 제품의 사용법을 직접 배포한다

### 구조: SKILL.md는 목차, 지식은 규칙 파일에

스킬 설치 도구가 생기면 누가 스킬을 만들어 올리는가가 다음 질문입니다. 흥미로운 답 하나가 라이브러리 벤더입니다.

`remotion-dev/skills`는 Remotion이 2026년 1월 19일에 만든 저장소입니다. 1월 26일 커밋 기준으로 스킬은 하나입니다. [\[remotion-dev/skills\]](https://github.com/remotion-dev/skills/tree/0fd8c6b1fadcd26718a2919bcac705809f8456a3)

구조는 이렇습니다.

```text
skills/remotion/
  SKILL.md                 name: remotion-best-practices
  rules/
    3d.md
    animations.md
    assets.md
    audio.md
    ... (규칙 파일 30개)
    assets/
      charts-bar-chart.tsx
      text-animations-typewriter.tsx
      text-animations-word-highlight.tsx
src/                       Remotion 프로젝트 템플릿
package.json
```

`SKILL.md` 본문은 짧습니다. Remotion 코드를 다룰 때 이 스킬을 쓰라는 안내와, 규칙 파일 각각에 대한 한 줄 설명과 링크가 전부입니다. 3D, 애니메이션, 에셋, 오디오, 자막, 차트, 전환 효과 같은 세부 지식은 각 규칙 파일에 들어 있습니다.

이것은 Agent Skills 명세가 권하는 점진적 공개 구조 그대로입니다. 명세는 `name`과 `description`(약 100토큰)은 시작 시 모든 스킬에 대해 읽히고, `SKILL.md` 본문(5,000토큰 미만 권장)은 스킬이 활성화될 때, `scripts/`, `references/`, `assets/` 같은 나머지 파일은 필요할 때만 읽힌다고 설명합니다. 본문은 500줄 이하로 유지하고, 파일 참조는 `SKILL.md`에서 한 단계 깊이로만 두라고 권합니다.

예시의 팀에서 에이전트는 자막 작업을 할 때 자막 규칙만 읽으면 됩니다. 30개 규칙 전체가 매번 컨텍스트에 들어오지 않습니다.

설치할 때 무엇이 따라오는지도 이 구조에서 정해집니다. CLI는 `SKILL.md`가 있는 디렉터리를 스킬 단위로 보고 그 폴더를 복사하므로, `rules/` 아래의 규칙 파일과 `rules/assets/`의 예제 코드는 함께 오지만 저장소 루트의 `src/` 템플릿 프로젝트는 오지 않습니다. 명세가 파일 참조를 스킬 루트 기준 상대 경로로, 한 단계 깊이로 두라고 권하는 이유가 여기서 실무적으로 드러납니다. 스킬 폴더 밖을 가리키는 참조는 설치된 쪽에서 깨진 링크가 됩니다. 사내 스킬을 만들 때도 참조하는 파일은 모두 스킬 폴더 안에 두는 편이 안전합니다.

### 원본은 제품 코드 옆에 있다

저장소의 성격도 눈여겨볼 만합니다. `package.json`의 repository 항목은 Remotion 본체 모노레포의 `packages/skills`를 가리키고, 커밋 메시지는 전부 "Update template"입니다. 즉 이 저장소는 배포용 사본이고, 원본은 제품 코드와 같은 저장소에서 관리됩니다.

Remotion 문서에도 1월 20일에 스킬 페이지가 추가됐습니다. Claude Code, Codex, Cursor 같은 에이전트에 유용하다는 설명과 함께 설치 명령이 나오고, 새 프로젝트를 만들 때 스킬 추가를 선택할 수 있다는 안내도 있습니다. [\[Remotion 문서: Agent Skills\]](https://github.com/remotion-dev/remotion/blob/4164ce3209eae11ec40a9e16d2e2d457939eba66/packages/docs/docs/ai/skills.mdx)

```bash
npx skills add remotion-dev/skills
```

1월 28일에 보관된 skills.sh 순위표에서 `remotion-best-practices`는 전체 기간 3위, 설치 수 42.8K로 표시되어 있습니다. 1위와 2위는 `vercel-labs/agent-skills`의 스킬입니다. [\[skills.sh 2026-01-28 보관본\]](https://web.archive.org/web/20260128085452/https://skills.sh/)

### 벤더 배포 패턴에서 읽을 것

제가 이 사례에서 읽는 패턴은 이렇습니다. 라이브러리의 올바른 사용법을 가장 잘 아는 쪽은 벤더이고, 그 지식을 제품 코드 옆에서 관리하며 스킬로 내보내는 것이 문서 사이트에 한 번 더 쓰는 것보다 에이전트에게 정확히 닿습니다. 문서의 독자가 사람에서 에이전트로 넓어진 것입니다.

같은 사실의 반대면도 있습니다. 저장소가 만들어진 1월 19일 하루에만 "Update template" 커밋이 여덟 번 있었고, 그 뒤로도 거의 매일 갱신됐습니다. 스킬 내용이 제품 릴리스 주기보다 훨씬 자주 바뀐다는 뜻입니다. 예시의 팀처럼 프로젝트에 커밋해 쓰는 경우, 어느 시점의 스킬을 쓰는지는 팀이 직접 정하고 갱신은 의도적으로 해야 한다고 봅니다.

## 5. 보수적인 조직에서는 사내 저장소, 프로젝트 범위, 커밋 이력이 출발점이다

### 구조는 그대로 쓰고, 기록은 git에 맡긴다

보험이나 금융처럼 외부 코드 반입에 절차가 있는 조직이라면 공개 스킬을 바로 설치하기는 어렵습니다. 그래도 이 도구의 구조는 쓸 수 있다고 봅니다.

소스로 임의의 git URL과 로컬 경로를 받기 때문에 사내 Git 서버의 스킬 저장소를 그대로 가리킬 수 있습니다. 사내 코딩 규칙, 배포 절차, 레거시 시스템의 호출 규약 같은 지식을 스킬로 만들어 한 저장소에서 관리하는 구성이 가능합니다. 작업 중인 스킬은 `metadata.internal: true`로 표시해 기본 목록에서 숨겨 둘 수 있습니다.

그리고 전역이 아니라 프로젝트 범위로 설치해 커밋하면, 스킬 변경이 기존 형상관리와 리뷰 절차 안으로 들어옵니다. 3절에서 봤듯 이 경우 lock 파일은 기록을 남기지 않으므로, 커밋 메시지에 출처 저장소와 커밋 해시를 적는 규칙을 두면 lock이 하던 역할을 git이 대신합니다. 에이전트가 무엇을 읽고 일하는지가 감사 가능한 이력이 됩니다.

외부 공개 스킬을 쓰고 싶다면, 원본을 바로 설치하지 말고 검토를 마친 특정 커밋을 사내 저장소로 미러링한 뒤 그 미러를 소스로 쓰는 편이 반입 절차와도 맞습니다.

예시의 팀이 이 방식을 택한다면 사내 스킬 저장소는 대략 아래 모양이 될 것입니다. CLI의 탐색 위치인 `skills/` 아래에 두었고, 구성은 제가 정한 예시입니다.

```text
company-agent-skills/              # 사내 Git 서버
  skills/
    remotion-best-practices/       # 외부 스킬 미러. 검토한 커밋만 반영
      SKILL.md
      rules/...
      UPSTREAM.md                  # 원본 저장소, 커밋 해시, 검토자, 검토일
    product-video-guidelines/      # 사내 스킬: 상품 안내 영상의 문구·고지 규칙
      SKILL.md
    claims-batch-conventions/      # 사내 스킬: 청구 배치 호출 규약
      SKILL.md                     # metadata.internal: true (작성 중)
  .github/ 또는 CI 설정             # skills-ref validate, 외부 URL 지시문 검사
```

`UPSTREAM.md` 같은 파일을 두는 이유는 3절에서 본 lock 파일의 한계 때문입니다. 출처와 검토 기록을 도구의 작업 상태가 아니라 저장소의 파일과 커밋 이력에 남기면, CLI 버전이 바뀌어도 기록은 그대로 남습니다.

상품 안내 영상처럼 고객에게 나가는 산출물을 만드는 스킬이라면, 사내 스킬에 고지 문구와 표시 규칙을 넣어 두는 것도 생각해 볼 만합니다. 에이전트가 영상 템플릿을 만들 때 그 규칙을 함께 읽게 되기 때문입니다. 다만 반드시 지켜야 하는 규칙이라면 스킬의 지시문에만 두지 말고, 렌더링 파이프라인의 검사로도 확인하는 편이 안전합니다. 스킬은 에이전트가 읽고 따르기로 선택해야 작동하는 지시문이기 때문입니다.

### 반입 검토 체크리스트

제가 외부 스킬 반입 때 확인하는 항목은 이렇습니다.

- `SKILL.md`와 모든 규칙 파일을 사람이 읽었는가. 외부 URL로 접속하거나 파일을 내보내라는 지시가 있는가.
- `scripts/`나 예제 코드가 있다면 무엇을 실행하고 어떤 의존성을 끌어오는가.
- `allowed-tools`처럼 권한에 영향을 주는 필드가 있는가. 우리 에이전트가 그 필드를 지원하는가.
- 출처 저장소와 커밋 해시를 기록했는가. 갱신 시 diff를 다시 검토하는 담당자가 정해져 있는가.
- 설치 환경에서 텔레메트리를 껐는가. 업데이트 확인이 외부 서버로 나가는 것을 허용하는가.

## 6. 오늘 바로 적용할 수 있는 순서

1. 설치하지 말고 목록부터 봅니다. `npx skills add <저장소> --list`로 무엇이 들어 있는지 확인하고, 이때부터 `DISABLE_TELEMETRY`를 설정해 둡니다.
2. 설치할 스킬의 `SKILL.md`, 규칙 파일, 딸린 스크립트를 원본 저장소에서 직접 읽습니다. 에이전트에게 줄 지시문을 내가 먼저 읽는 단계이고, 읽은 커밋 해시를 적어 둡니다.
3. 프로젝트 범위로 설치하고, 원본 하나와 에이전트별 링크가 생겼는지 확인한 뒤 커밋해 리뷰에 올립니다. 커밋 메시지에 출처와 커밋 해시를 남깁니다. 팀원은 각자 에이전트에서 스킬이 보이는지 확인합니다.
4. 갱신은 원본 저장소의 diff를 본 뒤 의도적으로 합니다. 전역 설치한 개인 실험용 스킬만 `npx skills check`와 `update`로 관리합니다.
5. 팀에서 에이전트에게 반복해서 설명하는 작업 하나를 골라 `npx skills init`으로 스킬 초안을 만들어 봅니다. 본문은 목차로 두고 세부 지식은 규칙 파일로 나눕니다.

## 마치며

`vercel-labs/skills`는 복잡한 도구가 아닙니다. 경로 표, 링크, lock 파일이 전부에 가깝습니다.

그런데 그 세 가지가 없어서 스킬이 복사본으로 흩어지고 있었습니다. 표준 형식이 생긴 다음에는 배포 도구가 필요하다는, 패키지 생태계가 늘 밟아 온 순서입니다.

편해진 만큼 검토의 책임은 쓰는 쪽에 남고, 도구가 무엇을 기록하고 어디로 무엇을 보내는지는 README가 아니라 코드에서 확인해야 합니다. 설치 명령이 한 줄이 됐다고 읽어야 할 분량이 줄어든 것은 아닙니다.

## 참고 자료

- [vercel-labs/skills README (2026-01-27 커밋)](https://github.com/vercel-labs/skills/blob/f04e7abd4bd5d019a83c320eaeaaf554521dcbeb/README.md)
- [vercel-labs/skills 커밋 이력 (2026-01-14 ~ 2026-01-27)](https://github.com/vercel-labs/skills/commits/main/?since=2026-01-14&until=2026-01-27)
- [vercel-labs/skills 소스 코드 src/ (2026-01-27 커밋, skill-lock.ts, add.ts, installer.ts, cli.ts, find.ts, telemetry.ts)](https://github.com/vercel-labs/skills/tree/f04e7abd4bd5d019a83c320eaeaaf554521dcbeb/src)
- [Introducing skills, the open agent skills ecosystem (Vercel changelog, 2026-01-20)](https://vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem)
- [Equipping agents for the real world with Agent Skills (Anthropic, 2025-10-16)](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [remotion-dev/skills (2026-01-26 커밋)](https://github.com/remotion-dev/skills/tree/0fd8c6b1fadcd26718a2919bcac705809f8456a3)
- [Remotion 문서: Agent Skills (2026-01-20 커밋)](https://github.com/remotion-dev/remotion/blob/4164ce3209eae11ec40a9e16d2e2d457939eba66/packages/docs/docs/ai/skills.mdx)
- [Agent Skills Specification (2026-01-26 보관본)](https://web.archive.org/web/20260126112236/https://agentskills.io/specification)
- [skills.sh (2026-01-28 보관본)](https://web.archive.org/web/20260128085452/https://skills.sh/)
