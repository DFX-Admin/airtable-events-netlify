// netlify/functions/airtable-events.js
const handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Vary': 'Origin',
      }
    };
  }

  // Only GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'Method Not Allowed'
    };
  }

  const token  = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table  = process.env.AIRTABLE_TABLE || 'Events';
  const view   = process.env.AIRTABLE_VIEW  || 'LiveUpcoming';
  if (!token || !baseId) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'Missing env vars AIRTABLE_TOKEN or AIRTABLE_BASE_ID'
    };
  }

  // Build Airtable request
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
  if (view) url.searchParams.set('view', view);
  url.searchParams.set('pageSize', '50');

  // NOTE: include BannerMobile; keep other fields
  ['Name','Banner','BannerMobile','EventDate','Live','Link','CTA']
    .forEach(f => url.searchParams.append('fields[]', f));

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: await res.text()
      };
    }

    const data = await res.json();
    const now = Date.now();

    const items = (data.records || [])
      .map(r => {
        const f = r.fields || {};

        // Desktop banner
        const attBanner = Array.isArray(f.Banner) && f.Banner[0] ? f.Banner[0] : null;
        const bannerUrl = attBanner
          ? (attBanner.thumbnails?.large?.url || attBanner.url)
          : '';

        // Mobile banner
        const attBannerMobile = Array.isArray(f.BannerMobile) && f.BannerMobile[0] ? f.BannerMobile[0] : null;
        const bannerMobileUrl = attBannerMobile
          ? (attBannerMobile.thumbnails?.large?.url || attBannerMobile.url)
          : '';

        const dateStr = f.EventDate || '';
        const ts = dateStr ? new Date(dateStr).getTime() : NaN;

        return {
          id: r.id,
          name: f.Name || '',
          banner: bannerUrl,
          bannerMobile: bannerMobileUrl,
          eventDate: dateStr,
          live: !!f.Live,
          link: f.Link || '',
          cta: f.CTA || ''
        };
      })
      // ✅ allow records that have *either* banner or bannerMobile
      .filter(it =>
        it.live &&
        (it.banner || it.bannerMobile) &&
        it.eventDate &&
        !Number.isNaN(new Date(it.eventDate).getTime()) &&
        new Date(it.eventDate).getTime() >= now
      )
      .sort((a,b) => new Date(a.eventDate) - new Date(b.eventDate));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Vary': 'Origin',
      },
      body: JSON.stringify({ items })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: e?.message || 'Error'
    };
  }
};

exports.handler = handler;
