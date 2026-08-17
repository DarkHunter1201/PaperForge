export function Loading({ label = 'Загрузка данных' }: { label?: string }) {
  return (
    <div className="loading-state">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}
