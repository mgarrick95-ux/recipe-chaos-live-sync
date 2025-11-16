
export function cosineSim(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]*b[i];
    na += a[i]*a[i];
    nb += b[i]*b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na)*Math.sqrt(nb));
}

export function textForEmbedding(r: { title:string; ingredients:string[]; steps:string[]; tags?:string[] }) {
  return [r.title, (r.tags||[]).join(', '), r.ingredients.join('\n'), r.steps.join('\n')].join('\n\n');
}
