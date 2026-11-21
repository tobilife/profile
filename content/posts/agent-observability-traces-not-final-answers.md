---
title: "에이전트 관측성: 최종 답변은 주장이고, 증거는 trace에 있다"
date: 2026-06-25
description: "작업 하나를 trace로, 모델과 tool 호출을 span으로 남기고, 내용 수집 등급과 비용 귀속, 알림 기준까지 OpenTelemetry GenAI 규약으로 정리합니다."
category: 에이전트 엔지니어링
tags: [관측성, 하네스, AI Agent, Eval, LLM]
draft: false
---

:::note
- 최종 답변은 에이전트가 한 일에 대한 주장입니다. 확인하려면 실행 과정(transcript)과 환경에 남은 결과(outcome)가 따로 기록되어 있어야 합니다.
- 작업 하나를 trace 하나로, 모델 호출과 tool 호출을 span으로 남기면 어디서 틀어졌는지 추측하지 않아도 됩니다. 이름은 OpenTelemetry GenAI 규약을 따르는 편이 오래갑니다.
- 프롬프트와 tool 입출력 본문은 기본으로 수집하지 않고, 필요한 등급만 opt-in으로 엽니다. 운영 환경은 외부 저장소와 참조 방식이 현실적입니다.
- 토큰과 비용은 작업 단위로 귀속시키고, 알림은 답변 품질이 아니라 비용, 반복, 오류, 주장과 검증의 불일치에 겁니다.
:::

에이전트를 처음 운영에 올릴 때 흔히 이렇게 생각합니다. "마지막 답변이 그럴듯하면 잘 돌아간 것이다."

그런데 에이전트는 한 번 답하고 끝나는 프로그램이 아닙니다. 여러 턴에 걸쳐 tool을 부르고, 그 결과를 보고 다음 행동을 정하고, 그 과정에서 외부 시스템의 상태를 바꿉니다. Anthropic은 이런 특성 때문에 중간의 실수가 뒤로 전파되고 쌓일 수 있다고 설명합니다. [\[Anthropic: Demystifying evals for AI agents\]](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)

**에이전트의 최종 답변은 실행 결과에 대한 주장일 뿐이고, 그 주장을 확인할 기록이 없으면 에이전트를 운영할 수 없습니다.**

같은 글은 두 가지를 분명히 구분합니다. transcript는 출력, tool 호출, 추론, 중간 결과를 모두 담은 한 번의 실행 기록이고, outcome은 실행이 끝났을 때 환경에 남은 최종 상태입니다. 항공권 예약 에이전트가 "예약이 완료되었습니다"라고 말해도, outcome은 데이터베이스에 예약 레코드가 실제로 있느냐라는 것입니다. [\[Anthropic: Demystifying evals for AI agents\]](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)

이 구분은 eval을 위해 나온 것이지만 운영에도 그대로 통합니다. 이 글은 transcript와 outcome을 운영 환경에서 어떤 구조로 남기고, 무엇을 담고 무엇을 빼고, 비용과 알림을 어디에 걸지를 다룹니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 보험사에서 매일 밤 도는 에이전트가 하나 있다고 해봅시다. 이 글 전체에서 쓸 예시입니다.

이 에이전트의 일은 보험료 납입 기일이 지난 계약을 조회하고, 계약자마다 안내 메일을 만들어 메일 게이트웨이로 보내고, 아침에 처리 요약을 남기는 것입니다. tool은 세 개입니다. 미납 계약 조회, 안내문 생성, 메일 발송입니다.

어느 날 아침 이런 보고가 남아 있습니다.

> 미납 계약 120건에 대해 안내 메일 발송을 완료했습니다.

그런데 오후에 콜센터로 "안내를 못 받았다"는 문의가 몇 건 들어옵니다. 담당자가 뒤늦게 확인해 보니 메일 발송 tool은 일부 호출에서 게이트웨이 시간 초과 오류를 돌려줬고, 에이전트는 몇 번 재시도하다가 요약 단계로 넘어갔습니다. 요약에는 실패 이야기가 없습니다.

모델이 거짓말을 했다고 결론 내리기 전에 시스템을 봐야 합니다. 이 시스템이 저장한 것은 최종 답변 한 줄과, 메일 게이트웨이의 자체 로그뿐이었습니다. 둘을 이어 줄 식별자도 없었습니다.

시스템 설계 관점에서 빠진 것은 네 가지입니다.

- tool 호출마다 성공과 실패, 오류 종류가 기록되지 않았다.
- "120건 발송"이라는 주장과 게이트웨이가 실제로 받은 건수를 대조하는 지점이 없었다.
- 같은 tool이 같은 인자로 몇 번 재시도되었는지, 그 사이 토큰이 얼마나 들었는지 볼 수 없었다.
- 게이트웨이 로그의 각 줄이 어느 밤, 어느 작업에서 나온 호출인지 알 수 없었다.

아래 다섯 절은 이 네 가지를 하나씩 메우는 순서로 짰습니다.

## 1. 최종 답변은 주장이고, 증거는 transcript와 outcome이다

관측성의 첫 번째 원칙은 주장과 증거를 다른 곳에 저장하는 것입니다.

### 세 가지를 세 군데에 나눠 담는다

에이전트 하나가 끝났을 때 남아야 하는 것은 세 종류라고 봅니다.

| 종류 | 무엇인가 | 누가 만드나 | 어디에 남기나 |
| --- | --- | --- | --- |
| 주장 (claim) | 에이전트가 최종 답변에서 말한 내용 | 모델 | 작업 요약 레코드의 `claimed` |
| 과정 (transcript) | 모델 호출, tool 호출, 중간 결과의 순서 | 하네스 | trace와 span |
| 결과 (outcome) | 실행 후 외부 시스템의 실제 상태 | 외부 시스템 | 작업 요약 레코드의 `verified`, 원천 로그 |

세 칸의 작성자가 다르다는 점이 핵심입니다. 주장은 모델이 쓰고, 과정은 하네스가 쓰고, 결과는 메일 게이트웨이나 데이터베이스 같은 외부 시스템이 씁니다. 한 주체가 세 칸을 다 채우면 검증이 아니라 자기 보고가 됩니다.

### outcome은 에이전트에게 묻지 않는다

제가 가장 중요하다고 보는 건 outcome을 에이전트에게 묻지 않는 것입니다.

예시의 야간 에이전트라면, 발송 건수는 에이전트의 요약이 아니라 메일 게이트웨이의 수신 로그에서 셉니다. 대상 건수는 미납 계약 조회 tool의 반환값이 아니라 같은 조건으로 데이터베이스를 다시 조회해 셉니다. 하네스가 작업 마지막에 이 두 숫자를 직접 가져와 요약 레코드에 적습니다.

이 대조는 모델 없이 코드로 합니다. 비교 대상이 숫자이고 기준이 명확하기 때문입니다. 숫자로 대조할 수 없는 결과, 예를 들어 안내문의 문구가 적절한지는 운영 관측이 아니라 eval의 영역으로 넘깁니다.

### transcript는 사고가 났을 때 읽을 수 있어야 한다

Anthropic은 eval을 다루는 맥락에서 transcript를 직접 읽으라고 거듭 강조합니다. 작업이 실패했을 때 에이전트가 진짜 실수를 했는지, 채점기가 올바른 답을 틀렸다고 했는지는 transcript를 봐야 알 수 있다는 것입니다. [\[Anthropic: Demystifying evals for AI agents\]](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)

운영도 같습니다. 같은 회사의 멀티 에이전트 리서치 시스템 글은, 사용자가 "에이전트가 뻔한 정보를 못 찾는다"고 보고해도 원인이 검색어인지, 출처 선택인지, tool 실패인지 볼 수 없었는데, 운영 환경 전체에 tracing을 넣고 나서야 실패 원인을 체계적으로 진단할 수 있었다고 적습니다. [\[Anthropic: How we built our multi-agent research system\]](https://www.anthropic.com/research/multi-agent-research-system)

### 실패 모드와 비용

이 원칙이 깨지는 전형적인 모습은 세 가지입니다.

- 요약 레코드에 `claimed`만 있고 `verified`가 없다. 겉보기에는 기록이 있지만 검증은 없습니다.
- `verified`를 에이전트가 만든다. "발송 결과를 확인하라"는 단계를 프롬프트에 넣으면, 확인 결과도 결국 모델의 주장입니다.
- 원천 로그는 있는데 작업 식별자가 없다. 예시처럼 게이트웨이 로그가 있어도 어느 작업의 호출인지 모르면 대조할 수 없습니다.

비용도 있습니다. outcome을 직접 세려면 외부 시스템에 읽기 경로가 하나 더 필요하고, 그 경로의 권한 관리가 따라옵니다. 대신 이 대조는 작업이 끝날 때 한 번 하는 것이라 호출 수는 적습니다.

반대로 이 원칙을 적용하지 않아도 되는 경우도 있습니다. 결과가 외부 상태를 바꾸지 않는 순수 조회형 에이전트, 예를 들어 사내 문서를 찾아 요약만 하는 에이전트는 outcome 대조보다 eval이 더 중요합니다.

## 2. 작업 하나가 trace 하나, 모델 호출과 tool 호출이 span이다

기록의 구조는 분산 추적에서 쓰던 것을 그대로 가져오면 됩니다. 작업 하나가 trace이고, 그 안의 모델 호출과 tool 호출이 각각 span입니다.

### 하네스가 턴마다 하는 일

에이전트 루프 안에서 하네스가 기록을 남기는 순서를 단계로 풀면 이렇습니다.

1. 작업이 시작되면 하네스는 trace ID를 하나 만들고, 에이전트 실행 전체를 감싸는 root span을 엽니다.
2. 모델을 부르기 직전에 모델 호출 span을 엽니다. 요청한 모델 이름을 속성으로 붙입니다.
3. 응답이 오면 입력 토큰, 출력 토큰, 캐시 토큰, 종료 사유를 속성으로 기록하고 span을 닫습니다.
4. 응답에 tool 호출이 있으면 tool마다 tool span을 엽니다. tool 이름과 호출 ID를 붙입니다.
5. tool이 끝나면 성공 여부와 소요 시간, 실패했다면 오류 종류를 기록하고 닫습니다.
6. tool 결과를 다음 모델 호출에 넣고 2번으로 돌아갑니다.
7. 루프가 끝나면 root span에 누적 토큰과 종료 상태를 기록하고 닫습니다.

예시의 야간 에이전트에 적용하면 trace 하나가 이런 모양이 됩니다. 아래는 제가 만든 예시입니다.

```text
invoke_agent overdue-notice              trace_id=4bf9…  (작업 1건)
├── chat model-a                         input 18k, output 0.6k
├── execute_tool query_overdue           ok, 120 rows
├── chat model-a
├── execute_tool render_notice  ×120     ok
├── execute_tool send_mail      ×157     ok 83 / error 74 (timeout)
│   └── 같은 수신자 재시도가 최대 4회
├── chat model-a                         finish_reason=stop
└── (종료) claimed=120, tool 실패 74건
```

이 그림만 있었어도 아침 보고를 믿기 전에 `send_mail`의 오류 74건이 먼저 눈에 들어왔을 것입니다.

### 이름은 OpenTelemetry GenAI 규약을 따른다

span에 붙일 이름과 속성을 팀마다 새로 지으면, 도구를 바꾸거나 다른 팀의 trace와 합칠 때 다시 매핑해야 합니다. OpenTelemetry는 이 이름들을 GenAI semantic conventions로 정리하고 있고, 현재 규약 문서는 별도 저장소인 semantic-conventions-genai에서 관리됩니다. 이 글은 그 저장소의 2026년 6월 23일 커밋을 기준으로 합니다. [\[OpenTelemetry: GenAI agent spans\]](https://github.com/open-telemetry/semantic-conventions-genai/blob/64ca7732118d7f0564c98f30a682dc16fa1ab311/docs/gen-ai/gen-ai-agent-spans.md)

| 기록 단위 | 규약의 span 이름 | 남길 만한 속성 |
| --- | --- | --- |
| 에이전트 실행 | `invoke_agent {gen_ai.agent.name}` | `gen_ai.agent.name`, `gen_ai.conversation.id`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` |
| 모델 호출 | `{gen_ai.operation.name} {gen_ai.request.model}` | `gen_ai.response.finish_reasons`, `gen_ai.usage.cache_read.input_tokens` |
| tool 호출 | `execute_tool {gen_ai.tool.name}` | `gen_ai.tool.call.id`, 실패 시 `error.type` |
| 여러 에이전트를 묶은 흐름 | `invoke_workflow {gen_ai.workflow.name}` | 흐름 이름 |

에이전트 실행 span은 원격 에이전트 서비스를 부르는 client span과, 같은 프로세스 안에서 도는 에이전트의 internal span으로 나뉘어 정의되어 있습니다. 모델 호출과 tool 실행 span의 정의는 같은 저장소의 다른 문서에 있습니다. [\[OpenTelemetry: GenAI model spans\]](https://github.com/open-telemetry/semantic-conventions-genai/blob/64ca7732118d7f0564c98f30a682dc16fa1ab311/docs/gen-ai/gen-ai-spans.md)

규약은 tool 실행 계측을 프레임워크에만 맡기지 않습니다. tool은 애플리케이션 코드가 직접 실행하는 경우가 많으니, 자동 계측이 덮지 못하는 tool 호출은 개발자가 직접 계측하라고 권합니다. [\[OpenTelemetry: GenAI model spans\]](https://github.com/open-telemetry/semantic-conventions-genai/blob/64ca7732118d7f0564c98f30a682dc16fa1ab311/docs/gen-ai/gen-ai-spans.md)

예시에서 `send_mail`은 사내 메일 게이트웨이를 감싼 자체 함수입니다. 어떤 프레임워크도 이 함수 안을 자동으로 계측해 주지 않으니, 이 부분은 직접 span을 열어야 합니다.

### 속성 이름은 얇은 계층 하나에 가둔다

주의할 점이 있습니다. 위 문서들의 상태는 모두 Development입니다. 속성 이름이 바뀔 수 있다는 뜻입니다.

그래서 애플리케이션 코드 곳곳에서 `gen_ai.*` 문자열을 직접 쓰기보다, 계측 함수 하나를 거치게 하는 편이 안전하다고 봅니다. 아래는 그런 계층의 예시입니다. 특정 라이브러리의 API가 아니라 구조를 보여 주기 위한 코드입니다.

```ts
// 예시: tool 호출 계측을 한곳에 모은다
export async function tracedTool<T>(
  ctx: TaskContext,                 // task_id, trace 정보
  tool: string,
  callId: string,
  run: () => Promise<T>,
): Promise<T> {
  const span = tracer.startSpan(`execute_tool ${tool}`, {
    attributes: { [ATTR.toolName]: tool, [ATTR.toolCallId]: callId, "app.task_id": ctx.taskId },
  });
  const started = Date.now();
  try {
    const result = await run();
    span.setAttribute("app.tool.success", true);
    return result;
  } catch (e) {
    span.setAttribute(ATTR.errorType, classifyError(e)); // 예: "timeout", "4xx"
    span.setAttribute("app.tool.success", false);
    throw e;
  } finally {
    span.setAttribute("app.tool.duration_ms", Date.now() - started);
    span.end();
  }
}
```

규약의 속성 이름은 `ATTR` 한곳에만 있습니다. 규약이 바뀌면 그 상수만 고칩니다. `app.`으로 시작하는 속성은 규약에 없는, 이 조직이 정한 속성입니다. 둘을 섞지 않고 접두어로 구분해 두면 나중에 무엇이 표준이고 무엇이 자체 규칙인지 헷갈리지 않습니다.

### 제품들도 같은 모양으로 수렴하고 있다

직접 짜지 않고 제품을 쓰는 경우도 구조는 비슷합니다.

OpenAI Agents SDK는 tracing이 기본으로 켜져 있습니다. 실행 전체를 trace로 감싸고, 에이전트 실행, LLM 생성, function tool 호출, guardrail, handoff를 각각 별도 span으로 남깁니다. [\[OpenAI Agents SDK: Tracing\]](https://github.com/openai/openai-agents-python/blob/b855c76a5627d24a122cb8f17c05fbc1f984acda/docs/tracing.md)

Claude Code는 2026년 6월 문서 기준으로 trace가 베타 기능이고 기본은 꺼져 있습니다. 텔레메트리와 베타 플래그를 함께 켜야 span이 나갑니다. 켜면 사용자 프롬프트 하나가 `claude_code.interaction` root span이 되고, 그 아래에 모델 요청과 tool span이 붙습니다. [\[Claude Code Docs: Monitoring\]](https://web.archive.org/web/20260623083351/https://code.claude.com/docs/en/monitoring-usage)

```text
claude_code.interaction                  (프롬프트 1건)
├── claude_code.llm_request              (모델 호출)
├── claude_code.hook                     (상세 베타 tracing일 때만)
└── claude_code.tool                     (tool 호출)
    ├── claude_code.tool.blocked_on_user (권한 결정 대기)
    ├── claude_code.tool.execution       (실제 실행)
    └── subagent의 llm_request / tool span
```

이 계층에서 눈여겨볼 것은 두 가지입니다.

첫째, tool span이 권한 결정 대기와 실제 실행으로 나뉩니다. 작업이 느릴 때 모델이 느린지, tool이 느린지, 사람이 승인을 늦게 눌렀는지를 가를 수 있습니다.

둘째, Agent tool이 띄운 subagent의 span이 부모의 tool span 아래에 붙습니다. 위임한 작업이 trace 밖으로 사라지지 않습니다. tool 실행 span에는 `gen_ai.tool.call.id`도 함께 기록되어, 규약 이름으로 조회할 수 있게 되어 있습니다.

### 실패 모드와 비용

trace 구조가 무너지는 경우는 대개 연결이 끊길 때입니다.

- 비동기 큐나 별도 프로세스로 넘어가는 지점에서 trace 문맥을 넘기지 않으면 trace가 둘로 쪼개집니다. Claude Code가 셸 하위 프로세스에 W3C `TRACEPARENT` 환경 변수를 넘기는 것도 이 문제 때문입니다. [\[Claude Code Docs: Monitoring\]](https://web.archive.org/web/20260623083351/https://code.claude.com/docs/en/monitoring-usage)
- 재시도를 같은 span 안에서 조용히 처리하면 예시의 74건 실패가 한 줄로 뭉개집니다. 재시도는 호출마다 별도 span으로 남기는 편이 낫습니다.
- span 수가 많아지면 저장 비용이 늘어납니다. 예시처럼 작업 하나에 tool 호출이 수백 번이면 하루치 trace만으로도 작지 않습니다. 정상 작업은 샘플링하고, 오류나 상한 초과로 끝난 작업은 전량 남기는 식의 차등 보관이 필요합니다.

trace가 과한 경우도 있습니다. tool 호출이 한두 번뿐인 단발성 질의응답이라면, 요청 로그 한 줄에 토큰과 소요 시간을 적는 것으로 충분합니다.

## 3. 내용 수집은 기본으로 끄고, 등급을 나눠서 연다

span의 뼈대와 그 안의 내용은 다른 문제입니다. 예시의 야간 에이전트라면 프롬프트에는 계약자 이름과 미납 금액이, tool 입출력에는 메일 주소와 안내문 본문이 들어갑니다.

### 규약이 제시하는 세 가지 방식

OpenTelemetry 규약은 지시문, 입력 메시지, 출력 메시지를 민감하고 크기가 큰 데이터로 봅니다. 그래서 계측 라이브러리는 이것들을 기본으로 수집하지 말고 opt-in 옵션을 제공해야 한다고 정하고, 애플리케이션 개발자가 고를 수 있는 세 가지 방식을 제시합니다. [\[OpenTelemetry: GenAI model spans\]](https://github.com/open-telemetry/semantic-conventions-genai/blob/64ca7732118d7f0564c98f30a682dc16fa1ab311/docs/gen-ai/gen-ai-spans.md)

| 방식 | 내용 | 규약이 말하는 적합한 곳 |
| --- | --- | --- |
| 기록 안 함 | 구조와 수치만 남긴다 | 기본값 |
| span 속성에 기록 | 메시지를 span 속성에 직접 담는다 | 사전 운영 환경처럼 양이 감당할 만하고 규제 부담이 없거나 저장소가 규제를 충족하는 곳 |
| 외부 저장소에 두고 참조만 기록 | 본문은 별도 저장소, span에는 참조 | 운영 환경. 양이 문제이거나 민감 데이터를 안전하게 다뤄야 할 때. 접근 통제를 따로 걸 수 있다 |

세 번째 방식의 동작은 규약이 꽤 구체적으로 적어 두었습니다. 계측 라이브러리는 사용자가 정의한 업로드 hook을 지원할 수 있고, hook은 span의 샘플링 여부와 관계없이 호출되며, 메시지 객체와 span을 함께 받습니다. 업로드를 동기로 할지 비동기로 할지, span에 어떤 참조를 남길지는 애플리케이션이 정합니다. [\[OpenTelemetry: GenAI model spans\]](https://github.com/open-telemetry/semantic-conventions-genai/blob/64ca7732118d7f0564c98f30a682dc16fa1ab311/docs/gen-ai/gen-ai-spans.md)

### 외부 저장소 방식의 흐름

예시의 야간 에이전트에 세 번째 방식을 적용하면 데이터는 이렇게 흐릅니다.

```text
모델 호출 완료
   │
   ├─(1) 메시지 본문 ──> 업로드 hook ──> 감사용 저장소 (암호화, 별도 권한)
   │                                     └─ 반환: content_ref = "audit://2026-06-24/4bf9…/m17"
   │
   └─(2) span ──> 구조, 토큰 수, content_ref ──> 관측 백엔드 (운영팀 조회)

사고 조사 시: 운영팀이 span에서 content_ref 확인 ──> 감사 담당이 권한 승인 ──> 본문 열람
```

운영팀은 매일 span의 구조와 수치만 봅니다. 본문은 사고 조사 같은 정해진 사유가 있을 때만, 권한이 분리된 사람이 엽니다. 본문 저장소의 보관 기간도 관측 백엔드와 다르게 정할 수 있습니다.

### 제품마다 기본값이 다르다

여기서 확인해야 할 사실이 하나 있습니다. 제품의 기본값이 같지 않습니다.

Claude Code는 2026년 6월 문서 기준으로 사용자 프롬프트 내용을 기본으로 수집하지 않고 길이만 기록합니다. tool 입력 인자는 `OTEL_LOG_TOOL_DETAILS`, tool 내용은 `OTEL_LOG_TOOL_CONTENT`, 프롬프트 본문은 `OTEL_LOG_USER_PROMPTS`를 각각 켜야 span과 이벤트에 남습니다. [\[Claude Code Docs: Monitoring\]](https://web.archive.org/web/20260623083351/https://code.claude.com/docs/en/monitoring-usage)

반대로 OpenAI Agents SDK는 LLM 생성 span과 function span이 입출력을 담고, 이를 제어하는 `trace_include_sensitive_data` 설정의 기본값이 `True`입니다. 끄려면 설정이나 환경 변수로 명시해야 합니다. [\[OpenAI Agents SDK: Tracing\]](https://github.com/openai/openai-agents-python/blob/b855c76a5627d24a122cb8f17c05fbc1f984acda/docs/tracing.md)

어느 쪽이 옳다는 이야기가 아닙니다. 도구를 붙이기 전에 "이 trace에 무엇이 담겨서 어디로 나가는가"를 먼저 확인해야 한다는 뜻입니다. 같은 SDK 문서는 기본 설정에서 trace가 OpenAI 백엔드로 내보내진다는 점과, 처리기를 교체하면 그 경로를 바꿀 수 있다는 점도 적어 두었습니다.

내용을 보지 않고도 운영할 수 있다는 근거도 있습니다. Anthropic은 리서치 시스템에서 개별 대화의 내용은 모니터링하지 않으면서 에이전트의 결정 패턴과 상호작용 구조만 관측했고, 그것으로 근본 원인을 진단하고 예상치 못한 동작을 찾았다고 밝힙니다. [\[Anthropic: How we built our multi-agent research system\]](https://www.anthropic.com/research/multi-agent-research-system)

### 보수적인 조직에서는

금융이나 보험처럼 보수적인 조직이라면 세 번째 방식이 현실적이라고 봅니다.

이런 조직에는 이미 개인정보 마스킹 규칙, 로그 접근 권한 심사, 보관 기간 규정이 있습니다. 에이전트의 본문 기록을 그 체계 밖에 새로 만들면 감사 때 설명할 것이 하나 더 늘어납니다. 본문은 기존의 감사 로그 저장소 규정에 맞춰 넣고, 관측 백엔드에는 참조만 보내는 구조라면 기존 통제에 그대로 얹을 수 있습니다.

### 실패 모드와 비용

- 개발 환경에서 켜 둔 본문 수집 설정이 운영 배포에 그대로 따라갑니다. 환경 변수 하나 차이라 가장 흔한 사고라고 봅니다. 배포 파이프라인에서 이 값을 검사하는 편이 안전합니다.
- 본문을 막아도 tool 인자에 민감 정보가 섞입니다. 메일 주소나 계좌번호가 인자로 들어가는 tool이라면 인자 기록도 같은 등급으로 다뤄야 합니다.
- 외부 저장소 방식은 저장소가 하나 더 생기는 것이라 운영 부담이 늘어납니다. 사용자가 적고 민감 데이터가 없는 내부 도구라면 두 번째 방식으로도 충분합니다.

## 4. 토큰과 비용은 호출이 아니라 작업에 귀속시킨다

모델 호출 한 건의 비용은 의미가 작습니다. 운영자가 알고 싶은 것은 "이 작업 한 건에 얼마가 들었나", "어제 밤 작업이 왜 평소의 세 배를 썼나"입니다.

### 작업 식별자가 흘러가는 길

그러려면 작업 식별자가 모든 기록에 붙어 있어야 합니다. 흐름을 단계로 풀면 이렇습니다.

1. 스케줄러가 작업을 시작할 때 `task_id`를 발급합니다. 예시라면 `overdue-notice-2026-06-24`입니다.
2. 하네스는 이 값을 trace의 root span 속성과 모든 하위 span에 붙입니다.
3. tool이 외부 시스템을 부를 때도 이 값을 요청 헤더나 메타데이터로 넘깁니다. 메일 게이트웨이 로그에 같은 값이 남게 하기 위해서입니다.
4. 모델 호출 span마다 토큰 수를 기록합니다.
5. 작업이 끝나면 하네스가 같은 `task_id`의 토큰을 모아 요약 레코드에 적습니다.

3번이 빠지면 1절의 outcome 대조가 불가능해집니다. 예시에서 게이트웨이 로그를 작업과 이을 수 없었던 이유가 바로 이것입니다.

### 식별자는 trace와 이벤트에, metric에는 낮은 cardinality만

Claude Code는 프롬프트 하나에서 파생된 이벤트를 `prompt.id`로 묶습니다. 그런데 문서는 이 값을 metric에서는 일부러 제외했다고 설명합니다. 프롬프트마다 고유해서 시계열 수가 끝없이 늘어나기 때문이고, 이벤트 수준의 분석과 감사 추적에만 쓰라고 합니다. [\[Claude Code Docs: Monitoring\]](https://web.archive.org/web/20260623083351/https://code.claude.com/docs/en/monitoring-usage)

여기서 설계 원칙 하나가 나옵니다. 어떤 값을 어디에 둘지는 cardinality로 정합니다.

| 값 | 예 | trace/span | 이벤트/로그 | metric 속성 |
| --- | --- | --- | --- | --- |
| 작업, 프롬프트 식별자 | `task_id`, `prompt.id` | 둔다 | 둔다 | 두지 않는다 |
| tool 호출 식별자 | `gen_ai.tool.call.id` | 둔다 | 둔다 | 두지 않는다 |
| 에이전트, 모델, 팀 이름 | `overdue-notice`, 모델명 | 둔다 | 둔다 | 둔다 |
| tool 이름, 오류 종류 | `send_mail`, `timeout` | 둔다 | 둔다 | 둔다 |
| 본문, 인자 | 안내문, 메일 주소 | 3절의 등급에 따름 | 3절의 등급에 따름 | 두지 않는다 |

같은 문서는 비용 metric을 skill, plugin, subagent 종류별로 나눠 볼 수 있다는 점도 적습니다. 어떤 단계가 비용을 쓰는지 보려면 이런 낮은 cardinality 속성이 metric에 있어야 합니다.

### 하위 에이전트에 위임한 비용도 부모 작업에 붙인다

예시의 야간 에이전트가 안내문 작성을 계약마다 하위 에이전트에게 맡긴다고 해봅시다. 이때 하위 에이전트가 쓴 토큰이 부모 작업의 비용에 합산되지 않으면, 요약 레코드의 비용은 실제보다 훨씬 작게 나옵니다.

합산이 되려면 두 가지가 필요합니다. 하위 에이전트의 span이 부모 trace 안에 들어와야 하고, 각 span이 어느 에이전트의 것인지 구분할 속성이 있어야 합니다. 그러면 작업 비용은 trace 전체의 합으로, 단계별 비용은 에이전트 식별자별 합으로 구할 수 있습니다.

Claude Code는 2026년 6월까지의 변경 이력에서 이 두 가지를 차례로 보강했습니다. 모델 요청 span과 tool span에 `agent_id`와 `parent_agent_id` 속성을 넣었고, 백그라운드로 돈 subagent의 span이 그것을 띄운 Agent tool span 아래에 붙도록 trace 부모 관계를 고쳤습니다. [\[Claude Code: CHANGELOG (2026-06-24 커밋)\]](https://github.com/anthropics/claude-code/blob/0bd954331e2dbf76024ac53b0fd997314f653e51/CHANGELOG.md)

직접 하네스를 짠다면 하위 에이전트를 별도 프로세스나 큐로 넘기는 지점이 가장 위험합니다. 그 지점에서 trace 문맥과 `task_id`를 함께 넘기지 않으면, 하위 에이전트의 비용은 어느 작업에도 속하지 않는 고아 기록이 됩니다.

### 집계의 함정

토큰을 모을 때 조심할 점이 세 가지 있습니다. 모두 Claude Agent SDK 문서가 명시한 내용입니다. [\[Claude Agent SDK: Track cost and usage\]](https://web.archive.org/web/20260618175842/https://code.claude.com/docs/en/agent-sdk/cost-tracking)

- 한 턴에 tool을 여러 개 쓰면 그 턴의 메시지들이 같은 ID를 공유합니다. ID로 중복을 제거하지 않으면 이중 집계가 됩니다.
- 대화가 중간에 실패해도 실패 지점까지는 토큰을 썼습니다. 성공과 오류 결과 모두에 사용량과 비용이 들어 있으니, 결과의 종류와 관계없이 읽어야 합니다. 성공한 실행만 더하면 비용이 줄어 보입니다.
- SDK가 돌려주는 비용 값은 빌드 시점의 가격표로 클라이언트가 계산한 추정치입니다. 문서는 이 값으로 최종 사용자에게 청구하거나 재무 결정을 내리지 말고, 정확한 청구는 Usage and Cost API나 콘솔을 쓰라고 적습니다.

OpenTelemetry 규약도 토큰 metric에서 사용 토큰과 과금 토큰이 따로 보고되면 과금 토큰을 기록하라고 정합니다. [\[OpenTelemetry: GenAI metrics\]](https://github.com/open-telemetry/semantic-conventions-genai/blob/64ca7732118d7f0564c98f30a682dc16fa1ab311/docs/gen-ai/gen-ai-metrics.md)

비용 귀속이 왜 중요한지는 Anthropic의 수치가 보여 줍니다. 자사 데이터에서 에이전트는 일반 채팅보다 약 4배, 멀티 에이전트 시스템은 약 15배의 토큰을 썼다고 합니다. [\[Anthropic: How we built our multi-agent research system\]](https://www.anthropic.com/research/multi-agent-research-system) 에이전트 비용은 호출 수보다 구조에 따라 커지므로, 작업 단위로 봐야 구조의 문제가 보입니다.

### 작업 요약 레코드

작업이 끝날 때 남기는 요약 레코드는 이런 모양이면 충분하다고 봅니다. 아래는 제가 만든 예시입니다.

```json
{
  "task_id": "overdue-notice-2026-06-24",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "agent": "overdue-notice",
  "status": "completed",
  "end_reason": "model_stop",
  "claimed": { "mails_sent": 120 },
  "verified": { "targets": 120, "mails_accepted": 83, "source": "mail_gateway_log" },
  "mismatch": true,
  "model_calls": 41,
  "tool_calls": { "total": 397, "failed": 74, "by_tool": { "send_mail": { "total": 157, "failed": 74 } } },
  "tokens": { "input": 912000, "output": 38000, "cache_read": 640000 },
  "estimated_cost_usd": 3.42,
  "cost_source": "client_estimate"
}
```

`claimed`와 `verified`가 나란히 있고, 하네스가 둘을 비교해 `mismatch`를 계산합니다. 앞의 사례는 이 한 줄만 있었어도 아침에 잡혔을 것입니다.

`end_reason`도 중요합니다. 모델이 스스로 멈췄는지, 턴 수 상한에 걸렸는지, 예산 상한에 걸렸는지에 따라 같은 `completed`라도 의미가 다릅니다. `cost_source`는 이 숫자가 추정치라는 사실을 레코드 안에 남겨, 나중에 누군가 이 값을 청구 근거로 쓰지 않게 합니다.

### 실패 모드와 비용

- `task_id`를 하네스 안에서만 쓰고 외부 시스템에 넘기지 않으면, 비용은 보이는데 결과 대조가 안 됩니다.
- metric에 `task_id`를 넣으면 백엔드의 시계열 수가 폭증합니다. 비용 대시보드가 느려지는 원인이 되곤 합니다.
- 작업 단위가 애매한 대화형 에이전트에서는 "작업"의 경계부터 정해야 합니다. 사용자 프롬프트 하나를 작업으로 볼지, 세션 하나를 작업으로 볼지는 팀이 정할 문제이고, Claude Code는 프롬프트 하나를 기본 단위로 삼고 있습니다.

## 5. 알림은 품질이 아니라 이상 징후에 건다

답변이 좋은지 나쁜지를 실시간 알림으로 잡으려 하면 잘 되지 않습니다. 품질 판단에는 기준과 채점이 필요하고, 그건 eval이 할 일입니다.

### 운영 알림과 eval의 경계

운영 알림은 수치로 드러나는 이상에 겁니다. Claude Code 문서가 꼽는 일반적인 알림 대상은 비용 급증, 비정상적인 토큰 소비, 특정 사용자의 높은 세션 수입니다. 같은 문서는 API 요청이 내부 재시도를 모두 소진했을 때 한 번만 남는 `api_error` 이벤트를 재시도 소진의 신호로 쓰는 방법도 설명합니다. [\[Claude Code Docs: Monitoring\]](https://web.archive.org/web/20260623083351/https://code.claude.com/docs/en/monitoring-usage)

여기에 에이전트 특유의 징후를 더하는 편이 좋다고 봅니다. 아래 표는 징후마다 어떤 데이터에서 계산하고 어떻게 대응할지를 정리한 것입니다. 예시의 야간 에이전트를 기준으로 썼습니다.

| 징후 | 계산하는 곳 | 예시의 기준 | 대응 |
| --- | --- | --- | --- |
| 주장과 검증의 불일치 | 작업 요약 레코드 `mismatch` | 한 건이라도 참 | 담당자 호출, 재발송 대상 목록 생성 |
| 같은 tool, 같은 인자의 연속 실패 | tool span의 `error.type`과 인자 해시 | 같은 수신자 3회 이상 | 해당 수신자 보류, 원인 tool 점검 |
| 작업당 tool 호출 수 이탈 | 요약 레코드 `tool_calls.total` | 평소 분포의 상위 1% 초과 | 반복 루프 의심, trace 검토 |
| 상한에 걸린 종료 | 요약 레코드 `end_reason` | 턴 또는 예산 상한 | 결과를 미완료로 취급 |
| 승인 대기 장기화 | 권한 대기 span 소요 시간 | 30분 초과 | 승인자에게 알림 |
| 작업당 비용 급증 | 요약 레코드 토큰과 비용 | 7일 평균의 3배 | 원인 단계 확인 |

기준값은 모두 예시입니다. 실제 값은 자기 시스템의 분포를 보고 정해야 합니다.

규약에는 에이전트 호출과 tool 실행의 소요 시간 metric도 `gen_ai.invoke_agent.duration`, `gen_ai.execute_tool.duration`이라는 이름으로 정의되어 있어서, 지연 알림은 표준 이름으로 걸 수 있습니다. [\[OpenTelemetry: GenAI metrics\]](https://github.com/open-telemetry/semantic-conventions-genai/blob/64ca7732118d7f0564c98f30a682dc16fa1ab311/docs/gen-ai/gen-ai-metrics.md)

### 알림이 eval로 이어지는 길

알림으로 잡힌 작업은 그대로 eval 사례가 됩니다. 예시에서 불일치가 난 밤의 trace는 "게이트웨이 시간 초과가 섞일 때 에이전트가 실패를 요약에 반영하는가"라는 시나리오의 재료입니다.

Anthropic은 에이전트가 거친 경로를 하나하나 채점하면 테스트가 깨지기 쉬우니, 에이전트가 만들어 낸 결과를 채점하는 편이 나은 경우가 많다고 설명합니다. [\[Anthropic: Demystifying evals for AI agents\]](https://www.anthropic.com/research/demystifying-evals-for-ai-agents) 운영에서 쌓은 `verified` 값은 그런 결과 채점에 바로 쓸 수 있는 데이터입니다. 관측과 eval을 따로 설계하지 않고, 같은 기록을 두 곳에서 쓰도록 짜는 편이 낫다고 봅니다.

### 실패 모드와 비용

- 기준선 없이 임계값을 정하면 알림이 쏟아지거나 하나도 오지 않습니다.
- 알림이 많으면 사람은 읽지 않게 됩니다. 처음에는 불일치와 상한 종료처럼 오탐이 거의 없는 두 가지만 거는 편이 낫습니다.
- tool 호출 수 같은 분포 기반 알림은 업무량 변화에 흔들립니다. 월말처럼 대상이 평소보다 많은 날에는 호출 수가 늘어나는 것이 정상이므로, 대상 건수로 나눈 값을 보는 편이 안정적입니다.

:::tip
알림 임계값을 정하기 전에 2주 정도는 수치만 모으는 편이 낫습니다. 작업당 호출 수와 토큰의 평소 분포를 모르면 임계값은 감으로 정하게 됩니다.
:::

## 6. 오늘 바로 적용할 수 있는 순서

1. 작업마다 `task_id`를 발급하고, 모든 모델 호출과 tool 호출 기록에 붙입니다. tool이 부르는 외부 시스템에도 같은 값을 넘깁니다. 추적 도구가 아직 없어도 여기서부터 시작할 수 있습니다.
2. tool 호출 계측을 함수 하나로 모으고, 이름, 호출 ID, 성공 여부, 오류 종류, 소요 시간을 남깁니다. 속성 이름은 OpenTelemetry GenAI 규약을 따르되 상수 한곳에 둡니다.
3. 작업 종료 시 요약 레코드를 씁니다. 에이전트의 주장과, 외부 시스템에서 하네스가 직접 센 값을 나란히 두고 불일치를 계산합니다.
4. 쓰고 있는 SDK와 제품의 본문 수집 기본값을 확인하고, 환경별 등급을 정합니다. 개발 환경은 span 속성, 운영 환경은 외부 저장소와 참조 방식으로 나눕니다.
5. 2주간 분포를 모은 뒤, 불일치와 상한 종료부터 알림을 겁니다. 비용과 호출 수 알림은 그다음입니다.

## 마치며

에이전트가 무엇을 했는지는 에이전트에게 물어서는 알 수 없습니다. 하네스가 남긴 과정 기록과, 외부 시스템이 남긴 결과가 따로 있어야 답변을 검증할 수 있습니다. trace와 span은 분산 시스템에서 이미 쓰던 도구이고, 이름도 표준이 정리되고 있습니다. 남은 일은 그 도구를 모델 호출과 tool 호출에 빠짐없이 적용하고, 무엇을 담고 무엇을 뺄지를 먼저 정하는 것입니다.

## 참고 자료

- [Semantic Conventions for GenAI agent and framework spans (2026-06-23 커밋)](https://github.com/open-telemetry/semantic-conventions-genai/blob/64ca7732118d7f0564c98f30a682dc16fa1ab311/docs/gen-ai/gen-ai-agent-spans.md)
- [Semantic conventions for generative client AI spans (2026-06-23 커밋)](https://github.com/open-telemetry/semantic-conventions-genai/blob/64ca7732118d7f0564c98f30a682dc16fa1ab311/docs/gen-ai/gen-ai-spans.md)
- [Semantic conventions for generative AI metrics (2026-06-23 커밋)](https://github.com/open-telemetry/semantic-conventions-genai/blob/64ca7732118d7f0564c98f30a682dc16fa1ab311/docs/gen-ai/gen-ai-metrics.md)
- [Claude Code Docs: Monitoring (2026-06-23 보관본)](https://web.archive.org/web/20260623083351/https://code.claude.com/docs/en/monitoring-usage)
- [Claude Agent SDK: Track cost and usage (2026-06-18 보관본)](https://web.archive.org/web/20260618175842/https://code.claude.com/docs/en/agent-sdk/cost-tracking)
- [Claude Code CHANGELOG (2026-06-24 커밋)](https://github.com/anthropics/claude-code/blob/0bd954331e2dbf76024ac53b0fd997314f653e51/CHANGELOG.md)
- [OpenAI Agents SDK: Tracing (2026-06-09 커밋)](https://github.com/openai/openai-agents-python/blob/b855c76a5627d24a122cb8f17c05fbc1f984acda/docs/tracing.md)
- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)
- [Anthropic: How we built our multi-agent research system](https://www.anthropic.com/research/multi-agent-research-system)
