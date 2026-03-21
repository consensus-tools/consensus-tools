export function formatHitlMessage(runId, votes, riskScore, threshold) {
  const riskPct = (riskScore * 100).toFixed(0);
  const threshPct = (threshold * 100).toFixed(0);

  const voteLines = votes
    .map((v) => `${v.evaluator}: ${v.vote} (${v.risk.toFixed(2)})\n"${v.reason}"`)
    .join("\n\n");

  return {
    channel: "#transaction-governance",
    sender: "Consensus Guard",
    text:
      `@dana.okafor — Governance review required for transaction ${runId}\n\n` +
      `Risk: ${riskPct}% (threshold: ${threshPct}%)\n\n` +
      `${voteLines}\n\n` +
      `Reply APPROVE, REJECT, or REVISE.`,
  };
}
