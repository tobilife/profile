---
title: "스크립트 오케스트레이션: 제어 흐름은 코드에 두고, 판단만 모델에 맡긴다"
date: 2026-07-14
description: "반복문, 단계, 스키마, 검증을 스크립트가 쥐고 판정과 종합만 모델에 맡기는 오케스트레이션을, 비용 상한과 재개 설계까지 정리합니다."
category: 에이전트 엔지니어링
tags: [오케스트레이션, 하네스, 멀티 에이전트, Claude Code, AI Agent]
draft: false
---

:::note
- 오케스트레이션의 구분선은 에이전트 수가 아니라 계획을 누가 들고 있느냐입니다. 계획이 모델의 컨텍스트에 있으면 목록이 길어질수록 빠지는 항목이 생깁니다.
- 팬아웃, 단계 순서, 결과 스키마, 검증은 코드가 맡고, 항목별 판정과 반박과 종합은 모델이 맡습니다.
- 스크립트 방식은 에이전트를 쉽게 수백 개 띄우므로, 동시 실행 수와 총 호출 수와 단계별 모델 등급을 구조로 묶어야 합니다.
- 길게 도는 스크립트는 중단 후 재개를 전제로 짭니다. 재개는 이어서 실행이 아니라 다시 실행이므로, 부수 효과를 격리하고 멱등하게 만듭니다.
:::

에이전트에게 큰 일을 맡길 때 흔히 이렇게 기대합니다. "똑똑한 모델이 알아서 일을 나누고, 하위 에이전트를 부르고, 끝까지 챙길 것이다."

작은 작업에서는 대체로 맞습니다. 그런데 처리할 항목이 수십, 수백 개로 늘어나면 다른 종류의 문제가 생깁니다.

**모델이 일을 못해서가 아니라, 반복문과 완료 조건이 모델의 컨텍스트 안에 들어 있어서 무너집니다.**

Claude Code 팀은 한 컨텍스트에서 복잡한 작업을 오래 끌 때 나타나는 실패 유형으로 세 가지를 꼽습니다. 일부만 하고 끝났다고 선언하는 agentic laziness, 자기 결과를 기준표보다 후하게 평가하는 self-preferential bias, 여러 턴과 요약을 거치며 원래 목표의 세부 조건을 잃어버리는 goal drift입니다. [\[claude.dev: A harness for every task\]](https://claude.dev/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code/)

OpenAI Agents SDK 문서는 오케스트레이션을 두 갈래로 나눕니다. LLM이 계획하고 결정하게 두는 방식과, 코드로 흐름을 정하는 방식입니다. [\[OpenAI Agents SDK: Agent orchestration\]](https://github.com/openai/openai-agents-python/blob/da3d45c390270b6d0312dbba811b41c65fa83e86/docs/multi_agent.md)

이 글은 두 번째 갈래를 다룹니다. 무엇을 코드로 옮기고 무엇을 모델에 남길지, 그렇게 했을 때 비용과 중단을 어떻게 다룰지입니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 보험 청구 시스템의 백엔드 저장소가 있고, 에이전트에게 이렇게 요청했다고 해봅시다. 이 글 전체에서 쓸 예시입니다.

> src/routes 아래 API 핸들러 200개를 전부 점검해서 인증 검사가 빠진 곳을 찾아 줘.

에이전트는 파일 목록을 만들고, 하위 에이전트를 몇 개씩 불러 점검을 시작합니다. 한참 뒤 "점검을 완료했습니다. 문제 7건을 발견했습니다"라고 보고합니다.

그런데 나중에 세어 보니 실제로 열어 본 파일은 140개였습니다. 중간에 컨텍스트가 요약되면서 남은 목록이 흐려졌고, 에이전트는 충분히 봤다고 판단했습니다. 발견 7건 중 2건은 상위 미들웨어에서 이미 인증을 하고 있던 오탐이었는데, 같은 에이전트가 자기 발견을 다시 확인하면서 그대로 통과시켰습니다.

시스템 설계 관점에서 보면 원인은 분명합니다.

- "200개를 하나도 빠짐없이 돈다"는 판단이 아니라 `for` 문이 할 일인데, 그 반복을 모델의 기억에 맡겼다.
- 몇 개를 봤고 몇 개가 남았는지 세는 주체가 없었다.
- 발견을 만든 쪽이 그 발견을 검증했다.

앞의 Claude Code 글이 agentic laziness의 예로 드는 것도 보안 리뷰 항목 50개 중 35개만 처리하고 끝났다고 하는 경우입니다. [\[claude.dev: A harness for every task\]](https://claude.dev/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code/)

## 1. 구분선은 에이전트 수가 아니라, 계획을 누가 들고 있느냐다

멀티 에이전트를 이야기하면 흔히 에이전트를 몇 개 띄우느냐에 관심이 갑니다. 그런데 결과의 신뢰성을 가르는 것은 개수보다 계획의 위치라고 봅니다.

### 계획이 컨텍스트에 있을 때 일어나는 일

모델이 오케스트레이션을 할 때 한 턴의 흐름은 이렇습니다.

1. 모델이 지금까지의 대화와 결과를 보고 다음에 무엇을 할지 정합니다.
2. 하위 에이전트를 부르거나 tool을 씁니다.
3. 결과가 모델의 컨텍스트에 쌓입니다.
4. 컨텍스트가 차면 하네스가 앞부분을 요약합니다.
5. 1번으로 돌아갑니다.

문제는 4번입니다. "남은 파일 60개의 목록"은 요약 과정에서 "나머지 파일들"로 줄어들기 쉽습니다. 앞의 글이 goal drift를 설명하며 요약 단계마다 정보가 손실되고, 예외 조건이나 "X는 하지 말 것" 같은 제약이 사라질 수 있다고 적은 것이 이 지점입니다. [\[claude.dev: A harness for every task\]](https://claude.dev/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code/)

### 계획을 코드로 옮기면 바뀌는 것

Claude Code 문서는 subagent, skill, agent team, workflow를 한 표에 놓고 비교하는데, 비교의 축이 "누가 계획을 들고 있는가"입니다. [\[Claude Code Docs: Dynamic workflows\]](https://web.archive.org/web/20260710221606/https://code.claude.com/docs/en/workflows)

그 표를 모델 오케스트레이션과 스크립트 오케스트레이션 두 칸으로 줄이면 이렇습니다.

| 항목 | 모델이 오케스트레이션 | 스크립트가 오케스트레이션 |
| --- | --- | --- |
| 다음에 무엇을 실행할지 | 모델이 턴마다 결정 | 스크립트의 분기와 반복 |
| 중간 결과가 쌓이는 곳 | 모델의 컨텍스트 윈도우 | 스크립트의 변수 |
| 반복 가능한 것 | 지시문 또는 작업자 정의 | 오케스트레이션 자체 |
| 규모 | 한 턴에 위임 몇 건 | 실행 한 번에 수십에서 수백 개 |
| 누락을 막는 장치 | 모델의 주의력 | 반복문과 집계 |

문서의 표현대로 workflow는 계획을 코드로 옮기는 것입니다. 반복, 분기, 중간 결과를 스크립트가 들고 있으니 모델의 컨텍스트에는 최종 답만 남습니다. 같은 문서는 계획을 코드로 옮기면 에이전트를 많이 띄우는 것 말고도, 독립된 에이전트가 서로의 발견을 반박하게 하는 식의 반복 가능한 품질 패턴을 적용할 수 있다고 설명합니다.

### 누가 스크립트를 쓰느냐와, 누가 흐름을 쥐느냐

Anthropic이 예전부터 써 온 구분으로 말하면, 미리 정한 코드 경로로 LLM과 tool을 엮는 workflow 쪽으로 한 걸음 옮기는 것입니다. 같은 글은 LLM이 스스로 과정과 tool 사용을 정하는 것을 agent로, 정해진 코드 경로를 따르는 것을 workflow로 구분합니다. [\[Anthropic: Building effective agents\]](https://www.anthropic.com/research/building-effective-agents)

달라진 점은 그 스크립트를 모델이 작업에 맞춰 직접 쓰게 할 수도 있다는 것입니다. Claude Code는 2026년 5월 말에 이 기능을 dynamic workflows라는 이름으로 내놓았습니다. 6월 2일자 소개 글은 이를 "작업마다 맞춤 하네스를 즉석에서 쓰는 것"이라고 설명하고, 모든 경우를 감당해야 해서 일반적일 수밖에 없는 정적 workflow와 대비합니다. [\[claude.dev: A harness for every task\]](https://claude.dev/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code/)

7월 문서 기준으로 workflow는 JavaScript 스크립트이고, `agent()`가 하위 에이전트 하나를 띄우고 `pipeline()`이 목록의 항목마다 하나씩 띄웁니다. 저장하면 `.claude/workflows/`에 `meta` 블록과 스크립트 본문이 남아, 다음 브랜치에서 같은 오케스트레이션을 그대로 다시 돌릴 수 있습니다. [\[Claude Code Docs: Dynamic workflows\]](https://web.archive.org/web/20260710221606/https://code.claude.com/docs/en/workflows)

제가 중요하다고 보는 건 이 둘을 분리해서 생각하는 것입니다. 스크립트를 누가 쓰느냐와, 실행 시점에 누가 흐름을 쥐느냐는 별개의 문제입니다. 모델이 쓴 스크립트라도 일단 실행되면 흐름은 코드가 쥡니다. 그리고 그 스크립트는 사람이 읽고 리뷰할 수 있는 산출물입니다.

### 실패 모드와 쓰지 말아야 할 때

- 다음 단계가 앞 단계 결과를 봐야만 정해지는 탐색형 작업을 스크립트로 묶으면, 스크립트가 미리 정한 분기가 현실과 맞지 않아 엉뚱한 곳을 팝니다.
- 모델이 쓴 스크립트를 읽지 않고 돌리면, 목록을 만드는 첫 단계의 범위가 잘못되었을 때 그 뒤의 수백 개 호출이 전부 엉뚱한 대상을 봅니다. 예시라면 `src/routes`가 아니라 `src`를 통째로 훑는 식입니다.
- 한두 파일 수정 같은 작은 작업에는 과합니다. 조율 비용이 이득보다 큽니다.

## 2. 코드가 맡을 것: 팬아웃, 단계, 스키마, 검증

코드로 옮길 대상은 네 가지라고 봅니다.

### 팬아웃과 barrier

항목 목록을 받아 항목마다 에이전트 하나를 띄웁니다. 각 에이전트는 깨끗한 컨텍스트에서 파일 하나만 봅니다. 몇 개를 띄웠고 몇 개가 돌아왔는지는 코드가 셉니다.

앞의 Claude Code 글은 이 패턴을 fan-out-and-synthesize라고 부르고, 종합 단계는 모든 팬아웃 에이전트를 기다린 뒤 구조화된 출력을 합치는 barrier라고 설명합니다. [\[claude.dev: A harness for every task\]](https://claude.dev/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code/) barrier가 코드에 있으니 "다 돌아왔는가"는 모델의 판단이 아니라 카운터의 값입니다.

### 단계 파이프라인

조사, 실행, 검증처럼 순서가 정해진 단계는 코드가 순서를 강제합니다. 앞 단계의 출력을 변환해서 다음 단계의 입력으로 넘깁니다. OpenAI 문서도 한 에이전트의 출력을 다음 에이전트의 입력으로 바꿔 넘기는 체이닝을 코드 오케스트레이션의 패턴으로 듭니다. [\[OpenAI Agents SDK: Agent orchestration\]](https://github.com/openai/openai-agents-python/blob/da3d45c390270b6d0312dbba811b41c65fa83e86/docs/multi_agent.md)

예시라면 1단계가 파일 목록 확정, 2단계가 파일별 점검, 3단계가 발견별 반박, 4단계가 종합 보고입니다. 2단계가 끝나기 전에 4단계가 시작될 수 없습니다.

### 분모를 만드는 첫 단계

파이프라인에서 가장 신경 써야 할 단계는 첫 단계라고 봅니다. 1단계가 돌려준 목록이 이후 모든 집계의 분모가 되기 때문입니다. 분모가 틀리면 `checked`가 `total`과 같아도 의미가 없습니다.

직접 짠 하네스라면 목록은 glob이나 저장소 색인 같은 결정적 코드로 만드는 편이 낫습니다. 그런데 7월 Claude Code 문서 기준으로 workflow 스크립트 자체는 파일시스템과 셸에 직접 접근할 수 없어서, 문서의 예시도 첫 단계에서 에이전트에게 `src/routes/` 아래 파일 목록을 스키마로 받아 옵니다. [\[Claude Code Docs: Dynamic workflows\]](https://web.archive.org/web/20260710221606/https://code.claude.com/docs/en/workflows)

이런 환경에서는 분모를 만드는 에이전트에게 판단을 맡기지 않는 편이 안전합니다. "중요해 보이는 파일"이 아니라 정해진 glob 명령을 실행해 그 출력을 그대로 돌려주게 하고, 목록의 개수를 보고서 첫 줄에 찍어 사람이 한 번 확인하게 합니다. 예시라면 "대상 200개"가 찍히는지를 먼저 봅니다.

### 결과 스키마

에이전트의 출력을 자유 서술로 받으면 코드가 다음 분기를 결정할 수 없습니다. OpenAI 문서는 코드 오케스트레이션의 첫 번째 패턴으로, 코드가 검사할 수 있는 구조화된 출력을 받아 그 값으로 다음 에이전트를 고르는 방식을 듭니다. [\[OpenAI Agents SDK: Agent orchestration\]](https://github.com/openai/openai-agents-python/blob/da3d45c390270b6d0312dbba811b41c65fa83e86/docs/multi_agent.md)

예시의 점검 에이전트가 돌려줄 스키마는 이 정도면 충분하다고 봅니다. 아래는 제가 만든 예시입니다.

```json
{
  "type": "object",
  "required": ["file", "handlers", "status"],
  "properties": {
    "file": { "type": "string" },
    "status": { "enum": ["checked", "could_not_check"] },
    "handlers": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "auth", "evidence"],
        "properties": {
          "name": { "type": "string" },
          "auth": { "enum": ["present", "missing", "inherited", "unclear"] },
          "evidence": { "type": "string", "description": "판단 근거가 된 코드 위치" }
        }
      }
    }
  }
}
```

`status`에 `could_not_check`가 있고 `auth`에 `unclear`가 있는 점이 중요합니다. 모르는 것을 모른다고 답할 칸이 없으면 모델은 둘 중 하나를 고르게 됩니다. 앞의 사례에서 상위 미들웨어로 인증을 상속받는 경우를 가려낼 `inherited` 칸이 있었다면 오탐 두 건이 처음부터 다른 분류로 갔을 것입니다.

### 적대적 검증

발견 사항을 만든 에이전트가 아닌 다른 에이전트가 기준표에 따라 반박을 시도하게 합니다. 자기 결과를 선호하는 편향을 구조로 피하는 방법입니다. 앞의 Claude Code 글은 이 패턴을 adversarial verification이라고 부르고, 생성된 결과마다 별도의 에이전트가 기준에 비춰 검증하게 하라고 설명합니다. [\[claude.dev: A harness for every task\]](https://claude.dev/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code/)

### 네 가지를 합친 모양

네 가지를 합치면 아래와 같은 모양이 됩니다. 함수 이름은 특정 제품의 API가 아니라 설명을 위해 제가 지은 예시입니다.

```ts
// 예시: 제어 흐름은 코드, 판단은 runAgent 안쪽
const files: string[] = await listFiles("src/routes/**/*.ts"); // 결정적 단계, 모델 없음

const results = await mapWithLimit(files, 8, (file) =>
  runAgent({
    prompt: `${file}의 핸들러마다 인증 검사 여부를 판정하라. 판단할 수 없으면 unclear로 답하라.`,
    schema: FileAudit,            // 스키마에 안 맞으면 null
    maxTurns: 15,
    model: "small",               // 파일 하나 판정은 작은 모델로 시작
  })
);

const unchecked = files.filter((_, i) => results[i] === null || results[i].status !== "checked");

const suspects = results.flatMap((r) => r?.handlers.filter((h) => h.auth === "missing") ?? []);

const confirmed = [];
for (const item of suspects) {
  const verdict = await runAgent({
    prompt: `다음 발견이 틀렸음을 보이려고 시도하라. 상위 미들웨어와 라우터 설정을 확인하라: ${JSON.stringify(item)}`,
    schema: Verdict,              // { refuted: boolean, evidence: string }
    model: "large",               // 반박은 더 강한 모델로
  });
  if (verdict && !verdict.refuted) confirmed.push({ ...item, evidence: verdict.evidence });
}

return { total: files.length, checked: files.length - unchecked.length, unchecked, confirmed };
```

마지막 줄의 `total`, `checked`, `unchecked`를 눈여겨보시기 바랍니다. 앞의 사례에서 없었던 것이 바로 이 세 값입니다. 140개만 봤다면 보고서 첫 줄에 "60개 미점검"이 찍힙니다.

### 실패 모드와 비용

- 스키마를 너무 좁게 잡으면 판단의 여지를 깎아 먹습니다. `present`와 `missing` 두 값만 두면 애매한 경우가 억지로 한쪽에 들어갑니다.
- 적대적 검증은 발견 수만큼 호출을 늘립니다. 발견이 많은 작업에서는 검증 단계가 점검 단계보다 비쌀 수 있습니다. 심각도가 낮은 발견은 표본만 검증하는 식으로 조절할 수 있습니다.
- 반박 에이전트도 모델이라 틀릴 수 있습니다. 반박 결과에도 근거 위치를 요구해서, 사람이 최종 보고를 볼 때 근거를 따라갈 수 있게 해 두는 편이 안전합니다.

## 3. 모델에 남길 것: 분해 기준, 판정, 종합

코드가 흐름을 쥔다고 모델의 역할이 줄지는 않습니다. 자리가 바뀔 뿐입니다.

- 이 핸들러에 인증 검사가 있는가, 상속받는가 (판정)
- 이 발견이 실제 문제인가, 오탐인가 (반박)
- 확인된 발견을 어떤 순서로, 어떤 묶음으로 보고할 것인가 (종합)
- 애초에 무엇을 항목으로 볼 것인가. 파일인가, 핸들러인가, 라우트인가 (분해 기준)

모두 규칙으로 쓰기 어려운 일이고, 모델이 잘하는 일입니다.

### 여섯 가지 패턴에서 코드와 모델의 몫

앞의 Claude Code 글은 workflow가 조합하는 패턴으로 여섯 가지를 듭니다. [\[claude.dev: A harness for every task\]](https://claude.dev/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code/) 각 패턴에서 코드가 쥐는 부분과 모델이 맡는 부분을 나누면 이렇습니다. 오른쪽 칸은 예시의 점검 작업에 적용한 모습입니다.

| 패턴 | 코드가 쥐는 것 | 모델이 맡는 것 | 예시 적용 |
| --- | --- | --- | --- |
| classify-and-act | 분류 결과에 따른 분기 | 분류 | 핸들러를 공개 API, 내부 API, 관리자 API로 분류 후 기준을 달리 적용 |
| fan-out-and-synthesize | 항목별 실행, barrier, 집계 | 항목 판정, 최종 종합 | 파일별 점검 후 보고서 작성 |
| adversarial verification | 발견마다 반박 에이전트 배정 | 반박 시도 | 미들웨어 상속 여부 확인 |
| generate-and-filter | 생성 개수, 중복 제거, 필터 | 생성과 평가 | 수정안 여러 개 생성 후 테스트 통과한 것만 |
| tournament | 대진표와 승자 기록 | 쌍별 비교 판정 | 발견의 심각도 순위 매기기 |
| loop until done | 종료 조건 검사 | 회차별 탐색 | 새 발견이 두 회차 연속 없으면 종료 |

마지막 패턴은 특히 쓸모가 있습니다. Claude Code 문서의 예시에도 테스트를 반복 실행해 간헐적으로 실패하는 테스트를 기록하고, 두 회차 연속 새로 찾은 것이 없으면 멈추는 workflow가 있습니다. [\[Claude Code Docs: Dynamic workflows\]](https://web.archive.org/web/20260710221606/https://code.claude.com/docs/en/workflows) 종료 조건이 코드에 있으니 "충분히 했다"는 판단을 모델이 내리지 않습니다.

### 어느 쪽에 맡길지 고르는 기준

모델에게 흐름까지 맡기는 편이 맞는 경우도 분명히 있습니다. OpenAI 문서는 과제가 열려 있고 LLM의 지능에 기대고 싶을 때 LLM 오케스트레이션이 적합하다고 하고, 코드 오케스트레이션은 속도, 비용, 성능 면에서 더 결정적이고 예측 가능하다고 정리합니다. [\[OpenAI Agents SDK: Agent orchestration\]](https://github.com/openai/openai-agents-python/blob/da3d45c390270b6d0312dbba811b41c65fa83e86/docs/multi_agent.md)

제 기준은 이렇습니다.

| 상황 | 맞는 쪽 | 이유 |
| --- | --- | --- |
| 다음 단계가 앞 단계 결과를 봐야만 정해진다 | 모델 | 분기를 미리 쓸 수 없다 |
| 항목 목록이 있고 전부 처리해야 한다 | 스크립트 | 누락은 반복문이 막는다 |
| 같은 절차를 매주, 매 브랜치마다 반복한다 | 스크립트 | 오케스트레이션 자체가 재사용 대상이다 |
| 결과를 사람이 아니라 다른 시스템이 받는다 | 스크립트 | 출력 형식이 고정되어야 한다 |
| 탐색적 조사, 원인 모를 장애 추적 | 모델 | 가설이 바뀔 때마다 경로가 바뀐다 |
| 큰 탐색 안에 반복 구간이 있다 | 섞는다 | 모델이 탐색하다 목록이 생기면 그 구간만 스크립트로 |
| 한두 파일 수정 같은 작은 작업 | 둘 다 과함 | 단일 에이전트가 낫다 |

마지막 줄이 중요합니다. Claude Code 팀도 workflow가 모든 작업에 필요한 것은 아니고 토큰을 훨씬 많이 쓸 수 있다고 적으면서, 대부분의 전통적인 코딩 작업에는 리뷰어 다섯 명짜리 패널이 필요 없다고 말합니다. 병렬화와 전문화는 조율 비용만큼의 값을 해야 한다는 것입니다. [\[claude.dev: A harness for every task\]](https://claude.dev/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code/)

### 실패 모드

- 분해 기준을 코드에 박아 두면 대상이 바뀔 때 스크립트도 바뀌어야 합니다. 예시에서 파일 하나에 핸들러가 수십 개인 저장소라면 파일 단위 분해가 너무 큽니다. 분해 기준은 첫 단계에서 모델이 제안하고 사람이 확인하게 두는 편이 유연합니다.
- 종합 단계에 모든 원문 결과를 넣으면 종합 에이전트의 컨텍스트가 다시 차서, 1절의 문제가 마지막 단계에서 재현됩니다. 종합에는 스키마로 정리된 결과만 넘깁니다.

## 4. 비용은 프롬프트가 아니라 구조로 묶는다

스크립트 방식은 에이전트를 쉽게 수백 개 띄울 수 있습니다. 그래서 비용 문제가 먼저 옵니다.

### 얼마나 더 드는가

Anthropic은 자사 데이터에서 에이전트가 일반 채팅보다 약 4배, 멀티 에이전트 시스템은 약 15배의 토큰을 쓴다고 밝힌 적이 있습니다. 같은 글은 그래서 멀티 에이전트 시스템은 늘어난 성능만큼의 값어치가 있는 작업에 써야 경제성이 맞는다고 적습니다. [\[Anthropic: How we built our multi-agent research system\]](https://www.anthropic.com/research/multi-agent-research-system)

예시의 점검 작업이라면 파일 200개에 점검 에이전트 200개, 발견마다 반박 에이전트, 종합 에이전트 하나가 붙습니다. "아껴 써라"는 지시로는 이 숫자가 줄지 않습니다. 상한은 런타임과 코드에 걸어야 합니다.

### 런타임이 거는 상한

Claude Code의 workflow 런타임이 2026년 7월 10일 문서 기준으로 걸어 둔 제약이 좋은 참고가 됩니다. [\[Claude Code Docs: Dynamic workflows\]](https://web.archive.org/web/20260710221606/https://code.claude.com/docs/en/workflows)

| 제약 | 문서가 밝힌 이유 |
| --- | --- |
| 동시 실행 에이전트 최대 16개, CPU 코어가 적으면 더 적게 | 로컬 자원 사용을 제한 |
| 실행 한 번에 에이전트 총 1,000개 | 폭주하는 반복을 방지 |
| 스크립트 자체는 파일과 셸에 직접 접근 불가 | 읽고 쓰고 실행하는 것은 에이전트, 스크립트는 조율만 |
| 실행 중 사용자 입력 불가 | 단계 사이에 사람 확인이 필요하면 단계마다 별도 workflow로 분리 |

같은 문서에는 상한 말고도 비용을 드러내는 장치가 있습니다. 에이전트가 25개를 넘게 예약되거나 예상 토큰이 150만을 넘으면 진행 표시에 큰 workflow라는 경고가 뜹니다. 이 경고는 실행을 멈추지 않는 권고입니다. 설정에서 workflow 크기 지침을 작게, 중간, 크게로 정하면 Claude가 쓰는 스크립트의 에이전트 수 목표가 각각 5개, 15개, 50개 미만으로 바뀌는데, 이것도 모델에게 보내는 조언이지 강제는 아니라고 문서가 밝힙니다.

이 구분이 설계에 주는 교훈이 있다고 봅니다. 권고는 모델에게, 상한은 런타임에 둡니다. 권고만 있으면 지켜질 수도 있고 아닐 수도 있지만, 1,000개라는 상한은 스크립트가 무슨 내용이든 넘을 수 없습니다.

### 작게 먼저 돌려 본다

같은 문서는 큰 작업 전에 저장소 전체가 아니라 디렉터리 하나처럼 작은 조각으로 먼저 돌려 지출을 가늠하라고 권합니다. 모든 에이전트가 세션의 모델을 쓰므로 강한 모델이 필요 없는 단계는 작은 모델로 돌리라는 조언도 있습니다.

예시라면 `src/routes/claims` 디렉터리 하나, 파일 20개로 먼저 돌립니다. 파일당 평균 토큰과 발견 비율을 보고 전체 200개의 비용을 추정한 뒤, 반박 단계를 전량으로 할지 표본으로 할지를 정합니다.

### 직접 하네스를 짤 때 넣을 상한

직접 하네스를 짠다면 다음 값은 코드나 설정에 넣는 편이 안전합니다. 아래는 제가 만든 설정 예시입니다.

```yaml
# 예시: 오케스트레이션 실행 한 번의 상한
run:
  max_concurrent_agents: 8        # 동시 실행 수
  max_total_agents: 400           # 실행 한 번의 총 에이전트 수
  max_total_tokens: 3000000       # 초과 시 남은 항목은 unchecked로 기록하고 종료
agent_defaults:
  max_turns: 15
  max_output_tokens: 4000
stages:
  audit:   { model: small, on_schema_error: mark_unchecked }
  refute:  { model: large, sample_if_more_than: 50 }
  report:  { model: large, input: structured_only }
```

`max_total_tokens`에 걸렸을 때의 동작이 중요합니다. 멈추되, 못 본 항목을 `unchecked`로 남기고 끝내야 합니다. 상한에 걸려 조용히 끝나면 앞의 사례와 똑같은 140개짜리 보고서가 나옵니다.

### 권한도 구조의 일부다

비용 말고 권한도 같이 봐야 합니다. Claude Code 문서에 따르면 workflow가 띄운 하위 에이전트는 세션의 권한 모드와 관계없이 `acceptEdits` 모드로 돌고 사용자의 tool 허용 목록을 물려받습니다. 파일 수정은 자동 승인되고, 허용 목록에 없는 셸 명령이나 웹 요청이나 MCP tool은 실행 중에 승인을 물을 수 있습니다. [\[Claude Code Docs: Dynamic workflows\]](https://web.archive.org/web/20260710221606/https://code.claude.com/docs/en/workflows)

예시의 점검 작업은 읽기만 하면 되는 작업입니다. 그런데 하위 에이전트가 수정 권한을 가진 채 수백 개 돈다면, 프롬프트 하나의 실수가 수백 개 파일에 퍼질 수 있습니다. 읽기 전용 작업은 읽기 전용 환경에서 돌리는 편이 낫다고 봅니다.

### 실패 모드와 비용

- 상한을 너무 낮게 잡으면 매번 중간에 끊기고, 재실행 비용이 더 듭니다. 작은 조각으로 측정한 값의 1.5배에서 2배 정도로 잡는 식으로, 측정에 근거해 정하는 편이 낫습니다.
- 단계별 모델 등급을 정하지 않으면 모든 에이전트가 가장 비싼 모델로 돕니다.
- 동시 실행 수를 늘리면 빨라지지만 외부 API의 요청 한도에 먼저 걸립니다. 하위 에이전트가 사내 시스템을 조회한다면 그 시스템의 한도가 실제 상한입니다.

## 5. 길게 도는 스크립트는 재개를 전제로 짠다

에이전트 수백 개를 도는 스크립트는 중간에 멈춥니다. 네트워크가 끊기거나, 한도에 걸리거나, 사람이 멈춥니다. 처음부터 다시 돌리면 이미 쓴 토큰을 또 씁니다.

Anthropic도 리서치 시스템을 운영하며 같은 문제를 적었습니다. 에이전트는 오래 돌고 상태를 가지므로 오류가 나도 처음부터 다시 시작할 수 없고, 그래서 오류가 난 지점에서 재개하는 시스템을 만들고 재시도 로직과 주기적인 체크포인트 같은 결정적 안전장치를 함께 쓴다고 합니다. [\[Anthropic: How we built our multi-agent research system\]](https://www.anthropic.com/research/multi-agent-research-system)

### 재개는 이어서 실행이 아니라 다시 실행이다

이 문제는 에이전트 이전부터 durable execution이라는 이름으로 다뤄 왔습니다.

Temporal은 workflow가 요청한 동작을 Event History에 남기고, 워커가 죽으면 그 기록으로 코드를 다시 실행(replay)해 장애 직전 상태를 복원한 뒤 실패 지점부터 이어 간다고 설명합니다. 외부와 닿는 작업은 Activity로 분리하고, Activity가 실패하면 설정에 따라 자동으로 재시도합니다. [\[Temporal: Understanding Temporal\]](https://web.archive.org/web/20260305054750/https://docs.temporal.io/evaluate/understanding-temporal)

LangGraph 문서는 재개의 함정을 구체적으로 적습니다. 재개는 멈춘 코드 줄에서 이어지는 것이 아니라 적절한 시작점을 찾아 그 지점부터 다시 실행하는 것이므로, 비결정적인 연산과 부수 효과는 task로 감싸 결과를 저장해 두어야 하고, workflow는 결정적이고 멱등하게 설계해야 한다는 것입니다. [\[LangGraph: Durable execution\]](https://web.archive.org/web/20260315083935/https://docs.langchain.com/oss/python/langgraph/durable-execution)

예시의 점검 workflow에 재개를 적용하면 흐름은 이렇습니다.

```text
실행 1:  listFiles ─> audit(f1..f120) 완료, 결과 저장 ─> audit(f121) 진행 중  ✕ 중단
                                                                      
실행 2:  스크립트 처음부터 다시 실행
         listFiles ──> 저장된 결과 반환 (재실행 안 함)
         audit(f1..f120) ──> 저장된 결과 반환
         audit(f121..f200) ──> 실제 실행
         refute(...) ──> 실제 실행
```

스크립트는 처음부터 다시 돌지만, 결과가 저장된 호출은 실행하지 않고 저장값을 돌려줍니다. 그래서 첫 단계인 `listFiles`가 두 번째 실행에서 다른 목록을 돌려주면 안 됩니다. 저장된 결과를 써야 같은 목록 위에서 이어집니다.

### 저장 시점의 선택

얼마나 자주 저장하느냐는 성능과 내구성의 교환입니다. LangGraph는 이를 세 가지 durability 모드로 정리합니다. [\[LangGraph: Durable execution\]](https://web.archive.org/web/20260315083935/https://docs.langchain.com/oss/python/langgraph/durable-execution)

| 모드 | 저장 시점 | 장점 | 잃는 것 |
| --- | --- | --- | --- |
| `exit` | 실행이 끝나거나 interrupt로 멈출 때만 | 가장 빠르다 | 실행 중 프로세스가 죽으면 중간 상태가 없다 |
| `async` | 다음 단계가 도는 동안 비동기로 | 성능과 내구성의 균형 | 저장 중 죽으면 체크포인트가 빠질 수 있다 |
| `sync` | 다음 단계 시작 전에 동기로 | 모든 체크포인트가 남는다 | 단계마다 지연이 붙는다 |

에이전트 호출 하나가 수십 초에서 수 분 걸리는 오케스트레이션에서는 저장 지연이 상대적으로 작습니다. 그래서 에이전트 호출 단위로는 동기 저장을 해도 부담이 크지 않다고 봅니다.

### 원칙 셋

에이전트 오케스트레이션에 옮기면 원칙은 셋입니다.

1. 에이전트 호출 하나를 결과가 저장되는 단위로 다룹니다. 끝난 호출은 재개 시 저장된 결과를 돌려줍니다.
2. 스크립트 본문에는 현재 시각이나 난수처럼 실행마다 달라지는 값을 직접 두지 않습니다. 필요하면 그 값을 만드는 것도 저장되는 단계로 감쌉니다.
3. 에이전트가 외부에 쓰는 동작(메일, 결제, 배포, 티켓 생성)은 같은 키로 두 번 실행해도 한 번만 반영되게 합니다.

예시의 점검 작업이 발견마다 이슈 트래커에 티켓을 만든다면 3번이 문제가 됩니다. 반박 단계 도중 멈췄다가 재개하면 같은 발견의 티켓이 두 번 생길 수 있습니다. 파일 경로와 핸들러 이름으로 만든 키를 티켓에 붙이고, 같은 키가 있으면 새로 만들지 않게 해야 합니다.

### 제품의 재개 범위를 확인한다

Claude Code의 workflow도 멈춘 실행을 재개하면 이미 끝난 에이전트는 저장된 결과를 돌려주고 나머지만 실제로 실행합니다. 다만 7월 10일 문서 기준으로 재개는 같은 Claude Code 세션 안에서만 되고, workflow가 도는 중에 Claude Code를 종료하면 다음 세션에서는 처음부터 다시 시작합니다. [\[Claude Code Docs: Dynamic workflows\]](https://web.archive.org/web/20260710221606/https://code.claude.com/docs/en/workflows)

세션을 넘는 재개가 필요한 작업, 예를 들어 밤새 돌고 아침에 이어 가야 하는 작업이라면 이 경계를 알고 설계해야 합니다. 그런 작업은 Temporal 같은 durable execution 엔진이나, 체크포인트를 외부 저장소에 두는 프레임워크 위에 올리는 편이 맞습니다.

### 배치 시스템을 해 본 분에게

보험이나 금융의 배치 시스템을 해 본 분에게는 낯설지 않은 이야기입니다. 처리 단위를 나눠 재처리 가능하게 만드는 것, 입력 건수와 처리 건수와 오류 건수를 대사하는 것, 같은 전문이 두 번 들어와도 한 번만 반영하는 것은 야간 배치에서 늘 하던 일입니다.

에이전트가 들어온다고 그 규율이 사라지지 않습니다. 오히려 단계 안쪽이 비결정적이 된 만큼 바깥쪽 규율이 더 필요해진다고 봅니다. 배치의 처리 건수 대사표가 스크립트의 `total`, `checked`, `unchecked`와 같은 역할을 합니다.

### 실패 모드와 비용

- 모든 단계를 저장하면 저장소 비용과 지연이 늘어납니다. 모델 호출이나 외부 호출처럼 다시 하기 비싸거나 위험한 단계만 저장 단위로 잡습니다.
- 스크립트를 고친 뒤 재개하면 저장된 결과와 새 코드가 맞지 않을 수 있습니다. 코드가 바뀌었으면 재개보다 새 실행이 안전합니다.
- 재개 직후에는 외부 상태가 멈추기 전과 다를 수 있습니다. 오래 멈춰 있었다면 쓰기 직전에 대상 상태를 다시 읽어야 합니다.

## 6. 오늘 바로 적용할 수 있는 순서

1. 지금 에이전트에게 맡기는 작업 중 "목록을 전부 처리"하는 것을 하나 고릅니다.
2. 목록 만들기와 반복을 코드로 빼고, 항목 하나를 처리하는 부분만 에이전트에게 남깁니다. 목록 만들기는 가능하면 모델 없이 합니다.
3. 에이전트 출력에 스키마를 정하고, 모른다고 답할 칸을 넣습니다. 스키마에 안 맞는 응답은 실패로 셉니다.
4. 마지막에 전체 건수, 처리 건수, 미처리 목록을 코드가 출력하게 하고, 발견은 다른 에이전트가 반박하게 합니다.
5. 동시 실행 수, 총 호출 수, 총 토큰 상한과 단계별 모델 등급을 넣고, 작은 조각으로 한 번 돌려 비용을 확인한 뒤 전체에 적용합니다. 외부에 쓰는 단계에는 멱등 키를 붙입니다.

## 마치며

모델이 오케스트레이션을 잘하느냐 못하느냐는 핵심이 아닙니다. 빠짐없이 도는 것, 순서를 지키는 것, 건수를 맞추는 것은 원래 코드가 더 잘하는 일입니다. 그 부분을 코드로 옮기면 모델은 판정과 반박과 종합에 집중할 수 있고, 결과는 다시 돌려도 같은 구조로 나옵니다. 다만 쉽게 많이 띄울 수 있는 만큼 상한과 재개 방식을 먼저 정해 두어야 합니다.

## 참고 자료

- [Claude Code Docs: Orchestrate subagents at scale with dynamic workflows (2026-07-10 보관본)](https://web.archive.org/web/20260710221606/https://code.claude.com/docs/en/workflows)
- [claude.dev: A harness for every task: dynamic workflows in Claude Code](https://claude.dev/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code/)
- [OpenAI Agents SDK: Agent orchestration (2026-03-01 커밋)](https://github.com/openai/openai-agents-python/blob/da3d45c390270b6d0312dbba811b41c65fa83e86/docs/multi_agent.md)
- [LangGraph: Durable execution (2026-03-15 보관본)](https://web.archive.org/web/20260315083935/https://docs.langchain.com/oss/python/langgraph/durable-execution)
- [Temporal: Understanding Temporal (2026-03-05 보관본)](https://web.archive.org/web/20260305054750/https://docs.temporal.io/evaluate/understanding-temporal)
- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)
- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/research/multi-agent-research-system)
