export default function DashboardLoading() {
  return (
    <main className="main" aria-label="Carregando">
      <div className="skeleton skeleton-title" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton-card"/>
        <div className="skeleton skeleton-card"/>
        <div className="skeleton skeleton-card"/>
        <div className="skeleton skeleton-card"/>
      </div>
      <div className="skeleton skeleton-panel"/>
      <div className="skeleton skeleton-panel"/>
    </main>
  );
}
