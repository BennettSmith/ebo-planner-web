import { z } from "zod";

export const RSVPResponseSchema = z.enum(["YES", "NO", "UNSET"]);
export type RSVPResponse = z.infer<typeof RSVPResponseSchema>;

export const TripStatusSchema = z.enum(["DRAFT", "PUBLISHED", "CANCELED"]);

export const UpcomingTripsTripSchema = z.object({
  tripId: z.string(),
  name: z.string().nullable(),
  startDate: z.string().nullable(), // OpenAPI: format "date"
  endDate: z.string().nullable(), // OpenAPI: format "date"
  status: TripStatusSchema,
  myRsvpResponse: RSVPResponseSchema,
});

export const UpcomingTripsPageModelSchema = z.object({
  trips: z.array(UpcomingTripsTripSchema),
});

export type UpcomingTripsPageModel = z.infer<typeof UpcomingTripsPageModelSchema>;

export const SetMyRsvpRequestSchema = z.object({
  response: RSVPResponseSchema,
});

export type SetMyRsvpRequest = z.infer<typeof SetMyRsvpRequestSchema>;


