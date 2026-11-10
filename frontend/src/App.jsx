import { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import DateFilter from "./components/DateFilter.jsx";
import TimeEntriesTable from "./components/TimeEntriesTable.jsx";
import EmployeeScorecards from "./components/EmployeeScorecards.jsx";
import ProjectScorecards from "./components/ProjectScorecards.jsx";
import PayrollDashboard from "./components/PayrollDashboard.jsx";
import OperationsSummary from "./components/OperationsSummary.jsx";

export default function App() {
    const [entries, setEntries] = useState([]);
    const [status, setStatus] = useState("");
    const [search, setSearch] = useState("");
    const [date, setDate] = useState("");
    const [sortBy, setSortBy] = useState("WorkDate");
    const [sortDir, setSortDir] = useState("desc");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const initialView=window.location.hash.replace("#","");
    const [activeView,setActiveView]=useState(["summary","time-entries","employees","projects","payroll"].includes(initialView)?initialView:"summary");

    useEffect(() => {
        const controller=new AbortController();
        setLoading(true);
        const params = new URLSearchParams({page:String(page),pageSize:"25",sortBy,sortDir});
        if(status) params.set("status",status);
        if(search.trim()) params.set("employee",search.trim());
        if(date) params.set("date",date);

        fetch(`/api/time-entries?${params}`,{signal:controller.signal})
            .then((response) => {
                if (!response.ok) throw new Error(`API returned ${response.status}`);
                return response.json();
            })
            .then((result) => {
                // Keep the demo readable if an older backend is still running during a restart.
                const normalized = Array.isArray(result) ? {items:result,totalPages:1} : result;
                if (!normalized || !Array.isArray(normalized.items)) throw new Error("Unexpected API response. Restart the Mockup Software backend.");
                setEntries(normalized.items); setTotalPages(normalized.totalPages || 1); setError("");
            })
            .catch((requestError) => { if(requestError.name!=="AbortError"){setEntries([]);setError(requestError.message);} })
            .finally(() => {if(!controller.signal.aborted)setLoading(false);});
        return ()=>controller.abort();
    }, [status, search, date, sortBy, sortDir, page]);

    const resetFilters=()=>{setStatus("");setSearch("");setDate("");setSortBy("WorkDate");setSortDir("desc");setPage(1);};
    const changeSort=(column)=>{setPage(1);if(sortBy===column)setSortDir((direction)=>direction==="asc"?"desc":"asc");else{setSortBy(column);setSortDir("asc");}};
    const changeFilter=(setter)=>(value)=>{setter(value);setPage(1);};
    const navigate=(view)=>{setActiveView(view);window.history.replaceState(null,"",`#${view}`);};

    return (
        <div className="app-shell">
            <Header />
            <div className="body-layout">
                <Sidebar activeView={activeView} onNavigate={navigate} />
                <main className="main-content">
                    {activeView==="summary"?<OperationsSummary/>:null}
                    {activeView==="time-entries"?<>
                        <div className="section-heading compact-heading"><div><span className="eyebrow">Operations</span><h1>Time-entry review</h1><p>Search, filter, sort, and inspect the synthetic SQLite time-entry record.</p></div></div>
                        <DateFilter status={status} setStatus={changeFilter(setStatus)} search={search} setSearch={changeFilter(setSearch)} date={date} setDate={changeFilter(setDate)} onReset={resetFilters} />
                        <TimeEntriesTable entries={entries} loading={loading} sortBy={sortBy} sortDir={sortDir} onSort={changeSort} page={page} totalPages={totalPages} onPageChange={setPage} />
                    </>:null}
                    {activeView==="employees"?<EmployeeScorecards/>:null}
                    {activeView==="projects"?<ProjectScorecards/>:null}
                    {activeView==="payroll"?<PayrollDashboard/>:null}
                </main>
            </div>
        </div>
    );
}
