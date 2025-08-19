// Netlify Functions run on Node 18+ with global fetch available.
export async function handler(event) {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
      body: '',
    };
  }

  const token = process.env.AIRTABLE_TOKEN;          // PAT with data.records:read
  const baseId = process.env.AIRTABLE_BASE_ID;       // e.g. appPhG8xDnHypDv8Y
  const table   = process.env.AIRTABLE_TABLE || 'Events';
  const view    = process.env.AIRTABLE_VIEW  || 'LiveUpcoming';

  if (!token || !baseId) {
    return { statusCode: 500, body: 'Missing env vars' };
  }

  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
  if (view) url.searchParams.set('view', view);
  url.searchParams.set('pageSize', '50');
  // Return only needed fields to shrink payload
  ['Name','Banner','EventDate','Live','Link'].forEach(f => url.searchParams.append('fields[]', f));

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: res.status, body: txt };
    }
    const data = await res.json();

    // Map into a clean shape for the frontend
    const now = Date.now();
    const items = (data.records || [])
      .map(r => {
        const f = r.fields || {};
        const att = Array.isArray(f.Banner) && f.Banner[0] ? f.Banner[0] : null;
        return {
          id: r.id,
          name: f.Name || '',
          banner: att ? (att.thumbnails?.large?.url || att.url) : '',
          // Airtable sends ISO string for date fields; keep as-is
          eventDate: f.EventDate || '',
          live: !!f.Live,
          link: f.Link || ''
        };
      })
      // Fallback filter if you didn’t create the LiveUpcoming view
      .filter(it => it.live && it.banner && it.eventDate && new Date(it.eventDate).getTime() >= now)
      .sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ items }),
    };
  } catch (e) {
    return { statusCode: 500, body: e.message || 'Error' };
  }
}
