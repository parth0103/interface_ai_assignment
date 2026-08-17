import express from "express";
import { findMembersById, getMemberByRecordId } from "./data.js";
import { renderDashboard, renderMember, renderOfferTerms, renderOffers, renderReview, renderSearch } from "./render.js";

export function createLoanPortalApp(): express.Express {
  const app = express();

  app.get("/", (_request, response) => response.send(renderDashboard()));

  app.get("/members/search", (request, response) => {
    const memberId = typeof request.query.memberId === "string" ? request.query.memberId.trim() : "";
    response.send(renderSearch(memberId, memberId ? findMembersById(memberId) : []));
  });

  app.get("/members/:recordId", (request, response) => {
    const member = getMemberByRecordId(request.params.recordId);
    if (!member) return response.status(404).send("Member record not found");
    return response.send(renderMember(member));
  });

  app.get("/members/:recordId/offers", (request, response) => {
    const member = getMemberByRecordId(request.params.recordId);
    if (!member) return response.status(404).send("Member record not found");
    return response.send(renderOffers(member));
  });

  app.get("/members/:recordId/offers/:offerId", (request, response) => {
    const member = getMemberByRecordId(request.params.recordId);
    const offer = member?.offers.find((candidate) => candidate.offerId === request.params.offerId);
    if (!member || !offer) return response.status(404).send("Offer not found");
    return response.send(renderOfferTerms(member, offer));
  });

  app.get("/members/:recordId/offers/:offerId/review", (request, response) => {
    const member = getMemberByRecordId(request.params.recordId);
    const offer = member?.offers.find((candidate) => candidate.offerId === request.params.offerId);
    if (!member || !offer) return response.status(404).send("Offer not found");
    const vehicleType = typeof request.query.vehicleType === "string" ? request.query.vehicleType : "";
    if (!vehicleType) return response.status(400).send("Vehicle type is required");
    return response.send(renderReview(member, offer, vehicleType));
  });

  return app;
}
