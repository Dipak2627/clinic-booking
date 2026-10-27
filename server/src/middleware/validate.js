import { badRequest } from '../utils/errors.js';

/**
 * Validate request parts with zod schemas.
 *   validate({ params, query, body })
 * Parsed (coerced / trimmed / defaulted) values land on `req.valid.<part>`;
 * the raw req.body / req.query are never trusted afterwards.
 */
export const validate = (schemas) => (req, _res, next) => {
  const valid = {};
  const details = [];

  for (const part of ['params', 'query', 'body']) {
    const schema = schemas[part];
    if (!schema) continue;

    const result = schema.safeParse(req[part] ?? {});
    if (result.success) {
      valid[part] = result.data;
    } else {
      for (const issue of result.error.issues) {
        details.push({ location: part, field: issue.path.join('.'), message: issue.message });
      }
    }
  }

  if (details.length > 0) {
    return next(badRequest('VALIDATION_ERROR', 'Request validation failed', details));
  }

  req.valid = valid;
  return next();
};
