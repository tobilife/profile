---
title: "에이전트 루프와 워크플로: 자율성은 기본값이 아니라 선택입니다"
date: 2025-06-04
description: "Harness를 모델, 도구, 루프, 종료 조건으로 나눠 보고, 보험 청구 접수 예시로 workflow 패턴, gate, 종료 조건, 측정 순서를 정리합니다."
category: 에이전트 엔지니어링
tags: [하네스, 오케스트레이션, AI Agent, HITL, LLM]
draft: false
---

:::note
- Harness는 모델, 도구, 루프, 종료 조건을 묶은 실행 코드이고, 에이전트의 품질은 이 네 가지를 어떻게 정했느냐에서 갈립니다.
- Workflow와 agent의 차이는 똑똑함이 아니라 다음 단계를 코드가 정하느냐 모델이 정하느냐입니다.
- 경로를 미리 그릴 수 있는 업무는 prompt chaining, routing 같은 고정 패턴과 코드 gate로 푸는 편이 싸고 예측 가능합니다.
- 자율 루프는 스텝 수를 예측할 수 없는 열린 문제에만 쓰고, 그때도 종료 조건과 사람 승인 지점을 먼저 정합니다.
:::

요즘은 "에이전트로 만들면 모델이 알아서 계획하고, 도구를 고르고, 끝까지 처리해 준다"는 기대를 자주 듣습니다.

그런데 에이전트 구축 경험을 정리한 글들은 반대 방향을 권합니다. Anthropic은 가능한 한 가장 단순한 해법에서 시작하고, 복잡도는 필요가 확인될 때만 올리라고 씁니다. 에이전트형 시스템은 대개 지연 시간과 비용을 내주고 작업 성능을 얻는 거래라는 이유입니다. [\[Anthropic: Building effective agents\]](https://web.archive.org/web/20250305014737/https://www.anthropic.com/engineering/building-effective-agents)

**실제 문제는 모델의 지능이 아니라, 코드로 고정해도 되는 경로까지 모델의 판단에 맡겨 버린 설계에 있습니다.**

12-factor agents를 정리한 Dex Horthy도 비슷한 관찰을 적었습니다. AI Agent라고 불리는 제품 상당수는 대부분 결정적인 코드이고, LLM 단계는 꼭 필요한 지점에만 들어가 있다는 것입니다. [\[HumanLayer: 12-factor agents\]](https://github.com/humanlayer/12-factor-agents/blob/b4ca10575ba4f2e2b61c93836537ba15738d64e1/README.md)

이 글은 하나의 예시를 처음부터 끝까지 끌고 갑니다. 보험금 청구 서류를 받아 접수까지 처리하는 에이전트입니다. 같은 업무를 자율 루프로 만들었을 때와 workflow로 다시 짰을 때 무엇이 달라지는지 단계별로 보겠습니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 보험금 청구 서류 접수를 자동화한다고 해봅시다.

고객은 진단서, 영수증, 청구서를 사진이나 PDF로 올립니다. 지금은 접수 담당자가 서류 종류를 확인하고, 청구 금액과 진료일을 옮겨 적고, 계약이 유효한지 조회한 뒤 접수 시스템에 등록합니다.

팀은 모델 하나에 도구 여섯 개를 줍니다. 서류 분류, 항목 추출, 계약 조회, 형식 검증, 접수 등록, 담당자 알림입니다. 그리고 "청구 서류를 처리해 줘"라는 지시와 함께 루프를 돌립니다.

데모에서는 잘 됩니다. 문제는 그다음입니다.

어떤 실행에서는 분류, 추출, 검증, 등록 순서로 갑니다. 다른 실행에서는 검증을 건너뛰고 바로 등록을 호출합니다. 계약 조회가 시간 초과로 실패하면 같은 조회를 스무 번 넘게 반복하는 실행도 나옵니다.

모델이 틀렸다고 말하기는 어렵습니다. 순서를 지키라는 제약이 어디에도 없었기 때문입니다.

시스템 설계 관점에서 잘못된 점은 세 가지입니다.

- 순서가 이미 정해진 업무인데, 순서 결정을 매번 모델에게 다시 시켰습니다.
- 단계 사이에 통과 조건(gate)이 없어서, 검증을 건너뛰어도 막을 장치가 없었습니다.
- 루프를 언제 멈출지 정하지 않아서, 실패가 반복 호출로 번졌습니다.

흥미로운 점은 OpenAI의 에이전트 가이드가 에이전트가 맞는 업무의 예로 주택 보험 청구 처리를 든다는 것입니다. 자연어를 해석하고 문서에서 의미를 뽑아야 하는 비정형 데이터 업무이기 때문입니다. [\[OpenAI: A practical guide to building agents\]](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)

저는 이 지적이 맞다고 봅니다. 다만 비정형인 부분은 서류를 읽는 단계이지, 접수 절차 전체가 아닙니다. 이 글의 나머지는 그 경계를 긋는 이야기입니다.

## 1. Harness는 모델, 도구, 루프, 종료 조건의 합입니다

이 글에서는 모델을 감싸서 실제로 일을 시키는 실행 코드를 harness라고 부르겠습니다.

구성 요소는 네 가지로 나눠 볼 수 있습니다.

| 구성 요소 | 하는 일 | 설계할 때 정해야 하는 것 |
| --- | --- | --- |
| 모델 | 다음 행동을 고릅니다 | 어떤 모델을 어느 단계에 쓸지 |
| 도구 | 외부 시스템을 읽고 바꿉니다 | 이름, 설명, 파라미터, 권한 |
| 루프 | 도구 결과를 다시 모델에 넣습니다 | 컨텍스트에 무엇을 쌓을지 |
| 종료 조건 | 루프를 끝내거나 멈춥니다 | 완료, 실패, 승인 대기, 상한 |

Anthropic은 검색, 도구, 메모리로 보강한 LLM을 기본 구성 단위로 놓고, 에이전트는 보통 환경의 피드백을 받아 가며 도구를 쓰는 LLM을 루프로 돌린 것이라고 설명합니다. [\[Anthropic: Building effective agents\]](https://web.archive.org/web/20250305014737/https://www.anthropic.com/engineering/building-effective-agents)

OpenAI의 가이드도 같은 구조를 말합니다. 어떤 오케스트레이션이든 종료 조건에 닿을 때까지 도는 run이라는 개념이 필요하고, 흔한 종료 조건으로 도구 호출, 특정 구조화 출력, 오류, 최대 턴 수를 듭니다. [\[OpenAI: A practical guide to building agents\]](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)

### 한 턴 안에서 실제로 일어나는 일

루프를 말로만 보면 막연하니, 청구 접수 에이전트의 한 턴을 순서대로 따라가 보겠습니다.

1. Harness가 입력을 조립합니다. 시스템 지시, 도구 정의, 지금까지의 대화와 도구 결과를 하나의 메시지 목록으로 만듭니다.
2. 모델은 그 목록 전체를 읽고 둘 중 하나를 돌려줍니다. 사용자에게 보낼 글이거나, "이 도구를 이 인자로 불러 달라"는 구조화된 요청입니다.
3. 도구 호출 요청이 오면 harness가 실제로 실행합니다. 모델은 계약 조회 API를 직접 부르지 못합니다. 부르는 것은 언제나 코드입니다.
4. 실행 결과를 메시지 목록 끝에 붙이고, 다시 1번으로 돌아갑니다.

12-factor agents는 이 구조를 한 문장으로 정리합니다. 도구는 결정적인 코드를 실행시키는 LLM의 구조화 출력일 뿐이고, 모델은 무엇을 할지 정하지만 그것을 어떻게 할지는 코드가 통제한다는 것입니다. [\[HumanLayer: Tools are structured outputs\]](https://github.com/humanlayer/12-factor-agents/blob/b4ca10575ba4f2e2b61c93836537ba15738d64e1/content/factor-04-tools-are-structured-outputs.md)

이 관점이 중요한 이유는 3번 단계에 있습니다. 모델이 "접수 등록"을 요청했다고 해서 harness가 반드시 바로 등록해야 하는 것은 아닙니다. 검증을 먼저 돌릴 수도, 사람에게 넘길 수도, 거절할 수도 있습니다.

코드로 쓰면 이 정도입니다. 아래는 설명을 위한 예시입니다.

```python
# 예시: 가장 단순한 agent loop (설명용 의사 코드)
def run(task, tools, max_turns=20):
    messages = [system_prompt(), user(task)]
    for turn in range(max_turns):
        reply = llm(messages, tools=tools)
        messages.append(reply)

        if not reply.tool_calls:           # 종료 조건 1: 도구 호출 없는 최종 답
            return reply.text

        for call in reply.tool_calls:
            if needs_approval(call):       # 종료 조건 2: 사람 승인이 필요한 행동
                return pause_for_human(call, messages)
            result = execute(call)         # 실행은 결정적인 코드가 합니다
            messages.append(tool_result(call, result))

    return escalate("max_turns 초과", messages)  # 종료 조건 3: 반복 상한
```

스무 줄 남짓이지만, 설계 결정은 거의 다 여기에 들어 있습니다. 무엇을 `messages`에 넣는지, 어떤 호출을 `needs_approval`로 보는지, `max_turns`를 몇으로 둘지입니다.

### 종료 조건은 네 가지로 나눠 적습니다

제가 중요하다고 보는 건 종료 조건입니다. 모델, 도구, 루프는 누구나 챙기지만 종료 조건은 사고가 난 뒤에야 추가하는 경우가 많습니다.

Anthropic도 작업은 보통 완료와 함께 끝나지만, 통제를 유지하려면 최대 반복 횟수 같은 정지 조건을 함께 두는 것이 일반적이라고 적습니다. [\[Anthropic: Building effective agents\]](https://web.archive.org/web/20250305014737/https://www.anthropic.com/engineering/building-effective-agents)

청구 접수 에이전트를 기준으로 종료 조건을 나눠 적으면 아래와 같습니다. 분류와 예시는 제 정리입니다.

| 종료 유형 | 판단 주체 | 청구 접수 예시 | 루프가 끝난 뒤 할 일 |
| --- | --- | --- | --- |
| 완료 | 모델 또는 코드 | 접수 요청서가 스키마를 통과함 | 결과 저장, 다음 단계로 전달 |
| 승인 대기 | 코드 | 접수 등록 도구가 호출됨 | 상태를 저장하고 담당자 응답을 기다림 |
| 실패 | 코드 | 같은 도구가 연속 3회 실패함 | 오류 요약과 함께 담당자에게 이관 |
| 상한 | 코드 | 20턴 또는 토큰 예산 초과 | 진행 상황을 남기고 중단 |

완료를 제외한 셋은 모두 코드가 판단한다는 점이 핵심입니다. 모델에게 "적당히 멈춰"라고 지시하는 것은 종료 조건이 아닙니다.

실패 조건은 12-factor agents의 아홉 번째 원칙이 구체적입니다. 도구 오류를 컨텍스트에 넣으면 모델이 읽고 다음 호출을 고칠 수 있지만, 특정 도구에 연속 오류 카운터를 두어 3회 정도로 제한하고, 한도에 닿으면 루프를 끊고 사람에게 넘기라고 권합니다. 이걸 너무 많이 허용하면 에이전트가 같은 오류를 반복하며 헛돈다는 경고도 붙어 있습니다. [\[HumanLayer: Compact errors into context window\]](https://github.com/humanlayer/12-factor-agents/blob/b4ca10575ba4f2e2b61c93836537ba15738d64e1/content/factor-09-compact-errors.md)

앞의 사례에서 계약 조회를 스무 번 반복한 실행은 정확히 이 카운터가 없었던 경우입니다.

### 실패 모드와 비용: 루프는 비싸게 실패합니다

루프의 실패는 대부분 조용합니다. 예외가 나지 않고, 턴이 늘고, 토큰이 늘고, 결과가 조금씩 어긋납니다.

매 턴 모델은 지금까지 쌓인 메시지 전체를 다시 읽습니다. 턴이 길어질수록 한 턴의 입력도 커지므로, 헛도는 루프의 비용은 턴 수에 비례하는 것보다 빠르게 늘어난다고 보는 편이 안전합니다.

그래서 저는 턴 상한과 함께 토큰 예산이나 비용 예산을 별도의 상한으로 두는 편을 권합니다. 턴 수는 같아도 도구 결과가 큰 업무에서는 비용이 전혀 다르기 때문입니다.

## 2. Workflow와 agent의 차이는 제어 흐름을 누가 쥐느냐입니다

Anthropic은 둘을 구조로 구분합니다. Workflow는 LLM과 도구가 미리 정해진 코드 경로를 따라 오케스트레이션되는 시스템이고, agent는 LLM이 자신의 진행 과정과 도구 사용을 동적으로 정하는 시스템입니다. [\[Anthropic: Building effective agents\]](https://web.archive.org/web/20250305014737/https://www.anthropic.com/engineering/building-effective-agents)

같은 모델과 같은 도구를 써도, 다음 단계를 코드가 정하면 workflow이고 모델이 정하면 agent입니다.

| 구분 | Workflow | Agent |
| --- | --- | --- |
| 다음 단계를 정하는 주체 | 코드 | 모델 |
| 경로 | 설계 시점에 고정 | 실행 중에 결정 |
| 스텝 수 | 미리 알 수 있음 | 알 수 없음 |
| 비용과 지연 | 예측 가능 | 실행마다 달라짐 |
| 테스트 | 단계별 입력과 출력 검증 | 최종 결과와 과정 평가 |
| 맞는 업무 | 절차가 정해진 업무 | 경로를 미리 못 그리는 열린 문제 |

같은 글은 잘 정의된 작업에는 workflow가 예측 가능성과 일관성을 주고, 유연성과 모델 주도 의사결정이 대규모로 필요할 때 agent가 낫다고 정리합니다. 많은 애플리케이션은 검색과 예시를 붙인 단일 LLM 호출을 다듬는 것으로 충분하다는 말도 덧붙입니다.

### 같은 도구, 다른 제어 흐름

청구 접수를 두 방식으로 쓴 코드를 나란히 놓으면 차이가 분명해집니다. 아래는 예시입니다.

```python
# 예시 A: agent 방식. 다음 단계를 모델이 고릅니다.
run("청구 서류를 처리해 줘",
    tools=[classify, extract, lookup_policy, validate, register, notify])

# 예시 B: workflow 방식. 다음 단계를 코드가 정합니다.
def intake(docs):
    kind = llm_classify(docs)                 # LLM: 판단이 필요한 단계
    if kind not in SUPPORTED_KINDS:
        return handoff("지원하지 않는 서류 유형", docs)
    fields = llm_extract(docs, schema=CLAIM_SCHEMA[kind])
    errors = validate(fields)                 # 코드: 규칙으로 판정
    if errors:
        fields = llm_extract(docs, schema=CLAIM_SCHEMA[kind], hint=errors)
        if validate(fields):
            return handoff("추출 재시도 실패", docs, fields)
    policy = lookup_policy(fields.policy_no)  # 코드: 조회는 그냥 호출
    return request_approval(build_registration(fields, policy))
```

B에서도 LLM은 두 번 쓰입니다. 서류 분류와 항목 추출, 즉 비정형 입력을 해석하는 자리입니다. 계약 조회는 더 이상 모델이 고르는 도구가 아니라, 정해진 순서에 코드가 부르는 함수입니다.

이 차이 때문에 B는 단계마다 테스트할 수 있습니다. 분류 정확도, 추출 정확도, 검증 통과율을 따로 측정할 수 있고, 어느 단계가 나빠졌는지 바로 보입니다.

### 둘 사이에는 넓은 중간 지대가 있습니다

현실의 시스템은 둘 중 하나로 깔끔하게 나뉘지 않습니다.

LangChain의 Harrison Chase는 운영 중인 에이전트형 시스템 대부분이 workflow와 agent의 조합이라고 보고, 무엇이 에이전트냐를 따지기보다 시스템이 얼마나 에이전트적인지를 말하는 편을 선호한다고 적었습니다. [\[LangChain: How to think about agent frameworks\]](https://blog.langchain.com/how-to-think-about-agent-frameworks/)

같은 글은 신뢰할 수 있는 에이전트형 시스템을 만드는 어려운 부분이 각 단계에서 LLM에게 알맞은 컨텍스트가 들어가게 하는 것이라고 봅니다. Workflow가 유용한 이유 중 하나도 데이터가 어떻게 흐를지를 개발자가 정확히 정하기 때문이라고 설명합니다.

청구 접수로 말하면, 전체 흐름은 workflow이고 그 안의 "판단이 애매한 서류를 어떻게 처리할지 정하는" 한 단계만 짧은 루프로 두는 구성이 중간 지대입니다.

### 실패 모드: 프레임워크가 흐름을 가릴 때

제어 흐름을 누가 쥐는지가 코드에서 보이지 않으면, 이 구분 자체가 흐려집니다.

Anthropic은 프레임워크가 시작을 쉽게 해 주지만, 그 아래의 프롬프트와 응답을 가리는 추상화 계층을 만들어 디버깅을 어렵게 하고, 더 단순한 구성으로 충분할 때도 복잡도를 더하고 싶게 만든다고 지적합니다. 먼저 LLM API를 직접 쓰고, 프레임워크를 쓴다면 그 아래 코드를 이해하라고 권합니다. 내부 동작에 대한 잘못된 가정이 고객 오류의 흔한 원인이라는 문장도 있습니다. [\[Anthropic: Building effective agents\]](https://web.archive.org/web/20250305014737/https://www.anthropic.com/engineering/building-effective-agents)

프레임워크를 쓰지 말라는 뜻은 아니라고 읽습니다. 쓰더라도 "다음 단계를 누가 정하는가"와 "모델이 이번 턴에 정확히 무엇을 읽었는가"는 코드나 trace로 확인할 수 있어야 한다는 뜻입니다.

### Workflow가 맞지 않는다는 신호

Workflow도 공짜는 아닙니다. 경로를 코드로 고정한다는 것은, 예외가 생길 때마다 분기를 코드로 추가해야 한다는 뜻이기도 합니다.

OpenAI 가이드는 에이전트를 검토할 만한 업무로 세 가지를 듭니다. 미묘한 판단과 예외가 많은 의사결정, 규칙이 너무 많고 얽혀서 고치기 어려워진 시스템, 비정형 데이터에 크게 의존하는 업무입니다. 그리고 이 기준에 분명히 맞지 않는다면 결정적인 해법으로 충분할 수 있다고 덧붙입니다. [\[OpenAI: A practical guide to building agents\]](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)

청구 접수에 대 보면, 세 번째 기준은 서류 읽기 단계에만 해당합니다. 두 번째 기준은 조심해서 봐야 합니다. 서류 유형별 분기가 수십 개로 늘어나 workflow 코드가 규칙 엔진처럼 변해 간다면, 그 분기 판단만큼은 모델에게 넘기는 편이 유지보수에 나을 수 있습니다.

제가 쓰는 기준은 단순합니다. 분기를 추가하는 속도가 업무 담당자가 예외를 발견하는 속도를 따라가지 못하기 시작하면, 그 지점이 workflow의 한계입니다.

## 3. 다섯 가지 workflow 패턴은 각각 다른 문제를 풉니다

Anthropic 글은 운영 환경에서 자주 보이는 workflow 패턴 다섯 가지를 소개합니다. [\[Anthropic: Building effective agents\]](https://web.archive.org/web/20250305014737/https://www.anthropic.com/engineering/building-effective-agents)

| 패턴 | 구조 | 맞는 경우 | 청구 접수에서의 자리 |
| --- | --- | --- | --- |
| Prompt chaining | 앞 호출의 출력을 다음 호출이 처리 | 고정된 하위 작업으로 깔끔하게 나뉠 때 | 분류, 추출, 요청서 작성의 순서 |
| Routing | 입력을 분류해 전용 경로로 보냄 | 유형이 뚜렷하고 분류가 정확할 때 | 진단서, 영수증, 사고 경위서별 추출 경로 |
| Parallelization | 나눠서 동시에 돌리고 코드로 합침 | 독립된 하위 작업, 또는 여러 번의 시도가 필요할 때 | 여러 장의 영수증을 장별로 동시에 추출 |
| Orchestrator-workers | 중앙 LLM이 작업을 쪼개 위임하고 종합 | 하위 작업을 미리 알 수 없을 때 | 대부분의 접수에는 불필요 |
| Evaluator-optimizer | 생성과 평가를 번갈아 반복 | 평가 기준이 분명하고 반복 개선이 측정될 때 | 고객 안내문 문구 다듬기 |

오른쪽 열은 제가 예시에 맞춰 붙인 것입니다. 패턴마다 작동 방식과 기억해 둘 점을 정리하겠습니다.

### 패턴별로 harness가 하는 일

Prompt chaining은 호출 하나하나를 쉬운 일로 만들어, 지연 시간을 내주고 정확도를 얻는 패턴입니다. Harness는 앞 호출의 출력을 받아 다음 호출의 입력으로 넣기만 합니다. 핵심은 그 사이에 코드로 된 검사(gate)를 넣을 수 있다는 점입니다.

Routing은 관심사를 분리합니다. 분류 결과에 따라 harness가 다른 프롬프트, 다른 도구, 다른 모델로 보냅니다. 분류가 없으면 한 유형에 맞춰 프롬프트를 다듬다가 다른 유형의 성능을 깎게 됩니다. 쉬운 질문은 작은 모델로, 어려운 질문은 큰 모델로 보내는 비용 최적화도 여기에 속합니다.

Parallelization에는 두 변형이 있습니다. 독립된 하위 작업으로 나누는 sectioning과, 같은 작업을 여러 번 돌려 다양한 출력을 얻는 voting입니다. 결과를 합치는 일은 LLM이 아니라 코드가 합니다. 같은 글은 한 모델이 사용자 질의를 처리하는 동안 다른 모델이 부적절한 요청을 걸러 내는 구성이, 한 호출에 둘 다 시키는 것보다 대체로 잘 동작한다고 적습니다.

Orchestrator-workers는 모양만 보면 parallelization과 비슷합니다. 차이는 하위 작업이 미리 정의되어 있지 않고, orchestrator가 입력을 보고 정한다는 점입니다. 여기서부터는 경로 일부를 모델이 쥡니다.

Evaluator-optimizer는 사람이 피드백을 말로 풀어 주면 결과가 눈에 띄게 좋아지고, 그런 피드백을 LLM도 줄 수 있을 때 잘 맞습니다. 반복 횟수 상한을 코드가 쥐지 않으면 이 패턴도 끝나지 않는 루프가 됩니다.

### 청구 접수를 chaining, routing, gate로 다시 그리면

청구 접수 사례를 세 패턴의 조합으로 다시 그리면 이렇게 됩니다.

```text
[접수 서류 묶음]
      |
      v
(LLM: 서류별 분류) ---- routing ----+-------------------+
      |                             |                   |
      v                             v                   v
  진단서 추출 경로              영수증 추출 경로       미지원 유형
  (LLM: 항목 추출)             (장별 parallel 추출)        |
      |                             |                   v
      +-------------+---------------+            담당자에게 이관
                    v
        gate 1: 필수 항목, 형식, 금액 합계 검증 (코드)
                    | 실패 -> 오류 내용을 힌트로 재추출 1회 -> 다시 실패 시 이관
                    v 통과
        gate 2: 계약 유효성, 보장 기간 확인 (코드, 기간계 조회)
                    | 실패 -> 담당자에게 이관
                    v 통과
        (코드: 접수 요청서 생성) -> 담당자 승인 -> 접수 등록
```

모델은 분류와 추출만 합니다. 순서, 검증, 조회, 등록은 코드가 쥡니다.

검증을 건너뛰는 실행은 이제 구조적으로 나올 수 없습니다. 접수 등록으로 가는 경로가 gate 두 개를 지나는 길 하나뿐이기 때문입니다.

### Gate는 데이터로 정의해 둡니다

Gate는 코드 곳곳에 흩어진 `if` 문으로 두기보다, 통과 조건과 실패 시 처리를 한곳에 적어 두는 편이 관리하기 쉽다고 봅니다. 아래는 제가 만든 예시입니다.

```yaml
# 예시: 청구 접수 workflow의 gate 정의
gates:
  - id: extraction_check
    after: extract
    checks:
      - required: [policy_no, insured_name, treatment_date, claim_amount_krw]
      - format: { treatment_date: "YYYY-MM-DD", policy_no: "^[0-9]{12}$" }
      - rule: "영수증 금액 합계 == claim_amount_krw"
    on_fail:
      retry: { times: 1, with: validation_errors_as_hint }
      then: handoff_to_human
  - id: policy_check
    after: lookup_policy
    checks:
      - rule: "policy.status == 'ACTIVE'"
      - rule: "treatment_date between policy.coverage_start and policy.coverage_end"
    on_fail:
      retry: { times: 0 }
      then: handoff_to_human
  - id: registration_approval
    before: register
    type: human_approval
    timeout: 1d
```

이렇게 두면 감사나 리뷰 때 "어떤 조건으로 통과시켰는가"를 이 파일 하나로 설명할 수 있습니다. 재시도 횟수도 모델이 아니라 설정이 정합니다.

### 단계마다 모델을 다르게 고릅니다

Workflow로 단계를 나누면 단계별로 다른 모델을 쓸 수 있게 됩니다. 자율 루프에서는 한 모델이 모든 턴을 맡기 쉽지만, 고정 경로에서는 단계가 곧 교체 단위입니다.

OpenAI 가이드는 모든 작업에 가장 똑똑한 모델이 필요하지는 않다고 말합니다. 단순한 검색이나 의도 분류는 더 작고 빠른 모델로 처리하고, 환불 승인 여부 판단처럼 어려운 작업에는 더 강한 모델을 쓰는 식입니다. [\[OpenAI: A practical guide to building agents\]](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)

청구 접수라면 서류 분류는 작은 모델 후보이고, 손글씨가 섞인 진단서에서 항목을 뽑는 추출은 큰 모델 후보입니다. 어느 쪽으로 정할지는 5절에서 다룰 측정이 결정합니다.

### 실패 모드: 패턴을 쌓는 것도 비용입니다

패턴은 처방이 아니라 조합 가능한 부품입니다. Anthropic은 이 부품들을 업무에 맞게 조합하되, 성공의 열쇠는 성능을 측정하고 구현을 반복 개선하는 데 있으며, 복잡도는 결과가 나아진다는 것이 입증될 때만 더하라고 다시 강조합니다. [\[Anthropic: Building effective agents\]](https://web.archive.org/web/20250305014737/https://www.anthropic.com/engineering/building-effective-agents)

패턴마다 깨지는 방식도 다릅니다. 제가 보는 주의점은 이렇습니다.

- Chaining은 앞 단계의 오류가 뒤로 전파됩니다. 그래서 gate가 없는 chaining은 단일 호출보다 나을 이유가 줄어듭니다.
- Routing은 분류가 틀리면 전용 경로 전체가 틀립니다. 분류기의 정확도를 따로 측정하지 않으면 원인을 찾기 어렵습니다.
- Voting은 호출 수만큼 비용이 듭니다. 세 번 돌려 다수결을 내면 그 단계의 비용은 세 배입니다.
- Evaluator-optimizer는 평가 기준이 모호하면 개선이 아니라 진동을 합니다. 기준을 글로 적을 수 없다면 이 패턴은 미루는 편이 낫습니다.

## 4. 자율 루프는 경로를 미리 그릴 수 없을 때만 꺼냅니다

Agent가 맞는 문제도 분명히 있습니다.

Anthropic은 필요한 스텝 수를 예측하기 어렵거나 불가능하고, 고정 경로를 하드코딩할 수 없는 열린 문제에 agent를 쓰라고 합니다. 모델이 여러 턴 동안 움직이므로 그 판단을 어느 정도 신뢰할 수 있어야 한다는 조건도 붙입니다. 예로 드는 것은 여러 파일을 고쳐야 하는 코딩 작업입니다. [\[Anthropic: Building effective agents\]](https://web.archive.org/web/20250305014737/https://www.anthropic.com/engineering/building-effective-agents)

대가도 같은 문단에 적혀 있습니다. 자율성은 더 높은 비용과 오류가 누적될 가능성을 뜻하므로, 샌드박스 환경에서 충분히 테스트하고 적절한 가드레일을 두라는 것입니다.

같은 글의 부록은 에이전트가 특히 가치를 내는 업무의 공통점으로 대화와 행동이 함께 필요하고, 성공 기준이 분명하고, 피드백 루프가 있고, 의미 있는 사람의 감독이 들어가는 것을 꼽습니다. 코딩 에이전트가 잘 맞는 이유로는 자동화된 테스트로 결과를 검증할 수 있다는 점을 듭니다.

### 어느 쪽을 고를지 정하는 질문

청구 접수의 각 단계를 이 기준에 대 보면 판단이 쉬워집니다. 아래 표는 제 정리입니다.

| 질문 | 예라면 | 아니오라면 |
| --- | --- | --- |
| 단계의 순서를 지금 종이에 적을 수 있는가 | workflow | 다음 질문으로 |
| 하위 작업의 종류는 알지만 개수와 조합이 입력마다 다른가 | orchestrator-workers | 다음 질문으로 |
| 결과를 코드나 테스트로 자동 검증할 수 있는가 | 제한된 agent 루프 | 사람 검토를 전제로 한 agent, 또는 보류 |
| 되돌리기 어려운 쓰기 행동이 루프 안에 있는가 | 그 행동 앞에 승인 gate | 루프 안에서 실행 가능 |
| 실패했을 때 사람이 이어받을 수 있는가 | 진행 | 자동화 범위를 줄임 |

청구 접수의 본 흐름은 첫 질문에서 workflow로 끝납니다. 반면 "서류가 애매해서 어떤 추가 서류를 요청할지 판단하는" 단계는 경우의 수가 열려 있으니, 읽기 전용 도구만 가진 짧은 루프가 후보가 됩니다.

### 승인 gate는 도구 선택과 실행 사이에 둡니다

루프 안에 gate를 넣는 방법은 workflow의 gate와 원리가 같습니다. 모델이 도구를 고르는 순간과 harness가 그 도구를 실행하는 순간 사이에 코드가 끼어드는 것입니다.

OpenAI 가이드는 사람 개입이 필요한 대표적인 계기 두 가지를 듭니다. 재시도나 행동 횟수가 정한 한도를 넘었을 때, 그리고 되돌리기 어렵거나 위험이 큰 행동을 하려 할 때입니다. 주문 취소, 큰 금액의 환불 승인, 결제가 예로 나옵니다. [\[OpenAI: A practical guide to building agents\]](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)

12-factor agents의 여덟 번째 원칙은 이것을 제어 흐름의 문제로 봅니다. 배포처럼 위험한 도구 호출이 나오면 루프를 빠져나와 사람의 승인을 기다리게 하고, 그런 구조를 직접 소유하라는 것입니다. 저자는 모든 프레임워크에 바라는 첫 번째 기능으로, 특히 도구를 고른 시점과 실행하는 시점 사이에서 작업 중인 에이전트를 멈췄다가 나중에 재개하는 능력을 꼽습니다. [\[HumanLayer: Own your control flow\]](https://github.com/humanlayer/12-factor-agents/blob/b4ca10575ba4f2e2b61c93836537ba15738d64e1/content/factor-08-own-your-control-flow.md)

이 말을 청구 접수에 옮기면 이런 흐름이 됩니다.

```text
모델: register(claim) 호출 요청
   |
   v
harness: 위험 등급표 조회 -> register는 "쓰기, 되돌리기 어려움"
   |
   v
상태 저장 (대화 이력 + 대기 중인 도구 호출) -> 루프 종료
   |
   ... 담당자가 접수 요청서를 검토 (분 단위에서 하루까지)
   |
   v
승인 이벤트 수신 -> 저장된 상태 복원 -> register 실행 -> 결과를 이력에 붙여 루프 재개
반려 이벤트 수신 -> 반려 사유를 도구 결과로 붙여 루프 재개 또는 종료
```

여기서 중요한 것은 "기다리는 동안 프로세스가 살아 있을 필요가 없다"는 점입니다. 대기 중인 도구 호출과 이력을 저장해 두었다가 이벤트가 오면 다시 시작합니다. 승인이 하루 걸리는 조직에서는 이 구조가 없으면 승인 gate 자체를 넣기 어렵습니다.

### 루프는 작게 자릅니다

자율 루프를 쓰기로 했다면, 그 루프가 맡는 범위를 작게 두는 것이 다음 방어선입니다.

12-factor agents의 열 번째 원칙은 작업이 크고 복잡할수록 스텝이 늘고, 스텝이 늘면 컨텍스트가 길어지고, 컨텍스트가 길어질수록 LLM이 길을 잃기 쉽다고 설명합니다. 그래서 특정 영역에 집중해 3에서 10, 많아야 20 스텝 정도로 끝나는 작은 에이전트를 더 큰 결정적 시스템의 부품으로 쓰라고 권합니다. [\[HumanLayer: Small, focused agents\]](https://github.com/humanlayer/12-factor-agents/blob/b4ca10575ba4f2e2b61c93836537ba15738d64e1/content/factor-10-small-focused-agents.md)

청구 접수에서 추가 서류 판단 루프를 둔다면, 그 루프는 서류 내용과 약관 조항만 읽고 "어떤 서류를 왜 요청할지"를 구조화 출력으로 돌려주면 끝나야 합니다. 고객에게 요청을 보내는 일은 루프 밖의 workflow가 합니다.

### 실패 모드: 자율 루프를 쓰지 말아야 할 때

아래 중 하나라도 해당하면 자율 루프는 미루는 편이 안전하다고 봅니다.

- 성공 여부를 자동으로 판정할 방법이 없고, 사람 검토 인력도 확보되지 않았습니다.
- 루프 안의 도구 중 하나라도 되돌릴 수 없는 쓰기인데, 승인 gate를 넣을 구조가 없습니다.
- 같은 입력에 대해 실행마다 다른 경로를 타는 것이 업무상 허용되지 않습니다.
- 단계의 순서를 담당자에게 물으면 바로 적어 줄 수 있습니다.

마지막 항목이 가장 흔하다고 생각합니다. 절차서가 있는 업무를 자율 루프로 만들면, 이미 있는 절차를 모델이 매번 다시 발견하게 하는 셈입니다.

### 보수적인 엔터프라이즈 IT에서는

보험이나 금융처럼 감사 추적과 결재선이 있는 조직이라면, workflow를 기본값으로 두는 편이 안전하다고 봅니다.

이런 조직의 업무는 이미 절차서와 승인 단계로 쪼개져 있습니다. 그 절차가 곧 workflow의 뼈대입니다. OpenAI 가이드도 에이전트의 지시문을 만들 때 기존 운영 절차서, 응대 스크립트, 정책 문서를 쓰라고 권합니다. [\[OpenAI: A practical guide to building agents\]](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)

감사 관점에서도 "어떤 단계에서 어떤 입력으로 어떤 출력이 나왔는가"를 단계별로 남기기 쉬운 쪽은 고정 경로입니다. 앞의 gate 정의 파일은 그대로 통제 문서의 초안이 됩니다.

자율 루프는 전체 업무가 아니라, 조회나 요약처럼 읽기만 하는 한 단계 안에 넣는 방식부터 시작하는 것이 현실적이라고 생각합니다. 레거시 Java 배치나 Oracle 프로시저로 돌던 절차라면, 그 절차를 workflow의 코드 단계로 그대로 두고 LLM은 사람이 서류를 읽던 자리에만 넣는 구성이 기존 운영 체계와도 잘 맞습니다.

## 5. 복잡도는 측정으로만 올립니다

Workflow로 시작하든 agent로 시작하든, 다음 패턴으로 넘어갈지는 측정이 정해야 합니다.

### 기준선을 먼저 만듭니다

OpenAI 가이드는 모델 선택의 원칙으로 세 단계를 듭니다. eval로 성능 기준선을 세우고, 쓸 수 있는 가장 좋은 모델로 정확도 목표를 먼저 맞추고, 그다음 가능한 곳에서 작은 모델로 바꿔 비용과 지연을 줄이라는 것입니다. 처음부터 작은 모델로 제한하지 않아야 어디서 작은 모델이 성공하고 실패하는지 진단할 수 있다는 이유도 붙어 있습니다. [\[OpenAI: A practical guide to building agents\]](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)

같은 가이드는 처음부터 복잡한 구조의 완전 자율 에이전트를 만들고 싶은 유혹이 있지만, 고객들은 점진적인 접근에서 더 큰 성공을 거둔다고 적습니다.

### Workflow와 agent는 측정하는 방법이 다릅니다

Workflow는 단계별로 잽니다. 청구 접수라면 아래처럼 단계마다 지표가 하나씩 붙습니다. 지표 이름은 제가 만든 예시입니다.

```yaml
# 예시: 청구 접수 workflow의 단계별 지표
metrics:
  classify:   { accuracy: "라벨링된 서류 300건 기준", target: 0.97 }
  extract:    { field_exact_match: "필드별 정확 일치율", target: 0.95 }
  gate_1:     { pass_rate: "1차 통과율", retry_success_rate: "재추출 후 통과율" }
  end_to_end: { handoff_rate: "사람 이관 비율", cost_per_claim_krw: "건당 비용", p95_latency_s: "처리 시간" }
```

Agent 루프는 최종 결과만으로는 부족합니다. 같은 입력에 몇 턴이 걸렸는지, 어떤 도구를 몇 번 불렀는지, 상한에 닿은 비율이 얼마인지를 함께 봐야 합니다. 턴 수의 분포가 넓다면 그 자체가 경로를 고정할 수 있다는 신호일 수 있습니다.

### 실패 모드: 비교 없는 개선

가장 흔한 실패는 "에이전트로 바꿨더니 좋아진 것 같다"는 판단입니다. 같은 입력 묶음으로 이전 구성과 나란히 돌린 결과가 없다면, 좋아졌다는 근거도 나빠졌다는 근거도 없습니다.

그래서 저는 패턴을 하나 더할 때마다 같은 평가 묶음을 다시 돌리고, 정확도와 함께 건당 비용과 처리 시간을 기록하는 것을 최소한의 규칙으로 둡니다. 복잡도를 더하는 결정은 이 표의 숫자가 내리게 합니다.

## 6. 오늘 바로 적용할 수 있는 순서

1. 지금 만들고 있는 기능의 단계를 종이에 적어 봅니다. 순서를 미리 적을 수 있다면 workflow 후보이고, 적을 수 없는 단계만 따로 표시합니다.
2. 단계마다 모델이 할 일과 코드가 할 일을 나눕니다. 서류 해석처럼 비정형 입력을 읽는 일만 모델에 두고, 검증, 조회, 등록, 권한 확인은 코드에 둡니다.
3. 단계 사이에 gate를 하나 이상 넣고, 통과 조건과 실패 시 처리(재시도 횟수, 사람 이관)를 한 파일에 적습니다.
4. 루프가 필요하다면 종료 조건부터 씁니다. 완료, 승인 대기, 연속 실패, 턴과 비용 상한 네 가지를 코드로 정하고, 승인 대기 시 상태를 저장해 재개할 수 있게 합니다.
5. 같은 평가 묶음으로 단순한 구성의 결과를 먼저 기록하고, 정확도와 비용 숫자가 좋아질 때만 다음 패턴으로 넘어갑니다.

## 마치며

Agent와 workflow는 우열 관계가 아니라 제어 흐름을 어디에 둘지에 대한 선택입니다.

경로를 그릴 수 있는 업무는 코드가 흐름을 쥐고, 모델은 각 단계의 판단만 맡는 편이 예측하기 쉽습니다.

경로를 그릴 수 없는 문제에서는 모델에게 흐름을 넘기되, 언제 멈추고 누구에게 넘길지는 사람이 먼저 정해 둡니다.

Harness를 설계한다는 건 결국 이 경계를 긋고, 그 경계가 맞았는지를 숫자로 확인하는 일입니다.

## 참고 자료

- [Building effective agents (Anthropic, 2024-12-19, 2025-03-05 보관본)](https://web.archive.org/web/20250305014737/https://www.anthropic.com/engineering/building-effective-agents)
- [A practical guide to building agents (OpenAI, 2025-04)](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
- [12-factor agents README (HumanLayer, 2025-05-30 기준 커밋)](https://github.com/humanlayer/12-factor-agents/blob/b4ca10575ba4f2e2b61c93836537ba15738d64e1/README.md)
- [Factor 4: Tools are just structured outputs (HumanLayer)](https://github.com/humanlayer/12-factor-agents/blob/b4ca10575ba4f2e2b61c93836537ba15738d64e1/content/factor-04-tools-are-structured-outputs.md)
- [Factor 8: Own your control flow (HumanLayer)](https://github.com/humanlayer/12-factor-agents/blob/b4ca10575ba4f2e2b61c93836537ba15738d64e1/content/factor-08-own-your-control-flow.md)
- [Factor 9: Compact errors into context window (HumanLayer)](https://github.com/humanlayer/12-factor-agents/blob/b4ca10575ba4f2e2b61c93836537ba15738d64e1/content/factor-09-compact-errors.md)
- [Factor 10: Small, focused agents (HumanLayer)](https://github.com/humanlayer/12-factor-agents/blob/b4ca10575ba4f2e2b61c93836537ba15738d64e1/content/factor-10-small-focused-agents.md)
- [How to think about agent frameworks (LangChain, 2025-04-20)](https://blog.langchain.com/how-to-think-about-agent-frameworks/)
