/**
 * Vercel Serverless Function: /api/upload
 * 作为图床上传的后端代理，将 API Token 保存在 Vercel 环境变量 IMAGE_API_TOKEN 中，
 * 避免在前端暴露密钥。
 */

export const config = {
  api: {
    bodyParser: false, // 禁用默认 body 解析，直接转发原始 multipart 流
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const token = process.env.IMAGE_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Server misconfigured: IMAGE_API_TOKEN is not set' });
  }

  // 将请求体原样读取为 Buffer，保留 multipart/form-data 格式
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  let response;
  try {
    response = await fetch('https://s.ee/api/v1/file/upload', {
      method: 'POST',
      headers: {
        Authorization: token,
        Accept: 'application/json',
        'Content-Type': req.headers['content-type'], // 保留原始 boundary
      },
      body,
    });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach image host', detail: err.message });
  }

  const data = await response.json();
  return res.status(response.status).json(data);
}
