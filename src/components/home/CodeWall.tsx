// Decorative wall of legacy-looking code behind the headline. Invented, generic snippets in the
// styles an insurance back office accumulates (COBOL, JCL, SQL, Java, xPlatform, batch control);
// no real company's code, table names or identifiers.
const LINES = [
  "       PROCEDURE DIVISION.  MOVE WS-POLICY-NO TO DB-KEY.  PERFORM 2000-READ-CONTRACT THRU 2000-EXIT.",
  "       EXEC SQL SELECT PREM_AMT INTO :WS-PREM FROM CONTRACT WHERE POL_NO = :DB-KEY END-EXEC.",
  '    if (contract.getStatus() == null) { throw new BizException("E0412"); } // TODO: 2011 임시 처리',
  "    SELECT /*+ INDEX(T IX_CLAIM_01) */ T.* FROM CLAIM T WHERE T.CLM_DT BETWEEN :1 AND :2 ORDER BY 1",
  "       CALL 'FEPSEND' USING WS-MSG-HDR WS-MSG-BODY.   IF RTN-CD NOT = '0000' GO TO 9999-ERR-RTN.",
  "    public void calcPremium(Map<String, Object> param) throws Exception { /* 2014 개정 반영 */",
  "    UPDATE BATCH_CTL SET STEP_STAT = 'R', UPD_DT = SYSDATE WHERE JOB_ID = 'CLS0301' AND RUN_DT = :RUN",
  '    <Dataset id="ds_contract" onrowposchanged="fn_ds_contract_onrowposchanged" useclientlayout="true">',
  "//STEP010  EXEC PGM=CLSB0301,REGION=0M,COND=(4,LT)    //SYSOUT DD SYSOUT=*   //INFILE DD DSN=PRD.CLS.D",
  "    String sql = \"SELECT \" + cols + \" FROM \" + tbl + \" WHERE 1=1\" + where; // 동적 조립, 손대지 말 것",
  "       05 WS-RIDER-TBL OCCURS 20 TIMES INDEXED BY RIDX.  10 WS-RIDER-CD PIC X(05).  10 WS-RIDER-AMT PIC S9(13)V99.",
  "    MERGE INTO PREM_SUM S USING (SELECT POL_NO, SUM(AMT) AMT FROM PREM_DTL GROUP BY POL_NO) D ON (...)",
  "    if (\"Y\".equals(flag) && !\"N\".equals(flag2) || isOldProduct(prodCd)) { // 2009 상품 예외",
  "       IF WS-CNT > 9999 DISPLAY 'OVER LIMIT' UPON CONSOLE  MOVE 16 TO RETURN-CODE  STOP RUN  END-IF.",
  "    function fn_search() { this.transaction(\"svcSearch\", \"/ctr/search.do\", \"ds_in=ds_cond\", \"ds_list=ds_out\"); }",
  "    DELETE FROM TMP_WORK WHERE REG_DT < ADD_MONTHS(SYSDATE, -3);  COMMIT;  -- 월말 배치 후 정리",
];

export function CodeWall() {
  const text = LINES.join("\n");
  return (
    <div className="code-wall" aria-hidden="true">
      <pre className="mono">
        {text}
        {"\n"}
        {text}
      </pre>
    </div>
  );
}
