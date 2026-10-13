// Minimal SMTP sink for local testing: accepts every message and appends it
// to $STACK_DIR/mail.jsonl so tests can read invite and reset links.
import net from 'node:net';
import fs from 'node:fs';

const out = `${process.env.STACK_DIR}/mail.jsonl`;
net.createServer((sock) => {
  let data = false, buf = '', msg = { to: [], body: '' };
  sock.write('220 local ESMTP\r\n');
  sock.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (data) {
        if (line === '.') {
          data = false;
          fs.appendFileSync(out, JSON.stringify({ ...msg, at: new Date().toISOString() }) + '\n');
          msg = { to: [], body: '' };
          sock.write('250 OK\r\n');
        } else msg.body += line.replace(/^\./, '') + '\n';
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-local\r\n250 AUTH PLAIN LOGIN\r\n');
      else if (cmd === 'AUTH') sock.write('235 OK\r\n');
      else if (cmd === 'RCPT') { msg.to.push(line.replace(/.*<(.*)>.*/, '$1')); sock.write('250 OK\r\n'); }
      else if (cmd === 'DATA') { data = true; sock.write('354 go\r\n'); }
      else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      else sock.write('250 OK\r\n');
    }
  });
}).listen(2500, '127.0.0.1');
