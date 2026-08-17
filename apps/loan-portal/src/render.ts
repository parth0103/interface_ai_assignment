import type { LoanOffer, MemberRecord, SearchResult } from "./data.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #f4f6f8; color: #18202a; }
    header { background: #12324a; color: white; padding: 16px 24px; }
    nav { background: #e3e8ee; padding: 10px 24px; }
    nav a, .tab { margin-right: 16px; color: #12324a; font-weight: bold; }
    main { padding: 24px; max-width: 1120px; }
    table { border-collapse: collapse; width: 100%; background: white; }
    th, td { border: 1px solid #c8d1dc; padding: 10px; text-align: left; }
    th { background: #eef3f7; }
    .panel { background: white; border: 1px solid #c8d1dc; padding: 16px; margin-bottom: 16px; }
    .warning { border: 2px solid #a15c00; background: #fff7e6; padding: 12px; margin: 12px 0; }
    button, .button { border: 1px solid #12324a; background: #174966; color: white; padding: 8px 12px; text-decoration: none; cursor: pointer; }
    .danger { background: #8a1f11; }
  </style>
</head>
<body>
  <header><h1>Loan Servicing Portal</h1></header>
  <nav><a href="/">Dashboard</a><a href="/members/search">Member Search</a><a href="/queue">Loan Queue</a></nav>
  <main>${body}</main>
</body>
</html>`;
}

export function renderDashboard(): string {
  return shell("Loan Servicing Portal", `
    <section class="panel">
      <h2>Operator Dashboard</h2>
      <p>Use Member Search to open member servicing records.</p>
      <a class="button" href="/members/search">Member Search</a>
    </section>`);
}

export function renderSearch(memberId = "", results: SearchResult[] = []): string {
  const escapedMemberId = escapeHtml(memberId);
  const rows = results.map((result) => `
    <tr>
      <td>${result.memberId}</td>
      <td>${result.displayName}</td>
      <td>${result.dobHint}</td>
      <td>${result.addressHint}</td>
      <td><a class="button" href="/members/${result.recordId}">Open Member</a></td>
    </tr>`).join("");
  const message = memberId && results.length === 0 ? `<p>No member found for ${escapedMemberId}.</p>` : "";
  return shell("Member Search", `
    <h2>Member Search</h2>
    <form method="get" action="/members/search">
      <label>Member ID <input name="memberId" value="${escapedMemberId}" /></label>
      <button type="submit">Search</button>
    </form>
    ${message}
    ${results.length ? `<table aria-label="Member Results"><thead><tr><th>Member ID</th><th>Name</th><th>DOB Year</th><th>Address Ending</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>` : ""}`);
}

export function renderMember(member: MemberRecord): string {
  return shell("Member Profile", `
    <h2>Member Profile</h2>
    <section class="panel">
      <p>Name: ${member.displayName}</p>
      <p>Member ID: ${member.memberId}</p>
    </section>
    <div role="tablist" aria-label="Member Profile Tabs">
      <a class="tab" role="tab" href="/members/${member.recordId}">Accounts</a>
      <a class="tab" role="tab" href="/members/${member.recordId}/loans">Loans</a>
      <a class="tab" role="tab" href="/members/${member.recordId}/offers">Offers</a>
      <a class="tab" role="tab" href="/members/${member.recordId}/documents">Documents</a>
    </div>`);
}

export function renderOffers(member: MemberRecord): string {
  const warning = member.flags.includes("special_handling_notice")
    ? `<div class="warning">Special handling note requires operator acknowledgement.</div>`
    : "";
  const rows = member.offers.map((offer) => `
    <tr>
      <td>Pre-approved Auto Loan</td>
      <td>${offer.status}</td>
      <td>${offer.maxAmount}</td>
      <td>${offer.apr}</td>
      <td><a class="button" href="/members/${member.recordId}/offers/${offer.offerId}">Open Offer</a></td>
    </tr>`).join("");
  const body = rows
    ? `<table aria-label="Pre-approved Offers"><thead><tr><th>Offer Type</th><th>Status</th><th>Max Amount</th><th>APR</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p>No active pre-approved auto loan offers</p>`;
  return shell("Pre-approved Offers", `<h2>Pre-approved offers</h2>${warning}${body}`);
}

export function renderOfferTerms(member: MemberRecord, offer: LoanOffer): string {
  return shell("Offer Terms", `
    <h2>Offer Terms</h2>
    <table aria-label="Offer Terms">
      <tbody>
        <tr><th>Offer ID</th><td>${offer.offerId}</td></tr>
        <tr><th>APR</th><td>${offer.apr}</td></tr>
        <tr><th>Max Amount</th><td>${offer.maxAmount}</td></tr>
        <tr><th>Term</th><td>${offer.termMonths} months</td></tr>
      </tbody>
    </table>
    <form method="get" action="/members/${member.recordId}/offers/${offer.offerId}/review">
      <label>Vehicle Type
        <select name="vehicleType">
          <option value="">Select vehicle type</option>
          <option value="new">New</option>
          <option value="used">Used</option>
        </select>
      </label>
      <button type="submit">Continue to Review</button>
    </form>`);
}

export function renderReview(member: MemberRecord, offer: LoanOffer, vehicleType: string): string {
  const escapedVehicleType = escapeHtml(vehicleType);
  return shell("Final Review", `
    <h2>Final Review</h2>
    <p>Review Status: Ready for final review</p>
    <table aria-label="Review Summary">
      <tbody>
        <tr><th>Member</th><td>${member.displayName}</td></tr>
        <tr><th>Offer ID</th><td>${offer.offerId}</td></tr>
        <tr><th>APR</th><td>${offer.apr}</td></tr>
        <tr><th>Max Amount</th><td>${offer.maxAmount}</td></tr>
        <tr><th>Term</th><td>${offer.termMonths} months</td></tr>
        <tr><th>Vehicle Type</th><td>${escapedVehicleType}</td></tr>
      </tbody>
    </table>
    <button class="danger" type="button">Submit Final Application</button>`);
}
