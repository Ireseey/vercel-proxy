export const config = {
  runtime: 'edge', 
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing target URL parameter', { status: 400 });
  }

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    return new Response('Invalid URL scheme', { status: 400 });
  }

  try {
    // 【核心优化】：不要拷贝 request.headers，防止 Vercel 特征暴露
    // 只需要把 CF Worker 传过来的 User-Agent 透传给机场即可
    const fetchHeaders = new Headers();
    const userAgent = request.headers.get('user-agent');
    if (userAgent) {
      fetchHeaders.set('User-Agent', userAgent);
    }

    const fetchOptions = {
      method: request.method,
      headers: fetchHeaders, // 使用干净的 Headers
      redirect: 'follow',
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      fetchOptions.body = request.body;
      fetchOptions.duplex = 'half'; 
    }

    const response = await fetch(targetUrl, fetchOptions);

    const responseHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      responseHeaders.set(key, value);
    }
    responseHeaders.delete('content-encoding'); 
    
    // 强制声明附件类型，防止部分机场不返回 content-type
    if (!responseHeaders.has('content-type')) {
        responseHeaders.set('content-type', 'text/plain; charset=utf-8');
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Vercel Proxy Error', details: error.message }), { 
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
