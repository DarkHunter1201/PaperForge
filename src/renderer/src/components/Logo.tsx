export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo ${compact ? 'logo-compact' : ''}`}>
      <div className="logo-mark">
        <span />
        <span />
        <span />
      </div>
      {!compact && (
        <div>
          <strong>PaperForge</strong>
          <small>MARKET SIMULATOR</small>
        </div>
      )}
    </div>
  );
}
