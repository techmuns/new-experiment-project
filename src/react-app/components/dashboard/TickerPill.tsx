/** Active-ticker pill, shown in the header only when a ticker is selected. */
export function TickerPill({
  ticker,
  company,
}: {
  ticker: string;
  company?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        background: "#eef2ff",
        color: "#4338ca",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 600,
        border: "1px solid #e0e7ff",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          background: "#6366f1",
          borderRadius: "50%",
        }}
      />
      {ticker}
      {company && (
        <span style={{ color: "#818cf8", fontWeight: 400 }}>- {company}</span>
      )}
    </span>
  );
}
