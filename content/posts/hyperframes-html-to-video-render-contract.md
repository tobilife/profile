---
title: "HyperFrames: 에이전트가 HTML로 영상을 쓰게 하고, 렌더 계약으로 결과를 고정한다"
date: 2026-04-30
description: "HeyGen의 HyperFrames를 하네스 설계로 읽고, seek 기반 렌더 계약과 이를 집행하는 lint, inspect, skill을 봅니다."
category: 저장소 소개
tags: [오픈소스, 영상 생성, 하네스, Agent Skills, 코딩 에이전트]
draft: false
---

:::note
- HyperFrames는 HTML과 data 속성으로 영상을 정의하고 headless Chrome과 FFmpeg로 MP4를 만드는 오픈소스 프레임워크입니다.
- 렌더는 재생을 녹화하지 않고 프레임마다 시간을 계산해 seek한 뒤 캡처합니다. 그래서 시계, seed 없는 난수, 렌더 중 네트워크, 무한 반복을 금지하는 계약이 생깁니다.
- 계약의 상당 부분은 lint 규칙으로 집행되고, inspect는 렌더된 화면의 넘침을 에이전트가 읽을 수 있는 JSON으로 돌려줍니다. skill은 그 순서와 완료 조건을 가르칩니다.
- Remotion과의 비교는 프로젝트가 스스로 내놓은 주장이며, 분산 렌더링은 Remotion이 앞선다고 문서가 직접 적고 있습니다.
:::

"에이전트는 HTML을 잘 쓰니까 영상도 HTML로 시키면 된다"는 생각은 절반만 맞습니다.

브라우저에서 재생되는 애니메이션과, 프레임 단위로 캡처해서 인코딩하는 영상은 실행 방식이 다릅니다. 브라우저에서 그럴듯해 보인 결과가 렌더에서는 깨질 수 있습니다.

**에이전트에게 영상을 맡길 때 필요한 것은 더 긴 프롬프트가 아니라, 같은 입력이 같은 프레임을 내도록 강제하는 계약과 그 위반을 렌더 전에 알려 주는 피드백 루프입니다.**

HeyGen이 공개한 HyperFrames는 이 두 가지를 프레임워크와 CLI에 넣었습니다. 저장소의 첫 commit은 2026년 3월 10일, 첫 릴리스 v0.1.2는 3월 25일입니다. [\[HyperFrames: initial commit\]](https://github.com/heygen-com/hyperframes/commit/c60a24628334ded313190b0af0bdfbc98ef41b81) [\[HyperFrames: v0.1.2\]](https://github.com/heygen-com/hyperframes/releases/tag/v0.1.2) README는 이 프레임워크를 HTML 기반, AI 우선, 결정적 렌더링, frame adapter 패턴이라는 네 가지로 소개하고, CLI가 기본적으로 비대화형이라 에이전트 주도의 workflow에 맞춰져 있다고 설명합니다. [\[HyperFrames: README\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/README.md)

이 글은 2026년 4월 28일 시점의 저장소(commit `be1fcfc`)를 기준으로 씁니다. 예제 하나를 끝까지 따라갑니다. 코딩 에이전트에게 보험 앱의 새 기능을 알리는 10초짜리 소개 영상을 맡기는 경우입니다.

## 먼저, 이런 상황부터 봅시다

예를 들어 코딩 에이전트에게 HTML과 GSAP으로 보험 앱 신기능 소개 영상 10초를 만들게 했다고 해봅시다. 배경에는 떠다니는 입자가 있고, 가운데에는 "사고 접수부터 보험금 청구까지 앱에서 한 번에"라는 문구가 말풍선 안에 들어갑니다.

에이전트가 만든 페이지를 브라우저에서 열면 잘 움직입니다. 에이전트는 "완성했습니다"라고 보고합니다.

MP4로 뽑아 보면 사정이 다릅니다. 배경 입자의 위치가 렌더할 때마다 달라집니다. 무한 반복으로 만든 배경 애니메이션에서 캡처가 꼬입니다. 긴 문구가 말풍선 밖으로 넘칩니다. 폰트 로딩을 기다리느라 timeline을 비동기로 만든 탓에 첫 프레임이 비어 있습니다.

시스템 설계로 보면 원인은 둘입니다.

- 실시간 재생과 프레임별 캡처의 차이를 규칙으로 고정하지 않았습니다. `Math.random()`이나 무한 반복은 브라우저에서는 문제가 아니지만 캡처에서는 문제입니다.
- 위반을 알려 주는 검사가 없었습니다. 에이전트가 쓸 수 있는 완료 기준이 "브라우저에서 보인다"뿐이었습니다.

아래 네 절은 HyperFrames가 이 두 원인을 어떻게 다루는지를 봅니다. 렌더 방식이 계약을 만들고, lint와 inspect가 계약을 집행하고, skill이 순서를 가르치는 구조입니다.

## 1. 렌더 계약: 프레임은 재생이 아니라 seek로 만든다

### 렌더 loop가 하는 일

HyperFrames의 렌더링은 재생을 녹화하는 방식이 아닙니다. 문서에 따르면 렌더 pipeline은 프레임 단위이고 seek로 움직이며, 실시간 재생은 개입하지 않습니다. 단계는 넷입니다. [\[HyperFrames: Deterministic Rendering\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/docs/concepts/determinism.mdx)

```text
frame 번호 -> time = floor(frame) / fps          (정수 연산, 실제 시계와 무관)
           -> adapter.seekFrame(frame)            (모든 GSAP timeline을 멈추고 그 시점으로 이동)
           -> Chrome이 그 프레임 1장 캡처          (HeadlessExperimental.beginFrame)
           -> FFmpeg 인코딩, audio 섞기 -> MP4
```

engine은 프레임마다 시간을 정수 연산으로 계산합니다. frame adapter는 `seekFrame(frame)` 호출을 받아 애니메이션, DOM 상태, canvas 내용을 정확히 그 프레임으로 맞추고, 캡처는 Chrome의 `HeadlessExperimental.beginFrame` API로 한 번에 원자적으로 이뤄집니다.

이 방식이 성립하려면 페이지가 어느 시점으로 건너뛰어도 같은 모습이어야 합니다. 문서는 결정성의 조건을 다섯 가지로 적습니다. 실제 시계에 기대지 않을 것, seed 없는 난수를 쓰지 않을 것, 렌더 중 네트워크 요청을 하지 않을 것, fps와 크기를 첫 프레임 전에 고정할 것, 길이가 유한할 것입니다.

### adapter 계약: 어느 순서로 불러도 같은 결과

애니메이션 runtime을 꽂는 자리가 frame adapter입니다. 문서는 adapter가 답해야 할 질문을 하나로 줄입니다. 프레임 N에서 화면은 어떻게 보여야 하는가입니다. [\[HyperFrames: Frame Adapters\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/docs/concepts/frame-adapters.mdx)

host는 `init`, `getDurationFrames`, `seekFrame`을 프레임 수만큼, `destroy`의 순서로 adapter를 부르고, adapter는 자기 시계를 갖지 않고 seek 명령에만 응답합니다. 요구 사항은 이렇습니다.

- `getDurationFrames()`는 0 이상의 유한한 정수를 돌려줍니다.
- `seekFrame(frame)`은 앞으로, 뒤로, 무작위 순서로 불려도 동작해야 합니다.
- 같은 프레임에 대해 `seekFrame`은 멱등이어야 합니다.
- 프레임이 확정된 뒤에 끝나는 비동기 작업이 없어야 합니다.

문서는 이 Adapter API가 아직 v0 실험 단계이고 v1 전까지 메서드 시그니처는 바뀔 수 있지만, seek 기반의 결정적 출력이라는 핵심 계약은 안정적이라고 밝힙니다.

하네스 관점에서 저는 "무작위 순서로 불려도 같은 결과"라는 요구가 가장 중요하다고 봅니다. 이 요구가 지켜지면 렌더를 여러 worker로 나누거나, 특정 프레임만 다시 확인하는 일이 안전해집니다. 뒤에서 볼 inspect가 timeline의 몇 지점만 골라 검사할 수 있는 것도 같은 성질 덕분입니다.

### 작성자가 지켜야 할 규칙

이 렌더 방식에서 작성자가 지켜야 할 규칙이 나옵니다. 문서와 skill에서 뽑으면 다음과 같습니다. [\[HyperFrames: hyperframes skill\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/skills/hyperframes/SKILL.md)

| 계약 항목 | 요구 또는 금지 | 이유 |
| --- | --- | --- |
| 시간 | `Date.now()`와 시간 기반 로직 금지 | 렌더는 실제 시간과 무관하게 진행 |
| 난수 | `Math.random()` 금지, 필요하면 seed가 있는 PRNG | 실행마다 같은 프레임 |
| 네트워크 | 렌더 중 fetch 금지, 에셋은 미리 load | 캡처 시점의 상태 고정 |
| 길이 | `repeat: -1` 금지, 길이는 `data-duration`으로 | 유한한 길이가 있어야 캡처 가능 |
| timeline | `paused: true`로 만들고 `window.__timelines`에 등록 | 재생 제어권은 프레임워크에 |
| 구성 시점 | timeline을 `async`나 `setTimeout` 안에서 만들지 않음 | 엔진이 page load 직후 동기적으로 읽음 |
| 애니메이션 대상 | opacity, transform, color 같은 시각 속성만 | `display`나 미디어 재생 제어는 프레임워크 몫 |

skill은 마지막 항목에 이유를 하나 더 붙입니다. 폰트는 compiler가 넣어 주므로 처음부터 쓸 수 있고, 폰트 로딩을 기다릴 필요가 없다는 것입니다. 앞의 예에서 첫 프레임이 비었던 원인이 바로 이 기다림이었습니다.

영상 자체는 data 속성이 붙은 HTML입니다. 아래는 README의 예제를 줄여 옮긴 것입니다.

```text
<div id="stage" data-composition-id="intro" data-start="0"
     data-width="1920" data-height="1080">
  <video id="clip-1" data-start="0" data-duration="5"
         data-track-index="0" src="intro.mp4" muted playsinline></video>
  <img id="overlay" class="clip" data-start="2" data-duration="3"
       data-track-index="1" src="logo.png" />
</div>
```

앞의 사례에서 문제였던 네 가지 가운데 세 가지가 이 표에 그대로 있습니다. 규칙을 모르는 에이전트가 흔히 하는 실수를 금지 목록으로 먼저 적어 둔 셈입니다.

### 예제에 적용하면: 무엇을 어떻게 고치는가

보험 앱 예제의 script를 계약에 맞게 고치면 아래처럼 됩니다. 계약의 내용을 보이기 위한 예시이고, 저장소의 코드가 아닙니다.

```ts
// 예시: 계약에 맞춘 timeline 구성 (index.html의 script)
function mulberry32(seed) {               // seed가 있는 PRNG
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);              // Math.random() 대신
const tl = gsap.timeline({ paused: true });   // 재생은 프레임워크가 쥔다
document.querySelectorAll(".particle").forEach((el) => {
  tl.to(el, { y: -40 - rand() * 60, duration: 2, repeat: 4, yoyo: true }, rand());
});                                       // repeat: -1 대신 10초에 맞춘 유한 반복
tl.from("#bubble", { opacity: 0, y: 30, duration: 0.6 }, 0.5);
window.__timelines = window.__timelines || {};
window.__timelines["intro"] = tl;         // async 없이 load 직후 동기적으로 등록
```

달라진 점은 넷입니다. 입자의 위치는 seed가 같으면 매번 같습니다. 배경 반복은 영상 길이 안에서 끝납니다. timeline은 멈춘 상태로 만들어지고 composition id로 등록됩니다. 폰트를 기다리는 비동기 코드가 사라졌습니다.

이 네 가지는 모두 "브라우저에서 보이는가"로는 구분되지 않는 차이입니다. 고치기 전 코드도 브라우저에서는 잘 움직였습니다. 차이는 렌더러가 프레임 37을 먼저 그리고 프레임 12를 나중에 그려도 같은 결과가 나오느냐에 있습니다.

### 실패 모드: 결정성이 깨지는 자리와 환경 차이

계약을 지켜도 결정성이 깨지는 자리가 둘 있습니다.

첫째는 캡처 방식입니다. Remotion 비교 문서에 따르면 HyperFrames에는 두 가지 캡처 mode가 있습니다. Linux와 `chrome-headless-shell`에서 쓰는 BeginFrame mode는 Chrome의 compositor를 원자적으로 구동해 머신이 달라도 바이트 단위로 같은 프레임을 냅니다. macOS와 Windows, 그리고 자동 fallback에서 쓰는 screenshot mode는 Chrome을 실시간으로 돌리며 일반 screenshot을 찍습니다. renderer는 compile 시점에 composition을 살펴보고, inline `<iframe>`이나 frame adapter 밖의 `requestAnimationFrame` loop처럼 BeginFrame이 다룰 수 없는 요소가 있으면 screenshot mode로 내려가며, 그 이유를 진단 메시지로 알려 준다고 합니다. [\[HyperFrames: Hyperframes vs Remotion\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/docs/guides/hyperframes-vs-remotion.mdx)

같은 문서는 GSAP timeline, Web Animations API adapter를 거치는 CSS `@keyframes`, Lottie, Three.js, Web Animations API가 BeginFrame mode에서 결정적으로 렌더되고, 날것의 canvas loop와 실시간 웹 embed는 자동으로 screenshot mode가 된다고 정리합니다.

| composition에 든 요소 | 캡처 mode | 작성자가 할 일 |
| --- | --- | --- |
| GSAP, CSS keyframes, Lottie, Three.js | BeginFrame (Linux) | 계약만 지키면 됨 |
| adapter 밖의 `requestAnimationFrame` loop | screenshot으로 fallback | adapter로 감싸거나 제거 |
| inline `<iframe>`, 실시간 웹 embed | screenshot으로 fallback | 정적 에셋으로 바꾸는 것을 검토 |

보험 앱 예제에서 화면 녹화 대신 앱 화면을 iframe으로 띄웠다면, 그 composition 전체가 screenshot mode로 내려갑니다. 진단 메시지를 무시하지 말고 캡처 이미지로 바꾸는 편이 재현성 면에서 낫다고 봅니다.

둘째는 환경입니다. 결정성 문서는 Docker 없이 로컬에서 렌더하면 플랫폼별 폰트 렌더링과 Chrome 버전 때문에 조금 다를 수 있고, 정확한 재현이 필요하면 Docker를 쓰라고 안내합니다. Docker mode는 정해진 Chrome 버전, 폰트 묶음, FFmpeg 버전을 씁니다.

렌더링 가이드는 상황별 권장 mode를 표로 정리해 두었는데, 로컬 개발과 빠른 미리보기 export는 local, CI/CD와 팀 공유와 AI 에이전트 주도 렌더링은 Docker를 권합니다. Docker mode에는 컨테이너 시작이 느리고 컨테이너 안에서 GPU 가속을 쓸 수 없다는 비용이 있다고 같은 가이드가 적고 있습니다. [\[HyperFrames: Rendering\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/docs/guides/rendering.mdx)

보험 앱 예제를 macOS 노트북에서 렌더했다면 screenshot mode입니다. 같은 HTML을 CI의 Linux Docker에서 다시 렌더하면 BeginFrame mode로 돌아가고, 폰트 렌더링이 미세하게 달라질 수 있습니다. 심의를 받은 영상과 배포한 영상이 같아야 하는 일이라면 렌더 환경을 처음부터 Docker 하나로 고정하는 편이 맞다고 봅니다.

## 2. Lint, inspect, preview: 렌더 전에 실패를 돌려주는 세 겹의 루프

계약은 적어 두는 것만으로는 지켜지지 않습니다. HyperFrames의 CLI skill은 작업 순서를 이렇게 정합니다. [\[HyperFrames: hyperframes-cli skill\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/skills/hyperframes-cli/SKILL.md)

```text
init -> HTML 작성 -> lint -> inspect -> preview -> render
                      ^        ^
                      |        +-- 화면 밖으로 넘친 글자, 잘린 글자
                      +----------- 계약 위반 (id 누락, track 겹침, 미등록 timeline)
```

### lint: 계약을 규칙 코드로 옮긴다

`lint`는 소스를 읽습니다. `index.html`과 `compositions/` 아래 파일을 검사하고, 발견 사항을 error, warning, info로 나눕니다. CLI 문서는 error를 렌더 전에 반드시 고칠 것, warning을 예상치 못한 동작을 낳을 수 있는 것으로 정의하고, info는 `--verbose`일 때만 보여 준다고 설명합니다. info를 기본으로 숨기는 이유도 에이전트와 CI의 출력을 깔끔하게 유지하기 위해서라고 적혀 있습니다. [\[HyperFrames: CLI\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/docs/packages/cli.mdx)

계약 항목이 실제로 규칙으로 집행되는지는 `packages/core`의 lint 규칙에서 확인할 수 있습니다. 같은 commit에서 몇 가지를 옮기면 다음과 같습니다.

| 규칙 코드 | 심각도 | 잡는 것 | 대응하는 계약 |
| --- | --- | --- | --- |
| `non_deterministic_code` | error | `Math.random()`, `Date.now()`, `new Date()`, `performance.now()`, `crypto.getRandomValues()` | 시간, 난수 |
| `gsap_infinite_repeat` | error | `repeat: -1` | 길이 |
| `missing_timeline_registry` | error | `window.__timelines` 등록 누락 | timeline |
| `root_missing_composition_id` | error | 최상위 컨테이너의 `data-composition-id` 누락 | 구조 |

`non_deterministic_code` 규칙은 주석을 걷어 낸 뒤 script 본문에서 위 다섯 패턴을 찾고, 수정 힌트로 seed가 있는 PRNG나 GSAP timeline 위치를 쓰라고 안내합니다. [\[HyperFrames: lint rules core.ts\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/packages/core/src/lint/rules/core.ts) `gsap_infinite_repeat`도 error이고, 수정 힌트로 전체 길이를 한 주기 길이로 나눈 유한한 반복 횟수를 제시합니다. [\[HyperFrames: lint rules gsap.ts\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/packages/core/src/lint/rules/gsap.ts)

보험 앱 예제의 배경 입자는 `non_deterministic_code`에, 무한 반복 배경은 `gsap_infinite_repeat`에 걸립니다. 둘 다 error이므로 렌더 전에 고쳐야 합니다.

`--json` 출력에는 error, warning, info의 개수와 발견 사항 배열이 함께 들어갑니다. 하네스는 개수만 보고 통과 여부를 판정하고, 배열은 에이전트에게 넘길 수정 목록으로 쓰면 됩니다. 판정과 수정 지시를 같은 출력에서 꺼낼 수 있으니, 검사 결과를 사람이 읽는 문장으로 다시 요약할 필요가 없습니다. 요약 과정에서 규칙 코드나 위치 정보가 빠지는 일도 막을 수 있습니다.

### inspect: 실제로 그려 보고 넘침을 잰다

`inspect`는 소스가 아니라 화면을 봅니다. 프로젝트를 묶어 로컬에서 띄우고, headless Chrome에서 composition을 seek하며, 글자나 요소가 의도한 상자를 벗어나는지를 보고합니다. CLI 문서는 이 명령이 에이전트 workflow를 위해 설계됐다고 밝히고, 발견 사항마다 schema 버전, 시각 또는 접힌 시간 범위, selector, 가장 가까운 컨테이너의 selector, 측정한 bounding box, 넘친 방향, 수정 힌트가 들어간다고 설명합니다. [\[HyperFrames: CLI\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/docs/packages/cli.mdx)

| 옵션 | 기본값 | 하네스에서의 쓰임 |
| --- | --- | --- |
| `--json` | 꺼짐 | 에이전트가 읽는 출력 |
| `--samples` | 9 | 길이 전체에 걸친 검사 지점 수 |
| `--at` | 없음 | 특정 시각(가장 중요한 장면)만 검사 |
| `--tolerance` | 2px | 이 이하의 넘침은 보고하지 않음 |
| `--collapse-static` | 켜짐 | 반복되는 정적 문제를 하나로 접음 |
| `--max-issues` | 80 | 출력하는 발견 사항의 상한 |
| `--strict` | 꺼짐 | warning에서도 0이 아닌 종료 코드 |

하네스를 만드는 입장에서 눈에 띄는 것은 출력의 모양입니다. 반복되는 정적 문제를 기본으로 접는 이유를 CLI skill은 JSON 출력이 LLM의 context window에 맞게 작게 유지되도록 하기 위해서라고 적습니다. 발견 사항 상한과 허용 오차도 같은 목적입니다. 검사 도구의 출력이 에이전트의 입력이 된다는 전제로 설계한 것입니다.

보험 앱 예제의 말풍선 넘침은 여기서 걸립니다. CLI 문서의 출력 예시는 `text_box_overflow` 한 줄과 함께 글자 상자와 컨테이너의 크기, 넘친 픽셀 수, 그리고 컨테이너를 넓히거나 `max-width`로 줄바꿈을 허용하라는 수정 힌트를 보여 줍니다. 에이전트는 이 힌트를 읽고 바로 고칠 수 있습니다.

예외를 다루는 방식도 볼 만합니다. 등장 애니메이션 때문에 의도적으로 화면 밖에 둔 요소는 `data-layout-allow-overflow`를 붙여 검사에서 빼고, 장식 요소는 `data-layout-ignore`로 아예 빼라고 안내합니다. 예외가 소스에 남으므로 누가 무엇을 면제했는지 나중에 볼 수 있습니다.

### validate와 preview: 대비와 사람의 눈

hyperframes skill은 `validate`도 완료 조건에 넣습니다. `validate`는 기본으로 WCAG 대비 검사를 하는데, skill에 따르면 5개 시각으로 seek해 screenshot을 찍고, 글자마다 뒤 배경 픽셀을 샘플링해 대비를 계산하고, 미달하면 warning으로 보고합니다. 어두운 배경에서는 색을 밝히되 팔레트 계열 안에서 고치라는 지침도 함께 있습니다. [\[HyperFrames: hyperframes skill\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/skills/hyperframes/SKILL.md)

`preview`는 사람이 봅니다. 브라우저에서 studio를 열고 파일이 바뀌면 다시 불러옵니다. CLI skill은 에이전트가 작업을 사람에게 넘길 때 소스 파일인 `index.html`의 경로가 아니라 studio의 프로젝트 URL을 알려 주라고 지시합니다. 사람이 확인해야 할 대상을 소스가 아니라 렌더와 같은 runtime으로 보여 주라는 뜻으로 읽힙니다. preview와 render의 관계도 문서가 분명히 해 둡니다. 둘은 같은 runtime을 쓰므로 프레임의 모습은 같아야 하지만 성능은 다릅니다. preview에서 끊겨 보여도 render는 프레임을 하나씩 만들기 때문에 프레임을 놓치지 않습니다. [\[HyperFrames: Deterministic Rendering\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/docs/concepts/determinism.mdx)

### 하네스에서 묶으면: 검사 결과를 다음 turn의 입력으로

이 명령들을 에이전트 하네스에 넣을 때 저는 다음 형태를 권합니다. 저장소가 제공하는 스크립트가 아니라, CLI 출력을 어떻게 쓸지 보여 주는 예시입니다.

```python
# 예시: lint와 inspect의 JSON을 에이전트에게 되먹이는 loop
MAX_ROUNDS = 3
for round in range(MAX_ROUNDS):
    lint = run_json("npx hyperframes lint --json")
    errors = [f for f in lint["findings"] if f["severity"] == "error"]
    if errors:
        agent.fix(errors)                  # error만 넘기고 warning은 모아 둔다
        continue
    layout = run_json("npx hyperframes inspect --json")
    if layout_errors(layout):
        agent.fix(layout_errors(layout))
        continue
    break
else:
    escalate_to_human(lint, layout)        # 3 round 안에 못 고치면 사람에게
render("npx hyperframes render --strict --docker")
```

이 형태에서 중요한 점은 세 가지라고 봅니다.

첫째, 에이전트에게는 error만 넘깁니다. warning까지 한꺼번에 넘기면 에이전트가 사소한 것부터 고치느라 round를 쓰고, context도 빨리 찹니다. CLI가 info를 기본으로 숨기는 것과 같은 판단입니다.

둘째, round에 상한을 둡니다. 말풍선 폭을 넓히면 다른 요소와 겹치고, 그걸 고치면 다시 넘치는 식으로 진동할 수 있기 때문입니다. 상한에 닿으면 렌더하지 않고 사람에게 넘깁니다.

셋째, 렌더 명령은 loop 밖에 고정합니다. `--strict`와 `--docker`를 에이전트가 고르게 두지 않고 하네스가 붙입니다. 에이전트가 검사를 건너뛰고 렌더를 불러도, 계약 위반이 있으면 렌더가 실패합니다.

### 마지막 관문과 실패 모드

마지막 관문은 render의 옵션입니다. `--strict`는 lint error가 있으면 실패하고 `--strict-all`은 warning에서도 실패합니다. [\[HyperFrames: hyperframes-cli skill\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/skills/hyperframes-cli/SKILL.md)

이 루프에도 빈틈은 있습니다.

- lint는 패턴을 찾습니다. 난수 생성을 다른 이름의 함수로 감싸 두면 문자열 패턴으로는 잡히지 않을 수 있습니다. 그래서 lint를 통과했다는 것은 알려진 패턴이 없다는 뜻이지 결정적이라는 증명은 아닙니다.
- inspect는 표본을 봅니다. 기본 9개 지점 사이에서 잠깐 넘쳤다 돌아오는 글자는 놓칠 수 있습니다. 짧은 전환이 많은 영상이라면 `--samples`를 늘리거나 `--at`으로 전환 시각을 직접 지정하는 편이 맞습니다.
- 둘 다 내용은 보지 않습니다. 보험 앱 예제에서 "한 번에"라는 문구가 실제 기능과 맞는지는 어떤 검사도 판단하지 않습니다.

## 3. Skill: 문서가 아니라 작업 순서와 금지 목록을 가르친다

### 어떤 skill이 있고 어떻게 설치되는가

README는 skill을 일반 문서가 다루지 않는 프레임워크 고유의 패턴을 에이전트에게 가르치는 수단이라고 소개합니다. 표에는 `hyperframes`, `hyperframes-cli`, `hyperframes-registry`, `website-to-hyperframes`, `remotion-to-hyperframes`, `gsap`가 올라 있고, `npx skills add heygen-com/hyperframes`로 설치하거나 `hyperframes init`이 프로젝트를 만들면서 함께 설치합니다. Claude Code에서는 skill이 slash command로 등록되고, Codex와 Cursor용 plugin 묶음도 함께 제공된다고 적혀 있습니다. [\[HyperFrames: README\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/README.md)

### 순서와 관문이 API 설명보다 많다

`hyperframes` skill을 읽어 보면 API 설명보다 순서와 관문이 많습니다. [\[HyperFrames: hyperframes skill\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/skills/hyperframes/SKILL.md)

- Visual Identity Gate: HTML을 쓰기 전에 색과 폰트가 정의되어 있어야 합니다. `DESIGN.md`, 프로젝트의 `visual-style.md`, 사용자가 말한 style 순으로 찾고, 모두 없으면 분위기, 밝은 배경과 어두운 배경, 브랜드 색과 폰트의 세 가지를 묻고 최소한의 `DESIGN.md`를 만들게 합니다. `#333`이나 `Roboto`에 손이 간다면 이 단계를 건너뛴 것이라는 문장도 있습니다.
- Layout Before Animation: 요소가 가장 잘 보이는 순간의 정적 레이아웃을 먼저 HTML과 CSS로 만들고, 그 뒤에 움직임을 붙입니다. 시작 상태(화면 밖, 크기 0, 투명)에 놓고 tween으로 옮기면 최종 레이아웃을 추측하게 되고, 겹침은 렌더 전까지 보이지 않는다는 이유가 붙어 있습니다.
- Scene Transitions: 여러 장면이 있으면 장면 사이에 반드시 전환을 두고, 마지막 장면이 아니면 퇴장 애니메이션을 쓰지 않습니다. 전환이 곧 퇴장이라는 설명입니다.
- Output Checklist: `lint`와 `validate` 통과, `inspect` 통과 또는 넘침에 대한 명시적 표시, 대비와 레이아웃 문제 처리가 완료 조건입니다.

보험 앱 예제에 적용하면 순서는 이렇게 됩니다.

```text
DESIGN.md 확인 -> 없음 -> 세 가지 질문 (분위기, 배경, 브랜드 색)
  -> 최소 DESIGN.md 생성 (색 3~5개, 폰트 1~2개, 하지 말 것 3~5개)
  -> 가장 잘 보이는 순간의 정적 레이아웃 (말풍선 폭을 문구 기준으로)
  -> GSAP 등장 애니메이션, 장면 전환
  -> lint -> validate -> inspect -> (사람) preview -> render
```

저는 Output Checklist가 가장 중요하다고 봅니다. skill이 "완료"의 정의를 "브라우저에서 보인다"에서 "검사를 통과했다"로 바꿉니다.

### 움직임도 읽을 수 있는 요약으로 바꾼다

lint와 inspect는 정적인 문제를 봅니다. 움직임의 흐름은 따로 봐야 합니다. skill은 이를 위해 animation map 스크립트를 함께 제공합니다. [\[HyperFrames: hyperframes skill\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/skills/hyperframes/SKILL.md)

skill의 설명에 따르면 이 스크립트는 JSON 하나를 만듭니다. tween마다 "어느 요소가 어떤 속성으로 몇 초 동안 몇 픽셀 움직이는가"를 문장으로 요약하고, 전체 tween을 ASCII Gantt 차트로 그리고, stagger 간격을 실제 값으로 보고합니다. 1초 넘게 아무 움직임이 없는 구간은 dead zone으로 표시하고, 화면 밖, 충돌, 보이지 않음, 0.2초 미만의 지나치게 빠른 움직임, 2초 초과의 지나치게 느린 움직임에 flag를 붙입니다.

이 설계가 흥미로운 이유는 에이전트가 영상을 "볼" 수 없다는 한계를 다루는 방식이기 때문입니다. 프레임을 이미지로 넘기는 대신 움직임을 문장과 숫자로 바꿔 넘깁니다. 보험 앱 예제라면 "말풍선이 0.5초에 0.6초 동안 아래에서 30픽셀 올라오며 나타난다"는 요약과, 마지막 3초에 dead zone이 있다는 flag를 읽고 에이전트가 끝 장면을 보강할 수 있습니다.

skill은 색 하나를 고치거나 길이 하나를 조정하는 작은 수정에서는 이 단계를 건너뛰고, 새 composition이나 큰 애니메이션 변경에서만 돌리라고 적습니다. 검사에도 비용이 있으니 변경의 크기에 맞춰 돌리라는 뜻으로 읽힙니다.

### 미리 만든 블록은 에이전트가 쓰는 양을 줄인다

README는 소셜 overlay, shader 전환, 데이터 시각화, cinematic 효과 같은 50개 이상의 블록과 컴포넌트를 `npx hyperframes add`로 가져다 쓸 수 있다고 소개합니다. [\[HyperFrames: README\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/README.md)

하네스 관점에서 블록은 계약을 이미 지킨 코드 조각입니다. 에이전트가 전환 효과를 매번 새로 쓰면 그만큼 계약을 어길 기회도 늘어납니다. 검증된 블록을 가져와 데이터만 채우게 하면 lint와 inspect가 잡아야 할 문제의 양 자체가 줄어든다고 봅니다.

### 실패 모드: 지시문은 건너뛸 수 있고, 지시문끼리 어긋날 수 있다

skill은 지시문입니다. 에이전트가 건너뛸 수 있습니다. 그래서 강제가 필요한 환경에서는 skill에 기대지 말고 `--strict`를 CI나 실행 스크립트에 넣는 편이 안전합니다.

지시문과 검사 규칙이 서로 어긋나는 경우도 있습니다. 같은 commit에서 hyperframes skill은 무한 반복 대신 반복 횟수를 `Math.ceil(duration / cycleDuration) - 1`로 계산하라고 적는데, gsap lint 규칙의 수정 힌트는 애니메이션이 전체 길이 안에 들어가도록 `Math.floor`를 쓰고 `Math.ceil`은 쓰지 말라고 안내합니다. 같은 파일에는 `Math.ceil`로 반복 횟수를 넘치게 잡은 경우를 따로 잡는 규칙 코드도 있습니다. [\[HyperFrames: lint rules gsap.ts\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/packages/core/src/lint/rules/gsap.ts)

이 어긋남은 오히려 구조의 장점을 보여 줍니다. skill을 따른 에이전트가 틀린 공식을 써도 lint가 잡아 줍니다. 저는 이것이 규칙의 원본을 지시문이 아니라 검사 코드에 두어야 하는 이유라고 봅니다. 지시문은 검사를 통과하는 방법을 가르치는 문서로 두고, 판정은 코드가 하게 하는 편이 drift에 강합니다.

:::tip
보험이나 금융에서 상품 안내 영상이나 교육 영상을 만든다고 하면, 영상의 원본이 HTML 텍스트라는 점이 실무적으로 의미가 있다고 생각합니다. diff로 변경 문구를 확인할 수 있고, 형상관리와 리뷰 절차에 그대로 올릴 수 있기 때문입니다. 같은 입력이 같은 출력을 낸다는 성질도 심의를 받은 버전과 배포한 버전이 같다는 것을 설명할 때 도움이 됩니다. 이 설명이 성립하려면 렌더 환경까지 Docker로 고정해야 한다는 점은 앞에서 본 대로입니다.
:::

## 4. Remotion과의 비교: 프로젝트가 스스로 밝힌 차이

### README와 비교 문서가 말하는 것

README에는 Remotion과의 비교가 들어 있습니다. 아래 내용은 HyperFrames 팀의 주장이라는 점을 먼저 밝혀 둡니다. [\[HyperFrames: README\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/README.md)

README는 HyperFrames가 Remotion에서 영감을 받았고, HeyGen이 Remotion을 production에서 써 왔으며, Chrome 실행 flag나 image2pipe에서 FFmpeg로 흘려보내는 방식처럼 Remotion이 개척한 패턴에는 소스에 출처 주석을 남겼다고 적습니다. 두 도구 모두 headless Chrome을 쓰고 결정적입니다. 갈리는 지점은 작성자가 무엇을 쓰느냐입니다.

| 항목 | HyperFrames (README의 설명) | Remotion (README의 설명) |
| --- | --- | --- |
| 작성 방식 | HTML + CSS + GSAP | React 컴포넌트 (TSX) |
| build 단계 | 없음 | 필요 (bundler) |
| 자체 시계를 가진 애니메이션 라이브러리 | seek 가능 | 렌더 중 실제 시간으로 재생 |
| 기존 HTML과 CSS | 붙여 넣고 애니메이션 | JSX로 다시 작성 |
| 분산 렌더링 | 현재는 단일 머신 | Lambda, production 수준 |

비교 문서는 세 번째 줄을 실험으로 설명합니다. 같은 4초짜리 GSAP timeline을 두 도구로 렌더했더니, HyperFrames는 4초를 모두 썼지만 Remotion에서는 GSAP이 `performance.now()`로 자기 timeline을 실제 시간 속도로 진행해 렌더 시작 후 1초 남짓에 애니메이션이 끝나 버리고 나머지 프레임은 빈 무대가 됐다는 서술입니다. HyperFrames는 캡처 전에 GSAP을 멈추고 `frame / fps`로 seek하기 때문에 라이브러리가 출력과 보조를 맞춘다고 설명합니다. [\[HyperFrames: Hyperframes vs Remotion\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/docs/guides/hyperframes-vs-remotion.mdx)

같은 문서에는 자체 eval에서 LLM이 Remotion composition을 쓸 때 HTML과 GSAP을 직접 쓸 때보다 시각적으로 덜 창의적인 결과를 내고, guardrail과 프롬프트가 훨씬 더 많이 필요했다는 서술이 있습니다.

라이선스에 대해서도 README는 차이를 강조합니다. HyperFrames는 Apache 2.0이고, Remotion은 일정 규모 이상의 회사에 유료 라이선스를 요구하는 source-available 라이선스라는 설명입니다.

### 어느 쪽을 고를지: 판단 기준

이 서술들은 만든 팀의 평가이고 외부에서 재현된 결과가 아닙니다. 비교 문서가 Remotion의 강점으로 React 컴포넌트 재사용과 수백 개의 AWS Lambda로 긴 영상을 나눠 렌더하는 분산 렌더링을 직접 인정한다는 점도 함께 봐야 합니다.

| 조건 | 기울어지는 쪽 | 이유 |
| --- | --- | --- |
| 기존 영상 코드가 React 컴포넌트 | Remotion | 이전 비용이 큼 |
| 긴 영상을 대량으로 빠르게 렌더 | Remotion | 분산 렌더링이 성숙 |
| 기존 웹 페이지나 GSAP 자산을 영상으로 | HyperFrames | 번역 단계가 없음 |
| 에이전트가 주로 작성 | HyperFrames (팀의 주장) | lint, inspect가 에이전트용 출력 |
| 라이선스 조건이 조달 기준 | 각자 확인 | 회사 규모에 따라 다름 |

선택할 때는 기존 코드가 React인지, 분산 렌더링이 필요한지, 라이선스 조건이 맞는지를 직접 대조해 보는 편이 맞다고 봅니다.

### 비용과 한계: 단일 머신의 렌더 자원

단일 머신이라는 한계는 렌더 자원에서 바로 드러납니다. 렌더링 가이드에 따르면 worker 하나가 별도의 Chrome 프로세스를 띄우고 약 256MB의 메모리와 상당한 CPU를 쓰며, 기본값은 CPU core의 절반이되 최대 4개입니다. 2초(60프레임) 미만의 짧은 영상은 병렬화 비용이 이득보다 커서 worker 1개를 권하고, 30초 이상의 긴 영상은 8 core 이상과 16GB 이상의 머신에서 worker를 늘리라고 안내합니다. [\[HyperFrames: Rendering\]](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/docs/guides/rendering.mdx)

보험 앱 예제의 10초 영상은 기본값으로 충분합니다. 하지만 상품별, 언어별로 수백 편을 만들어야 한다면 렌더를 어떻게 나눌지는 HyperFrames 밖에서 설계해야 합니다.

### 보수적인 조직에서 도입 전에 확인할 것

금융이나 보험 조직에서 이 도구를 쓴다면, 기능보다 다음 항목을 먼저 확인하는 편이 좋다고 봅니다. 모두 제 의견이고, 저장소가 이 순서를 권하는 것은 아닙니다.

- 렌더 환경: Docker image를 내부 registry에 두고 버전을 고정할 수 있는가. 같은 입력이 같은 출력을 낸다는 설명은 같은 image에서만 성립합니다.
- 외부 요청: 계약이 렌더 중 네트워크를 금지하므로, 폰트와 이미지와 음원이 모두 프로젝트 안에 들어 있는가. 망 분리 환경에서는 이 점이 오히려 장점이 됩니다.
- 에셋 권리: 블록이나 템플릿에 들어 있는 폰트와 음원의 라이선스가 사내 기준에 맞는가.
- 검사 기록: lint, validate, inspect의 JSON 출력을 렌더 결과와 함께 보관하는가. 심의 후 수정이 생겼을 때 어떤 검사를 통과한 버전인지 보여 줄 수 있어야 합니다.
- 문구 검토: 검사 도구는 문구의 사실 관계를 보지 않으므로, 상품 문구는 별도의 사람 승인 단계를 거치는가.

## 5. 오늘 바로 적용할 수 있는 순서

README 기준으로 Node.js 22 이상과 FFmpeg가 필요합니다.

```bash
npx skills add heygen-com/hyperframes
```

```bash
npx hyperframes init my-video
cd my-video
npx hyperframes preview      # preview in browser (live reload)
npx hyperframes render       # render to MP4
```

1. skill을 설치하거나 `init`으로 프로젝트를 만듭니다. `init`은 skill을 함께 설치하고, `--non-interactive`로 에이전트나 CI에서 질문 없이 실행할 수 있습니다.
2. 에이전트에게 작업을 맡길 때 "`lint`, `validate`, `inspect --json`을 통과하기 전에는 render하지 않는다"를 완료 조건으로 줍니다.
3. 자동화 경로에서는 `npx hyperframes render --strict`로 lint error를 실패로 만들고, warning까지 막아야 하면 `--strict-all`을 씁니다.
4. 실행 환경마다 결과가 같아야 한다면 `--docker`로 렌더하고, 심의나 배포용 렌더는 그 환경에서만 만듭니다.
5. 영상이 아닌 일에도 같은 구조를 적용해 봅니다. 산출물이 지켜야 할 계약을 적고, 그 계약을 기계가 검사하게 하고, 검사 결과를 에이전트가 읽을 수 있는 크기의 JSON으로 돌려주고, 검사 순서를 skill로 가르칩니다.

## 마치며

HyperFrames에서 배울 점은 HTML로 영상을 만든다는 발상보다 그 주변의 장치에 있다고 생각합니다.

렌더 방식에서 계약을 끌어내고, 그 계약을 lint 규칙으로 집행하고, 화면의 문제를 JSON으로 돌려주고, 그 순서를 skill로 가르칩니다.

에이전트가 쓰는 출력의 형식이 무엇이든, 이 네 가지를 갖추면 "된 것 같다"와 "검사를 통과했다"를 구분할 수 있습니다.

## 참고 자료

- [HyperFrames README (2026-04-28 기준)](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/README.md)
- [Deterministic Rendering](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/docs/concepts/determinism.mdx)
- [Frame Adapters](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/docs/concepts/frame-adapters.mdx)
- [Rendering](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/docs/guides/rendering.mdx)
- [CLI](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/docs/packages/cli.mdx)
- [Hyperframes vs Remotion](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/docs/guides/hyperframes-vs-remotion.mdx)
- [skills/hyperframes/SKILL.md](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/skills/hyperframes/SKILL.md)
- [skills/hyperframes-cli/SKILL.md](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/skills/hyperframes-cli/SKILL.md)
- [packages/core/src/lint/rules/core.ts](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/packages/core/src/lint/rules/core.ts)
- [packages/core/src/lint/rules/gsap.ts](https://github.com/heygen-com/hyperframes/blob/be1fcfc4e6af60c0ff6a04421c5ec9ed3b5012c7/packages/core/src/lint/rules/gsap.ts)
- [HyperFrames v0.1.2 release](https://github.com/heygen-com/hyperframes/releases/tag/v0.1.2)
- [HyperFrames initial commit](https://github.com/heygen-com/hyperframes/commit/c60a24628334ded313190b0af0bdfbc98ef41b81)
