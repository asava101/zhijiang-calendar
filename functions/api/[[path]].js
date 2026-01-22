// functions/api/[[path]].js

const ADMIN_PASSWORD = "z-{ddN"; 

// 1. UUID 生成
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.替换(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 2. 响应工具
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

// 🟢 核心函数：使用 context 接收所有参数
export async function onRequest(context) {
  const request = context.request;
  
  // 🔍 终极搜查：寻找 DB 变量
  // 1. 尝试从标准 context.env 里找
  let db = context.env ? context.env.DB : null;
  
  // 2. 如果没找到，尝试从解构的参数里找 (兼容某些旧运行时)
  if (!db && context.DB) db = context.DB;

  // 3. 🔴 重点：尝试从全局变量里找 (Global Scope)
  // EdgeOne 有时会把绑定直接扔在全局作用域里
  if (!db && typeof DB !== 'undefined') {
      db = DB;
  }
  
  // 4. 最后的挣扎：尝试 globalThis
  if (!db && typeof globalThis !== 'undefined' && globalThis.DB) {
      db = globalThis.DB;
  }

  // 跨域处理
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  try {
    const url = new URL(request.url);
    // 提取路径：兼容 /api/data 和 /data 两种情况
    const pathSegments = url.pathname.split('/').filter(p => p);
    const lastPath = pathSegments[pathSegments.length - 1]; // 获取最后一个片段，如 data, login

    // 🛑 检查是否找到 DB
    if (!db) {
      return jsonResponse({ 
        error: "Critical Error", 
        message: "已尝试所有途径，均未找到变量 DB。",
        tips: "请确保 EdgeOne 控制台 -> KV 命名空间绑定 -> 变量名称必须是 'DB' (全大写)。",
        debug_info: {
            has_env: !!context.env,
            env_keys: context.env ? Object.keys(context.env) : [],
            is_global_db_defined: typeof DB !== 'undefined'
        }
      }, 500);
    }

    // [API] 获取数据
    if (lastPath === 'data' && request.method === 'GET') {
      let data = [];
      try {
          data = await db.get('calendar_data', { type: "json" });
      } catch (e) {
          const text = await db.get('calendar_data');
          if (text) data = JSON.parse(text);
      }
      return jsonResponse(data || []);
    }

    // [API] 登录
    if (lastPath === 'login' && request.method === 'POST') {
      const body = await request.json();
      if (body.password === ADMIN_PASSWORD) {
        const token = generateUUID();
        await db.put(`token:${token}`, "valid");
        return jsonResponse({ success: true, token: token });
      } else {
        return jsonResponse({ success: false, message: '密码错误' }, 401);
      }
    }

    // [API] 保存
    if (lastPath === 'save' && request.method === 'POST') {
      const body = await request.json();
      const { token, data } = body;

      if (!token) return jsonResponse({ success: false, message: '未登录' }, 403);

      const isValid = await db.get(`token:${token}`);
      if (!isValid) {
        return jsonResponse({ success: false, message: '登录过期' }, 403);
      }

      await db.put('calendar_data', JSON.stringify(data));
      return jsonResponse({ success: true, message: '保存成功' });
    }

    return jsonResponse({ error: 'Not Found', path: lastPath }, 404);

  } catch (err) {
    return jsonResponse({ error: "Runtime Error", details: err.message }, 500);
  }
}

