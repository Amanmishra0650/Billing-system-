export async function printPaper(paper, print = () => window.print(), {filename} = {}) {
  try {
    await Promise.all([...paper.querySelectorAll('img')].map(image => image.decode()));
  } catch {
    throw new Error('The clinic logo could not load. Refresh the page and try printing again.');
  }
  await paper.ownerDocument.fonts?.ready;
  const doc=paper.ownerDocument, previousTitle=doc.title;
  const title=typeof filename==='string' ? filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/g,'') : '';
  if(title) doc.title=title;
  try { print(); }
  finally { if(title) doc.title=previousTitle; }
}
