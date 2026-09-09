const crypto = require('crypto');
const readline = require('readline');

const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
terminal.question('Admin password (input is hidden by your terminal where supported): ', (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  console.log(`ADMIN_PASSWORD_SALT=${salt}`);
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  terminal.close();
});
