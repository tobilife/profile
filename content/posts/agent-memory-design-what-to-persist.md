---
title: "에이전트 메모리 설계: 무엇을 기억시킬지보다 누가 쓰고 어떻게 고칠지가 먼저다"
date: 2026-05-13
description: "쓰는 주체별로 메모리 칸을 나누고, 쓰기 필터, 낡은 기억의 교정, compaction과의 경계, 메모리 오염 대응을 정리합니다."
category: 에이전트 엔지니어링
tags: [메모리, 하네스, 컨텍스트 엔지니어링, AI Agent, 보안, Claude Code]
draft: false
---

:::note
- 메모리는 사람이 쓰는 지시 파일, 에이전트가 쓰는 파일 메모리, 코드가 범위를 정하는 저장소로 나뉘고, 칸마다 쓰는 주체와 신뢰 수준이 다릅니다.
- 비밀, 개인정보, 검증되지 않은 외부 내용, 코드에서 바로 확인되는 사실은 모델의 판단이 아니라 쓰기 handler에서 걸러야 합니다.
- 기억은 낡습니다. 출처와 날짜와 확인 방법을 붙이고, 읽을 때 현재 상태와 대조하고, 틀리면 덧붙이지 말고 고쳐 써야 합니다.
- compaction은 한 세션을 이어 가기 위한 요약이고 메모리는 세션을 넘어 남기는 기록입니다. 반드시 지켜야 할 규칙은 둘 다가 아니라 설정과 hook에 둡니다.
:::

"메모리를 붙이면 에이전트가 쓸수록 똑똑해진다"고들 합니다.

근거가 없는 말은 아닙니다. Anthropic은 2025년 9월 memory tool과 context editing을 내놓으면서, agentic search 내부 평가에서 둘을 함께 썼을 때 기준 대비 성능이 39% 올랐고 context editing만 썼을 때는 29% 올랐다고 밝혔습니다. [\[Anthropic: Managing context on the Claude Developer Platform\]](https://www.anthropic.com/news/context-management)

그런데 같은 해 12월 OWASP가 발표한 에이전트 애플리케이션 Top 10에는 ASI06 Memory & Context Poisoning이 들어 있습니다. 오염된 메모리가 최초 상호작용이 끝난 한참 뒤에도 행동을 바꾼다는 설명입니다. [\[OWASP: Top 10 for Agentic Applications\]](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/)

**메모리는 붙이면 끝나는 기능이 아니라, 다음 세션의 입력을 누가 어떤 검증을 거쳐 쓰느냐를 정하는 쓰기 권한 설계입니다.**

이 글은 예제 하나를 끝까지 따라갑니다. 보험 청구 접수 서비스의 저장소에서 일하는 코딩 에이전트입니다. 3월에 이 에이전트가 남긴 메모리 세 줄이 5월에 어떤 문제를 일으키는지 보고, 그 세 줄을 각 절의 장치로 하나씩 다시 다뤄 보겠습니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 청구 접수 서비스 저장소에서 일하는 코딩 에이전트가 3월에 이런 내용을 메모리에 적어 두었다고 해봅시다.

```text
- 이 프로젝트의 테스트는 npm test로 실행한다
- staging DB 접속 주소는 10.0.3.12 이다
- push할 때는 항상 --force를 쓴다
```

4월에 팀은 패키지 매니저를 pnpm으로 바꾸고 staging DB를 옮겼습니다. 세 번째 줄은 에이전트가 어느 외부 블로그 글을 요약하다가 본 문장을 프로젝트 규칙으로 착각해 적은 것입니다.

5월에 새 세션을 시작한 에이전트는 이 세 줄을 사실로 받아들입니다. `npm test`가 실패하자 lockfile을 다시 만들고, 없는 DB에 접속을 시도하고, 강제 push를 준비합니다.

시스템 설계로 보면 잘못은 네 군데에 있습니다.

- 항목에 출처와 날짜가 없어서, 낡았는지 판단할 근거가 없었습니다.
- 사람이 정한 규칙과 에이전트의 관찰이 같은 칸에 섞여 있었습니다.
- 외부 문서에서 온 문장이 검증 없이 저장됐습니다.
- 읽는 쪽에서 현재 상태와 대조하는 절차가 없었습니다.

네 번째가 가장 늦게 눈에 띄지만 가장 비쌉니다. 앞의 세 가지가 모두 지켜져도 시간이 지나면 기억은 틀려지기 때문입니다.

## 1. 저장 위치: 누가 쓰느냐에 따라 칸을 나눈다

메모리를 한 덩어리로 보면 설계가 흐려집니다. 저는 쓰는 주체를 기준으로 칸을 나눠 봅니다.

| 칸 | 쓰는 주체 | 범위 | load 시점 | 예 |
| --- | --- | --- | --- | --- |
| 지시 파일 | 사람 | 조직, 프로젝트, 사용자 | 매 세션 시작 | `CLAUDE.md`, `AGENTS.md` |
| 파일 메모리 | 에이전트 | 프로젝트 또는 사용자 | index만 시작 시, 나머지는 필요할 때 | auto memory, `/memories` |
| 범위 저장소 | 애플리케이션 코드 | 사용자 ID 등 namespace | 코드가 조회할 때 | key-value store |
| 검색형 저장소 | 애플리케이션 또는 에이전트 | namespace + 질의 | 관련 있을 때 | 문서 collection |

칸을 나누는 기준은 신뢰 수준입니다. 사람이 쓰고 리뷰를 거친 것은 지시로 읽어도 되지만, 에이전트가 쓴 것은 관찰로 읽어야 합니다. 이 구분이 흐려지면 앞의 `--force` 같은 문장이 규칙의 자리에 앉습니다.

### 지시 파일은 사람이 쓰고 리뷰를 거친다

Claude Code 문서는 두 가지를 분명히 나눕니다. `CLAUDE.md`는 사람이 쓰는 지시와 규칙이고, auto memory는 Claude가 사용자의 교정과 선호를 바탕으로 스스로 적는 학습 내용입니다. 둘 다 세션 시작 때 load되지만, 문서는 Claude가 이것을 강제되는 설정이 아니라 context로 취급한다고 밝힙니다. [\[Claude Code: How Claude remembers your project\]](https://code.claude.com/docs/en/memory)

같은 문서는 `CLAUDE.md`를 파일당 200줄 아래로 유지하라고 권합니다. 길수록 context를 더 쓰고 지시를 따르는 정도가 떨어진다는 이유입니다. `@path` 문법으로 다른 파일을 import할 수 있지만, import한 파일도 시작할 때 함께 load되므로 정리에는 도움이 되어도 context를 줄이지는 않는다고 적고 있습니다.

`AGENTS.md`는 여러 코딩 에이전트가 공통으로 읽는 지시 파일 형식입니다. 공식 사이트는 이를 에이전트를 위한 README라고 부르고, 지시가 충돌하면 편집 중인 파일에서 가장 가까운 `AGENTS.md`가 우선하며 사용자가 채팅에서 직접 준 지시가 모든 것에 우선한다고 설명합니다. [\[AGENTS.md\]](https://agents.md/)

OpenAI Codex는 실행을 시작할 때 지시의 사슬을 만듭니다. Codex home 디렉터리에서 `AGENTS.override.md`나 `AGENTS.md`를 읽고, 이어서 프로젝트 root부터 현재 디렉터리까지 내려오며 디렉터리마다 파일을 하나씩 모아 root부터 차례로 이어 붙입니다. 현재 디렉터리에 가까운 파일이 뒤에 오므로 앞의 지시를 덮어씁니다. 합친 크기가 `project_doc_max_bytes`, 기본 32 KiB에 닿으면 더 붙이지 않습니다. [\[OpenAI Codex: Custom instructions with AGENTS.md\]](https://developers.openai.com/codex/guides/agents-md)

이 상한은 설계에 영향을 줍니다. 지시 파일이 길어지면 뒤쪽의 하위 디렉터리 지시부터 잘려 나갑니다. 가장 구체적인 지시가 가장 먼저 사라지는 셈이니, 지시 파일의 길이도 관리 대상입니다.

### 에이전트가 쓰는 메모리는 index와 본문을 나눈다

Claude Code의 auto memory는 프로젝트별 디렉터리에 `MEMORY.md`와 주제별 파일로 저장됩니다. `MEMORY.md`는 디렉터리의 index 역할을 하고, 세션 시작 때는 첫 200줄 또는 첫 25KB 가운데 먼저 닿는 지점까지만 load됩니다. 주제 파일은 시작 때 load되지 않고 필요할 때 읽힙니다. 이 메모리는 machine-local이고, 같은 git 저장소의 worktree와 하위 디렉터리는 하나의 메모리 디렉터리를 공유합니다. [\[Claude Code: How Claude remembers your project\]](https://code.claude.com/docs/en/memory)

이 동작은 버전마다 조금씩 다듬어졌습니다. Claude Code의 CHANGELOG에는 2.1.59에서 Claude가 유용한 context를 auto memory에 자동으로 저장하고 `/memory`로 관리한다는 항목이, 2.1.74에서 저장 위치를 바꾸는 `autoMemoryDirectory` 설정이, 2.1.83에서 `MEMORY.md` index가 200줄뿐 아니라 25KB에서도 잘린다는 항목이 있습니다. [\[Claude Code: CHANGELOG\]](https://github.com/anthropics/claude-code/blob/fdfbc06c7a6d9ace49c55b3761b1be05d276da6d/CHANGELOG.md)

Anthropic API의 memory tool은 client-side 도구입니다. 모델은 `/memories` 아래 파일에 대한 조작(view, create, str_replace, insert, delete, rename)을 요청할 뿐이고, 실제 저장은 애플리케이션이 자기 인프라에서 수행합니다. 도구를 켜면 API가 "작업 전에 항상 메모리 디렉터리를 먼저 보라, context가 언제든 초기화될 수 있다고 가정하라"는 지시를 system prompt에 자동으로 넣습니다. [\[Anthropic: Memory tool\]](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)

이 구조에서 handler는 개발자의 코드입니다. 무엇을 저장하게 둘지, `/memories`를 어느 사용자의 디렉터리에 연결할지를 코드로 통제할 수 있습니다. 2절의 필터가 들어갈 자리가 바로 여기입니다.

### 범위는 namespace로 강제한다

LangGraph 문서는 thread 범위의 단기 메모리와, 여러 thread에 걸쳐 공유되는 장기 메모리를 구분합니다. 장기 메모리는 JSON 문서로 store에 저장되고, 폴더처럼 쓰는 `namespace`와 파일 이름처럼 쓰는 `key`로 구성되며, namespace에는 흔히 사용자나 조직 ID가 들어간다고 설명합니다. [\[LangGraph: Memory overview\]](https://github.com/langchain-ai/docs/blob/1cc7b30405d81f8f59d3b9b8718dcc1c128228a2/src/oss/concepts/memory.mdx)

같은 문서는 기억의 종류를 사실(semantic), 경험(episodic), 규칙(procedural)으로 나눕니다. 에이전트에게 옮기면 사용자에 대한 사실, 과거의 행동 예시, 그리고 system prompt 자체입니다. 저는 이 구분이 칸 나누기와 맞물린다고 봅니다. 규칙에 해당하는 기억은 사람이 리뷰하는 지시 파일로 가야 하고, 사실과 경험은 에이전트가 쓰는 칸에 둘 수 있습니다.

문서는 경험 기억이 실제로는 과거의 작업 순서를 few-shot 예시로 넣는 방식으로 구현되는 경우가 많다고 설명합니다. 말로 설명하기보다 보여 주는 편이 쉬울 때가 있다는 이유입니다. 청구 접수 서비스 예제라면 "지난번 청구 상태 전이 버그를 고칠 때 어떤 순서로 재현하고 고쳤는가"가 경험 기억이 됩니다. 이런 기억은 규칙이 아니므로 지시 파일에 넣을 필요가 없고, 틀려도 다음 작업의 방향을 잘못 잡게 할 뿐 금지된 행동을 하게 만들지는 않습니다.

범위는 프롬프트로 부탁할 일이 아닙니다. A 사용자의 기억이 B 사용자의 세션에 섞이지 않게 하는 것은 조회 코드의 key가 해야 할 일입니다. 청구 접수 서비스처럼 고객 데이터가 오가는 영역이라면 특히 그렇습니다.

### 예제에 적용하면: 세 줄은 각자 다른 칸에 가야 했다

앞의 세 줄을 칸에 다시 나눠 보면 이렇습니다.

| 원래 메모리 | 성격 | 가야 할 칸 | 이유 |
| --- | --- | --- | --- |
| 테스트는 npm test | 코드에서 확인되는 사실 | 어디에도 저장하지 않음 | `package.json`을 읽으면 됨 |
| staging DB 주소 | 환경 설정 | 설정 파일이나 비밀 저장소 | 바뀌면 한곳에서만 고쳐야 함 |
| push는 항상 --force | 규칙처럼 보이는 외부 문장 | 저장하지 않음, 규칙이라면 사람이 지시 파일에 | 출처가 프로젝트가 아님 |

세 줄 가운데 에이전트의 파일 메모리에 남아도 되는 것은 없었습니다. 에이전트 메모리에 맞는 것은 "청구 상태 전이 테스트는 시간대 설정에 민감해 CI와 로컬 결과가 다를 수 있다" 같은, 코드에서 바로 읽히지 않는 관찰입니다. Claude Code 문서도 auto memory의 용도를 Claude가 코드에서 끌어낼 수 없는 프로젝트 context로 설명합니다.

### 실패 모드와 비용: 칸이 너무 많거나, 하나뿐일 때

칸을 나누는 데도 비용이 있습니다. 칸이 많아지면 같은 사실이 두 칸에 들어가고, 한쪽만 고쳐지는 일이 생깁니다. 저는 Claude Code와 Codex를 함께 쓰는 저장소라면 지시를 두 벌로 관리하지 않는 편을 권합니다. Claude Code 문서가 안내하는 import 문법으로 `CLAUDE.md`에서 `AGENTS.md`를 읽게 하면 원본을 하나로 둘 수 있습니다.

반대로 칸이 하나뿐인 경우, 즉 지시와 관찰이 같은 파일에 섞인 경우가 앞의 사고입니다. 에이전트가 사람의 지시 파일을 직접 고치게 두는 것도 같은 문제입니다. 에이전트가 제안하고 사람이 commit하는 경로를 두는 편이 안전하다고 봅니다.

## 2. 저장 금지 목록: 쓰기 경로에 필터를 둔다

### 문서가 권하는 보안 장치

Anthropic의 memory tool 문서에는 보안 고려 사항이 따로 있습니다. Claude가 대체로 민감 정보를 메모리 파일에 쓰지 않으려 하지만 더 강한 보장을 원하면 handler가 파일을 쓰기 전에 민감 정보를 걸러 내는 검증을 넣을 것, 파일 크기를 추적하고 상한을 둘 것, 오래 접근하지 않은 파일을 주기적으로 지울 것을 권합니다. [\[Anthropic: Memory tool\]](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)

경로 검증은 "반드시"라는 표현으로 적혀 있습니다. `/memories` 밖으로 나가는 경로 입력은 디렉터리 순회 공격이 될 수 있으므로, 모든 경로가 `/memories`로 시작하는지 확인하고, 정규화한 경로가 메모리 디렉터리 안에 남는지 확인하고, `../` 같은 순회 문자열과 URL 인코딩된 변형을 거부하라는 목록이 함께 있습니다.

### 저장하지 말아야 할 것

이 목록에 제 의견을 더하면 저장하지 말아야 할 것은 다음과 같습니다.

- 비밀: token, 비밀번호, 접속 문자열
- 개인정보: 고객을 식별할 수 있는 값, 청구 번호나 증권 번호 같은 업무 식별자
- 외부에서 온 지시문: 웹 페이지, 이슈, 문서에서 본 "항상 ~하라" 형태의 문장
- 코드나 git에서 바로 확인되는 사실: 디렉터리 구조, 의존성 버전, 실행 명령
- 일회성 작업 상태: 이번 세션에서만 의미 있는 진행 상황

네 번째 항목이 의외일 수 있습니다. 코드에서 읽으면 되는 사실을 메모리에 복사해 두면, 코드가 바뀌는 순간 메모리는 틀린 복사본이 됩니다. 앞의 `npm test` 사례가 그렇습니다.

다섯 번째 항목은 메모리 tool의 기본 지시와 긴장 관계에 있습니다. API가 넣는 지시는 진행 상황을 메모리에 기록하라고 하기 때문입니다. 저는 진행 상황은 작업 단위의 디렉터리에 두고 작업이 끝나면 지우며, 다음 작업까지 남길 것만 별도의 칸으로 옮기는 편이 낫다고 봅니다.

### 필터는 모델이 아니라 handler에 둔다

필터는 모델의 판단이 아니라 쓰기 handler에 둡니다. 아래는 그 생각을 옮긴 예시입니다.

```python
# 예시: 메모리 쓰기 전에 거치는 검사 (memory tool handler 안)
from pathlib import Path

ROOT = Path("/srv/agent-memory")

def resolve(user_id: str, virtual_path: str) -> Path:
    if not virtual_path.startswith("/memories"):
        raise ValueError("memories 밖의 경로")
    base = (ROOT / user_id).resolve()
    real = (base / virtual_path.removeprefix("/memories").lstrip("/")).resolve()
    real.relative_to(base)            # base 밖이면 ValueError
    return real

def before_memory_write(entry: dict) -> dict:
    if contains_secret(entry["text"]) or contains_pii(entry["text"]):
        return {"action": "reject", "reason": "sensitive"}
    if derivable_from_repo(entry["text"]):        # 실행 명령, 버전, 경로 등
        return {"action": "reject", "reason": "read it from the repo"}
    if entry["source"] == "external_content":
        entry["kind"] = "observation"             # 외부 내용은 지시가 아니라 관찰로만
        entry["verified"] = False
    if len(entry["text"]) > 2000:
        return {"action": "reject", "reason": "too long"}
    entry["written_at"] = today()
    return {"action": "write", "entry": entry}
```

`resolve`는 문서가 권한 경로 검증을 사용자별 디렉터리와 함께 구현한 것입니다. `before_memory_write`는 금지 목록을 코드로 옮긴 것입니다. 앞의 세 줄은 이 handler를 거치면 각각 "저장소에서 읽을 것", 민감 정보 검사(내부 IP 주소를 민감 정보로 분류했다면), "외부 내용은 관찰로만"에 걸립니다.

### 실패 모드와 비용: 필터가 놓치는 것

필터에도 한계가 있습니다. 비밀과 개인정보 탐지는 패턴에 기대므로, 형식이 낯선 값은 지나갈 수 있습니다. "외부에서 왔는가"는 handler가 판단하기 어렵습니다. 모델이 외부 문서를 읽은 뒤 자기 말로 바꿔 쓰면 출처 표시가 사라지기 때문입니다.

그래서 저는 출처를 모델이 쓰게 하지 않고 하네스가 붙이는 편을 권합니다. 같은 turn 안에서 웹 fetch나 외부 문서 읽기 도구가 호출됐다면, 그 turn에 쓰인 메모리는 모두 `external_content`로 표시하는 식입니다. 과하게 걸러지는 비용은 있지만, 오염된 지시가 규칙의 자리에 앉는 비용보다는 작다고 봅니다.

보험이나 금융의 관점에서는 한 가지가 더 있다고 봅니다. 청구 번호나 고객 식별값이 메모리 파일에 들어가면 그 파일은 개인정보가 담긴 저장소가 됩니다. DB와 같은 수준의 접근 통제, 보존 기한, 파기 절차가 메모리 저장소에도 적용되어야 한다고 생각합니다. machine-local로 저장되는 메모리라면 개발자 PC가 그 저장소가 된다는 점도 기억해 둘 만합니다.

## 3. 낡음과 교정: 기억은 사실이 아니라 주장으로 읽는다

기억이 틀려지는 것은 고장이 아니라 정상적인 경과입니다. 프로젝트는 계속 바뀌기 때문입니다.

### 문서가 인정하는 문제들

Claude Code 문서도 이 점을 적고 있습니다. 두 지시가 서로 모순되면 Claude가 임의로 하나를 고를 수 있으니 `CLAUDE.md`, 하위 디렉터리의 `CLAUDE.md`, `.claude/rules/`를 주기적으로 검토해 낡거나 충돌하는 지시를 지우라고 권합니다. auto memory 파일은 일반 Markdown이어서 언제든 고치거나 지울 수 있고, `/memory` 명령으로 열어 볼 수 있습니다. [\[Claude Code: How Claude remembers your project\]](https://code.claude.com/docs/en/memory)

갱신 자체도 쉽지 않습니다. LangGraph 문서는 기억을 하나의 profile 문서로 관리하면 매번 이전 profile을 넘겨 새로 쓰게 해야 하고, 문서 collection으로 쌓으면 모델이 기존 항목을 지우거나 고쳐야 하는데, 모델에 따라 지나치게 추가하거나 지나치게 덮어쓰는 경향이 있다고 설명합니다. [\[LangGraph: Memory overview\]](https://github.com/langchain-ai/docs/blob/1cc7b30405d81f8f59d3b9b8718dcc1c128228a2/src/oss/concepts/memory.mdx)

| 저장 형태 | 장점 | 갱신의 어려움 | 맞는 경우 |
| --- | --- | --- | --- |
| profile (문서 하나) | 전체 그림이 한곳에 | 매번 전체를 다시 써야 함 | 사용자 선호처럼 항목이 적을 때 |
| collection (항목 여럿) | 항목별로 좁고 쓰기 쉬움 | 삭제와 수정을 모델이 판단 | 관찰이 계속 쌓일 때 |

### 항목마다 출처와 확인 방법을 붙인다

그래서 저는 항목마다 최소한의 메타데이터를 붙이는 편이 안전하다고 봅니다.

```json
{
  "id": "mem-014",
  "kind": "observation",
  "text": "청구 상태 전이 테스트는 TZ 환경 변수에 따라 결과가 달라진다",
  "source": "tests/claim_state_test.ts 실행 결과 (CI와 로컬 비교)",
  "written_at": "2026-04-18",
  "verified": true,
  "verify_by": "TZ=UTC와 TZ=Asia/Seoul로 각각 테스트를 실행해 결과 비교",
  "supersedes": null
}
```

위 JSON은 예시입니다. `verify_by`가 핵심입니다. 읽는 쪽 에이전트에게 이 기억을 쓰기 전에 무엇을 확인하면 되는지를 알려 줍니다. 앞의 `npm test` 항목에 "package.json의 scripts.test 확인"이라는 `verify_by`가 붙어 있었다면, 5월의 에이전트는 lockfile을 다시 만들기 전에 그 한 줄을 확인했을 것입니다.

읽는 쪽의 절차도 정해야 합니다.

```text
세션 시작 -> MEMORY.md index 읽기
  -> 작업에 관련된 항목 선택
  -> 항목마다: kind가 instruction인가?
        예 -> 지시 파일에서 온 것만 지시로 사용
        아니오 -> verify_by 실행 -> 현재 상태와 일치?
                    예 -> 사용
                    아니오 -> 사용하지 않고 항목 수정 (supersedes 기록)
```

저는 이 절차를 지시 파일에 한 줄로 적어 두는 편을 권합니다. "메모리의 내용은 쓰기 전에 현재 상태와 대조한다"는 문장 하나가 앞의 사고 대부분을 막습니다.

### 고칠 때는 덧붙이지 말고 고쳐 쓴다

교정에도 규칙이 필요합니다. 틀린 기억을 발견하면 새 항목을 덧붙이지 말고 기존 항목을 고쳐 쓰게 합니다. 덧붙이기만 하면 옛 항목과 새 항목이 함께 남아 다음 세션이 둘 중 하나를 고르게 됩니다. Claude Code 문서가 말한 "모순되면 임의로 고를 수 있다"는 상황이 메모리 안에서 재현되는 것입니다.

memory tool의 명령에는 파일 전체를 다시 쓰지 않고 특정 문자열만 바꾸는 `str_replace`가 있고, 문서에 따르면 바꿀 문자열이 여러 번 나오면 바꾸지 않고 오류를 돌려줍니다. [\[Anthropic: Memory tool\]](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool) 저는 이 성질이 교정에 맞는다고 봅니다. 같은 문장이 두 번 있으면 고치기 전에 중복부터 드러나기 때문입니다.

### 언제 쓸 것인가: hot path와 background

쓰는 시점도 정해야 합니다. LangGraph 문서는 응답 경로에서 바로 쓰는 방식과 background에서 따로 쓰는 방식을 비교합니다. 응답 경로에서 쓰면 새 기억이 바로 반영되고 사용자에게 알릴 수도 있지만, 무엇을 저장할지 판단하느라 지연이 늘고 에이전트가 본 작업과 메모리 작성을 동시에 해야 합니다. background에서 쓰면 본 작업과 분리되지만, 언제 얼마나 자주 실행할지를 정해야 하고, 너무 드물면 다른 thread가 새 context 없이 남는다고 설명합니다. [\[LangGraph: Memory overview\]](https://github.com/langchain-ai/docs/blob/1cc7b30405d81f8f59d3b9b8718dcc1c128228a2/src/oss/concepts/memory.mdx)

청구 접수 서비스 예제라면 저는 background 쪽을 권합니다. 세션이 끝난 뒤 별도의 호출이 그 세션의 기록을 읽고, 금지 목록과 출처 규칙을 거쳐 후보 항목을 만들고, 사람이 승인한 것만 메모리에 쓰는 구조입니다. 지연은 생기지만, 쓰기 권한을 본 작업 중인 에이전트에게서 떼어 낼 수 있습니다.

### 실패 모드와 비용: 검증이 비쌀 때

`verify_by`를 매번 실행하면 비용이 듭니다. 모든 항목을 세션마다 확인하면 메모리가 아끼려던 탐색 비용을 다시 쓰게 됩니다. 저는 작업과 관련된 항목만, 그리고 마지막 확인 날짜가 오래된 항목만 확인하는 편이 현실적이라고 봅니다.

메모리를 아예 쓰지 않는 편이 나은 경우도 있습니다. 저장소가 작고 지시 파일이 잘 관리되어 있으며 세션이 짧다면, 에이전트 메모리가 더하는 것보다 관리 부담이 클 수 있습니다.

## 4. Compaction과 메모리: 요약은 세션 안에서, 기록은 세션 밖으로

### 세 가지 장치는 대상과 수명이 다르다

둘은 자주 혼동되지만 목적이 다릅니다.

Anthropic의 글은 compaction을 context window 한계에 가까워진 대화를 요약하고, 그 요약으로 새 context window를 시작하는 일로 정의합니다. Claude Code는 메시지 기록을 모델에 넘겨 아키텍처 결정, 해결되지 않은 버그, 구현 세부를 남기고 중복된 도구 출력은 버리며, 그 압축된 context에 가장 최근에 접근한 파일 다섯 개를 더해 이어 간다고 설명합니다. 같은 글은 에이전트가 `NOTES.md` 같은 파일에 진행 상황을 적어 두는 structured note-taking을 별개의 기법으로 다룹니다. [\[Anthropic: Effective context engineering for AI agents\]](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

| 구분 | 대상 | 수명 | 잃는 것 |
| --- | --- | --- | --- |
| context editing | 오래된 tool 결과 | 현재 세션 | 지워진 결과의 원문 |
| compaction | 대화 전체 | 현재 세션 | 요약에서 빠진 세부 |
| 메모리 | 골라낸 사실과 결정 | 세션을 넘어 지속 | 기록하지 않은 모든 것 |

context editing은 context 한계에 가까워지면 오래된 tool 호출과 결과를 자동으로 지우는 기능이고, Anthropic은 100 turn짜리 웹 검색 평가에서 context가 바닥나 실패했을 workflow를 끝내게 하면서 token 소비를 84% 줄였다고 밝혔습니다. [\[Anthropic: Managing context on the Claude Developer Platform\]](https://www.anthropic.com/news/context-management) 앞의 글은 이를 가장 가벼운 형태의 compaction이라고 부릅니다.

### 경계에서 생기는 두 가지 실수

운영에서 문제가 되기 쉬운 곳은 둘의 경계입니다.

첫 번째 실수는 대화 중에 준 지시가 compaction 뒤에 사라지는 것입니다. Claude Code 문서에 따르면 프로젝트 root의 `CLAUDE.md`는 `/compact` 뒤에 디스크에서 다시 읽혀 세션에 들어오지만, 하위 디렉터리의 `CLAUDE.md`는 그 디렉터리의 파일을 다시 읽을 때까지 돌아오지 않고, 대화 중에만 준 지시는 돌아오지 않습니다. 문서의 처방은 간단합니다. 남아야 할 지시는 `CLAUDE.md`에 적으라는 것입니다. [\[Claude Code: How Claude remembers your project\]](https://code.claude.com/docs/en/memory)

청구 접수 서비스 예제에서 개발자가 대화 중에 "이 세션에서는 청구 금액 계산 모듈을 건드리지 마"라고 했다면, 긴 작업 끝에 compaction이 일어난 뒤 그 지시는 요약에 남을 수도, 남지 않을 수도 있습니다. 그 지시가 세션을 넘어서도 유효하다면 지시 파일로, 이번 세션에만 유효하다면 2절의 작업 단위 칸으로 옮겨야 합니다.

두 번째 실수는 반대 방향입니다. compaction 요약을 통째로 메모리에 넣는 것입니다. 요약에는 이번 작업에만 의미 있는 상태가 대부분이라, 그대로 넣으면 2절의 금지 목록 다섯 번째 항목을 어기게 됩니다.

### 함께 쓸 때의 순서

memory tool 문서는 이 도구를 context editing이나 compaction과 함께 써서 긴 대화를 관리하라고 안내합니다. [\[Anthropic: Memory tool\]](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool) 함께 쓴다면 순서가 중요하다고 봅니다. 오래된 tool 결과가 지워지거나 대화가 요약되기 전에, 남겨야 할 것이 메모리로 옮겨져 있어야 하기 때문입니다.

API가 넣는 "context가 언제든 초기화될 수 있다고 가정하라"는 지시가 바로 이 순서를 모델에게 맡기는 장치입니다. 저는 여기에 하네스 쪽 장치를 하나 더 두는 편을 권합니다. compaction이 일어나기 직전에 "이번 세션에서 다음 세션까지 남길 것"을 묻는 별도의 호출을 한 번 돌리고, 그 결과를 2절의 handler에 통과시키는 것입니다. 모델의 성실함에만 기대지 않고, 남길 것을 고르는 시점을 하네스가 정하는 방식입니다.

### 판단 기준: 어디에 둘 것인가

| 정보 | 수명 | 둘 곳 |
| --- | --- | --- |
| 이번 작업의 진행 상황 | 이번 작업 | 작업 디렉터리의 메모, 끝나면 삭제 |
| 이번 세션에서만 지킬 지시 | 이번 세션 | 대화, 필요하면 작업 메모 |
| 계속 지켜야 할 규칙 | 프로젝트 수명 | 지시 파일, 리뷰 후 commit |
| 코드에서 안 보이는 관찰 | 다음 변경까지 | 에이전트 메모리, `verify_by`와 함께 |
| 반드시 막아야 할 행동 | 프로젝트 수명 | 설정과 hook (다음 절) |

## 5. 메모리는 공격 표면이다: 막아야 할 것은 설정과 hook에 둔다

### 오염은 다음 세션에서 터진다

OWASP가 ASI06을 별도 항목으로 둔 이유는 시간차에 있다고 봅니다. 프롬프트 주입은 그 turn에 드러나지만, 메모리 오염은 다음 세션에서 사실이나 규칙의 얼굴을 하고 나타납니다. [\[OWASP: Top 10 for Agentic Applications\]](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/) 앞의 `--force` 한 줄은 악의가 없는 착각이었지만, 같은 경로로 의도적인 지시가 들어올 수 있습니다.

### 저장 위치도 공격 대상이다

메모리를 어디에 쓰는지도 보안 결정입니다. Claude Code 문서에 따르면 `autoMemoryDirectory` 설정은 policy와 user 설정, `--settings` flag에서만 받아들이고 project나 local 설정에서는 받아들이지 않습니다. 두 파일 모두 프로젝트 디렉터리 안에 있어서, clone한 저장소가 메모리 쓰기를 민감한 위치로 돌려놓을 수 있기 때문이라는 설명입니다. [\[Claude Code: How Claude remembers your project\]](https://code.claude.com/docs/en/memory)

memory tool의 경로 순회 검증과 같은 생각입니다. 메모리의 쓰기 경로는 모델의 입력이나 저장소의 파일이 바꿀 수 없어야 합니다.

### 지시와 강제를 나눈다

가장 중요한 구분은 이것이라고 봅니다. 메모리와 지시 파일은 모두 context입니다. 모델이 따를 가능성을 높일 뿐 행동을 막지는 못합니다.

Claude Code 문서는 조직이 배포하는 관리형 `CLAUDE.md`와 관리형 설정의 쓰임을 나눠 설명합니다. 특정 도구나 명령이나 경로를 막는 일, sandbox 격리를 강제하는 일은 관리형 설정의 `permissions.deny`나 `sandbox.enabled`로 하고, 코드 스타일이나 데이터 취급 주의 사항이나 행동 지침은 관리형 `CLAUDE.md`에 두라는 표입니다. 설정의 규칙은 Claude가 무엇을 결정하든 client가 집행한다는 설명이 함께 붙어 있습니다. [\[Claude Code: How Claude remembers your project\]](https://code.claude.com/docs/en/memory) 도구 호출 직전에 실행되는 hook도 같은 쪽에 속하는 수단이라고 봅니다.

| 원하는 것 | 메모리나 지시 파일 | 설정이나 hook |
| --- | --- | --- |
| 테스트 명령을 알려 주기 | 지시 파일 한 줄이면 충분 | 필요 없음 |
| 강제 push 금지 | 지시만으로는 보장 안 됨 | 명령 패턴을 deny하거나 hook에서 차단 |
| 운영 DB 접속 금지 | 지시만으로는 보장 안 됨 | 네트워크 정책, sandbox, deny |
| 고객 데이터를 메모리에 쓰지 않기 | 지시는 보조 | 쓰기 handler의 필터 |

앞의 예제에서 `--force` 한 줄이 실제로 강제 push까지 갔다면, 그것은 메모리 문제이기 전에 권한 문제입니다. 메모리에 무엇이 들어오든 강제 push 명령이 막혀 있었다면 사고는 거기서 멈췄을 것입니다.

### 오염된 기억을 찾아내는 점검

권한으로 막더라도 메모리 자체는 주기적으로 점검해야 합니다. 저는 사람이 메모리 디렉터리를 열어 볼 때 다음 항목을 먼저 찾는 편을 권합니다. 모두 제 의견이고, 어느 도구의 기능도 아닙니다.

- 명령형 문장: "항상", "절대", "반드시"로 시작하는 문장이 에이전트가 쓴 칸에 있다면 출처를 확인합니다. 규칙은 지시 파일에만 있어야 합니다.
- 위험한 flag와 명령: `--force`, `--no-verify`, 삭제 명령처럼 권한 설정에서 막고 있는 것이 메모리에 적혀 있다면, 누군가 그것을 하라고 기록한 이유를 따집니다.
- 주소와 식별자: URL, IP, 계정 이름, 청구 번호가 들어 있다면 2절의 금지 목록을 다시 적용합니다.
- 지시 파일과의 충돌: 메모리의 내용이 지시 파일과 다르다면 메모리를 고칩니다. 지시 파일이 낡았다면 사람이 지시 파일을 고칩니다.
- 출처가 외부인 항목: `external_content`로 표시된 항목이 확인되지 않은 채 오래 남아 있다면 지웁니다.

이 점검을 스크립트로 돌리고 결과만 사람이 보게 하면 부담이 크지 않습니다. 메모리가 일반 텍스트 파일이라는 점이 여기서 장점이 됩니다. grep 한 줄로 찾을 수 있는 것을 굳이 사람이 다 읽을 필요는 없습니다.

보험이나 금융처럼 통제가 엄격한 조직에서는 이 구분이 이미 익숙할 것입니다. 업무 매뉴얼과 시스템 권한은 다른 문서이고, 감사는 매뉴얼이 아니라 권한 설정을 봅니다. 에이전트에게도 같은 원칙을 적용하면 됩니다.

## 6. 오늘 바로 적용할 수 있는 순서

1. 사람이 쓰는 지시 파일과 에이전트가 쓰는 메모리를 다른 위치로 나눕니다. 지시 파일은 저장소에 commit하고 코드 리뷰를 거치게 하며, 길이가 도구의 load 상한 안에 들어오는지 확인합니다.
2. 저장 금지 목록을 정하고 쓰기 handler나 hook에서 검사합니다. 경로 검증과 출처 표시는 모델이 아니라 하네스가 합니다.
3. 메모리 항목에 종류, 출처, 날짜, 확인 방법을 붙이고, 지시 파일에 "메모리의 내용은 쓰기 전에 현재 상태와 대조한다"를 적습니다. 틀린 항목은 덧붙이지 말고 고쳐 씁니다.
4. 대화 중에 정한 규칙 가운데 계속 지켜야 할 것은 그 자리에서 지시 파일로 옮기고, 반드시 막아야 할 행동은 지시가 아니라 권한 설정이나 hook으로 옮깁니다.
5. 메모리 디렉터리를 사람이 열어 보는 주기를 정합니다. 오래 쓰이지 않은 항목과 확인에 실패한 항목은 지웁니다.

## 마치며

메모리는 에이전트를 편하게 만들지만, 검증 없이 쌓인 기억은 다음 세션의 잘못된 전제가 됩니다.

누가 쓰는지에 따라 칸을 나누고, 쓰기 경로에 필터를 두고, 읽을 때 대조하게 하고, 반드시 막아야 할 것은 권한으로 막으면 대부분의 문제를 설계 단계에서 줄일 수 있습니다.

그리고 사람이 열어서 읽고 고칠 수 있는 형태로 두는 것이 좋습니다. 일반 텍스트 파일이 여전히 좋은 선택인 이유입니다.

## 참고 자료

- [Memory tool - Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)
- [Managing context on the Claude Developer Platform - Anthropic](https://www.anthropic.com/news/context-management)
- [Effective context engineering for AI agents - Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [How Claude remembers your project - Claude Code Docs](https://code.claude.com/docs/en/memory)
- [Claude Code CHANGELOG (2026-05-11 기준)](https://github.com/anthropics/claude-code/blob/fdfbc06c7a6d9ace49c55b3761b1be05d276da6d/CHANGELOG.md)
- [Custom instructions with AGENTS.md - Codex](https://developers.openai.com/codex/guides/agents-md)
- [AGENTS.md](https://agents.md/)
- [Memory overview - LangGraph (2026-05-11 기준)](https://github.com/langchain-ai/docs/blob/1cc7b30405d81f8f59d3b9b8718dcc1c128228a2/src/oss/concepts/memory.mdx)
- [OWASP Top 10 for Agentic Applications](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/)
