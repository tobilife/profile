---
title: "도구가 너무 많을 때: 정의도 결과도 모델을 거치지 않게 한다"
date: 2025-11-11
description: "MCP 도구가 늘면 정의와 중간 결과가 컨텍스트를 채웁니다. 도구를 코드 API로 노출하고 실행 환경에서 처리하는 접근의 동작 방식, 통제, 대가를 정리합니다."
category: 에이전트 엔지니어링
tags: [MCP, 컨텍스트 엔지니어링, 하네스, 보안, AI Agent]
draft: false
---

:::note
- 도구가 많아지면 비용은 두 군데서 샙니다. 미리 실리는 도구 정의, 그리고 모델을 거쳐 가는 중간 결과입니다.
- 도구를 직접 호출하게 하지 않고 코드 API로 노출하면, 에이전트는 필요한 정의만 읽고 데이터는 실행 환경에서 걸러 낼 수 있습니다.
- 중간 데이터가 모델 컨텍스트에 들어오지 않는 구조는 비용뿐 아니라 민감 정보 통제에도 쓸 수 있습니다. 다만 그 통제는 출력 규칙과 쓰기 관문을 하네스가 강제할 때만 성립합니다.
- 대신 에이전트가 쓴 코드를 돌릴 샌드박스가 새 운영 대상이 됩니다. 도구가 적고 결과가 작다면 직접 호출이 여전히 낫습니다.
:::

MCP가 자리를 잡으면서 "서버를 많이 붙일수록 에이전트가 유능해진다"는 생각도 같이 퍼졌습니다. 이슈 트래커, 문서 저장소, 메신저, DB를 전부 연결하면 에이전트가 그만큼 많은 일을 할 수 있다는 기대입니다.

연결할 수 있는 것과 잘 쓰는 것은 다릅니다. **도구 정의와 중간 결과가 전부 모델의 컨텍스트를 통과하는 구조에서는, 도구가 늘수록 비용과 지연과 오류가 함께 늡니다.**

Anthropic은 2025년 11월 4일 글에서 이 문제를 정면으로 다뤘습니다. 수십 개 MCP 서버에 걸쳐 수백, 수천 개의 도구를 붙인 에이전트가 흔해졌고, 모든 도구 정의를 미리 싣고 중간 결과를 컨텍스트로 넘기는 방식이 에이전트를 느리고 비싸게 만든다는 진단입니다. [\[Anthropic: Code execution with MCP\]](https://www.anthropic.com/engineering/code-execution-with-mcp)

Cloudflare는 그보다 앞선 9월 26일에 같은 방향의 글을 냈습니다. MCP 도구를 TypeScript API로 바꾸고 LLM에게 그 API를 호출하는 코드를 쓰게 했더니, 더 많고 더 복잡한 도구를 다룰 수 있었다는 내용입니다. [\[Cloudflare: Code Mode\]](https://blog.cloudflare.com/code-mode/)

Anthropic의 글도 Cloudflare가 비슷한 결과를 발표했다고 언급합니다. 서로 다른 두 회사가 같은 방향을 가리킨다는 점에서, 특정 제품의 기능이라기보다 하네스 설계의 패턴으로 볼 만합니다. 도구를 어떻게 잘 설계하느냐는 다른 글에서 다뤘으므로, 여기서는 도구를 모델에게 어떤 모양으로 보여 주고 데이터를 어느 길로 흘릴지에 집중합니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 보험사 사내 에이전트에 문서 저장소, 수납 시스템, 정산 시스템, 메신저를 포함해 MCP 서버 열두 개가 붙어 있다고 해봅시다. 사용자가 이렇게 요청합니다.

```text
10월 수납 내역 시트에서 미납 건만 골라 정산 시스템에 독촉 대상으로 등록해 줘.
```

에이전트는 시트 조회 도구를 부릅니다. 1만 행이 도구 결과로 돌아와 컨텍스트에 실립니다. 모델은 그중 미납 건을 눈으로 골라, 등록 도구의 인자에 한 건씩 다시 적습니다.

중간쯤에서 계약 번호 한 자리가 바뀝니다. 등록은 성공으로 끝나고 아무도 알아채지 못합니다.

이 작업에서 모델이 판단해야 했던 것은 "미납 건을 골라 등록한다"는 계획 한 줄입니다. 그런데 설계상 모델은 1만 행을 읽고 수백 건을 받아쓰는 일까지 맡았습니다.

- 요청과 무관한 서버 열한 개의 도구 정의가 처음부터 컨텍스트를 차지했습니다.
- 필터링이라는 결정적 연산을 모델의 주의력에 맡겼습니다.
- 데이터가 모델을 거쳐 복사되는 경로에 검증이 없었습니다.
- 계약자 이름과 연락처가 담긴 1만 행이 통째로 모델에 들어갔습니다.

Anthropic의 글도 같은 위험을 적습니다. 큰 문서나 복잡한 자료 구조에서는 모델이 도구 호출 사이에서 데이터를 옮겨 적다가 실수할 가능성이 높아진다는 것입니다.

이 미납 독촉 등록 작업을 끝까지 들고 가면서, 직접 호출 구조를 코드 실행 구조로 바꿀 때 무엇이 좋아지고 무엇을 새로 설계해야 하는지 보겠습니다.

## 1. 비용은 두 군데서 샌다: 미리 실리는 정의와 거쳐 가는 결과

### 도구 정의는 어떻게 실리는가

MCP에서 클라이언트는 서버에 도구 목록을 요청하고, 서버는 도구마다 이름, 설명, 입력 JSON 스키마를 돌려줍니다. 2025년 6월 판 명세에는 화면 표시용 제목, 출력 구조를 정의하는 출력 스키마, 도구의 성격을 알려 주는 annotations도 선택 항목으로 들어 있습니다. 목록이 길면 커서로 나눠 받고, 목록이 바뀌면 서버가 알림을 보냅니다. [\[MCP Specification 2025-06-18: Tools\]](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

명세는 이 목록을 모델에게 어떻게 보여 줄지를 정하지 않습니다. 그런데 Anthropic이 지적하듯 대부분의 MCP 클라이언트는 모든 도구 정의를 미리 컨텍스트에 싣습니다. 수천 개의 도구에 연결된 에이전트라면 요청을 읽기도 전에 수십만 토큰을 처리해야 합니다. [\[Anthropic: Code execution with MCP\]](https://www.anthropic.com/engineering/code-execution-with-mcp)

수천 개까지 가지 않아도 무게는 금방 찹니다. Simon Willison은 10월 글에서 GitHub의 공식 MCP 서버 하나만으로도 컨텍스트를 수만 토큰 쓴다는 점을 MCP의 가장 큰 한계로 꼽았습니다. [\[Simon Willison: Claude Skills are awesome, maybe a bigger deal than MCP\]](https://simonwillison.net/2025/Oct/16/claude-skills/)

토큰 비용만의 문제가 아닙니다. Anthropic의 컨텍스트 엔지니어링 글은 가장 흔한 실패로 비대한 도구 세트를 꼽습니다. 사람 엔지니어가 어떤 상황에 어떤 도구를 써야 할지 단정하지 못한다면 에이전트도 더 잘할 수 없다는 것입니다. [\[Anthropic: Effective context engineering for AI agents\]](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

### 중간 결과는 어떻게 지나가는가

직접 호출 방식에서는 모든 중간 결과가 모델을 통과합니다. Anthropic이 든 예는 회의록을 문서 저장소에서 읽어 CRM 레코드에 붙이는 작업입니다. 회의록 전문이 한 번은 도구 결과로, 한 번은 다음 도구의 인자로 컨텍스트를 두 번 지나갑니다. 2시간짜리 회의라면 5만 토큰을 추가로 처리하게 될 수 있고, 더 큰 문서는 컨텍스트 한계를 넘어 작업이 깨질 수 있다고 합니다.

Cloudflare는 같은 현상을 이렇게 묘사합니다. 각 도구 호출의 출력이 다음 호출의 입력으로 복사되기 위해서만 LLM에 들어가고, 그 과정에서 시간과 에너지와 토큰이 낭비된다는 것입니다. [\[Cloudflare: Code Mode\]](https://blog.cloudflare.com/code-mode/)

```text
[직접 호출]
모델 ──호출──> 도구 A ──결과 전체──> 모델 ──결과를 인자로 다시 작성──> 도구 B

[코드 실행]
모델 ──코드 작성──> 실행 환경 ──> 도구 A ──> (필터, 변환) ──> 도구 B
                      └──요약, 건수만──> 모델
```

### 먼저 숫자로 나눠 본다

구조를 바꾸기 전에 어디서 얼마나 새는지 재 보는 것이 순서입니다. 미납 독촉 등록 세션 하나를 직접 호출 방식으로 돌렸을 때의 토큰을 나눠 적으면 이런 표가 나옵니다. 수치는 계산 방식을 보이기 위한 예시입니다.

| 구간 | 내용 | 예시 토큰 | 모델이 판단에 쓴 비율 |
| --- | --- | --- | --- |
| 도구 정의 | 서버 12개, 도구 140개 | 45,000 | 도구 2개분만 사용 |
| 사용자 요청 | 한 문장 | 40 | 전부 |
| 시트 조회 결과 | 1만 행 | 300,000 이상, 한계 초과 가능 | 미납 판별에 필요한 열 하나 |
| 등록 호출 인자 | 미납 600건을 한 건씩 | 30,000 | 0 (받아쓰기) |

이 표에서 볼 것은 마지막 열입니다. 정의와 결과의 대부분은 판단에 쓰이지 않고 지나가기만 합니다. 마지막 열이 대부분 비어 있다면 이 글의 접근을 검토할 만하고, 대부분 차 있다면 구조를 바꿔도 얻을 것이 적습니다.

### 이 비용이 실제로 깨뜨리는 것

비용의 끝은 청구서가 아니라 정확성이라고 봅니다. 1만 행이 컨텍스트를 넘으면 작업은 중간에 실패하거나, 하네스가 결과를 잘라 넣으면서 모델은 일부만 보고 전부를 본 것처럼 판단합니다. 넘지 않더라도 600건을 받아쓰는 동안 한 자리씩 틀릴 기회가 600번 생깁니다. 앞의 사례에서 계약 번호가 바뀐 것은 모델의 부주의가 아니라 설계가 만든 확률이었습니다.

## 2. 도구를 코드 API로 보여 주면 에이전트는 필요한 것만 읽는다

### 파일 트리로 보여 주기

해법의 첫 절반은 도구를 보여 주는 방식을 바꾸는 것입니다.

Anthropic이 소개한 구현은 연결된 MCP 서버의 도구를 파일 트리로 만드는 방식입니다. 서버마다 디렉터리가 있고 도구마다 파일이 하나씩 있습니다. 에이전트는 디렉터리를 나열해 서버를 찾고, 지금 필요한 도구 파일만 읽어 인터페이스를 파악합니다.

미납 독촉 사례의 서버들을 이렇게 펼치면 다음과 같습니다. 서버와 함수 이름은 설명을 위해 지어낸 것입니다.

```text
servers/                         (예시)
├── doc-store/
│   ├── getSheet.ts
│   └── searchDocuments.ts
├── settlement/
│   ├── registerDunning.ts
│   └── getDunningStatus.ts
├── messenger/ ...
└── (서버 9개 더)
```

```ts
// 예시: servers/settlement/registerDunning.ts
// MCP 서버의 도구 정의(inputSchema, description)에서 생성한 래퍼
/**
 * 계약을 미납 독촉 대상으로 등록한다.
 * 같은 계약을 같은 달에 두 번 등록하면 오류를 반환한다.
 */
export interface RegisterDunningInput {
  contractNo: string;   // 계약 번호 12자리
  amount: number;       // 미납 금액(원)
  dueMonth: string;     // "2025-10"
}
export async function registerDunning(input: RegisterDunningInput): Promise<{ id: string }> {
  return callMCPTool("settlement__register_dunning", input);
}
```

에이전트는 `servers/`를 나열하고, 요청과 관련된 `doc-store/getSheet.ts`와 `settlement/registerDunning.ts` 두 파일만 읽습니다. 나머지 열 개 서버의 정의는 디렉터리 이름으로만 존재합니다.

효과에 대한 수치도 제시되었습니다. 글의 예시에서 토큰 사용량이 15만에서 2천으로 줄었고, 이를 98.7% 절감이라고 표현했습니다. [\[Anthropic: Code execution with MCP\]](https://www.anthropic.com/engineering/code-execution-with-mcp)

:::caution
이 수치는 해당 글의 예시 시나리오에 대한 것입니다. 도구 수, 정의의 길이, 작업의 성격에 따라 달라지므로, 자기 시스템의 절감 폭은 직접 재야 합니다.
:::

### 검색 도구로 보여 주기

파일 트리만 방법인 것은 아닙니다. 같은 글은 도구 검색용 도구를 두는 대안도 듭니다. 에이전트가 키워드로 관련 도구를 찾고, 이름만 볼지, 이름과 설명까지 볼지, 스키마를 포함한 전체 정의를 볼지 상세 수준을 고르게 하는 방식입니다.

미납 독촉 사례라면 에이전트가 "독촉"으로 검색해 이름 목록을 받고, 그중 `registerDunning` 하나만 전체 정의로 다시 요청하는 흐름이 됩니다. 파일시스템을 줄 수 없는 환경에서는 이쪽이 현실적입니다.

검색 방식에는 고유한 약점이 있습니다. 에이전트가 떠올린 검색어와 도구 설명의 단어가 맞아야 찾을 수 있다는 점입니다. 사용자는 "독촉"이라고 말했는데 도구 설명에는 "연체 안내"라고 적혀 있다면, 필요한 도구가 있는데도 없다고 판단할 수 있습니다. 사내 용어가 부서마다 다른 조직이라면, 도구 설명에 동의어를 함께 적어 두는 일이 검색 방식의 성패를 가른다고 봅니다.

### 코드 한 줄을 실행하는 도구 하나로 보여 주기

Cloudflare의 구현은 더 단순하게 요약됩니다. 에이전트에게 연결된 서버의 도구를 전부 보여 주는 대신, TypeScript 코드를 실행하는 도구 하나만 줍니다. MCP 서버에 연결하면 SDK가 서버의 스키마를 가져와 문서 주석이 붙은 TypeScript API로 바꾸고, 에이전트는 그 API를 부르는 코드를 씁니다. 실행이 끝나면 `console.log`로 찍은 내용이 에이전트에게 돌아갑니다. [\[Cloudflare: Code Mode\]](https://blog.cloudflare.com/code-mode/)

왜 이쪽이 더 잘 되는지에 대한 Cloudflare의 설명은 학습 데이터입니다. LLM은 실제 코드는 아주 많이 봤지만, 도구 호출은 모델 개발사가 만든 합성 데이터로만 배웠다는 것입니다. 글은 이를 셰익스피어에게 한 달짜리 중국어 수업을 듣게 한 뒤 그 언어로 희곡을 쓰라는 것에 비유합니다. 이 설명은 Cloudflare의 가설로 제시된 것이고, 저도 그 정도의 강도로 읽는 편이 맞다고 봅니다.

이 구조는 지난달 나온 Agent Skills와 같은 원리 위에 있습니다. 목록만 먼저 보여 주고 상세는 필요할 때 읽게 하는 점진적 공개입니다. [\[Anthropic: Equipping agents for the real world with Agent Skills\]](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

### 구조를 바꾸기 전에 할 수 있는 것

코드 실행으로 가기 전에 더 싼 조치가 두 가지 있습니다. 하나는 쓰지 않는 서버를 떼는 것입니다. 다른 하나는 도구를 줄이고 묶는 것입니다. Anthropic은 9월 도구 설계 글에서 도구가 많다고 결과가 좋아지지는 않으며, 자주 이어지는 여러 단계를 도구 하나로 묶을 수 있다고 적었습니다. [\[Anthropic: Writing effective tools for agents\]](https://www.anthropic.com/engineering/writing-tools-for-agents)

미납 독촉이 매달 반복되는 정형 업무라면, "시트에서 미납 건을 골라 등록한다" 자체를 서버 쪽 도구 하나로 만드는 편이 코드 실행보다 단순하고 안전할 수 있습니다. 코드 실행은 조합이 매번 달라지는 일, 미리 도구로 만들어 둘 수 없는 일에서 빛납니다.

### 보여 주는 방식을 바꿀 때의 실패 모드

첫째, 탐색 비용이 생깁니다. 정의가 미리 실려 있지 않으므로 에이전트는 디렉터리를 나열하고 파일을 읽는 왕복을 거칩니다. 도구가 열 개 남짓이라면 이 왕복이 아낀 토큰보다 비쌀 수 있습니다.

둘째, 정의를 읽지 않고 추측해서 호출하는 경우가 생깁니다. 함수 이름만 보고 인자 모양을 짐작해 코드를 쓰면, 실행 오류가 나고 다시 고치는 왕복이 늘어납니다. 생성된 래퍼에 타입과 문서 주석을 충실히 붙이고, 실행 전에 타입 검사를 돌리는 편이 이 왕복을 줄입니다.

셋째, 생성된 래퍼가 서버와 어긋날 수 있습니다. 파일 트리의 `.ts` 파일은 어느 시점의 도구 목록에서 만든 사본입니다. MCP 명세에는 도구 목록이 바뀌면 서버가 알림을 보내는 장치가 있으므로, 하네스가 그 알림을 받아 래퍼를 다시 생성하고 타입 검사를 다시 돌리게 해야 합니다. 그러지 않으면 정산 시스템에 필수 인자가 하나 추가된 날, 에이전트는 옛 래퍼를 읽고 쓴 코드로 실행 시점에야 실패를 만납니다. 래퍼 생성기와 그 산출물도 하네스의 일부로 버전을 관리하는 편이 안전하다고 봅니다.

## 3. 데이터는 실행 환경에서 걸러 내고 모델에게는 요약만 준다

### 미납 독촉을 코드로 다시 쓰면

해법의 나머지 절반은 데이터가 지나는 길을 바꾸는 것입니다.

앞의 미납 건 사례를 코드 실행 방식으로 다시 쓰면 다음과 같습니다.

```ts
// 예시: 에이전트가 작성해 샌드박스에서 실행하는 코드
import * as sheets from "./servers/doc-store";
import * as settlement from "./servers/settlement";

const rows = await sheets.getSheet({ sheetId: "receipts-2025-10" });

// 먼저 상태 값의 분포를 본다 (판단 근거를 모델에게 준다)
const dist: Record<string, number> = {};
for (const r of rows) dist[r.status] = (dist[r.status] ?? 0) + 1;
console.log("상태 분포", dist);

const unpaid = rows.filter((r) => r.status === "UNPAID");

let registered = 0;
const failed: string[] = [];
for (const r of unpaid) {
  try {
    await settlement.registerDunning({ contractNo: r.contractNo, amount: r.amount, dueMonth: "2025-10" });
    registered++;
  } catch (e) {
    failed.push(r.contractNo.slice(-4)); // 끝 네 자리만 남긴다
  }
}

console.log(`전체 ${rows.length}행 중 미납 ${unpaid.length}건, 등록 ${registered}건, 실패 ${failed.length}건`);
console.log("실패 계약 끝자리", failed.slice(0, 5));
```

모델이 보는 것은 상태 분포 한 줄과 마지막 두 줄의 출력입니다. 1만 행은 실행 환경 안에서만 움직입니다.

### 무엇이 달라지는가

달라지는 점은 세 가지입니다.

- 필터링이 결정적 연산이 됩니다. `status === "UNPAID"`는 모델의 주의력과 무관하게 같은 결과를 냅니다.
- 계약 번호가 모델의 출력을 거쳐 다시 적히지 않습니다. 변수에서 변수로 넘어갑니다.
- 반복과 조건과 오류 처리를 도구 호출의 연쇄가 아니라 코드로 씁니다.

Anthropic은 1만 행 시트 예시에서 에이전트가 1만 행 대신 다섯 행만 본다고 설명하고, 집계나 여러 출처의 조인, 특정 필드 추출에도 같은 패턴이 통한다고 적습니다. 조건 분기를 코드로 써 두면 분기마다 모델이 판단하기를 기다릴 필요가 없어, 첫 토큰까지의 지연도 줄어든다고 합니다. [\[Anthropic: Code execution with MCP\]](https://www.anthropic.com/engineering/code-execution-with-mcp)

### 모델이 데이터를 보지 않을 때의 실패 모드

이 구조에는 직접 호출에 없던 실패가 하나 생깁니다. 모델이 데이터를 보지 않으므로, 데이터가 예상과 다를 때 알아채지 못합니다.

예를 들어 수납 시트의 상태 값이 어떤 달부터 `UNPAID`가 아니라 `미납`으로 들어오기 시작했다고 해봅시다. 필터는 0건을 돌려주고, 코드는 "미납 0건, 등록 0건"을 출력하고, 모델은 이번 달은 미납이 없다고 보고합니다. 직접 호출이었다면 모델이 1만 행을 읽다가 낯선 값을 봤을 수도 있습니다.

앞의 코드가 필터 전에 상태 값의 분포를 찍는 이유가 이것입니다. 요약에는 결과뿐 아니라 결과를 의심할 근거, 곧 값의 분포, 빈 값의 수, 예상 범위를 벗어난 건수를 함께 넣어야 한다고 봅니다. 모델에게서 데이터를 치운 만큼, 데이터의 모양은 다시 보여 줘야 합니다.

### 출력 규칙은 하네스가 강제한다

제가 여기에 덧붙이고 싶은 것은 출력 규칙입니다. 건수와 분포와 표본만 남기도록 하네스 수준에서 정해 두지 않으면, 에이전트는 확인하려고 전체를 출력하고 문제는 원점으로 돌아옵니다.

출력 규칙은 프롬프트에 부탁하는 것이 아니라 실행 환경의 설정으로 두는 편이 안전합니다. 설정 예시는 이렇습니다.

```yaml
# 예시: 코드 실행 샌드박스 정책
sandbox:
  network: none                 # MCP 서버 바인딩 외의 외부 통신 없음
  timeout_seconds: 120
  memory_mb: 512
output:
  max_bytes: 8000               # 넘으면 잘라 내고 "출력 초과" 표시를 모델에게 전달
  redact_patterns:              # 모델로 돌아가기 전에 가림
    - resident_registration_no
    - phone_number
    - account_no
tools:
  settlement.registerDunning:
    max_calls_per_run: 1000
    require_approval_over: 100  # 한 실행에서 100건 초과면 사람 승인 후 진행
audit:
  store_code: true              # 에이전트가 쓴 코드 원문 보관
  store_output: true
```

`max_bytes`를 넘는 출력을 조용히 자르면 앞에서 말한 잘린 결과 문제가 그대로 돌아오므로, 잘렸다는 사실을 모델에게 알리는 것까지가 규칙입니다.

### 상태를 파일로 남기고, 잘 된 코드는 Skill로 만든다

파일시스템이 있는 실행 환경에서는 중간 결과를 파일로 남겨 두고 나중에 이어서 작업할 수 있습니다. Anthropic의 글은 여기서 더 나아가, 잘 동작한 코드를 함수로 저장해 두고 `SKILL.md`를 붙이면 재사용할 수 있는 Skill이 된다고 연결합니다. [\[Anthropic: Code execution with MCP\]](https://www.anthropic.com/engineering/code-execution-with-mcp)

미납 독촉 코드가 몇 달 동안 문제없이 돌았다면, 그것을 `skills/register-monthly-dunning.ts`로 저장하고 검토를 거쳐 고정하는 것이 다음 단계입니다. 매달 모델이 같은 코드를 새로 쓰게 하는 것보다, 검토된 코드를 부르게 하는 편이 결과도 감사도 단순해집니다.

## 4. 모델을 거치지 않는 데이터는 통제할 수 있는 데이터다

### 토큰화와 데이터 흐름 규칙

이 패턴을 비용 절감으로만 보면 절반만 본 것이라고 생각합니다. 금융이나 보험처럼 개인정보를 다루는 조직에는 다음 성질이 더 중요할 수 있습니다.

Anthropic의 설명에 따르면 코드 실행 방식에서 중간 결과는 기본적으로 실행 환경에 머뭅니다. 에이전트가 보는 것은 명시적으로 로그로 남기거나 반환한 것뿐입니다. 더 민감한 작업에서는 하네스가 데이터를 자동으로 토큰화할 수 있습니다. 이메일, 전화번호, 이름이 모델에게는 자리 표시자로만 보이고, 다른 MCP 도구 호출로 넘어갈 때 MCP 클라이언트가 원래 값으로 되돌립니다. 데이터가 어디에서 어디로 흐를 수 있는지를 결정적 규칙으로 정의하는 데에도 쓸 수 있다고 합니다. [\[Anthropic: Code execution with MCP\]](https://www.anthropic.com/engineering/code-execution-with-mcp)

```text
수납 시트 ──(실제 연락처)──> MCP 클라이언트 ──(토큰화)──> 모델: "EMAIL_17, PHONE_17"
                                  │
모델이 쓴 코드: messenger.send({ to: "PHONE_17", ... })
                                  │
                         MCP 클라이언트 ──(원래 값으로 복원)──> 메신저 서버
```

### 키를 쥐는 쪽과 바깥으로 나가는 길

Cloudflare 쪽 구현에는 두 가지 통제가 더 있습니다. 샌드박스는 인터넷과 완전히 격리되고, 바깥으로 나가는 유일한 길은 연결된 MCP 서버를 나타내는 바인딩입니다. 그리고 그 바인딩은 이미 인증된 인터페이스로 제공되므로 접근 토큰은 감독 계층이 쥐고 있고, AI가 쓴 코드가 키를 유출할 수 없습니다. [\[Cloudflare: Code Mode\]](https://blog.cloudflare.com/code-mode/)

이 두 통제가 왜 중요한지는 Simon Willison이 6월에 정리한 위험 조합으로 설명할 수 있습니다. 비공개 데이터에 접근할 수 있고, 신뢰할 수 없는 내용에 노출되며, 바깥으로 통신할 수 있는 에이전트는 공격자에게 데이터를 넘기도록 속을 수 있다는 것입니다. 그는 MCP가 출처가 다른 도구들을 섞어 쓰게 만든다는 점을 문제로 짚었습니다. [\[Simon Willison: The lethal trifecta for AI agents\]](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)

미납 독촉 사례는 세 조건을 다 갖출 수 있습니다. 수납 데이터는 비공개이고, 시트 안의 메모 칸은 누가 무엇을 적었을지 모르며, 메신저 서버는 바깥으로 메시지를 보냅니다. 네트워크를 막고 나가는 길을 바인딩으로 좁히는 것은 세 번째 조건을 지우는 일입니다. 다만 메신저 서버 바인딩 자체가 바깥으로 나가는 길이므로, 그 도구의 수신자를 허용 목록으로 묶는 통제가 함께 있어야 한다고 봅니다.

### "고객 정보가 모델에 들어가는가"에 답하기

"고객 정보가 모델에 들어가는가"라는 질문을 받았을 때 직접 호출 구조에서는 "도구 결과에 포함되면 들어간다"고 답할 수밖에 없습니다. 코드 실행 구조에서는 "출력 규칙과 토큰화 규칙이 허용한 것만 들어간다"고 답할 수 있습니다. 통제가 프롬프트의 당부에서 하네스의 규칙으로 옮겨 간다는 뜻입니다.

물론 이 답이 성립하려면 규칙이 실제로 구현되어 있어야 하고, 실행 환경의 로그가 감사 대상으로 남아야 합니다. 에이전트가 작성한 코드 자체를 기록해 두면 무엇을 조회해 어디에 썼는지를 사후에 재현할 수 있다는 점도 장점이라고 봅니다. 대화 로그만으로는 모델이 무엇을 의도했는지만 알 수 있지만, 실행된 코드는 무엇이 실제로 일어났는지를 보여 줍니다.

### 통제가 깨지는 방식

가장 흔한 구멍은 출력입니다. 에이전트가 디버깅하려고 `console.log(rows[0])`을 한 줄 넣는 순간, 첫 행의 모든 개인정보가 모델로 돌아갑니다. 토큰화가 알려진 필드 이름에만 걸려 있다면, 메모 칸에 섞여 들어간 전화번호는 그대로 지나갑니다. 그래서 출력에 대한 가림 처리는 필드 이름이 아니라 값의 패턴으로도 걸어야 하고, 그래도 새는 경우를 전제로 로그를 점검해야 한다고 봅니다.

## 5. 공짜가 아니다: 샌드박스가 새 운영 대상이 된다

### 무엇을 새로 운영하게 되는가

Anthropic은 글 말미에 대가를 분명히 적었습니다. 에이전트가 생성한 코드를 돌리려면 샌드박싱, 자원 제한, 모니터링을 갖춘 안전한 실행 환경이 필요하고, 이는 직접 호출에는 없던 운영 부담과 보안 고려를 더한다는 것입니다. 이점과 구현 비용을 저울질하라고 권합니다. [\[Anthropic: Code execution with MCP\]](https://www.anthropic.com/engineering/code-execution-with-mcp)

샌드박스가 무엇을 막아야 하는지는 Anthropic이 10월에 Claude Code의 샌드박싱을 설명한 글이 잘 정리합니다. 파일시스템 격리와 네트워크 격리가 둘 다 있어야 하고, 네트워크 격리가 없으면 탈취된 에이전트가 SSH 키 같은 민감한 파일을 빼낼 수 있으며, 파일시스템 격리가 없으면 샌드박스를 벗어나 네트워크 접근을 얻을 수 있다는 설명입니다. 구현은 운영체제 수준의 기능 위에 올렸고, 명령이 띄운 하위 프로세스까지 같은 제한을 받는다고 합니다. [\[Anthropic: Beyond permission prompts\]](https://www.anthropic.com/engineering/claude-code-sandboxing)

Cloudflare는 이 부담을 줄이는 방법으로 컨테이너 대신 V8 isolate를 들었습니다. isolate는 수 밀리초 안에 몇 MB의 메모리로 뜨기 때문에 에이전트가 코드를 실행할 때마다 새로 만들고 버려도 부담이 작다는 설명입니다. 다만 이를 위한 Worker Loader API는 글 시점에 운영 환경용으로는 비공개 베타였습니다. [\[Cloudflare: Code Mode\]](https://blog.cloudflare.com/code-mode/)

보험사의 사내 환경이라면 운영 항목은 대략 이렇게 늘어납니다.

- 실행 환경 이미지와 허용 패키지 목록의 관리
- CPU, 메모리, 실행 시간 제한과 그 초과 시의 동작
- 네트워크 차단과 MCP 바인딩만 허용하는 경로
- 에이전트가 쓴 코드와 출력의 보관, 보관 기간, 열람 권한
- 샌드박스 탈출이나 이상 호출에 대한 모니터링과 경보

이 목록은 낯선 것이 아닙니다. 보험사나 은행의 IT 조직은 이미 배치 서버, 망 분리, 접근 통제, 작업 로그 보관을 운영하고 있습니다. 제가 보기에 코드 실행 환경은 "에이전트가 그때그때 작성하는 배치 프로그램을 돌리는 서버"에 가깝습니다. 그렇게 분류하면 어떤 망에 둘지, 누가 접근 권한을 승인할지, 실행 로그를 얼마나 보관할지를 기존 배치 운영 기준에 맞춰 정할 수 있습니다.

다른 점은 프로그램의 작성자가 사람이 아니고, 실행마다 코드가 다를 수 있다는 것입니다. 그래서 기존 배치처럼 프로그램을 미리 검수하는 방식은 통하지 않고, 실행 환경의 제한과 쓰기 관문과 사후 감사로 통제의 무게가 옮겨 갑니다. 앞 절에서 잘 동작한 코드를 Skill로 고정하라고 한 것은, 반복되는 업무만큼은 다시 사전 검수 체계로 돌려보내자는 뜻이기도 합니다.

### 쓰기 통제를 다시 설계해야 한다

MCP 명세는 신뢰와 안전을 위해 도구 호출을 거부할 수 있는 사람이 항상 고리 안에 있어야 한다고 권고합니다. 애플리케이션은 어떤 도구가 노출되는지 보여 주고, 호출을 시각적으로 표시하고, 작업에 대해 사용자 확인을 받아야 한다는 것입니다. [\[MCP Specification 2025-06-18: Tools\]](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

직접 호출은 호출 하나하나가 하네스를 지나가므로 이 확인을 붙이기 쉽습니다. 코드 실행에서는 반복문 안에서 600번 일어나는 등록을 하나씩 확인받을 수 없습니다. 그래서 쓰기 도구는 실행 단위로 묶어 통제하는 편이 낫다고 봅니다. 먼저 모의 실행으로 무엇을 쓸지 목록을 만들고, 사람이 그 목록을 승인한 뒤, 승인된 목록만 실제로 씁니다.

```python
# 예시: 쓰기 도구를 감싸는 하네스 쪽 관문
def run_agent_code(code, mode):
    calls = []
    sandbox = Sandbox(code, tools=bind_tools(record=calls, dry_run=(mode == "plan")))
    out = sandbox.run()
    if mode == "plan":
        writes = [c for c in calls if c.tool in WRITE_TOOLS]
        return {"output": out, "pending_writes": summarize(writes)}  # 건수, 금액 합계, 표본
    return {"output": out}

plan = run_agent_code(agent_code, mode="plan")
if plan["pending_writes"]["count"] > APPROVAL_THRESHOLD:
    approval = request_human_approval(plan["pending_writes"])     # 결재 화면으로
    if not approval.ok:
        stop("승인 거절")
run_agent_code(agent_code, mode="commit")
```

미납 독촉이라면 승인 화면에는 "독촉 등록 600건, 미납 금액 합계, 표본 5건"이 올라갑니다. 담당자가 보는 것은 1만 행이 아니라 이번 실행이 바꿀 것의 요약입니다. 모의 실행과 실제 실행 사이에 데이터가 바뀔 수 있으므로, 실제 실행 때 건수가 승인된 값과 다르면 멈추게 하는 장치도 필요합니다.

### 두 방식의 비교

두 방식을 나란히 놓으면 이렇습니다.

| 항목 | 직접 도구 호출 | 코드 실행 |
| --- | --- | --- |
| 도구 정의 적재 | 미리 전부 | 필요한 것만 읽음 |
| 중간 결과 | 모델을 통과 | 실행 환경에 머묾 |
| 반복, 조건 | 호출마다 모델 판단 | 코드로 한 번에 |
| 필요한 인프라 | MCP 클라이언트 | 샌드박스, 자원 제한, 모니터링 추가 |
| 실패 양상 | 잘못된 도구 선택, 옮겨 적기 실수 | 잘못된 코드, 데이터 이상을 못 봄, 실행 환경 문제 |
| 단건 승인 통제 | 호출 단위로 끼워 넣기 쉬움 | 모의 실행과 일괄 승인 설계 필요 |
| 감사 자료 | 대화 로그 | 대화 로그와 실행된 코드, 출력 |

### 어느 쪽을 고를 것인가

선택 기준은 제 의견으로 적어 둡니다.

| 상황 | 권하는 방식 |
| --- | --- |
| 도구가 십여 개, 결과가 작음 | 직접 호출. 쓰지 않는 서버만 정리 |
| 같은 다단계 작업이 매번 반복됨 | 서버 쪽에 묶은 도구 하나 |
| 도구가 많지만 결과는 작음 | 검색 도구나 파일 트리로 정의만 지연 적재 |
| 큰 데이터를 도구 사이에서 옮기고, 조합이 매번 다름 | 코드 실행 |
| 개인정보가 흐르고 외부 발신 도구가 있음 | 코드 실행에 출력 규칙, 토큰화, 쓰기 관문까지 갖춘 뒤에만 |

## 6. 오늘 바로 적용할 수 있는 순서

1. 세션 시작 시점의 컨텍스트에서 도구 정의가 차지하는 토큰을 잽니다. 사용자 요청보다 정의가 몇 배 큰지 숫자로 확인합니다.
2. 최근 세션에서 가장 큰 도구 결과 다섯 개를 뽑아, 모델이 그 내용을 판단에 썼는지 다음 도구로 옮기기만 했는지 구분합니다. 1절의 표처럼 마지막 열을 채워 봅니다.
3. 쓰지 않는 서버와 도구부터 떼고, 매번 반복되는 다단계 작업은 서버 쪽 도구 하나로 묶습니다. 구조를 바꾸기 전에 할 수 있는 가장 싼 조치입니다.
4. 옮기기만 한 경우가 많다면, 읽기 전용 도구 몇 개를 코드 API로 감싸 네트워크가 막힌 실행 환경에서 시험합니다. 요약에는 건수와 함께 값의 분포를 넣게 합니다.
5. 출력 상한과 가림 규칙, 쓰기 도구의 모의 실행과 일괄 승인, 실행된 코드의 보관을 먼저 정한 뒤 쓰기 도구로 범위를 넓힙니다.

## 마치며

도구를 더 붙이는 일은 쉽고, 그 도구들이 컨텍스트에 남기는 무게는 눈에 잘 보이지 않습니다. 코드 실행 접근은 모델에게 판단을 맡기고 운반은 코드에 맡기자는 역할 분리로 읽을 수 있습니다. 그 대가로 샌드박스라는 운영 대상이 하나 늘고, 모델이 보지 않는 데이터를 대신 지켜볼 규칙을 하네스가 갖춰야 합니다. 어느 쪽이 맞는지는 도구의 수와 데이터의 크기를 직접 재 본 뒤에 정할 일입니다.

## 참고 자료

- [Code execution with MCP: Building more efficient agents](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [Code Mode: the better way to use MCP](https://blog.cloudflare.com/code-mode/)
- [Model Context Protocol Specification 2025-06-18: Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Writing effective tools for agents — with agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Beyond permission prompts: making Claude Code more secure and autonomous](https://www.anthropic.com/engineering/claude-code-sandboxing)
- [Simon Willison: The lethal trifecta for AI agents](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)
- [Simon Willison: Claude Skills are awesome, maybe a bigger deal than MCP](https://simonwillison.net/2025/Oct/16/claude-skills/)
