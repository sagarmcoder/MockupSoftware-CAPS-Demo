export default function DateFilter({ status, setStatus, search, setSearch, date, setDate, onReset }) {
    return (
        <section className="filters" aria-label="Time entry filters">
            <label>
                Employee search
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type a name" />
            </label>
            <label>
                Entry status
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="">All statuses</option>
                    <option value="Approved">Approved</option>
                    <option value="Pending">Pending</option>
                    <option value="Rejected">Rejected</option>
                </select>
            </label>
            <label>
                Practice date
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <button type="button" className="secondary-button" onClick={onReset}>Clear filters</button>
        </section>
    );
}
