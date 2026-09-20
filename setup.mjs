import { scryptSync, randomBytes } from 'node:crypto';
import { db } from './db.mjs';
const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 12) {
 console.error('Usage: npm run setup -- admin "a-unique-password-at-least-12-characters"');
 process.exit(1);
}
if (db.prepare('SELECT id FROM users LIMIT 1').get()) {
 console.error('A staff account already exists. Setup is disabled.'); process.exit(1);
}
const salt = randomBytes(16).toString('hex');
const hash = scryptSync(password, salt, 64).toString('hex');
db.prepare('INSERT INTO users (username,salt,hash) VALUES (?,?,?)').run(username,salt,hash);
console.log('Staff account created. Start with npm start.');
