---
title: "Hallmark: 디자인 취향을 통과와 실패가 있는 검사 목록으로 바꾼 skill"
date: 2026-05-28
description: "Nutlope/hallmark를 취향을 검사로 옮긴 사례로 읽고, 질문 게이트, 자기 비평, stamp와 메모리, 자기 채점의 한계를 봅니다."
category: 저장소 소개
tags: [오픈소스, Agent Skills, 코딩 에이전트, 하네스, Eval, 가드레일]
draft: false
---

:::note
- Hallmark는 Claude Code, Cursor, Codex용 디자인 skill로, "AI가 만든 티"를 번호가 붙은 예/아니오 질문으로 바꿔 놓았습니다.
- 코드를 쓰기 전에 기존 프로젝트를 읽고 세 가지를 묻고 구조를 먼저 고르며, 출력 전에 6개 축의 자기 비평과 slop test를 거치고, 선택한 결과를 CSS 주석 stamp와 `.hallmark/log.json`에 남깁니다.
- 2026년 5월 말 기준으로 이 검사는 모델이 자기 출력에 스스로 답하는 방식입니다. 렌더링해서 확인하는 루프는 roadmap의 뒤쪽에 있습니다.
- 한 저장소 안에서 게이트 개수가 60, 65, 69로 다르게 적혀 있는 점은 산문으로 쓴 검사가 겪는 drift를 보여 줍니다.
:::

"디자인은 취향의 영역이라 에이전트에게 규칙으로 줄 수 없다"는 말이 있습니다. 그래서 프롬프트에 "깔끔하고 모던하게"라고 적습니다.

결과는 대개 비슷합니다. 어느 서비스의 랜딩 페이지인지 구분되지 않는 화면이 나옵니다.

**취향을 에이전트에게 전달하는 실용적인 방법은 형용사가 아니라, 답이 예 또는 아니오로 떨어지는 질문 목록입니다.**

2026년 4월 27일에 "Hallmark v0.2.0"이라는 메시지로 첫 commit이 올라온 Hallmark는 이 생각을 skill 하나로 구현했습니다. [\[Hallmark: Initial commit\]](https://github.com/Nutlope/hallmark/commit/c49b190911) README는 Together AI가 만들었다고 밝히고, 이 skill이 brief에 맞는 macrostructure를 고르고, 22개 theme 가운데 하나를 입히고, 65개의 slop-test 게이트와 출력 전 자기 비평을 실행하며, 모든 LLM이 학습해 온 분포 한가운데의 기본값을 거부한다고 소개합니다. [\[Hallmark: README\]](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/README.md)

이 글은 2026년 5월 26일 시점의 저장소(commit `39fe438`)를 기준으로 씁니다. 예제 하나를 끝까지 따라갑니다. 보험 비교 상담 서비스의 랜딩 페이지를 코딩 에이전트에게 맡기는 경우입니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 코딩 에이전트에게 "보험 비교 상담 서비스 랜딩 페이지를 깔끔하고 모던하게 만들어 줘"라고 했다고 해봅시다.

돌아온 페이지는 익숙한 모습입니다. Inter 폰트, 보라에서 파랑으로 가는 gradient, 가운데 정렬된 hero, 아이콘과 제목이 있는 카드 3개가 나란히 놓입니다. 그 아래에는 "50,000명이 선택한 상담 서비스"라는, 아무도 준 적 없는 숫자가 있습니다. 화면 위쪽에는 주소창과 신호등 점까지 그려 넣은 가짜 브라우저 창이 앱 화면을 감싸고 있습니다.

"AI가 만든 것 같지 않게 해 줘"라고 다시 시키면 색만 바뀝니다. 구조는 같습니다.

시스템 설계로 보면 문제는 이렇습니다.

- 기준이 형용사여서 합격과 불합격을 판정할 수 없었습니다.
- 모델이 기본으로 고르는 선택지를 금지 목록으로 적지 않았습니다.
- 누구를 위한 어떤 페이지인지 묻지 않고 바로 만들었습니다.
- 직전 결과의 기록이 없어서 같은 구조를 반복했습니다.
- 주어지지 않은 수치를 지어내는 것을 막는 규칙이 없었습니다.

보험 상담 서비스라면 마지막 항목은 취향 문제가 아닙니다. 근거 없는 이용자 수는 광고 문구 심의에서 걸릴 수 있는 문장입니다.

Hallmark는 이 다섯 가지에 각각 장치를 둡니다. 아래 네 절은 질문 목록, 코드 이전의 단계, 기록, 그리고 한계를 차례로 봅니다.

## 1. 취향을 질문으로: 모든 답이 아니오여야 통과한다

### 규칙은 한 줄, 질문은 69개

skill의 핵심 파일은 `references/slop-test.md`입니다. 규칙은 한 줄입니다. 출력을 돌려주기 전에 목록을 실행하고, 모든 답이 "아니오"여야 합니다. [\[Hallmark: slop-test.md\]](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/references/slop-test.md)

질문은 구체적입니다. 형용사 지시와 나란히 놓으면 차이가 보입니다.

| 형용사로 쓴 지시 | Hallmark의 게이트 (요약) |
| --- | --- |
| 폰트를 세련되게 | display 폰트가 Inter, Roboto, Open Sans, Poppins, Lato나 시스템 기본값인가 (1번) |
| 색을 과하지 않게 | 보라에서 파랑, 또는 cyan에서 magenta로 가는 gradient가 어디든 있는가 (2번) |
| 레이아웃을 독창적으로 | 아이콘 위에 제목이 있는 3단 동일 폭 카드가 있는가 (3번) |
| 애니메이션을 자연스럽게 | `transition: all`을 썼는가 (11번) |
| 문구를 믿음직하게 | 사용자가 주지 않은 수치를 지어냈는가 (56번) |
| 화면을 진짜처럼 | 가짜 브라우저 창이나 휴대폰 틀을 손으로 그렸는가 (57번) |
| 모바일에서도 잘 보이게 | 320px에서 1920px 사이에 가로 스크롤이 생기는가 (36번) |

앞의 예제 페이지는 이 표의 일곱 줄 가운데 다섯 줄에 걸립니다.

### 게이트는 분류되어 있다

69개의 질문은 묶음으로 나뉘어 있습니다. 같은 파일의 제목을 따라 정리하면 다음과 같습니다.

| 묶음 | 번호 | 무엇을 보나 |
| --- | --- | --- |
| Visual | 1~8 | 기본 폰트, gradient, 카드 패턴, 순수 검정과 흰색 |
| Structural | 9~10 | 직전 페이지와 같은 구조, 똑같은 section 리듬 |
| Microinteractions | 11~20 | `transition: all`, 일괄 hover 확대, focus ring 등장 방식 |
| Variety | 21~23 | stamp 누락, 직전과 같은 macrostructure |
| Implementation | 24~29 | 무채색 중립색, accent 면적, spacing scale, 줄 길이 |
| Hero, 다양성, 레이아웃 | 30~38 | 영상 LCP, 장식 배경, 가로 스크롤 |
| 서체, 입력 상태, 대비 | 39~50 | 서체 수, 입력란 상태, WCAG 대비 |
| Nav, footer, hero 구조 | 51~55 | AI 기본형 nav와 footer, 전부 가운데 정렬된 hero |
| 정직성, 가짜 chrome, token | 56~58 | 지어낸 수치, 가짜 브라우저 창, token 밖의 값 |
| 반응형과 이후 추가분 | 59~69 | 두 줄로 꺾이는 버튼, `overflow-x: clip`, 기타 |

이 분류에서 눈에 띄는 것은 취향만 다루지 않는다는 점입니다. 지어낸 수치 금지, token 밖의 색상값 금지, 가짜 브라우저 창 금지처럼 정직성과 일관성에 관한 게이트가 함께 있고, 대비와 입력 상태처럼 접근성 기준에 가까운 게이트도 있습니다.

### 번호와 범위가 검사를 운영 가능하게 만든다

여기서 배울 점이 두 가지 있다고 봅니다.

하나는 번호입니다. 게이트에 번호가 있으니 실패를 번호로 보고할 수 있습니다. skill은 결과 요약에 통과 개수를 적고, 실패가 있으면 해당 게이트 번호를 나열하게 합니다. [\[Hallmark: SKILL.md\]](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/SKILL.md) 사람이 "56번이 왜 실패했나"를 물을 수 있고, 예외를 승인할 때도 번호 단위로 기록할 수 있습니다.

다른 하나는 범위입니다. 모든 게이트가 모든 상황에 적용되지는 않습니다. skill은 editorial, modern-minimal, atmospheric, playful의 네 genre를 두고, brief에 나온 신호로 genre를 정합니다. 예를 들어 SaaS, enterprise, API, B2B 같은 말이 나오면 modern-minimal, AI 도구, 음악, 영상, 다크 모드 같은 말이 나오면 atmospheric이고, 신호가 없으면 editorial이 기본입니다. genre는 어떤 게이트가 느슨해지는지를 정합니다. atmospheric은 배경에 한해 방사형 gradient를 허용하고, modern-minimal은 순수한 흰색 배경과 무채색 중립색을 허용합니다. 예외가 규칙 옆에 적혀 있습니다.

보험 비교 상담 서비스는 consumer 서비스이므로 playful 신호가 걸릴 수도, 아무 신호 없이 editorial로 갈 수도 있습니다. 어느 쪽이든 genre가 정해지는 순간 적용할 게이트 집합이 정해진다는 점이 중요합니다.

### 실패 모드: 질문이 판단을 요구할 때

모든 질문이 같은 종류는 아닙니다. 1번(기본 폰트인가)은 CSS의 `font-family`만 보면 답이 나옵니다. 9번(직전 페이지와 같은 구조인가)이나 55번(목적 없는 장식이 있는가)은 판단이 필요합니다. 같은 목록 안에 기계적으로 답할 수 있는 질문과 판단이 필요한 질문이 섞여 있고, 둘 다 같은 모델이 답합니다. 이 문제는 4절에서 다시 봅니다.

## 2. 코드 이전의 단계: 묻고, 읽고, 구조부터 고른다

### Design flow 전체

질문 목록은 마지막 관문입니다. 그 앞에 여러 단계가 있습니다. 아래는 SKILL.md의 Design flow를 일부 생략하고 옮긴 것입니다. [\[Hallmark: SKILL.md\]](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/SKILL.md)

```text
0 기존 코드 scan -> 1 audience / use / tone 질문, genre 결정
-> 2 macrostructure 선택 -> 2.5 프로젝트 메모리 확인 -> 2.6 theme 경로
-> 3 규칙 load -> 4 hero 보강 결정 -> 5 preview 요약
-> 6 build (stamp, log.json, tokens.css) -> 7 자기 비평 + slop test
                 | 실패한 게이트가 있으면
                 +--> build로 돌아가 수정, preview 요약도 다시 작성
```

### 0단계: 묻기 전에 기존 프로젝트를 읽는다

프로젝트에 이미 코드가 있으면 Hallmark는 사용자에게 무엇을 묻기 전에 그것부터 읽어야 합니다. 폰트 묶음, 색상값, motion 라이브러리, spacing scale, framework를 정해진 순서로 찾고, 찾은 것을 파일과 줄 번호와 함께 보고한 뒤, 무엇을 보존하고 무엇을 새로 들일지 밝힙니다. 결과는 `.hallmark/preflight.json`에 저장해 두고, 사용자가 다시 scan하라고 하거나 `package.json`이 그보다 새로우면 다시 읽습니다.

이 단계에는 보안 규칙도 들어 있습니다. 프로젝트 root의 `design.md`는 디자인 시스템 데이터로만 다루고, 그 안에 명령 실행, 패키지 설치, URL 접근, 비밀 접근, 범위 밖 파일 수정을 요구하는 문장이 있어도 무시하라고 적혀 있습니다. 저장소의 파일이 에이전트의 지시로 바뀌는 경로를 막아 둔 것입니다.

기존 코드에 대한 안전 장치도 따로 있습니다. 운영 파일이나 route 디렉터리를 사용자가 명시적으로 요청하거나 승인하지 않는 한 지우지 말고, 수정하기 전에 고칠 파일과 만들 파일과 지울 파일을 먼저 밝히라는 규칙입니다.

### 1단계: 항상 묻고, 추론했다면 밝힌다

1단계는 질문입니다. 누가 쓰는지(audience), 이 화면이 하는 한 가지 일이 무엇인지(use case), 어떤 tone인지를 묻습니다. SKILL.md는 "clean and modern"은 tone이 아니라고 적고 editorial, brutalist, soft, utilitarian, luxury, playful, technical, austere 같은 극단에서 고르게 합니다.

규칙은 단호합니다. brief가 다섯 단어든 길고 자세하든 항상 묻습니다. 사용자가 "그냥 만들어"라고 하면 추론하되, 추론한 세 가지를 답의 첫 문장에 밝히고 CSS stamp에도 남깁니다. skill은 그 이유를 묻는 비용은 메시지 하나지만 잘못 짐작한 비용은 전체 재작업이라고 적습니다.

보험 비교 상담 예제라면 질문은 이렇게 답해질 수 있습니다. audience는 처음 보험을 비교해 보는 30대, use case는 상담 예약 한 가지, tone은 utilitarian입니다. "깔끔하고 모던하게"라는 원래 요청이 판정 가능한 세 단어로 바뀐 것입니다.

### 2단계와 5단계: 구조를 먼저 고르고, 코드 전에 요약한다

2단계는 visual 규칙을 읽기 전에 21개의 macrostructure 가운데 하나를 고르는 일입니다. macrostructure는 heading 위치, 본문 구성, 구분선, 버튼 말투, 이미지 처리, 등장 방식을 묶은 페이지의 모양입니다. skill은 목록 전체가 아니라 고른 하나의 파일만 읽으라고 지시하는데, 전체를 읽으면 약 37KB를 쓸데없이 읽게 된다는 이유입니다. nav와 footer도 이 단계에서 고르고, AI의 흔적으로 가장 잘 알려진 형태(wordmark와 링크 4~5개와 오른쪽 버튼, 링크 4열 footer)는 기본값에서 피하게 합니다.

고른 결과는 말로 밝힙니다. "Macrostructure: 이름. Theme: 이름. 직전과 다른 축: 무엇"을 코드보다 먼저 적게 하는데, skill은 이것을 머릿속이 아니라 화면에서 고르게 하는 책임 장치라고 부릅니다.

5단계 preview는 코드를 쓰기 전에 내놓는 짧은 요약입니다. macrostructure, theme, hero 보강, section 순서, motion, slop test 결과의 여섯 칸이 필수이고, 이전 기록이 있으면 무엇이 달라졌는지를 한 칸 더 적습니다. 사용자가 수백 줄의 CSS가 나오기 전에 방향을 바꿀 수 있게 하는 지점입니다. 7단계에서 게이트가 실패하면 preview도 다시 써야 하는데, preview가 거짓이면 내보내지 말라는 이유가 붙어 있습니다.

### study: 참고 디자인에서 복제가 아니라 구조를 뽑는다

사용자가 참고하고 싶은 디자인을 가져오는 경우도 단계로 다룹니다. `hallmark study`는 screenshot이나 URL을 받아 macrostructure, 구성 요소의 원형, 서체 조합, 기준 색을 뽑아 진단 보고서를 냅니다. URL이면 페이지의 HTML과 CSS를 읽으므로 정확한 폰트 이름과 색상값을 댈 수 있지만, 리듬은 판단하지 못한다고 SKILL.md는 적습니다. 로그인이 필요하거나 JavaScript로만 그려지는 페이지라면 screenshot을 달라고 되돌아갑니다. [\[Hallmark: SKILL.md\]](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/SKILL.md)

거부 규칙도 함께 있습니다. 픽셀을 복사하지 않고, template 마켓의 URL은 거부합니다. 뽑은 구조를 이식 가능한 `design.md`로 내보낼 때는 진단보다 엄격한 기준을 적용해, URL에서 뽑은 경우라면 그 출처가 사용자 자신의 것이거나 자기 브랜드를 위한 공개 참고 자료라는 확인을 요구합니다.

진단 뒤에 그 구조로 페이지를 만들게 하면, 2.6단계는 catalog theme 대신 진단에서 나온 구조와 색을 씁니다. 69번 게이트는 study 진단이 나왔는데 stamp의 theme가 catalog 이름으로 바뀌어 있는지를 묻습니다. 앞 단계의 결정이 뒤 단계에서 조용히 기본값으로 돌아가는 일을 질문 하나로 막은 것입니다.

보험 비교 상담 예제에서 팀이 좋아하는 다른 업종의 예약 페이지 URL을 가져왔다면, study는 그 페이지의 구조와 서체 조합을 진단하고, 그 구조로 상담 예약 페이지를 다시 만드는 데 쓸 수 있습니다. 문구와 이미지는 가져오지 않습니다.

### 실패 모드와 비용: 매번 묻는 비용

항상 묻는 규칙에는 비용이 있습니다. 같은 사용자가 같은 프로젝트에서 열 번째 페이지를 만들 때도 같은 세 질문을 받습니다. skill은 `audit`, `study`, `redesign --mood`처럼 대상에서 context를 읽는 동사에서만 질문을 건너뛰게 합니다.

저는 팀에서 쓴다면 이 질문의 답을 `design.md`나 별도 파일에 고정해 두는 편을 권합니다. skill도 프로젝트 root에 `design.md`가 있으면 그것을 잠긴 디자인 시스템으로 보고 이후 선택을 그것에 따르게 합니다. 질문을 없애는 것이 아니라 답을 기록으로 옮기는 방식입니다.

## 3. 자기 비평과 stamp와 프로젝트 메모리: 결정을 산출물에 새긴다

### 게이트 앞에 점수 단계를 둔다

게이트를 돌리기 전에 한 단계가 더 있습니다. 계획한 출력을 6개 축에서 1점부터 5점으로 매깁니다. [\[Hallmark: slop-test.md\]](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/references/slop-test.md)

| 축 | 묻는 것 |
| --- | --- |
| Philosophy | 페이지가 취하는 분명한 입장이 있는가, 그냥 레이아웃인가 |
| Hierarchy | 2초 안에 1순위, 2순위, 3순위가 보이는가 |
| Execution | 선 굵기, accent 면적, focus ring, 대비 같은 세부가 기준에 맞는가 |
| Specificity | 이 brief의 페이지로 보이는가, 누구의 페이지라도 될 수 있는가 |
| Restraint | 자리값을 못 하는 것을 모두 걷어 냈는가 |
| Variety | 이전 출력과 구조적 지문이 겹치는가, 색만 바꾼 것은 다양성이 아니다 |

어느 축이든 3점 미만이면 게이트로 가기 전에 수정합니다. 정지 조건도 적혀 있습니다. 두 번의 수정은 정상이고, 세 번째가 필요하면 디자인이 아니라 brief가 잘못됐다는 신호이니 brief를 다시 읽으라는 것입니다. 반복 개선 loop에 탈출 규칙을 둔 셈입니다.

점수는 파일 첫머리에 `/* Hallmark · pre-emit critique: P5 H4 E5 S4 R5 V5 */` 같은 주석으로 남깁니다. 다음 실행이 이 주석을 찾아 같은 약점을 반복하지 않게 하려는 것입니다.

### stamp: 무엇을 골랐는지 산출물에 남긴다

Hallmark는 만든 CSS의 첫 줄에 macrostructure, tone, 기준 색상을 담은 주석을 남기게 합니다. 사용자가 질문을 건너뛰어 추론으로 정한 경우에는 그 추론도 여기에 남습니다. skill은 이 stamp를 무엇을 골랐는지에 대한 지속적인 기록이라고 부릅니다.

```text
/* Hallmark · macrostructure: Stat-Led · tone: utilitarian · anchor hue: 250 */
/* Hallmark · pre-emit critique: P4 H5 E4 S4 R5 V4 */
```

위 두 줄은 SKILL.md의 형식을 따른 예시입니다. 다음 실행은 저장소에서 이 stamp를 찾고, 찾으면 다른 macrostructure를 골라야 합니다.

### token을 잠가 중간의 즉흥을 막는다

stamp가 "무엇을 골랐는가"의 기록이라면, token은 "고른 것을 끝까지 지켰는가"의 장치입니다. SKILL.md는 모든 verb에 적용되는 규율 가운데 하나로 token 잠금을 둡니다. theme를 고른 뒤에는 산출물의 모든 색과 모든 `font-family`가 이름 붙은 token을 참조해야 하고, 인라인 색상값이나 token을 우회하는 서체 선언은 허용되지 않습니다. 필요한 값이 token에 없으면 먼저 token 블록에 새 변수로 올린 뒤 참조하라고 합니다. 이것이 58번 게이트입니다. [\[Hallmark: SKILL.md\]](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/SKILL.md)

build 단계는 페이지 CSS와 별도로 `tokens.css`를 항상 만들게 합니다. 색, 서체, spacing, 글자 크기, easing, 지속 시간, 선, 모서리 token을 모두 담고, 페이지 CSS는 이름으로만 참조합니다. 색은 OKLCH로, spacing은 4pt 단위의 이름 붙은 scale로 선언하라는 규칙도 함께 있습니다.

이 장치가 검사와 맞물리는 방식이 흥미롭습니다. 값이 모두 token을 거치면, "token 밖의 값이 있는가"라는 질문은 CSS에서 색상 리터럴을 찾는 문자열 검사로 바뀝니다. 취향의 문제가 형식의 문제로 내려온 것입니다. 보험 비교 상담 예제에서 에이전트가 상담 버튼만 눈에 띄게 하려고 hex 색 하나를 직접 넣었다면, 그 한 줄이 58번에 걸립니다.

### log.json: 다음 실행이 읽는 기록

그리고 프로젝트 root의 `.hallmark/log.json`에 실행 기록을 추가합니다. 새 항목은 배열의 맨 앞에 들어가고, 파일은 최근 20개만 남깁니다. 아래는 SKILL.md가 제시하는 형식을 따라 예제의 기록을 적은 예시입니다.

```json
[
  {
    "date": "2026-05-26",
    "macrostructure": "Stat-Led",
    "theme": "Quiet",
    "enrichment": "none",
    "brief": "보험 비교 상담 예약 랜딩"
  }
]
```

다음 실행은 이 파일의 최근 3~5개 항목을 읽습니다. macrostructure는 최근 세 번과 겹치면 안 되고, theme는 직전과 적어도 한 축에서 달라야 하며, hero 보강 방식도 직전과 같으면 안 됩니다. [\[Hallmark: SKILL.md\]](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/SKILL.md)

theme가 다르다는 판정도 기준이 있습니다. 배경 밝기 대역(어두움, 중간, 밝음), display 서체 계열(italic serif, roman serif, geometric sans, mono 등), accent 색상 계열(따뜻함, 차가움, 무채색, 그 밖의 유채색)의 세 축 가운데 하나 이상이 달라야 합니다. "색만 바꾸면 다양성이 아니다"라는 원칙을 판정 가능한 축으로 옮긴 것입니다.

skill은 여기서 한 걸음 더 나갑니다. 고르기 전에 "최근 5번은 이랬고, 그래서 이번에는 이 후보 중에서 고른다"를 평문으로 먼저 쓰게 합니다. 규칙을 따랐는지를 사용자가 눈으로 확인할 수 있게 한 것입니다. skill은 이 문장을 건너뛰면 사용자가 다양화 규칙을 연극으로 여기기 시작한다고 적습니다.

같은 보험사의 상품 페이지를 연달아 만든다고 하면, 두 번째 페이지는 Stat-Led와 Quiet를 피해야 합니다. 이 규칙은 서로 다른 사이트를 만들 때는 맞지만, 한 브랜드의 여러 페이지를 만들 때는 오히려 방해가 됩니다. skill은 `design.md`가 있는 프로젝트에서는 다양화 규칙을 뒤집어 페이지들이 시스템을 공유하게 하라고 적고, ROADMAP에도 multi-page coherence가 다음 과제로 올라 있습니다. [\[Hallmark: ROADMAP.md\]](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/ROADMAP.md)

### audit: 기록이 거짓이 되는 경우까지 검사한다

기록은 검사에도 쓰입니다. `hallmark audit`은 코드를 고치지 않고 발견 사항만 돌려주는 동사입니다. 항목마다 어떤 anti-pattern인지, 파일과 줄 범위, 심각도(critical, major, minor), 한 줄 수정안을 적고, 마지막에 심각도별 개수를 셉니다. [\[Hallmark: audit.md\]](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/references/verbs/audit.md)

심각도의 기준은 anti-pattern 목록 자체에 들어 있습니다. `anti-patterns.md`는 항목을 그대로 내보내면 slop이 되는 critical, AI가 만든 것처럼 보이는 major, microinteraction의 흔적, 작은 취향 문제인 minor로 묶어 두고, 끝에 audit이 어떻게 보고해야 하는지를 따로 적습니다. 보고는 항목마다 심각도, 이름, 파일과 줄, 왜 흔적인지 한 줄, 수정 한 줄이고, 마지막에 개수와 함께 "slop으로 출고됨", "AI가 만든 것으로 읽힘", "거의 다 됨, minor만 고칠 것" 가운데 하나의 판정을 붙입니다. [\[Hallmark: anti-patterns.md\]](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/references/anti-patterns.md) 생성 때 쓰는 질문 목록과 채점 때 쓰는 목록이 같은 원천에서 나오므로, 만들 때 피한 것과 검사할 때 찾는 것이 어긋나지 않게 하려는 구조로 읽힙니다.

audit은 구조도 봅니다. 가운데 정렬 hero, 같은 폭의 기능 카드 3개, CTA, footer로 이어지는 AI 기본형에 비대칭이나 의외의 요소가 없다면, 시각 처리가 괜찮더라도 critical 구조 항목으로 올리라고 적혀 있습니다. 앞의 보험 비교 상담 예제의 첫 결과물은 색을 바꾼 두 번째 결과물까지 포함해 여기에 걸립니다.

audit에는 stamp와 실제 페이지가 맞는지 보는 검사가 있습니다. stamp는 Bento Grid라고 적혀 있는데 페이지가 가운데 정렬 hero라면 "stamp lies"라는 critical 항목이 됩니다. audit.md는 이 검사가 이전 실행이 붙인 stamp와 달리 나중의 수정이 페이지를 AI 기본형으로 되돌린 drift를 잡기 위한 것이라고 설명합니다. 기록이 거짓이 되는 경우까지 검사 대상으로 삼았다는 점은 눈여겨볼 만합니다.

genre도 audit에 반영됩니다. stamp에 genre가 적혀 있으면 그 genre의 예외를 적용해 채점합니다. 방사형 gradient 배경은 editorial에서는 critical이지만 atmospheric에서는 허용됩니다.

### 실패 모드: 기록을 쓰는 쪽과 읽는 쪽이 같다

stamp와 log는 모델이 쓰고 모델이 읽습니다. 모델이 stamp를 빠뜨리면 21번 게이트가 걸려야 하지만, 그 게이트에 답하는 것도 같은 모델입니다. log.json의 trim 규칙(최근 20개)을 지키는 것도 모델입니다. 기록의 형식을 검사하는 코드가 없으므로, 형식이 깨진 log가 다음 실행에서 어떻게 읽힐지는 모델에 달려 있습니다.

## 4. 한계: 채점자가 곧 작성자다

### 지시문으로만 존재하는 검사

이 시점의 Hallmark에서 가장 따져 볼 부분은 검사를 누가 실행하느냐입니다.

skill은 Markdown 지시문입니다. 60개가 넘는 질문에 답하는 것도, 자기 비평 점수를 매기는 것도 페이지를 만든 그 모델입니다. 가로 스크롤 게이트는 렌더된 페이지를 열어 dev tools의 폭 조절로 320px에서 1920px까지 끌어 보라고 적고 있지만, 그 확인을 대신 해 주는 도구는 skill에 들어 있지 않습니다.

저장소도 이 간극을 알고 있습니다. ROADMAP의 Later 항목에는 파일을 감시하고 sandbox에서 렌더한 뒤 screenshot을 slop test의 자기 비평에 되먹이는 MCP 서버 구상이 있고, 생성과 audit 사이의 루프를 닫는다고 설명합니다. [\[Hallmark: ROADMAP.md\]](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/ROADMAP.md)

### 산문 검사의 drift

산문으로만 존재하는 검사의 약점은 저장소 안에서도 보입니다. 같은 commit에서 README는 게이트를 65개라고 하고, slop-test.md의 제목은 60개라고 하며, 본문의 번호와 SKILL.md의 7단계는 69개입니다. SKILL.md의 "모든 verb에 적용되는 규율"은 네 가지라고 소개한 뒤 다섯 항목을 나열합니다.

commit 기록을 보면 이 차이가 어떻게 생겼는지 짐작할 수 있습니다. 66번부터 69번 게이트는 2026년 5월 18일에 추가됐는데, 각각 구체적인 결함 수정과 함께 들어왔습니다. 대문자 display 제목의 줄 간격이 1.0 미만이라 줄이 꺾일 때 글자가 겹치는 문제는 Manifesto와 Sport theme의 수정 commit과 함께 67번이 되었고, sticky section 제목이 sticky nav 위로 번지는 문제는 Almanac theme의 수정 commit과 함께 68번이 되었습니다. [\[Hallmark: commit a2cd497\]](https://github.com/Nutlope/hallmark/commit/a2cd497977) [\[Hallmark: commit b41a3e6\]](https://github.com/Nutlope/hallmark/commit/b41a3e60e2)

결함을 고칠 때마다 같은 결함을 잡는 질문을 추가하는 것은 소프트웨어의 회귀 테스트와 같은 습관입니다. 좋은 습관이라고 봅니다. 다만 새 게이트는 파일 끝의 모바일 반응형 묶음 뒤에 붙었고, 제목의 숫자와 README의 숫자는 따라오지 않았습니다. 테스트가 코드라면 개수는 실행기가 세어 주지만, 테스트가 문장이면 개수도 사람이 고쳐야 합니다.

### 게이트를 두 부류로 나눈다

제 생각은 이렇습니다. 게이트를 집행 수단에 따라 나눠야 합니다.

| 부류 | 게이트 예 | 맞는 집행 수단 |
| --- | --- | --- |
| 소스만 보면 판정 가능 | 1번 기본 폰트, 11번 `transition: all`, 58번 token 밖의 값, 62번 `overflow-x: clip` | lint 스크립트, CI |
| 렌더해야 판정 가능 | 36번 가로 스크롤, 46~47번 대비, 59번 두 줄 버튼 | headless 브라우저 검사 |
| 판단이 필요 | 9번 직전과 같은 구조, 55번 목적 없는 장식, 56번 지어낸 수치 | 작성자와 분리된 reviewer, 사람 |

첫째 부류는 생각보다 많습니다. 금지 폰트 이름, 특정 CSS 속성, 색상값이 token을 거치는지, root에 특정 속성이 있는지는 정규식이나 CSS parser로 판정할 수 있습니다. 이 게이트들을 스크립트로 옮기면 모델은 그 질문에 답할 필요가 없어지고, 게이트 개수도 실행기가 셉니다.

```python
# 예시: 소스만 보고 판정할 수 있는 게이트 일부를 스크립트로
import re

BANNED_DISPLAY = re.compile(r"font-family:\s*['\"]?(Inter|Roboto|Open Sans|Poppins|Lato)\b", re.I)

def check_css(css: str) -> list[str]:
    fails = []
    if BANNED_DISPLAY.search(css):
        fails.append("gate 1: 기본 폰트")
    if re.search(r"transition:\s*all\b|transition-all", css):
        fails.append("gate 11: transition all")
    if not re.search(r"html[^{]*\{[^}]*overflow-x:\s*clip", css):
        fails.append("gate 62: html에 overflow-x: clip 없음")
    if not css.lstrip().startswith("/* Hallmark · macrostructure:"):
        fails.append("gate 21: stamp 없음")
    return fails
```

위 코드는 생각을 보이기 위한 예시입니다. 1번 게이트는 display 폰트에 대한 질문이므로 실제로는 display 용도의 token만 검사해야 하는 식의 세부가 더 필요합니다.

둘째 부류는 ROADMAP이 말한 렌더 루프가 맡을 일입니다. 셋째 부류는 끝까지 모델이나 사람의 판단으로 남습니다. 저는 56번 지어낸 수치만큼은 작성자와 분리된 호출이나 사람이 보게 하는 편이 맞다고 봅니다. 페이지의 숫자마다 출처를 brief에서 찾을 수 있는지 묻는 것은 작성자에게 맡기기에는 이해 충돌이 큰 질문입니다.

자기 비평 점수는 수정을 유도하는 장치로는 쓸모가 있습니다. 하지만 품질의 증거로 삼기는 어렵다고 봅니다.

### 언제 이 skill을 쓰지 말아야 하나

skill이 스스로 밝힌 범위도 있습니다. 출력 계약 문서는 Hallmark가 취향 skill이고, 제품 문구를 지어내지 않으며(주어지지 않았으면 묻는다), 브랜드 정체성을 대신 정하지 않고(주어진 것을 따른다), 상태 관리나 데이터 조회 같은 로직은 만들지 않는다고 적습니다. 인증 흐름이나 결제 연동처럼 취향 밖의 요청이 오면 일은 하되, Hallmark는 화면에 드러나는 표면에만 적용하라고 합니다. [\[Hallmark: contract.md\]](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/references/contract.md)

이 범위를 기준으로 저는 다음 경우에는 이 skill을 그대로 쓰지 않는 편을 권합니다.

- 이미 디자인 시스템이 확정된 조직의 화면. 다양화 규칙과 매번 묻는 규칙이 시스템을 지키려는 목적과 부딪힙니다. `design.md`로 시스템을 잠그는 경로가 있지만, 기존 디자인 시스템을 그 형식으로 옮기는 일이 먼저입니다.
- 문구가 심의를 거쳐야 하는 페이지. skill은 문구를 지어내지 않는다고 하지만, 그것을 확인하는 것도 같은 모델입니다. 문구는 사람이 넣고 skill은 배치만 맡게 하는 편이 안전합니다.
- 화면보다 로직이 중심인 작업. 업무 시스템의 입력 화면처럼 상태와 검증이 대부분인 화면이라면, 69개의 질문 가운데 상당수가 적용되지 않습니다.

:::tip
금융이나 보험의 화면 표준, 접근성 기준, 광고 문구 심의 규정도 대부분 산문으로 쓰여 있습니다. 이를 번호가 붙은 예/아니오 질문으로 옮기면, 에이전트의 출력뿐 아니라 예외 승인도 "몇 번 항목을 어떤 사유로 면제했다"는 단위로 기록할 수 있다고 생각합니다. 지어낸 수치를 금지하는 게이트는 특히 그대로 가져다 쓸 만합니다. 다만 Hallmark에서 본 drift를 피하려면, 질문 목록의 원본을 하나로 두고 개수와 번호를 스크립트가 관리하게 하는 편이 좋습니다.
:::

## 5. 오늘 바로 적용할 수 있는 순서

README의 설치 명령은 다음과 같습니다. 같은 README는 `SKILL.md`와 `references/`를 Claude Code, Cursor, Codex의 skill 위치에 직접 복사하는 방법도 안내합니다.

```bash
npx skills add nutlope/hallmark
```

README가 소개하는 호출 방식은 네 가지입니다.

| 호출 | 하는 일 |
| --- | --- |
| 기본 (동사 없음) | 새 UI를 만듭니다. macrostructure를 고르고 규칙을 적용한 뒤 slop test를 실행합니다 |
| `hallmark audit <target>` | 기존 코드를 anti-pattern 목록으로 채점합니다. 수정하지 않습니다 |
| `hallmark redesign <target>` | 문구와 정보 구조와 브랜드는 두고 구조를 다시 짭니다 |
| `hallmark study` + screenshot 또는 URL | 참고 디자인에서 구조, 서체 조합, 기준 색을 추출합니다. 픽셀 복제와 유료 template은 거부합니다 |

1. 설치한 뒤 기존 페이지에 `hallmark audit <target>`을 먼저 실행해 봅니다. 코드를 바꾸지 않으므로 부담이 없고, 심각도별 개수로 현재 상태를 잴 수 있습니다.
2. `references/slop-test.md`를 읽고, 자기 팀에 맞지 않는 게이트와 빠진 게이트를 표시합니다. genre 예외가 팀의 브랜드 기준과 맞는지도 봅니다.
3. 팀의 디자인 기준 가운데 형용사로 적힌 문장을 다섯 개만 골라 예/아니오 질문으로 고쳐 쓰고 번호를 붙입니다.
4. 그 질문들 가운데 소스만 보고 판정할 수 있는 것은 스크립트로 옮겨 CI에 넣고, 렌더가 필요한 것과 판단이 필요한 것은 따로 표시해 둡니다.
5. 결과물에 무엇을 골랐는지 남기는 stamp를 붙이고, 다음 실행과 audit이 그것을 읽게 합니다.

## 마치며

Hallmark는 디자인 도구지만, 다루는 문제는 일반적입니다. 말로 설명하기 어려운 기준을 에이전트가 따르게 하려면 어떻게 적어야 하는가입니다.

이 저장소의 답은 금지 목록, 번호가 붙은 질문, 코드 이전의 질문과 구조 선택, 산출물에 남기는 기록입니다.

그 질문에 누가 답하는지는 아직 열려 있습니다. 기준을 적는 일과 기준을 집행하는 일을 따로 설계해야 한다는 점을 함께 가져가시길 권합니다.

## 참고 자료

- [Hallmark README (2026-05-26 기준)](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/README.md)
- [skills/hallmark/SKILL.md](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/SKILL.md)
- [references/slop-test.md](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/references/slop-test.md)
- [references/verbs/audit.md](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/references/verbs/audit.md)
- [references/anti-patterns.md](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/references/anti-patterns.md)
- [references/contract.md](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/skills/hallmark/references/contract.md)
- [ROADMAP.md](https://github.com/Nutlope/hallmark/blob/39fe438bf930b040c7a60350d18a0e3b54a24a5a/ROADMAP.md)
- [Commit a2cd497: Manifesto와 Sport의 줄 간격 수정, 67번 게이트 추가](https://github.com/Nutlope/hallmark/commit/a2cd497977)
- [Commit b41a3e6: Almanac sticky 제목 수정, 68번 게이트 추가](https://github.com/Nutlope/hallmark/commit/b41a3e60e2)
- [Hallmark initial commit](https://github.com/Nutlope/hallmark/commit/c49b190911)
