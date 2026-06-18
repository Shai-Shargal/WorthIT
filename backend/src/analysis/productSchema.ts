import { z } from 'zod';

export const productSchema = z.object({
  title: z.string().trim().min(1).max(300),
  price: z.number().finite().positive(),
  currency: z.string().trim().min(1).max(8),
  description: z.string().trim().max(5000).optional(),
  url: z.string().url().optional(),
  image: z.string().url().optional(),
});

export type ProductSchemaInput = z.infer<typeof productSchema>;
