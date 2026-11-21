// Career data. Source: docs/source/tobi-life-portfolio.md plus the owner's corrections
// recorded in the design spec (section 5). Do not add facts that are not in those two places.

export type Project = {
  name: string;
  period?: string;
  summary?: string;
  items?: string[];
  tech?: string[];
  result?: string;
};

export type Company = {
  id: "hanwha" | "hyundai" | "meritz";
  name: string;
  division: string;
  period: string;
  stack: string[];
  projects: Project[];
  awards?: string[];
};

export const companies: Company[] = [
  {
    id: "hanwha",
    name: "한화손해보험",
    division: "비대면채널(CM)",
    period: "2022.09 ~ 현재",
    stack: ["Java", "Spring Boot", "JSP", "jQuery", "Oracle", "EAI"],
    projects: [
      { name: "산출지원센터 TM 신규 시스템 구축", period: "2026.09 ~ 2026.12" },
      { name: "자동차 TM 유지보수", period: "2025.01 ~" },
      {
        name: "자동차보험 리뉴얼",
        summary: "레거시 자동차보험 시스템 전면 리뉴얼.",
        tech: ["Java", "JSP", "jQuery", "Oracle"],
      },
      {
        name: "장기보험 고도화",
        items: ["가입설계 시스템", "로그 개선", "전자서명 모듈", "본인인증 시스템", "결제 모듈", "EAI 서비스 모듈"],
        tech: ["Java", "Spring Boot", "EAI"],
      },
      {
        name: "원데이 자동차보험",
        summary: "단기 자동차보험 신규 서비스.",
        items: ["가입설계", "취소배서"],
        tech: ["Java", "JSP", "Oracle"],
      },
    ],
  },
  {
    id: "hyundai",
    name: "현대해상",
    division: "비대면채널(CM)",
    period: "2017.12 ~ 2022.09",
    stack: ["Java", "Spring Boot", "JSP", "jQuery", "Oracle"],
    projects: [
      {
        name: "제휴 간편설계 시스템",
        items: ["이지세이브 간편설계", "SKC&S 간편설계", "청신호 앱 간편설계", "현대해상 다이렉트 이벤트"],
        tech: ["Java", "RESTful API", "Oracle", "JSP", "jQuery"],
      },
      {
        name: "장기보험 신상품 개발",
        items: ["주택화재보험", "사업장화재보험", "어린이보험", "건강보험", "암보험", "실손보험", "운전자보험"],
        tech: ["Java", "Oracle", "JSP", "jQuery"],
      },
      {
        name: "CM 청약 시스템",
        items: ["CM 자동차 청약", "장기 청약", "장기 고도화"],
      },
    ],
  },
  {
    id: "meritz",
    name: "메리츠화재",
    division: "기간계",
    period: "2009.03 ~ 2017.12",
    stack: ["Java", "Spring Framework", "xPlatform", "Oracle", "DB2", "Oz Report", "Anylink", "Cruzlink"],
    awards: ["2012 운영 최우수상", "2013 매뉴얼 최우수상"],
    projects: [
      {
        name: "대외계 운영 (FEP Batch)",
        summary: "방카슈랑스, FB, CMS 이체, 수수료 등 대외계 전문 관리.",
        tech: ["Anylink", "Cruzlink"],
        result: "안정적인 대외계 인터페이스 운영으로 2012년 운영 최우수상 수상",
      },
      {
        name: "계약공통 개발",
        items: [
          "고객센터 시스템: 지점, 창구, 센터 관리 시스템 운영 및 유지보수",
          "마감배치관리: 이체, 관리회계, 수수료 등 주요 배치 스케줄 JOB 캘린더 VIEW 관리",
          "RC 유의고객: 보험 유의자 관리 시스템",
          "채권가압류: 법원 제공 채무자 정보 기반 가압류 여부 및 보험현황 관리",
          "AML 자금세탁방지: 화면 개발",
          "출력물 고도화: 레포트 전면 리뉴얼",
        ],
        tech: ["Java", "Oracle", "xPlatform", "Oz Report"],
      },
      {
        name: "DBIO 공통모듈",
        summary: "개발환경 전체 IO 관리(온라인/배치) 모듈 관리 배포.",
        tech: ["Java", "MCC 테이블 설계 운영"],
        result: "개발 생산성 향상 및 표준화",
      },
      {
        name: "고객센터·FP 민원 시스템",
        items: ["고객센터 이관업무", "원격지 요청", "FP 민원 시스템"],
      },
    ],
  },
];

export const strengths: { title: string; body: string }[] = [
  { title: "보험 도메인 전문성", body: "2009년부터 쌓아 온 보험업 비즈니스 로직 이해" },
  { title: "Full-Stack 개발", body: "Backend(Java) + Frontend(xPlatform, React, JSP, Vue, Next.js) + DB" },
  { title: "대용량 처리", body: "보험사 배치 시스템 설계 및 최적화 경험" },
  { title: "시스템 통합", body: "대외계 인터페이스 및 제휴사 연동 경험" },
  { title: "프로젝트 관리", body: "신상품 개발부터 시스템 리뉴얼까지 다양한 규모 경험" },
];

export const techGroups: { label: string; items: string[] }[] = [
  { label: "backend", items: ["Java", "Spring Framework", "Spring Boot"] },
  { label: "frontend", items: ["xPlatform", "NCRM", "JSP", "jQuery", "React", "Vue", "Next.js"] },
  { label: "database", items: ["Oracle", "DB2"] },
  { label: "integration", items: ["EAI", "Anylink", "Cruzlink", "RESTful API"] },
  { label: "reporting", items: ["Oz Report"] },
  // Owner's own statement (2026-11-22): has built agent harnesses and AI orchestration.
  { label: "ai", items: ["AI 에이전트 하네스 구축", "AI 오케스트레이션", "RAG", "LangChain", "Ollama", "ChromaDB"] },
];

export const motto = "보험은 복잡하지만, 기술로 단순하게 만들 수 있는 환경을 만들고 싶습니다.";
