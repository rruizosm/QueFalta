export function expandAhorramasPageSize(value, pageSize = 40, previousValue = null) {
  if (!value) return null;
  const url = new URL(value, 'https://www.ahorramas.com');
  url.searchParams.set('sz', String(pageSize));

  if (previousValue) {
    const previousUrl = new URL(previousValue, 'https://www.ahorramas.com');
    const previousStart = Number(previousUrl.searchParams.get('start'));
    const candidateStart = Number(url.searchParams.get('start'));
    if (Number.isFinite(previousStart)
      && Number.isFinite(candidateStart)
      && candidateStart <= previousStart) {
      url.searchParams.set('start', String(previousStart + pageSize));
    }
  }

  return url.toString();
}

export function shouldPaginateAhorramasCategory(path, hasChildren) {
  const depth = String(path ?? '').split('/').filter(Boolean).length;
  return depth === 1 || !hasChildren;
}
