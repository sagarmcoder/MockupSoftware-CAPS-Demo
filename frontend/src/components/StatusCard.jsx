export default function StatusCard({ loading, error, rowCount }) {
  return (
    <article className="card status-card">
      <h2>Connection Status</h2>
      {error ? <p className="error">API error: {error}</p> : <p>{loading ? "Loading…" : "Connected to the API"}</p>}
      <p className="muted">Rows received as JSON: {rowCount}</p>
    </article>
  );
}

