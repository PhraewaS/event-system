import { z } from "zod";

export const loginInput = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(256),
  })
  .strict();
