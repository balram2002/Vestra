import { z } from 'zod';

import { fieldsOf } from './config';
import type { FieldDef, PageDesignDefinition } from './types';

/**
 * The validation schema for one page design, built from its definition.
 *
 * Built rather than written, so a field cannot exist on the screen and be
 * missing from the check -- the mistake that, written by hand, rejects every
 * save the moment someone adds a switch.
 */
function fieldSchema(field: FieldDef): z.ZodTypeAny {
  switch (field.kind) {
    case 'toggle':
      return z.boolean();
    case 'text':
      return z.string().trim().max(field.maxLength);
    case 'choice':
      return z.enum(field.options.map((option) => option.value) as [string, ...string[]]);
  }
}

export function designConfigSchema(definition: PageDesignDefinition) {
  const settings = z.object(
    Object.fromEntries(fieldsOf(definition).map((field) => [field.key, fieldSchema(field)])),
  );

  return z.object({
    variant: z.enum(definition.variants as unknown as [string, ...string[]]),
    settings: z.object(
      Object.fromEntries(definition.variants.map((variant) => [variant, settings])),
    ),
  });
}
