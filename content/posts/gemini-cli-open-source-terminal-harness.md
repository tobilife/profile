---
title: "google-gemini/gemini-cli: 오픈소스 터미널 에이전트를 harness로 읽어 봅니다"
date: 2025-08-25
description: "Google이 Apache 2.0으로 공개한 Gemini CLI v0.1.22를 루프, 승인, 셸 제한, 컨텍스트 파일, MCP, 되돌리기, 격리, 기록 관점에서 harness로 뜯어봅니다."
category: 저장소 소개
tags: [오픈소스, 코딩 에이전트, 하네스, MCP, HITL, AI Agent]
draft: false
---

:::note
- Gemini CLI는 Google이 2025년 6월 25일 Apache 2.0으로 공개한 터미널 에이전트이고, 구조는 화면을 맡는 CLI 패키지와 루프와 도구 실행을 맡는 Core 패키지로 나뉩니다.
- 파일을 바꾸거나 셸을 실행하는 도구 호출은 기본적으로 사용자 승인을 거치고, 승인 범위는 approval mode, 셸 명령 허용 목록, MCP 서버별 trust 설정으로 조절합니다.
- 지시 컨텍스트는 `GEMINI.md` 파일을 전역, 프로젝트, 하위 디렉터리 순으로 합쳐 시스템 프롬프트에 넣고, `/memory show`로 실제 내용을 확인할 수 있습니다.
- 되돌리기는 checkpointing, 격리는 sandbox, 기록은 OpenTelemetry 기반 telemetry가 맡습니다. 셋 다 기본값이 꺼져 있으니 켜고 시작해야 합니다.
:::

터미널 에이전트를 비교할 때는 보통 어떤 모델이 붙어 있는지부터 봅니다. 모델이 좋으면 도구도 좋을 것이라는 기대입니다.

그런데 같은 모델이라도 그 모델을 감싼 실행 코드에 따라 결과와 사고의 범위가 달라집니다.

**터미널 에이전트에서 먼저 볼 것은 모델 이름이 아니라, 모델이 낸 도구 호출이 내 파일과 셸에 닿기 전에 무엇을 거치느냐입니다.**

Gemini CLI는 이 부분을 직접 읽어 볼 수 있는 저장소입니다. Google은 2025년 6월 25일 이 도구를 발표하면서, Apache 2.0으로 전부 공개했으니 개발자가 코드를 살펴 동작 방식을 이해하고 보안상의 영향을 검증할 수 있다고 밝혔습니다. [\[Google: Gemini CLI: your open-source AI agent\]](https://blog.google/technology/developers/introducing-gemini-cli-open-source-ai-agent/)

이 글은 2025년 8월 18일에 나온 v0.1.22 태그의 README와 `docs/` 문서를 기준으로 썼습니다. 이 저장소는 빠르게 바뀌고 있으므로, 이후 버전에서는 설정 이름이나 기본값이 다를 수 있습니다.

글 전체에서 하나의 상황을 따라갑니다. Java와 Node.js가 섞인 사내 저장소에서 개발자가 Gemini CLI에게 실패하는 테스트를 고치게 하고, 나중에는 같은 작업을 야간 CI에서 사람 없이 돌리려는 팀입니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 터미널 에이전트에게 "실패하는 테스트를 고쳐 줘"라고 맡겼다고 해봅시다.

에이전트는 테스트를 통과시키는 가장 짧은 길을 찾습니다. 실패하는 테스트 파일을 고쳐 쓰고, 방해가 되는 fixture 디렉터리를 셸 명령으로 지웁니다. 테스트는 통과합니다.

커밋하지 않은 작업이 그 디렉터리에 있었다면 되돌릴 방법이 없습니다. 나중에 팀장이 "누가 이 디렉터리를 지우라고 승인했느냐"고 물어도 답할 기록이 없습니다.

모델의 판단이 아쉬운 것은 맞습니다. 하지만 시스템 설계 관점에서 봐야 할 것은 따로 있습니다.

- 파일을 지우는 명령이 실행되기 전에 사람이 볼 기회가 있었는가.
- 실행된 뒤에 그 직전 상태로 돌아갈 수단이 있었는가.
- 애초에 그 명령이 닿을 수 있는 범위가 제한되어 있었는가.
- 누가 무엇을 승인했는지 남았는가.

승인, 되돌리기, 격리, 기록입니다. 아래에서는 Gemini CLI가 이 네 가지와 그 주변을 어떻게 만들었는지 문서를 따라가 봅니다.

## 1. 루프: 화면과 실행을 나누고, 도구 실행 앞에 승인을 둡니다

`gh api`로 확인한 저장소 생성일은 2025년 4월 17일이고, 주 언어는 TypeScript, 라이선스는 Apache-2.0입니다. 설치 방법은 README에 세 가지가 나옵니다. Node.js 20 이상이 필요합니다. [\[gemini-cli: README (v0.1.22)\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/README.md)

```bash
# 설치 없이 실행
npx https://github.com/google-gemini/gemini-cli

# npm으로 전역 설치
npm install -g @google/gemini-cli

# Homebrew로 전역 설치 (macOS/Linux)
brew install gemini-cli
```

README는 인증 방법을 세 가지로 안내합니다. 개인 Google 계정 OAuth 로그인은 분당 60회, 하루 1,000회 요청까지 무료이고 Gemini 2.5 Pro와 100만 토큰 컨텍스트 창을 씁니다. Gemini API 키는 무료 등급에서 Gemini 2.5 Pro 하루 100회이고, 기업 팀과 운영 작업에는 Vertex AI를 권합니다.

### 한 번의 상호작용에서 일어나는 일

아키텍처 문서는 구성 요소를 둘로 나눕니다. `packages/cli`는 입력 처리, 화면 표시, 이력 관리 같은 사용자 쪽을 맡고, `packages/core`는 Gemini API와의 통신, 프롬프트 구성, 도구 등록과 실행, 세션 상태 관리를 맡습니다. 개별 도구는 `packages/core/src/tools/` 아래 모듈로 있습니다. [\[gemini-cli: Architecture Overview\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/architecture.md)

문서가 설명하는 한 번의 상호작용을 그리면 이렇습니다.

```text
사용자 입력
   |
   v
packages/cli  --(입력 전달)-->  packages/core
                                   |  프롬프트 구성: 대화 이력 + 도구 정의
                                   v
                               Gemini API
                                   |  답변 또는 도구 호출 요청
                                   v
                        core가 요청을 검증
                                   |
                        도구가 파일을 바꾸거나 셸을 실행하는가?
                           | 예                     | 아니오(읽기 전용)
                           v                        v
                 도구와 인자를 보여 주고          확인 없이 실행될 수 있음
                 사용자 승인 요청
                           |
                           v
                  core가 도구 실행 -> 결과를 Gemini API로 반환 -> 최종 응답
                                   |
                                   v
                          packages/cli가 화면에 표시
```

### 도구 호출 하나가 실행되기까지

Core 문서의 Tools API 항목은 이 흐름을 코드 수준으로 한 단계 더 내려가 설명합니다. 모든 도구는 `BaseTool`을 확장하고, 파라미터를 검증하는 `validateToolParams()`, 실행 전에 무엇을 할지 사람이 읽을 수 있게 설명하는 `getDescription()`, 사용자 확인이 필요한지 정하는 `shouldConfirmExecute()`를 구현합니다. [\[gemini-cli: Gemini CLI Core: Tools API\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/core/tools-api.md)

같은 문서가 적은 실행 순서는 이렇습니다.

1. 모델이 도구 이름과 인자를 담은 `FunctionCall`을 돌려줍니다.
2. Core가 이를 파싱하고 `ToolRegistry`에서 해당 도구를 찾습니다.
3. 도구의 `validateToolParams()`로 인자를 검증합니다.
4. `shouldConfirmExecute()`가 확인할 내용을 돌려주면, core가 CLI에 전달해 사용자에게 묻고 그 결정을 받습니다.
5. 검증과 확인을 통과하면 `execute()`를 취소용 `AbortSignal`과 함께 호출합니다.
6. 결과의 `llmContent`는 `FunctionResponse`로 모델에 돌아가고, `returnDisplay`는 화면에 표시됩니다.

마지막 단계가 흥미롭습니다. 도구 결과가 모델에게 가는 내용과 사람에게 보이는 내용으로 처음부터 나뉘어 있습니다. 파일 편집이라면 사람에게는 diff를 보여 주고 모델에게는 사실 위주의 결과를 돌려주는 식으로, 두 사용자에게 서로 다른 화면을 주는 구조입니다.

같은 문서의 내장 도구 설명에는 `ReadFileTool`이 반드시 절대 경로인 `absolute_path` 파라미터를 받는다고 적혀 있습니다. 상대 경로 실수를 파라미터 모양으로 막는 설계가 여기에도 들어 있습니다.

제가 눈여겨본 건 승인이 모델이 아니라 core 쪽 코드에 있다는 점입니다. 모델은 도구 호출을 요청할 뿐이고, 실행 여부는 harness와 사용자가 정합니다. 테스트 수정 상황에서 fixture 디렉터리를 지우는 `rm -rf` 호출은, 기본 설정이라면 실행 전에 명령과 인자가 화면에 뜹니다.

아키텍처 문서는 CLI와 Core를 나눈 이유로 모듈성을 듭니다. 같은 backend에 다른 frontend를 붙일 수 있게 하려는 것입니다. 뒤에서 볼 비대화형 실행과 GitHub Action이 이 분리 위에 있습니다.

### 실패 모드: 읽기는 확인 없이 지나갑니다

아키텍처 문서는 파일 읽기 같은 읽기 전용 작업은 명시적인 확인 없이 진행될 수 있다고 적습니다. 설정 문서의 `autoAccept`를 true로 두면 안전하다고 판단되는 도구 호출의 확인도 건너뜁니다. 기본값은 false입니다. [\[gemini-cli: Configuration\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/cli/configuration.md)

읽기가 확인 없이 지나간다는 것은, 읽힌 내용이 그대로 모델 API로 간다는 뜻이기도 합니다. 그래서 무엇을 읽게 할지는 승인과 별도로 정해야 합니다.

설정 문서의 `fileFiltering.respectGitIgnore`는 기본으로 켜져 있어서 `node_modules/`, `.env` 같은 git 무시 파일을 `@` 명령과 파일 목록 작업에서 제외합니다.

적용 범위가 "`@` 명령과 파일 목록 작업"이라는 단서가 중요하다고 봅니다. 제 해석으로는, 셸 명령으로 `cat .env`를 실행하는 경로는 이 설정이 막는 대상이 아닙니다. 민감한 파일의 실제 차단은 다음 절의 셸 제한과 5절의 sandbox가 맡아야 합니다.

## 2. 도구와 승인 범위: 허용 목록으로 좁히고, 그 한계를 압니다

Tools API 문서가 나열하는 내장 도구는 네 묶음입니다. [\[gemini-cli: Gemini CLI Core: Tools API\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/core/tools-api.md)

| 묶음 | 도구 클래스 | 성격 | 문서에 적힌 확인 |
| --- | --- | --- | --- |
| 파일 시스템 | `LSTool`, `ReadFileTool`, `GrepTool`, `GlobTool`, `ReadManyFilesTool` | 읽기 | 읽기 전용은 확인 없이 진행될 수 있음 |
| 파일 시스템 | `WriteFileTool`, `EditTool` | 쓰기 | 실행 전 사용자 승인 |
| 실행 | `ShellTool` (`run_shell_command`) | 셸 명령 실행 | 실행 전 사용자 승인, sandbox 권장 |
| 웹 | `WebFetchTool`, `WebSearchTool` | 읽기 | 이 글에서 확인하지 않음 |
| 메모리 | `MemoryTool` | 세션을 넘는 저장 | 이 글에서 확인하지 않음 |

확인 열은 아키텍처 문서의 "파일 시스템을 바꾸거나 셸 명령을 실행하는 도구는 도구와 인자를 보여 주고 사용자 승인을 받는다"는 설명과 Tools API 문서의 도구별 설명을 합친 것입니다. 웹과 메모리 도구의 확인 여부는 도구별 문서까지 확인하지 않았으므로 비워 둡니다.

### approval mode: 확인의 범위를 정합니다

확인의 범위는 실행 옵션으로 조절합니다. 설정 문서에 나오는 approval mode는 세 가지입니다. [\[gemini-cli: Configuration\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/cli/configuration.md)

| 모드 | 동작 | 테스트 수정 상황에서 |
| --- | --- | --- |
| `default` | 도구 호출마다 승인을 요청 | 파일 수정과 `rm -rf` 모두 확인 |
| `auto_edit` | 편집 도구(`replace`, `write_file`)는 자동 승인, 나머지는 승인을 요청 | 파일 수정은 통과, `rm -rf`는 확인 |
| `yolo` | 모든 도구 호출을 자동 승인 | 아무것도 확인하지 않음 |

같은 문서에 따르면 `--yolo`나 `--approval-mode=yolo`를 쓰면 sandbox가 기본으로 켜집니다. 승인을 없애는 대신 격리를 강제하는 조합입니다.

테스트 수정 상황에서는 `auto_edit`가 현실적인 선택이라고 봅니다. 코드 편집은 5절의 checkpointing으로 되돌릴 수 있지만, 셸 명령은 되돌릴 수단이 없으니 확인을 남겨 두는 것입니다.

### 셸 명령 제한은 실제로 이렇게 동작합니다

모델에게 보여 줄 도구 자체를 줄이는 설정도 있습니다. `coreTools`는 허용할 내장 도구 목록이고, `excludeTools`는 제외할 목록입니다. 두 목록에 모두 있으면 제외됩니다.

셸 도구 문서는 명령 단위 제한의 규칙을 구체적으로 적습니다. [\[gemini-cli: Shell Tool\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/tools/shell.md)

- `run_shell_command(git)`처럼 괄호 안에 명령을 적어 허용하거나 막습니다. 괄호 없는 `run_shell_command`를 `coreTools`에 넣으면 명시적으로 막지 않은 모든 명령을 허용하는 와일드카드가 됩니다.
- `&&`, `||`, `;`로 이어진 명령은 나눠서 각각 검사하고, 하나라도 허용되지 않으면 전체를 막습니다.
- 접두사 일치 방식입니다. `git`을 허용하면 `git status`도 `git log`도 실행됩니다.
- `excludeTools`를 먼저 검사합니다. 차단 목록에 걸리면 허용 목록에 있어도 거부됩니다.

같은 문서에 따르면 이 도구는 Windows에서는 `cmd.exe /c`로, 다른 플랫폼에서는 `bash -c`로 명령을 실행하고, 하위 프로세스에 `GEMINI_CLI=1` 환경 변수를 넣습니다. 사내 스크립트가 에이전트에서 실행됐는지를 이 변수로 구분할 수 있습니다.

### 문서가 스스로 밝힌 한계

여기서 설정 문서의 경고를 그대로 옮겨 둘 필요가 있습니다. `excludeTools`의 `run_shell_command` 명령 단위 제한은 단순 문자열 매칭이라 쉽게 우회될 수 있고, 보안 장치가 아니므로 신뢰할 수 없는 코드를 안전하게 실행하는 용도로 기대하지 말라는 것입니다. 문서는 `coreTools`로 실행 가능한 명령을 명시적으로 고르는 쪽을 권합니다. [\[gemini-cli: Configuration\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/cli/configuration.md)

차단 목록보다 허용 목록이 안전하다는 오래된 원칙을 문서가 스스로 밝히고 있는 셈입니다.

### 실패 모드: 허용 목록도 접두사입니다

허용 목록으로 바꿔도 접두사 일치라는 점은 남습니다. 제 해석으로는, `run_shell_command(npm)`을 허용하면 `npm test`뿐 아니라 `npm publish`나 임의의 `npm run` 스크립트도 같은 접두사로 통과합니다. `git`을 허용하면 `git push --force`도 마찬가지입니다.

그래서 테스트 수정 상황이라면 `npm`이 아니라 `npm test`, `git`이 아니라 `git status`와 `git diff`처럼 필요한 하위 명령까지 적어 허용하는 편이 낫다고 봅니다. 접두사가 길수록 통과하는 명령의 범위가 좁아집니다. 그래도 이것은 실수를 줄이는 장치이지 격리 장치가 아니므로, 신뢰하기 어려운 코드에서는 sandbox와 함께 써야 합니다.

## 3. 컨텍스트 파일: GEMINI.md는 계층적으로 합쳐져 시스템 프롬프트에 들어갑니다

프로젝트별 지시는 `GEMINI.md`라는 Markdown 파일에 씁니다. 설정 문서는 이 파일을 지시 컨텍스트 또는 메모리라고 부릅니다. [\[gemini-cli: Configuration\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/cli/configuration.md)

### 세 층에서 찾아 이어 붙입니다

읽는 위치는 세 층입니다.

1. 전역: `~/.gemini/GEMINI.md`. 모든 프로젝트의 기본 지시입니다.
2. 프로젝트 루트와 상위: 현재 디렉터리에서 `.git`이 있는 프로젝트 루트 또는 홈 디렉터리까지 올라가며 찾습니다.
3. 하위 디렉터리: 현재 디렉터리 아래를 훑어 컴포넌트별 지시를 찾습니다. `node_modules`, `.git` 같은 흔한 무시 패턴은 건너뛰고, 탐색 범위는 기본 200개 디렉터리이며 `memoryDiscoveryMaxDirs`로 바꿉니다.

찾은 파일은 출처와 경로를 나타내는 구분자와 함께 이어 붙여져 시스템 프롬프트의 일부로 들어갑니다. 더 구체적인 위치의 파일이 일반적인 파일의 내용을 덮거나 보충하고, 화면 아래쪽에는 불러온 컨텍스트 파일 수가 표시됩니다.

테스트 수정 상황이라면 이렇게 나눌 수 있습니다. 아래는 제가 만든 예시입니다.

```text
~/.gemini/GEMINI.md                  개인 기본값: 한국어로 답하기, 커밋은 하지 않기
<repo>/GEMINI.md                     팀 규칙: 테스트 fixture는 지우지 말고 수정할 것,
                                              빌드 명령은 ./gradlew test, npm test
<repo>/batch/GEMINI.md               배치 모듈 규칙: 날짜 계산은 DateUtil만 사용
<repo>/web/GEMINI.md                 화면 모듈 규칙: 금액 표시는 formatKrw() 사용
```

"fixture는 지우지 말 것"이 팀 규칙 파일에 있었다면, 처음 상황의 `rm -rf`는 모델이 고를 가능성 자체가 줄어듭니다. 다만 지시는 확률을 낮출 뿐이고, 막는 것은 2절의 승인과 허용 목록입니다.

### 무엇이 합쳐졌는지 확인할 수 있습니다

실제로 무엇이 합쳐졌는지는 `/memory show`로 확인하고, `/memory refresh`로 다시 읽습니다. 파일 이름은 `contextFileName` 설정으로 바꿀 수 있고 문서는 `AGENTS.md`를 예로 듭니다. `@path/to/file.md` 문법으로 다른 Markdown 파일을 가져올 수도 있습니다.

모델이 실제로 받은 지시를 사용자가 열어 볼 수 있게 한 점이 실용적이라고 봅니다. 컨텍스트 파일이 여러 층에 흩어지면 무엇이 적용됐는지 알기 어려워지기 때문입니다.

### 길어지는 대화를 다루는 설정

컨텍스트가 길어지는 문제에 대한 설정도 같은 문서에 있습니다.

- `chatCompression`: 대화 이력이 모델 토큰 한도의 정해진 비율을 넘으면 압축합니다. 비율은 `contextPercentageThreshold`로 정하고, 문서의 예는 0.6입니다. 명령 문서에 따르면 `/compress`는 전체 대화 컨텍스트를 요약으로 바꿉니다. [\[gemini-cli: CLI Commands\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/cli/commands.md)
- `summarizeToolOutput`: 도구 출력을 `tokenBudget`으로 정한 토큰 예산 안으로 요약합니다. 기본은 꺼져 있고, 이 시점에는 `run_shell_command`만 지원합니다.
- `maxSessionTurns`: 세션의 최대 턴 수입니다. 넘으면 처리를 멈추고 새 대화를 시작합니다. 기본값은 -1, 즉 무제한입니다.

테스트 수정 상황에서 `./gradlew test`의 출력은 수천 줄이 되기 쉽습니다. `summarizeToolOutput`으로 셸 출력에 예산을 두는 것이 이런 경우를 위한 설정입니다.

### 실패 모드: 기본값이 무제한입니다

`maxSessionTurns`의 기본값이 무제한이라는 점은 기억해 둘 만합니다. 루프의 반복 상한은 사용자가 직접 정해야 합니다.

요약에도 대가가 있습니다. `/compress`는 대화 전체를 요약으로 바꾸므로, 앞에서 모델이 확인한 세부 사항이 요약에서 빠지면 그 뒤의 판단은 빠진 정보 위에서 이뤄집니다. 저는 중요한 결정과 규칙은 대화가 아니라 `GEMINI.md` 쪽에 두는 편을 권합니다. 컨텍스트 파일은 요약 대상인 대화 이력과 따로 시스템 프롬프트로 들어가기 때문입니다.

## 4. 확장 지점: MCP 서버, extension, 사용자 정의 명령, 비대화형 실행

내장 도구로 부족하면 MCP 서버를 붙입니다. `settings.json`의 `mcpServers`에 서버를 등록하면 CLI가 접속해 도구를 발견합니다. [\[gemini-cli: MCP servers\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/tools/mcp-server.md)

### MCP 도구가 등록되기까지

MCP 문서는 발견 과정을 단계로 설명합니다. 설정된 서버마다 Stdio, SSE, Streamable HTTP 중 맞는 방식으로 연결하고, 도구 목록을 받아 Gemini API와 호환되도록 스키마를 정리하고 검증한 뒤, 이름 충돌을 해결하며 전역 도구 레지스트리에 등록합니다.

정리 과정도 구체적입니다. 스키마에서 `$schema`, `additionalProperties` 같은 속성을 제거하고, 도구 이름을 API 요건에 맞게 다듬으며 63자를 넘는 이름은 가운데를 `___`로 바꿔 줄입니다. 여러 서버가 같은 이름의 도구를 내놓으면 먼저 등록된 쪽이 원래 이름을 갖고, 나중 것은 `serverName__toolName` 형태로 접두사가 붙습니다.

이 정리가 실제로 의미하는 바는, MCP 서버가 정의한 스키마의 제약 일부가 모델에게 그대로 전달되지 않을 수 있다는 점이라고 봅니다. 서버 쪽에서 입력을 다시 검증해야 하는 이유입니다.

### 서버마다 거는 gate

MCP 문서에서 gate와 관련된 설정은 네 가지입니다.

- `trust`: true로 두면 그 서버의 모든 도구 호출 확인을 건너뜁니다. 기본값은 false이고, 문서는 완전히 통제하는 서버에만 쓰라고 경고합니다.
- `includeTools`: 지정하면 목록에 있는 도구만 모델에게 노출합니다.
- `excludeTools`: 목록에 있는 도구를 숨깁니다. 두 목록에 모두 있으면 제외가 이깁니다.
- `timeout`: 요청 시간 제한입니다. 기본값은 600,000ms, 즉 10분입니다.

확인이 필요한 호출에서 사용자가 고를 수 있는 선택지도 문서에 있습니다. 이번만 실행, 이 도구는 항상 허용, 이 서버는 항상 허용, 취소의 네 가지이고, "항상 허용"을 고르면 도구 단위 또는 서버 단위의 내부 허용 목록에 추가됩니다.

"이 서버는 항상 허용"은 편리하지만, 그 서버가 나중에 쓰기 도구를 추가하면 그 도구도 함께 허용된다는 점을 기억해 둘 만하다고 봅니다.

### Extension과 사용자 정의 명령

Extension은 이런 설정을 디렉터리 하나로 묶어 배포하는 단위입니다. `<workspace>/.gemini/extensions`와 `<home>/.gemini/extensions` 아래의 각 디렉터리에 `gemini-extension.json`을 두면, MCP 서버 구성, 컨텍스트 파일 이름, 제외할 도구를 함께 정의할 수 있습니다. 같은 이름이 두 위치에 있으면 workspace 쪽이 우선합니다. [\[gemini-cli: Extensions\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/extension.md)

Extension의 `commands/` 하위에 TOML 파일을 두면 사용자 정의 명령도 제공합니다. 명령 문서에 따르면 사용자 정의 명령은 `~/.gemini/commands/`나 `<project>/.gemini/commands/`에 두고, `git/commit.toml`은 `/git:commit`이 됩니다. 프롬프트 안의 `{{args}}`는 사용자가 입력한 인자로 바뀌고, `!{...}` 블록 안에서 쓰면 셸 이스케이프가 적용됩니다. 사용자 정의 명령이 셸 명령을 실행하려 할 때는 최종 명령을 보여 주고 확인을 받습니다. [\[gemini-cli: CLI Commands\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/cli/commands.md)

팀이 "실패 테스트 수정"을 자주 한다면, 그 절차를 `/test:fix` 같은 명령으로 묶어 저장소에 두는 것이 지시를 표준화하는 방법이 됩니다.

### 실패 모드: 저장소가 설정을 들고 들어옵니다

Extension 문서에 따르면 CLI는 시작할 때 workspace와 홈 디렉터리 두 곳의 extension을 모두 불러오고, 같은 이름이면 workspace 쪽이 이기며, extension에 정의된 MCP 서버는 `settings.json`의 서버처럼 시작 시 로드됩니다. 설정 문서도 프로젝트의 `.gemini/settings.json`이 사용자 설정을 덮는다고 적습니다.

제 해석으로는, 외부에서 받은 저장소에 `.gemini/` 디렉터리가 들어 있으면 그 안의 MCP 서버 정의와 도구 설정이 그 저장소에서 CLI를 여는 순간 함께 적용될 수 있습니다. 테스트 수정을 위해 처음 보는 오픈소스 저장소를 받아 왔다면, 실행 전에 `.gemini/` 아래를 먼저 읽어 보는 편이 안전합니다. 확인이 남아 있는 한 MCP 도구 호출 앞에서 한 번 더 걸러지지만, `trust: true`로 정의된 서버라면 그 확인도 건너뜁니다.

### 설정은 여섯 층에서 합쳐집니다

조직 단위로 쓸 때 가장 중요한 표는 설정 우선순위라고 봅니다. 설정 문서는 아래 순서로 적용하고, 아래쪽이 위쪽을 덮는다고 설명합니다.

| 순서 | 출처 | 위치 또는 방법 |
| --- | --- | --- |
| 1 | 기본값 | 코드에 하드코딩된 값 |
| 2 | 사용자 설정 | `~/.gemini/settings.json` |
| 3 | 프로젝트 설정 | `<project>/.gemini/settings.json` |
| 4 | 시스템 설정 | Linux `/etc/gemini-cli/settings.json`, Windows `C:\ProgramData\gemini-cli\settings.json` 등 |
| 5 | 환경 변수 | `.env` 파일 포함 |
| 6 | 명령줄 인자 | 실행 옵션 |

문서는 시스템 설정이 사용자와 프로젝트 설정을 덮으므로 기업의 시스템 관리자가 사용자 설정을 통제하는 데 쓸 수 있다고 적습니다. `allowMCPServers` 같은 서버 이름 기반 제한은 문자열 매칭이라 우회될 수 있으니, 관리자라면 `mcpServers` 자체를 시스템 설정 수준에서 정의하라는 권고도 붙어 있습니다.

다만 표에서 보듯 환경 변수와 명령줄 인자가 시스템 설정보다 위에 있습니다. 제 해석으로는, 사용자가 `--yolo`로 실행하면 시스템 설정의 승인 정책보다 실행 옵션이 앞설 수 있습니다. 개발자 PC의 설정만으로 통제를 완결하기는 어렵다는 뜻입니다.

팀 표준을 프로젝트 단위로 묶는 설정을 그려 보면 이런 모양입니다. 키와 도구 이름 표기는 v0.1.22 문서의 예제를 따랐고, 값과 조합은 제가 만든 예시입니다.

```json
{
  "coreTools": [
    "ReadFileTool",
    "GlobTool",
    "run_shell_command(git status)",
    "run_shell_command(git diff)",
    "run_shell_command(npm test)",
    "run_shell_command(./gradlew test)"
  ],
  "checkpointing": { "enabled": true },
  "chatCompression": { "contextPercentageThreshold": 0.6 },
  "summarizeToolOutput": { "run_shell_command": { "tokenBudget": 2000 } },
  "maxSessionTurns": 50,
  "telemetry": { "enabled": true, "target": "local", "logPrompts": false },
  "mcpServers": {
    "internal-docs": {
      "command": "node",
      "args": ["internal-docs-server.js"],
      "trust": false,
      "includeTools": ["search_docs"],
      "timeout": 30000
    }
  }
}
```

### 비대화형 실행에서는 승인할 사람이 없습니다

대화형 화면 없이 쓰는 길도 있습니다. `--prompt`(`-p`) 옵션으로 프롬프트를 넘기면 비대화형 모드로 실행되므로 스크립트에 넣을 수 있습니다. README는 같은 CLI를 GitHub 워크플로에서 돌리는 GitHub Action도 안내합니다. [\[gemini-cli: README (v0.1.22)\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/README.md)

비대화형에서는 승인을 눌러 줄 사람이 없습니다. 그래서 이 경로에서는 허용 목록과 sandbox가 사실상 유일한 gate라고 봐야 합니다.

야간 CI에서 실패 테스트를 고치게 하려는 팀이라면, 저는 이 구성을 권합니다. 에이전트는 sandbox 안에서 브랜치를 만들어 수정하고 테스트만 돌리며, 결과는 PR로만 내보냅니다. 병합은 다음 날 사람이 리뷰한 뒤에 합니다. 승인 gate를 실행 시점에서 PR 리뷰 시점으로 옮기는 것입니다.

## 5. 되돌리기, 격리, 기록: 셋 다 기본값이 꺼져 있습니다

앞의 상황으로 돌아가 봅시다. 승인을 거쳤는데도 결과가 잘못됐다면 필요한 것은 되돌리기입니다.

### Checkpointing: 파일과 대화를 함께 되돌립니다

Checkpointing 문서에 따르면, 파일 시스템을 바꾸는 도구를 승인하면 CLI가 실행 직전에 checkpoint를 만듭니다. 내용은 세 가지입니다. [\[gemini-cli: Checkpointing\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/checkpointing.md)

- 프로젝트 파일 전체의 Git 스냅샷. 홈 디렉터리의 `~/.gemini/history/<project_hash>`에 있는 별도의 shadow 저장소에 커밋되므로 프로젝트의 Git 저장소는 건드리지 않습니다.
- 그 시점까지의 대화 이력.
- 실행하려던 도구 호출.

대화 이력과 도구 호출은 보통 `~/.gemini/tmp/<project_hash>/checkpoints` 아래 JSON 파일로 저장되고, 모든 데이터는 로컬에 남습니다.

`/restore`로 checkpoint를 고르면 파일과 대화가 그 시점으로 돌아가고, 원래의 도구 호출이 다시 제안됩니다. 그대로 다시 실행하거나, 고치거나, 무시할 수 있습니다.

파일 상태와 대화 상태를 함께 되돌린다는 점이 설계의 핵심이라고 생각합니다. 파일만 되돌리면 모델은 여전히 "이미 고쳤다"고 믿는 컨텍스트 위에서 다음 행동을 고르기 때문입니다.

다만 이 기능은 기본적으로 꺼져 있습니다. `--checkpointing` 옵션이나 `settings.json`으로 켜야 합니다.

```bash
gemini --checkpointing
```

명령 문서의 `/chat save`와 혼동하지 않는 것도 중요합니다. `/chat save <tag>`는 대화 상태를 수동으로 저장하고 재개하는 기능이고, 파일 변경 전의 자동 스냅샷은 checkpointing이 맡는다고 문서가 구분합니다.

### 실패 모드: checkpoint가 닿지 않는 곳

Checkpoint는 파일 시스템을 바꾸는 도구를 승인할 때 만들어집니다. 제 해석으로는, 처음 상황의 `rm -rf`처럼 셸 명령으로 지운 경우는 셸 도구가 그 대상에 해당하는지 이 문서만으로는 분명하지 않습니다. 또한 shadow 저장소는 프로젝트 파일의 스냅샷이므로, 데이터베이스나 원격 시스템에 대한 변경은 되돌리지 못합니다.

그래서 저는 셸 명령은 되돌릴 수 없다고 가정하고 승인을 남겨 두는 편을 권합니다. 2절에서 `auto_edit`를 권한 이유와 같습니다.

### Sandbox: 닿을 수 있는 범위를 줄입니다

격리는 sandbox가 맡습니다. Sandbox 문서는 셸 명령이나 파일 수정 같은 위험한 작업을 호스트와 분리하고, 파일 시스템 접근을 프로젝트 디렉터리로 제한하는 것을 목적으로 듭니다. 켜는 방법은 우선순위 순으로 `-s`/`--sandbox` 옵션, `GEMINI_SANDBOX` 환경 변수, `settings.json`의 `"sandbox"` 설정입니다. [\[gemini-cli: Sandboxing\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/sandbox.md)

방식은 두 가지입니다. macOS 전용인 내장 `sandbox-exec` 기반 Seatbelt와, 플랫폼과 관계없이 쓸 수 있는 Docker나 Podman 컨테이너 격리입니다. Seatbelt에는 기본 프로필이 다섯 가지 있습니다.

| 프로필 | 쓰기 | 네트워크 |
| --- | --- | --- |
| `permissive-open` (기본) | 프로젝트 밖 쓰기 제한 | 허용 |
| `permissive-closed` | 프로젝트 밖 쓰기 제한 | 차단 |
| `permissive-proxied` | 프로젝트 밖 쓰기 제한 | 프록시 경유 |
| `restrictive-open` | 엄격한 제한 | 허용 |
| `restrictive-closed` | 최대 제한 | 차단 |

설정 문서에 따르면 컨테이너 방식은 기본으로 `gemini-cli-sandbox` 이미지를 쓰고, 프로젝트 루트의 `.gemini/sandbox.Dockerfile`로 프로젝트에 맞는 이미지를 만들 수 있습니다. Sandbox 문서는 컨테이너 방식이 이미지를 로컬에서 빌드하거나 조직의 레지스트리에 올린 이미지를 쓰도록 요구한다고 적고, 작업이 sandbox 밖 접근을 필요로 해 "Operation not permitted"가 나면 더 느슨한 프로필이나 마운트 추가를 검토하라고 안내합니다.

테스트 수정 상황에서는 컨테이너 sandbox가 맞다고 봅니다. 테스트 실행에 필요한 JDK와 Node.js를 넣은 이미지를 `.gemini/sandbox.Dockerfile`로 고정해 두면, 개발자 PC와 야간 CI가 같은 격리 환경에서 돕니다.

### Telemetry: 누가 무엇을 승인했는지 남깁니다

마지막 질문인 기록은 telemetry가 맡습니다. Telemetry 문서는 이 시스템이 OpenTelemetry 표준 위에 만들어져 호환되는 어느 backend로도 보낼 수 있다고 설명합니다. 기본값은 꺼져 있고(`telemetry.enabled: false`), 대상은 `local`, 프롬프트 기록(`logPrompts`)은 true입니다. [\[gemini-cli: Telemetry\]](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/telemetry.md)

감사 관점에서 눈에 띄는 것은 도구 호출 이벤트입니다. `gemini_cli.tool_call` 이벤트에는 함수 이름, 인자, 소요 시간, 성공 여부와 함께 `decision` 속성이 있고, 값은 accept, reject, auto_accept, modify 중 하나입니다. 처음 상황의 "누가 이 삭제를 승인했느냐"는 질문에 답할 수 있는 필드입니다.

반대로 주의할 점도 있습니다. 사용자 프롬프트 이벤트에는 `logPrompts`가 false가 아니면 프롬프트 원문이 들어갑니다. 고객 정보가 섞일 수 있는 환경이라면, 앞의 예시 설정처럼 `logPrompts`를 끄고 도구 호출 기록만 남기는 편이 맞다고 봅니다.

### 보수적인 엔터프라이즈 IT에서는

개발자 PC에서 도는 도구라 해도, 사내 소스와 내부망에 닿는 이상 통제 항목으로 봐야 한다고 생각합니다.

그 관점에서 이 저장소의 장점은 통제 지점이 설정 파일로 드러나 있다는 것입니다. 허용 도구, MCP 서버의 신뢰 여부, 승인 모드, sandbox, telemetry가 모두 `settings.json`과 실행 옵션에 있고, 시스템 설정 파일이라는 관리자용 층도 있으니 표준 설정을 정해 배포하고 점검하기가 쉽습니다.

반대로 주의할 점도 문서에 그대로 있습니다. 명령 차단 목록과 서버 이름 기반 제한은 보안 장치가 아니고, checkpointing, sandbox, telemetry는 꺼져 있고, 턴 상한은 무제한이며, 실행 옵션이 시스템 설정보다 앞섭니다. 기본 설정 그대로 조직에 들이는 것은 권하기 어렵고, 통제가 꼭 필요한 경로는 개발자 PC가 아니라 CI와 PR 리뷰 쪽에 두는 편이 현실적이라고 봅니다.

## 6. 오늘 바로 적용할 수 있는 순서

1. 설치한 뒤 바로 일을 시키지 말고 `docs/architecture.md`의 상호작용 흐름과 `docs/cli/configuration.md`의 설정 우선순위부터 읽습니다. 승인이 어디에 걸리고 어느 설정이 이기는지 알고 시작하는 편이 좋습니다.
2. `--checkpointing`을 켜고, 연습용 저장소에서 파일을 고치게 한 뒤 `/restore`로 되돌려 봅니다. 셸 명령으로 바꾼 것은 되돌아오는지도 함께 확인합니다.
3. `coreTools`에 실제로 필요한 도구와 셸 명령을 하위 명령까지 적습니다. 차단 목록이 아니라 허용 목록으로 시작하고, approval mode는 `auto_edit`부터 씁니다.
4. 프로젝트 루트에 `GEMINI.md`를 만들어 팀 규칙을 적고, `/memory show`로 모델이 받는 지시 전체를 확인합니다. 읽히면 안 되는 파일이 git 무시 목록에 들어 있는지도 함께 봅니다.
5. MCP 서버를 붙일 때는 `trust`를 false로 두고 `includeTools`로 노출할 도구를 고릅니다. 비대화형으로 돌릴 때는 sandbox를 켜고, telemetry로 도구 호출 기록을 남기며, 결과는 PR로만 내보냅니다.

## 마치며

Gemini CLI는 Gemini 모델에 맞춰 만든 도구이지 범용 에이전트 프레임워크는 아닙니다. 그래도 터미널 에이전트 하나가 어떤 부품으로 이루어지는지 읽어 보기에는 좋은 저장소입니다.

루프는 core에 있고, 승인은 도구 실행 앞에 있고, 지시는 계층적인 파일로 들어가고, 되돌리기는 별도의 Git 저장소가, 격리는 sandbox가, 기록은 telemetry가 맡습니다.

다른 에이전트 도구를 평가할 때도 같은 질문을 던질 수 있습니다. 무엇을 거쳐 실행되고, 무엇으로 되돌리고, 어디까지 닿을 수 있고, 무엇이 남는지입니다.

문서와 코드가 열려 있으니, 답을 추측하지 않고 확인할 수 있다는 점이 이 저장소의 가장 큰 쓸모입니다.

## 참고 자료

- [Gemini CLI: your open-source AI agent (Google, 2025-06-25)](https://blog.google/technology/developers/introducing-gemini-cli-open-source-ai-agent/)
- [google-gemini/gemini-cli README (v0.1.22)](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/README.md)
- [Gemini CLI Architecture Overview (v0.1.22)](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/architecture.md)
- [Gemini CLI Core: Tools API (v0.1.22)](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/core/tools-api.md)
- [Shell Tool (v0.1.22)](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/tools/shell.md)
- [Gemini CLI Configuration (v0.1.22)](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/cli/configuration.md)
- [CLI Commands (v0.1.22)](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/cli/commands.md)
- [MCP servers with the Gemini CLI (v0.1.22)](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/tools/mcp-server.md)
- [Gemini CLI Extensions (v0.1.22)](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/extension.md)
- [Checkpointing (v0.1.22)](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/checkpointing.md)
- [Sandboxing in the Gemini CLI (v0.1.22)](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/sandbox.md)
- [Gemini CLI Telemetry (v0.1.22)](https://github.com/google-gemini/gemini-cli/blob/v0.1.22/docs/telemetry.md)
