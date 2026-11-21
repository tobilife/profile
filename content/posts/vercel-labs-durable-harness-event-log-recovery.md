---
title: "durable-harness: 코딩 에이전트 세션을 이벤트 로그에 올려, 죽은 턴을 다른 머신에서 이어 가는 저장소"
date: 2026-11-10
description: "Vercel Labs의 durable-harness는 에이전트 세션을 workflow run으로 다루고, 다시 실행하면 안 되는 도구 호출을 두 번 돌리지 않는 복구 규칙과 실행 격리를 코드로 담았습니다."
category: 저장소 소개
tags: [오픈소스, 하네스, 오케스트레이션, 코딩 에이전트, Claude Code]
draft: false
---

:::note
- durable-harness는 Pi, OpenCode, fx, Claude Code, Codex 같은 코딩 에이전트 하네스를 Workflow SDK 위에서 내구성 있는 에이전트로 돌리는 실험 단계 라이브러리입니다.
- 세션 하나가 workflow run이고, 대화와 진행 중인 턴, 모든 모델 호출과 도구 호출이 그 run의 이벤트 로그에 들어갑니다. 크래시가 나면 다른 머신이 로그에서 턴을 이어 갑니다.
- 핵심 규칙은 재실행 정책입니다. 읽기나 모델 호출은 다시 돌리고, 명령이나 결제처럼 두 번 돌면 해로운 호출은 중단됨으로 표시해 모델에게 돌려줍니다.
- 생존 판정은 heartbeat가 아니라 큐 메시지의 잠금과 마감 시각으로 하고, 모델이 고른 명령은 구동 프로세스가 아니라 가상 워크스페이스나 세션 전용 샌드박스에서만 실행됩니다.
:::

"에이전트가 중간에 죽으면 대화 기록을 다시 불러와 이어서 시키면 된다"고들 합니다.

대화만 하는 챗봇이라면 맞는 말입니다. 그러나 코딩 에이전트는 명령을 실행하고 파일을 고칩니다. 대화 기록에는 모델이 무엇을 하려 했는지는 남지만, 그 일이 실제로 끝났는지는 남지 않습니다.

**긴 작업을 맡은 에이전트에게 필요한 것은 대화의 복원이 아니라 실행 사실의 기록이고, 그 기록을 근거로 무엇을 다시 해도 되는지 판정하는 규칙입니다.**

Vercel Labs가 2026년 10월에 공개한 `durable-harness`는 이 문제를 정면으로 다룹니다. README의 첫 문단이 곧 설계 요약입니다. 각 세션은 workflow run이고, 어디서 크래시가 나든 다른 머신에서 로그로부터 턴을 재개하며, 반복하면 안전하지 않은 도구 호출은 두 번 실행되지 않는다는 것입니다 [\[vercel-labs/durable-harness: README\]](https://github.com/vercel-labs/durable-harness/tree/badd648db763e7d9121917b5c35732cd334e01be).

이 글은 이 글의 날짜 직전인 2026년 11월 6일 커밋 기준으로 저장소를 읽습니다. 장기 실행 하네스라는 주제 자체보다, 이 저장소가 복구 규칙과 실행 격리를 어떻게 코드로 굳혔는지를 봅니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 보험 계약 시스템의 저장소에서 일하는 코딩 에이전트가 있다고 해봅시다. 이번 작업은 계약 테이블에 컬럼을 하나 추가하는 마이그레이션을 쓰고, 개발 DB에 적용하고, 깨진 테스트를 고치는 것입니다.

에이전트가 턴 중간에 마이그레이션 명령을 실행했고, 명령이 도는 도중에 그 에이전트를 구동하던 프로세스가 내려갔다고 해봅시다.

재시작한 하네스는 저장해 둔 대화를 불러옵니다. 마지막 기록은 "마이그레이션을 실행하겠습니다"라는 모델의 도구 호출 요청입니다. 결과는 없습니다.

하네스는 결과가 없으니 호출을 다시 보내고, 마이그레이션은 두 번 돕니다. 두 번째 실행은 이미 있는 컬럼을 다시 추가하려다 실패하거나, 더 나쁘게는 데이터 보정 구문을 한 번 더 적용합니다.

시스템 설계 용어로 짚으면, 부작용이 있는 연산에 at-least-once 전달을 그대로 적용했습니다. 메시지 큐를 다뤄 본 분이라면 익숙한 문제입니다. 재전달은 피할 수 없으니, 수신 쪽이 연산마다 다시 해도 되는지를 알고 있어야 합니다.

## 1. 세션을 workflow run으로 보고, 로그를 진실의 원천으로 둡니다

### 저장소의 현재 위치

저장소가 처음 만들어진 것은 2026년 10월 16일이고, 첫 릴리스 `0.0.1`은 10월 23일, `0.0.2`는 11월 6일에 나왔습니다. 라이선스는 Apache-2.0입니다 [\[vercel-labs/durable-harness: Releases\]](https://github.com/vercel-labs/durable-harness/releases). README는 실험 단계이며 `0.0.x`인 동안 릴리스 사이에 API가 바뀔 수 있다고 밝힙니다.

### 로그에는 무엇이, 어떤 순서로 들어가는가

첫 릴리스 노트는 구조를 이렇게 설명합니다. Claude Code, Codex, OpenCode, Pi가 각각 세션이 workflow run인 에이전트로 돌고, 그 이벤트 로그가 진실의 원천이며, 모든 모델 호출과 도구 호출이 로그의 한 스텝입니다. 그래서 어디서 크래시가 나도 다른 머신이 로그에서 턴을 재개하고, 다시 실행하면 안전하지 않은 도구는 두 번 실행되는 대신 모델에게 중단됨으로 돌아갑니다 [\[vercel-labs/durable-harness: Releases\]](https://github.com/vercel-labs/durable-harness/releases).

여기서 중요한 선택은 하네스를 새로 만들지 않았다는 점입니다. 에이전트 루프는 Pi, OpenCode, Claude Code, Codex 같은 기존 하네스가 그대로 돌리고, 이 라이브러리는 그 루프의 모델 호출과 도구 호출이 지나가는 자리에 로그를 끼웁니다.

```text
사용자 메시지
   │
   v
[세션 = workflow run] ── 이벤트 로그 ──────────────────────────────┐
   │                                                               │
   ├─ 스텝: 모델 호출        (의도 기록 → 실행 → 결과 기록)          │
   ├─ 스텝: 도구 호출 A      (의도 기록 → 실행 → 결과 기록)          │
   ├─ 스텝: 도구 호출 B      (의도 기록 → 실행 ── 크래시)            │
   │                                                               │
   └─ 다른 머신에서 재개 <── 로그를 읽고 B의 재실행 정책을 확인 ──────┘
                              safe  → 다시 실행
                              never → interrupted로 모델에게 반환
```

그림은 README, 릴리스 노트, 문서의 설명을 제가 옮겨 그린 것입니다.

핵심은 "의도 기록"이 실행보다 먼저라는 점입니다. 재개하는 쪽은 로그에서 의도는 있는데 결과가 없는 스텝을 찾습니다. 그 스텝이 바로 "실행됐는지 모르는" 스텝이고, 재실행 정책은 그 스텝에만 적용됩니다. 결과까지 기록된 스텝은 다시 돌지 않고 기록된 결과가 그대로 쓰입니다.

### 대화 저장과 무엇이 다른가

첫머리 시나리오의 하네스와 이 저장소의 방식을 나란히 놓으면 차이가 분명해집니다.

| 항목 | 대화 기록 복원 | 실행 로그 기반 재개 |
| --- | --- | --- |
| 저장하는 것 | 메시지 목록 | 스텝마다 의도, 결과, 재실행 정책 |
| 결과 없는 도구 호출 | 구분할 수 없어 다시 보냄 | "실행 여부 불명"으로 식별 |
| 판단하는 주체 | 하네스가 암묵적으로 추측 | 도구에 붙은 정책이 결정 |
| 이미 끝난 호출 | 모델이 다시 부를 수 있음 | 기록된 결과를 그대로 씀 |
| 재개 위치 | 마지막 메시지 뒤 | 마지막으로 결과가 기록된 스텝 뒤 |

오른쪽 열은 이 저장소의 설명을 일반화해 제가 정리한 것입니다.

### 실행 기반: World

실행 기반은 Workflow SDK의 World라는 추상화입니다. README에 따르면 로컬 개발은 설정 없이 로컬 World로 돌고, Vercel에 배포하면 관리형 저장소와 큐, 확장을 쓰며, 자체 호스팅은 Postgres World 등을 쓸 수 있습니다 [\[vercel-labs/durable-harness: README\]](https://github.com/vercel-labs/durable-harness/tree/badd648db763e7d9121917b5c35732cd334e01be). 첫 릴리스 노트는 world-postgres나 world-local로 자체 호스팅할 때 에이전트를 만들지 않고 World만 띄우는 별도 워커가 `forwardQueue(world)`로 큐를 앱의 flow 라우트에 넘긴다고 설명합니다.

이미 Pi 1.0의 자체 durable `Harness`로 만든 앱이라면 `durable-harness/pi-durable`이 코드를 대체하지 않고 덧붙는 방식으로 동작합니다. 원래 SQLite나 JSONL 저장소를 열던 자리에서 `openWorldStorage()`를 열고, 세션을 다시 여는 방법을 `resumeWith(open)`으로 등록해 두면, 턴 도중 프로세스가 죽었을 때 세션을 다시 열어 Pi가 턴을 마칩니다.

### 비용: 로그에 남는 것이 많아집니다

모든 모델 호출과 도구 호출이 로그에 남는다는 것은, 그 안의 프롬프트와 출력, 파일 내용도 어딘가에 남는다는 뜻입니다.

첫 릴리스에는 이 부분을 다루는 설정도 들어 있습니다. 세션의 `traceAudience`가 추적 데이터에 무엇을 기록할지 정하는데, `public`이면 입력과 출력을, 그 밖의 값이면 메타데이터만 기록합니다. 복구할 때도 현재의 캡처 정책을 복원된 작업에 적용해 새로 비공개가 된 내용이 체크포인트와 내보내기에 남지 않게 하고, 기록된 도구 정의에서는 공급자 자격 증명을 뺀다고 적혀 있습니다 [\[vercel-labs/durable-harness: Releases\]](https://github.com/vercel-labs/durable-harness/releases).

보험 계약 저장소처럼 테스트 데이터에도 고객 정보 형태의 값이 섞일 수 있는 곳이라면, 이 설정을 먼저 정하고 시작하는 편이 안전하다고 봅니다.

## 2. 재실행 정책을 호출마다 정해 둡니다: safe와 never

### 문서가 정한 두 가지 정책

이 저장소에서 가장 배울 만한 부분은 `docs/queue-send-and-hold.md`에 적힌 재실행 정책입니다.

구동이 마감 시각에 걸려 잘리면, 이어받는 쪽은 진행 중이던 효과(effect)를 그 재실행 정책에 따라 처리합니다 [\[vercel-labs/durable-harness: queue-send-and-hold.md\]](https://github.com/vercel-labs/durable-harness/blob/badd648db763e7d9121917b5c35732cd334e01be/docs/queue-send-and-hold.md).

| 정책 | 문서가 든 예 | 중단되었을 때 |
| --- | --- | --- |
| `safe` | 모델 호출, 읽기 | 다시 실행 |
| `never` | 명령, 결제, 두 번째 실행이 해를 끼칠 수 있는 모든 것 | 중단됨으로 표시하고 다시 실행하지 않음. 모델에게 멈췄다고 알림 |

마지막 칸이 핵심입니다. 하네스가 "아마 안 됐을 테니 다시 한다"거나 "아마 됐을 테니 넘어간다"를 추측하지 않습니다. 모르는 것을 모른다고 모델에게 돌려줍니다.

### 모델은 interrupted를 받고 무엇을 하는가

그러면 모델은 상태를 확인하는 읽기 호출을 먼저 할 수 있습니다. 첫머리 시나리오에 적용하면 재개된 턴은 이렇게 흘러갑니다.

```text
(예시) 재개된 턴의 흐름

로그: run_migration  의도 기록됨, 결과 없음, 정책 never
  → 하네스: 재실행하지 않고 tool_result = { status: "interrupted" }
  → 모델: "마이그레이션이 중단되었습니다. 적용 여부를 먼저 확인합니다"
  → read_schema_version 호출 (safe)
  → 결과: 새 컬럼 있음, 버전 기록 있음
  → 모델: 마이그레이션은 적용된 것으로 보고 테스트 수정으로 진행
```

이 흐름이 성립하려면 조건이 하나 있습니다. `never` 도구마다 그 효과를 확인할 수 있는 `safe` 도구가 짝으로 있어야 합니다. 확인할 방법이 없으면 모델은 추측하거나 사람에게 물을 수밖에 없습니다.

제 생각에 이것은 하네스를 직접 만드는 사람도 그대로 가져갈 수 있는 규칙입니다. 도구를 정의할 때 설명과 스키마 옆에 재실행 가능 여부와 확인 도구를 한 칸씩 더 두는 것입니다.

```ts
// 예시: 도구 정의에 재실행 정책을 함께 적는 모양 (이 저장소의 API가 아닙니다)
const tools = {
  read_file:           { replay: 'safe' },                                 // 몇 번을 읽어도 같음
  read_schema_version: { replay: 'safe' },
  run_migration:       { replay: 'never', verifyWith: 'read_schema_version' },
  run_tests:           { replay: 'safe' },                                 // 부작용이 테스트 DB에 갇혀 있다면
  open_pull_request:   { replay: 'never', verifyWith: 'list_pull_requests' },
};
```

### 도구별 정책을 정하는 질문

정책을 정할 때 저는 세 가지 질문을 순서대로 던지는 편이 실수가 적다고 봅니다.

| 질문 | 답 | 정책 |
| --- | --- | --- |
| 효과가 이 세션의 격리된 작업 공간 안에만 남는가 | 예 | `safe` (가상 워크스페이스의 파일 읽기와 쓰기 등) |
| 같은 요청을 다시 해도 결과가 같도록 멱등 키를 받는가 | 예 | `safe` |
| 효과가 적용됐는지 확인할 읽기 도구가 있는가 | 예 | `never` + 확인 도구 |
| 확인할 방법도 없는가 | 예 | `never` + 사람에게 확인 요청, 또는 에이전트 도구에서 제외 |

보험 계약 저장소의 에이전트라면 가상 워크스페이스 안의 파일 수정은 첫 줄에, 개발 DB 마이그레이션은 셋째 줄에, 사내 메신저 알림 발송은 넷째 줄에 해당할 것입니다. 표는 제 제안입니다.

### never를 safe로 올리는 방법: 멱등성

`never`는 안전하지만 비쌉니다. 중단될 때마다 모델이 확인 호출을 해야 하고, 확인할 수 없으면 작업이 멈춥니다. 그래서 자주 쓰는 `never` 도구는 멱등하게 만들어 `safe`로 올리는 편이 좋습니다.

AWS Builders' Library의 멱등 API 글은 이 작업의 요점을 잘 정리합니다. 요청 매개변수의 해시로 중복을 추정하는 방식은 모든 경우에 맞지 않으며, 호출자가 정한 고유한 요청 식별자를 API 계약에 넣는 쪽을 선호한다고 설명합니다. 또 식별자를 기록하는 일과 그 요청의 모든 변경 작업은 원자적으로 함께 이루어져야 하고, 같은 식별자로 매개변수가 다른 요청이 오면 다른 의도로 보고 검증 오류를 돌려준다고 적습니다 [\[AWS Builders' Library: Making retries safe with idempotent APIs\]](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/).

마이그레이션 도구에 적용하면, 하네스가 로그의 스텝 식별자를 멱등 키로 넘기고, 마이그레이션 도구는 버전 테이블에 그 키를 마이그레이션과 같은 트랜잭션으로 기록합니다. 같은 키로 다시 오면 적용하지 않고 처음의 결과를 돌려줍니다. 이렇게 만든 도구는 `safe`로 둘 수 있습니다.

### 실패 모드

이 정책의 실패는 대부분 분류에서 나옵니다.

- 부작용이 있는 읽기: 조회처럼 보이지만 호출할 때마다 카운터를 올리거나 잠금을 거는 API를 `safe`로 두면, 재실행이 부작용을 반복합니다.
- 범위를 넘는 `safe`: `run_tests`가 공유 개발 DB를 건드린다면 더 이상 `safe`가 아닙니다. 정책은 도구 이름이 아니라 실제 효과의 범위로 정해야 합니다.
- 너무 많은 `never`: 모든 것을 `never`로 두면 재개할 때마다 확인 호출이 쏟아지고, 모델이 같은 확인을 반복하며 비용을 씁니다.

## 3. 살아 있음은 heartbeat가 아니라 큐 잠금과 마감 시각으로 판정합니다

복구가 되려면 먼저 죽었다는 것을 알아야 합니다.

### 두 가지 anchor

같은 문서에 따르면 구동의 생존 여부는 큐 메시지에 걸린 잠금입니다. 핸들러가 도는 동안 큐 라이브러리가 잠금을 갱신하고, 크래시가 나면 잠금이 풀려 같은 메시지가 다시 전달됩니다. 이 저장소의 어떤 코드도 heartbeat를 쓰지 않는다고 적혀 있습니다 [\[vercel-labs/durable-harness: queue-send-and-hold.md\]](https://github.com/vercel-labs/durable-harness/blob/badd648db763e7d9121917b5c35732cd334e01be/docs/queue-send-and-hold.md).

모든 구동은 하나의 anchor 아래에서 돌고, 그 anchor는 구동이 쓰는 모든 의도 기록에 함께 남습니다. anchor는 두 종류입니다.

| anchor | 쓰이는 곳 | 무엇이 생존을 보장하는가 |
| --- | --- | --- |
| `msg` | 큐 전달로 도는 flow 라우트 | 그 메시지에 걸린 큐의 잠금 |
| `deadline` | 메시지를 쥐지 않은 구동, 예컨대 `chatRoute`의 기본 구동 | 자기 마감 시각. 마감 이후에는 아무것도 쓰지 않고, 마감 뒤로 지연된 동반 메시지가 뒤를 받침 |

### 채팅 라우트가 턴을 구동하는 다섯 단계

채팅 요청이 직접 턴을 구동하는 기본 경로(`drive: 'route'`)는 큐 메시지를 쥐고 있지 않으므로 `deadline` anchor를 씁니다. 문서는 그 과정을 다섯 단계로 설명합니다.

1. 구동 전에 마감 시각보다 5초쯤 뒤에 도착하도록 지연시킨 동반(companion) 큐 메시지를 먼저 보냅니다.
2. 요청은 자기 호출 안에서 마감 시각(`directDriveMs`, 기본 60초) 안에 턴을 직접 구동해 첫 응답을 바로 스트리밍합니다.
3. 턴이 먼저 끝나면 나중에 도착한 동반 메시지는 턴이 이미 답해진 것을 보고 버려집니다.
4. 마감이 가까워지도록 일이 남으면 continuation으로 넘기고, flow 라우트가 큐 전달로 이어서 구동합니다.
5. 호출이 조용히 죽으면 동반 메시지가 마감이 지난 anchor를 보고 턴을 복구합니다. 제출 후 약 65초에서 70초 사이입니다.

타이머를 직접 돌리지 않고 "마감 이후에는 쓰지 않는다"는 약속과 지연 메시지 하나로 조용한 죽음을 감지하는 구조입니다. 문서는 메시지를 쥐지 않은 구동이 조용한 죽음의 한계를 정하는 방법은 고정된 마감뿐이고, 다른 대안은 자체 타이머, 즉 heartbeat인데 이 설계가 그것을 없앴다고 설명합니다.

### 마감의 대가

대가도 문서에 그대로 적혀 있습니다. 마감 직전 15초(`deadlineMarginMs`) 동안은 새 효과를 시작하지 않고, 마감 시점에 돌고 있던 효과는 잘린 뒤 2절의 재실행 정책으로 처리됩니다. 그래서 턴 초반에 시작한 긴 명령, 예컨대 30초쯤에 시작한 `npm install`이나 빌드, 샌드박스의 첫 이미지 빌드가 잘릴 수 있습니다.

해법으로는 턴 전체를 큐 전달로 구동하는 `chatRoute({ drive: 'queue' })`를 안내합니다. 큐 전달의 잠금은 핸들러가 도는 동안 계속 갱신되므로 긴 명령도 끝까지 돕니다. 대신 첫 응답이 나오기 전에 큐를 한 번 거치는 지연이 붙습니다.

첫머리 시나리오의 마이그레이션은 `never`이므로, 기본 구동에서 마감에 걸리면 중단됨으로 처리됩니다. 마이그레이션처럼 길고 되돌리기 어려운 명령을 자주 쓰는 에이전트라면 처음부터 `drive: 'queue'`로 두는 편이 맞다고 봅니다.

### 세 가지 구동 방식을 숫자로 비교하면

문서의 설명을 구동 방식별로 모으면 고를 기준이 보입니다.

| 구동 방식 | 첫 응답 | 끊기지 않고 돌 수 있는 명령 | 조용한 죽음의 복구 |
| --- | --- | --- | --- |
| 기본(`drive: 'route'`) | 바로 스트리밍 | 마감 60초에서 여유 15초를 뺀 범위 안에서 시작한 것 | 제출 후 약 65초에서 70초 |
| `drive: 'queue'` | 큐를 한 번 거친 뒤 | 핸들러가 도는 동안, 플랜의 최대 실행 시간까지 | 큐 잠금이 풀리고 재전달될 때 |
| send-and-hold(진행 중) | 바로 스트리밍 | 호출의 최대 실행 시간까지 | 잠금이 풀리는 몇 초 안 |

표는 문서의 설명을 제가 한곳에 모은 것입니다. 대화형으로 짧게 묻고 답하는 에이전트는 첫 줄이, 마이그레이션과 빌드를 돌리는 에이전트는 둘째 줄이 맞습니다.

### 재개된 턴도 하나의 턴으로 보여야 합니다

복구가 일어날 때 운영자가 보는 화면도 중요합니다. 첫 릴리스에 들어간 Agent Runs 추적은 프롬프트마다 하나의 턴을, 모델 호출마다 하나의 스텝을 기록하고, 시간이 다 되거나 크래시가 나거나 다른 구동으로 넘어가 나중의 호출에서 이어진 턴도 하나의 턴으로 남긴다고 설명합니다 [\[vercel-labs/durable-harness: Releases\]](https://github.com/vercel-labs/durable-harness/releases).

이 점이 작아 보이지만, 재개된 턴이 추적 화면에서 두 개의 턴으로 쪼개지면 운영자는 같은 마이그레이션이 두 번 요청된 것으로 오해할 수 있습니다. 직접 만드는 하네스라면 추적의 턴 식별자를 구동이 아니라 로그의 턴에 묶어 두는 편이 좋습니다.

### 직접 만드는 하네스에 옮기면

이 라이브러리를 쓰지 않는 하네스도 같은 생각을 빌릴 수 있습니다. 큐 대신 DB 테이블 하나로 흉내 내면 이런 모양이 됩니다.

```ts
// 예시: 세션 구동권을 lease로 관리하는 최소 구성 (이 저장소의 구현이 아닙니다)
// sessions 테이블: id, owner, epoch, lease_until
async function acquire(sessionId: string, me: string) {
  // lease가 만료된 세션만 가져오고, 가져올 때마다 epoch를 올림
  return db.update('sessions')
    .set({ owner: me, epoch: sql`epoch + 1`, lease_until: now() + 30_000 })
    .where({ id: sessionId, lease_until: lt(now()) })
    .returning('epoch');
}
async function runTool(step: Step, epoch: number) {
  await log.intent(step, epoch);                 // 의도 기록에 epoch를 함께 남김
  assertEpoch(step.sessionId, epoch);            // 그사이 넘겨졌으면 실행하지 않음
  const result = await tools[step.name](step.args, { idempotencyKey: step.id });
  await log.result(step, result, epoch);         // 결과 기록도 epoch가 맞을 때만 받아들임
}
```

lease를 갱신하지 못한 워커는 30초 뒤 다른 워커에게 세션을 빼앗기고, 빼앗긴 워커가 뒤늦게 쓰려는 기록은 epoch가 맞지 않아 거부됩니다. 이 저장소의 문서가 말하는 큐 잠금과 fence를 DB 행 하나로 줄인 것입니다. 실무에서는 lease 갱신 주기, 시계 차이, 도구 실행 도중의 epoch 변경을 더 다뤄야 합니다.

### 아직 진행 중인 해법: send-and-hold

같은 문서는 이 제약을 없앨 기능도 설명합니다. 보내는 순간부터 보낸 쪽이 쥐고 있는 메시지, 즉 전달될 때 걸리는 것과 같은 잠금을 보내는 시점에 미리 잡는 방식입니다. 이것이 생기면 고정된 60초가 사라지고, 호출이 살아 있는 동안 계속 구동하며, 조용한 죽음은 잠금이 풀리는 몇 초 안에 복구됩니다.

다만 문서는 이것이 Vercel Queues와 Workflow SDK의 World에서 진행 중이며, 나오기 전까지는 긴 명령을 돌리는 에이전트에 `drive: 'queue'`를 쓰라고 안내한다고 적고 있습니다. 설계의 비용과 그 비용을 없앨 계획, 그리고 그 계획의 현재 상태까지 문서에 적어 두는 태도는 본받을 만하다고 생각합니다.

## 4. 모델이 고른 명령은 구동 프로세스 밖에서 돕니다

### 규칙과 이유

README는 모델이 고른 명령과 파일이 가상 워크스페이스(`virtual()`)나 세션 전용 Vercel Sandbox(`sandbox()`)에서 실행되고, 세션을 구동하는 머신에서는 결코 실행되지 않는다고 못 박습니다 [\[vercel-labs/durable-harness: README\]](https://github.com/vercel-labs/durable-harness/tree/badd648db763e7d9121917b5c35732cd334e01be).

Vercel 문서(2026년 10월 28일 보관본)는 이를 한 줄 규칙으로 요약합니다. 함수는 내가 쓴 코드만 실행하고, 모델은 인자를 고를 뿐 함수 안에서 도는 코드를 고르지 못한다는 것입니다. 한 인스턴스가 다른 세션과 다른 사용자의 턴을 동시에 처리하므로, 함수 안에서 진짜 셸을 돌리는 도구는 한 세션의 모델이 다른 세션의 파일과 함수의 환경 변수, 예컨대 AI Gateway 키나 배포의 OIDC 토큰을 읽게 만든다는 설명이 붙어 있습니다 [\[Vercel: Security for Durable Agent Harnesses\]](https://web.archive.org/web/20261028224333/https://vercel.com/docs/agent-harnesses/security).

### Claude Code와 Codex는 자격 증명 없는 VM에서

첫 릴리스 노트에서 눈에 띄는 세부 사항은 세 가지입니다 [\[vercel-labs/durable-harness: Releases\]](https://github.com/vercel-labs/durable-harness/releases).

- Claude Code와 Codex는 세션마다 따로 뜨는 VM에서만 돌고, 그 CLI는 자격 증명을 들고 있지 않습니다. 모델 호출은 바깥의 함수가 세션의 예산 안에서 대신 합니다. 새 VM에서 재시작한 세션도 파일을 유지하고 로그에서 재개합니다.
- 두 하네스 모두 기본값은 도구 없음입니다. 앱이 준 도구만 보이고, 내장 도구는 `builtins: true`로 켜야 하며, 켜더라도 각 호출은 실행 전에 로그에 들어갑니다.
- 각 에이전트의 채팅 라우트는 운영 환경에서 `authorize` 검사가 필수입니다.

### 기본값이 막지 않는 것

Vercel 문서는 이 통제가 다루지 않는 것도 목록으로 적어 둡니다 [\[Vercel: Security for Durable Agent Harnesses\]](https://web.archive.org/web/20261028224333/https://vercel.com/docs/agent-harnesses/security).

- 샌드박스는 기본적으로 모든 외부 통신을 허용합니다. 인젝션당한 모델이 자기 세션의 파일을 인터넷으로 보낼 수 있으므로, `network: 'deny-all'`이나 필요한 호스트만 허용하는 설정을 주라고 안내합니다.
- 모델 공급자가 실행하는 웹 검색 같은 도구는 샌드박스의 네트워크 설정과 무관하게 공급자 쪽에서 인터넷에 나갑니다.
- 화면이 모델 출력의 원격 이미지를 렌더링하면, 클릭 없이도 브라우저가 모델이 고른 URL을 요청합니다.
- 샌드박스에 넘긴 환경 변수는 모델의 명령이 읽을 수 있으므로 비밀 값은 넘기지 말아야 합니다.
- Codex에 내장 도구를 켜면, Codex가 샌드박스 안에서 자기 격리를 띄우지 못할 때 명령이 샌드박스 전체 권한으로 돕니다. 샌드박스에 비밀은 없지만, 그 명령이 함수를 거쳐 설정한 예산 안에서 모델을 직접 부를 수 있다고 문서는 적고 있습니다.

목록의 어느 항목도 "격리했으니 안전하다"로 끝나지 않는다는 점이 이 문서에서 배울 부분이라고 봅니다. 격리는 피해의 범위를 정할 뿐이고, 범위 안에서 무엇이 나갈 수 있는지는 따로 좁혀야 합니다.

`0.0.2`에서는 샌드박스의 네트워크 정책을 도메인 단위 규칙(자격 증명 중개를 위한 헤더 변환 포함)이나 세션별 콜백으로 지정할 수 있게 됐고, 그 헤더 값은 세션 로그와 추적 데이터, 오류 메시지에 남지 않게 했습니다 [\[vercel-labs/durable-harness: Releases\]](https://github.com/vercel-labs/durable-harness/releases). 자격 증명을 샌드박스 안에 두지 않고, 나가는 요청에 경계에서 붙이는 방식입니다.

보험 계약 저장소의 코딩 에이전트라면 이렇게 설정을 잡을 수 있습니다.

```ts
// 예시: 세션 샌드박스의 네트워크를 좁히는 설정의 모양 (실제 옵션 이름은 저장소 문서를 따르십시오)
const workspace = sandbox({
  network: {
    allow: ['registry.npmjs.org', 'git.internal.example'], // 패키지 설치와 사내 저장소만
  },
});
// 개발 DB 접속 정보는 환경 변수로 넘기지 않고, 앱이 정의한 도구가 바깥에서 대신 접속
```

### 격리의 비용

세션마다 VM을 띄우는 격리는 공짜가 아닙니다. 첫 릴리스에는 이 비용을 줄이는 장치도 함께 들어 있습니다. 기본 스냅샷을 미리 준비하는 명령(`npx durable-harness sandbox prepare`), 세션의 VM과 저장 공간을 지우는 함수, 선택적으로 켜는 유휴 VM 정리 기능이 있고, OpenCode는 VM을 그 VM이 필요한 첫 호출에서 띄웁니다 [\[vercel-labs/durable-harness: Releases\]](https://github.com/vercel-labs/durable-harness/releases).

반대로 이 격리가 과한 경우도 있다고 봅니다. 개발자 한 명이 자기 노트북에서 자기 저장소에만 쓰는 에이전트라면, 세션 간 격리보다 파일 시스템과 네트워크 범위를 좁히는 로컬 샌드박스가 더 맞는 선택일 수 있습니다. 이 저장소의 격리 설계가 빛나는 곳은 한 함수 인스턴스가 여러 사용자의 세션을 동시에 처리하는 서버 환경입니다.

### 두 구동이 겹칠 때

내구성 있는 실행에서 마지막으로 남는 문제는 "죽은 줄 알았는데 살아 있던" 구동입니다. 첫 릴리스 노트는 Pi 1.0 경로의 샌드박스 실행이 세션 자신의 fencing 토큰을 들고 돈다고 적고, fx 경로는 호출을 실행하는 워커의 lease를 들고 있어 넘겨진 서버는 그 샌드박스에서 더 이상 아무것도 실행하지 못한다고 설명합니다 [\[vercel-labs/durable-harness: Releases\]](https://github.com/vercel-labs/durable-harness/releases).

`docs/followups.md`에는 아직 닫히지 않은 문제가 적혀 있습니다. 로그 쓰기에는 구동의 fence가 걸려 있지만 실시간 이벤트에는 아직 걸려 있지 않아서, 다른 구동이 세션을 넘겨받은 뒤에도 멈춘 이전 구동의 실시간 스트림 쓰기가 섞여 들어올 수 있다는 것입니다 [\[vercel-labs/durable-harness: followups.md\]](https://github.com/vercel-labs/durable-harness/blob/badd648db763e7d9121917b5c35732cd334e01be/docs/followups.md). 로그는 맞지만 화면에 보이는 스트림이 잠시 뒤섞일 수 있다는 뜻으로 읽힙니다.

## 5. 설치와, 읽을 때 주의할 점

### 빠른 시작

README의 빠른 시작은 Next.js 앱에 Pi(pi-durable)와 함께 설치하는 경로입니다.

```bash
npm install durable-harness @earendil-works/pi-durable @earendil-works/chord @earendil-works/pi-ai just-bash
```

채팅 라우트와 Next.js 설정은 다음처럼 둡니다. 이 코드는 README에서 가져온 것입니다.

```ts
// app/api/chat/route.ts
import { chatRoute } from 'durable-harness/pi-durable';
import { agent, open } from '@/lib/agent';

export const { GET, POST } = chatRoute({ open, agent, authorize: async (request) => { /* your auth */ } });
```

```ts
// next.config.ts
import type { NextConfig } from 'next';
import { withDurableHarness } from 'durable-harness/next';

const nextConfig: NextConfig = {
  // your existing config
};

export default withDurableHarness(nextConfig);
```

README에 따르면 `withDurableHarness`는 모듈 수준에서 만든 에이전트를 내보내는 모듈을 찾아 큐 라우트를 설정하고, 자동으로 찾지 못하는 경우에는 모듈을 명시적으로 나열할 수 있습니다.

### 진행 중인 턴에 메시지를 보내면

README에는 세션에 보내는 메시지의 종류(`prompt`, `followUp`, `steer`)가 진행 중인 턴에서 하네스마다 어떻게 다르게 처리되는지 표가 있습니다. 이 설명은 `0.0.2`에서 추가됐습니다 [\[vercel-labs/durable-harness: Releases\]](https://github.com/vercel-labs/durable-harness/releases).

| 하네스 | 진행 중인 턴에 `steer` | 진행 중인 턴에 `prompt`나 `followUp` |
| --- | --- | --- |
| Pi | 현재 도구 호출 뒤에 턴에 들어감 | 아직 작업 중이면 같은 턴에 합류 |
| OpenCode | 다음 단계에서 턴에 들어감 | 턴이 끝나길 기다렸다가 자기 턴을 시작 |
| Claude Code, Codex | 진행 중인 턴에 들어감 | 턴이 끝나길 기다렸다가 자기 턴을 시작 |

표는 README의 표를 줄여 옮긴 것입니다. 하네스를 바꾸면 사용자가 보는 동작이 달라지므로, UI가 "작업 중에 보낸 메시지"를 어떻게 보여 줄지 먼저 정해야 합니다.

### 도입 전에 감안할 것

- 버전이 `0.0.x`이고 릴리스 사이에 API가 바뀔 수 있습니다. 첫 릴리스 노트도 `0.0.x`인 동안은 패치 릴리스만 낸다고 적고 있습니다.
- Claude Code와 Codex 경로는 Vercel Sandbox를 전제로 합니다. 다른 인프라에서 같은 격리를 얻으려면 직접 설계해야 합니다.
- 샌드박스의 외부 통신은 기본 허용입니다. 네트워크 정책은 직접 좁혀야 합니다.
- 채팅 라우트의 기본 구동에는 60초 마감과 15초 여유가 있습니다. 긴 명령을 쓰는 에이전트는 `drive: 'queue'`를 검토해야 합니다.
- 실시간 스트림의 fence 같은 열린 문제가 문서에 적혀 있습니다.

### 보수적인 조직의 눈으로 보면

배치 시스템을 오래 운영한 조직에는 이 구조가 낯설지 않을 것이라고 봅니다.

스텝 단위로 실행 이력을 남기고, 실패한 스텝부터 재시작하며, 재처리해도 되는 스텝과 안 되는 스텝을 구분하는 것은 배치 프레임워크가 오래전부터 해 온 일입니다. 에이전트의 도구 호출을 그 스텝으로 본다는 것이 이 저장소의 관점입니다.

다른 점도 있습니다. 배치의 스텝은 사람이 미리 정의하지만, 에이전트의 스텝은 모델이 실행 중에 고릅니다. 그래서 재실행 정책을 스텝이 아니라 도구에 붙여야 하고, 모델이 고를 수 있는 도구 목록 자체가 통제의 대상이 됩니다.

감사의 관점에서도 이 구조는 쓸모가 있습니다. 실행 전에 의도가 기록되고 실행 후에 결과가 기록되므로, 로그 자체가 "누가 무엇을 하려 했고 실제로 무엇이 일어났는가"의 기록이 됩니다. 중단됨으로 처리된 호출도 로그에 남으니, 사고가 났을 때 "그 명령이 실행됐는지 모른다"는 상태가 언제 생겼고 그 뒤에 모델이 무엇을 확인했는지까지 따라갈 수 있습니다. 다만 이 로그를 감사 기록으로 쓰려면 보존 기간과 접근 권한, 그리고 앞에서 본 캡처 정책을 조직의 기준에 맞춰 먼저 정해야 합니다.

기간계 옆에 에이전트를 둘 때 제가 가장 먼저 묻고 싶은 질문도 같습니다. 이 도구는 두 번 실행되어도 됩니까.

당장 이 라이브러리를 쓰지 않더라도, 그 질문에 도구마다 답을 적어 두는 것만으로 얻는 것이 있습니다.

## 6. 오늘 바로 적용할 수 있는 순서

1. 지금 쓰는 에이전트의 도구 목록에 재실행 가능 여부 칸을 추가하고 `safe`와 `never`로 채웁니다. 기준은 도구 이름이 아니라 실제 효과의 범위입니다.
2. `never` 도구마다 효과를 확인하는 `safe` 도구가 짝으로 있는지 점검하고, 없으면 만듭니다.
3. `never` 도구는 실행 전에 의도를 기록하고 실행 후에 결과를 기록하게 바꾸고, 결과 없는 의도를 발견하면 재실행하지 않고 모델에게 중단됨으로 돌려주게 합니다.
4. 자주 중단되는 `never` 도구부터 멱등 키를 받게 고쳐 `safe`로 올립니다.
5. 로컬에서 저장소의 빠른 시작을 돌려 보고, 턴 중간에 프로세스를 죽인 뒤 무엇이 재개되고 무엇이 중단됨으로 돌아오는지 직접 확인합니다.

## 마치며

`durable-harness`는 아직 초기 버전이고, 특정 플랫폼에 기대는 부분도 큽니다.

그래도 이 저장소가 보여 주는 관점은 플랫폼과 무관하게 쓸모가 있습니다. 에이전트의 내구성은 대화를 저장하는 문제가 아니라, 실행을 기록하고 재실행 여부를 판정하는 문제라는 것입니다.

문서가 설계의 대가와 미해결 문제까지 적어 두고 있어, 코드를 쓰지 않더라도 읽어 볼 만합니다.

## 참고 자료

- [vercel-labs/durable-harness - GitHub (2026년 11월 6일 커밋 기준)](https://github.com/vercel-labs/durable-harness/tree/badd648db763e7d9121917b5c35732cd334e01be)
- [Releases - vercel-labs/durable-harness](https://github.com/vercel-labs/durable-harness/releases)
- [The chat route's 60 s handover, and send-and-hold - docs/queue-send-and-hold.md](https://github.com/vercel-labs/durable-harness/blob/badd648db763e7d9121917b5c35732cd334e01be/docs/queue-send-and-hold.md)
- [Follow-ups - docs/followups.md](https://github.com/vercel-labs/durable-harness/blob/badd648db763e7d9121917b5c35732cd334e01be/docs/followups.md)
- [Security for Durable Agent Harnesses - Vercel Docs (2026년 10월 28일 보관본)](https://web.archive.org/web/20261028224333/https://vercel.com/docs/agent-harnesses/security)
- [Making retries safe with idempotent APIs - Amazon Builders' Library](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
