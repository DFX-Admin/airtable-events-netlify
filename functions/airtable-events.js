const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    }};
  }

  const token  = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table  = process.env.AIRTABLE_TABLE || 'Events';
  const view   = process.env.AIRTABLE_VIEW  || 'LiveUpcoming';
  if (!token || !baseId) return { statusCode: 500, body: 'Missing env vars AIRTABLE_TOKEN or AIRTABLE_BASE_ID' };

  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
  if (view) url.searchParams.set('view', view);
  url.searchParams.set('pageSize', '50');
  ['Name','Banner','EventDate','Live','Link'].forEach(f => url.searchParams.append('fields[]', f));

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { statusCode: res.status, body: await res.text() };
    const data = await res.json();

    const now = Date.now();
    const items = (data.records || []).map(r => {
      const f = r.fields || {};
      const att = Array.isArray(f.Banner) && f.Banner[0] ? f.Banner[0] : null;
      return {
        id: r.id,
        name: f.Name || '',
        banner: att ? (att.thumbnails?.large?.url || att.url) : '',
        eventDate: f.EventDate || '',
        live: !!f.Live,
        link: f.Link || ''
      };
    })
    .filter(it => it.live && it.banner && it.eventDate && new Date(it.eventDate).getTime() >= now)
    .sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate));

    return { statusCode: 200, headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    }, body: JSON.stringify({ items }) };
  } catch (e) {
    return { statusCode: 500, body: e.message || 'Error' };
  }
};
exports.handler = handler;
