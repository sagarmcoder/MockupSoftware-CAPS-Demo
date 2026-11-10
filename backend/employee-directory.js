import {getSqliteDatabase} from "./sqlite-db.js";

const MAX_QUERY_LENGTH=80;

const SYNTHETIC_PROFILES=Object.freeze([
  Object.freeze({employeeId:"E104",employeeNumber:"DEMO-E104",employeeName:"Sarah",preferredName:"Sarah",departmentName:"Synthetic Demo",roleName:"Demo Employee",isActive:1,source:"synthetic-demo"}),
  Object.freeze({employeeId:"E105",employeeNumber:"DEMO-E105",employeeName:"John",preferredName:"John",departmentName:"Synthetic Demo",roleName:"Demo Employee",isActive:1,source:"synthetic-demo"}),
  Object.freeze({employeeId:"E106",employeeNumber:"DEMO-E106",employeeName:"Alice",preferredName:"Alice",departmentName:"Synthetic Demo",roleName:"Demo Employee",isActive:1,source:"synthetic-demo"})
]);

function cleanQuery(query){
  if(typeof query!=="string"||!query.trim()||query.trim().length>MAX_QUERY_LENGTH) throw new Error("Employee profile query must be 1-80 characters");
  return query.trim();
}

function candidateFromRow(row){
  return {
    employeeId:row.EmployeeNumber,
    employeeNumber:row.EmployeeNumber,
    employeeName:row.EmployeeName,
    preferredName:row.PreferredName||null,
    departmentName:row.DepartmentName,
    roleName:row.RoleName,
    currentHourlyRate:Number((Number(row.AnnualSalary||0)/2080).toFixed(2)),
    isActive:Boolean(row.IsActive),
    source:"synthetic-directory"
  };
}

function matchRank(candidate,needle){
  const value=candidate.employeeName.toLowerCase();
  const preferred=candidate.preferredName?.toLowerCase()||"";
  const normalized=needle.toLowerCase();
  if(value===normalized||preferred===normalized) return 0;
  if(value.startsWith(`${normalized} `)||preferred.startsWith(`${normalized} `)) return 1;
  return 2;
}

export function searchEmployeeProfiles(query,{currentRate=null}={}){
  const cleaned=cleanQuery(query);
  currentRate=currentRate===undefined||currentRate===null?null:Number(currentRate);
  const needle=cleaned.toLowerCase();
  const pattern=`%${needle}%`;
  const rows=getSqliteDatabase().prepare(`
    SELECT e.EmployeeNumber,e.FirstName||' '||e.LastName AS EmployeeName,
           e.PreferredName,e.IsActive,e.AnnualSalary,d.DepartmentName,r.RoleName
    FROM Employees e
    JOIN Departments d ON d.DepartmentId=e.DepartmentId
    JOIN Roles r ON r.RoleId=e.RoleId
    WHERE e.IsActive=1
      AND (
        lower(e.FirstName||' '||e.LastName) LIKE ?
        OR lower(COALESCE(e.PreferredName,'')) LIKE ?
        OR lower(e.EmployeeNumber) LIKE ?
        OR lower(COALESCE(e.Email,'')) LIKE ?
      )
    ORDER BY e.LastName,e.FirstName,e.EmployeeNumber
    LIMIT 20`).all(pattern,pattern,pattern,pattern);

  const databaseCandidates=rows.map(candidateFromRow).filter((candidate)=>
    currentRate===null||Math.abs(candidate.currentHourlyRate-Number(currentRate))<0.005
  );
  const syntheticCandidates=SYNTHETIC_PROFILES.filter((candidate)=>
    candidate.employeeName.toLowerCase().includes(needle)||
    candidate.preferredName.toLowerCase().includes(needle)||
    candidate.employeeId.toLowerCase()===needle||
    candidate.employeeNumber.toLowerCase()===needle
  );
  const byId=new Map();
  for(const candidate of [...syntheticCandidates,...databaseCandidates]) byId.set(candidate.employeeId,candidate);
  const candidates=[...byId.values()].filter((candidate)=>
    currentRate===null||Math.abs(candidate.currentHourlyRate-Number(currentRate))<0.005
  ).sort((left,right)=>
    matchRank(left,cleaned)-matchRank(right,cleaned)||left.employeeName.localeCompare(right.employeeName)||left.employeeId.localeCompare(right.employeeId)
  );

  return {
    status:candidates.length===0?"NOT_FOUND":candidates.length===1?"MATCHED":"AMBIGUOUS",
    query:cleaned,
    currentRate:currentRate===null?null:Number(currentRate),
    candidates
  };
}

export function candidateIsAllowed(candidates,employeeId){
  return Array.isArray(candidates)&&candidates.find((candidate)=>candidate.employeeId===employeeId)||null;
}

export {MAX_QUERY_LENGTH,SYNTHETIC_PROFILES};
