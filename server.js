import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'CASH_ULTIMATE_SUPER_SECURE_2026';
const ODDS_API_KEY = process.env.ODDS_API_KEY || ''; // اتركه فارغاً الآن، املأه لاحقاً

// --- الحماية القصوى ---
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: 'تم تجاوز عدد الطلبات المسموح بها، حاول لاحقاً.' }));

// --- 1. توليد الألعاب مع أسماء وصور حقيقية ---
const generateGames = () => {
  let games = [
    { id: 'crash', name: '✈️ Crash (الطائرة)', image: 'https://img.icons8.com/color/96/airplane-take-off.png', prob: 0.4, minMult: 1.5, maxMult: 3.0, maxWin: 'x3.0' },
    { id: 'coinflip', name: '🪙 تقليب العملة', image: 'https://img.icons8.com/color/96/coins.png', prob: 0.48, minMult: 1.9, maxMult: 1.9, maxWin: 'x1.9' },
    { id: 'dice', name: '🎲 رمي النرد', image: 'https://img.icons8.com/color/96/dice.png', prob: 0.45, minMult: 1.8, maxMult: 2.0, maxWin: 'x2.0' },
    { id: 'jewel_slots', name: '💎 جوهرة الماس', image: 'https://img.icons8.com/color/96/diamond.png', prob: 0.35, minMult: 0.3, maxMult: 10.0, maxWin: 'x10.0',
      payoutTable: [
        { count: 5, red: 0.5, purple: 0.5, green: 0.5, orange: 0.3, cyan: 0.3, blue: 0.3 },
        { count: 6, red: 1.0, purple: 1.0, green: 0.9, orange: 0.9, cyan: 0.8, blue: 0.8 },
        { count: 7, red: 2.0, purple: 1.9, green: 1.8, orange: 1.7, cyan: 1.6, blue: 1.5 },
        { count: 8, red: 5.0, purple: 5.0, green: 4.0, orange: 4.0, cyan: 3.0, blue: 3.0 },
        { count: 9, red: 10.0, purple: 10.0, green: 10.0, orange: 8.0, cyan: 8.0, blue: 8.0 }
      ]
    }
  ];

  // توليد ألعاب سلوت إضافية بأسماء وصور مختلفة (مثل 1xBet)
  const slotsData = [
    { name: '🎰 سلوت الفاكهة', img: 'https://img.icons8.com/color/96/apple.png' },
    { name: '🎰 سلوت الكنز', img: 'https://img.icons8.com/color/96/treasure-chest.png' },
    { name: '🎰 سلوت النينجا', img: 'https://img.icons8.com/color/96/ninja.png' },
    { name: '🎰 سلوت الأسد', img: 'https://img.icons8.com/color/96/lion.png' },
    { name: '🎰 سلوت الذهب', img: 'https://img.icons8.com/color/96/gold-bars.png' },
    { name: '🎰 سلوت القراصنة', img: 'https://img.icons8.com/color/96/pirate.png' },
  ];
  slotsData.forEach((slot, i) => games.push({
    id: `slots_${i+5}`, name: slot.name, image: slot.img, prob: 0.25 + Math.random() * 0.15,
    minMult: 1.2 + Math.random(), maxMult: 2.0 + Math.random() * 8, maxWin: `x${(5+Math.random()*10).toFixed(1)}`
  }));
  return games;
};
const GAMES_LIST = generateGames();

// --- 2. التوثيق (Auth) ---
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'غير مصرح به، يرجى تسجيل الدخول' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(401).json({ error: 'المستخدم غير موجود' });
    if (user.isBanned) return res.status(403).json({ error: 'تم حظر حسابك من قبل الإدارة' });
    req.user = user;
    next();
  } catch { return res.status(401).json({ error: 'جلسة غير صالحة' }); }
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'هذا الإجراء يتطلب صلاحيات المدير' });
  next();
};

// --- 3. مسارات الدخول والتسجيل ---
app.post('/api/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || password.length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  const hash = await bcrypt.hash(password, 10);
  try {
    await prisma.user.create({ data: { email, passwordHash: hash, name, role: 'user' } });
    res.json({ ok: true, message: 'تم إنشاء الحساب بنجاح' });
  } catch { res.status(400).json({ error: 'البريد الإلكتروني مستخدم بالفعل' }); }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
  }
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, balance: user.balance, role: user.role } });
});

app.get('/api/me', authenticate, (req, res) => res.json(req.user));

// --- 4. الألعاب (Games) ---
app.get('/api/games/list', authenticate, (req, res) => res.json(GAMES_LIST));
app.get('/api/games/details/:id', authenticate, (req, res) => {
  const game = GAMES_LIST.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'اللعبة غير موجودة' });
  res.json(game);
});

app.post('/api/games/play', authenticate, async (req, res) => {
  const { gameId, stake } = req.body;
  const game = GAMES_LIST.find(g => g.id === gameId);
  if (!game || stake > req.user.balance) return res.status(400).json({ error: 'بيانات غير صالحة' });
  
  const win = Math.random() < game.prob;
  let payout = 0, multiplier = 0;
  if (win) {
    multiplier = parseFloat((game.minMult + Math.random() * (game.maxMult - game.minMult)).toFixed(2));
    payout = parseFloat((stake * multiplier).toFixed(2));
  }
  const netResult = win ? payout - stake : -stake;
  const newBalance = parseFloat((req.user.balance + netResult).toFixed(2));

  const result = await prisma.$transaction([
    prisma.user.update({ where: { id: req.user.id }, data: { balance: newBalance } }),
    prisma.transaction.create({ data: { userId: req.user.id, type: win ? 'payout' : 'bet', amount: netResult, description: `${game.name}: ${win ? 'فوز' : 'خسارة'}` }})
  ]);
  res.json({ ok: true, win, multiplier, payout, newBalance: result[0].balance });
});

// --- 5. الرياضة (Sportsbook) ---
app.get('/api/sports', authenticate, async (req, res) => {
  if (!ODDS_API_KEY) return res.json({ message: 'مفتاح The Odds API مفقود. يرجى إدخاله في الإعدادات.' });
  try {
    const response = await fetch(`https://api.the-odds-api.com/v4/sports/upcoming/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h`);
    const data = await response.json();
    const games = data.slice(0, 8).map(g => ({
      id: g.id, league: g.sport_title, home: g.home_team, away: g.away_team,
      homeImg: `https://img.icons8.com/color/48/football2.png`, // صورة افتراضية
      awayImg: `https://img.icons8.com/color/48/football2.png`,
      time: new Date(g.commence_time).toLocaleString('ar-EG'),
      odds: g.bookmakers[0]?.markets[0]?.outcomes.map(o => o.price) || [1.85, 3.10, 2.10]
    }));
    res.json(games);
  } catch { res.json([]); }
});

// --- 6. الإيداع والسحب (بانتظار موافقة الأدمن) ---
app.post('/api/deposits/request', authenticate, async (req, res) => {
  const { amount, method } = req.body;
  await prisma.deposit.create({ data: { userId: req.user.id, amount: Number(amount), method, status: 'pending' } });
  res.json({ ok: true, message: 'تم رفع طلب الإيداع للمراجعة' });
});

app.post('/api/withdrawals/request', authenticate, async (req, res) => {
  const { amount, destination } = req.body;
  if (amount > req.user.balance) return res.status(400).json({ error: 'الرصيد غير كافٍ' });
  await prisma.user.update({ where: { id: req.user.id }, data: { balance: { decrement: Number(amount) } } });
  await prisma.withdrawal.create({ data: { userId: req.user.id, amount: Number(amount), destination, status: 'pending' } });
  res.json({ ok: true, message: 'تم خصم الرصيد ورفع الطلب للمراجعة' });
});

// --- 7. مسارات المدير (Admin Dashboard) ---
app.get('/api/admin/dashboard', authenticate, requireAdmin, async (req, res) => {
  const users = await prisma.user.findMany();
  const pendingDeposits = await prisma.deposit.findMany({ where: { status: 'pending' }, include: { user: true } });
  const pendingWithdrawals = await prisma.withdrawal.findMany({ where: { status: 'pending' }, include: { user: true } });
  res.json({ totalUsers: users.length, pendingDeposits, pendingWithdrawals, balance: users.reduce((a,b) => a+b.balance, 0) });
});

app.post('/api/admin/deposits/:id/approve', authenticate, requireAdmin, async (req, res) => {
  const dep = await prisma.deposit.findUnique({ where: { id: Number(req.params.id) } });
  if (!dep || dep.status !== 'pending') return res.status(400).json({ error: 'طلب غير متاح' });
  await prisma.$transaction([
    prisma.deposit.update({ where: { id: dep.id }, data: { status: 'approved' } }),
    prisma.user.update({ where: { id: dep.userId }, data: { balance: { increment: dep.amount } } })
  ]);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/ban', authenticate, requireAdmin, async (req, res) => {
  await prisma.user.update({ where: { id: Number(req.params.id) }, data: { isBanned: true } });
  res.json({ ok: true });
});

// --- 8. ملفات الواجهة الأمامية ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 CASH v2.0 Ultimate Platform Running on port ${PORT}`);
  console.log(`🔗 Local: http://localhost:${PORT}`);
  console.log(`⚠️  Admin Account: admin@cash.com / Admin123!`);
  console.log(`⚠️  Demo User: user@demo.com / User123!`);
});
