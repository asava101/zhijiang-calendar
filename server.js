const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit'); // 📦 新增：防爆破插件
const { v4: uuidv4 } = require('uuid'); // 📦 新增：生成随机Token

const app = express();
const PORT = 3000;

// ================= 安全配置区域 =================
// 🔴 请务必修改成一个复杂的密码！不要用默认的！
const ADMIN_PASSWORD = "admin"; 

// 内存中存储合法的 token (重启服务器后会失效，需要重新登录，更安全)
let activeTokens = new Set();
// ===============================================

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');

// 初始化数据文件
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 4));
}

// 🛡️ 安全策略：限制登录接口的访问频率
// 同一个 IP，15 分钟内只能尝试 5 次
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 5, // 最大尝试次数
    message: { success: false, message: "尝试次数过多，请 15 分钟后再试" },
    standardHeaders: true, 
    legacyHeaders: false,
});

// API: 获取数据 (公开)
app.get('/api/data', (req, res) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: '读取失败' });
        try {
            res.json(JSON.parse(data || '[]'));
        } catch(e) {
            res.json([]);
        }
    });
});

// API: 登录 (应用了防爆破限制)
app.post('/api/login', loginLimiter, (req, res) => {
    const { password } = req.body;
    
    // 🛡️ 人为制造 1 秒延迟，防止通过响应时间猜测密码，同时降低爆破速度
    setTimeout(() => {
        if (password === ADMIN_PASSWORD) {
            // 生成一个随机的 Token
            const newToken = uuidv4();
            activeTokens.add(newToken);
            res.json({ success: true, token: newToken });
            console.log(`[安全日志] 管理员登录成功: ${new Date().toLocaleString()}`);
        } else {
            res.status(401).json({ success: false, message: '密码错误' });
            console.warn(`[安全警告] 密码错误尝试! IP: ${req.ip}`);
        }
    }, 1000); 
});

// API: 保存数据 (验证动态 Token)
app.post('/api/save', (req, res) => {
    const { token, data } = req.body;
    
    // 🛡️ 验证 Token 是否在白名单里
    if (!token || !activeTokens.has(token)) {
        return res.status(403).json({ success: false, message: '登录已过期或未授权，请重新登录' });
    }

    fs.writeFile(DATA_FILE, JSON.stringify(data, null, 4), (err) => {
        if (err) return res.status(500).json({ success: false, message: '写入失败' });
        res.json({ success: true, message: '保存成功' });
    });
});

app.listen(PORT, () => {
    console.log(`
    🔒 安全模式服务器已启动
    --------------------------
    端口: ${PORT}
    防爆破: 已开启 (5次/15分钟)
    --------------------------
    `);
});