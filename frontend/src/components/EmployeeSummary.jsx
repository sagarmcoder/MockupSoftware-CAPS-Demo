export default function EmployeeSummary({ entries, subtitle }) {
    const totalHours = entries.reduce((sum, entry) => sum + Number(entry.HoursWorked || 0), 0);

    return (
        <article className="card summary-panel" id="summary">
            <h2>Visible Time Entry Summary</h2>
            <div className="metric-row">
                <div><span className="metric-label">Rows</span><strong>{entries.length}</strong></div>
                <div><span className="metric-label">Hours</span><strong>{totalHours.toFixed(1)}</strong></div>
            </div>
            <p className="muted">{subtitle}</p>
        </article>
    );
}

