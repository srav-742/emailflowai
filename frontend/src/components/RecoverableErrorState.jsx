const RecoverableErrorState = ({
  title = 'Something went wrong',
  message = 'Please try again.',
  retryLabel = 'Try again',
  onRetry,
  secondaryLabel = null,
  onSecondaryAction = null,
}) => {
  return (
    <div className="surface-card" style={{ padding: '2rem', textAlign: 'center' }}>
      <span className="eyebrow" style={{ color: 'var(--danger)' }}>Recovery mode</span>
      <h3 style={{ marginTop: '0.6rem', marginBottom: '0.75rem' }}>{title}</h3>
      <p style={{ color: 'var(--text-dim)', margin: '0 auto 1.5rem', maxWidth: '40rem' }}>{message}</p>

      <div className="button-row" style={{ justifyContent: 'center' }}>
        {typeof onRetry === 'function' ? (
          <button className="button button-primary" onClick={onRetry}>
            {retryLabel}
          </button>
        ) : null}
        {secondaryLabel && typeof onSecondaryAction === 'function' ? (
          <button className="button button-secondary" onClick={onSecondaryAction}>
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default RecoverableErrorState;
