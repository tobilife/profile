---
title: "오케스트레이션 패턴: 에이전트를 늘리기 전에 오케스트레이터의 책임부터 정한다"
date: 2026-03-16
description: "네 가지 오케스트레이션 패턴을 비교하고, 오케스트레이터가 맡을 분해, 예산, 정지 조건, 병합을 예제 하나로 따라갑니다."
category: 에이전트 엔지니어링
tags: [오케스트레이션, 멀티 에이전트, 하네스, AI Agent, 가드레일]
draft: false
---

:::note
- 패턴 이름보다 먼저 정할 것은 분해, 예산, 정지 조건, 병합을 누가 책임지는지입니다.
- 하위 작업을 실행 전에 나열할 수 있으면 코드가 흐름을 쥐는 pipeline이나 fan-out으로 풀고, 나열할 수 없을 때만 orchestrator-workers를 씁니다.
- worker에게는 한 줄 지시가 아니라 목표, 범위, 출력 schema, 한도, 막혔을 때의 행동이 담긴 명세를 넘기고, 한도는 런타임이 강제합니다.
- 결과는 파일로 남기고 schema 검증, 충돌 검사, 작성자와 분리된 검증을 거친 뒤에 합칩니다.
:::

"에이전트 하나로 부족하면 여러 개를 붙이면 된다"는 말을 자주 듣습니다.

틀린 말은 아닙니다. 여러 에이전트가 나눠 일하면 한 context window에 담기지 않는 일을 처리할 수 있습니다. Anthropic은 Claude Opus 4를 lead로, Claude Sonnet 4를 subagent로 둔 멀티 에이전트 구성이 단일 Opus 4 에이전트보다 내부 research eval에서 90.2% 높은 성과를 냈다고 밝혔습니다. [\[Anthropic: How we built our multi-agent research system\]](https://www.anthropic.com/engineering/multi-agent-research-system)

같은 글은 값도 적어 두었습니다. 자사 데이터에서 에이전트는 일반 chat보다 약 4배, 멀티 에이전트 시스템은 약 15배의 token을 쓴다고 합니다.

**오케스트레이션에서 풀어야 할 문제는 에이전트를 몇 개 띄우느냐가 아니라, 나눈 일과 쓴 돈과 멈출 시점과 합친 결과를 누가 책임지느냐입니다.**

Anthropic의 다른 글도 가장 단순한 해법에서 시작하고, 단순한 방법이 부족할 때만 여러 단계의 agentic 시스템을 더하라고 권합니다. [\[Anthropic: Building effective agents\]](https://www.anthropic.com/engineering/building-effective-agents)

이 글에서는 예제 하나를 끝까지 들고 갑니다. 경쟁 서비스 12곳의 요금제를 조사해 비교표를 만드는 에이전트입니다. 패턴 선택, 작업 명세, 한도, 병합을 차례로 이 예제에 적용해 보겠습니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 경쟁 서비스 12곳의 요금제를 조사해 비교표를 만드는 에이전트를 만든다고 해봅시다. 영업팀이 다음 주 회의에 쓸 표입니다.

lead 에이전트가 worker 12개를 띄우고 각각에게 "A사 요금제 조사해 줘" 같은 한 줄을 넘깁니다.

돌아온 결과는 이렇습니다. 어떤 worker는 월 요금을, 어떤 worker는 연 결제 시의 월 환산 요금을 적었습니다. 두 worker는 같은 리뷰 사이트를 반복해서 읽었습니다. 한 worker는 로그인 화면에 막힌 채 같은 검색을 수십 번 되풀이했습니다. 또 다른 worker는 엔터프라이즈 요금제까지 조사하느라 다른 worker의 세 배를 썼습니다.

lead는 받은 요약을 그대로 이어 붙여 표를 만들고 "완료했습니다"라고 보고합니다. 표의 한 칸에는 리뷰 사이트에서 본 작년 가격이 들어가 있습니다. 청구된 비용은 예상의 몇 배입니다.

이 상황을 모델의 능력 탓으로 돌리기는 어렵습니다. 시스템 설계로 보면 네 가지가 비어 있었습니다.

- worker에게 넘긴 작업 명세에 목표, 출력 형식, 범위가 없었습니다.
- worker 수, turn, 비용에 상한이 없었고, 상한에 닿았을 때 무엇을 할지도 정해지지 않았습니다.
- 서로 다른 형식의 결과를 합치는 규칙이 없었습니다.
- 합친 결과를 작성자가 아닌 쪽이 확인하는 단계가 없었습니다.

아래에서는 먼저 패턴 선택을 정하고(1절), 이어서 이 네 가지 중 명세, 상한, 병합과 검증을 오케스트레이터의 책임으로 하나씩 봅니다(2~4절). 마지막 5절은 금융·보험 IT의 시각입니다.

## 1. 패턴 선택: 흐름을 코드가 쥘지 모델이 쥘지부터 정한다

오케스트레이션 패턴은 여러 이름으로 불리지만 첫 갈림길은 하나입니다. 다음에 무엇을 할지를 코드가 정하느냐, 모델이 정하느냐입니다.

### 네 가지 패턴은 결정권의 위치로 갈린다

OpenAI Agents SDK 문서는 오케스트레이션을 LLM에게 결정을 맡기는 방식과 코드로 흐름을 정하는 방식으로 나눕니다. 그리고 코드 쪽이 속도, 비용, 성능 면에서 더 결정적이고 예측 가능하다고 설명합니다. [\[OpenAI Agents SDK: Agent orchestration\]](https://github.com/openai/openai-agents-python/blob/f58faa3524a89e856723c832be20ae2115aa8abe/docs/multi_agent.md)

같은 문서는 코드 쪽 방법으로 세 가지를 듭니다. 한 에이전트의 출력을 다음 에이전트의 입력으로 바꿔 잇는 chaining, 작업하는 에이전트와 평가하는 에이전트를 평가자가 통과시킬 때까지 `while` loop로 돌리는 방식, 그리고 `asyncio.gather` 같은 Python 기본 도구로 여러 에이전트를 병렬로 돌리는 방식입니다.

Anthropic은 같은 구분을 workflow와 agent라는 이름으로 씁니다. workflow는 미리 정해 둔 코드 경로로 LLM과 도구를 조율하고, agent는 LLM이 스스로 과정과 도구 사용을 결정합니다. [\[Anthropic: Building effective agents\]](https://www.anthropic.com/engineering/building-effective-agents)

이 글에서는 네 가지로 나눠 보겠습니다.

| 패턴 | 흐름을 쥐는 쪽 | 맞는 일 | 흔한 실패 | 꼭 붙일 통제 |
| --- | --- | --- | --- | --- |
| pipeline | 코드 | 단계가 고정된 일 | 앞 단계 오류가 뒤로 번짐 | 단계 사이 gate |
| fan-out + 검증 | 코드 | 서로 독립인 하위 작업 | 형식 불일치, 일부 실패 묵살 | 출력 schema, 부분 실패 규칙 |
| orchestrator-workers | 모델 | 하위 작업을 미리 알 수 없는 일 | 중복 작업, 빈틈, 비용 | 작업 명세, worker와 예산 상한 |
| judge/critic loop | 코드 또는 모델 | 평가 기준이 분명한 반복 개선 | 끝나지 않는 loop, 자기 승인 | 최대 round, 독립된 평가자 |

pipeline은 Anthropic 글의 prompt chaining에 해당합니다. 각 LLM 호출이 앞 호출의 출력을 처리하고, 중간 단계마다 프로그램으로 확인하는 gate를 둘 수 있습니다. 글은 이 패턴이 작업을 고정된 하위 작업으로 깔끔하게 나눌 수 있을 때 맞고, 지연을 내주는 대신 정확도를 얻는 선택이라고 설명합니다.

fan-out은 같은 글의 parallelization 가운데 sectioning입니다. 독립된 하위 작업을 병렬로 돌리고 결과를 프로그램으로 모읍니다. orchestrator-workers는 중앙의 LLM이 작업을 동적으로 나누고 worker에게 맡긴 뒤 결과를 종합하는 패턴이고, 필요한 하위 작업을 예측할 수 없을 때 맞는다고 소개됩니다.

### 판단 기준: 하위 작업을 실행 전에 나열할 수 있는가

저는 패턴을 고를 때 다음 순서로 묻는 편이 실수가 적다고 봅니다.

- 하위 작업의 목록을 실행 전에 적을 수 있는가. 적을 수 있다면 모델에게 분해를 맡길 이유가 없습니다.
- 하위 작업 사이에 순서 의존이 있는가. 있다면 pipeline, 없다면 fan-out입니다.
- 결과의 합격 기준을 코드나 별도의 평가자가 판정할 수 있는가. 판정할 수 있을 때만 judge loop가 의미가 있습니다.
- 하위 작업들이 같은 context를 공유해야 하는가. 공유해야 한다면 나누지 않는 편이 낫습니다.

마지막 질문은 Anthropic의 research 글이 직접 다룹니다. 모든 에이전트가 같은 context를 공유해야 하거나 에이전트 사이 의존이 많은 영역은 지금의 멀티 에이전트 시스템에 맞지 않다고 하고, 대부분의 코딩 작업은 research보다 진짜로 병렬화할 수 있는 부분이 적다고 덧붙입니다. [\[Anthropic: How we built our multi-agent research system\]](https://www.anthropic.com/engineering/multi-agent-research-system)

### 예제에 적용하면: 요금제 조사는 fan-out이었다

앞의 요금제 조사는 조사 대상 12곳이 처음부터 정해져 있습니다. 회사들 사이에 순서 의존도 없습니다. 출력도 "사용자당 월 요금, 통화, 결제 주기, 출처"처럼 칸이 정해진 표입니다.

이 조건이면 하위 작업 분해를 모델에게 맡길 이유가 없습니다. 코드가 12개 작업을 만들어 병렬로 돌리고, 결과를 schema로 검사하고, 표로 합치면 됩니다. orchestrator-workers가 아니라 fan-out과 검증으로 충분한 일이었다고 봅니다.

모델이 결정해야 할 것이 하나 남는다면 "이 회사의 공식 가격 페이지는 어디인가" 정도입니다. 그것은 worker 안에서 풀 일이지 오케스트레이터가 풀 일이 아닙니다.

### 실패 모드와 비용: 모델에게 흐름을 맡길 때 잃는 것

모델이 흐름을 쥐면 유연해지는 대신 세 가지를 잃습니다.

첫째는 비용의 예측 가능성입니다. 몇 개의 worker가 뜰지, 각자 몇 번 도구를 부를지가 실행 시점에 정해집니다.

둘째는 공유된 판단입니다. Cognition은 작업을 나눠 subagent에게 맡기는 구조가 깨지기 쉽다고 지적하면서, Flappy Bird를 만들라는 과제를 배경과 새로 나눴더니 한쪽은 Super Mario 같은 배경을, 다른 쪽은 게임과 어울리지 않는 새를 만든 예를 듭니다. 그 글의 원칙은 두 가지입니다. context는 개별 메시지가 아니라 전체 trace로 공유하고, 행동에는 암묵적인 결정이 담기므로 서로 충돌하는 결정은 나쁜 결과를 낳는다는 것입니다. [\[Cognition: Don't Build Multi-Agents\]](https://cognition.com/blog/dont-build-multi-agents)

셋째는 재현성입니다. Anthropic은 에이전트가 같은 프롬프트로도 실행마다 다른 결정을 내려 디버깅이 어렵다고 적었습니다. [\[Anthropic: How we built our multi-agent research system\]](https://www.anthropic.com/engineering/multi-agent-research-system)

그래서 저는 orchestrator-workers를 기본값이 아니라 마지막 선택지로 둡니다. 하위 작업을 예측할 수 없다는 사실이 확인됐을 때만 꺼내는 편이 안전하다고 봅니다.

### 모델이 흐름을 쥘 때도 최종 답의 소유자는 정한다

모델에게 흐름을 맡기기로 했다면, 그 안에서도 한 가지는 미리 정해야 합니다. 최종 답을 누가 쥐느냐입니다.

OpenAI Agents SDK 문서는 자주 쓰는 두 방식을 나란히 놓습니다. agents as tools는 manager 에이전트가 대화의 주도권을 유지한 채 전문 에이전트를 도구처럼 호출하는 방식이고, 한 에이전트가 최종 답을 책임지거나 여러 전문가의 출력을 합치거나 공통 guardrail을 한곳에서 적용하고 싶을 때 맞는다고 설명합니다. handoff는 triage 에이전트가 대화를 전문 에이전트에게 넘기고, 넘겨받은 쪽이 그 turn의 나머지를 맡는 방식입니다. [\[OpenAI Agents SDK: Agent orchestration\]](https://github.com/openai/openai-agents-python/blob/f58faa3524a89e856723c832be20ae2115aa8abe/docs/multi_agent.md)

이 글의 관심사로 옮기면 agents as tools는 병합과 검증의 책임이 manager 한곳에 모이는 구조이고, handoff는 그 책임이 넘겨받은 에이전트에게 옮겨 가는 구조입니다. 요금제 표처럼 여러 결과를 합쳐 하나의 산출물을 내야 하는 일이라면, 저는 앞의 방식이 책임 소재를 설명하기 쉽다고 봅니다.

## 2. 분해: worker에게 넘기는 것은 한 줄 지시가 아니라 작업 명세다

패턴을 정하면 다음은 일을 나누는 방식입니다. fan-out이든 orchestrator-workers든, worker가 받는 입력의 품질이 결과의 품질을 정합니다.

### 명세에는 다섯 칸이 있어야 한다

Anthropic은 Research 기능을 만들며 겪은 일을 구체적으로 적었습니다. 처음에는 lead가 "반도체 부족을 조사하라" 같은 짧은 지시를 넘겼는데, subagent들이 과제를 다르게 해석하거나 다른 subagent와 똑같은 검색을 했다고 합니다. 한 subagent는 2021년 자동차 반도체 위기를 조사했고, 두 subagent는 똑같이 2025년 공급망을 조사했다는 예가 나옵니다. [\[Anthropic: How we built our multi-agent research system\]](https://www.anthropic.com/engineering/multi-agent-research-system)

그 글이 내린 결론은 subagent마다 목표, 출력 형식, 사용할 도구와 출처에 대한 안내, 분명한 작업 경계가 필요하다는 것입니다. 상세한 작업 설명이 없으면 에이전트가 일을 중복하거나 빈틈을 남긴다고 합니다.

저는 여기에 한 칸을 더합니다. 막혔을 때 무엇을 할지입니다. 앞의 예에서 로그인 화면에 막힌 worker가 같은 검색을 되풀이한 것은 그 칸이 비어 있었기 때문입니다.

| 칸 | 담는 내용 | 비어 있으면 생기는 일 |
| --- | --- | --- |
| objective | 무엇을 확인해야 끝나는가 | 과제를 다르게 해석 |
| boundaries | 하지 않을 일 | 범위가 넓어지고 비용이 늘어남 |
| sources | 근거로 써도 되는 곳과 안 되는 곳 | 낡거나 신뢰할 수 없는 출처 사용 |
| output_schema | 돌려줄 필드와 형식 | 병합 단계에서 형식 불일치 |
| on_blocked | 막혔을 때의 행동 | 같은 시도를 반복 |

### 명세를 데이터로 두면 코드가 검사할 수 있다

저는 이 다섯 칸을 프롬프트 문장이 아니라 구조화된 명세로 두는 편이 안전하다고 봅니다. 명세가 데이터면 worker를 띄우기 전에 코드로 검사할 수 있기 때문입니다.

```json
{
  "task_id": "pricing-07",
  "objective": "G사 팀 요금제의 사용자당 월 요금을 공식 가격 페이지에서 확인한다",
  "boundaries": ["엔터프라이즈 요금제는 다루지 않는다", "리뷰 사이트는 근거로 쓰지 않는다"],
  "sources": { "allow": ["g-company.example/pricing"], "deny": ["리뷰 사이트", "커뮤니티 글"] },
  "output_schema": {
    "price_per_seat": "number",
    "currency": "string",
    "billing_cycle": "monthly | annual",
    "source_url": "string",
    "checked_at": "date"
  },
  "limits": { "max_tool_calls": 10, "max_turns": 15 },
  "on_blocked": "status를 blocked로, 사유를 reason에 적어 돌려주고 재시도하지 않는다"
}
```

위 JSON은 예시입니다. 핵심은 `boundaries`와 `on_blocked`입니다. 하지 않을 일과 막혔을 때의 행동을 적지 않으면 worker는 그 빈칸을 스스로 채웁니다.

명세가 데이터이면 오케스트레이터는 worker를 띄우기 전에 다음을 확인할 수 있습니다.

```python
# 예시: worker를 띄우기 전에 명세 묶음을 검사한다
def check_specs(specs: list[dict]) -> list[str]:
    problems = []
    targets = [s["objective_target"] for s in specs]   # 예: 회사 이름
    dupes = {t for t in targets if targets.count(t) > 1}
    if dupes:
        problems.append(f"같은 대상을 둘 이상의 worker가 맡음: {sorted(dupes)}")
    for s in specs:
        for key in ("boundaries", "output_schema", "limits", "on_blocked"):
            if not s.get(key):
                problems.append(f"{s['task_id']}: {key} 비어 있음")
    return problems   # 비어 있지 않으면 worker를 띄우지 않는다
```

이 검사는 중복 작업과 빈 칸을 실행 전에 잡습니다. 모델이 명세를 만들었든 사람이 만들었든 같은 검사를 통과해야 합니다.

### 역할 분리: 계획하는 쪽과 일하는 쪽을 나눈다

역할을 나누는 일도 분해에 속합니다. Cursor는 수백 개의 에이전트를 한 프로젝트에 동시에 돌린 실험을 공개했습니다. [\[Cursor: Scaling long-running autonomous coding\]](https://cursor.com/blog/scaling-agents)

처음에는 모든 에이전트가 동등한 지위로 공유 파일을 보며 스스로 조율하게 했습니다. 같은 작업을 두 에이전트가 잡지 않도록 lock을 썼는데, 에이전트가 lock을 너무 오래 쥐거나 풀지 않는 일이 생겼고, lock이 제대로 돌아갈 때도 병목이 되어 20개의 에이전트가 2~3개 수준의 처리량으로 느려졌다고 합니다. lock을 optimistic concurrency control로 바꾸자 더 단순하고 견고해졌지만, 위계가 없으니 에이전트들이 어려운 일을 피하고 작고 안전한 변경만 했다고 적었습니다.

다음 구조는 역할 분리였습니다. planner는 코드베이스를 탐색하며 작업을 만들고 필요하면 하위 planner를 띄웁니다. worker는 받은 작업만 끝내고 다른 worker와 조율하지 않습니다. 한 주기 끝에 judge가 계속할지 판단하고, 다음 주기는 새로 시작합니다. 글은 이 구조가 조율 문제 대부분을 풀었다고 설명합니다.

요금제 예제에 옮기면 planner는 코드이고, worker는 12개, judge는 병합 뒤의 검증 단계입니다. worker들은 서로를 볼 필요가 없습니다. 명세가 각자의 경계를 정해 주기 때문입니다.

### 실패 모드: 명세로도 전달되지 않는 것, 그리고 과한 구조

명세가 모든 것을 해결하지는 않습니다. Cognition의 지적처럼 행동에는 암묵적인 결정이 담깁니다. 요금제 조사에서 "부가세 포함 가격인가"를 명세에 적지 않았다면, worker마다 다르게 판단하고 그 판단은 결과의 숫자에만 남습니다. [\[Cognition: Don't Build Multi-Agents\]](https://cognition.com/blog/dont-build-multi-agents)

그래서 저는 명세의 `output_schema`에 판단의 근거를 남기는 필드를 하나 두는 편을 권합니다. 예를 들어 `price_note`에 "부가세 별도라고 페이지에 표기"를 적게 하면, 병합 단계에서 서로 다른 판단을 찾아낼 수 있습니다.

반대쪽 실패도 있습니다. Cursor는 구조가 너무 적으면 에이전트가 충돌하고 일을 중복하고 방향을 잃지만, 구조가 너무 많으면 깨지기 쉬워진다고 적었습니다. 품질 관리와 충돌 해결을 위해 integrator 역할을 만들었다가 해결한 것보다 많은 병목을 만들어 걷어 냈다는 이야기도 있습니다. [\[Cursor: Scaling long-running autonomous coding\]](https://cursor.com/blog/scaling-agents)

명세의 칸을 계속 늘리는 것도 같은 함정입니다. 저는 실패가 실제로 관찰된 칸만 더하는 편이 낫다고 봅니다.

## 3. 예산과 정지 조건: 멈추는 규칙은 프롬프트가 아니라 런타임에 둔다

분해가 끝나면 얼마나 쓰고 언제 멈출지를 정해야 합니다. 이 부분은 프롬프트에 적어 두기 쉽지만, 프롬프트에만 있으면 지켜지지 않습니다.

### token이 성능을 사는 구조

Anthropic은 멀티 에이전트가 성능을 내는 주된 이유를 문제를 푸는 데 충분한 token을 쓰게 해 주기 때문이라고 설명합니다. BrowseComp 평가에서 세 요인이 성능 분산의 95%를 설명했고, 그중 token 사용량 하나가 80%를 설명했으며, 나머지 두 요인은 도구 호출 수와 모델 선택이었다고 합니다. [\[Anthropic: How we built our multi-agent research system\]](https://www.anthropic.com/engineering/multi-agent-research-system)

이 숫자는 양날입니다. 더 많이 쓰면 성능이 오르니, 상한이 없으면 시스템은 계속 더 쓰는 쪽으로 기웁니다. 같은 글이 과제의 가치가 늘어난 비용을 감당할 만큼 높아야 경제성이 있다고 덧붙인 이유라고 봅니다.

### 프롬프트의 규칙과 런타임의 한도는 다르다

같은 글은 노력의 크기를 프롬프트에 규칙으로 넣었다고 밝힙니다. 단순 사실 확인은 에이전트 1개와 도구 호출 3~10회, 직접 비교는 subagent 2~4개와 각각 10~15회, 복잡한 조사는 그보다 많은 subagent를 쓰는 식입니다.

이런 규칙은 필요하지만 안내일 뿐입니다. 모델이 규칙을 어겨도 실행은 계속됩니다. 그래서 상한은 런타임이 강제해야 합니다.

프레임워크들은 이미 그 장치를 갖고 있습니다.

- OpenAI Agents SDK의 runner는 LLM 호출, 도구 실행, handoff를 반복하는 loop를 돌고, `max_turns`를 넘으면 `MaxTurnsExceeded` 예외를 던집니다. [\[OpenAI Agents SDK: Running agents\]](https://github.com/openai/openai-agents-python/blob/f58faa3524a89e856723c832be20ae2115aa8abe/docs/running_agents.md)
- 같은 문서에 따르면 `error_handlers`에 `max_turns` 처리기를 넘기면 예외 대신 통제된 최종 출력을 돌려줄 수 있고, 그 출력을 대화 기록에 넣을지도 `include_in_history`로 정할 수 있습니다.
- LangGraph는 그래프가 정지 조건에 닿기 전에 최대 step 수에 도달하면 `GRAPH_RECURSION_LIMIT` 오류를 내고, 복잡한 그래프라면 호출할 때 `recursion_limit`을 높여 넘기라고 안내합니다. [\[LangGraph: GRAPH_RECURSION_LIMIT\]](https://github.com/langchain-ai/docs/blob/d5c997c78dc6de5cf690b8bc39bf4a3763890446/src/oss/langgraph/errors/GRAPH_RECURSION_LIMIT.mdx)

LangGraph 문서가 이 오류의 흔한 원인으로 두 노드가 서로를 가리키는 순환을 예로 든 점은 기억해 둘 만합니다. step 상한은 비용 통제이기도 하지만 설계 오류를 드러내는 경보이기도 합니다.

### 한도에 닿았을 때의 동작까지 적는다

한도를 두는 것만으로는 반쪽입니다. 닿았을 때 무엇을 하는지가 함께 정해져야 합니다. 아래는 요금제 예제에 맞춘 실행 한도의 예시입니다.

```yaml
# 예시: 오케스트레이터 실행 한도 (요금제 비교표)
run:
  max_workers: 12              # 대상 수와 같게, 그 이상은 띄우지 않는다
  max_turns_per_worker: 15
  max_tool_calls_per_worker: 10
  max_judge_rounds: 2
  budget_usd: 3.00
  wall_time_minutes: 20
on_limit:
  worker_turns: return_partial      # 부분 결과와 사유를 돌려준다
  worker_blocked: mark_and_skip     # 표의 해당 칸을 '확인 불가'로 둔다
  judge_rounds: escalate_to_human   # 통과 처리하지 않고 사람에게 넘긴다
  budget: stop_and_report           # 남은 worker를 취소하고 지금까지의 결과를 보고
report:
  include: [completed, partial, blocked, skipped, spent_usd]
```

제가 중요하다고 보는 건 `on_limit`입니다. 한도에 닿았을 때 조용히 통과시키는 시스템은 미완료를 완료로 보고하게 됩니다. 비교표의 12칸 가운데 2칸이 "확인 불가"로 나오는 편이, 12칸이 모두 채워졌지만 2칸이 틀린 표보다 낫다고 봅니다.

OpenAI SDK의 `error_handlers`는 이 생각을 코드로 옮길 자리를 줍니다. 처리기에서 "턴 한도 안에 끝내지 못했다"는 최종 출력을 만들고 `include_in_history=False`로 두면, 실패 사실은 호출자에게 전달하면서 대화 기록은 오염시키지 않을 수 있습니다. [\[OpenAI Agents SDK: Running agents\]](https://github.com/openai/openai-agents-python/blob/f58faa3524a89e856723c832be20ae2115aa8abe/docs/running_agents.md)

### 실행 전에 최악의 비용을 계산해 둔다

상한을 정했으면 그 곱으로 최악의 경우를 계산할 수 있습니다. 요금제 예제라면 worker 12개가 각자 도구 호출 10회를 모두 쓰고 judge가 2 round를 모두 도는 경우가 상한입니다.

이 계산은 정확할 필요가 없습니다. 중요한 것은 실행 전에 한 번 해 본다는 사실입니다. 상한을 곱한 값이 `budget_usd`보다 훨씬 크다면, 예산 한도가 실제로는 worker 한도보다 먼저 걸린다는 뜻입니다. 그 경우 어떤 worker가 실행되지 못하고 남는지, 그 순서를 누가 정하는지까지 정해 두어야 합니다.

저는 이 계산 결과를 실행 기록의 첫 줄에 남기는 편을 권합니다. 나중에 "왜 예상보다 많이 나왔는가"를 따질 때, 처음 추정과 실제 지출을 나란히 놓고 볼 수 있기 때문입니다.

### 실패 모드: 너무 낮은 한도, 끝나지 않는 judge

한도에도 실패 모드가 있습니다.

한도가 너무 낮으면 모든 worker가 부분 결과로 끝납니다. 이때 한도를 올리기 전에 명세를 먼저 봐야 합니다. worker가 한도에 닿는 이유가 과제가 어려워서인지, 경계가 없어 범위를 넓히고 있어서인지는 다릅니다.

judge loop는 따로 설계해야 합니다. 평가자가 통과시킬 때까지 `while` loop를 도는 구조는 문서에 나오는 정석이지만, 평가자가 끝내 통과시키지 않는 경우가 있습니다. [\[OpenAI Agents SDK: Agent orchestration\]](https://github.com/openai/openai-agents-python/blob/f58faa3524a89e856723c832be20ae2115aa8abe/docs/multi_agent.md) 최대 round를 두고, 그 round를 넘기면 통과가 아니라 사람에게 넘기는 쪽으로 끝내야 합니다.

시간 한도도 있습니다. Cursor는 지금의 시스템에서도 에이전트가 가끔 너무 오래 돌고, 방향을 잃는 것을 막으려면 주기적으로 새로 시작해야 한다고 적었습니다. [\[Cursor: Scaling long-running autonomous coding\]](https://cursor.com/blog/scaling-agents) turn 한도만으로는 이 문제를 다 막지 못하므로 wall time 상한을 함께 두는 편이 안전합니다.

| 한도 | 막는 것 | 닿았을 때 권하는 동작 | 너무 낮을 때의 증상 |
| --- | --- | --- | --- |
| worker 수 | 비용 폭증, 중복 | 대기열에 남기고 보고 | 대상 일부가 빠짐 |
| worker당 turn | 반복 시도 | 부분 결과 반환 | 대부분이 partial |
| judge round | 끝나지 않는 개선 | 사람에게 넘김 | 사소한 지적에도 사람 호출 |
| 총비용 | 예산 초과 | 중단 후 보고 | 핵심 작업 전에 중단 |
| wall time | 방향 상실, 정체 | 중단 후 보고 | 느린 외부 API에서 실패 |

## 4. 병합과 검증: 결과를 합치는 단계가 품질을 정한다

worker가 모두 끝나면 결과를 합칩니다. 많은 시스템이 이 단계를 "lead가 요약을 이어 붙인다"로 끝내는데, 품질 문제의 상당 부분이 여기서 생긴다고 봅니다.

### 결과는 파일로, lead에게는 참조만 올린다

worker의 결과가 lead에게 오는 길에서 정보가 줄어듭니다. 요약을 다시 요약하기 때문입니다.

Anthropic은 이를 전화 놀이에 비유합니다. 처방은 subagent가 결과를 외부 저장소에 쓰고 lead에게는 가벼운 참조만 넘기는 artifact 방식입니다. 이렇게 하면 여러 단계를 거치며 정보가 사라지는 것을 막고, 긴 출력을 대화 기록으로 복사하는 token도 줄인다고 합니다. [\[Anthropic: How we built our multi-agent research system\]](https://www.anthropic.com/engineering/multi-agent-research-system)

같은 글의 Research 시스템은 마지막에 별도의 CitationAgent가 문서와 보고서를 읽고 각 주장의 출처 위치를 찾습니다. 종합하는 쪽과 근거를 대는 쪽을 나눈 구조입니다.

LangGraph의 orchestrator-worker 예제도 비슷합니다. `Send` API로 worker를 동적으로 만들고, 각 worker는 자기 state를 가지며, 모든 worker가 공유 state의 한 key에 결과를 씁니다. 예제는 그 key를 `operator.add`로 합치는 리스트로 선언해 병렬 쓰기를 모으고, orchestrator가 그것을 종합합니다. [\[LangGraph: Workflows and agents\]](https://github.com/langchain-ai/docs/blob/d5c997c78dc6de5cf690b8bc39bf4a3763890446/src/oss/langgraph/workflows-agents.mdx)

요금제 예제라면 worker마다 `results/pricing-07.json` 같은 파일을 쓰고, lead에게는 파일 경로와 status만 올립니다. lead는 요약을 받는 대신 파일을 읽어 표를 만듭니다.

### 병합은 정해진 순서로 거친다

병합 단계에서 제가 권하는 순서는 다음과 같습니다.

```text
worker 결과(파일) -> schema 검증 -> 정규화 -> 중복/충돌 검사 -> 독립 검증 -> 병합 -> 보고
                        | 실패          | 단위 불명     | 충돌             | 불합격
                        v               v              v                  v
                    재요청 1회      사람 확인 표시   충돌 표시 후 보존   해당 항목만 재작업
```

정규화는 요금제 예제에서 특히 중요합니다. 연 결제 가격을 월 환산으로 바꾸는 일은 worker가 아니라 병합 코드가 해야 합니다. worker마다 환산 방식이 다르면 표의 숫자가 서로 비교되지 않기 때문입니다.

### 충돌은 지우지 말고 기록한다

충돌이 나면 평균을 내거나 하나를 고르지 말고 충돌 사실을 결과에 남기는 편이 안전합니다. 두 worker가 다른 값을 가져왔다는 것 자체가 사람이 봐야 할 정보입니다.

| 충돌 유형 | 예 | 권하는 처리 |
| --- | --- | --- |
| 형식 불일치 | 한쪽은 월, 한쪽은 연 | 병합 코드가 정규화, 원값도 보존 |
| 값 불일치 | 같은 요금제가 9달러와 12달러 | 두 값과 출처를 모두 표에 표시 |
| 출처 등급 차이 | 공식 페이지 대 리뷰 사이트 | 명세의 sources 규칙으로 하위 출처 제외 |
| 판단 차이 | 부가세 포함 여부 | `price_note`를 비교해 사람 확인으로 올림 |
| 누락 | blocked로 끝난 worker | 칸을 비우지 말고 '확인 불가'와 사유 기재 |

### 검증은 작성자와 분리한다

검증은 작업한 쪽과 분리합니다. Anthropic 글은 guardrail을 본 작업과 같은 LLM 호출에 넣는 것보다, 한 인스턴스가 요청을 처리하고 다른 인스턴스가 검사하게 나눌 때 성능이 더 좋은 경향이 있다고 적었습니다. [\[Anthropic: Building effective agents\]](https://www.anthropic.com/engineering/building-effective-agents)

무엇을 검증하느냐도 정해야 합니다. Anthropic의 research 글은 상태를 바꾸는 에이전트를 평가할 때 매 turn을 따지기보다 최종 상태가 맞는지를 보는 편이 효과적이었고, 복잡한 workflow는 특정 상태 변화가 일어나야 하는 지점마다 checkpoint를 두어 평가했다고 합니다. [\[Anthropic: How we built our multi-agent research system\]](https://www.anthropic.com/engineering/multi-agent-research-system)

요금제 표에 옮기면 검증자는 worker가 어떤 경로로 검색했는지를 보지 않습니다. 표의 각 칸에 대해 출처 URL이 공식 도메인인지, 그 페이지에 그 숫자가 있는지, `checked_at`이 오늘인지를 봅니다. 앞의 예에서 작년 가격이 표에 들어간 실수는 이 검사에서 걸립니다.

### 실패 모드와 비용: 병합자가 병목이 될 때

병합과 검증에도 비용이 있습니다. 검증자가 모든 칸의 출처 페이지를 다시 열면 비용이 worker 비용과 비슷해집니다. 저는 코드로 할 수 있는 검사(schema, 도메인, 날짜)를 먼저 돌리고, 모델 검증은 값 불일치나 판단 차이가 있는 칸에만 쓰는 편을 권합니다.

병합 역할 자체가 병목이 될 수도 있습니다. 앞에서 본 Cursor의 integrator가 그런 예입니다. 병합 단계가 모든 결과를 직렬로 기다린다면, 먼저 끝난 결과부터 검증을 시작하게 바꾸는 것만으로도 지연이 줄어듭니다.

### 보고서는 완료와 미완료를 나눠 쓴다

병합의 마지막 산출물은 사람이 읽는 보고서입니다. 앞의 예에서 lead가 "완료했습니다" 한 줄로 끝낸 것이 문제의 마지막 고리였습니다.

저는 보고서의 첫 부분을 상태별 개수로 시작하는 편을 권합니다. 12곳 가운데 검증을 통과한 곳, 부분 결과로 끝난 곳, 확인 불가인 곳, 충돌이 남은 곳의 수를 먼저 적고, 그 다음에 표를 둡니다. 영업팀이 표를 회의에 가져가기 전에 어느 칸을 믿고 어느 칸을 다시 확인해야 하는지를 한눈에 알 수 있게 하려는 것입니다.

이 형식은 사람 승인과도 맞물립니다. 승인자가 "통과" 버튼을 누르기 전에 미완료 항목이 먼저 보이면, 조용한 통과가 끼어들 자리가 줄어듭니다.

## 5. 금융·보험 IT의 눈으로 보면: 배치 스케줄러에 이미 답이 있다

보험이나 금융의 backend를 해 본 분이라면 이 구조가 낯설지 않을 겁니다.

야간 배치에는 job 정의, 선후행 관계, 재시도 횟수, 실패 시 중단할지 건너뛸지, 그리고 실행 로그가 있습니다. 오케스트레이터가 책임질 분해, 정지 조건, 병합 규칙은 이 목록과 거의 겹칩니다.

| 배치 운영의 개념 | 오케스트레이터의 대응 | 다른 점 |
| --- | --- | --- |
| job 정의서 | worker 작업 명세 | 내용이 실행 시점에 모델이 쓸 수도 있음 |
| 선후행 관계 | pipeline의 단계 순서 | fan-out은 선후행이 없음 |
| 재시도 횟수, abend 처리 | turn 한도와 `on_limit` | 같은 입력에도 결과가 달라질 수 있음 |
| 대사(對査) 작업 | 병합 전 충돌 검사 | 기준값이 외부 웹 페이지일 수 있음 |
| 실행 로그와 감사 추적 | 명세, 결과 파일, 검증 기록 | 판단 근거까지 남겨야 함 |
| 결재선 | judge 뒤의 사람 승인 | 승인 대상이 숫자가 아닌 판단일 수 있음 |

차이는 job의 내용이 실행 시점에 정해진다는 점입니다. 배치 job은 사람이 작성하고 변경 관리를 거치지만, orchestrator-workers의 하위 작업은 모델이 그 자리에서 씁니다.

그래서 저는 보수적인 조직일수록 작업 명세와 한도를 데이터로 남기고, 어떤 worker가 어떤 근거로 결과를 냈는지 추적할 수 있게 하는 편이 맞다고 봅니다. 감사에서 "이 숫자는 어디서 왔는가"라는 질문을 받으면 명세, 결과 파일, 검증 기록 세 가지로 답할 수 있어야 합니다.

결재선이 필요한 일이라면 judge가 통과시킨 결과도 사람의 승인 단계를 한 번 더 거치게 두는 편이 안전합니다. 이때 승인 화면에는 통과한 항목만이 아니라 부분 결과, 확인 불가, 충돌 항목이 함께 보여야 합니다.

## 6. 오늘 바로 적용할 수 있는 순서

1. 지금 만들려는 일의 하위 작업을 실행 전에 나열할 수 있는지 확인합니다. 나열할 수 있다면 pipeline이나 fan-out으로 시작하고, 분해를 모델에게 맡기지 않습니다.
2. worker에게 넘기는 지시를 objective, boundaries, sources, output_schema, on_blocked를 가진 명세로 바꾸고, worker를 띄우기 전에 중복과 빈 칸을 코드로 검사합니다.
3. worker 수, worker당 turn, judge round, 총비용, wall time에 상한을 두고 프레임워크의 turn 제한 기능이나 recursion limit으로 강제합니다.
4. 한도에 닿았을 때의 동작을 상한마다 정합니다. 부분 결과 반환, 사람에게 넘김, 중단 후 보고 가운데 하나를 고르고, 조용한 통과는 고르지 않습니다.
5. worker 결과는 파일로 남기고, 병합 전에 schema 검증, 정규화, 충돌 검사, 작성자와 분리된 검증을 거치게 합니다.

## 마치며

오케스트레이션 패턴은 그림으로 보면 비슷해 보이지만, 운영에서 차이를 만드는 것은 화살표가 아니라 책임의 소재입니다.

일을 나누는 명세, 쓰는 돈의 상한, 멈추는 조건, 합치는 규칙을 오케스트레이터가 갖고 있는지부터 확인해 보시길 권합니다.

이 네 가지가 정해져 있으면 에이전트를 늘리는 결정도 훨씬 가벼워집니다.

## 참고 자료

- [Building effective agents - Anthropic](https://www.anthropic.com/engineering/building-effective-agents)
- [How we built our multi-agent research system - Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Scaling long-running autonomous coding - Cursor](https://cursor.com/blog/scaling-agents)
- [Don't Build Multi-Agents - Cognition](https://cognition.com/blog/dont-build-multi-agents)
- [Agent orchestration - OpenAI Agents SDK (2026-03-14 기준)](https://github.com/openai/openai-agents-python/blob/f58faa3524a89e856723c832be20ae2115aa8abe/docs/multi_agent.md)
- [Running agents - OpenAI Agents SDK (2026-03-14 기준)](https://github.com/openai/openai-agents-python/blob/f58faa3524a89e856723c832be20ae2115aa8abe/docs/running_agents.md)
- [Workflows and agents - LangGraph (2026-03-13 기준)](https://github.com/langchain-ai/docs/blob/d5c997c78dc6de5cf690b8bc39bf4a3763890446/src/oss/langgraph/workflows-agents.mdx)
- [GRAPH_RECURSION_LIMIT - LangGraph (2026-03-13 기준)](https://github.com/langchain-ai/docs/blob/d5c997c78dc6de5cf690b8bc39bf4a3763890446/src/oss/langgraph/errors/GRAPH_RECURSION_LIMIT.mdx)
