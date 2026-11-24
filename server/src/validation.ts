import { z } from "zod";
export const uuid = z.uuid();
export const loginInput = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(256),
  })
  .strict();
export const publishInput = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(4000),
    location: z.string().trim().min(2, {
      message: "Location must contain at least 2 non-whitespace characters.",
    }).max(200),
    capacity: z.number().int().min(1).max(1000000),
    startsAt: z.iso.datetime({ offset: true }),
    registrationDeadline: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine((v) => Date.parse(v.registrationDeadline) <= Date.parse(v.startsAt), {
    message: "Registration must close no later than the event starts.",
    path: ["registrationDeadline"],
  });
export const emptyInput = z.object({}).strict();
export const quotaQuery = z.object({
  date: z.string().regex(/^(?!0000)\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, { message: "Use a valid calendar date in YYYY-MM-DD format." }),
}).strict();
export const pageInput = z.object({
  offset: z.coerce.number().int().min(0).max(10000000).default(0),
});
