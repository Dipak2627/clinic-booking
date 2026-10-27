// Shared toJSON options: expose `id` instead of `_id`, drop `__v`.
export const jsonOptions = {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
};
