---
title: "모델 라우팅과 폴백 체인: 모델이 바뀌어도 동작이 같아야 하네스입니다"
date: 2026-10-30
description: "작업 종류별 모델과 추론 강도 선택, 사유별로 다른 폴백 경로, 전환 지점에서 깨지는 캐시와 추론 블록과 도구 해석, 서빙 모델 기록을 리뷰 에이전트 예시로 정리했습니다."
category: 에이전트 엔지니어링
tags: [하네스, 오케스트레이션, LLM, AI Agent, 관측성]
draft: false
---

:::note
- 라우팅의 단위는 요청이 아니라 작업 종류이고, 모델을 바꾸기 전에 추론 강도(effort)부터 조절하는 편이 쌉니다.
- 폴백 사유는 일시 장애, 한도, 컨텍스트 초과, 거절, 형식 위반으로 나뉘며 각각 다른 경로가 필요합니다. 거절은 HTTP 200으로 오므로 오류율 모니터링에 잡히지 않습니다.
- 모델이 바뀌는 지점에서는 프롬프트 캐시, 추론 블록, 도구 스키마 해석이 함께 바뀝니다. 폴백은 모델 이름 교체가 아니라 요청 변환이고, 체인의 모든 모델을 같은 eval로 검증해야 합니다.
- 어느 모델이 답했는지를 요청마다 기록하지 않으면 라우팅은 디버깅할 수 없는 변수가 됩니다.
:::

"게이트웨이에 폴백 모델 하나 걸어 두면 가용성은 해결된다"는 생각이 흔합니다.

요청이 실패하지 않는다는 뜻이라면 맞습니다. 하지만 에이전트는 한 번의 응답이 아니라 수십 턴에 걸친 작업이고, 중간에 모델이 바뀌면 그 뒤의 모든 턴이 다른 성격의 모델 위에서 돌아갑니다.

**폴백은 가용성 설정이 아니라 동작 계약의 문제입니다. 모델이 바뀐 뒤에도 출력 형식, 도구 사용, 비용이 예측 범위 안에 있어야 합니다.**

이 주제가 요즘 더 무거워진 이유도 있습니다. Microsoft는 2026년 10월 28일 자사 Copilot 하네스를 Foundry로 제공한다고 발표하면서, 20개가 넘는 모델 위에서 작업에 맞는 모델로 일을 보내는 것을 하네스의 역할로 내세웠습니다 [\[Microsoft: Introducing the Microsoft Copilot harness\]](https://blogs.microsoft.com/blog/2026/10/28/introducing-the-microsoft-copilot-harness-unlocking-the-potential-of-truly-multi-model-agentic-work/). 하루 뒤 Factory도 Droid 1.0을 내놓으며 자동 모델 라우터인 Factory Router를 함께 소개했습니다 [\[Factory: Droid 1.0\]](https://factory.com/news/frontier-harness).

여러 모델을 쓰는 것이 기본값이 되어 가고 있고, 그만큼 전환 지점의 설계가 중요해졌습니다. 이 글은 하나의 리뷰 에이전트를 따라가며 라우팅을 정하고, 폴백 경로를 나누고, 전환 지점을 다루고, 기록하는 순서로 갑니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 풀 리퀘스트를 검토해 정해진 JSON 형식으로 지적 사항을 내는 리뷰 에이전트가 있다고 해봅시다. 변경 파일을 읽고, 관련 테스트를 찾아 돌려 보고, 파일별로 지적 사항을 모은 뒤 마지막에 하나의 JSON 배열로 냅니다. 한 PR당 수십 턴이 돕니다.

어느 오후 주 모델에 한도 오류가 나기 시작하고, 게이트웨이는 설정대로 폴백 모델로 요청을 넘깁니다. 오류는 사라집니다.

그런데 폴백 모델은 같은 도구 스키마를 조금 다르게 채웁니다. 선택 필드를 빼먹고, 심각도 값을 다른 표기로 씁니다. 뒤따르는 파서가 일부 결과를 버립니다.

며칠 뒤 "리뷰가 가끔 비어 있다"는 문의가 옵니다. 로그에는 요청한 모델 이름만 있고, 실제로 답한 모델은 남아 있지 않습니다.

시스템 설계 용어로 짚으면, 폴백 경로가 한 번도 검증되지 않은 채 운영에 들어갔고, 서빙 모델이 관측되지 않았습니다. 폴백이 동작했기 때문에 생긴 장애입니다.

## 1. 라우팅 단위는 작업 종류이고, 모델보다 effort를 먼저 돌립니다

### 요청 단위 라우터는 어떻게 고르는가

요청마다 모델을 고르는 라우터가 실제로 무엇을 하는지부터 보겠습니다.

OpenRouter가 2026년 8월 10일 공개한 Auto 라우터 개편 글에 따르면, 이 라우터는 요청마다 네 단계를 거칩니다. 가벼운 분류기가 프롬프트를 약 30개의 세부 작업 유형 중 하나로 분류하고, 그 유형에서 지난 7일 동안 사용자들이 실제로 지출한 모델의 비중으로 순위를 매기고, 요청의 `cost_tier`에 맞는 가격대의 후보를 고른 뒤, 고른 모델을 주 선택과 폴백 목록으로 삼아 보냅니다 [\[OpenRouter: Model Routing Powered by Wisdom of the Market\]](https://openrouter.ai/blog/announcements/introducing-the-new-auto-router/).

같은 글은 결과표가 한 시점의 기록이며 커뮤니티의 선호가 바뀌면 함께 바뀐다고 밝힙니다. 사용자들이 다른 모델로 옮겨 가면 라우터도 며칠 안에 따라간다는 것입니다.

이것은 범용 트래픽에는 장점입니다. 하지만 하네스를 만드는 입장에서는 다른 면도 봐야 합니다. 같은 리뷰 요청이 다음 주에는 다른 모델로 갈 수 있고, 그 모델이 우리 도구 스키마를 어떻게 채우는지는 우리가 시험한 적이 없을 수 있습니다.

### 하네스는 작업 종류별로 정해 둡니다

그래서 하네스에서는 요청이 아니라 작업 종류별로 모델과 effort를 정해 두는 쪽이 예측하기 쉽다고 봅니다. 분류는 하네스가 이미 알고 있습니다. 리뷰 에이전트의 한 턴이 파일 탐색인지, 테스트 실행 결과 해석인지, 최종 판정인지는 하네스의 단계 정의에서 나오기 때문입니다.

구현은 단순합니다. 하네스가 단계를 시작할 때 라우트 이름을 정하고, 그 단계의 세션을 열 때 라우트에 적힌 모델과 effort로 고정합니다. 분류기를 따로 돌릴 필요가 없으니 분류가 틀릴 일도 없고, 같은 PR을 다시 돌리면 같은 단계가 같은 모델로 갑니다. 재현이 된다는 것이 이 방식의 가장 큰 이점입니다.

Anthropic의 모델 선택 문서(2026년 10월 28일 보관본)는 여러 모델이 지원하는 effort 파라미터가 한 모델 안에서 지능을 지연 시간과 비용으로 맞바꾸며, effort 조정이 모델 교체보다 나은 레버인 경우가 많다고 설명합니다. 그리고 기본값에서 시작해 eval 결과를 보고 올리거나 내리라고 권합니다 [\[Anthropic: Choosing the right model\]](https://web.archive.org/web/20261028093959/https://platform.claude.com/docs/en/about-claude/models/choosing-a-model).

같은 문서는 빠르고 저렴한 모델로 시작해 사용 사례를 충분히 시험하고, 구체적인 능력 차이가 확인될 때만 올리는 접근도 제시합니다.

리뷰 에이전트의 단계를 작업 종류 표로 옮기면 대략 이런 모양이 됩니다.

| 리뷰 에이전트의 단계 | 모델 등급 | effort | 근거 |
| --- | --- | --- | --- |
| 변경 분류, 리뷰 대상 파일 고르기 | 소형 | 낮음 | 출력이 짧고 스키마로 검증 가능 |
| 파일 탐색, 테스트 로그 요약 | 소형 또는 중형 | 낮음에서 중간 | 양이 많고 틀려도 다음 단계에서 걸러짐 |
| 파일별 지적 사항 작성 | 중형 또는 대형 | 높음 | 코드 맥락을 길게 따라가야 함 |
| 최종 판정과 중복 제거 | 대형 | 높음 이상 | 틀렸을 때 비용이 큼, 사람에게 바로 보임 |

표의 값은 제가 든 예시이고, 실제 값은 각자의 eval로 정해야 합니다.

### 비교의 단위는 토큰이 아니라 끝낸 작업입니다

effort를 낮출지 모델을 내릴지 비교할 때 무엇을 재느냐가 결론을 바꿉니다.

Anthropic의 비용 최적화 문서(2026년 10월 29일 보관본)는 모델을 고르거나 바꿀 때 토큰당 비용이 아니라 완료한 작업당 비용으로 비교하라고 적고, 비용이 높은데 품질이 괜찮다면 지금 쓰는 모델에서 effort를 낮춰 보라고 권합니다 [\[Anthropic: Optimizing for cost and intelligence\]](https://web.archive.org/web/20261029151211/https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence).

리뷰 에이전트라면 "PR 한 건의 리뷰를 사람이 고칠 필요 없이 끝낸 비용"이 단위가 됩니다. 토큰 단가가 싼 모델이 턴을 두 배로 쓰거나 재시도를 부르면, 작업당 비용은 오히려 올라갑니다.

### 이 방식의 한계

작업 종류별 고정 라우팅은 작업 종류가 하네스에 정의되어 있을 때만 성립합니다. 사용자가 무엇을 물을지 모르는 범용 채팅에는 맞지 않습니다. 그런 곳에서는 요청 단위 라우터가 합리적인 선택일 수 있습니다.

또 하나의 한계는 표가 낡는다는 점입니다. 모델이 새로 나오면 표의 어느 칸이 바뀌어야 하는지 다시 재야 합니다. 저는 이 비용을 정기적인 eval 실행으로 치르는 편이, 라우터가 조용히 바꿔 주는 것보다 낫다고 봅니다. 바뀌는 시점을 내가 정할 수 있기 때문입니다.

## 2. 폴백 사유는 하나가 아니고, 사유마다 길이 다릅니다

"모델이 실패했다"는 한 가지 사건이 아닙니다.

### 게이트웨이는 장애를 어떻게 처리하는가

LiteLLM의 Router 문서(2026년 10월 28일 보관본)를 보면 장애 처리의 단계가 잘 드러납니다. 같은 모델 그룹 안에서 배포마다 `order`로 우선순위를 두고, `order=1` 배포가 연결 오류나 404, 429 같은 실패를 내면 `order=2`, `order=3` 순으로 넘어갑니다. 각 단계는 다음 단계로 넘어가기 전에 자기 재시도를 따로 갖고, 모든 단계가 소진되면 별도로 설정한 폴백으로 넘어갑니다 [\[LiteLLM: Router\]](https://web.archive.org/web/20261028230155/https://docs.litellm.ai/docs/routing).

같은 문서는 배포를 잠시 풀에서 빼는 cooldown 규칙도 설명합니다. 별도 설정이 없으면 429 응답에는 즉시, 1분 안의 실패율이 50%를 넘으면, 401이나 404, 408 같은 재시도로 풀리지 않는 오류에도 기본 5초 동안 해당 배포를 빼고 나머지 배포로 처리합니다. 컨텍스트 윈도 초과에 대비해 더 큰 윈도의 모델을 따로 지정하는 설정(`context_window_fallback_dict`)도 있습니다.

이 구조에서 배울 점은 순서입니다. 같은 모델의 다른 배포가 먼저이고, 다른 모델은 그다음입니다.

### 거절은 오류가 아닙니다

거절은 또 다릅니다. Anthropic 문서(2026년 10월 29일 보관본)에 따르면 거절은 오류가 아니라 `stop_reason: "refusal"`이 담긴 HTTP 200 응답입니다. 그래서 오류율이나 5xx 응답에 기대는 모니터링은 거절을 보지 못합니다 [\[Anthropic: Refusals and fallback\]](https://web.archive.org/web/20261029053545/https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback).

같은 문서의 "흔한 실수" 목록은 하네스 설계자에게 그대로 체크리스트가 됩니다.

- 거절된 요청을 같은 모델로 다시 보내면 대개 또 거절되므로, 재시도는 폴백 모델로 보냅니다.
- 재시도 예산은 턴이나 세션이 아니라 요청마다 잡습니다. 한 턴에서 에이전트와 하위 에이전트가 각각 거절을 낼 수 있기 때문입니다.
- 재시도 핸들러, 오류 복구 분기, 백그라운드 워커까지 모든 요청 경로에 폴백을 설정합니다.
- 하위 에이전트 호출에는 따로 폴백을 줍니다. `fallbacks` 파라미터는 하위 에이전트의 모델 호출로 이어지지 않습니다.
- 폴백을 공유 플래그나 전역 설정 같은 주변 상태가 아니라 요청의 속성으로 둡니다.
- 거절과 폴백 응답을 각각 이벤트로 남기고, 두 수의 차이에 경보를 겁니다.

리뷰 에이전트에 하위 에이전트가 있다면, 예컨대 테스트 실패를 따로 분석하는 작은 에이전트가 있다면, 그 호출에도 폴백이 걸려 있는지 확인해야 합니다. 주 루프에만 걸어 두면 정확히 폴백이 필요한 곳에서 보호가 빠집니다.

### 서버 쪽 폴백은 무엇을 대신해 주는가

거절에 대해서는 서버 쪽 기능도 있습니다. Anthropic은 2026년 6월 9일 거절된 요청을 다른 모델에서 다시 실행하는 `fallbacks` 파라미터를 베타로 공개했고, 7월 24일에는 거절 범주별로 권장 모델을 적용하는 `"default"` 모드를 추가했습니다 [\[Anthropic: Claude Platform release notes\]](https://platform.claude.com/docs/en/release-notes/overview).

10월 29일 보관본 문서 기준으로, 직접 지정할 때는 폴백 모델을 세 개까지 나열할 수 있고, 어느 쪽이든 한 번의 API 호출 안에서 재시도가 이루어져 답한 모델을 밝힌 하나의 응답이 돌아옵니다. 다만 이 기능은 Message Batches API에서는 지원되지 않고, 소형 모델인 Claude Haiku 5.5에는 서버 쪽 폴백이 없다고 적혀 있습니다 [\[Anthropic: Refusals and fallback\]](https://web.archive.org/web/20261029053545/https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback).

리뷰 에이전트의 분류 단계를 소형 모델로 돌린다면, 그 단계의 거절은 서버가 대신 처리해 주지 않는다는 뜻입니다. 하네스가 직접 다뤄야 합니다.

### 거절에도 비용과 한도가 걸립니다

거절이 공짜라고 생각하면 재시도 예산을 잘못 잡게 됩니다. 같은 보관본 문서의 과금 설명을 보면, 출력이 나오기 전의 거절은 범주에 따라 과금 여부가 갈리지만 어느 경우든 요청은 한도에 집계됩니다. 출력 도중의 거절은 입력 토큰과 이미 스트리밍된 출력이 정상 요금으로 과금되고, 폴백을 쓰면 폴백 요청에 더해 원래의 거절도 그 조건에 따라 과금됩니다 [\[Anthropic: Refusals and fallback\]](https://web.archive.org/web/20261029053545/https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback). 6월 9일 릴리스 노트도 폴백으로 다시 실행된 요청은 폴백 모델의 요금으로 과금된다고 적고 있습니다 [\[Anthropic: Claude Platform release notes\]](https://platform.claude.com/docs/en/release-notes/overview).

리뷰 에이전트에 적용하면, 긴 diff를 스트리밍하다 거절이 나는 경우가 가장 비쌉니다. 이미 읽은 입력과 쓴 출력을 내고, 대체 모델로 다시 냅니다. 그래서 거절이 반복되는 PR 유형이 보이면, 체인을 늘리기보다 그 유형을 자동 리뷰 대상에서 빼는 편이 싸다고 봅니다.

### 사유별 경로표

| 사유 | 신호 | 권하는 경로 |
| --- | --- | --- |
| 일시 장애, 과부하 | 연결 오류, 서버 오류 | 같은 모델 재시도 후 같은 모델의 다른 배포 |
| 한도 초과 | 429 | 대기 후 재시도, 급하면 다른 배포 |
| 컨텍스트 초과 | 컨텍스트 길이 오류 | 압축을 먼저 시도, 그다음 더 큰 윈도의 모델 |
| 거절 | 200 응답의 `stop_reason: "refusal"` | 검증해 둔 대체 모델로 한 번, 그래도 거절이면 사람에게 |
| 형식 위반 | 스키마 검증 실패 | 같은 모델로 한 번 재요청, 반복되면 중단 |

오른쪽 열은 제 의견입니다. 요점은 다른 모델로 넘기는 것이 대부분의 사유에서 첫 번째 선택이 아니라는 것입니다. 다른 모델이 첫 선택인 것은 거절뿐입니다.

### 실패 모드: 폴백이 폴백을 부를 때

사유를 나누지 않으면 경로가 섞입니다. 형식 위반을 다른 모델로 넘기면, 그 모델은 다른 방식으로 형식을 어기고, 다시 다음 모델로 넘어갑니다. 체인 끝까지 가면 비용은 몇 배가 되고 결과는 가장 덜 검증된 모델에서 나옵니다.

그래서 저는 요청마다 홉 수 상한을 두고, 상한에 닿으면 실패로 끝내는 편을 권합니다. 리뷰 에이전트라면 "이 PR은 자동 리뷰를 끝내지 못했습니다"라고 남기는 것이 빈 리뷰를 조용히 내는 것보다 낫습니다.

## 3. 전환 지점에서 깨지는 것은 캐시, 추론 블록, 도구 해석입니다

모델을 바꾸면 응답만 바뀌는 것이 아닙니다. 요청의 다른 부분도 새 모델에 맞게 바뀌어야 합니다.

### 프롬프트 캐시

리뷰 에이전트의 턴마다 시스템 프롬프트, 도구 정의, 지금까지 읽은 파일과 대화가 다시 들어갑니다. 이 앞부분은 캐시로 싸게 처리됩니다. 모델이 바뀌면 그 캐시는 쓸 수 없습니다.

OpenRouter는 앞의 8월 글에서 여러 모델 사이를 오가는 라우팅 전략은 입력 캐시를 다시 쌓느라 비용이 늘어나며, 너무 자주 바꾸면 낭비가 될 수 있어서 여러 턴의 대화를 한 모델에 붙여 두는 sticky 동작을 넣었다고 설명합니다 [\[OpenRouter: Model Routing Powered by Wisdom of the Market\]](https://openrouter.ai/blog/announcements/introducing-the-new-auto-router/).

Anthropic은 거절 폴백에 대해 캐시 미스를 보전하는 fallback credit을 따로 두어, 대화를 두 번 캐싱하는 비용을 내지 않게 한다고 적고 있습니다 [\[Anthropic: Refusals and fallback\]](https://web.archive.org/web/20261029053545/https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback). 공급자가 이런 보전 장치를 따로 만들 만큼, 전환의 캐시 비용은 무시할 수 없는 크기라고 읽힙니다.

### 추론 블록과 파라미터

대화 기록에 남은 추론 블록은 다른 모델이 읽지 못하는 경우가 있습니다.

LiteLLM 문서는 실패한 배포의 암호화된 추론을 복호화할 수 없는 배포(다른 공급자나 다른 API 키)로 넘어갈 때 그 추론 항목을 버리고 요약만 유지한다고 적고 있습니다. 그렇게 하지 않으면 오류로 끝나기 때문입니다 [\[LiteLLM: Router\]](https://web.archive.org/web/20261028230155/https://docs.litellm.ai/docs/routing).

Anthropic 문서도 거절 후 직접 재전송할 때 원래 요청의 `thinking` 설정이 대체 모델이 받지 않는 값이라면 먼저 바꿔야 한다고 안내하고, 이전의 추론 블록은 특정 모델끼리만 읽을 수 있어 다른 대체 모델에서는 쓰이지 않는다고 설명합니다 [\[Anthropic: Refusals and fallback\]](https://web.archive.org/web/20261029053545/https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback).

리뷰 에이전트의 관점에서 이것은 맥락의 손실입니다. 주 모델이 열 턴 동안 쌓은 추론, 예컨대 "이 함수는 호출부에서 null을 넘기지 않는다"는 판단이 폴백 모델에게는 요약으로만, 또는 아예 전달되지 않습니다.

### 스트리밍 중간의 전환

스트리밍 응답에서는 전환이 출력 도중에 일어날 수 있습니다. Anthropic 문서에 따르면 출력 도중 거절이 나면 열려 있던 콘텐츠 블록이 닫히고, 경계에 `fallback` 블록이 들어간 뒤, 대체 모델이 부분 출력에서 이어서 씁니다. 이때 부분 출력 중 텍스트 블록만 대체 모델의 맥락으로 넘어갑니다 [\[Anthropic: Refusals and fallback\]](https://web.archive.org/web/20261029053545/https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback).

리뷰 에이전트가 JSON을 스트리밍으로 내고 있었다면, 배열의 앞부분은 주 모델이, 뒷부분은 대체 모델이 쓴 결과가 됩니다. 파서가 `fallback` 블록을 모르고 텍스트만 이어 붙이면, 두 모델의 서로 다른 표기가 한 배열에 섞입니다.

### 도구와 출력 형식

같은 도구 스키마를 줘도 모델마다 채우는 방식이 다릅니다. 시나리오의 장애가 여기서 나왔습니다.

Factory는 Droid 1.0 글에서 지원하는 모델마다 프롬프트, 도구 설명, 도구 호출 방식을 따로 조정한다고 밝힙니다. 또 한 모델에만 맞춰 튜닝하면 진짜 개선과 그 모델의 버릇에 대한 적응을 구분하기 어렵다고 쓰고, 변경 하나하나를 영향받는 모든 모델 계열에서 시험한다고 설명합니다 [\[Factory: Droid 1.0\]](https://factory.com/news/frontier-harness).

규모는 다르지만 원칙은 같다고 봅니다. 폴백 체인에 올린 모델은 주 모델과 같은 eval 세트를 통과해야 하고, 통과하지 못한 모델은 체인에 넣지 않습니다.

### 체인 검증은 처음부터가 아니라 중간부터 돌립니다

폴백 모델에 eval을 돌린다고 할 때 흔히 하는 방식은 같은 평가 세트를 폴백 모델로 처음부터 다시 돌리는 것입니다. 이것만으로는 부족하다고 봅니다.

운영에서 폴백 모델은 빈 세션이 아니라, 주 모델이 열 턴쯤 진행한 세션을 넘겨받습니다. 캐시는 비어 있고, 추론 블록은 빠져 있고, 앞선 도구 호출 결과는 주 모델의 방식으로 쌓여 있습니다. 처음부터 혼자 잘하는 모델이 이 상태에서도 잘한다는 보장은 없습니다.

그래서 리뷰 에이전트의 체인 검증은 두 갈래로 돌리는 편이 좋습니다. 하나는 폴백 모델 단독 실행이고, 다른 하나는 평가 세트의 각 PR을 주 모델로 몇 턴 진행한 뒤 하네스가 강제로 거절이나 장애를 주입해 폴백 모델로 넘기는 실행입니다. 두 번째 실행의 통과율이 첫 번째보다 크게 낮다면, 문제는 모델이 아니라 요청 변환에 있을 가능성이 큽니다.

### 폴백은 요청 변환입니다

위 네 가지를 합치면, 폴백은 모델 이름만 바꿔 다시 보내는 일이 아니라 요청을 대체 모델에 맞게 변환하는 일입니다. 하네스에 그 변환을 한곳에 모아 두면 이런 모양이 됩니다.

```ts
// 예시: 대체 모델로 넘기기 전의 요청 변환 (특정 SDK의 API가 아닙니다)
function adaptForFallback(req: AgentRequest, target: ModelProfile): AgentRequest {
  const out = structuredClone(req);
  out.model = target.id;
  // 1. 대체 모델이 받지 않는 파라미터 정리
  if (!target.supports.thinking(req.thinking)) out.thinking = target.defaultThinking;
  if (!target.supports.effort(req.effort)) out.effort = target.closestEffort(req.effort);
  // 2. 읽을 수 없는 추론 블록은 제거하고, 하네스가 관리하는 요약을 대신 넣음
  out.messages = dropUnreadableReasoning(req.messages, target);
  out.messages.push(harnessNote(req.sessionSummary));     // "지금까지의 판단 요약"
  // 3. 모델별로 검증해 둔 도구 설명과 출력 지시로 교체
  out.tools = toolVariants.for(target.family);
  out.system = systemPromptVariants.for(target.family);
  return out;
}
```

`sessionSummary`는 하네스가 턴마다 갱신하는 판단 요약입니다. 추론 블록이 넘어가지 못하는 경우를 위해, 중요한 중간 결론을 하네스가 따로 들고 있게 하는 것입니다. 이 요약이 없으면 폴백 모델은 열 턴 전의 판단을 처음부터 다시 해야 합니다.

## 4. 예측 가능성은 누가 답했는지 기록하는 데서 시작합니다

### 응답에 이미 들어 있는 정보

다행히 필요한 정보는 응답에 들어 있습니다.

Anthropic의 서버 쪽 폴백은 답한 모델을 응답에 밝히고, 한 모델의 출력이 다음 모델로 넘어간 지점마다 `fallback` 콘텐츠 블록을 남깁니다. 시도별 사용량은 `usage.iterations`에 따로 기록되고, 그 안의 `fallback_message` 항목이 폴백으로 처리된 응답을 표시합니다 [\[Anthropic: Refusals and fallback\]](https://web.archive.org/web/20261029053545/https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback). OpenRouter도 응답의 `model` 필드가 어느 모델이 선택됐는지 알려 준다고 적고 있습니다 [\[OpenRouter: Model Routing Powered by Wisdom of the Market\]](https://openrouter.ai/blog/announcements/introducing-the-new-auto-router/).

하네스가 할 일은 이 값을 버리지 않는 것입니다.

### 라우팅 정책을 설정으로 꺼냅니다

저라면 라우팅 정책을 다음처럼 코드 밖 설정으로 두고, 턴마다 결과를 기록하겠습니다.

```yaml
# 예시: 작업 종류별 라우팅 정책 (특정 제품의 문법이 아닙니다)
routes:
  code_review.final_verdict:
    primary:   { model: large-a, effort: high }
    on_transient: { retry: 2, then: same_model_other_deployment }
    on_rate_limit: { backoff: exponential, max_wait: 30s, then: same_model_other_deployment }
    on_refusal:   { chain: [large-b], max_hops: 1, then: escalate_to_human }
    on_context_overflow: { first: compact, then: { model: large-a-long } }
    on_schema_violation: { retry_same_model: 1, then: fail }
    sticky_per_session: true        # 세션 중간 교체는 위 사유가 있을 때만
    qualified_by: evals/code_review # 체인의 모든 모델이 통과해야 하는 eval
  code_review.triage:
    primary:   { model: small-a, effort: low }
    on_refusal: { chain: [], then: escalate_to_human }  # 서버 쪽 폴백이 없는 모델
log_fields: [route, requested_model, served_model, effort, hop_reason, hop_count,
             cache_read_tokens, cache_write_tokens, cost, schema_valid]
```

`requested_model`과 `served_model`을 나란히 남기면, 시나리오의 "가끔 비어 있는 리뷰"는 쿼리 한 번으로 폴백 모델과 묶입니다. `schema_valid`까지 함께 남기면, 어느 모델이 어느 비율로 형식을 어기는지도 같은 쿼리로 나옵니다.

### 기록에서 무엇을 볼까

로그 필드가 있어도 보는 지표가 없으면 시나리오의 장애는 다시 며칠 뒤에야 발견됩니다. 리뷰 에이전트라면 다음 정도를 라우트별로 보는 편이 좋다고 봅니다.

| 지표 | 계산 | 이상 신호 |
| --- | --- | --- |
| 폴백 비율 | `served_model != requested_model`인 턴의 비율 | 평소보다 급증하면 주 모델 쪽 문제 |
| 거절과 폴백 응답의 차이 | 거절 이벤트 수에서 폴백으로 처리된 응답 수를 뺀 값 | 0보다 크면 보호받지 못한 경로가 있음 |
| 서빙 모델별 스키마 통과율 | `served_model`로 묶은 `schema_valid` 비율 | 특정 모델에서만 낮으면 그 모델의 도구 변형을 다시 검증 |
| 전환 직후 캐시 비율 | 전환 다음 턴의 `cache_read_tokens` 비중 | 계속 낮으면 sticky 설정이 깨졌을 가능성 |
| 요청당 홉 수 | `hop_count` 분포 | 상한에 닿는 요청이 늘면 사유 분류를 다시 점검 |

두 번째 지표는 Anthropic 문서가 권하는 경보 방식을 하네스 지표로 옮긴 것이고, 나머지는 제 제안입니다.

### 세션을 한 배포에 붙여 둡니다

`sticky_per_session`은 게이트웨이에서도 구현할 수 있습니다. LiteLLM 문서는 세션 식별자가 같은 요청을 처음 배정된 배포로 좁히는 session affinity를 설명합니다. 고정된 배포가 cooldown 중이면 나머지 정상 배포로 넘어가되 고정은 유지해, 배포가 회복되면 세션이 원래 배포로 돌아온다고 적고 있습니다. 부하 분산은 요청 단위가 아니라 세션 단위로 이루어집니다 [\[LiteLLM: Router\]](https://web.archive.org/web/20261028230155/https://docs.litellm.ai/docs/routing).

리뷰 에이전트에서는 PR 하나가 한 세션입니다. 세션 식별자로 PR 번호와 리뷰 회차를 쓰면, 같은 리뷰의 턴들이 같은 배포와 같은 캐시를 씁니다.

### 실패하는 편이 나은 경우

허용 목록도 필요합니다. OpenRouter Auto 라우터는 `allowed_models`로 후보를 좁힐 수 있고, 계정과 요청의 모델 및 공급자 제한을 지킨다고 설명합니다 [\[OpenRouter: Model Routing Powered by Wisdom of the Market\]](https://openrouter.ai/blog/announcements/introducing-the-new-auto-router/).

같은 글은 분류나 순위 데이터를 쓸 수 없을 때 기본 모델 집합으로 넘어가 라우팅 문제로 요청이 실패하지 않게 했다고도 적습니다. 범용 서비스에서는 합리적인 선택입니다.

하지만 리뷰 에이전트처럼 출력 형식이 계약인 곳에서는, 저는 조용히 아무 모델로나 넘어가는 것보다 실패하는 편이 낫다고 봅니다. eval을 통과한 모델이 하나도 남지 않았다면, 그 사실을 사람이 알아야 합니다. 하네스 설정의 `then: fail`과 `escalate_to_human`이 그 자리입니다.

## 5. 비용은 라우팅보다 캐시에서 먼저 줄입니다

### 레버의 두 종류

라우팅을 비용 절감 수단으로만 보면 순서가 뒤집힙니다.

Anthropic의 비용 최적화 문서는 레버를 둘로 나눕니다. 품질을 건드리지 않고 지출을 줄이는 것(프롬프트 캐싱, 토큰 정리, 프롬프트 점검, 배치)과 비용을 지능과 맞바꾸는 것(모델 선택, effort, 출력 상한과 세션 예산, 다중 모델 구조)입니다. 그리고 자사 측정에서는 프롬프트 캐싱이 대체로 가장 큰 레버였고 다중 모델 레버는 적용 범위가 더 좁았다고 적습니다 [\[Anthropic: Optimizing for cost and intelligence\]](https://web.archive.org/web/20261029151211/https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence).

3절의 내용과 합치면 결론이 나옵니다. 세션 중간에 모델을 자주 바꾸는 라우팅은 가장 큰 레버인 캐시를 깨뜨립니다.

### 리뷰 에이전트에 적용하면

리뷰 에이전트의 비용을 줄이는 순서를 레버의 종류대로 적으면 이렇습니다.

```text
1. 캐시     시스템 프롬프트와 도구 정의를 고정하고, 변경 파일은 뒤에 붙여 앞부분을 캐시
2. 정리     테스트 로그는 실패한 부분만, 변경 없는 파일은 경로만 넣기
3. effort   파일 탐색과 로그 요약 단계의 effort를 한 단계 낮춰 같은 eval로 비교
4. 모델     위 셋으로 부족할 때만 분류 단계를 소형 모델로 내리기
5. 구조     그래도 부족할 때만 하위 에이전트로 쪼개 저렴한 모델에 일을 나누기
```

순서는 제 의견이지만, 위의 두 문서가 말하는 레버의 크기와 범위를 따른 것입니다. 1과 2는 품질을 건드리지 않고, 3부터는 품질과 비용을 맞바꾸므로 eval이 필요합니다.

그래서 작업 시작 시점에 모델을 정하고 세션 동안 유지하는 방식을 기본으로 두는 편이 안전합니다.

### 다중 모델 구조는 세션 중간 교체와 다릅니다

위 순서의 5번은 여러 모델을 쓰지만, 세션 중간에 모델을 바꾸는 것과는 성격이 다릅니다.

Anthropic의 모델 선택 문서는 저렴한 모델과 프런티어 모델을 짝지어 대부분의 토큰을 낮은 요금으로 처리하는 두 가지 흔한 패턴을 소개합니다. 실행자가 어려운 결정만 조언자 모델에게 올리는 방식과, 오케스트레이터가 대량 작업을 저렴한 작업자 모델에게 나눠 주는 방식입니다 [\[Anthropic: Choosing the right model\]](https://web.archive.org/web/20261028093959/https://platform.claude.com/docs/en/about-claude/models/choosing-a-model).

리뷰 에이전트에 오케스트레이터 방식을 적용하면, 대형 모델이 PR 전체를 보고 파일별 검토를 저렴한 모델의 하위 세션에 나눠 준 뒤 결과를 모아 최종 판정을 합니다. 이때 각 하위 세션은 처음부터 끝까지 한 모델로 돌고, 자기 캐시를 씁니다. 모델이 어디서 바뀌는지가 설계 시점에 정해져 있으므로, 3절에서 본 전환 비용이 세션 안에서 생기지 않습니다.

저는 이 차이가 중요하다고 봅니다. 같은 "다중 모델"이라도 경계가 설계에 있으면 eval로 검증할 수 있고, 경계가 실행 중에 생기면 매번 다른 조합이 운영에 나갑니다. 다만 하위 세션의 결과를 합치는 형식은 1절의 분류 단계처럼 스키마로 고정해야 합니다. 작업자 모델이 바뀌면 그 형식부터 다시 검증합니다.

### 보수적인 조직이라면

보험이나 금융 IT에서는 여기에 변경 관리가 붙는다고 봅니다.

폴백 체인에 있는 모델은 언제든 운영 트래픽을 받을 수 있으므로, 주 모델과 같은 수준의 사전 검증과 승인 대상이 되어야 합니다. 데이터가 어느 사업자의 어느 지역으로 가는지도 체인의 모든 모델에 대해 답할 수 있어야 합니다.

요청 단위 라우터를 쓴다면 질문이 하나 더 생깁니다. 후보 집합이 매주 바뀔 수 있다면, 변경 승인은 무엇을 대상으로 하는가입니다. 저는 이런 조직에서는 허용 목록을 승인 대상 모델로 좁히고, 목록의 변경을 변경 관리 절차에 태우는 편이 현실적이라고 봅니다.

"장애 때만 쓰는 모델"이라는 이유로 검증을 건너뛰면, 장애가 난 날이 검증되지 않은 모델의 첫 운영일이 됩니다.

## 6. 오늘 바로 적용할 수 있는 순서

1. 응답마다 요청한 모델과 실제 답한 모델, effort, 홉 사유, 캐시 적중 토큰, 스키마 검증 결과를 로그에 남깁니다.
2. 재시도와 폴백 조건을 사유별로 나눕니다. 최소한 장애, 한도, 거절, 컨텍스트 초과, 형식 위반을 구분하고, 거절은 HTTP 상태와 별도로 `stop_reason`으로 잡습니다.
3. 하위 에이전트와 백그라운드 워커를 포함한 모든 요청 경로에 폴백 설정이 있는지 확인하고, 요청당 홉 수 상한을 둡니다.
4. 폴백 체인의 모든 모델에 주 모델과 같은 eval 세트를 돌리고, 통과하지 못한 모델은 뺍니다. 모델을 올리기 전에 effort를 한 단계 조정해 같은 eval로 먼저 비교합니다.
5. 세션 중간 모델 교체를 기본 금지로 두고, 허용하는 사유와 그때 적용할 요청 변환을 한곳에 모읍니다.

## 마치며

모델을 여러 개 쓰는 구성은 이제 특별한 선택이 아닙니다. 그만큼 모델과 모델 사이의 이음매가 하네스 품질을 가르는 자리가 됩니다.

폴백이 있다는 것과 폴백이 검증되어 있다는 것은 다른 이야기입니다. 장애가 났을 때 처음 가 보는 길이 아니라, 미리 걸어 본 길로 내려가게 해야 합니다.

어느 모델이 답했는지 기록하는 일부터 시작하시기를 권합니다.

## 참고 자료

- [Refusals and fallback - Claude Platform Docs (2026년 10월 29일 보관본)](https://web.archive.org/web/20261029053545/https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback)
- [Choosing the right model - Claude Platform Docs (2026년 10월 28일 보관본)](https://web.archive.org/web/20261028093959/https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)
- [Optimizing for cost and intelligence - Claude Platform Docs (2026년 10월 29일 보관본)](https://web.archive.org/web/20261029151211/https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence)
- [Claude Platform release notes](https://platform.claude.com/docs/en/release-notes/overview)
- [Model Routing Powered by Wisdom of the Market - OpenRouter (2026년 8월 10일)](https://openrouter.ai/blog/announcements/introducing-the-new-auto-router/)
- [Router - Load Balancing - LiteLLM Docs (2026년 10월 28일 보관본)](https://web.archive.org/web/20261028230155/https://docs.litellm.ai/docs/routing)
- [Introducing the Microsoft Copilot harness - The Official Microsoft Blog](https://blogs.microsoft.com/blog/2026/10/28/introducing-the-microsoft-copilot-harness-unlocking-the-potential-of-truly-multi-model-agentic-work/)
- [Droid 1.0: Building a Frontier Harness - Factory](https://factory.com/news/frontier-harness)
