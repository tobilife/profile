---
title: "OpenMontage: 영상 제작을 pipeline 정의와 승인 게이트로 묶은 에이전트 시스템"
date: 2026-04-14
description: "OpenMontage를 manifest, 품질 게이트, 예산 통제로 읽고, 어떤 규칙이 코드로 강제되고 어떤 규칙이 지시문에 머무는지 봅니다."
category: 저장소 소개
tags: [오픈소스, 영상 생성, 오케스트레이션, 하네스, HITL, 가드레일]
draft: false
---

:::note
- OpenMontage는 별도의 코드 오케스트레이터 없이, 코딩 에이전트가 YAML manifest와 Markdown skill을 읽고 영상 제작 단계를 진행하게 만든 저장소입니다.
- 단계마다 받는 산출물과 내놓는 산출물, review 기준, checkpoint 여부, 사람 승인 여부가 manifest에 선언되어 있습니다.
- 렌더 직전의 차단과 렌더 직후의 검사, 건당 지출 승인은 Python 코드에 들어 있지만, 단계 순서와 사람 승인 대기와 단계 review는 에이전트가 지시문을 지키는지에 달려 있습니다.
- review가 에이전트의 자기 검토이고 2회 수정 뒤에는 경고와 함께 통과시키는 규칙, 그리고 기본 예산 mode가 `warn`이라는 점은 도입 전에 따져 볼 지점입니다.
:::

"프롬프트 한 줄이면 영상이 나온다"는 기대가 있습니다.

짧은 clip 하나라면 맞는 말입니다. 하지만 60초짜리 완성본은 조사, 대본, 장면 설계, 에셋 생성, 편집, 합성을 거치고, 그 사이에 유료 API가 여러 번 호출됩니다.

**영상 에이전트에서 어려운 부분은 모델 호출이 아니라, 여러 단계에 걸친 결정과 지출을 미리 막고 나중에 되짚을 수 있게 만드는 일입니다.**

2026년 3월 29일에 첫 commit이 올라온 OpenMontage는 이 문제를 정면으로 다룹니다. [\[OpenMontage: Initial release commit\]](https://github.com/OpenMontageInc/OpenMontage/commit/a3e735cc7abb7f5c703944d763bd1d847ead544b) README는 구조를 한 문장으로 요약합니다. 코드 오케스트레이터는 없고, AI 코딩 어시스턴트가 곧 오케스트레이터라는 것입니다. Python은 도구와 영속성을 제공하고, 창작 결정과 오케스트레이션 로직과 review 기준은 사람이 읽을 수 있는 YAML manifest와 Markdown skill에 둔다고 설명합니다. [\[OpenMontage: README\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/README.md)

이 글은 2026년 4월 12일 시점의 저장소(commit `a06d4c2`)를 기준으로 씁니다. 처음부터 끝까지 한 가지 예제를 따라갑니다. 보험사 마케팅팀이 새 여행자 보험 상품을 소개하는 60초 animated explainer를 만든다고 가정하겠습니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 코딩 에이전트에게 "새 여행자 보험 상품 60초 소개 영상 만들어 줘"라고 맡겼다고 해봅시다.

에이전트는 곧바로 이미지 12장과 영상 clip 6개를 생성하고 합성해서 결과를 내놓습니다.

열어 보니 장면의 절반이 정지 이미지를 넘기는 슬라이드쇼입니다. 자막은 빠졌습니다. 대본에는 상품 설명서에 없는 보장 문구가 한 줄 들어 있습니다. 어떤 생성 모델을 왜 골랐는지는 기록이 없습니다. 비용은 끝난 뒤에야 알았습니다.

대본이 마음에 들지 않아 처음부터 다시 시키면 에셋 생성 비용이 한 번 더 나갑니다.

시스템 설계로 보면 문제는 넷입니다.

- 단계 경계가 없어서, 싼 단계(대본)의 승인 없이 비싼 단계(에셋 생성)로 넘어갔습니다.
- 단계별 산출물의 형식이 정해져 있지 않아, 무엇을 승인해야 하는지도 분명하지 않았습니다.
- 렌더 전후에 결과를 확인하는 검사가 없었습니다.
- 지출을 미리 추정하고 막는 장치가 없었습니다.

OpenMontage는 이 넷을 각각 manifest, artifact schema, 품질 게이트, 예산 설정으로 다룹니다. 아래에서는 각 장치가 어떻게 동작하는지, 그리고 그 장치가 코드로 강제되는지 지시문에 머무는지를 함께 봅니다.

## 1. Pipeline manifest: 흐름은 에이전트가 아니라 YAML이 정한다

### 같은 뼈대, 단계마다 다른 계약

README에 따르면 저장소에는 11개의 pipeline manifest가 있고, 모든 pipeline은 같은 흐름을 따릅니다. [\[OpenMontage: README\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/README.md)

```text
research -> proposal -> script -> scene_plan -> assets -> edit -> compose
```

이 흐름은 `pipeline_defs/` 아래의 YAML manifest에 선언되어 있습니다. 예제에 맞는 `animated-explainer.yaml`은 이 뒤에 publish 단계를 하나 더 둡니다. 아래는 그 파일에서 일부를 발췌한 것입니다. [\[OpenMontage: animated-explainer.yaml\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/pipeline_defs/animated-explainer.yaml)

```yaml
# 저장소에서 발췌 (일부 생략)
orchestration:
  mode: executive-producer
  budget_default_usd: 2.00
  max_revisions_per_stage: 3
  max_send_backs: 3
  max_wall_time_minutes: 20

stages:
  - name: proposal
    skill: pipelines/explainer/proposal-director
    required_artifacts_in:
      - research_brief
    produces:
      - proposal_packet
      - decision_log
    checkpoint_required: true
    human_approval_default: true
    success_criteria:
      - Schema-valid proposal_packet with at least 3 concept_options
      - cost_estimate has itemized line_items with per-tool costs
      - approval.status is "approved" or "approved_with_changes" before proceeding
```

manifest의 설명문은 이 pipeline이 조사 우선의 사전 제작 단계를 갖고, 에셋을 생성하기 전에 사용자의 명시적 승인을 받는다고 적고 있습니다. 앞의 사례에서 빠졌던 바로 그 경계입니다.

### 단계 하나가 선언하는 것들

단계 하나에는 네 종류의 정보가 들어 있습니다.

| 항목 | 예 (animated-explainer) | 하네스에서의 의미 |
| --- | --- | --- |
| 입력과 출력 | `required_artifacts_in: [research_brief]`, `produces: [proposal_packet, decision_log]` | 앞 단계 산출물이 없으면 시작하지 않는다 |
| 사용 가능한 도구 | assets 단계의 `required_tools: [tts_selector, image_selector]` | 단계마다 도구 범위를 좁힌다 |
| 품질 기준 | `review_focus`, `success_criteria` | review가 무엇을 볼지 미리 정한다 |
| 통제 지점 | `checkpoint_required`, `human_approval_default` | 저장하고 멈출 곳을 정한다 |

`success_criteria`는 꽤 구체적입니다. research 단계는 URL과 함께 출처를 5개 이상 인용해야 하고, proposal 단계는 서로 다른 concept을 3개 이상 내고 도구별로 항목화한 비용 추정을 붙여야 합니다. script 단계는 단어 수가 선택한 concept의 목표 길이에서 10% 안에 들어야 하고, compose 단계는 출력 파일이 ffprobe 검증을 통과해야 합니다.

사람 승인도 단계의 속성입니다. 같은 manifest에서 proposal, script, scene_plan, publish는 승인이 기본값이고 research, assets, edit, compose는 아닙니다. 창작 방향을 정하는 단계에서 멈추고, 그 방향을 실행하는 단계는 자동으로 흘려보내는 배치입니다.

산출물의 형식은 `schemas/artifacts/`의 JSON Schema가 정합니다. README는 15개의 schema가 계약 검증에 쓰인다고 소개합니다.

### "어떻게"는 manifest가 아니라 director skill에 있다

manifest는 순서와 계약만 적습니다. 각 단계를 실제로 어떻게 수행하는지는 단계별 director skill이라는 Markdown 파일에 있습니다. README의 동작 설명을 따라가면 에이전트는 manifest를 읽고, 단계의 director skill을 읽고, Python 도구를 부르고, reviewer skill로 스스로 검토하고, checkpoint를 쓰고, 사람에게 승인을 구합니다.

여행자 보험 예제로 옮기면 이렇습니다. research 단계에서 에이전트는 경쟁 상품의 소개 영상과 고객 질문을 조사해 `research_brief`를 만듭니다. proposal 단계에서는 서로 다른 concept 3개와 항목별 비용 추정을 담은 `proposal_packet`을 내고 멈춥니다. 마케팅 담당자가 concept 하나를 고르고 승인해야 script로 넘어갑니다. 대본 승인, 장면 계획 승인이 이어지고, 그 뒤에야 유료 에셋 생성이 시작됩니다.

### checkpoint와 재개: 단계 사이의 상태는 파일로 넘긴다

단계가 끝나면 review를 통과한 산출물을 checkpoint로 씁니다. checkpoint에는 단계 이름, 상태, 산출물, review 결과, 비용 snapshot이 들어가고, 상태 값은 completed, failed, awaiting_human, in_progress 가운데 하나입니다. [\[OpenMontage: checkpoint-protocol.md\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/skills/meta/checkpoint-protocol.md)

checkpoint protocol skill은 manifest의 두 값을 조합해 동작을 정합니다. checkpoint와 승인이 모두 필요하면 저장하고 사람에게 보이고, checkpoint만 필요하면 저장하고 자동으로 넘어가고, checkpoint가 필요 없으면 저장을 건너뜁니다. 사람에게 보이는 요약에는 산출물 요약, review 발견 사항, 지금까지의 비용, 요청 사항이 들어갑니다.

```text
단계 작업 -> reviewer skill -> checkpoint 쓰기 (status: awaiting_human)
                                     |
                       사람에게 요약 제시 (산출물, review, 비용)
                 +-------------------+------------------+
                 | 승인              | 수정 요청        | 중단
                 v                   v                  v
        status: completed     director skill로      pipeline 정지
        get_next_stage()      돌아가 재작업 후
                              다시 review
```

재개도 같은 파일로 합니다. skill은 실행을 시작할 때마다 기존 checkpoint를 읽어 다음 단계를 계산하고, 첫 단계가 아니면 사람에게 어디서부터 재개하는지 알리라고 지시합니다. awaiting_human 상태의 checkpoint가 있으면 승인을 다시 구합니다.

여행자 보험 예제에서 assets 단계 도중에 영상 생성 API가 실패했다고 해봅시다. research부터 scene_plan까지는 completed로 남아 있으므로, 다시 시작하면 assets 단계부터 이어집니다. 이미 승인된 대본을 다시 승인받을 필요도, 조사 비용을 다시 낼 필요도 없습니다.

### 실패 모드와 쓰지 말아야 할 때

이 구조의 약점은 manifest가 실행되는 코드가 아니라 읽히는 문서라는 점입니다. 단계 순서를 지키는 것도, 승인 지점에서 멈추는 것도 에이전트입니다.

같은 저장소 안에서도 숫자가 어긋나는 곳이 있습니다. manifest의 `max_revisions_per_stage`는 3인데, 뒤에서 볼 reviewer skill은 수정을 최대 2 round로 제한합니다. 둘 다 에이전트가 읽는 문서이니, 어느 쪽이 적용될지는 에이전트가 어느 문장을 따르느냐에 달려 있습니다.

단계가 7~8개로 고정된 이 구조는 30초짜리 SNS clip처럼 조사와 제안이 필요 없는 일에는 과합니다. 저장소가 clip-factory나 talking-head 같은 다른 manifest를 따로 둔 이유도 그래서일 것입니다. 저는 승인 지점이 3개 이상 필요한 작업에만 이 정도의 단계 분리를 권합니다.

## 2. Tool registry: 도구는 자기 계약을 선언하고, 에이전트는 있는 것만 쓴다

### BaseTool이 요구하는 운영 속성

도구는 `tools/` 아래의 Python 클래스이고 모두 `BaseTool`을 상속합니다. 이 클래스에는 입출력 schema뿐 아니라 운영에 필요한 속성이 들어 있습니다. [\[OpenMontage: base_tool.py\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/tools/base_tool.py)

| 속성 또는 메서드 | 뜻 | 오케스트레이션에서의 쓰임 |
| --- | --- | --- |
| `capability`, `provider` | 무슨 일을 하는 어느 업체 도구인가 | 같은 능력의 대안 찾기 |
| `determinism` | 같은 입력에 같은 출력인가 | 재실행 가능 여부 판단 |
| `retry_policy` | 재시도 횟수, 간격, 재시도할 오류 | 실패 처리 |
| `idempotency_key_fields` | 같은 작업인지 판단할 입력 필드 | 중복 실행과 캐시 판단 |
| `side_effects` | 외부에 남기는 영향 | 승인이 필요한 도구 구분 |
| `fallback_tools` | 대체 도구 목록 | 강등 경로 |
| `estimate_cost()`, `dry_run()` | 실행 전 비용과 소요 시간 추정 | 예산 예약, 사전 점검 |
| `agent_skills` | 이 도구를 쓰기 전에 읽을 skill | 지식 연결 |

`dry_run()`의 기본 구현은 부작용 없이 예상 비용, 예상 실행 시간, 도구 상태를 돌려주고, 주석은 유료 도구나 게시 도구가 이를 덮어쓰도록 안내합니다. `idempotency_key()`는 지정한 입력 필드로 해시를 만듭니다. 같은 장면 이미지를 두 번 생성하지 않으려면 이런 키가 필요합니다.

### 계획하기 전에 가능한 범위를 조회한다

registry는 이 클래스들을 자동으로 찾아 등록합니다. README는 이 저장소를 여는 에이전트에게 production workflow를 즉흥적으로 만들지 말라고 하고, 먼저 `registry.support_envelope()`와 `registry.provider_menu()`를 실행해 실제 능력의 범위를 확인하라고 지시합니다. 영상 요청은 pipeline 선택의 문제로 다루고, pipeline을 고른 뒤 manifest, 단계 skill, 도구 순으로 읽으라는 순서도 함께 적혀 있습니다. [\[OpenMontage: README\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/README.md)

```text
registry.discover()
  -> support_envelope()   지금 환경에서 가능한 능력의 범위
  -> provider_menu()      능력별로 쓸 수 있는 provider와 필요한 key
  -> pipeline 선택 -> manifest 읽기 -> 단계 skill 읽기 -> 도구 호출
```

제가 이 설계에서 좋게 보는 부분은 여기입니다. 에이전트가 "이런 도구가 있을 것"이라고 가정하고 계획을 세우는 대신, 지금 환경에서 가능한 것을 조회한 뒤 계획하게 만듭니다. 여행자 보험 예제에서 영상 생성 API key가 없다면, proposal 단계는 처음부터 이미지와 Remotion 애니메이션 기반의 concept만 내야 합니다. manifest의 review 기준에도 "production plan이 preflight의 실제 도구 가용성을 반영하는가"가 들어 있습니다.

### 지식을 세 층으로 나눈다

README는 지식을 세 층으로 나눠 설명합니다. `tools/`와 `pipeline_defs/`는 무엇이 있는지를, `skills/`는 OpenMontage가 그것을 어떻게 쓰기를 원하는지를, `.agents/skills/`는 외부 기술에 대한 깊은 지식을 담습니다. 도구는 자신이 기대는 세 번째 층의 skill을 `agent_skills`로 선언하고, 에이전트는 필요할 때만 그 층을 읽습니다.

이 구조는 context 비용과 관련이 있습니다. 모든 provider의 사용법을 미리 읽히면 context가 차고, 아무것도 읽히지 않으면 프롬프트를 잘못 씁니다. 고른 provider의 skill만 그 시점에 읽게 하는 것은 그 중간을 찾는 방법이라고 봅니다. README는 provider selector의 출력이 고른 provider의 `agent_skills`를 함께 돌려준다고 설명합니다.

### 강등 경로는 있지만, 조용한 강등은 막는다

registry가 쓸 수 있는 능력을 알려 주고 도구가 `fallback_tools`를 선언하면, 한 provider가 실패했을 때 다른 provider로 넘어가는 경로가 생깁니다. 문제는 그 경로가 결과물의 성격까지 바꿀 때입니다.

여행자 보험 예제에서 영상 생성 provider가 할당량 초과로 실패했다고 해봅시다. 대체 경로는 정지 이미지에 움직임을 입히는 쪽일 가능성이 큽니다. 비용은 줄지만 영상은 motion 위주에서 이미지 위주로 바뀝니다.

OpenMontage는 이 지점을 두 장치로 다룹니다. 하나는 decision log입니다. README는 fallback이나 강등도 대안과 이유와 함께 기록한다고 설명하고, decision log schema에는 강등 승인이라는 분류가 따로 있습니다. 다른 하나는 앞에서 본 delivery promise입니다. proposal에서 motion 위주로 약속했다면, 강등된 계획은 렌더 직전 검사에서 motion 비율 미달로 막힙니다.

강등을 막는 것이 목적이 아니라 강등을 사람에게 보이게 하는 것이 목적이라는 점이 중요하다고 봅니다. 담당자가 이미지 위주로도 괜찮다고 승인하면 약속을 고쳐 다시 진행하면 됩니다.

### 실패 모드: 선언과 구현이 어긋날 때

도구의 계약은 선언입니다. `determinism`이 deterministic으로 적혀 있어도 실제 구현이 그런지는 별개의 문제입니다. `BaseTool`의 `determinism` 기본값이 deterministic이라는 점도 기억해 둘 만합니다. 도구 작성자가 값을 바꾸지 않으면 생성형 도구도 결정적이라고 선언되는 셈입니다.

`estimate_cost()`의 기본 구현은 0을 돌려줍니다. 유료 도구가 이를 덮어쓰지 않으면 예산 예약 단계는 그 도구를 무료로 봅니다. 새 도구를 붙일 때 이 두 값을 리뷰 항목에 넣는 편이 안전하다고 봅니다.

## 3. 품질 게이트와 self-review: 렌더 전에 막고, 렌더 후에 다시 본다

### 세 겹의 게이트

README의 Production Governance 절은 게이트를 이렇게 설명합니다. [\[OpenMontage: README\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/README.md)

| 게이트 | 시점 | 보는 것 | 실패하면 |
| --- | --- | --- | --- |
| 단계 review | 각 단계 종료 | schema, `review_focus`, `success_criteria` | 수정 후 재검토 |
| pre-compose validation | 렌더 직전 | delivery promise 위반, slideshow 위험, renderer 누락 | 렌더 차단 |
| post-render self-review | 렌더 직후 | ffprobe, 4개 지점 frame, 음량, 자막 | 결과를 제시하지 않음 |

### 렌더 직전: 약속과 계획을 대조한다

delivery promise는 proposal 단계에서 정하고 잠그는 "무엇을 납품하는가"의 약속입니다. `lib/delivery_promise.py`의 설명문은 이 장치가 motion 위주 영상에서 정지 이미지 위주 영상으로 사용자 모르게 강등되는 일을 막기 위한 것이고, compose 단계가 약속을 지킬 수 없으면 조용히 바꾸지 말고 멈춰서 물어야 한다고 적고 있습니다. motion 위주 약속은 cut의 최소 70%가 실제 움직임이어야 합니다. [\[OpenMontage: delivery_promise.py\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/lib/delivery_promise.py)

slideshow 위험 점수는 README가 "animated PowerPoint"를 막는 장치라고 부르는 6개 차원의 분석입니다. 반복, 장식적 시각 요소, 목적 없는 움직임, 약한 shot 의도, 글자 의존, 근거 없는 cinematic 주장을 봅니다. reviewer skill은 scene_plan 단계에서 평균 4.0 이상이면 fail로 보고 critical로, 3.0 이상이면 revise로 보고 suggestion으로 기록하라고 적고 있습니다. [\[OpenMontage: reviewer.md\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/skills/meta/reviewer.md)

여행자 보험 영상에 대입해 보면 각 차원이 무엇을 잡는지 감이 옵니다.

| 차원 | 예제에서 걸릴 만한 계획 |
| --- | --- |
| 반복 | 보장 항목 다섯 개를 같은 카드 레이아웃으로 연달아 보여 줌 |
| 장식적 시각 요소 | 공항 사진이 설명과 무관하게 배경으로만 깔림 |
| 목적 없는 움직임 | 모든 장면에 같은 확대 효과만 걸림 |
| 약한 shot 의도 | 왜 이 장면에서 이 화면을 보여 주는지 설명이 없음 |
| 글자 의존 | 약관 문장을 화면에 그대로 띄우는 장면이 대부분 |
| 근거 없는 cinematic 주장 | "영화 같은" 연출이라 하고 실제로는 정지 이미지 나열 |

보험 상품 영상은 글자 의존 차원에서 점수가 높게 나오기 쉽다고 봅니다. 약관 문구를 정확히 옮겨야 한다는 요구와 영상다워야 한다는 요구가 부딪히는 지점입니다. 이 경우 delivery promise를 처음부터 motion 위주가 아닌 설명형으로 잡는 편이 정직합니다.

이 두 검사는 compose 도구의 코드 안에서 실행됩니다. `video_compose.py`의 pre-compose validation은 delivery promise 위반, slideshow 점수 fail, `renderer_family` 누락 가운데 하나라도 있으면 실패한 결과를 돌려주고 렌더를 막습니다. [\[OpenMontage: video_compose.py\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/tools/video/video_compose.py)

```text
edit_decisions + asset_manifest
  -> delivery_promise 있음? --아니오--> 경고만 남기고 이 검사는 건너뜀
        | 예
        v
     motion 비율 검사 --위반--> 차단
  -> slideshow 점수 --fail--> 차단 / --revise--> 경고
  -> renderer_family 있음? --아니오--> 차단
  -> 렌더
```

앞의 슬라이드쇼 사례가 정확히 여기에 걸립니다. 다만 위 흐름의 첫 줄을 눈여겨봐야 합니다. 편집 결정에 delivery promise가 들어 있지 않으면 코드는 경고만 남기고 그 검사를 건너뜁니다. 게이트가 코드에 있어도, 게이트가 볼 데이터를 앞 단계가 채웠는지는 여전히 에이전트의 몫입니다.

### 렌더 직후: 실제 파일을 열어 본다

렌더가 끝나면 같은 도구가 final review를 실행합니다. 코드의 설명문은 이것을 거버넌스 계약이라고 부르고, 실제 렌더 결과를 probe하고 frame을 뽑아 보지 않고는 영상이 준비됐다고 말하지 말라고 적습니다. final review가 fail이면 도구는 렌더가 성공했더라도 결과를 실패로 바꿔 돌려줍니다. README가 말한 "self-review를 통과해야만 최종 영상을 내놓는다"가 코드로 구현된 지점입니다. [\[OpenMontage: video_compose.py\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/tools/video/video_compose.py)

여행자 보험 예제에서 자막이 빠진 렌더는 여기서 걸립니다. 다만 대본에 들어간 근거 없는 보장 문구는 이 검사의 대상이 아닙니다. ffprobe와 frame 검사는 파일이 멀쩡한지를 볼 뿐, 문구가 약관과 맞는지는 보지 않습니다.

### 단계 review는 지시문이다

단계 review의 절차는 `skills/meta/reviewer.md`에 있습니다. schema 검증이 먼저이고, 실패하면 critical입니다. 그 다음 `review_focus` 항목을 보고, playbook과 대조하고, `success_criteria`를 확인합니다. 발견 사항은 critical, suggestion, nitpick으로 나누고, critical이 하나라도 있으면 고친 뒤 다시 검토합니다. [\[OpenMontage: reviewer.md\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/skills/meta/reviewer.md)

reviewer skill에는 비용에 관한 검사도 있습니다. 실제 지출이 추정보다 30% 넘게 많은데 사용자가 다시 승인하지 않았다면 critical입니다. slideshow 점수도 scene_plan 단계에서 미리 보게 해서, 렌더 직전에야 걸리는 일을 줄이려 합니다.

:::caution
reviewer skill은 수정을 최대 2 round로 제한하고, 그래도 critical이 남으면 "pass with warnings"로 진행하라고 적고 있습니다. 파이프라인을 무한히 막지 않으려는 합리적인 선택이지만, 이 경우 게이트는 차단이 아니라 경고입니다. 그 경고가 사람 승인 화면에 반드시 보이는지 확인해야 한다고 봅니다.
:::

### 실패 모드: 작성자가 곧 검토자다

단계 review를 하는 것은 그 단계를 작업한 같은 에이전트입니다. 대본을 쓴 모델이 자기 대본의 사실 관계를 검토하는 구조이니, 같은 착각이 두 번 통과할 수 있습니다.

구조적으로 고치는 방법은 review를 다른 호출로 떼어 내는 것입니다. 같은 모델이라도 대본을 쓴 대화의 context를 넘기지 않고, 대본과 상품 설명서와 `review_focus`만 넘긴 새 호출에 검토를 맡기면 작성 과정의 가정이 검토로 새어 들어가는 것을 줄일 수 있다고 봅니다. 저장소의 구조에서는 reviewer skill을 subagent로 실행하게 하는 정도의 변경으로 시도해 볼 수 있습니다.

보험 상품 영상이라면 저는 script 단계의 `review_focus`에 "모든 보장 문구가 상품 설명서의 특정 조항을 가리키는가"를 넣고, 그 확인을 사람 승인 단계에서 하게 하겠습니다. 다행히 이 manifest에서 script는 이미 사람 승인이 기본인 단계입니다.

## 4. Provider 점수화와 예산: 선택과 지출을 기록 가능한 결정으로 만든다

### 7개 차원의 점수와 decision log

영상, 이미지, 음성, 음악 도구를 고를 때는 점수 엔진을 거칩니다. README가 밝힌 가중치는 task fit 30%, output quality 20%, control 15%, reliability 15%, cost efficiency 10%, latency 5%, continuity 5%입니다. [\[OpenMontage: README\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/README.md)

고른 provider와 점수, 검토한 대안은 decision log에 남습니다. style 선택, 음악, 음성, renderer, fallback이나 강등도 같은 log에 기록되고, 이 log는 단계를 넘어 누적됩니다.

가중치 자체에 동의하지 않을 수 있습니다. 그래도 선택 기준이 숫자로 적혀 있으면 "왜 이 모델을 썼는가"라는 질문에 log로 답할 수 있습니다. 여행자 보험 영상의 내레이션 음성을 바꾸자는 요청이 나중에 들어오면, 처음에 어떤 후보가 어떤 점수로 밀렸는지부터 볼 수 있습니다.

### decision log 한 줄에 들어가는 것

decision log의 형식도 schema로 정해져 있습니다. 결정 하나에는 결정 ID, 단계, 분류, 대상, 검토한 선택지, 고른 것, 이유가 반드시 들어가고, 선택지마다 점수와 이유, 탈락했다면 그 사유를 적을 수 있습니다. 사용자에게 보여 줄 결정인지, 사용자가 승인했는지, 확신도는 어느 정도인지도 필드로 있습니다. 분류에는 provider 선택, renderer 선택, fallback 결정, 예산 절충, 강등 승인 같은 값이 열거되어 있습니다. [\[OpenMontage: decision_log.schema.json\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/schemas/artifacts/decision_log.schema.json)

아래는 그 schema의 필드 이름을 따라 여행자 보험 예제의 결정 하나를 적어 본 예시입니다. 값은 지어낸 것입니다.

```json
{
  "decision_id": "d-007",
  "stage": "assets",
  "category": "provider_selection",
  "subject": "내레이션 음성",
  "options_considered": [
    { "option_id": "tts-a", "label": "유료 TTS A", "score": 0.81, "reason": "발음과 억양 제어가 좋음" },
    { "option_id": "piper", "label": "Piper TTS", "score": 0.64, "reason": "무료, 오프라인",
      "rejected_because": "보험 용어의 발음 교정 기능이 부족" }
  ],
  "selected": "tts-a",
  "reason": "task fit과 control 점수 차이가 비용 차이보다 큼",
  "user_visible": true,
  "user_approved": false,
  "confidence": 0.7
}
```

`user_approved`가 false인 채로 남은 결정이 몇 개인지를 세어 보는 것만으로도, 사람이 보지 않고 지나간 선택을 찾을 수 있습니다. 저는 이 숫자를 publish 승인 화면에 함께 띄우는 편을 권합니다.

### 추정, 예약, 정산

지출은 세 동작으로 다룹니다. 실행 전에 추정하고, 호출 전에 예산을 예약하고, 끝나면 실제 지출로 정산합니다. 설정은 `config.yaml`에 있습니다. [\[OpenMontage: config.yaml\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/config.yaml)

```yaml
# 저장소에서 발췌
budget:
  mode: warn                     # observe | warn | cap
  total_usd: 10.00
  reserve_pct: 0.10              # holdback for retries / cleanup
  single_action_approval_usd: 0.50
  require_approval_for_new_paid_tool: true

checkpoint:
  policy: guided                 # guided | manual_all | auto_noncreative
```

세 mode의 동작은 `tools/cost_tracker.py`의 예약 함수에서 확인할 수 있습니다. [\[OpenMontage: cost_tracker.py\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/tools/cost_tracker.py)

| 조건 | `observe` | `warn` (기본) | `cap` |
| --- | --- | --- | --- |
| 한 번의 지출이 0.50달러 초과 | 통과 | 승인 요구 예외 | 승인 요구 예외 |
| 처음 쓰는 유료 도구 | 통과 | 승인 요구 예외 | 승인 요구 예외 |
| 예약액이 사용 가능 예산 초과 | 통과 | 통과 | 예산 초과 예외 |

사용 가능 예산은 총액에서 `reserve_pct`만큼을 재시도와 정리용으로 떼어 둔 금액입니다. 기본값이면 10달러 가운데 9달러입니다.

기본 mode가 `warn`이라고 해서 아무것도 막지 않는 것은 아닙니다. `warn`에서도 건당 승인 기준과 첫 유료 도구 승인은 예외를 던집니다. 막지 않는 것은 총액 초과입니다. 총액을 강제로 막으려면 `cap`으로 바꿔야 합니다.

### 기준 금액은 proposal의 추정에서 출발한다

설정의 기본값은 총액 10달러, 건당 승인 0.50달러입니다. 예제 manifest의 `budget_default_usd`는 2달러로 따로 적혀 있습니다. 어느 값이 실제로 쓰일지는 에이전트가 어느 설정을 읽어 cost tracker를 만드느냐에 달려 있으니, 처음 돌릴 때 실제 값을 로그로 확인해 두는 편이 좋습니다.

저는 기준 금액을 고정값으로 두기보다 proposal 단계의 항목별 추정에서 출발하는 편을 권합니다. manifest가 proposal에 도구별 비용 추정을 요구하고, 사람이 그 proposal을 승인하므로, 승인된 추정액이 곧 그 영상의 예산이 됩니다. 총액 상한은 그 추정에 여유분을 더한 값으로, 건당 승인 기준은 추정 항목 가운데 가장 비싼 한 건보다 조금 낮게 잡으면, 예상하지 못한 고비용 호출만 사람에게 올라옵니다.

여행자 보험 예제에서 proposal의 추정이 6달러였다면 총액 상한은 7달러 남짓, 건당 승인 기준은 가장 비싼 영상 clip 한 건의 추정보다 낮게 두는 식입니다. 숫자는 예시이지만, 기준이 승인된 문서에서 나온다는 점이 감사에서 설명하기 쉽다고 봅니다.

### 실패 모드: 예약 함수를 누가 부르는가

이 예외들은 에이전트가 도구를 쓰기 전에 cost tracker의 추정과 예약을 거칠 때만 의미가 있습니다. 예약을 건너뛰고 바로 생성 도구를 부르는 경로가 있다면 승인 요구 예외는 발생하지 않습니다. 저는 이 저장소를 도입한다면 유료 도구의 `execute()` 안에서 예약 여부를 확인하는지부터 보겠습니다.

여행자 보험 예제로 옮기면, proposal 단계의 비용 추정이 6달러였고 assets 단계에서 영상 clip 재생성이 반복돼 9달러를 넘는 경우를 생각해 볼 수 있습니다. `warn`이면 총액 초과는 막히지 않고, reviewer skill의 30% 초과 검사가 critical로 잡아 주기를 기대해야 합니다. `cap`이면 예약 단계에서 예외가 납니다.

## 5. 가져올 것과 따져 볼 것: 선언은 넓고, 강제는 몇 군데에 모여 있다

### 어떤 규칙이 코드로 강제되는가

지금까지 본 장치를 강제 수단으로 나누면 다음과 같습니다.

| 규칙 | 선언된 곳 | 강제 수단 | 우회 가능성 |
| --- | --- | --- | --- |
| 렌더 전 promise, slideshow, renderer 검사 | README, compose skill | compose 도구 코드 | promise 데이터가 비어 있으면 일부 건너뜀 |
| 렌더 후 final review | README | compose 도구 코드 | 낮음 |
| 건당 승인, 첫 유료 도구 승인 | config.yaml | cost tracker 코드 (`observe` 제외) | 예약을 거치지 않으면 우회 |
| 총예산 상한 | config.yaml | cost tracker 코드 (`cap`일 때만) | 기본값 `warn`에서는 기록만 |
| checkpoint 형식과 상태 값 | checkpoint schema | 쓰기 함수의 검증 | 낮음 |
| 단계 순서 | manifest | 에이전트의 지시 준수 | 높음 |
| 사람 승인 대기 | manifest, checkpoint-protocol skill | 에이전트의 지시 준수 | 높음 |
| 단계 review와 수정 횟수 | reviewer skill | 에이전트의 지시 준수 | 높음 |

checkpoint 쪽은 코드와 지시문이 섞여 있습니다. `lib/checkpoint.py`의 쓰기 함수는 단계 이름이 manifest에 있는지 검사하고, 상태가 completed나 awaiting_human이면 그 단계의 필수 산출물이 들어 있는지 확인한 뒤 schema로 검증합니다. 다음 단계는 completed로 기록된 단계를 기준으로 계산하므로, awaiting_human으로 남은 단계는 completed로 바뀌기 전까지 다음 단계로 넘어가지 않습니다. [\[OpenMontage: checkpoint.py\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/lib/checkpoint.py)

하지만 상태를 completed로 바꾸는 쪽도 에이전트입니다. checkpoint protocol skill은 첫머리에 이 skill이 Python의 `checkpoint_policy.py`를 지시문 기반 protocol로 대체한다고 적고 있고, 창작 단계의 사람 승인을 절대 건너뛰지 말라고 당부합니다. [\[OpenMontage: checkpoint-protocol.md\]](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/skills/meta/checkpoint-protocol.md) 승인 대기를 코드에서 지시문으로 옮겼다는 뜻이고, 그 결정의 장단점은 쓰는 쪽이 판단해야 합니다.

### 지시문에서 코드로 옮길 우선순위

표에서 우회 가능성이 높은 세 줄 가운데, 저라면 사람 승인 대기를 가장 먼저 코드로 옮기겠습니다. 승인을 건너뛰면 그 뒤의 유료 단계가 모두 승인 없이 실행되기 때문입니다.

방법은 어렵지 않습니다. 유료 도구가 실행되기 전에, 그 단계보다 앞선 승인 필요 단계의 checkpoint가 모두 completed이고 승인 표시가 되어 있는지를 확인하면 됩니다. 아래는 그 생각을 옮긴 예시이고, 저장소에 있는 코드가 아닙니다.

```python
# 예시: 유료 도구 실행 전에 앞선 승인 단계를 확인하는 wrapper
def guarded_execute(tool, inputs, manifest, checkpoints, tracker):
    stage = inputs["stage"]
    for s in manifest.stages_before(stage):
        if s.human_approval_default:
            cp = checkpoints.get(s.name)
            if not cp or cp["status"] != "completed" or not cp.get("human_approved"):
                raise PermissionError(f"{s.name} 단계 승인이 없어 {tool.name}을 실행하지 않음")
    entry = tracker.estimate(tool.name, "execute", tool.estimate_cost(inputs))
    tracker.reserve(entry)          # 건당 승인, 첫 유료 도구, cap 검사를 여기서 강제
    result = tool.execute(inputs)
    tracker.reconcile(entry, result.cost_usd, result.success)
    return result
```

이 wrapper가 하는 일은 두 가지입니다. 승인 순서를 지시문이 아니라 checkpoint 파일의 상태로 판정하고, 비용 예약을 선택이 아니라 필수 경로로 만듭니다. 둘 다 저장소에 이미 있는 부품(checkpoint 함수와 cost tracker)을 잇는 일이라 큰 변경이 아니라고 봅니다.

### 언제 이 구조를 쓰지 말아야 하나

저는 다음 조건이면 이 저장소를 그대로 쓰기보다 구조만 가져오는 편이 낫다고 봅니다.

- 사람 승인을 감사 증적으로 남겨야 하는 경우. checkpoint schema에는 승인 필요 여부와 승인 여부를 나타내는 boolean이 있지만, 승인자를 적는 전용 필드는 없습니다.
- 여러 사람이 같은 pipeline을 동시에 돌리는 경우. 오케스트레이터가 각자의 코딩 에이전트이므로 실행 방식이 사람마다 달라질 수 있습니다.
- 지출 상한이 계약 조건인 경우. 기본 mode와 예약 우회 가능성을 먼저 막아야 합니다.

### 보수적인 조직의 눈으로 보면

보험이나 금융처럼 보수적인 조직의 관점에서는 익숙한 대응 관계가 보입니다. manifest는 업무 절차서, decision log는 감사 추적, 건당 승인 금액은 전결 규정, `review_focus`는 점검표에 해당합니다.

차이는 집행자입니다. 절차서는 사람이 지키고 감사가 확인하지만, 여기서는 에이전트가 지키고 에이전트가 확인합니다. 그래서 저는 상품 안내처럼 심의가 필요한 영상이라면, 사람 승인과 예산 `cap`처럼 반드시 지켜져야 하는 항목을 지시문이 아니라 코드에서 강제하는 쪽으로 옮기겠습니다. 에이전트를 도입할 때 새로 발명할 것은 많지 않고, 기존 통제를 파일과 코드로 옮기는 일이 대부분이라고 생각합니다.

## 6. 오늘 바로 적용할 수 있는 순서

README의 설치 명령은 다음과 같습니다. Python 3.10 이상, FFmpeg, Node.js 18 이상, 그리고 Claude Code, Cursor, Copilot, Windsurf, Codex 가운데 하나의 코딩 어시스턴트가 필요합니다. clone 주소는 README에 적힌 그대로입니다.

```bash
git clone https://github.com/calesthio/OpenMontage.git
cd OpenMontage
make setup
```

1. 설치한 뒤 유료 key 없이 한 편을 만들어 봅니다. README는 Piper TTS, 무료 stock과 공개 아카이브 소스, Remotion, FFmpeg만으로 가능한 경로를 안내합니다.
2. `config.yaml`의 `budget.mode`를 확인하고, 실제 과금이 걸린 환경이라면 `cap`을 검토합니다. 유료 도구가 실행 전에 예약을 거치는지도 확인합니다.
3. `pipeline_defs/`의 manifest 하나를 처음부터 끝까지 읽고, 어느 단계가 사람 승인을 요구하는지, 그 승인이 코드와 지시문 중 어디서 강제되는지 표시해 봅니다.
4. 한 편을 만든 뒤 checkpoint, decision log, final review를 열어 각 선택의 근거와 검사 결과가 남았는지 확인합니다.
5. 자기 프로젝트에 옮길 때는 영상이 아니어도 됩니다. 단계별 `produces`, `success_criteria`, 승인 여부를 YAML로 선언하고, 그중 반드시 지켜야 할 것부터 코드 게이트로 옮깁니다.

## 마치며

OpenMontage는 영상 도구로도 쓸 수 있지만, 긴 작업을 에이전트에게 맡길 때 무엇을 선언해야 하는지를 보여 주는 예제로 읽을 만합니다.

단계와 계약을 파일로 꺼내 놓으면 사람이 검토할 수 있고, 렌더 전후의 검사를 도구 코드에 넣으면 에이전트가 건너뛸 수 없으며, 지출과 선택을 log로 남기면 나중에 설명할 수 있습니다.

가져다 쓸 때는 어떤 규칙이 코드로 강제되고 어떤 규칙이 지시문에 머무는지 구분해서 보시길 권합니다.

## 참고 자료

- [OpenMontage README (2026-04-12 기준)](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/README.md)
- [pipeline_defs/animated-explainer.yaml](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/pipeline_defs/animated-explainer.yaml)
- [tools/video/video_compose.py](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/tools/video/video_compose.py)
- [lib/delivery_promise.py](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/lib/delivery_promise.py)
- [schemas/artifacts/decision_log.schema.json](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/schemas/artifacts/decision_log.schema.json)
- [tools/cost_tracker.py](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/tools/cost_tracker.py)
- [config.yaml](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/config.yaml)
- [lib/checkpoint.py](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/lib/checkpoint.py)
- [skills/meta/reviewer.md](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/skills/meta/reviewer.md)
- [skills/meta/checkpoint-protocol.md](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/skills/meta/checkpoint-protocol.md)
- [tools/base_tool.py](https://github.com/OpenMontageInc/OpenMontage/blob/a06d4c234e436f5a9c5889f2271f4516ef8f6b10/tools/base_tool.py)
- [OpenMontage initial release commit](https://github.com/OpenMontageInc/OpenMontage/commit/a3e735cc7abb7f5c703944d763bd1d847ead544b)
