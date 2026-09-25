const clean = (value, max) => String(value ?? '').trim().slice(0, max);

export function normalizeItems(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 30) throw Error('Add 1 to 30 charges');
  return input.map(item => {
    const description = clean(item.description, 140);
    const type = clean(item.type || 'Treatment', 20);
    const legacy = item.quantity == null && item.unit_price_paise == null;
    const quantity = legacy ? 1 : Number(item.quantity);
    const unit_price_paise = legacy ? Number(item.amount_paise) : Number(item.unit_price_paise);
    if (!['Medicine','Treatment','Service'].includes(type)) throw Error('Select a valid item type');
    if (!description) throw Error('Enter a medicine, treatment or service name');
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw Error('Enter a valid quantity');
    if (!Number.isSafeInteger(unit_price_paise) || unit_price_paise < 0 || unit_price_paise > 100000000) throw Error('Enter a valid unit price');
    const amount_paise = quantity * unit_price_paise;
    if (!Number.isSafeInteger(amount_paise) || amount_paise > 1000000000) throw Error('Line amount is too large');
    return { type, description, quantity, unit_price_paise, amount_paise };
  });
}
