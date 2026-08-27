export default function Loading() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar" />
        <div className="content">
          <div className="skeleton" style={{ width: 130, height: 12, marginBottom: 14 }} />
          <div
            className="skeleton"
            style={{ width: "min(460px,80%)", height: 48, marginBottom: 12 }}
          />
          <div
            className="skeleton"
            style={{ width: "min(600px,90%)", height: 17, marginBottom: 32 }}
          />
          <div className="dashboard-grid">
            <div className="skeleton" style={{ height: 320 }} />
            <div className="skeleton" style={{ height: 320 }} />
          </div>
        </div>
      </main>
    </div>
  );
}
