import { UpcomingTripsPageModelSchema, type RSVPResponse, type UpcomingTripsPageModel } from "../../shared/contracts";
import { fetchJson } from "./http";

export async function getUpcomingTripsPage(): Promise<UpcomingTripsPageModel> {
  const json = await fetchJson("/api/pages/upcoming-trips");
  return UpcomingTripsPageModelSchema.parse(json);
}

export async function setUpcomingTripsRsvp(tripId: string, response: RSVPResponse): Promise<UpcomingTripsPageModel> {
  const json = await fetchJson(`/api/pages/upcoming-trips/${encodeURIComponent(tripId)}/rsvp`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ response }),
  });
  return UpcomingTripsPageModelSchema.parse(json);
}


