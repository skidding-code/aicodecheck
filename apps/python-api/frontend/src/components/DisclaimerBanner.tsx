export function DisclaimerBanner() {
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
      <strong className="font-semibold">Heads up:</strong> AI detection is{" "}
      <em>probabilistic and never proof</em>. Results are estimates that can be
      wrong in both directions. Do not use them to penalize people or make
      high-stakes decisions.
    </div>
  );
}
