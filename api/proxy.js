export const config = {
  runtime: 'edge', // 使用 Edge 节点
};

// 预设跨域允许的请求头（CORS）
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export default async function handler(request) {
  // 1. 处理浏览器的预检请求 (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing target URL parameter', { status: 400 });
  }

  // 2. 基础安全校验：确保只代理 http 和 https 协议
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    return new Response('Invalid URL scheme', { status: 400 });
  }

  try {
    // 3. 过滤和重写 Headers
    const proxyHeaders = new Headers(request.headers);
    // 关键：必须删除源请求的 host，否则目标服务器会因为 host 域名不匹配而拒绝请求
    proxyHeaders.delete('host'); 
    // 可选：删除 referer 防止目标服务器防盗链拦截
    proxyHeaders.delete('referer');

    // 4. 构建 Fetch 参数，支持所有请求方法和透传 Body
    const fetchOptions = {
      method: request.method,
      headers: proxyHeaders,
      redirect: 'follow',
    };

    // 如果是 POST/PUT 等包含 body 的请求，直接透传数据流
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      fetchOptions.body = request.body;
      // Edge 运行时透传 Stream Body 时的必须参数
      fetchOptions.duplex = 'half'; 
    }

    // 发起请求
    const response = await fetch(targetUrl, fetchOptions);

    // 5. 合并响应头，并注入跨域头
    const responseHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      responseHeaders.set(key, value);
    }
    // 让 Vercel 自动处理编码，防止乱码或解码错误
    responseHeaders.delete('content-encoding');

    // 透明返回所有内容
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
