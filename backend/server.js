import {createApiServer} from "./native-api-server.js";
import {getSqliteDatabase} from "./sqlite-db.js";
import {
  approveCapsReview,
  getCapsArtifact,
  listCapsScenarios,
  resolveLocalOllamaEmployeeSelection,
  runCapsScenario,
  resolveLocalOllamaPayrollReview,
  runLocalOllamaPayrollAgent,
  NATIVE_INTERNAL_TOKEN
} from "./caps-guard-bridge.js";
import {listMcpTools,runMcpPayrollIntent} from "./mcp-agent.js";
import {resolveLocalMcpEmployeeSelection,resolveLocalMcpPayrollReview,runLocalMcpPayrollAgent} from "./local-agent-process.js";
import {callPayrollMcpTool,closePayrollMcpSession,getLastMcpTiming,getMcpReadiness,listPayrollMcpTools,warmPayrollMcpSession} from "./mcp-client.js";
import {createCapsTraceId,getCapsLifecycleTiming,openCapsEventStream,publishCapsLifecycle,publishCapsRunFailure,publishCapsRunLifecycle} from "./caps-guard-events.js";

const app=createApiServer();
const port=Number(process.env.API_PORT||3001);

function lifecycleTraceId(request){
  return createCapsTraceId(request.body?.trace_id||request.headers["x-caps-trace-id"]||null);
}

function attachLifecycleTrace(result,traceId){
  return result&&typeof result==="object"?{...result,lifecycleTraceId:traceId,lifecycleTiming:getCapsLifecycleTiming(traceId)}:result;
}

async function runWithLifecycle(request,response,source,operation){
  const traceId=lifecycleTraceId(request);
  const continuation=source==="native-agent-review"||source==="native-agent-selection";
  publishCapsLifecycle(traceId,{nodeId:"request",status:"completed",detail:continuation?"Continuation request received":"Request received",source});
  publishCapsLifecycle(traceId,{nodeId:"intent",status:continuation?"skipped":"running",detail:continuation?"Existing bounded intent is being resumed":source==="native-agent"?"Local Ollama is interpreting":"Bounded agent is interpreting",source});
  publishCapsLifecycle(traceId,{nodeId:"mcp",status:"running",detail:continuation?"Persisted capability continuation is processing":"Capability route is processing",source});
  try{
    const result=await operation(traceId);
    publishCapsRunLifecycle(traceId,result,{source});
    const withTrace=attachLifecycleTrace(result,traceId);
    response.json(withTrace);
  }catch(error){
    publishCapsRunFailure(traceId,error,{source});
    response.status(400).json({error:error.message,lifecycleTraceId:traceId});
  }
}

app.get("/api/caps-guard/scenarios",(_request,response)=>{
  response.json({
    boundary:"CAPS Guard native plan runner",
    orchestration:"separate",
    scenarios:listCapsScenarios()
  });
});

app.get("/api/mcp/tools",(_request,response)=>{
  try{
    response.json({transport:"mcp-stdio",protocol:"official-mcp-v2-sdk",tools:listMcpTools()});
  }catch(error){response.status(503).json({error:error.message});}
});

app.get("/api/caps-guard/events/:traceId",(request,response)=>{
  const traceId=createCapsTraceId(request.params.traceId);
  openCapsEventStream(traceId,response);
});

app.post("/api/mcp/intent",async(request,response)=>{
  try{
    const result=await runMcpPayrollIntent(request.body);
    response.json(result);
  }catch(error){
    response.status(400).json({error:error.message});
  }
});

app.post("/api/mcp/local-agent",async(request,response)=>{
  await runWithLifecycle(request,response,"local-agent",()=>runLocalMcpPayrollAgent(request.body?.prompt));
});

app.post("/api/mcp/local-agent/reviews/:reviewId/:decision",async(request,response)=>{
  await runWithLifecycle(request,response,"local-agent",()=>resolveLocalMcpPayrollReview(request.params.reviewId,request.params.decision));
});

app.post("/api/mcp/local-agent/sessions/:sessionId/employee",async(request,response)=>{
  await runWithLifecycle(request,response,"local-agent",()=>resolveLocalMcpEmployeeSelection(request.params.sessionId,request.body?.employeeId));
});

// Explicit opt-in native path for local-runtime experiments. It is deliberately
// separate from the reliable demo route above and must remain fail-closed.
app.post("/api/mcp/native-agent",async(request,response)=>{
  await runWithLifecycle(request,response,"native-agent",()=>runLocalOllamaPayrollAgent(request.body?.prompt));
});

app.post("/api/mcp/native-agent/reviews/:reviewId/:decision",async(request,response)=>{
  await runWithLifecycle(request,response,"native-agent-review",()=>resolveLocalOllamaPayrollReview(request.params.reviewId,request.params.decision));
});

app.post("/api/mcp/native-agent/sessions/:sessionId/employee",async(request,response)=>{
  await runWithLifecycle(request,response,"native-agent-selection",()=>resolveLocalOllamaEmployeeSelection(request.params.sessionId,request.body?.employeeId));
});

// Private loopback handoff for the native Python runner. The Python start and
// resume processes are intentionally short-lived, while this backend owns the
// long-lived official MCP v2 client/session. This route is not public API and
// accepts only the two server-owned native capabilities.
app.post("/api/mcp/native-internal",async(request,response)=>{
  if(request.headers["x-caps-native-token"]!==NATIVE_INTERNAL_TOKEN){
    return response.status(403).json({error:"Native MCP internal token rejected"});
  }
  const body=request.body||{};
  try{
    if(body.op==="tools/list"&&Object.keys(body).length===1){
      const tools=await listPayrollMcpTools();
      return response.json({ok:true,tools:tools.map((tool)=>tool.name),mcp_timing:getLastMcpTiming()});
    }
    const allowed=new Set(["search_employee_profiles","route_payroll_intent","resolve_payroll_review"]);
    if(body.op!=="tools/call"||!allowed.has(body.name)||!body.arguments||typeof body.arguments!=="object"||Array.isArray(body.arguments)||Object.keys(body).some((key)=>!["op","name","arguments"].includes(key))){
      return response.status(400).json({error:"Native MCP request is outside the bounded payroll contract"});
    }
    const result=await callPayrollMcpTool(body.name,body.arguments);
    return response.json({ok:true,result,mcp_timing:getLastMcpTiming()});
  }catch(error){
    return response.status(502).json({ok:false,error:error.message});
  }
});

app.post("/api/caps-guard/scenarios/:scenarioKey",async(request,response)=>{
  await runWithLifecycle(request,response,"caps-guard",()=>runCapsScenario(request.params.scenarioKey));
});

app.post("/api/caps-guard/reviews/:reviewId/approve",async(request,response)=>{
  await runWithLifecycle(request,response,"caps-guard",()=>approveCapsReview(request.params.reviewId));
});

app.get("/api/caps-guard/runs/:runId/:artifact",(request,response)=>{
  const artifactMap={
    "trace.json":"trace",
    "trace_graph.json":"trace_graph",
    "trace.html":"html"
  };
  const artifact=artifactMap[request.params.artifact];
  const path=artifact?getCapsArtifact(request.params.runId,artifact):null;
  if(!path) return response.status(404).json({error:"CAPS Guard artifact not found"});
  if(artifact==="html") return response.sendFile(path);
  return response.sendFile(path,{headers:{"Content-Type":"application/json"}});
});

app.get("/api/health",(_request,response)=>{
  try{
    getSqliteDatabase().prepare("SELECT 1 AS ok").get();
    response.json({status:"ok",database:"connected",provider:"sqlite"});
  }catch(error){response.status(503).json({status:"error",message:error.message});}
});

app.get("/api/native/readiness",(_request,response)=>{
  const mcp=getMcpReadiness();
  response.status(mcp.status==="failed"?503:200).json({
    status:mcp.status,
    mcp,
    ollama:{status:"external",detail:"Check Ollama with curl http://127.0.0.1:11434/api/tags"},
    native_worker:{status:"per_request",detail:"Python/LangGraph runner starts per native request"},
    caps:{status:"ready",detail:"Server-owned CAPS Guard routes are available"}
  });
});

app.get("/api/summary-dashboard",(_request,response,next)=>{
  try{
    const db=getSqliteDatabase();
    const metrics=db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM Employees) AS EmployeeCount,
        (SELECT COUNT(*) FROM Employees WHERE IsActive=1) AS ActiveEmployeeCount,
        (SELECT COUNT(*) FROM Projects) AS ProjectCount,
        (SELECT COUNT(*) FROM Projects WHERE Status='Active') AS ActiveProjectCount,
        (SELECT COUNT(*) FROM TimeEntries) AS EntryCount,
        ROUND((SELECT COALESCE(SUM(HoursWorked),0) FROM TimeEntries),1) AS TotalHours,
        ROUND((SELECT COALESCE(SUM(CASE WHEN EntryStatus='Approved' THEN HoursWorked ELSE 0 END),0) FROM TimeEntries),1) AS ApprovedHours,
        ROUND((SELECT COALESCE(SUM(CASE WHEN IsBillable=1 THEN HoursWorked ELSE 0 END),0) FROM TimeEntries),1) AS BillableHours,
        (SELECT COUNT(*) FROM TimeEntries WHERE HoursWorked>8) AS OvertimeEntries,
        (SELECT MIN(substr(StartTime,1,10)) FROM TimeEntries) AS FirstWorkDate,
        (SELECT MAX(substr(StartTime,1,10)) FROM TimeEntries) AS LatestWorkDate`).get();
    const statuses=db.prepare(`
      SELECT EntryStatus AS Status,COUNT(*) AS Entries,ROUND(SUM(HoursWorked),1) AS Hours
      FROM TimeEntries GROUP BY EntryStatus ORDER BY Entries DESC`).all();
    const monthly=db.prepare(`
      SELECT substr(StartTime,1,7) AS Month,COUNT(*) AS Entries,ROUND(SUM(HoursWorked),1) AS Hours
      FROM TimeEntries GROUP BY Month ORDER BY Month`).all();
    const topProjects=db.prepare(`
      SELECT p.ProjectCode,p.ProjectName,COUNT(*) AS Entries,ROUND(SUM(te.HoursWorked),1) AS Hours,
             COUNT(DISTINCT te.EmployeeId) AS TeamSize
      FROM TimeEntries te JOIN Projects p ON p.ProjectId=te.ProjectId
      GROUP BY p.ProjectId,p.ProjectCode,p.ProjectName ORDER BY Hours DESC LIMIT 6`).all();
    const recentEntries=db.prepare(`
      SELECT te.TimeEntryId,e.FirstName||' '||e.LastName AS EmployeeName,r.RoleName,
             p.ProjectCode,p.ProjectName,substr(te.StartTime,1,10) AS WorkDate,
             te.HoursWorked,te.EntryStatus,te.IsBillable
      FROM TimeEntries te
      JOIN Employees e ON e.EmployeeId=te.EmployeeId
      JOIN Roles r ON r.RoleId=e.RoleId
      JOIN Projects p ON p.ProjectId=te.ProjectId
      ORDER BY te.StartTime DESC,te.TimeEntryId DESC LIMIT 8`).all();
    response.json({
      metrics:{
        ...metrics,
        ApprovalRate:metrics.EntryCount?Number(((statuses.find((item)=>item.Status==="Approved")?.Entries||0)/metrics.EntryCount*100).toFixed(1)):0,
        BillableRate:metrics.TotalHours?Number((metrics.BillableHours/metrics.TotalHours*100).toFixed(1)):0
      },
      statuses,monthly,topProjects,recentEntries,
      orchestration:{
        status:"CAPS Guard boundary connected; real MCP stdio server and bounded local agent connected",
        boundary:"DEMO_AGENT_BOUNDARY.md",
        mcpToolCount:3,
        proposedTools:["search_employee_profiles","route_payroll_intent","resolve_payroll_review"],
        note:"The summary actions use the bounded local agent over the official MCP stdio server. The server resolves employee identity before selecting a payroll capability, then owns the concrete tools, plans, manifests, and approval behavior; raw tools, paths, manifests, and approval flags are not accepted."
      }
    });
  }catch(error){next(error);}
});

app.get("/api/employees",(_request,response,next)=>{
  try{
    const rows=getSqliteDatabase().prepare(`
      SELECT e.EmployeeId,e.FirstName||' '||e.LastName AS EmployeeName,
             d.DepartmentName,r.RoleName,e.IsActive
      FROM Employees e
      JOIN Departments d ON d.DepartmentId=e.DepartmentId
      JOIN Roles r ON r.RoleId=e.RoleId
      ORDER BY e.LastName,e.FirstName`).all();
    response.json(rows);
  }catch(error){next(error);}
});

app.get("/api/employee-scorecards",(_request,response,next)=>{
  try{
    const rows=getSqliteDatabase().prepare(`
      SELECT e.EmployeeId,e.EmployeeNumber,
             e.FirstName||' '||e.LastName AS EmployeeName,
             d.DepartmentName,r.RoleName,e.IsActive,
             ROUND(COALESCE(SUM(te.HoursWorked),0),1) AS TotalHours,
             ROUND(COALESCE(SUM(CASE WHEN te.EntryStatus='Approved' THEN te.HoursWorked ELSE 0 END),0),1) AS ApprovedHours,
             ROUND(COALESCE(SUM(CASE WHEN te.EntryStatus='Pending' THEN te.HoursWorked ELSE 0 END),0),1) AS PendingHours,
             SUM(CASE WHEN te.EntryStatus='Rejected' THEN 1 ELSE 0 END) AS RejectedEntries,
             COUNT(te.TimeEntryId) AS EntryCount,
             COUNT(DISTINCT te.ProjectId) AS ProjectCount,
             MAX(substr(te.StartTime,1,10)) AS LatestWorkDate
      FROM Employees e
      JOIN Departments d ON d.DepartmentId=e.DepartmentId
      JOIN Roles r ON r.RoleId=e.RoleId
      LEFT JOIN TimeEntries te ON te.EmployeeId=e.EmployeeId
      GROUP BY e.EmployeeId,e.EmployeeNumber,e.FirstName,e.LastName,
               d.DepartmentName,r.RoleName,e.IsActive
      ORDER BY TotalHours DESC,e.LastName,e.FirstName`).all();
    response.json(rows);
  }catch(error){next(error);}
});

app.get("/api/project-scorecards",(_request,response,next)=>{
  try{
    const rows=getSqliteDatabase().prepare(`
      WITH time_rollup AS (
        SELECT ProjectId,
               ROUND(COALESCE(SUM(HoursWorked),0),1) AS TotalHours,
               ROUND(COALESCE(SUM(CASE WHEN EntryStatus='Approved' THEN HoursWorked ELSE 0 END),0),1) AS ApprovedHours,
               ROUND(COALESCE(SUM(CASE WHEN IsBillable=1 THEN HoursWorked ELSE 0 END),0),1) AS BillableHours,
               COUNT(DISTINCT EmployeeId) AS TeamSize,
               COUNT(*) AS EntryCount,
               MAX(substr(StartTime,1,10)) AS LatestWorkDate
        FROM TimeEntries GROUP BY ProjectId
      ), work_rollup AS (
        SELECT ProjectId,
               SUM(CASE WHEN Status!='Done' THEN 1 ELSE 0 END) AS OpenWorkItems,
               SUM(CASE WHEN Status='Done' THEN 1 ELSE 0 END) AS CompletedWorkItems
        FROM WorkItems GROUP BY ProjectId
      )
      SELECT p.ProjectId,p.ProjectCode,p.ProjectName,p.Status,p.BudgetHours,p.IsBillable,
             c.ClientName,
             COALESCE(t.TotalHours,0) AS TotalHours,
             COALESCE(t.ApprovedHours,0) AS ApprovedHours,
             COALESCE(t.BillableHours,0) AS BillableHours,
             COALESCE(t.TeamSize,0) AS TeamSize,
             COALESCE(t.EntryCount,0) AS EntryCount,
             COALESCE(w.OpenWorkItems,0) AS OpenWorkItems,
             COALESCE(w.CompletedWorkItems,0) AS CompletedWorkItems,
             t.LatestWorkDate
      FROM Projects p
      JOIN Clients c ON c.ClientId=p.ClientId
      LEFT JOIN time_rollup t ON t.ProjectId=p.ProjectId
      LEFT JOIN work_rollup w ON w.ProjectId=p.ProjectId
      ORDER BY TotalHours DESC,p.ProjectCode`).all();
    response.json(rows);
  }catch(error){next(error);}
});

app.get("/api/time-entries",(request,response,next)=>{
  try{
    const status=request.query.status||null;
    const employeeSearch=(request.query.employee||"").trim();
    const workDate=request.query.date||null;
    const page=Math.max(1,Number(request.query.page)||1);
    const pageSize=Math.min(100,Math.max(5,Number(request.query.pageSize)||25));
    const sortColumns={
      EmployeeName:"EmployeeName",
      WorkDate:"WorkDate",
      ProjectName:"ProjectName",
      HoursWorked:"te.HoursWorked",
      EntryStatus:"te.EntryStatus"
    };
    const sortBy=sortColumns[request.query.sortBy]||sortColumns.WorkDate;
    const sortDir=String(request.query.sortDir).toLowerCase()==="asc"?"ASC":"DESC";
    const where=[];
    const params=[];
    if(status){where.push("te.EntryStatus = ?");params.push(status);}
    if(employeeSearch){where.push("(e.FirstName || ' ' || e.LastName) LIKE ?");params.push(`%${employeeSearch}%`);}
    if(workDate){where.push("substr(te.StartTime,1,10) = ?");params.push(workDate);}
    const whereSql=where.length?`WHERE ${where.join(" AND ")}`:"";
    // SQLite column -> SQL alias -> JSON property -> React row property -> <td>.
    const db=getSqliteDatabase();
    const total=db.prepare(`SELECT COUNT(*) AS total
      FROM TimeEntries te
      JOIN Employees e ON e.EmployeeId=te.EmployeeId
      JOIN Projects p ON p.ProjectId=te.ProjectId
      ${whereSql}`).get(...params).total;
    const offset=(page-1)*pageSize;
    const rows=db.prepare(`
      SELECT te.TimeEntryId,e.EmployeeNumber,e.FirstName||' '||e.LastName AS EmployeeName,
             r.RoleName,substr(te.StartTime,1,10) AS WorkDate,
             substr(te.StartTime,12,5) AS StartTime,te.HoursWorked,
             te.EntryStatus,te.IsBillable,te.Notes,p.ProjectCode,p.ProjectName
      FROM TimeEntries te
      JOIN Employees e ON e.EmployeeId=te.EmployeeId
      JOIN Roles r ON r.RoleId=e.RoleId
      JOIN Projects p ON p.ProjectId=te.ProjectId
      ${whereSql}
      ORDER BY ${sortBy} ${sortDir},te.TimeEntryId DESC
      LIMIT ? OFFSET ?`).all(...params,pageSize,offset);
    response.json({items:rows,total,page,pageSize,totalPages:Math.max(1,Math.ceil(total/pageSize))});
  }catch(error){next(error);}
});

app.get("/api/payroll-summary",(request,response,next)=>{
  try{
    const requestedId=request.query.payPeriodId?Number(request.query.payPeriodId):null;
    const latest=getSqliteDatabase().prepare("SELECT PayPeriodId FROM PayPeriods ORDER BY StartDate DESC LIMIT 1").get();
    const periodId=requestedId??latest.PayPeriodId;
    const rows=getSqliteDatabase().prepare(`
      SELECT e.EmployeeId,e.FirstName||' '||e.LastName AS EmployeeName,
             d.DepartmentName,pp.PeriodName,
             COALESCE(SUM(CASE WHEN te.EntryStatus='Approved' THEN te.HoursWorked ELSE 0 END),0) AS TotalHours,
             COALESCE(SUM(CASE WHEN te.EntryStatus='Approved' AND te.HoursWorked>8 THEN te.HoursWorked-8 ELSE 0 END),0) AS DailyOvertimeHours
      FROM Employees e
      JOIN Departments d ON d.DepartmentId=e.DepartmentId
      JOIN PayPeriods pp ON pp.PayPeriodId=?
      LEFT JOIN TimeEntries te ON te.EmployeeId=e.EmployeeId
        AND substr(te.StartTime,1,10) BETWEEN pp.StartDate AND pp.EndDate
      GROUP BY e.EmployeeId,e.FirstName,e.LastName,d.DepartmentName,pp.PeriodName
      ORDER BY e.LastName,e.FirstName`).all(periodId);
    response.json(rows);
  }catch(error){next(error);}
});

app.get("/api/payroll-dashboard",(request,response,next)=>{
  try{
    const db=getSqliteDatabase();
    const requestedId=request.query.payPeriodId?Number(request.query.payPeriodId):null;
    const period=requestedId
      ? db.prepare("SELECT * FROM PayPeriods WHERE PayPeriodId=?").get(requestedId)
      : db.prepare(`SELECT pp.* FROM PayPeriods pp
          WHERE EXISTS (
            SELECT 1 FROM TimeEntries te
            WHERE substr(te.StartTime,1,10) BETWEEN pp.StartDate AND pp.EndDate
          )
          ORDER BY pp.StartDate DESC LIMIT 1`).get();
    if(!period) return response.status(404).json({error:"No pay period found"});

    const rawEmployees=db.prepare(`
      SELECT e.EmployeeId,e.FirstName||' '||e.LastName AS EmployeeName,
             d.DepartmentName,r.RoleName,
             ROUND(e.AnnualSalary/2080.0,2) AS HourlyRate,
             ROUND(COALESCE(SUM(CASE WHEN te.EntryStatus='Approved' THEN te.HoursWorked ELSE 0 END),0),1) AS ApprovedHours,
             COUNT(DISTINCT CASE WHEN te.EntryStatus='Approved' THEN te.ProjectId END) AS ProjectCount
      FROM Employees e
      JOIN Departments d ON d.DepartmentId=e.DepartmentId
      JOIN Roles r ON r.RoleId=e.RoleId
      LEFT JOIN TimeEntries te ON te.EmployeeId=e.EmployeeId
        AND substr(te.StartTime,1,10) BETWEEN ? AND ?
      GROUP BY e.EmployeeId,e.FirstName,e.LastName,d.DepartmentName,r.RoleName,e.AnnualSalary
      HAVING ApprovedHours>0
      ORDER BY ApprovedHours DESC,e.LastName,e.FirstName`).all(period.StartDate,period.EndDate);

    const employees=rawEmployees.map((employee)=>{
      const grossPay=Number((employee.ApprovedHours*employee.HourlyRate).toFixed(2));
      const cppEstimate=Number((Math.max(0,grossPay-134.62)*0.0595).toFixed(2));
      return {...employee,grossPay,cppEstimate,netBeforeTax: Number((grossPay-cppEstimate).toFixed(2))};
    });

    const projects=db.prepare(`
      SELECT p.ProjectId,p.ProjectCode,p.ProjectName,
             ROUND(SUM(te.HoursWorked),1) AS ApprovedHours,
             ROUND(SUM(te.HoursWorked*(e.AnnualSalary/2080.0)),2) AS EstimatedLabourCost,
             COUNT(DISTINCT te.EmployeeId) AS EmployeeCount
      FROM TimeEntries te
      JOIN Projects p ON p.ProjectId=te.ProjectId
      JOIN Employees e ON e.EmployeeId=te.EmployeeId
      WHERE te.EntryStatus='Approved'
        AND substr(te.StartTime,1,10) BETWEEN ? AND ?
      GROUP BY p.ProjectId,p.ProjectCode,p.ProjectName
      ORDER BY ApprovedHours DESC,p.ProjectCode`).all(period.StartDate,period.EndDate);

    const signatory=db.prepare(`
      SELECT e.FirstName||' '||e.LastName AS Name
      FROM Employees e
      JOIN Departments d ON d.DepartmentId=e.DepartmentId
      JOIN Roles r ON r.RoleId=e.RoleId
      WHERE d.DepartmentName='Finance' AND r.RoleName='Department Manager'
      ORDER BY e.EmployeeId LIMIT 1`).get();

    const totals=employees.reduce((summary,employee)=>({
      approvedHours:Number((summary.approvedHours+employee.ApprovedHours).toFixed(1)),
      grossPay:Number((summary.grossPay+employee.grossPay).toFixed(2)),
      cppEstimate:Number((summary.cppEstimate+employee.cppEstimate).toFixed(2)),
      netBeforeTax:Number((summary.netBeforeTax+employee.netBeforeTax).toFixed(2))
    }),{approvedHours:0,grossPay:0,cppEstimate:0,netBeforeTax:0});

    response.json({
      period,
      totals,
      employees,
      projects,
      approval:{
        status:"Approved for synthetic demo",
        signedBy:signatory?.Name||"Jamie Smith",
        title:"Chief Financial Officer (Demo)",
        signedAt:`${period.EndDate} 16:00`,
        signature:`/s/ ${signatory?.Name||"Jamie Smith"}`
      },
      disclaimer:"Synthetic payroll illustration. CPP is a demo estimate only; income tax and EI are not calculated."
    });
  }catch(error){next(error);}
});

app.use((error,_request,response,_next)=>{
  console.error(error);
  response.status(500).json({error:"Database request failed",detail:error.message});
});

app.listen(port,()=>{
  console.log(`SQLite practice API listening at http://localhost:${port}`);
  void warmPayrollMcpSession().then((readiness)=>console.log(`Native MCP readiness: ${readiness.status} (${readiness.detail})`));
});
process.once("SIGTERM",async()=>{await closePayrollMcpSession();process.exit(0);});
process.once("SIGINT",async()=>{await closePayrollMcpSession();process.exit(0);});
