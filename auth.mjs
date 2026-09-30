import { randomBytes, createHash, createHmac, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AppError, string } from './opd.mjs';
const derive = promisify(scrypt);
export function checkProductionConfig() {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    if (!process.env.DATABASE_URL || (process.env.SESSION_SECRET?.length || 0)<32 || process.env.COOKIE_SECURE !== '1') throw new Error('Production requires DATABASE_URL, SESSION_SECRET (32+ characters), COOKIE_SECURE=1');
  }
}
export const hashToken = token => process.env.SESSION_SECRET ? createHmac('sha256',process.env.SESSION_SECRET).update(token).digest('hex') : createHash('sha256').update(token).digest('hex');
export const cookieToken = req => req.headers.cookie?.match(/(?:^|;\s*)yogi_session=([a-f0-9]{64})(?:;|$)/)?.[1];
export const sessionCookie = (token, age = 28800) => `yogi_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`;
export async function seedAdmin(db,username,password) {
  if (!username || typeof password !== 'string' || password.length<12 || password.length>256) throw new AppError('Provide an admin username and a password of 12 to 256 characters');
  return db.transaction(async tx => {
    await tx.exec('LOCK TABLE users IN EXCLUSIVE MODE');
    if ((await tx.query('SELECT id FROM users LIMIT 1')).rows.length) return false;
    const salt = randomBytes(16).toString('hex'), hash = (await derive(password,salt,64)).toString('hex');
    await tx.query('INSERT INTO users(username,salt,hash) VALUES($1,$2,$3)',[string(username,80),salt,hash]);
    return true;
  });
}
export async function authenticate(db,req) {
  const token = cookieToken(req);
  if (!token) throw new AppError('Please sign in',401);
  const user = (await db.query('SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>$2',[hashToken(token),Date.now()])).rows[0];
  if (!user) throw new AppError('Please sign in',401);
  return user.user_id;
}
export async function login(db,data) {
  const username = string(data.username,80), password = typeof data.password === 'string' ? data.password : '';
  if (password.length>256) throw new AppError('Invalid username or password',401);
  const key = hashToken(`login:${username}`), now = Date.now();
  const allowed = await db.transaction(async tx => {
    await tx.query('DELETE FROM login_attempts WHERE until_at<$1',[now]);
    await tx.query('INSERT INTO login_attempts(key,count,until_at) VALUES($1,0,$2) ON CONFLICT(key) DO NOTHING',[key,now+15*60*1000]);
    const attempt = (await tx.query('SELECT count FROM login_attempts WHERE key=$1 FOR UPDATE',[key])).rows[0];
    if (attempt.count>=5) return false;
    await tx.query('UPDATE login_attempts SET count=count+1 WHERE key=$1',[key]); return true;
  });
  if (!allowed) throw new AppError('Too many attempts. Try again later',429);
  const user = (await db.query('SELECT * FROM users WHERE username=$1',[username])).rows[0];
  const provided = await derive(password,user?.salt || '00000000000000000000000000000000',64);
  if (!user || !timingSafeEqual(provided,Buffer.from(user.hash,'hex'))) throw new AppError('Invalid username or password',401);
  const token = randomBytes(32).toString('hex');
  await db.transaction(async tx => {
    await tx.query('DELETE FROM login_attempts WHERE key=$1',[key]);
    await tx.query('DELETE FROM sessions WHERE expires_at<$1',[now]);
    await tx.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[hashToken(token),user.id,now+8*60*60*1000]);
  });
  return {token,username:user.username};
}
