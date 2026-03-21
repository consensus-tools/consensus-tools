const $ = (sel) => document.querySelector(sel);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let selectedTier = null;
let currentRunId = null;
let processing = false;
let sseSource = null;

// ── Init ─────────────────────────────────────────────────────────────

(async function init() {
  const res = await fetch("/api/tiers");
  if (res.ok) {
    const tiers = await res.json();
    renderTiers(tiers);
  }
  connectSSE();
})();

function connectSSE() {
  if (sseSource) sseSource.close();
  sseSource = new EventSource("/api/telemetry/stream");
  sseSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      appendTelemetryEvent(event);
      if (event.type.startsWith("ledger.")) refreshReputation();
    } catch {}
  };
}

// ── Tier Selection ───────────────────────────────────────────────────

function renderTiers(tiers) {
  const list = $("#tier-list");
  list.innerHTML = tiers
    .map(
      (t) => `
    <div class="tier-card ${t.id === selectedTier ? "selected" : ""}" data-tier="${escapeHtml(t.id)}">
      <div class="tier-name">${escapeHtml(t.name)}</div>
      <div class="tier-meta">${t.guardCount} guards | threshold ${(t.riskThreshold * 100).toFixed(0)}%</div>
    </div>
  `
    )
    .join("");
  list.addEventListener("click", (e) => {
    const card = e.target.closest(".tier-card");
    if (card) window.selectTier(card.dataset.tier);
  });
}

window.selectTier = function (tier) {
  if (processing) return;
  selectedTier = tier;
  document.querySelectorAll(".tier-card").forEach((el) => {
    el.classList.toggle("selected", el.dataset.tier === tier);
  });
  $("#btn-run").disabled = false;
};

// ── Run ──────────────────────────────────────────────────────────────

$("#btn-run").addEventListener("click", runScenario);
$("#btn-reset").addEventListener("click", resetAll);

async function runScenario() {
  if (!selectedTier || processing) return;

  processing = true;
  $("#btn-run").disabled = true;
  $("#btn-run").textContent = "Running...";
  $("#scenario-content").innerHTML = '<div class="progress-indicator"><div class="progress-step active">Generating transaction...</div></div>';
  $("#response-content").innerHTML = '<div class="progress-indicator"><div class="progress-step">Waiting for transaction...</div></div>';
  $("#decision-content").innerHTML = '<div class="progress-indicator"><div class="progress-step">Waiting for verdict...</div></div>';

  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riskTier: selectedTier }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert("Error: " + err.error);
      return;
    }

    const data = await res.json();
    currentRunId = data.runId;
    await stageReveal(data);
    await refreshReputation();
  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    processing = false;
    $("#btn-run").disabled = false;
    $("#btn-run").textContent = "Run";
  }
}

// ── Staged Reveal ────────────────────────────────────────────────────
// Show each step with a pause so the user can follow the flow.

async function stageReveal(data) {
  const cycles = data.cycles || [];

  // Step 1: Show scenario as incoming email
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  $("#scenario-content").innerHTML = `
    <div class="email-envelope fade-in">
      <div class="email-header">
        <div class="email-avatar email-avatar-customer">T</div>
        <div>
          <div class="email-from">Transaction Event</div>
          <div class="email-to">To: decisioning-pipeline@paystream.io</div>
          <div class="email-subject">Subject: Transaction Review — ${escapeHtml(data.riskTier)} risk</div>
        </div>
        <div class="email-time">${now}</div>
      </div>
      <div class="email-body">${escapeHtml(data.scenario)}</div>
      <div class="email-meta">Run: ${data.runId} | Risk tier: ${data.riskTier}</div>
    </div>
  `;

  // Clear panels for the staged flow
  $("#response-content").innerHTML = "";
  $("#decision-content").innerHTML = "";

  // Step 2: Walk through each cycle (initial + rewrites)
  for (let i = 0; i < cycles.length; i++) {
    const cycle = cycles[i];
    const isInitial = cycle.cycle === 0;
    const isLast = i === cycles.length - 1;
    const gr = cycle.guardResult;

    // 2a: Show response for this cycle
    if (isInitial) {
      $("#response-content").innerHTML = '<div class="progress-indicator"><div class="progress-step active">Agent pipeline evaluating transaction...</div></div>';
      await delay(2000);
    } else {
      // Rewrite indicator
      const rewriteNotice = document.createElement("div");
      rewriteNotice.className = "rewrite-notice fade-in";
      rewriteNotice.innerHTML = `<span class="rewrite-label">Rewrite #${cycle.cycle}</span> Agent incorporating guard feedback...`;
      $("#response-content").appendChild(rewriteNotice);
      await delay(2000);
    }

    const responseBlock = document.createElement("div");
    responseBlock.className = "email-envelope response-cycle fade-in";
    const replyTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    let headerHtml = "";
    if (!isInitial) {
      headerHtml = `<div class="cycle-header">Rewrite #${cycle.cycle}</div>`;
    }
    responseBlock.innerHTML = `
      ${headerHtml}
      <div class="email-header">
        <div class="email-avatar email-avatar-agent">A</div>
        <div>
          <div class="email-from">Agent Pipeline${!isInitial ? " (revised)" : ""}</div>
          <div class="email-to">To: governance-board</div>
        </div>
        <div class="email-time">${replyTime}</div>
      </div>
      <div class="email-body">${escapeHtml(cycle.response)}</div>
    `;
    if (isInitial) {
      $("#response-content").innerHTML = "";
    }
    $("#response-content").appendChild(responseBlock);

    // 2b: Show guard evaluation for this cycle
    if (isInitial) {
      $("#decision-content").innerHTML = '<div class="progress-indicator"><div class="progress-step active">Guards evaluating response...</div></div>';
    } else {
      const reEvalNotice = document.createElement("div");
      reEvalNotice.className = "guard-re-eval-notice fade-in";
      reEvalNotice.textContent = `Re-evaluating rewrite #${cycle.cycle}...`;
      $("#decision-content").appendChild(reEvalNotice);
    }
    await delay(2000);

    // Create a section for this cycle's guard votes
    const cycleSection = document.createElement("div");
    cycleSection.className = "guard-cycle-section fade-in";
    if (!isInitial) {
      cycleSection.innerHTML = `<div class="cycle-divider">Cycle ${cycle.cycle + 1} — Guard Re-evaluation</div>`;
    } else if (cycles.length > 1) {
      cycleSection.innerHTML = `<div class="cycle-divider">Cycle 1 — Initial Evaluation</div>`;
    }

    // Remove progress indicator on first cycle
    if (isInitial) {
      $("#decision-content").innerHTML = "";
    }
    $("#decision-content").appendChild(cycleSection);

    // Show individual votes one by one
    const votesContainer = document.createElement("div");
    votesContainer.className = "guard-votes";
    cycleSection.appendChild(votesContainer);

    for (const vote of gr.votes) {
      const voteClass = vote.vote === "YES" ? "vote-yes" : vote.vote === "NO" ? "vote-no" : "vote-rewrite";
      const card = document.createElement("div");
      card.className = "guard-vote-card fade-in";
      card.innerHTML = `
        <div class="guard-vote-header">
          <span class="guard-vote-name">${formatGuardName(vote.evaluator)}</span>
          <span class="guard-vote-badge ${voteClass}">${vote.vote}</span>
          <span class="guard-vote-risk">risk ${(vote.risk * 100).toFixed(0)}%</span>
        </div>
        <div class="guard-vote-reason">${escapeHtml(vote.reason)}</div>
      `;
      votesContainer.appendChild(card);
      await delay(800);
    }

    await delay(1600);

    // Show this cycle's decision
    const cycleDecision = isLast ? data.decision : gr.decision;
    const decisionClass = {
      ALLOW: "decision-allow",
      BLOCK: "decision-block",
      REWRITE: "decision-rewrite",
      REQUIRE_HUMAN: "decision-hitl",
    }[cycleDecision] || "";

    const decisionEl = document.createElement("div");
    decisionEl.className = "cycle-decision fade-in";
    decisionEl.innerHTML = `
      <div class="decision-badge ${decisionClass}">${cycleDecision}</div>
      <div class="decision-meta">
        Combined risk: ${(gr.combinedRisk * 100).toFixed(0)}% |
        Quorum: ${gr.quorumMet ? "met" : "not met"} |
        YES ratio: ${(gr.tally.weightedYes / (gr.tally.totalWeight || 1) * 100).toFixed(0)}%
      </div>
    `;
    cycleSection.appendChild(decisionEl);

    // If not last cycle, pause before showing the rewrite
    if (!isLast) {
      await delay(2000);
    }
  }

  // Step 3: Final state actions
  // Show rewrite count badge on the response panel
  if (data.rewriteCount > 0) {
    const badge = document.createElement("div");
    badge.className = "rewrite-badge fade-in";
    badge.textContent = `Rewritten ${data.rewriteCount}x`;
    $("#response-content").appendChild(badge);
  }

  // If ALLOW, show flag button
  if (data.resolved && data.decision === "ALLOW" && !data.flaggedBad) {
    await delay(1000);
    const flagBtn = document.createElement("button");
    flagBtn.className = "btn-flag-bad fade-in";
    flagBtn.textContent = "Bad Response";
    flagBtn.onclick = () => window.flagBad(data.runId);
    $("#response-content").appendChild(flagBtn);
  }

  // If HITL, wait then show Slack dialog
  if (data.decision === "REQUIRE_HUMAN" && data.hitlMessage) {
    await delay(4000);
    showSlackDialog(data.hitlMessage, data.runId, data);
  }
}

// ── Render Result (instant, for HITL re-renders) ─────────────────────

function renderResult(data) {
  const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  $("#scenario-content").innerHTML = `
    <div class="email-envelope">
      <div class="email-header">
        <div class="email-avatar email-avatar-customer">T</div>
        <div>
          <div class="email-from">Transaction Event</div>
          <div class="email-to">To: decisioning-pipeline@paystream.io</div>
        </div>
        <div class="email-time">${t}</div>
      </div>
      <div class="email-body">${escapeHtml(data.scenario)}</div>
      <div class="email-meta">Run: ${data.runId} | Risk tier: ${data.riskTier}</div>
    </div>
  `;

  let responseHtml = `
    <div class="email-envelope">
      <div class="email-header">
        <div class="email-avatar email-avatar-agent">A</div>
        <div>
          <div class="email-from">Agent Pipeline${data.rewriteCount > 0 ? " (revised)" : ""}</div>
          <div class="email-to">To: governance-board</div>
        </div>
        <div class="email-time">${t}</div>
      </div>
      <div class="email-body">${escapeHtml(data.currentResponse)}</div>
    </div>
  `;
  if (data.rewriteCount > 0) {
    responseHtml += `<div class="rewrite-badge">Rewritten ${data.rewriteCount}x</div>`;
  }
  if (data.resolved && data.decision === "ALLOW" && !data.flaggedBad) {
    responseHtml += `<button class="btn-flag-bad" onclick="window.flagBad('${data.runId}')">Bad Response</button>`;
  }
  $("#response-content").innerHTML = responseHtml;

  renderGuardDecision(data);

  if (data.decision === "REQUIRE_HUMAN" && data.hitlMessage) {
    showSlackDialog(data.hitlMessage, data.runId, data);
  }
}

function renderGuardDecision(data) {
  const gr = data.guardResult;
  const decisionClass = {
    ALLOW: "decision-allow",
    BLOCK: "decision-block",
    REWRITE: "decision-rewrite",
    REQUIRE_HUMAN: "decision-hitl",
  }[data.decision] || "";

  let html = `
    <div class="decision-badge ${decisionClass}">${data.decision}</div>
    <div class="decision-meta">
      Combined risk: ${((gr.combinedRisk ?? 0) * 100).toFixed(0)}% |
      Quorum: ${gr.quorumMet ? "met" : "not met"} |
      YES ratio: ${((gr.tally?.weightedYes ?? 0) / (gr.tally?.totalWeight || 1) * 100).toFixed(0)}%
    </div>
  `;

  // Individual guard votes
  html += '<div class="guard-votes">';
  for (const vote of (gr.votes || [])) {
    const voteClass = vote.vote === "YES" ? "vote-yes" : vote.vote === "NO" ? "vote-no" : "vote-rewrite";
    html += `
      <div class="guard-vote-card">
        <div class="guard-vote-header">
          <span class="guard-vote-name">${formatGuardName(vote.evaluator)}</span>
          <span class="guard-vote-badge ${voteClass}">${vote.vote}</span>
          <span class="guard-vote-risk">risk ${(vote.risk * 100).toFixed(0)}%</span>
        </div>
        <div class="guard-vote-reason">${escapeHtml(vote.reason)}</div>
      </div>
    `;
  }
  html += "</div>";

  $("#decision-content").innerHTML = html;
}

// ── HITL Slack Dialog ────────────────────────────────────────────────

function showSlackDialog(hitlMessage, runId, data) {
  currentRunId = runId;
  const body = $("#slack-body");
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  let contextHtml = "";

  if (data) {
    // Transaction details card
    if (data.scenario) {
      contextHtml += `
        <div class="slack-context-label">Transaction Details</div>
        <div class="slack-context-card">
          <div class="email-avatar email-avatar-customer">T</div>
          <div>
            <div class="slack-context-from">Transaction Event</div>
            <div class="slack-context-text">${escapeHtml(data.scenario)}</div>
          </div>
        </div>
      `;
    }

    // Agent verdict card
    const agentResponse = data.currentResponse || (data.cycles && data.cycles.length > 0 ? data.cycles[data.cycles.length - 1].response : null);
    if (agentResponse) {
      contextHtml += `
        <div class="slack-context-label">Agent Verdict</div>
        <div class="slack-context-card">
          <div class="email-avatar email-avatar-agent">A</div>
          <div>
            <div class="slack-context-from">Agent Pipeline${data.rewriteCount > 0 ? " (revised)" : ""}</div>
            <div class="slack-context-text">${escapeHtml(agentResponse)}</div>
          </div>
        </div>
      `;
    }
  }

  // Guard verdict with vote badges
  const lines = hitlMessage.text.split("\n").filter(Boolean);
  let voteBadgesHtml = "";
  if (data && data.guardResult && data.guardResult.votes) {
    voteBadgesHtml = data.guardResult.votes.map((v) => {
      const cls = v.vote === "YES" ? "vote-yes" : v.vote === "NO" ? "vote-no" : "vote-rewrite";
      return `<span class="guard-vote-badge ${cls}" style="margin-right:0.3rem;">${formatGuardName(v.evaluator)}: ${v.vote}</span>`;
    }).join("");
  }

  body.innerHTML = `
    ${contextHtml}
    <div class="slack-context-label">Guard Verdict</div>
    <div class="slack-message">
      <div class="slack-avatar">G</div>
      <div class="slack-content">
        <div class="slack-sender">${hitlMessage.sender} <span class="slack-time">${now}</span></div>
        <div class="slack-text">${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}</div>
        ${voteBadgesHtml ? `<div style="margin-top:0.4rem;">${voteBadgesHtml}</div>` : ""}
      </div>
    </div>
  `;

  $("#slack-dialog").showModal();
}

window.hitlRespond = async function (decision) {
  if (!currentRunId) return;

  const btns = document.querySelectorAll(".slack-btn");
  btns.forEach((b) => (b.disabled = true));

  try {
    const res = await fetch("/api/hitl-respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: currentRunId, decision }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert("Error: " + err.error);
      btns.forEach((b) => (b.disabled = false));
      return;
    }

    const data = await res.json();
    $("#slack-dialog").close();

    // Re-render with updated data
    renderResult({
      runId: data.runId,
      riskTier: selectedTier,
      scenario: data.scenario || "",
      csResponse: data.currentResponse,
      currentResponse: data.currentResponse,
      decision: data.decision,
      guardResult: data.guardResult || {},
      rewriteCount: data.rewriteCount,
      resolved: data.resolved,
      hitlMessage: data.hitlMessage,
    });

    await refreshReputation();
  } catch (err) {
    alert("Error: " + err.message);
    btns.forEach((b) => (b.disabled = false));
  }
};

// ── Flag Bad Response ────────────────────────────────────────────────

window.flagBad = async function (runId) {
  if (!confirm("Flag this response as bad? Guards who approved it will be slashed.")) return;

  const res = await fetch("/api/flag-bad", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId }),
  });

  if (!res.ok) {
    const err = await res.json();
    alert("Error: " + err.error);
    return;
  }

  // Remove the flag button and show flagged state
  const btn = $(".btn-flag-bad");
  if (btn) btn.replaceWith(Object.assign(document.createElement("div"), { className: "flagged-badge", textContent: "Flagged as bad response" }));

  await refreshReputation();
};

// ── Reputation ───────────────────────────────────────────────────────

async function refreshReputation() {
  const res = await fetch("/api/reputation");
  if (!res.ok) return;
  const reps = await res.json();

  const panel = $("#reputation-content");
  if (!reps || reps.length === 0) {
    panel.innerHTML = '<p class="placeholder">No guards registered.</p>';
    return;
  }

  panel.innerHTML = reps
    .map((r) => {
      const delta = r.reputation - 100;
      const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
      const repClass = r.reputation < 90 ? "rep-low" : r.reputation > 100 ? "rep-high" : "rep-normal";
      return `
        <div class="rep-card">
          <div class="rep-name">${r.guardName}</div>
          <div class="rep-stats">
            <span class="rep-score ${repClass}">${r.reputation}</span>
            <span class="rep-delta">(${deltaStr})</span>
          </div>
        </div>
      `;
    })
    .join("");
}

// ── Telemetry ────────────────────────────────────────────────────────

function appendTelemetryEvent(event) {
  const panel = $("#telemetry-content");
  const placeholder = panel.querySelector(".placeholder");
  if (placeholder) panel.innerHTML = "";

  const div = document.createElement("div");
  div.className = "telemetry-entry";

  const typeClass = `telemetry-${event.type.replace(".", "-")}`;
  const meta = event.metadata || {};
  let desc = "";
  if (meta.step) desc += meta.step;
  if (meta.evaluator) desc += ` ${formatGuardName(meta.evaluator)}`;
  if (meta.vote) desc += ` ${meta.vote}`;
  if (meta.decision) desc += ` ${meta.decision}`;
  if (meta.amount) desc += ` ${meta.amount > 0 ? "+" : ""}${meta.amount}`;
  if (meta.guardName) desc += ` ${formatGuardName(meta.guardName)}`;
  if (meta.cycle) desc += ` (cycle ${meta.cycle})`;

  div.innerHTML = `
    <span class="telemetry-badge ${typeClass}">${event.type}</span>
    <span class="telemetry-desc">${desc}</span>
  `;

  panel.prepend(div);
  while (panel.children.length > 200) panel.removeChild(panel.lastChild);
}

// ── Export Telemetry ─────────────────────────────────────────────────

window.exportTelemetry = async function () {
  const res = await fetch("/api/telemetry/export");
  if (!res.ok) {
    alert("No telemetry data to export yet.");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "telemetry.json";
  a.click();
  URL.revokeObjectURL(url);
};

// ── Reset ────────────────────────────────────────────────────────────

async function resetAll() {
  await fetch("/api/reset", { method: "POST" });
  currentRunId = null;
  selectedTier = null;
  processing = false;
  document.querySelectorAll(".tier-card").forEach((el) => el.classList.remove("selected"));
  $("#btn-run").disabled = true;
  $("#btn-run").textContent = "Run";
  $("#scenario-content").innerHTML = '<p class="placeholder">Select a transaction risk tier and click Run.</p>';
  $("#response-content").innerHTML = '<p class="placeholder">Agent verdict will appear here.</p>';
  $("#decision-content").innerHTML = '<p class="placeholder">Governance evaluation results will appear here.</p>';
  $("#reputation-content").innerHTML = '<p class="placeholder">Run a transaction to see reputation.</p>';
  $("#telemetry-content").innerHTML = '<p class="placeholder">No events yet.</p>';
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatGuardName(id) {
  return id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
